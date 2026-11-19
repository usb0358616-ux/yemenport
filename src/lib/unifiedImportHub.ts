import {
  Traveler,
  MofaVisaRequest,
  MofaBeneficiary,
  PassportSeizure,
  ForeignerResident,
  UndocumentedMigrant,
  RefugeeRecord,
  InternalMovementPermit,
  Report
} from './types';
import {
  generateId,
  normalizeArabic,
  cleanArabicText,
  inferGovernorateFromCenter,
  smartBatchUpsertTravelers,
  smartBatchUpsertTravelersAsync,
  addMofaRequest,
  getSeizures,
  saveSeizures,
  getForeigners,
  saveForeigners,
  getMigrants,
  saveMigrants,
  getRefugees,
  saveRefugees,
  getMovementPermits,
  saveMovementPermits,
  getReports,
  saveReports,
  addAuditLog,
  getCurrentUser
} from './storage';
import { kvGet } from './sovereignStorageBackend';
import { formatParsedDate } from './localDocumentParser';

export type UnifiedImportCategory =
  | 'traveler'
  | 'visa'
  | 'report'
  | 'seizure'
  | 'foreigner'
  | 'migrant'
  | 'refugee'
  | 'permit';

export const CATEGORY_LABELS: Record<UnifiedImportCategory, string> = {
  traveler: 'المسافرين وحركة المنافذ',
  visa: 'مذكرات وتأشيرات الخارجية',
  report: 'بلاغات الضبط والتحري',
  seizure: 'المضبوطات والجوازات المحتجزة',
  foreigner: 'الوافدون الأجانب والإقامات',
  migrant: 'المهاجرون غير الشرعيين',
  refugee: 'شؤون اللاجئين وتصاريح (UNHCR)',
  permit: 'تصاريح التنقل الداخلي'
};

export interface OpenUnifiedImportOptions {
  category?: UnifiedImportCategory;
  files?: File[];
  sourceTitle?: string;
  autoStartAnalysis?: boolean;
}

export interface WatchlistHit {
  travelerName: string;
  idNumber: string;
  matchedReportTitle: string;
}

export interface DistributeResult {
  added: number;
  updated: number;
  watchlistHits: WatchlistHit[];
  moduleLabel: string;
  linkedAgenciesCount?: number;
  createdAgencies?: string[];
}

export const UNIFIED_IMPORT_EVENT = 'open-unified-import';
export const SOVEREIGN_DATA_UPDATED_EVENT = 'sovereign-data-updated';
export type OpenUnifiedImportPayload = OpenUnifiedImportOptions;

/**
 * Global trigger to open the unified multi-file import center from anywhere in the app.
 */
export function openUnifiedImport(options: OpenUnifiedImportOptions = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNIFIED_IMPORT_EVENT, { detail: options }));
}

/**
 * Notify all mounted pages/components to refresh state from localStorage.
 */
export function notifySovereignDataUpdated(module?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOVEREIGN_DATA_UPDATED_EVENT, { detail: { module } }));
  window.dispatchEvent(new CustomEvent('data-imported'));
}

export function mapDepartmentToUnifiedCategory(dep?: string): UnifiedImportCategory {
  switch (dep) {
    case 'foreigners':
    case 'foreigner':
    case 'الوافدون الأجانب':
      return 'foreigner';
    case 'refugees':
    case 'refugee':
    case 'شؤون اللاجئين':
    case 'اللاجئون':
      return 'refugee';
    case 'migrants':
    case 'migrant':
    case 'المهاجرين غير النظاميين':
    case 'المهاجرون غير الشرعيين':
      return 'migrant';
    case 'seizures':
    case 'seizure':
    case 'المضبوطات والجوازات':
      return 'seizure';
    case 'mofa_visas':
    case 'visa':
    case 'مذكرات الخارجية':
    case 'مذكرات وتأشيرات الخارجية':
      return 'visa';
    case 'permits':
    case 'permit':
    case 'تصاريح التنقل':
      return 'permit';
    case 'reports':
    case 'report':
    case 'البلاغات':
    case 'بلاغات الضبط':
      return 'report';
    default:
      return 'traveler';
  }
}

export function extractFullNameFromRecord(rec: any): string {
  if (rec.fullName && String(rec.fullName).trim()) return String(rec.fullName).trim();
  const parts = [rec.firstName, rec.secondName, rec.thirdName, rec.fourthName, rec.lastName]
    .map(p => (p ? String(p).trim() : ''))
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (rec.passportName && String(rec.passportName).trim()) return String(rec.passportName).trim();
  return 'غير محدد';
}

function splitNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'مسافر',
    secondName: parts[1] || '',
    thirdName: parts[2] || '',
    fourthName: parts.length > 4 ? parts[3] : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

/**
 * Distribute extracted records from any analyzed file into the appropriate sovereign module
 * using SmartMerge (anti-duplicate) rules and watchlist cross-matching.
 */
export function distributeRecordsToModule(
  category: UnifiedImportCategory,
  records: any[],
  sourceName: string,
  extra?: {
    mofaRequest?: MofaVisaRequest;
    seizureMeta?: {
      recordNumber?: string;
      seizurePort?: string;
      seizureDate?: string;
      driverName?: string;
      carPlate?: string;
      direction?: string;
      reason?: string;
    };
  }
): DistributeResult {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const user = getCurrentUser();
  const officerName = user?.name || kvGet('config_default_officer') || 'ضابط المناوبة بالمنفذ';
  const defaultPort = kvGet('config_centerName') || 'مطار صنعاء الدولي';

  let added = 0;
  let updated = 0;
  const watchlistHits: WatchlistHit[] = [];

  // Cross-check watchlist against active reports (pre-indexed ONCE for O(N) speed on 3000+ rows)
  const indexedReports = getReports().map(r => {
    const norm = normalizeArabic(`${r.title || ''} ${r.description || ''}`);
    return {
      title: r.title,
      normText: norm,
      normLower: norm.toLowerCase()
    };
  });

  const checkRowWatchlist = (name: string, idNum: string) => {
    if (indexedReports.length === 0) return;
    const cleanId = idNum ? normalizeArabic(idNum).toLowerCase() : '';
    const cleanName = name ? normalizeArabic(name) : '';
    if (cleanId.length < 4 && cleanName.length < 6) return;

    const hit = indexedReports.find(r => {
      if (cleanId.length >= 4 && r.normLower.includes(cleanId)) return true;
      if (cleanName.length >= 6 && r.normText.includes(cleanName)) return true;
      return false;
    });
    if (hit) {
      watchlistHits.push({
        travelerName: name || 'غير محدد',
        idNumber: idNum || '-',
        matchedReportTitle: hit.title
      });
    }
  };

  if (category === 'visa') {
    if (extra?.mofaRequest) {
      const mofaReq: MofaVisaRequest = {
        ...extra.mofaRequest,
        id: extra.mofaRequest.id || generateId(),
        sourceFileName: extra.mofaRequest.sourceFileName || sourceName,
        updatedAt: now
      };
      addMofaRequest(mofaReq);
      added = mofaReq.beneficiaries?.length || 1;
      mofaReq.beneficiaries?.forEach(b => checkRowWatchlist(b.fullName, b.passportNumber));
      addAuditLog('استيراد كشف', 'تصاريح التنقل', `إيداع مذكرة خارجية (${mofaReq.memoNumber}) من ${sourceName}`, mofaReq.id);
    } else {
      const beneficiaries: MofaBeneficiary[] = records.map((r, idx) => {
        const name = extractFullNameFromRecord(r);
        const passNo = r.idNumber || r.passportNumber || `PASS-${Date.now().toString().slice(-4)}-${idx + 1}`;
        checkRowWatchlist(name, passNo);
        return {
          id: `ben-${generateId()}`,
          fullName: name,
          passportNumber: passNo,
          passportType: 'عادي',
          nationality: r.nationality || r.country || 'أجنبي',
          profession: r.profession || r.visitReason || 'خبير / مستفيد',
          missionDuration: r.missionDuration || '03 أشهر',
          workLocation: r.workLocation || r.destination || 'الجمهورية اليمنية'
        };
      });

      const firstRec = records[0] || {};
      const mofaReq: MofaVisaRequest = {
        id: generateId(),
        memoNumber: firstRec.requestNumber || `مذكرة-${Date.now().toString().slice(-5)}`,
        memoDate: firstRec.receiveDate || today,
        organization: firstRec.agency || firstRec.organization || 'جهة معتمدة عبر الاستيراد الموحد',
        organizationType: 'منظمة دولية (INGO)',
        requestType: firstRec.visaType || 'طلب تأشيرة دخول',
        beneficiaries,
        mofaDirective: 'للاطلاع وعمل اللازم وفق النظام والقانون والترتيبات والموافقة الأمنية',
        approvalStatus: 'معتمد رسمياً',
        securityClearanceStatus: 'معتمد',
        sourceFileName: sourceName,
        attachedDocuments: [sourceName],
        additionalInfo: `تم الاستيراد عبر المركز الموحد (${beneficiaries.length} مستفيد) من ${sourceName}`,
        createdAt: now,
        updatedAt: now
      };
      addMofaRequest(mofaReq);
      added = beneficiaries.length;
      addAuditLog('استيراد كشف', 'تصاريح التنقل', `استيراد مذكرة وتأشيرات (${added} مستفيد) من ${sourceName}`, mofaReq.id);
    }

    notifySovereignDataUpdated('visa');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.visa };
  }

  if (category === 'seizure') {
    const existingSeizures = getSeizures();
    records.forEach((rec, i) => {
      const passportNo = String(rec.idNumber || rec.passportNumber || '').trim();
      const travelerName = extractFullNameFromRecord(rec);
      checkRowWatchlist(travelerName, passportNo);

      const existing = passportNo
        ? existingSeizures.find(s => s.passportNumber.trim().toLowerCase() === passportNo.toLowerCase())
        : undefined;

      if (existing) {
        existing.referralNotes = `${existing.referralNotes || ''}\n[تحديث الاستيراد الموحد - ${today}]: من ${sourceName}`;
        existing.updatedAt = now;
        updated++;
      } else {
        existingSeizures.unshift({
          id: generateId(),
          recordNumber: extra?.seizureMeta?.recordNumber || `محضر-${today.slice(0, 4)}-${String(existingSeizures.length + i + 1).padStart(4, '0')}`,
          travelerName,
          passportNumber: passportNo || `SEIZ-${Date.now().toString().slice(-5)}`,
          nationality: rec.country || rec.nationality || 'اليمن',
          seizurePort: rec.center || extra?.seizureMeta?.seizurePort || 'نقطة يسلح الأمنية',
          seizureDate: rec.receiveDate || extra?.seizureMeta?.seizureDate || today,
          officerInCharge: rec.investigatingOfficer || officerName,
          reason: rec.vettingResult || extra?.seizureMeta?.reason || 'محضر ضبط جوازات سفر مخالفة',
          status: 'جديد',
          referredTo: 'فرع استخبارات الشرطة',
          referralDate: today,
          referralNotes: `تم الاستيراد والتحريز من ${sourceName}${rec.additionalInfo ? ' | ' + rec.additionalInfo : ''}`,
          createdAt: now,
          updatedAt: now
        });
        added++;
      }
    });

    saveSeizures(existingSeizures);
    addAuditLog('استيراد كشف', 'المضبوطات والجوازات', `استيراد وإيداع ${added} محضر ضبط جديد و ${updated} تحديث من ${sourceName}`);
    notifySovereignDataUpdated('seizure');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.seizure };
  }

  if (category === 'foreigner') {
    const existingForeigners = getForeigners();
    records.forEach((rec, i) => {
      const passportNo = String(rec.idNumber || rec.passportNumber || '').trim();
      const fullName = extractFullNameFromRecord(rec);
      checkRowWatchlist(fullName, passportNo);

      const existing = passportNo
        ? existingForeigners.find(f => f.passportNumber.trim().toUpperCase() === passportNo.toUpperCase())
        : undefined;

      if (existing) {
        if (!existing.employer && (rec.agency || rec.organization)) {
          existing.employer = rec.agency || rec.organization;
        }
        if (!existing.profession && (rec.profession || rec.visitReason)) {
          existing.profession = rec.profession || rec.visitReason;
        }
        existing.notes = `${existing.notes || ''}\n[تحديث الاستيراد الموحد - ${today}]: تم التحديث من ${sourceName}`;
        existing.updatedAt = now;
        updated++;
      } else {
        existingForeigners.unshift({
          id: generateId(),
          residenceNumber: `إقامة-${today.slice(0, 4)}-${String(existingForeigners.length + i + 1).padStart(4, '0')}`,
          fullName,
          passportNumber: passportNo || `FR-${Date.now().toString().slice(-5)}`,
          nationality: rec.nationality || rec.country || 'أجنبي',
          employer: rec.agency || rec.organization || 'منشأة معتمدة',
          profession: rec.profession || rec.visitReason || 'مهني / مقيم',
          entryDate: rec.receiveDate || today,
          entryPort: rec.center || defaultPort,
          residenceExpiryDate: rec.expiryDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          medicalExamResult: 'لائق طبياً',
          reEntryVisaStatus: 'سارية',
          securityClearanceStatus: 'معتمد',
          notes: `تم الاستيراد من ${sourceName}${rec.additionalInfo ? ' | ' + rec.additionalInfo : ''}`,
          createdAt: now,
          updatedAt: now
        });
        added++;
      }
    });

    saveForeigners(existingForeigners);
    addAuditLog('استيراد كشف', 'الوافدون الأجانب', `استيراد ${added} وافد جديد و ${updated} تحديث من ${sourceName}`);
    notifySovereignDataUpdated('foreigner');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.foreigner };
  }

  if (category === 'migrant') {
    const existingMigrants = getMigrants();
    const newMigrants: UndocumentedMigrant[] = records.map((rec, i) => {
      const fullName = extractFullNameFromRecord(rec);
      const docNo = String(rec.idNumber || '').trim();
      checkRowWatchlist(fullName, docNo);
      return {
        id: generateId(),
        fileNumber: `هجرة-${today.slice(0, 4)}-${String(existingMigrants.length + i + 1).padStart(4, '0')}`,
        fullName,
        nationality: rec.nationality || rec.country || 'إثيوبيا',
        countryOfOrigin: rec.country || rec.nationality || 'إثيوبيا',
        infiltrationPoint: rec.center || 'شريط الساحل التهامي',
        apprehensionDate: rec.receiveDate || today,
        apprehensionPlace: rec.governorate || 'منطقة ساحلية',
        gender: rec.gender === 'أنثى' ? 'أنثى' : 'ذكر',
        approximateAge: Number(rec.age) || 26,
        medicalCheckStatus: 'سليم',
        fingerprintRegistered: true,
        shelterCenter: 'مركز الإيواء المؤقت المركزي',
        deportationStatus: 'قيد الإيواء والتحقيق',
        notes: `مستورد من ${sourceName}${rec.additionalInfo ? ' | ' + rec.additionalInfo : ''}`,
        createdAt: now,
        updatedAt: now
      };
    });
    saveMigrants([...newMigrants, ...existingMigrants]);
    added = newMigrants.length;
    addAuditLog('استيراد كشف', 'المهاجرون غير الشرعيين', `استيراد ${added} سجل مهاجر من ${sourceName}`);
    notifySovereignDataUpdated('migrant');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.migrant };
  }

  if (category === 'refugee') {
    const existingRefugees = getRefugees();
    const newRefugees: RefugeeRecord[] = records.map((rec, i) => {
      const fullName = extractFullNameFromRecord(rec);
      const docNo = String(rec.idNumber || '').trim();
      checkRowWatchlist(fullName, docNo);
      return {
        id: generateId(),
        unhcrNumber: docNo ? `UNHCR-${docNo}` : `UNHCR-YEM-${String(Math.floor(100000 + Math.random() * 900000))}`,
        temporaryPermitNumber: `تصريح-لجوء-${today.slice(0, 4)}-${String(existingRefugees.length + i + 1).padStart(3, '0')}`,
        fullName,
        nationality: rec.nationality || rec.country || 'الصومال',
        arrivalDate: rec.receiveDate || today,
        familyMembersCount: 1,
        securityVettingStatus: 'مبرأ ومطابق',
        vettingOfficer: rec.investigatingOfficer || officerName,
        permitStatus: 'ساري',
        permitExpiryDate: rec.expiryDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        qrVerificationCode: `REF:UNHCR:${docNo || 'YEM'}:${fullName}`,
        residentialAddress: rec.governorate || 'أمانة العاصمة - صنعاء',
        phone: rec.phone || '',
        createdAt: now,
        updatedAt: now
      };
    });
    saveRefugees([...newRefugees, ...existingRefugees]);
    added = newRefugees.length;
    addAuditLog('استيراد كشف', 'اللاجئون', `استيراد ${added} ملف لاجئ من ${sourceName}`);
    notifySovereignDataUpdated('refugee');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.refugee };
  }

  if (category === 'permit') {
    const existingPermits = getMovementPermits();
    const first = records[0] || {};
    const firstFullName = extractFullNameFromRecord(first);
    const permitCode = `تصريح-موحد-${Date.now().toString().slice(-4)}`;
    const newPermit: InternalMovementPermit = {
      id: generateId(),
      permitCode,
      delegationName: first.agency || first.organization || firstFullName || `وفد مستورد (${sourceName})`,
      organizationType: 'منظمة دولية (INGO)',
      authorizedRoute: first.destination || 'صنعاء -> ذمار -> إب -> تعز',
      allowedCheckpoints: ['نقطة العلم', 'نقطة يسلح'],
      vehicleDetails: [{ plate: 'مهمة رسمية', model: 'سيارة بعثة', color: 'أبيض' }],
      delegationHead: firstFullName,
      passportNumber: first.idNumber || first.passportNumber || 'كشف مرفق',
      passengersCount: records.length || 1,
      securityEscortNeeded: false,
      validFrom: first.receiveDate || today,
      validTo: first.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      accommodationPlace: 'مقر المنظمة الرسمي',
      qrVerificationCode: `PERMIT:${permitCode}:${records.length}`,
      approvalStatus: 'معتمد رسمياً',
      approvedBy: officerName,
      createdAt: now,
      updatedAt: now
    };
    saveMovementPermits([newPermit, ...existingPermits]);
    added = 1;
    records.forEach(r => checkRowWatchlist(extractFullNameFromRecord(r), r.idNumber || r.passportNumber || ''));
    addAuditLog('استيراد كشف', 'تصاريح التنقل', `إصدار تصريح تنقل (${records.length} مرافقين) من ${sourceName}`, newPermit.id);
    notifySovereignDataUpdated('permit');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.permit };
  }

  if (category === 'report') {
    const existingReports = getReports();
    const newReports: Report[] = records.map((rec, idx) => {
      const fullName = extractFullNameFromRecord(rec);
      const idNo = rec.idNumber || rec.passportNumber || 'غير محدد';
      const fallbackTitle =
        rec.subject ||
        (rec.transportDetails?.batchName ? `تقرير إرسالية / ملخص: ${rec.transportDetails.batchName}` : '') ||
        `بلاغ / تقرير وارد: ${fullName}`;
      return {
        id: generateId(),
        autoNumber: rec.autoNumber || `RPT-${today.replace(/-/g, '')}-${String(existingReports.length + idx + 1).padStart(3, '0')}`,
        reportDate: rec.reportDate || rec.receiveDate || today,
        sendingAuthority: rec.sendingAuthority || rec.agency || rec.organization || defaultPort,
        subject: rec.subject || rec.title || fallbackTitle,
        priority: rec.priority || 'عادي',
        actionsTaken: rec.actionsTaken || 'تم الأرشفة والربط الآلي عبر مركز الاستيراد الموحد',
        title: rec.title || fallbackTitle,
        description:
          rec.description ||
          `مستورد من ${sourceName} | الجهة/الاسم: ${fullName} | المرجع: ${idNo} | التفاصيل: ${rec.vettingResult || rec.additionalInfo || 'قيد المراجعة'}`,
        type: rec.type || (rec.transportDetails ? 'كشف إرسالية وتسهيل مرور' : 'ضبط أمني'),
        status: rec.status === 'معتمد' ? 'معتمد' : 'جديد',
        transportDetails: rec.transportDetails,
        linkedTravelerIds: Array.isArray(rec.linkedTravelerIds) ? rec.linkedTravelerIds : undefined,
        createdAt: now,
        updatedAt: now,
        attachments: Array.isArray(rec.attachments) ? rec.attachments : []
      };
    });
    saveReports([...newReports, ...existingReports]);
    added = newReports.length;
    addAuditLog('استيراد كشف', 'المسافرين', `استيراد وإدراج ${added} تقرير / بلاغ من ${sourceName}`);
    notifySovereignDataUpdated('report');
    return { added, updated, watchlistHits, moduleLabel: CATEGORY_LABELS.report };
  }

  // Default: 'traveler' (المسافرين وحركة المنافذ والتأشيرات ووكالات السفر)
  const normalizedTravelers = records.map(row => {
    const normalizedRow: any = { ...row };

    // تنظيف النصوص العربية من التطويل والمسافات الزائدة
    ['fullName', 'passportName', 'firstName', 'secondName', 'thirdName', 'fourthName', 'lastName', 'center', 'agency', 'visaType', 'status', 'returnReason', 'governorate', 'destination', 'visitReason'].forEach(k => {
      if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
        normalizedRow[k] = cleanArabicText(String(normalizedRow[k]));
      }
    });

    if (!normalizedRow.firstName && normalizedRow.fullName) {
      Object.assign(normalizedRow, splitNameParts(String(normalizedRow.fullName)));
    }
    if (!normalizedRow.country && normalizedRow.nationality) {
      normalizedRow.country = normalizedRow.nationality;
    }
    if (!normalizedRow.idNumber && normalizedRow.passportNumber) {
      normalizedRow.idNumber = String(normalizedRow.passportNumber).trim();
    } else if (normalizedRow.idNumber) {
      normalizedRow.idNumber = String(normalizedRow.idNumber).trim().replace(/\.0$/, '');
    }
    if (!normalizedRow.agency && normalizedRow.organization) {
      normalizedRow.agency = cleanArabicText(String(normalizedRow.organization));
    }
    if (!normalizedRow.destination && normalizedRow.workLocation) {
      normalizedRow.destination = cleanArabicText(String(normalizedRow.workLocation));
    }
    if (normalizedRow.serialNumber !== undefined) {
      normalizedRow.serialNumber = String(normalizedRow.serialNumber).trim().replace(/\.0$/, '');
    }

    const rawDate = normalizedRow.exitDate || normalizedRow.receiveDate;
    if (rawDate) {
      const formattedDate = formatParsedDate(rawDate);
      normalizedRow.exitDate = formattedDate;
      normalizedRow.receiveDate = formattedDate;
    }

    if (!normalizedRow.governorate && normalizedRow.center) {
      normalizedRow.governorate = inferGovernorateFromCenter(normalizedRow.center);
    }
    if (!normalizedRow.visitReason && normalizedRow.visaType) {
      normalizedRow.visitReason = normalizedRow.visaType;
    }

    const fullName = extractFullNameFromRecord(normalizedRow);
    checkRowWatchlist(fullName, normalizedRow.idNumber || '');

    return normalizedRow;
  });

  const batchResult = smartBatchUpsertTravelers(normalizedTravelers, `استيراد موحد: ${sourceName}`);
  added = batchResult.added;
  updated = batchResult.updated;

  const agencyNote =
    batchResult.linkedAgenciesCount > 0
      ? ` — وربط ${batchResult.linkedAgenciesCount} وكالة سفر`
      : '';

  addAuditLog(
    'استيراد كشف',
    'المسافرين',
    `استيراد ودمج ذكي من المركز الموحد: ${sourceName} (${added} جديد، ${updated} تحديث${agencyNote})`
  );
  notifySovereignDataUpdated('traveler');
  if (batchResult.createdAgencies.length > 0 || batchResult.linkedAgenciesCount > 0) {
    notifySovereignDataUpdated('companies');
  }
  return {
    added,
    updated,
    watchlistHits,
    moduleLabel: CATEGORY_LABELS.traveler,
    linkedAgenciesCount: batchResult.linkedAgenciesCount,
    createdAgencies: batchResult.createdAgencies
  };
}

