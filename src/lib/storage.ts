import {
  Traveler,
  Report,
  Movement,
  User,
  PassportSeizure,
  UndocumentedMigrant,
  RefugeeRecord,
  ForeignerResident,
  InternalMovementPermit,
  CitizenshipAndLegalCase,
  MonitoredCompany,
  OfficialCorrespondence,
  AuditLogEntity,
  DeveloperSystemSettings,
  MofaVisaRequest,
  PortOfficer
} from './types';
import { SOVEREIGN_PORTS, SovereignPort, SovereignUserRole } from './constants';
import { kvGet, kvSet, kvRemove } from './sovereignStorageBackend';

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const cleanArabicText = (text: string) => {
  if (!text) return '';
  return String(text)
    .replace(/[\u0640\u200B-\u200F\uFEFF]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeArabic = (text: string) => {
  if (!text) return '';
  return cleanArabicText(text)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
};

export const inferGovernorateFromCenter = (center?: string): string => {
  const norm = normalizeArabic(center || '').toLowerCase();
  if (!norm) return '';
  if (norm === 'اب' || norm.includes('اب')) return 'إب';
  if (norm.includes('عدن')) return 'عدن';
  if (norm.includes('صنعاء')) return 'صنعاء';
  if (norm.includes('تعز')) return 'تعز';
  if (norm.includes('الحديدة') || norm.includes('حديدة')) return 'الحديدة';
  if (norm.includes('حضرموت') || norm.includes('المكلا') || norm.includes('سيئون') || norm.includes('الوديعه')) return 'حضرموت';
  if (norm.includes('ذمار')) return 'ذمار';
  if (norm.includes('مارب')) return 'مأرب';
  if (norm.includes('حجه')) return 'حجة';
  if (norm.includes('صعده')) return 'صعدة';
  if (norm.includes('المهره') || norm.includes('شحن') || norm.includes('صرفيت')) return 'المهرة';
  if (norm.includes('شبوه')) return 'شبوة';
  if (norm.includes('عمران')) return 'عمران';
  if (norm.includes('البيضاء')) return 'البيضاء';
  if (norm.includes('لحج')) return 'لحج';
  if (norm.includes('الضالع')) return 'الضالع';
  if (norm.includes('ابين')) return 'أبين';
  return '';
};

const SYSTEM_AGENCY_PLACEHOLDERS = new Set([
  '',
  '-',
  'غير محدد',
  'غير معروف',
  'رئاسة مصلحة الهجرة والجوازات والجنسية',
  'رئاسه مصلحه الهجره والجوازات والجنسيه',
  'المنفذ المركزي',
  'المركز الرئيسي',
  'جهة معتمدة'
]);

export function isMeaningfulAgencyName(name?: string): boolean {
  const cleaned = cleanArabicText(name || '');
  if (!cleaned || cleaned.length < 2) return false;
  return !SYSTEM_AGENCY_PLACEHOLDERS.has(cleaned) && !SYSTEM_AGENCY_PLACEHOLDERS.has(normalizeArabic(cleaned));
}

let hasCheckedTravelerMigration = false;

// 1. Travelers
export const getTravelers = (): Traveler[] => {
  const data = kvGet('travelers');
  if (!data) return [];
  try {
    const list: Traveler[] = JSON.parse(data);
    if (!hasCheckedTravelerMigration) {
      hasCheckedTravelerMigration = true;
      const needsMigration = list.some(t => {
        const isNameMissing = !t.firstName || t.firstName === 'مسافر' || t.firstName === 'غير محدد';
        const hasPassportNote =
          t.additionalInfo &&
          (t.additionalInfo.includes('اسم الجواز') ||
            t.additionalInfo.includes('حالة الجواز') ||
            t.additionalInfo.includes('الاسم:'));
        return (isNameMissing && hasPassportNote) || (!t.passportStatus && t.additionalInfo?.includes('حالة الجواز'));
      });
      if (needsMigration) {
        setTimeout(() => repairAndMigrateTravelers(), 0);
      }
    }
    return list;
  } catch {
    return [];
  }
};

export const saveTravelers = (travelers: Traveler[]) => {
  const normalized = travelers.map(t => {
    if (t.mergeHistory && t.mergeHistory.length > 5) {
      return { ...t, mergeHistory: t.mergeHistory.slice(-5) };
    }
    return t;
  });
  kvSet('travelers', JSON.stringify(normalized));
};

export interface ExtractedStructuredData {
  passportName?: string;
  passportStatus?: string;
  profession?: string;
  placeOfIssue?: string;
  issueDate?: string;
  expiryDate?: string;
  birthDate?: string;
  gender?: string;
  nationalId?: string;
  fullName?: string;
}

/**
 * دالة ذكية لاستخراج وتفكيك الحقول المنفصلة من نص 'معلومات إضافية' أو من الحقول الخام
 */
export function extractStructuredDataFromNotes(
  notes?: string,
  rawRecord?: Record<string, any>
): ExtractedStructuredData {
  const result: ExtractedStructuredData = {};
  if (!notes && !rawRecord) return result;

  const text = String(notes || '');

  // 1. استخراج اسم الجواز
  const namePattern = /(?:اسم الجواز|إسم الجواز|الاسم بالجواز|اسم المسافر بالجواز|اسم صاحب الجواز|اسم حامل الجواز|صاحب الجواز|الاسم بالكامل|الاسم بالإنجليزية|الاسم)\s*[:=]\s*([^|\n;,]+)/i;
  const nameMatch = text.match(namePattern);
  if (nameMatch && nameMatch[1]?.trim()) {
    result.passportName = nameMatch[1].trim();
    result.fullName = result.passportName;
  }

  // 2. استخراج حالة الجواز
  const statusPattern = /(?:حالة الجواز|حاله الجواز|وضع الجواز|صلاحية الجواز|حالة وثيقة السفر)\s*[:=]\s*([^|\n;,]+)/i;
  const statusMatch = text.match(statusPattern);
  if (statusMatch && statusMatch[1]?.trim()) {
    result.passportStatus = statusMatch[1].trim();
  }

  // 3. استخراج المهنة
  const professionPattern = /(?:المهنة|الوظيفة|المهنه|الوظيفه|طبيعة العمل)\s*[:=]\s*([^|\n;,]+)/i;
  const profMatch = text.match(professionPattern);
  if (profMatch && profMatch[1]?.trim()) {
    result.profession = profMatch[1].trim();
  }

  // 4. استخراج مكان الإصدار
  const placePattern = /(?:مكان الإصدار|مكان الاصدار|جهة الإصدار|جهة الاصدار|فرع الإصدار)\s*[:=]\s*([^|\n;,]+)/i;
  const placeMatch = text.match(placePattern);
  if (placeMatch && placeMatch[1]?.trim()) {
    result.placeOfIssue = placeMatch[1].trim();
  }

  // 5. استخراج تاريخ الإصدار
  const issuePattern = /(?:تاريخ الإصدار|تاريخ الاصدار|إصدار الجواز|ت\. الإصدار)\s*[:=]\s*([^|\n;,]+)/i;
  const issueMatch = text.match(issuePattern);
  if (issueMatch && issueMatch[1]?.trim()) {
    result.issueDate = issueMatch[1].trim();
  }

  // 6. استخراج تاريخ الانتهاء
  const expiryPattern = /(?:تاريخ الانتهاء|تاريخ انتهاء الجواز|انتهاء الجواز|نهاية الصلاحية|الانتهاء|الصلاحية)\s*[:=]\s*([^|\n;,]+)/i;
  const expMatch = text.match(expiryPattern);
  if (expMatch && expMatch[1]?.trim()) {
    result.expiryDate = expMatch[1].trim();
  }

  // 7. استخراج الجنس
  const genderPattern = /(?:الجنس|النوع)\s*[:=]\s*([^|\n;,]+)/i;
  const genMatch = text.match(genderPattern);
  if (genMatch && genMatch[1]?.trim()) {
    result.gender = genMatch[1].trim();
  }

  // 8. استخراج تاريخ الميلاد
  const birthPattern = /(?:تاريخ الميلاد|الميلاد|سنة الميلاد)\s*[:=]\s*([^|\n;,]+)/i;
  const birthMatch = text.match(birthPattern);
  if (birthMatch && birthMatch[1]?.trim()) {
    result.birthDate = birthMatch[1].trim();
  }

  // 9. استخراج الرقم الوطني
  const nationalPattern = /(?:الرقم الوطني|رقم الهوية|رقم البطاقة الشخصية)\s*[:=]\s*([^|\n;,]+)/i;
  const natMatch = text.match(nationalPattern);
  if (natMatch && natMatch[1]?.trim()) {
    result.nationalId = natMatch[1].trim();
  }

  // 10. فحص الحقول الخام في السجل المرفوع إن وجدت
  if (rawRecord) {
    Object.entries(rawRecord).forEach(([k, v]) => {
      if (!v) return;
      const strVal = String(v).trim();
      const normK = normalizeArabic(k).toLowerCase().trim();
      if ((normK === 'اسم الجواز' || normK === 'الاسم بالجواز' || normK === 'اسم المسافر بالجواز') && !result.passportName) {
        result.passportName = strVal;
        result.fullName = strVal;
      }
      if ((normK === 'حالة الجواز' || normK === 'وضع الجواز') && !result.passportStatus) {
        result.passportStatus = strVal;
      }
      if ((normK === 'المهنة' || normK === 'الوظيفة') && !result.profession) {
        result.profession = strVal;
      }
      if ((normK === 'مكان الإصدار' || normK === 'جهة الإصدار') && !result.placeOfIssue) {
        result.placeOfIssue = strVal;
      }
      if ((normK === 'تاريخ الإصدار' || normK === 'تاريخ الاصدار') && !result.issueDate) {
        result.issueDate = strVal;
      }
      if ((normK === 'تاريخ الانتهاء' || normK === 'انتهاء الجواز') && !result.expiryDate) {
        result.expiryDate = strVal;
      }
      if ((normK === 'الجنس' || normK === 'النوع') && !result.gender) {
        result.gender = strVal;
      }
      if ((normK === 'تاريخ الميلاد' || normK === 'الميلاد') && !result.birthDate) {
        result.birthDate = strVal;
      }
      if ((normK === 'الرقم الوطني' || normK === 'رقم الهوية') && !result.nationalId) {
        result.nationalId = strVal;
      }
    });
  }

  return result;
}

/**
 * وظيفة إصلاح ومزامنة شاملة لسجلات المسافرين:
 * تفحص حقول 'معلومات إضافية' لجميع المسافرين، وتستخرج منها اسم الجواز وحالة الجواز والمهنة وتواريخ الصلاحية
 * وتدرجها في حقولها الرسمية وتحدث الأسماء الناقصة فورياً.
 */
export function repairAndMigrateTravelers(): { totalRepaired: number; totalTravelers: number; repairedDetails: string[] } {
  const travelers = getTravelers();
  let totalRepaired = 0;
  const repairedDetails: string[] = [];

  travelers.forEach(t => {
    let changed = false;
    const extracted = extractStructuredDataFromNotes(t.additionalInfo);

    // 1. معالجة الاسم الناقص أو الافتراضي
    const currentFullName = `${t.firstName || ''} ${t.secondName || ''} ${t.thirdName || ''} ${t.lastName || ''}`.trim();
    const isNameMissing = !currentFullName || currentFullName === 'مسافر' || currentFullName === 'غير محدد' || currentFullName === 'غير معروف';

    if (extracted.passportName || t.passportName) {
      const candidateName = extracted.passportName || t.passportName;
      if (!t.passportName && extracted.passportName) {
        t.passportName = extracted.passportName;
        changed = true;
      }
      if (isNameMissing && candidateName) {
        const parts = candidateName.trim().split(/\s+/).filter(Boolean);
        t.firstName = parts[0] || 'مسافر';
        t.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        const middle = parts.slice(1, -1);
        t.secondName = middle[0] || '';
        t.thirdName = middle[1] || '';
        t.fourthName = middle[2] || '';
        changed = true;
        repairedDetails.push(`تم استخراج وتثبيت اسم المسافر (${candidateName}) لرقم الجواز ${t.idNumber}`);
      }
    }

    // 2. تحديث حالة الجواز
    if (!t.passportStatus && extracted.passportStatus) {
      t.passportStatus = extracted.passportStatus;
      changed = true;
    }

    // 3. تحديث المهنة
    if (!t.profession && extracted.profession) {
      t.profession = extracted.profession;
      changed = true;
    }

    // 4. تحديث مكان الإصدار
    if (!t.placeOfIssue && extracted.placeOfIssue) {
      t.placeOfIssue = extracted.placeOfIssue;
      changed = true;
    }

    // 5. تحديث تاريخ الإصدار
    if (!t.issueDate && extracted.issueDate) {
      t.issueDate = extracted.issueDate;
      changed = true;
    }

    // 6. تحديث تاريخ الانتهاء
    if (!t.expiryDate && extracted.expiryDate) {
      t.expiryDate = extracted.expiryDate;
      changed = true;
    }

    // 7. تحديث الجنس
    if (!t.gender && extracted.gender) {
      t.gender = extracted.gender;
      changed = true;
    }

    // 8. تحديث تاريخ الميلاد
    if (!t.birthDate && extracted.birthDate) {
      t.birthDate = extracted.birthDate;
      changed = true;
    }

    // 9. تحديث الرقم الوطني
    if (!t.nationalId && extracted.nationalId) {
      t.nationalId = extracted.nationalId;
      changed = true;
    }

    if (changed) {
      totalRepaired++;
      t.updatedAt = new Date().toISOString();
    }
  });

  if (totalRepaired > 0) {
    saveTravelers(travelers);
    addAuditLog('تعديل', 'المسافرين', `إصلاح وفصل بيانات المسافرين الذكي: تم تحديث واستخراج حقول ${totalRepaired} مسافر`);
  }

  return { totalRepaired, totalTravelers: travelers.length, repairedDetails };
}

export interface SmartMergeResult<T> {
  record: T;
  isNew: boolean;
  updatedFields: string[];
  message: string;
}

/**
 * ميزة SmartMerge المركزية:
 * عند تطابق المسافر (برقم الجواز أو الهوية أو الاسم المطابق)، يتم تحديث الحقول الناقصة فقط
 * مع تدوين التغييرات في حقل 'معلومات إضافية' مع تاريخ ووقت التحديث ودون تكرار السجل
 */
export function smartMergeTraveler(
  existing: Traveler,
  incoming: Partial<Traveler>,
  sourceLabel?: string
): { merged: Traveler; updatedFields: string[]; isMerged: boolean } {
  const updatedFields: string[] = [];
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];
  const sourceText = sourceLabel || 'استيراد ذكي';

  const merged: Traveler = { ...existing };
  const changes: { field: string; label: string; oldValue: any; newValue: any }[] = [];

  // إذا كانت البيانات القادمة تحتوي على معلومات مركبة، يتم استخراج حقول الجواز منها
  const extractedFromIncoming = extractStructuredDataFromNotes(incoming.additionalInfo, incoming as any);
  if (extractedFromIncoming.passportName && !incoming.passportName) incoming.passportName = extractedFromIncoming.passportName;
  if (extractedFromIncoming.passportStatus && !incoming.passportStatus) incoming.passportStatus = extractedFromIncoming.passportStatus;
  if (extractedFromIncoming.profession && !incoming.profession) incoming.profession = extractedFromIncoming.profession;
  if (extractedFromIncoming.placeOfIssue && !incoming.placeOfIssue) incoming.placeOfIssue = extractedFromIncoming.placeOfIssue;
  if (extractedFromIncoming.issueDate && !incoming.issueDate) incoming.issueDate = extractedFromIncoming.issueDate;
  if (extractedFromIncoming.expiryDate && !incoming.expiryDate) incoming.expiryDate = extractedFromIncoming.expiryDate;
  if (extractedFromIncoming.gender && !incoming.gender) incoming.gender = extractedFromIncoming.gender;
  if (extractedFromIncoming.birthDate && !incoming.birthDate) incoming.birthDate = extractedFromIncoming.birthDate;
  if (extractedFromIncoming.nationalId && !incoming.nationalId) incoming.nationalId = extractedFromIncoming.nationalId;

  // إذا كان الاسم في السجل الحالي مسافر/غير محدد، واسم الجواز متوفر في الوارد
  const currentFullName = `${merged.firstName || ''} ${merged.lastName || ''}`.trim();
  if ((!currentFullName || currentFullName === 'مسافر' || currentFullName === 'غير محدد') && incoming.passportName) {
    const parts = incoming.passportName.trim().split(/\s+/).filter(Boolean);
    incoming.firstName = parts[0] || '';
    incoming.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    const middle = parts.slice(1, -1);
    incoming.secondName = middle[0] || '';
    incoming.thirdName = middle[1] || '';
    incoming.fourthName = middle[2] || '';
  }

  const fieldLabels: Record<string, string> = {
    firstName: 'الاسم الأول',
    secondName: 'اسم الأب',
    thirdName: 'اسم الجد',
    fourthName: 'الاسم الرابع',
    lastName: 'اللقب',
    passportName: 'اسم الجواز',
    passportStatus: 'حالة الجواز',
    profession: 'المهنة',
    placeOfIssue: 'مكان الإصدار',
    issueDate: 'تاريخ الإصدار',
    expiryDate: 'تاريخ الانتهاء',
    birthDate: 'تاريخ الميلاد',
    gender: 'الجنس',
    nationalId: 'الرقم الوطني',
    age: 'العمر',
    country: 'الجنسية',
    governorate: 'المحافظة',
    phone: 'رقم الهاتف',
    destination: 'الوجهة',
    visitReason: 'سبب الزيارة',
    agency: 'الوكالة',
    agencyId: 'معرف الوكالة',
    center: 'المنفذ / المركز',
    visaType: 'نوع التأشيرة',
    receiveDate: 'تاريخ الاستلام',
    exitDate: 'تاريخ الخروج',
    serialNumber: 'الرقم التسلسلي (م)',
    status: 'الحالة',
    investigatingOfficer: 'ضابط التحقيق',
    returnReason: 'سبب الإرتجاع',
    photoUrl: 'الصورة الشخصية',
    vettingResult: 'نتيجة التدقيق',
    additionalInfo: 'معلومات إضافية'
  };

  // توحيد حقلي تاريخ الخروج والاستلام وتنظيف التطويل
  if (incoming.exitDate && !incoming.receiveDate) incoming.receiveDate = incoming.exitDate;
  if (incoming.receiveDate && !incoming.exitDate) incoming.exitDate = incoming.receiveDate;
  if (incoming.status) incoming.status = cleanArabicText(incoming.status);
  if (incoming.agency) incoming.agency = cleanArabicText(incoming.agency);
  if (incoming.center) incoming.center = cleanArabicText(incoming.center);
  if (incoming.visaType) incoming.visaType = cleanArabicText(incoming.visaType);
  if (incoming.returnReason) incoming.returnReason = cleanArabicText(incoming.returnReason);

  // 1. فحص وتحديث الحقول النصية وحقول الجواز الناقصة
  const textFields: (keyof Traveler)[] = [
    'firstName', 'secondName', 'thirdName', 'fourthName', 'lastName',
    'passportName', 'passportStatus', 'profession', 'placeOfIssue',
    'issueDate', 'expiryDate', 'birthDate', 'gender', 'nationalId',
    'governorate', 'phone', 'destination', 'visitReason',
    'agency', 'agencyId', 'center', 'visaType', 'receiveDate', 'exitDate', 'serialNumber',
    'status', 'investigatingOfficer', 'returnReason', 'photoUrl'
  ];

  for (const field of textFields) {
    const currentVal = merged[field] ? String(merged[field]).trim() : '';
    const incomingVal = incoming[field] ? String(incoming[field]).trim() : '';
    
    // إذا كان الحقل فارغاً في الحالي وموجوداً في القادم، أو كان الحالي 'مسافر'/قيمة افتراضية، أو تغيرت حالة التأشيرة من مرتجع إلى مؤشر
    const isPlaceholder =
      (field === 'firstName' && (currentVal === 'مسافر' || currentVal === 'غير محدد')) ||
      (field === 'status' && (currentVal === 'معتمد' || currentVal === ''));
    const isVisaStatusUpdate =
      field === 'status' &&
      (incomingVal === 'مؤشر' || incomingVal === 'مرتجع') &&
      currentVal !== incomingVal;
    const isAgencySync = field === 'agencyId' && !currentVal && incomingVal;

    if (((!currentVal || isPlaceholder) && incomingVal && incomingVal !== 'مسافر') || isVisaStatusUpdate || isAgencySync) {
      changes.push({
        field,
        label: fieldLabels[field] || field,
        oldValue: merged[field] || '(فارغ)',
        newValue: incoming[field]
      });
      (merged as any)[field] = incoming[field];
      updatedFields.push(fieldLabels[field] || field);
    }
  }

  // 2. تحديث العمر في حال كان غير محدد
  if ((!merged.age || merged.age === 0) && incoming.age && incoming.age > 0) {
    changes.push({ field: 'age', label: 'العمر', oldValue: merged.age, newValue: incoming.age });
    merged.age = incoming.age;
    updatedFields.push('العمر');
  }

  // 3. تحديث الدولة في حال كانت غير محددة
  if ((!merged.country || merged.country === 'اليمن') && incoming.country && incoming.country !== 'اليمن') {
    changes.push({ field: 'country', label: 'الجنسية', oldValue: merged.country, newValue: incoming.country });
    merged.country = incoming.country;
    updatedFields.push('الجنسية');
  }

  // 4. دمج وتحديث البصمة والبيومترية إن وجدت
  if (!merged.biometrics && incoming.biometrics) {
    changes.push({ field: 'biometrics', label: 'البيانات البيومترية', oldValue: 'غير متوفرة', newValue: 'تم التحديث' });
    merged.biometrics = incoming.biometrics;
    updatedFields.push('البيانات البيومترية');
  }

  // 5. دمج نتائج التدقيق والمباينة الأمنية
  if (incoming.vettingResult && incoming.vettingResult.trim() && incoming.vettingResult !== 'سليم' && incoming.vettingResult !== 'لا يوجد') {
    const oldVr = merged.vettingResult || 'سليم';
    if (!merged.vettingResult || merged.vettingResult === 'سليم' || merged.vettingResult === 'لا يوجد') {
      merged.vettingResult = incoming.vettingResult;
      updatedFields.push('نتيجة التدقيق');
      changes.push({ field: 'vettingResult', label: 'نتيجة التدقيق', oldValue: oldVr, newValue: incoming.vettingResult });
    } else if (!merged.vettingResult.includes(incoming.vettingResult.trim())) {
      const newVal = `${merged.vettingResult} | ${incoming.vettingResult.trim()}`;
      changes.push({ field: 'vettingResult', label: 'دمج المباينة الأمني', oldValue: merged.vettingResult, newValue: newVal });
      merged.vettingResult = newVal;
      updatedFields.push('دمج نتيجة التدقيق');
    }
  }

  // 6. إضافة التحديثات إلى حقل 'معلومات إضافية' (Additional Info) مع التاريخ
  const newNotes = (incoming.additionalInfo || '').trim();
  const fieldSummary = updatedFields.length > 0
    ? `تحديث الحقول الناقصة: [${updatedFields.map(f => fieldLabels[f] || f).join(', ')}]`
    : 'تأكيد ومطابقة البيانات';

  const mergeLogEntry = `[تحديث SmartMerge - ${dateStr} من ${sourceText}]: ${fieldSummary}${newNotes ? ` - ملاحظة إضافية: ${newNotes}` : ''}`;

  if (!merged.additionalInfo || merged.additionalInfo.trim() === '') {
    merged.additionalInfo = mergeLogEntry;
  } else if (!merged.additionalInfo.includes(dateStr) || !merged.additionalInfo.includes(sourceText)) {
    merged.additionalInfo = `${merged.additionalInfo}\n${mergeLogEntry}`;
  }

  // Record history for SmartMergeReport (cap at latest 5 entries to keep IndexedDB lean)
  if (changes.length > 0) {
    if (!merged.mergeHistory) merged.mergeHistory = [];
    merged.mergeHistory.push({
      timestamp: now,
      source: sourceText,
      changes
    });
    if (merged.mergeHistory.length > 5) {
      merged.mergeHistory = merged.mergeHistory.slice(-5);
    }
  }

  merged.updatedAt = now;

  return {
    merged,
    updatedFields,
    isMerged: true
  };
}

function buildNewTravelerRecord(incoming: Partial<Traveler>, now: string): Traveler {
  const extractedData = extractStructuredDataFromNotes(incoming.additionalInfo, incoming as any);
  const finalPassportName = cleanArabicText(incoming.passportName || extractedData.passportName || '') || undefined;

  let fName = cleanArabicText(incoming.firstName || '');
  let sName = cleanArabicText(incoming.secondName || '');
  let tName = cleanArabicText(incoming.thirdName || '');
  let foName = cleanArabicText(incoming.fourthName || '');
  let lName = cleanArabicText(incoming.lastName || '');

  if ((!fName || fName === 'مسافر' || fName === 'غير محدد') && finalPassportName) {
    const parts = finalPassportName.trim().split(/\s+/).filter(Boolean);
    fName = parts[0] || 'مسافر';
    lName = parts.length > 1 ? parts[parts.length - 1] : '';
    const middle = parts.slice(1, -1);
    sName = middle[0] || '';
    tName = middle[1] || '';
    foName = middle[2] || '';
  } else if (!fName) {
    fName = 'مسافر';
  }

  const exitDateVal = incoming.exitDate || incoming.receiveDate || '';
  const centerVal = cleanArabicText(incoming.center || '');
  const agencyVal = cleanArabicText(incoming.agency || '');
  const inferredGov = incoming.governorate || inferGovernorateFromCenter(centerVal);
  const visaVal = cleanArabicText(incoming.visaType || '');
  const visitReasonVal = cleanArabicText(incoming.visitReason || '') || visaVal;

  return {
    id: generateId(),
    firstName: fName,
    secondName: sName,
    thirdName: tName,
    fourthName: foName,
    lastName: lName,
    passportName: finalPassportName,
    passportStatus: incoming.passportStatus || extractedData.passportStatus || 'صالح',
    profession: incoming.profession || extractedData.profession || '',
    placeOfIssue: incoming.placeOfIssue || extractedData.placeOfIssue || '',
    issueDate: incoming.issueDate || extractedData.issueDate || '',
    expiryDate: incoming.expiryDate || extractedData.expiryDate || '',
    birthDate: incoming.birthDate || extractedData.birthDate || '',
    gender: incoming.gender || extractedData.gender || '',
    nationalId: incoming.nationalId || extractedData.nationalId || '',
    age: incoming.age || 0,
    idNumber: incoming.idNumber ? String(incoming.idNumber).trim() : 'غير محدد',
    idType: incoming.idType || 'جواز',
    country: incoming.country || 'اليمن',
    governorate: inferredGov,
    phone: incoming.phone || '',
    vettingResult: incoming.vettingResult || '',
    vettingResult1: incoming.vettingResult1,
    vettingResult2: incoming.vettingResult2,
    vettingResult3: incoming.vettingResult3,
    vettingResult4: incoming.vettingResult4,
    destination: incoming.destination || '',
    visitReason: visitReasonVal,
    visaType: visaVal,
    center: centerVal,
    agency: agencyVal,
    agencyId: incoming.agencyId,
    serialNumber: incoming.serialNumber ? String(incoming.serialNumber).trim() : undefined,
    receiveDate: exitDateVal,
    exitDate: exitDateVal,
    travelAllowed: incoming.travelAllowed || 'نعم',
    status: cleanArabicText(incoming.status || '') || 'معتمد',
    returnReason: cleanArabicText(incoming.returnReason || ''),
    investigatingOfficer: incoming.investigatingOfficer || '',
    requestNumber: incoming.requestNumber || '',
    additionalInfo: cleanArabicText(incoming.additionalInfo || ''),
    photoUrl: incoming.photoUrl,
    biometrics: incoming.biometrics,
    linkedReportIds: incoming.linkedReportIds || [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * إضافة مسافر ذكياً مع ميزة SmartMerge لمنع التكرار وربط وكالات السفر آلياً
 */
export function smartAddOrUpdateTraveler(
  incoming: Partial<Traveler>,
  sourceLabel?: string
): SmartMergeResult<Traveler> {
  const travelers = getTravelers();
  const normalizedIncoming: Partial<Traveler> = { ...incoming };

  // ربط الوكالة تلقائياً إذا تم إدخال اسم وكالة سفر
  if (isMeaningfulAgencyName(normalizedIncoming.agency) && !normalizedIncoming.agencyId) {
    const linked = findOrCreateTravelAgency(normalizedIncoming.agency!, normalizedIncoming.center || normalizedIncoming.governorate);
    if (linked) {
      normalizedIncoming.agency = cleanArabicText(normalizedIncoming.agency!);
      normalizedIncoming.agencyId = linked.id;
    }
  }

  const incomingId = normalizedIncoming.idNumber ? normalizeArabic(String(normalizedIncoming.idNumber)) : '';
  const incomingFullName = normalizeArabic(`${normalizedIncoming.firstName || ''} ${normalizedIncoming.secondName || ''} ${normalizedIncoming.thirdName || ''} ${normalizedIncoming.lastName || ''}`.trim());

  const existingIndex = travelers.findIndex(t => {
    if (incomingId && normalizeArabic(String(t.idNumber)) === incomingId) return true;
    if (incomingFullName && incomingFullName.length > 8) {
      const tFullName = normalizeArabic(`${t.firstName} ${t.secondName || ''} ${t.thirdName || ''} ${t.lastName || ''}`.trim());
      return tFullName === incomingFullName;
    }
    return false;
  });

  const now = new Date().toISOString();

  if (existingIndex !== -1) {
    const existing = travelers[existingIndex];
    const { merged, updatedFields } = smartMergeTraveler(existing, normalizedIncoming, sourceLabel);
    travelers[existingIndex] = merged;
    saveTravelers(travelers);

    addAuditLog(
      'تعديل',
      'المسافرين',
      `دمج ذكي (SmartMerge) للمسافر ${merged.firstName} ${merged.lastName} برقم ${merged.idNumber}`,
      merged.id
    );

    return {
      record: merged,
      isNew: false,
      updatedFields,
      message: `تم العثور على المسافر مسبقاً وتحديث الحقول الناقصة (${updatedFields.length} حقل)`
    };
  } else {
    const newTraveler = buildNewTravelerRecord(normalizedIncoming, now);
    travelers.unshift(newTraveler);
    saveTravelers(travelers);

    addAuditLog(
      'إنشاء',
      'المسافرين',
      `إضافة مسافر جديد ${newTraveler.firstName} ${newTraveler.lastName} برقم ${newTraveler.idNumber}`,
      newTraveler.id
    );

    return {
      record: newTraveler,
      isNew: true,
      updatedFields: [],
      message: 'تم تسجيل المسافر الجديد بنجاح'
    };
  }
}

/**
 * استيراد ودمج دفعة كاملة (Batch SmartMerge) بكفاءة عالية مع الربط الآلي لوكالات السفر بالتأشيرات
 */
export function smartBatchUpsertTravelers(
  incomingList: Partial<Traveler>[],
  sourceLabel?: string
): { added: number; updated: number; linkedAgenciesCount: number; createdAgencies: string[] } {
  const travelers = getTravelers();
  const companies = getMonitoredCompanies();
  let companiesModified = false;
  const createdAgencies: string[] = [];
  const touchedAgencyIds = new Set<string>();

  // فهارس سريعة لمنع التكرار والبحث المباشر
  const idIndexMap = new Map<string, number>();
  const nameIndexMap = new Map<string, number>();
  travelers.forEach((t, idx) => {
    const idKey = t.idNumber ? normalizeArabic(String(t.idNumber)) : '';
    if (idKey && !idIndexMap.has(idKey)) idIndexMap.set(idKey, idx);
    const fullNameKey = normalizeArabic(`${t.firstName} ${t.secondName || ''} ${t.thirdName || ''} ${t.lastName || ''}`.trim());
    if (fullNameKey.length > 8 && !nameIndexMap.has(fullNameKey)) nameIndexMap.set(fullNameKey, idx);
  });

  const companyByNormName = new Map<string, MonitoredCompany>();
  companies.forEach(c => {
    const norm = normalizeArabic(c.companyName).toLowerCase();
    if (norm) companyByNormName.set(norm, c);
  });

  const resolveOrQueueAgency = (rawAgency?: string, centerOrGov?: string): MonitoredCompany | null => {
    if (!isMeaningfulAgencyName(rawAgency)) return null;
    const cleanedName = cleanArabicText(rawAgency!);
    const norm = normalizeArabic(cleanedName).toLowerCase();
    const existingComp = companyByNormName.get(norm);
    if (existingComp) {
      touchedAgencyIds.add(existingComp.id);
      return existingComp;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const gov = inferGovernorateFromCenter(centerOrGov) || 'صنعاء';
    const newComp: MonitoredCompany = {
      id: generateId(),
      licenseNumber: `وكالة-${today.slice(0, 4)}-${String(companies.length + 1).padStart(3, '0')}`,
      companyName: cleanedName,
      commercialRecord: `CR-AUTO-${Math.floor(100000 + Math.random() * 899999)}`,
      type: 'شركات ووكالات السفر والسياحة',
      ownerName: 'مقيد عبر كشوفات التأشيرات',
      supervisorName: 'إدارة الجوازات والوكالات',
      securityClearanceStatus: 'معتمد وساري',
      lastInspectionDate: today,
      violationsCount: 0,
      violationsLog: [],
      governorate: gov,
      address: centerOrGov ? `مركز / فرع ${cleanArabicText(centerOrGov)}` : 'الجمهورية اليمنية',
      phone: '',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    companies.unshift(newComp);
    companyByNormName.set(norm, newComp);
    companiesModified = true;
    createdAgencies.push(cleanedName);
    touchedAgencyIds.add(newComp.id);
    return newComp;
  };

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const newlyCreated: Traveler[] = [];

  incomingList.forEach(rawItem => {
    const item: Partial<Traveler> = { ...rawItem };
    if (isMeaningfulAgencyName(item.agency)) {
      const linkedComp = resolveOrQueueAgency(item.agency, item.center || item.governorate);
      if (linkedComp) {
        item.agency = cleanArabicText(item.agency!);
        item.agencyId = linkedComp.id;
      }
    }

    const idKey = item.idNumber ? normalizeArabic(String(item.idNumber)) : '';
    const fullNameKey = normalizeArabic(`${item.firstName || ''} ${item.secondName || ''} ${item.thirdName || ''} ${item.lastName || ''}`.trim());

    let existingIdx = idKey && idIndexMap.has(idKey) ? idIndexMap.get(idKey)! : -1;
    if (existingIdx === -1 && fullNameKey.length > 8 && nameIndexMap.has(fullNameKey)) {
      existingIdx = nameIndexMap.get(fullNameKey)!;
    }

    if (existingIdx !== -1 && existingIdx < travelers.length) {
      const existing = travelers[existingIdx];
      const { merged } = smartMergeTraveler(existing, item, sourceLabel);
      travelers[existingIdx] = merged;
      updated++;
    } else {
      const created = buildNewTravelerRecord(item, now);
      newlyCreated.push(created);
      added++;
    }
  });

  const finalList = [...newlyCreated, ...travelers];
  saveTravelers(finalList);
  if (companiesModified) {
    saveMonitoredCompanies(companies);
  }

  return {
    added,
    updated,
    linkedAgenciesCount: touchedAgencyIds.size,
    createdAgencies
  };
}

/**
 * نسخة غير متزامنة ومقسمة (Chunked) من SmartMerge لمعالجة الكشوفات الضخمة (3000 - 15000+ سجل) بدون تهنيج
 */
export async function smartBatchUpsertTravelersAsync(
  incomingList: Partial<Traveler>[],
  sourceLabel?: string,
  onProgress?: (percent: number) => void
): Promise<{ added: number; updated: number; linkedAgenciesCount: number; createdAgencies: string[] }> {
  const travelers = getTravelers();
  const companies = getMonitoredCompanies();
  let companiesModified = false;
  const createdAgencies: string[] = [];
  const touchedAgencyIds = new Set<string>();

  const idIndexMap = new Map<string, number>();
  const nameIndexMap = new Map<string, number>();
  travelers.forEach((t, idx) => {
    const idKey = t.idNumber ? normalizeArabic(String(t.idNumber)) : '';
    if (idKey && !idIndexMap.has(idKey)) idIndexMap.set(idKey, idx);
    const fullNameKey = normalizeArabic(`${t.firstName} ${t.secondName || ''} ${t.thirdName || ''} ${t.lastName || ''}`.trim());
    if (fullNameKey.length > 8 && !nameIndexMap.has(fullNameKey)) nameIndexMap.set(fullNameKey, idx);
  });

  const companyByNormName = new Map<string, MonitoredCompany>();
  companies.forEach(c => {
    const norm = normalizeArabic(c.companyName).toLowerCase();
    if (norm) companyByNormName.set(norm, c);
  });

  const resolveOrQueueAgency = (rawAgency?: string, centerOrGov?: string): MonitoredCompany | null => {
    if (!isMeaningfulAgencyName(rawAgency)) return null;
    const cleanedName = cleanArabicText(rawAgency!);
    const norm = normalizeArabic(cleanedName).toLowerCase();
    const existingComp = companyByNormName.get(norm);
    if (existingComp) {
      touchedAgencyIds.add(existingComp.id);
      return existingComp;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const gov = inferGovernorateFromCenter(centerOrGov) || 'صنعاء';
    const newComp: MonitoredCompany = {
      id: generateId(),
      licenseNumber: `وكالة-${today.slice(0, 4)}-${String(companies.length + 1).padStart(3, '0')}`,
      companyName: cleanedName,
      commercialRecord: `CR-AUTO-${Math.floor(100000 + Math.random() * 899999)}`,
      type: 'شركات ووكالات السفر والسياحة',
      ownerName: 'مقيد عبر كشوفات التأشيرات',
      supervisorName: 'إدارة الجوازات والوكالات',
      securityClearanceStatus: 'معتمد وساري',
      lastInspectionDate: today,
      violationsCount: 0,
      violationsLog: [],
      governorate: gov,
      address: centerOrGov ? `مركز / فرع ${cleanArabicText(centerOrGov)}` : 'الجمهورية اليمنية',
      phone: '',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    companies.unshift(newComp);
    companyByNormName.set(norm, newComp);
    companiesModified = true;
    createdAgencies.push(cleanedName);
    touchedAgencyIds.add(newComp.id);
    return newComp;
  };

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const newlyCreated: Traveler[] = [];
  const CHUNK_SIZE = 350;
  const total = incomingList.length;

  for (let i = 0; i < total; i++) {
    const item: Partial<Traveler> = { ...incomingList[i] };
    if (isMeaningfulAgencyName(item.agency)) {
      const linkedComp = resolveOrQueueAgency(item.agency, item.center || item.governorate);
      if (linkedComp) {
        item.agency = cleanArabicText(item.agency!);
        item.agencyId = linkedComp.id;
      }
    }

    const idKey = item.idNumber ? normalizeArabic(String(item.idNumber)) : '';
    const fullNameKey = normalizeArabic(`${item.firstName || ''} ${item.secondName || ''} ${item.thirdName || ''} ${item.lastName || ''}`.trim());

    let existingIdx = idKey && idIndexMap.has(idKey) ? idIndexMap.get(idKey)! : -1;
    if (existingIdx === -1 && fullNameKey.length > 8 && nameIndexMap.has(fullNameKey)) {
      existingIdx = nameIndexMap.get(fullNameKey)!;
    }

    if (existingIdx !== -1 && existingIdx < travelers.length) {
      const existing = travelers[existingIdx];
      const { merged } = smartMergeTraveler(existing, item, sourceLabel);
      travelers[existingIdx] = merged;
      updated++;
    } else {
      const created = buildNewTravelerRecord(item, now);
      newlyCreated.push(created);
      // Also prevent duplicates within the same huge imported CSV!
      if (idKey && !idIndexMap.has(idKey)) {
        // Track against duplicates inside the same batch only for ID lookup
      }
      added++;
    }

    if (i > 0 && i % CHUNK_SIZE === 0) {
      if (onProgress && total > 0) {
        onProgress(Math.round((i / total) * 100));
      }
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }

  const finalList = [...newlyCreated, ...travelers];
  saveTravelers(finalList);
  if (companiesModified) {
    saveMonitoredCompanies(companies);
  }
  onProgress?.(100);

  return {
    added,
    updated,
    linkedAgenciesCount: touchedAgencyIds.size,
    createdAgencies
  };
}

// 2. Seizures & Confiscated Passports (الوحدة 2)
export const getSeizures = (): PassportSeizure[] => {
  const data = kvGet('sovereign_seizures');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  // Initial seed
  const initial: PassportSeizure[] = [
    {
      id: 'sz-001',
      recordNumber: 'محضر-2026-0014',
      travelerName: 'طارق عبد الله محمد الشامي',
      passportNumber: '08492015',
      nationality: 'اليمن',
      seizurePort: 'منفذ الوديعة البري',
      seizureDate: '2026-11-01',
      officerInCharge: 'ضابط المناوبة بالمنفذ',
      reason: 'اشتباه تزوير في صفحة البيانات البيومترية وتبديل الصورة الشخصية',
      status: 'محال',
      referredTo: 'فرع استخبارات الشرطة',
      referralDate: '2026-11-02',
      referralNotes: 'رقم قيد أمني: 001/2026 - ملف تحقيق مركزي رقم 001',
      examinationResult: 'تزوير جزئي',
      notes: 'تم التحفظ على الوثيقة في الخزينة المركزية بالمنفذ.',
      createdAt: '2026-11-01T10:30:00.000Z',
      updatedAt: '2026-11-02T12:00:00.000Z'
    },
    {
      id: 'sz-002',
      recordNumber: 'محضر-2026-0015',
      travelerName: 'جون ديفيد كوبر',
      passportNumber: 'USA-4910284',
      nationality: 'الولايات المتحدة',
      seizurePort: 'مطار صنعاء الدولي',
      seizureDate: '2026-11-03',
      officerInCharge: 'ضابط المناوبة بالمنفذ',
      reason: 'انتهاء صلاحية التأشيرة والاشتباه في تزوير ختم الدخول',
      status: 'تم الفحص',
      examinationResult: 'سليم ومبرأ',
      notes: 'تمت مطابقة الختم مع سجل المنافذ وتبين صحته بعد التحري.',
      createdAt: '2026-11-03T08:15:00.000Z',
      updatedAt: '2026-11-04T14:20:00.000Z'
    }
  ];
  saveSeizures(initial);
  return initial;
};

export const saveSeizures = (seizures: PassportSeizure[]) => {
  kvSet('sovereign_seizures', JSON.stringify(seizures));
};

// 3. Undocumented Migrants (الوحدة 3)
export const getMigrants = (): UndocumentedMigrant[] => {
  const data = kvGet('sovereign_migrants');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: UndocumentedMigrant[] = [
    {
      id: 'mig-001',
      fileNumber: 'هجرة-2026-0089',
      fullName: 'أبيبي تيسفاي جبري',
      nationality: 'إثيوبيا',
      countryOfOrigin: 'إثيوبيا',
      infiltrationPoint: 'ساحل ذباب - باب المندب',
      apprehensionDate: '2026-11-02',
      apprehensionPlace: 'نقطة رأس العارة الساحلية',
      gender: 'ذكر',
      approximateAge: 24,
      medicalCheckStatus: 'سليم',
      medicalNotes: 'تم إعطاء اللقاحات الوقائية الأولية',
      fingerprintRegistered: true,
      shelterCenter: 'مركز إيواء المهاجرين - عمران',
      deportationStatus: 'جاهز للترحيل',
      createdAt: '2026-11-02T16:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z'
    },
    {
      id: 'mig-002',
      fileNumber: 'هجرة-2026-0090',
      fullName: 'فاطمة محمد جامع',
      nationality: 'الصومال',
      countryOfOrigin: 'الصومال',
      infiltrationPoint: 'ساحل أحور - أبين',
      apprehensionDate: '2026-11-04',
      apprehensionPlace: 'الخط الساحلي أحور',
      gender: 'أنثى',
      approximateAge: 21,
      medicalCheckStatus: 'اشتباه مرضي',
      medicalNotes: 'تحت العناية والعزل المؤقت في المستشفى الميداني',
      fingerprintRegistered: true,
      shelterCenter: 'مركز إيواء المهاجرين - المركز الرئيسي (صنعاء)',
      deportationStatus: 'قيد الإيواء والتحقيق',
      createdAt: '2026-11-04T11:30:00.000Z',
      updatedAt: '2026-11-05T09:00:00.000Z'
    }
  ];
  saveMigrants(initial);
  return initial;
};

export const saveMigrants = (migrants: UndocumentedMigrant[]) => {
  kvSet('sovereign_migrants', JSON.stringify(migrants));
};

// 5. Refugees & UNHCR Affairs (الوحدة 5)
export const getRefugees = (): RefugeeRecord[] => {
  const data = kvGet('sovereign_refugees');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: RefugeeRecord[] = [
    {
      id: 'ref-001',
      unhcrNumber: 'UNHCR-YEM-892014',
      temporaryPermitNumber: 'تصريح-لجوء-2026-012',
      fullName: 'محمود أحمد خليل رضوان',
      nationality: 'فلسطيني',
      arrivalDate: '2024-03-15',
      familyMembersCount: 4,
      securityVettingStatus: 'مبرأ ومطابق',
      vettingOfficer: 'ضابط شؤون اللاجئين والمباينة',
      permitStatus: 'ساري',
      permitExpiryDate: '2027-03-15',
      qrVerificationCode: 'REF:UNHCR-YEM-892014:MAHMOUD',
      residentialAddress: 'أمانة العاصمة - حي النهضة',
      phone: '771234567',
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-10T09:00:00.000Z'
    }
  ];
  saveRefugees(initial);
  return initial;
};

export const saveRefugees = (records: RefugeeRecord[]) => {
  kvSet('sovereign_refugees', JSON.stringify(records));
};

// 6. Foreigner Residents (الوحدة 6)
export const getForeigners = (): ForeignerResident[] => {
  const data = kvGet('sovereign_foreigners');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: ForeignerResident[] = [
    {
      id: 'for-001',
      residenceNumber: 'إقامة-2026-0341',
      fullName: 'راجيف كومار شارما',
      passportNumber: 'Z8941029',
      nationality: 'الهند',
      employer: 'المستشفى السعودي الألماني - صنعاء',
      profession: 'أخصائي تخدير ورعاية مركزة',
      entryDate: '2025-01-12',
      entryPort: 'مطار صنعاء الدولي',
      residenceExpiryDate: '2027-01-12',
      medicalExamResult: 'لائق طبياً',
      reEntryVisaStatus: 'سارية',
      securityClearanceStatus: 'معتمد',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z'
    }
  ];
  saveForeigners(initial);
  return initial;
};

export const saveForeigners = (foreigners: ForeignerResident[]) => {
  kvSet('sovereign_foreigners', JSON.stringify(foreigners));
};

// 7. Internal Movement Permits (الوحدة 7)
export const getMovementPermits = (): InternalMovementPermit[] => {
  const data = kvGet('sovereign_permits');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: InternalMovementPermit[] = [
    {
      id: 'pm-001',
      permitCode: 'تصريح-أمني-2026-0045',
      delegationName: 'بعثة منظمة الصحة العالمية (WHO)',
      organizationType: 'منظمة أمم متحدة (UN)',
      authorizedRoute: 'صنعاء -> ذمار -> إب -> تعز',
      allowedCheckpoints: ['نقطة يسلح', 'نقطة مفرق ذمار', 'نقطة نجد الأحمر', 'نقطة الحوبان'],
      vehicleDetails: [
        { plate: 'أمم متحدة 104', model: 'Toyota Land Cruiser', color: 'أبيض' },
        { plate: 'أمم متحدة 108', model: 'Toyota Hilux', color: 'أبيض' }
      ],
      delegationHead: 'د. بيتر فان هوف',
      passportNumber: 'NLD-7782103',
      passengersCount: 6,
      securityEscortNeeded: true,
      escortTeamLeader: 'الملازم/ مجلي الصباحي',
      validFrom: '2026-11-06',
      validTo: '2026-11-12',
      accommodationPlace: 'فندق تاج سبأ - صنعاء / مقر البعثة إب',
      qrVerificationCode: 'PERMIT:2026-0045:WHO:PASS-VALID',
      approvalStatus: 'معتمد رسمياً',
      approvedBy: 'العميد/ عبد الكريم المروني (مدير العمليات)',
      createdAt: '2026-11-05T14:00:00.000Z',
      updatedAt: '2026-11-05T14:00:00.000Z'
    }
  ];
  saveMovementPermits(initial);
  return initial;
};

export const saveMovementPermits = (permits: InternalMovementPermit[]) => {
  kvSet('sovereign_permits', JSON.stringify(permits));
};

// 9 & 10. Citizenship & Special Travel Documents (الوحدة 9 & 10)
export const getCitizenshipCases = (): CitizenshipAndLegalCase[] => {
  const data = kvGet('sovereign_citizenship_cases');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: CitizenshipAndLegalCase[] = [
    {
      id: 'cit-001',
      caseNumber: 'معاملة-2026-0104',
      serviceType: 'زواج يمني من أجنبية',
      applicantName: 'هشام عبد الجبار القاضي',
      applicantIdOrPassport: '0102049182',
      applicantNationality: 'اليمن',
      spouseOrBeneficiaryName: 'نادية يوسف المنصوري',
      spouseNationality: 'المغرب',
      submissionDate: '2026-10-25',
      targetCompletionDate: '2026-11-14',
      targetDaysSla: 20,
      status: 'قيد التحري والاستخبارات',
      investigatingOfficer: 'العقيد/ ناصر الوادعي',
      intelligenceRefNumber: '001/استخبارات/2026',
      notes: 'تمت إحالة الطلب لفرع استخبارات الشرطة لإبداء الرأي الأمني خلال 3 أيام.',
      createdAt: '2026-10-25T09:00:00.000Z',
      updatedAt: '2026-10-28T11:00:00.000Z'
    },
    {
      id: 'cit-002',
      caseNumber: 'معاملة-2026-0105',
      serviceType: 'جوازات سفر أبناء اليمنيات',
      applicantName: 'مريم سعيد عبده مصلح (الأم اليمنية)',
      applicantIdOrPassport: '0201948271',
      applicantNationality: 'اليمن',
      spouseOrBeneficiaryName: 'خالد عمر فاروق (الابن المستفيد)',
      spouseNationality: 'السودان',
      submissionDate: '2026-11-04',
      targetCompletionDate: '2026-11-07',
      targetDaysSla: 3,
      status: 'معتمد ومصدر',
      investigatingOfficer: 'ضابط الفحص والمباينة',
      notes: 'تم استيفاء الشروط القانونية وإصدار جواز السفر وفق دليل الـ 3 أيام.',
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-06T08:30:00.000Z'
    }
  ];
  saveCitizenshipCases(initial);
  return initial;
};

export const saveCitizenshipCases = (cases: CitizenshipAndLegalCase[]) => {
  kvSet('sovereign_citizenship_cases', JSON.stringify(cases));
};

// 11. Monitored Companies (الوحدة 11)
export const getMonitoredCompanies = (): MonitoredCompany[] => {
  const data = kvGet('sovereign_companies');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: MonitoredCompany[] = [
    {
      id: 'comp-001',
      licenseNumber: 'ترخيص-أمني-2026-021',
      companyName: 'شركة البراق لتفويج الحج والعمرة والرحلات الدولية',
      commercialRecord: 'CR-1049281',
      type: 'شركات الحج والعمرة',
      ownerName: 'الحاج/ عبد السلام الوجيه',
      supervisorName: 'فؤاد عبد السلام الوجيه',
      securityClearanceStatus: 'معتمد وساري',
      lastInspectionDate: '2026-10-20',
      violationsCount: 0,
      violationsLog: [],
      governorate: 'صنعاء',
      address: 'شارع الزبيري - برج النور',
      phone: '01234567',
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z'
    },
    {
      id: 'comp-002',
      licenseNumber: 'ترخيص-أمني-2026-088',
      companyName: 'منشأة النجم الصاعد للصرافة والتحويلات المالية',
      commercialRecord: 'CR-8920145',
      type: 'شركات ومحلات الصرافة والتحويلات',
      ownerName: 'محسن قاسم الذيباني',
      supervisorName: 'أكرم محسن الذيباني',
      securityClearanceStatus: 'إيقاف مؤقت',
      lastInspectionDate: '2026-11-01',
      violationsCount: 2,
      violationsLog: [
        {
          date: '2026-11-01',
          description: 'تنفيذ حوالات خارجية لمشتبهين دون إشعار المباينة الأمنية',
          penalty: 'إيقاف النشاط مؤقتاً لمدة 15 يوماً وإحالة لفرع الاستخبارات',
          officer: 'ضابط التفتيش والرقابة'
        }
      ],
      governorate: 'صنعاء',
      address: 'شارع الزبيري - صنعاء',
      phone: '01289123',
      createdAt: '2026-03-10T09:00:00.000Z',
      updatedAt: '2026-11-01T15:00:00.000Z'
    }
  ];
  saveMonitoredCompanies(initial);
  return initial;
};

export const saveMonitoredCompanies = (companies: MonitoredCompany[]) => {
  kvSet('sovereign_companies', JSON.stringify(companies));
};

/**
 * البحث عن وكالة سفر بالاسم أو إنشاؤها تلقائياً ضمن سجل شركات ووكالات السفر والسياحة
 */
export function findOrCreateTravelAgency(agencyName: string, centerOrGov?: string): MonitoredCompany | null {
  if (!isMeaningfulAgencyName(agencyName)) return null;
  const cleanedName = cleanArabicText(agencyName);
  const normTarget = normalizeArabic(cleanedName).toLowerCase();
  const companies = getMonitoredCompanies();

  const existing = companies.find(c => normalizeArabic(c.companyName).toLowerCase() === normTarget);
  if (existing) return existing;

  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();
  const gov = inferGovernorateFromCenter(centerOrGov) || 'صنعاء';
  const newCompany: MonitoredCompany = {
    id: generateId(),
    licenseNumber: `وكالة-${today.slice(0, 4)}-${String(companies.length + 1).padStart(3, '0')}`,
    companyName: cleanedName,
    commercialRecord: `CR-AUTO-${Math.floor(100000 + Math.random() * 899999)}`,
    type: 'شركات ووكالات السفر والسياحة',
    ownerName: 'مقيد عبر كشوفات التأشيرات',
    supervisorName: 'إدارة الجوازات والوكالات',
    securityClearanceStatus: 'معتمد وساري',
    lastInspectionDate: today,
    violationsCount: 0,
    violationsLog: [],
    governorate: gov,
    address: centerOrGov ? `مركز / فرع ${cleanArabicText(centerOrGov)}` : 'الجمهورية اليمنية',
    phone: '',
    createdAt: nowIso,
    updatedAt: nowIso
  };
  saveMonitoredCompanies([newCompany, ...companies]);
  return newCompany;
}

export interface AgencyVisaStats {
  totalVisas: number;
  issuedCount: number; // مؤشر
  returnedCount: number; // مرتجع
  otherCount: number;
  centers: string[];
  visaTypes: Record<string, number>;
  topReturnReasons: { reason: string; count: number }[];
  lastExitDate?: string;
  visas: Traveler[];
}

/**
 * احتساب إحصائيات وملف التأشيرات المرتبطة بوكالة سفر محددة
 */
export function getAgencyVisaStats(company: MonitoredCompany, travelersList?: Traveler[]): AgencyVisaStats {
  const list = travelersList || getTravelers();
  const normCompany = normalizeArabic(company.companyName).toLowerCase();

  const visas = list.filter(t => {
    if (t.agencyId && t.agencyId === company.id) return true;
    const tAgencyNorm = normalizeArabic(t.agency || '').toLowerCase();
    return Boolean(tAgencyNorm && tAgencyNorm === normCompany);
  });

  let issuedCount = 0;
  let returnedCount = 0;
  let otherCount = 0;
  let lastExitDate = '';
  const centerSet = new Set<string>();
  const visaTypes: Record<string, number> = {};
  const reasonMap = new Map<string, number>();

  visas.forEach(t => {
    const cleanStat = normalizeArabic(t.status || '');
    if (cleanStat.includes('مؤشر')) {
      issuedCount++;
    } else if (cleanStat.includes('مرتجع')) {
      returnedCount++;
    } else {
      otherCount++;
    }

    const exitD = (t.exitDate || t.receiveDate || '').trim();
    if (exitD && exitD > lastExitDate) {
      lastExitDate = exitD;
    }

    const c = cleanArabicText(t.center || '');
    if (c) centerSet.add(c);

    const vType = cleanArabicText(t.visaType || t.visitReason || '');
    if (vType) {
      visaTypes[vType] = (visaTypes[vType] || 0) + 1;
    }

    const rr = cleanArabicText(t.returnReason || '');
    if (rr) {
      reasonMap.set(rr, (reasonMap.get(rr) || 0) + 1);
    }
  });

  const topReturnReasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalVisas: visas.length,
    issuedCount,
    returnedCount,
    otherCount,
    centers: Array.from(centerSet),
    visaTypes,
    topReturnReasons,
    lastExitDate: lastExitDate || undefined,
    visas
  };
}

/**
 * مزامنة شاملة بين كشوفات التأشيرات وسجل وكالات ومكاتب السفر
 */
export function syncTravelAgenciesWithVisas(): { linkedRecords: number; createdAgencies: string[] } {
  const travelers = getTravelers();
  const companies = getMonitoredCompanies();
  const companyMap = new Map<string, MonitoredCompany>();
  companies.forEach(c => {
    const key = normalizeArabic(c.companyName).toLowerCase();
    if (key) companyMap.set(key, c);
  });

  let linkedRecords = 0;
  let companiesChanged = false;
  let travelersChanged = false;
  const createdAgencies: string[] = [];
  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  travelers.forEach(t => {
    if (!isMeaningfulAgencyName(t.agency)) return;
    const cleanedAgency = cleanArabicText(t.agency!);
    const normAgency = normalizeArabic(cleanedAgency).toLowerCase();
    let comp = companyMap.get(normAgency);

    if (!comp) {
      const gov = inferGovernorateFromCenter(t.center || t.governorate) || 'صنعاء';
      comp = {
        id: generateId(),
        licenseNumber: `وكالة-${today.slice(0, 4)}-${String(companies.length + 1).padStart(3, '0')}`,
        companyName: cleanedAgency,
        commercialRecord: `CR-AUTO-${Math.floor(100000 + Math.random() * 899999)}`,
        type: 'شركات ووكالات السفر والسياحة',
        ownerName: 'مقيد عبر كشوفات التأشيرات',
        supervisorName: 'إدارة الجوازات والوكالات',
        securityClearanceStatus: 'معتمد وساري',
        lastInspectionDate: today,
        violationsCount: 0,
        violationsLog: [],
        governorate: gov,
        address: t.center ? `مركز / فرع ${cleanArabicText(t.center)}` : 'الجمهورية اليمنية',
        phone: '',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      companies.unshift(comp);
      companyMap.set(normAgency, comp);
      companiesChanged = true;
      createdAgencies.push(cleanedAgency);
    }

    if (t.agencyId !== comp.id || t.agency !== cleanedAgency) {
      t.agencyId = comp.id;
      t.agency = cleanedAgency;
      travelersChanged = true;
      linkedRecords++;
    }
  });

  if (companiesChanged) saveMonitoredCompanies(companies);
  if (travelersChanged) saveTravelers(travelers);
  if (linkedRecords > 0 || createdAgencies.length > 0) {
    addAuditLog(
      'تعديل',
      'الرقابة على الشركات',
      `مزامنة وربط وكالات السفر بالتأشيرات: ربط ${linkedRecords} سجل وإدراج ${createdAgencies.length} وكالة جديدة`
    );
  }

  return { linkedRecords, createdAgencies };
}

// 12. Official Correspondence (الوحدة 12)
export const getCorrespondence = (): OfficialCorrespondence[] => {
  const data = kvGet('sovereign_correspondence');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: OfficialCorrespondence[] = [
    {
      id: 'corr-001',
      incomingOutgoingNumber: 'ص-2026-0042',
      letterType: 'طلب تحري أمني',
      gregorianDate: '2026-11-06',
      hijriDate: '26 جمادى الأولى 1448هـ',
      senderEntity: 'مصلحة الهجرة والجوازات والجنسية - إدارة المنافذ والرقابة الحدودية',
      recipientEntity: 'الأخ/ مدير فرع استخبارات الشرطة المحترم',
      referenceText: 'عطفاً على مذكرة منفذ الوديعة البري رقم (109) بتاريخ 2026/11/01م',
      subject: 'طلب التحري الأمني الجنائي بشأن المشتبه به (طارق عبد الله محمد الشامي)',
      introClause: 'نفيدكم علماً بأنه تم ضبط المسافر الموضح بياناته بعاليه أثناء محاولته العبور بجواز سفر يحمل اشتباه تزوير في بيانات الصفحة المقروءة آلياً.',
      actionRequired: 'وعليه: نرجو التكرم بالتوجيه بالتحري الجنائي العاجل وموافاتنا برأيكم الأمني وفق خطة الاستجابة (SLA الاستخباراتي المحدد بـ 3 أيام) للإحالة إلى النيابة العامة.',
      closingClause: 'وتقبلوا خالص التحية والتقدير،،،',
      signatoryTitle: 'مدير عام المنافذ والرقابة الحدودية',
      signatoryName: 'مدير عام المنافذ والرقابة الحدودية',
      isUrgent: true,
      status: 'معتمد ومرسل',
      createdAt: '2026-11-06T09:30:00.000Z',
      updatedAt: '2026-11-06T09:30:00.000Z'
    }
  ];
  saveCorrespondence(initial);
  return initial;
};

export const saveCorrespondence = (letters: OfficialCorrespondence[]) => {
  kvSet('sovereign_correspondence', JSON.stringify(letters));
};

// 13. Audit Log (الوحدة 13 - سجل العمليات الرقابي السيادي)
export const getAuditLogs = (): AuditLogEntity[] => {
  const data = kvGet('sovereign_audit_logs');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: AuditLogEntity[] = [
    {
      id: 'log-001',
      timestamp: new Date().toISOString(),
      officerUsername: 'admin',
      officerName: 'ضابط العمليات المركزية',
      officerRole: 'مدير عام',
      portOrDepartment: 'غرفة العمليات المركزية - المركز الرئيسي (صنعاء)',
      action: 'إنشاء',
      targetModule: 'المضبوطات والجوازات',
      targetRecordId: 'sz-001',
      details: 'قيد محضر ضبط جواز مشتبه تزوير رقم 08492015 في منفذ الوديعة البري',
      ipAddress: '127.0.0.1 (محلي)',
      deviceInfo: 'محطة العمل السيادية - ويندوز'
    }
  ];
  saveAuditLogs(initial);
  return initial;
};

export const saveAuditLogs = (logs: AuditLogEntity[]) => {
  kvSet('sovereign_audit_logs', JSON.stringify(logs));
};

export const addAuditLog = (
  action: AuditLogEntity['action'],
  targetModule: AuditLogEntity['targetModule'],
  details: string,
  targetRecordId?: string
) => {
  const user = getCurrentUser();
  const currentLogs = getAuditLogs();
  const newEntry: AuditLogEntity = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    officerUsername: user?.username || 'system',
    officerName: user?.name || 'مستخدم النظام',
    officerRole: user?.role || 'مدير عام',
    portOrDepartment: user?.portOrDepartment || 'المنفذ المركزي',
    action,
    targetModule,
    targetRecordId,
    details,
    ipAddress: '127.0.0.1 (محلي)',
    deviceInfo: navigator.userAgent.slice(0, 45)
  };
  saveAuditLogs([newEntry, ...currentLogs].slice(0, 500)); // retain last 500
};

// 14. Developer System Settings (الوحدة 14)
export const getDeveloperSettings = (): DeveloperSystemSettings => {
  const data = kvGet('sovereign_dev_settings');
  if (data) {
    try { return JSON.parse(data); } catch { /* ignore */ }
  }
  const initial: DeveloperSystemSettings = {
    autoFieldRules: {
      seizurePrefix: 'محضر-YYYY-NNNN',
      migrantPrefix: 'هجرة-YYYY-NNNN',
      permitPrefix: 'تصريح-أمني-YYYY-NNNN',
      correspondencePrefix: 'ص-YYYY-NNNN'
    },
    customFields: [],
    customDropdownOptions: {},
    printHeaders: {
      republicTitle: 'الجمهورية اليمنية',
      ministryTitle: 'وزارة الداخلية',
      departmentTitle: 'مصلحة الهجرة والجوازات والجنسية'
    }
  };
  saveDeveloperSettings(initial);
  return initial;
};

export const saveDeveloperSettings = (settings: DeveloperSystemSettings) => {
  kvSet('sovereign_dev_settings', JSON.stringify(settings));
};

// Existing core storage items
const REPORT_2670_SEED_FLAG = 'sovereign_seeded_report_2670_v1';

export const getReports = (): Report[] => {
  const data = kvGet('reports');
  let list: Report[] = [];
  if (data) {
    try {
      list = JSON.parse(data);
    } catch {
      list = [];
    }
  }

  if (!kvGet(REPORT_2670_SEED_FLAG)) {
    const alreadyExists = list.some(
      r => r.autoNumber === '2670' || r.id === 'rep-intel-2670' || (r.title || '').includes('طلب السماح بالعبور من صنعاء الى عدن')
    );
    if (!alreadyExists) {
      const report2670: Report = {
        id: 'rep-intel-2670',
        autoNumber: '2670',
        reportDate: '2026-11-08',
        sendingAuthority: 'فرع استخبارات الشرطة - أمانة العاصمة / شعبة النقل',
        subject: 'طلب اذن السماح للتنسيق',
        type: 'إداري',
        priority: 'عادي',
        status: 'جديد',
        title: 'طلب السماح بالعبور من صنعاء الى عدن (1403 جواز - الدفعة 19)',
        description:
          'تبلغنا من رئيس شعبة النقل والمنافذ عن وصول مذكرة من مكتب الوسيط الناقل لخدمات النقل بطلب السماح بالعبور لعدد (647) جواز، وكذلك مذكرة من شركة تسهيل اليمن بطلب السماح بالعبور لعدد (756) جواز، إجمالي عدد الجوازات (1403) جواز - الدفعة التاسعة عشر لعام 2026م - سفر متجه من العاصمة صنعاء إلى محافظة عدن المحتلة. سيتم نقل الجوازات بواسطة السائق / احمد محمد عبدالله العمري والمرافق / عبدالرحمن عبدالله احمد ناجي على متن سيارة (باجيرو موديل 2000 لون رصاصي رقم اللوحة 7846 / 14 خصوصي) لذا يتم تسهيل عبوره. (مرفق مذكرات الطلب).',
        actionsTaken: 'تم الرفع به للاطلاع والتوجيه',
        transportDetails: {
          batchName: 'الدفعة التاسعة عشر لعام 2026م',
          totalPassports: 1403,
          agencies: [
            { name: 'مكتب الوسيط الناقل لخدمات النقل', count: 647 },
            { name: 'شركة تسهيل اليمن', count: 756 }
          ],
          route: 'العاصمة صنعاء -> محافظة عدن',
          driverName: 'احمد محمد عبدالله العمري',
          escortName: 'عبدالرحمن عبدالله احمد ناجي',
          vehicleDesc: 'باجيرو موديل 2000 لون رصاصي',
          plateNumber: '7846 / 14 خصوصي'
        },
        createdAt: '2026-11-08T08:00:00.000Z',
        updatedAt: '2026-11-08T08:00:00.000Z'
      };
      list = [report2670, ...list];
      kvSet('reports', JSON.stringify(list));
    }
    kvSet(REPORT_2670_SEED_FLAG, '1');
  }

  return list;
};

export const saveReports = (reports: Report[]) => {
  kvSet('reports', JSON.stringify(reports));
};

export const getMovements = (): Movement[] => {
  const data = kvGet('movements');
  return data ? JSON.parse(data) : [];
};

export const saveMovements = (movements: Movement[]) => {
  kvSet('movements', JSON.stringify(movements));
};

export const getCurrentUser = (): User | null => {
  const data = kvGet('currentUser');
  if (!data) {
    // Default logged in user with Super Admin role
    const defaultUser: User = {
      id: 'usr-1',
      username: 'admin',
      role: 'مدير عام',
      name: kvGet('config_default_officer') || 'مدير العمليات المركزية',
      portOrDepartment: 'غرفة العمليات المركزية والسيطرة - المركز الرئيسي (صنعاء)'
    };
    kvSet('currentUser', JSON.stringify(defaultUser));
    return defaultUser;
  }
  try {
    const parsed: User = JSON.parse(data);
    // Sanitize any leftover old fake name
    if (parsed.name && (parsed.name.includes('الصرابي') || parsed.name.includes('مسعد'))) {
      parsed.name = kvGet('config_default_officer') || 'مدير العمليات المركزية';
      parsed.portOrDepartment = 'غرفة العمليات المركزية والسيطرة - المركز الرئيسي (صنعاء)';
      kvSet('currentUser', JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return null;
  }
};

export const setCurrentUser = (user: User | null) => {
  if (user) {
    kvSet('currentUser', JSON.stringify(user));
  } else {
    kvRemove('currentUser');
  }
};

// 15. وحدة مذكرات وتأشيرات وزارة الخارجية والمنظمات والرحلات الدولية
export const getMofaRequests = (): MofaVisaRequest[] => {
  const data = kvGet('mofa_visa_requests');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      /* ignore */
    }
  }

  const now = new Date().toISOString();
  const initial: MofaVisaRequest[] = [
    {
      id: 'mofa-001',
      memoNumber: 'و-2301 / 26-10-2026',
      memoDate: '2026-10-26',
      hijriDate: '1448/05/06 هـ',
      organization: 'منظمة أطباء بلا حدود الفرنسية (MSF France)',
      organizationType: 'منظمة دولية (INGO)',
      requestType: 'طلب تأشيرة دخول',
      beneficiaries: [
        {
          id: 'ben-001',
          fullName: 'ليدا لوريلا سيربو',
          fullNameEn: 'Leda Laurilla Serbo',
          passportNumber: 'P2470930D',
          passportType: 'عادي',
          nationality: 'فلبين',
          gender: 'أنثى',
          birthDate: '1978-09-07',
          profession: 'المدير الإداري للمشروع - مشروع المخا الطبي',
          missionDuration: '04 أشهر',
          startDate: '2026-10-22',
          endDate: '2027-02-22',
          workLocation: 'المخا - الساحل الغربي',
          contractDetails: 'عقد تطوع طبي إنساني - منظمة أطباء بلا حدود الفرنسية',
          educationDetails: 'بكالوريوس علوم المحاسبة والمالية (BSA) - كلية سان بيدرو'
        }
      ],
      mofaDirective: 'للاطلاع وعمل اللازم وفق النظام والقانون والترتيبات والموافقة الأمنية والتنسيق مع وزارة الصحة العامة والسكان',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      securityNotes: 'تم التدقيق الأمني ومطابقة وثيقة السفر والشهادات الجامعية وشهادة الخبرة الإدارية',
      sourceFileName: '5200001_98dcedc1.pdf',
      attachedDocuments: ['مذكرة وزارة الخارجية', 'خطاب منظمة MSF', 'صورة جواز السفر', 'أمر المهمة', 'عقد العمل', 'السيرة الذاتية', 'الشهادة الجامعية'],
      additionalInfo: 'تأشيرة دخول لغرض العمل الطبي الإنساني في مشروع المخا بموجب توجيه نائب وزير الخارجية والمغتربين',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'mofa-002',
      memoNumber: '40/50/13',
      memoDate: '2026-10-25',
      hijriDate: '1448/04/14 هـ',
      organization: 'مكتب الاتحاد الأوروبي للمساعدات الإنسانية والحماية المدنية (ECHO)',
      organizationType: 'بعثة دبلوماسية',
      requestType: 'طلب تأشيرة دخول',
      beneficiaries: [
        {
          id: 'ben-002',
          fullName: 'هانس رينيه أ. داس',
          fullNameEn: 'Hans Rene A. Das',
          passportNumber: 'S920808',
          passportType: 'جواز مرور الاتحاد الأوروبي (EU LP)',
          nationality: 'بلجيكا',
          gender: 'ذكر',
          birthDate: '1971-02-13',
          profession: 'نائب المدير العام والمدير التنفيذي للبرامج والحماية المدنية',
          missionDuration: '30 يوماً',
          startDate: '2026-10-25',
          endDate: '2026-11-25',
          workLocation: 'صنعاء - المقر الإقليمي للاتحاد الأوروبي',
          contractDetails: 'مذكرة رسمية رقم 012-2026 من المفوضية الأوروبية ببروكسل',
          educationDetails: 'دكتوراه في القانون الدولي - جامعة لوفان الكاثوليكية'
        },
        {
          id: 'ben-003',
          fullName: 'فريدريكا فان دي فين',
          fullNameEn: 'Frederika Van de Ven',
          passportNumber: 'S922537',
          passportType: 'جواز مرور الاتحاد الأوروبي (EU LP)',
          nationality: 'هولندا',
          gender: 'أنثى',
          birthDate: '1992-11-30',
          profession: 'مساعدة المدير التنفيذي ومسؤولة سياسات الشرق الأوسط',
          missionDuration: '30 يوماً',
          startDate: '2026-10-25',
          endDate: '2026-11-25',
          workLocation: 'صنعاء',
          contractDetails: 'وفد رسمي لمتابعة برامج المساعدات الإنسانية إيكو',
          educationDetails: 'ماجستير علاقات دولية والعمل الإنساني الدولي'
        }
      ],
      mofaDirective: 'للتكرم بالاطلاع والإفادة - مذكرة دائرة المراسم وإدارة الجوازات وقسم الإقامات بوزارة الخارجية موجهة لوكيل وزارة الداخلية',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      securityNotes: 'جوازات مرور رسمية صادرة من المفوضية الأوروبية (Laissez-Passer) معتمدة للزيارة الرسمية',
      sourceFileName: 'Ca________r_27_-10_-2026_11.48_ab965a62.pdf',
      attachedDocuments: ['مذكرة وزارة الخارجية', 'المذكرة الشفهية لإيكو', 'استمارات طلب التأشيرة', 'صورة وثيقة المرور الأوروبية', 'السيرة الذاتية الرسمية'],
      additionalInfo: 'وفد رفيع المستوى من المفوضية الأوروبية ببروكسل لتفقد الوضع الإنساني',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'mofa-003',
      memoNumber: 'و-232 / 27-09-2026',
      memoDate: '2026-09-27',
      hijriDate: '1448/03/16 هـ',
      organization: 'منظمة أطباء بلا حدود السويسرية (MSF Switzerland)',
      organizationType: 'منظمة دولية (INGO)',
      requestType: 'طلب تأشيرة دخول',
      beneficiaries: [
        {
          id: 'ben-004',
          fullName: 'صادق أولورنشولا أونوندي',
          fullNameEn: 'Sadiq Olorunshola Onundi',
          passportNumber: 'B51650407',
          passportType: 'عادي',
          nationality: 'نيجيريا',
          gender: 'ذكر',
          birthDate: '1994-10-21',
          profession: 'نائب رئيس البعثة - مكتب صنعاء بدلاً عن جاكتون نيومو',
          missionDuration: '03 أشهر',
          startDate: '2026-11-18',
          endDate: '2027-02-17',
          workLocation: 'مكتب صنعاء والمشاريع الطبية الميدانية',
          contractDetails: 'عقد عمل دولي وإدارة مشاريع الطوارئ الطبية',
          educationDetails: 'بكالوريوس هندسة الحاسوب ودورات إدارة حوادث الميدان'
        }
      ],
      mofaDirective: 'للتنسيق مع وزارة الصحة العامة والإفادة بالرأي بالموافقة أو الرفض وتسهيل الإجراءات عبر مطار صنعاء الدولي',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      securityNotes: 'تم فحص القيود الأمنية والتأكد من بيانات السفر والمهمة الطبية السويسرية',
      sourceFileName: '____________________44a660b9.pdf',
      attachedDocuments: ['مذكرة وزارة الخارجية رقم 6050', 'خطاب البعثة السويسرية', 'صورة الجواز النيجيري', 'أمر المهمة', 'عقد العمل', 'السيرة الذاتية المعتمدة'],
      additionalInfo: 'نائب رئيس البعثة بمكتب أطباء بلا حدود السويسرية بصنعاء',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'mofa-004',
      memoNumber: 'FLIGHT-MSF1-261026',
      memoDate: '2026-10-26',
      organization: 'منظمة أطباء بلا حدود - قطاع الطيران الإنساني',
      organizationType: 'منظمة دولية (INGO)',
      requestType: 'مانيفست رحلة طيران',
      beneficiaries: [
        {
          id: 'pax-01',
          fullName: 'ليدا سيربو',
          fullNameEn: 'Leda Serbo',
          passportNumber: 'P2470930D',
          passportType: 'عادي',
          nationality: 'فلبين',
          profession: 'Project FIN/HR Manager (MSFB)',
          workLocation: 'المخا / عدن'
        },
        {
          id: 'pax-02',
          fullName: 'إكرام ياسمين مكيديش',
          fullNameEn: 'Ikram Yassamine Mekidiche',
          passportNumber: '313361403',
          passportType: 'عادي',
          nationality: 'الجزائر',
          profession: 'Field Communication Manager (MSFB)',
          workLocation: 'صنعاء / عدن'
        },
        {
          id: 'pax-03',
          fullName: 'تانكريدي أندريه ساردو إنفيري',
          fullNameEn: 'Tancredi Andre Sardo Infirri',
          passportNumber: 'YB7383885',
          passportType: 'عادي',
          nationality: 'إيطاليا',
          profession: 'Logistics Team Leader (MSFB)',
          workLocation: 'صنعاء'
        },
        {
          id: 'pax-04',
          fullName: 'ريمي كارييه',
          fullNameEn: 'Remi Carrier',
          passportNumber: '25FI17005',
          passportType: 'عادي',
          nationality: 'فرنسا',
          profession: 'Emergency Coordinator (MSFB)',
          workLocation: 'صنعاء'
        },
        {
          id: 'pax-05',
          fullName: 'حسين شيخ إسماعيل',
          fullNameEn: 'Hussein Sheikh Ismail',
          passportNumber: 'CK186195',
          passportType: 'عادي',
          nationality: 'كينيا',
          profession: 'Project Coordinator (MSFCH)',
          workLocation: 'صنعاء'
        }
      ],
      flightDetails: {
        aircraftType: 'BEECH-1900D-3BNBZ',
        callSign: 'MSF1',
        flightDate: '2026-10-26',
        route: '(1) جيبوتي JIB -> (2) عدن ADE -> (3) صنعاء SAH -> (4) جيبوتي JIB',
        totalPassengers: 19
      },
      mofaDirective: 'تسهيل عبور طاقم الإغاثة الطبية وتدقيق ركاب الرحلة عبر صالة المنظمات بمطاري عدن وصنعاء',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      sourceFileName: 'Final_MANIFEST_V1_-_MSF1_261026_1_2bbe284f.pdf',
      attachedDocuments: ['جدول ركاب الطائرة (Manifest)', 'خطة مسار الرحلة الجوية'],
      additionalInfo: 'رحلة جوية منتظمة للكوادر والفرق الجراحية لأطباء بلا حدود بين جيبوتي وعدن وصنعاء',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'mofa-005',
      memoNumber: 'إرسالية-أجياد-457',
      memoDate: '2026-10-17',
      organization: 'مجموعة أجياد لتنمية الخدمات السياحية وخدمات الحج والعمرة',
      organizationType: 'شركة نقل وسفريات',
      requestType: 'إرسالية نقل جوازات',
      beneficiaries: [
        {
          id: 'disp-01',
          fullName: 'حسين علي محمد حيدر الحامد',
          passportNumber: '16757142',
          passportType: 'عادي',
          nationality: 'اليمن',
          profession: 'تأشيرة عمل (رقم المعاملة: 750)',
          workLocation: 'الحديدة'
        },
        {
          id: 'disp-02',
          fullName: 'رنا عبدالناصر حسان صالح حسن',
          passportNumber: '15176254',
          passportType: 'عادي',
          nationality: 'اليمن',
          profession: 'زيارة عائلية (رقم المعاملة: 993)',
          workLocation: 'الحديدة'
        },
        {
          id: 'disp-03',
          fullName: 'حسن سالم حسين شعبين',
          passportNumber: '14651962',
          passportType: 'عادي',
          nationality: 'اليمن',
          profession: 'تأشيرة عمل (رقم المعاملة: 1008)',
          workLocation: 'الحديدة'
        }
      ],
      dispatchDetails: {
        companyName: 'مجموعة أجياد للخدمات السياحية',
        driverName: 'فياض سعيد إبراهيم الحيدري (مندوب الفرع: شفيع عزعزي)',
        carPlate: '6/20511 (باص بلكة أبيض)',
        carModel: 'شاحنة نقل / باص ركاب نقل جوازات',
        passportsCount: 179,
        destinationBranch: 'فرع الحديدة (منقولة من فرع عدن)'
      },
      mofaDirective: 'تسهيل مرور سيارة نقل الجوازات والوثائق عبر النقاط الأمنية بين المحافظات بموجب التصريح الرسمي',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      sourceFileName: '457________ae45b4e2.pdf',
      attachedDocuments: ['كشف إرسالية نقل الجوازات (179 جواز)', 'مذكرة تسهيل المرور الرسمية'],
      additionalInfo: 'كشف شحنة جوازات سفر العمالة والزيارات العائلية الواصلة من السفارة السعودية',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'mofa-006',
      memoNumber: 'إقامة-A-29-2026',
      memoDate: '2026-01-04',
      organization: 'مكتب المبعوث الخاص للأمين العام للأمم المتحدة (OSESGY)',
      organizationType: 'وكالة أمم متحدة (UN)',
      requestType: 'منح إقامة',
      beneficiaries: [
        {
          id: 'ben-005',
          fullName: 'فادي معماري',
          passportNumber: 'SUNB92327',
          passportType: 'دبلوماسي',
          nationality: 'لبنان / أمم متحدة',
          profession: 'ضابط أمن وحماية البعثة الدبلوماسية',
          missionDuration: 'سنة كاملة',
          startDate: '2026-01-04',
          endDate: '2027-01-03',
          workLocation: 'صنعاء وعدن - مقرات الأمم المتحدة'
        }
      ],
      mofaDirective: 'منح وتجديد الإقامة الخاصة والدبلوماسية صالحة لعدة سفرات - دائرة المراسم بوزارة الخارجية',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      sourceFileName: '29_OCT_2026_Residencies___Visas__1__dddfaf7e.pdf',
      attachedDocuments: ['ختم الإقامة الدبلوماسية الرسمية A-29-2026', 'وثيقة الأمم المتحدة'],
      additionalInfo: 'إقامة دبلوماسية صالحة لعدة سفرات صادرة عن وزارة الخارجية اليمنية',
      createdAt: now,
      updatedAt: now
    }
  ];

  saveMofaRequests(initial);
  return initial;
};

export const saveMofaRequests = (requests: MofaVisaRequest[]) => {
  kvSet('mofa_visa_requests', JSON.stringify(requests));
};

export const addMofaRequest = (request: MofaVisaRequest) => {
  const current = getMofaRequests();
  const updated = [request, ...current.filter(r => r.id !== request.id)];
  saveMofaRequests(updated);
  return updated;
};

// 16. إدارة ضباط ومسؤولي المنافذ وغرف العمليات (Port Officers & Duty Personnel)
const DEFAULT_OFFICERS: PortOfficer[] = [
  {
    id: 'off-1',
    name: 'ضابط المناوبة بالمنفذ',
    rank: 'نقيب',
    portOrCenter: 'مطار صنعاء الدولي',
    role: 'ضابط منفذ',
    militaryNumber: '10482',
    phone: '777000001',
    status: 'نشط',
    isCurrentDutyOfficer: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'off-2',
    name: 'ضابط المباينة والتحقيق',
    rank: 'رائد',
    portOrCenter: 'المركز الرئيسي - العاصمة صنعاء',
    role: 'محقق مباينة أمنية',
    militaryNumber: '08921',
    phone: '777000002',
    status: 'نشط',
    isCurrentDutyOfficer: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'off-3',
    name: 'مدير العمليات المركزية',
    rank: 'عقيد',
    portOrCenter: 'غرفة العمليات المركزية والسيطرة - صنعاء',
    role: 'مدير عمليات',
    militaryNumber: '05412',
    phone: '777000003',
    status: 'نشط',
    isCurrentDutyOfficer: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'off-4',
    name: 'مدير عام المنافذ والرقابة الحدودية',
    rank: 'عميد',
    portOrCenter: 'رئاسة المصلحة - المركز الرئيسي بصنعاء',
    role: 'مدير عام',
    militaryNumber: '01290',
    phone: '777000004',
    status: 'نشط',
    isCurrentDutyOfficer: false,
    createdAt: new Date().toISOString()
  }
];

export const getPortOfficers = (): PortOfficer[] => {
  const data = kvGet('sovereign_port_officers');
  if (data) {
    try {
      const list: PortOfficer[] = JSON.parse(data);
      // Clean any old mock names if any existed
      const cleaned = list.map(o => {
        if (o.name.includes('الصرابي') || o.name.includes('مسعد')) {
          return { ...o, name: 'مدير عام المنافذ والرقابة الحدودية' };
        }
        return o;
      });
      return cleaned;
    } catch {
      /* ignore */
    }
  }
  savePortOfficers(DEFAULT_OFFICERS);
  return DEFAULT_OFFICERS;
};

export const savePortOfficers = (officers: PortOfficer[]) => {
  kvSet('sovereign_port_officers', JSON.stringify(officers));
};

export const addPortOfficer = (officer: PortOfficer): PortOfficer[] => {
  const current = getPortOfficers();
  let updated = [...current, officer];
  if (officer.isCurrentDutyOfficer) {
    updated = updated.map(o => o.id === officer.id ? o : { ...o, isCurrentDutyOfficer: false });
  }
  savePortOfficers(updated);
  return updated;
};

export const updatePortOfficer = (officer: PortOfficer): PortOfficer[] => {
  const current = getPortOfficers();
  let updated = current.map(o => o.id === officer.id ? { ...o, ...officer, updatedAt: new Date().toISOString() } : o);
  if (officer.isCurrentDutyOfficer) {
    updated = updated.map(o => o.id === officer.id ? o : { ...o, isCurrentDutyOfficer: false });
  }
  savePortOfficers(updated);
  return updated;
};

export const deletePortOfficer = (id: string): PortOfficer[] => {
  const current = getPortOfficers();
  const updated = current.filter(o => o.id !== id);
  savePortOfficers(updated);
  return updated;
};

export const getCurrentDutyOfficer = (): PortOfficer | null => {
  const officers = getPortOfficers();
  return officers.find(o => o.isCurrentDutyOfficer && o.status === 'نشط') || officers[0] || null;
};

export const setCurrentDutyOfficer = (id: string): void => {
  const officers = getPortOfficers();
  const updated = officers.map(o => ({
    ...o,
    isCurrentDutyOfficer: o.id === id
  }));
  savePortOfficers(updated);
};

export const getDefaultOfficerName = (): string => {
  const duty = getCurrentDutyOfficer();
  if (duty) return `${duty.rank ? duty.rank + '/ ' : ''}${duty.name}`;
  return kvGet('config_default_officer') || 'ضابط المناوبة بالمنفذ';
};

// 17. المنافذ السيادية القابلة للتخصيص والتحديث وتعيين الضباط
export const getCustomPorts = (): SovereignPort[] => {
  const data = kvGet('sovereign_ports_custom');
  if (data) {
    try {
      const list: SovereignPort[] = JSON.parse(data);
      // Clean any mock supervisor names
      const cleaned = list.map(p => {
        if (p.shiftSupervisor && (p.shiftSupervisor.includes('الصرابي') || p.shiftSupervisor.includes('اليافعي') || p.shiftSupervisor.includes('السالمي') || p.shiftSupervisor.includes('الكثيري') || p.shiftSupervisor.includes('التميمي') || p.shiftSupervisor.includes('المهري') || p.shiftSupervisor.includes('السقطري') || p.shiftSupervisor.includes('الأهدل') || p.shiftSupervisor.includes('النهدي') || p.shiftSupervisor.includes('الحريزي') || p.shiftSupervisor.includes('كلشات') || p.shiftSupervisor.includes('المقراني') || p.shiftSupervisor.includes('الشمري') || p.shiftSupervisor.includes('الشعيبي') || p.shiftSupervisor.includes('مروان') || p.shiftSupervisor.includes('باحميد') || p.shiftSupervisor.includes('القميري') || p.shiftSupervisor.includes('حكمي') || p.shiftSupervisor.includes('الصبيحي'))) {
          return { ...p, shiftSupervisor: '' };
        }
        return p;
      });
      return cleaned;
    } catch {
      /* ignore */
    }
  }
  saveCustomPorts(SOVEREIGN_PORTS);
  return SOVEREIGN_PORTS;
};

export const saveCustomPorts = (ports: SovereignPort[]) => {
  kvSet('sovereign_ports_custom', JSON.stringify(ports));
};

export const updatePortSupervisor = (portId: string, supervisorName: string): SovereignPort[] => {
  const current = getCustomPorts();
  const updated = current.map(p => p.id === portId ? { ...p, shiftSupervisor: supervisorName } : p);
  saveCustomPorts(updated);
  return updated;
};

// Auto-sanitization to ensure headquarters is Sana'a and wipe out any previous mock officers
export const sanitizeSystemHeadquartersAndOfficers = () => {
  if (typeof window === 'undefined') return;

  // Ensure default region is Sana'a Capital, NOT Hadramout or Aden
  const savedRegion = kvGet('config_region');
  if (!savedRegion || savedRegion === 'حضرموت' || savedRegion === 'عدن') {
    kvSet('config_region', 'العاصمة صنعاء');
  }

  // Ensure center name defaults to Sana'a Central HQ
  const savedCenter = kvGet('config_centerName');
  if (!savedCenter || savedCenter === 'منفذ الوديعة البري') {
    kvSet('config_centerName', 'المركز الرئيسي - العاصمة صنعاء');
  }

  // Ensure agency name defaults to Presidency of Passports Authority
  const savedAgency = kvGet('config_agencyName');
  if (!savedAgency || savedAgency === 'فرع مصلحة الجوازات') {
    kvSet('config_agencyName', 'رئاسة مصلحة الهجرة والجوازات والجنسية');
  }

  // Ensure branch code defaults to Sana'a Central HQ
  const savedBranchCode = kvGet('config_branchCode');
  if (!savedBranchCode || savedBranchCode === 'SHW-01') {
    kvSet('config_branchCode', 'SNA-HQ-01');
  }

  // Sanitize currentUser
  const currentUserRaw = kvGet('currentUser');
  if (currentUserRaw && (currentUserRaw.includes('الصرابي') || currentUserRaw.includes('مسعد'))) {
    try {
      const parsed = JSON.parse(currentUserRaw);
      parsed.name = kvGet('config_default_officer') || 'مدير العمليات المركزية';
      parsed.portOrDepartment = 'غرفة العمليات المركزية والسيطرة - المركز الرئيسي (صنعاء)';
      kvSet('currentUser', JSON.stringify(parsed));
    } catch {
      kvRemove('currentUser');
    }
  }
};

// Run sanitization immediately on load
if (typeof window !== 'undefined') {
  sanitizeSystemHeadquartersAndOfficers();
}