/**
 * نسخة غير متزامنة ومقسمة (Chunked) من distributeRecordsToModule لمعالجة كشوفات 3000+ سجل بسلاسة دون تهنيج المتصفح
 */
export async function distributeRecordsToModuleAsync(
  category: UnifiedImportCategory,
  records: any[],
  sourceName: string,
  extra?: {
    mofaRequest?: MofaVisaRequest;
    seizureMeta?: {
      recordNumber?: string;
      seizurePort?: string;
      seizureDate?: string;
      driverName?: string;
      carPlate?: string;
      direction?: string;
      reason?: string;
    };
    onProgress?: (percent: number) => void;
  }
): Promise<DistributeResult> {
  if (category !== 'traveler') {
    extra?.onProgress?.(50);
    await new Promise<void>(r => setTimeout(r, 0));
    const res = distributeRecordsToModule(category, records, sourceName, extra);
    extra?.onProgress?.(100);
    return res;
  }

  const indexedReports = getReports().map(r => {
    const norm = normalizeArabic(`${r.title || ''} ${r.description || ''}`);
    return {
      title: r.title,
      normText: norm,
      normLower: norm.toLowerCase()
    };
  });

  const watchlistHits: WatchlistHit[] = [];
  const checkRowWatchlist = (name: string, idNum: string) => {
    if (indexedReports.length === 0) return;
    const cleanId = idNum ? normalizeArabic(idNum).toLowerCase() : '';
    const cleanName = name ? normalizeArabic(name) : '';
    if (cleanId.length < 4 && cleanName.length < 6) return;

    const hit = indexedReports.find(r => {
      if (cleanId.length >= 4 && r.normLower.includes(cleanId)) return true;
      if (cleanName.length >= 6 && r.normText.includes(cleanName)) return true;
      return false;
    });
    if (hit) {
      watchlistHits.push({
        travelerName: name || 'غير محدد',
        idNumber: idNum || '-',
        matchedReportTitle: hit.title
      });
    }
  };

  const fieldsToClean = [
    'fullName',
    'passportName',
    'firstName',
    'secondName',
    'thirdName',
    'fourthName',
    'lastName',
    'center',
    'agency',
    'visaType',
    'status',
    'returnReason',
    'governorate',
    'destination',
    'visitReason'
  ];

  const normalizedTravelers: any[] = [];
  const CHUNK_SIZE = 350;
  const total = records.length;

  for (let i = 0; i < total; i++) {
    const normalizedRow: any = { ...records[i] };

    for (let kIdx = 0; kIdx < fieldsToClean.length; kIdx++) {
      const k = fieldsToClean[kIdx];
      if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
        normalizedRow[k] = cleanArabicText(String(normalizedRow[k]));
      }
    }

    if (!normalizedRow.firstName && normalizedRow.fullName) {
      Object.assign(normalizedRow, splitNameParts(String(normalizedRow.fullName)));
    }
    if (!normalizedRow.country && normalizedRow.nationality) {
      normalizedRow.country = normalizedRow.nationality;
    }
    if (!normalizedRow.idNumber && normalizedRow.passportNumber) {
      normalizedRow.idNumber = String(normalizedRow.passportNumber).trim();
    } else if (normalizedRow.idNumber) {
      normalizedRow.idNumber = String(normalizedRow.idNumber).trim().replace(/\.0$/, '');
    }
    if (!normalizedRow.agency && normalizedRow.organization) {
      normalizedRow.agency = cleanArabicText(String(normalizedRow.organization));
    }
    if (!normalizedRow.destination && normalizedRow.workLocation) {
      normalizedRow.destination = cleanArabicText(String(normalizedRow.workLocation));
    }
    if (normalizedRow.serialNumber !== undefined) {
      normalizedRow.serialNumber = String(normalizedRow.serialNumber).trim().replace(/\.0$/, '');
    }

    const rawDate = normalizedRow.exitDate || normalizedRow.receiveDate;
    if (rawDate) {
      const formattedDate = formatParsedDate(rawDate);
      normalizedRow.exitDate = formattedDate;
      normalizedRow.receiveDate = formattedDate;
    }

    if (!normalizedRow.governorate && normalizedRow.center) {
      normalizedRow.governorate = inferGovernorateFromCenter(normalizedRow.center);
    }
    if (!normalizedRow.visitReason && normalizedRow.visaType) {
      normalizedRow.visitReason = normalizedRow.visaType;
    }

    const fullName = extractFullNameFromRecord(normalizedRow);
    checkRowWatchlist(fullName, normalizedRow.idNumber || '');
    normalizedTravelers.push(normalizedRow);

    if (i > 0 && i % CHUNK_SIZE === 0) {
      extra?.onProgress?.(Math.round((i / total) * 45));
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }

  const batchResult = await smartBatchUpsertTravelersAsync(
    normalizedTravelers,
    `استيراد موحد: ${sourceName}`,
    p => extra?.onProgress?.(45 + Math.round(p * 0.55))
  );

  const agencyNote =
    batchResult.linkedAgenciesCount > 0 ? ` — وربط ${batchResult.linkedAgenciesCount} وكالة سفر` : '';

  addAuditLog(
    'استيراد كشف',
    'المسافرين',
    `استيراد ودمج ذكي من المركز الموحد: ${sourceName} (${batchResult.added} جديد، ${batchResult.updated} تحديث${agencyNote})`
  );
  notifySovereignDataUpdated('traveler');
  if (batchResult.createdAgencies.length > 0 || batchResult.linkedAgenciesCount > 0) {
    notifySovereignDataUpdated('companies');
  }

  return {
    added: batchResult.added,
    updated: batchResult.updated,
    watchlistHits,
    moduleLabel: CATEGORY_LABELS.traveler,
    linkedAgenciesCount: batchResult.linkedAgenciesCount,
    createdAgencies: batchResult.createdAgencies
  };
}

