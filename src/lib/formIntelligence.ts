import {
  getTravelers,
  getForeigners,
  getRefugees,
  getReports,
  getSeizures,
  getMonitoredCompanies,
  getMovementPermits,
  getMovements,
  normalizeArabic,
  cleanArabicText
} from './storage';
import { kvGet, kvSet, kvRemove } from './sovereignStorageBackend';
import { Traveler } from './types';

export interface PersonLookupResult {
  sourceModule: 'المسافرين' | 'الوافدين الأجانب' | 'اللاجئين';
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  lastName: string;
  idNumber: string;
  idType: string;
  country: string;
  governorate: string;
  phone: string;
  age?: number;
  profession?: string;
  expiryDate?: string;
  issueDate?: string;
  placeOfIssue?: string;
  previousTripsCount: number;
  existingTraveler?: Traveler;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  summary?: string;
}

export interface LiveWatchlistCheckResult {
  matched: boolean;
  title?: string;
  source?: 'بلاغ ضبط' | 'محضر احتجاز';
  details?: string;
}

export interface DateAndPassportValidation {
  warnings: string[];
  isExpired: boolean;
  isExpiringSoon: boolean;
  hasDateInversion: boolean;
  hasPassportFormatWarning: boolean;
}

function splitNameParts(fullName: string) {
  const parts = cleanArabicText(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    secondName: parts[1] || '',
    thirdName: parts[2] || '',
    fourthName: parts.length > 4 ? parts[3] : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

/**
 * 1. الإكمال التلقائي وسحب البيانات من السجل التاريخي برقم الجواز أو الهوية
 */
export function lookupPersonByPassportOrId(rawId: string): PersonLookupResult | null {
  const cleanId = normalizeArabic(rawId || '').replace(/\s+/g, '').toUpperCase();
  if (cleanId.length < 4) return null;

  const travelers = getTravelers();
  const matchedTravelers = travelers.filter(
    t => normalizeArabic(t.idNumber || '').replace(/\s+/g, '').toUpperCase() === cleanId
  );

  if (matchedTravelers.length > 0) {
    const t = matchedTravelers[0];
    const fullName = cleanArabicText(
      [t.firstName, t.secondName, t.thirdName, t.fourthName, t.lastName].filter(Boolean).join(' ')
    ) || t.passportName || '';
    return {
      sourceModule: 'المسافرين',
      fullName,
      firstName: t.firstName || '',
      secondName: t.secondName || '',
      thirdName: t.thirdName || '',
      fourthName: t.fourthName || '',
      lastName: t.lastName || '',
      idNumber: t.idNumber,
      idType: t.idType || 'جواز سفر',
      country: t.country || 'اليمن',
      governorate: t.governorate || 'أمانة العاصمة',
      phone: t.phone || '',
      age: t.age,
      profession: t.profession,
      expiryDate: t.expiryDate,
      issueDate: t.issueDate,
      placeOfIssue: t.placeOfIssue,
      previousTripsCount: matchedTravelers.length,
      existingTraveler: t
    };
  }

  const foreigners = getForeigners();
  const matchedForeigner = foreigners.find(
    f => normalizeArabic(f.passportNumber || '').replace(/\s+/g, '').toUpperCase() === cleanId
  );
  if (matchedForeigner) {
    const parts = splitNameParts(matchedForeigner.fullName);
    return {
      sourceModule: 'الوافدين الأجانب',
      fullName: matchedForeigner.fullName,
      ...parts,
      idNumber: matchedForeigner.passportNumber,
      idType: 'جواز سفر',
      country: matchedForeigner.nationality,
      governorate: 'أمانة العاصمة',
      phone: '',
      profession: matchedForeigner.profession,
      previousTripsCount: 1
    };
  }

  const refugees = getRefugees();
  const matchedRefugee = refugees.find(
    r => normalizeArabic(r.unhcrNumber || '').replace(/\s+/g, '').toUpperCase() === cleanId
  );
  if (matchedRefugee) {
    const parts = splitNameParts(matchedRefugee.fullName);
    return {
      sourceModule: 'اللاجئين',
      fullName: matchedRefugee.fullName,
      ...parts,
      idNumber: matchedRefugee.unhcrNumber,
      idType: 'بطاقة لجوء UNHCR',
      country: matchedRefugee.nationality,
      governorate: 'أمانة العاصمة',
      phone: matchedRefugee.phone || '',
      previousTripsCount: 1
    };
  }

  return null;
}

/**
 * 2. التحقق اللحظي من التواريخ وصيغة الجواز
 */
export function validatePassportAndDates(params: {
  idNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  birthDate?: string;
}): DateAndPassportValidation {
  const warnings: string[] = [];
  let isExpired = false;
  let isExpiringSoon = false;
  let hasDateInversion = false;
  let hasPassportFormatWarning = false;

  const cleanId = (params.idNumber || '').trim();
  if (cleanId.length > 0 && cleanId.length < 5) {
    hasPassportFormatWarning = true;
    warnings.push('رقم الجواز/الهوية قصير جداً (يفترض 5 خانات فأكثر).');
  }

  const exp = params.expiryDate ? new Date(params.expiryDate) : null;
  const iss = params.issueDate ? new Date(params.issueDate) : null;
  const birth = params.birthDate ? new Date(params.birthDate) : null;
  const now = new Date();

  if (exp && !isNaN(exp.getTime())) {
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      isExpired = true;
      warnings.push('تنبيه هام: وثيقة السفر منتهية الصلاحية!');
    } else if (diffDays <= 180) {
      isExpiringSoon = true;
      warnings.push(`صلاحية الجواز أقل من 6 أشهر (${diffDays} يوماً متبقياً).`);
    }
    if (iss && !isNaN(iss.getTime()) && exp.getTime() <= iss.getTime()) {
      hasDateInversion = true;
      warnings.push('خطأ في التواريخ: تاريخ الانتهاء أقدم من أو يساوي تاريخ الإصدار!');
    }
  }

  if (birth && !isNaN(birth.getTime()) && iss && !isNaN(iss.getTime()) && iss.getTime() < birth.getTime()) {
    hasDateInversion = true;
    warnings.push('خطأ منطقي: تاريخ إصدار الجواز أقدم من تاريخ الميلاد!');
  }

  return {
    warnings,
    isExpired,
    isExpiringSoon,
    hasDateInversion,
    hasPassportFormatWarning
  };
}

/**
 * 3. منع التكرار المباشر عبر مختلف التبويبات
 */
export function checkDuplicateEntry(
  type: 'traveler' | 'report' | 'seizure' | 'foreigner' | 'permit' | 'company' | 'movement_active',
  key: string,
  excludeId?: string
): DuplicateCheckResult {
  const cleanKey = normalizeArabic(key || '').replace(/\s+/g, '').toLowerCase();
  if (cleanKey.length < 2) return { isDuplicate: false };

  if (type === 'traveler') {
    const hit = getTravelers().find(
      t => t.id !== excludeId && normalizeArabic(t.idNumber || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      const fullName = `${hit.firstName} ${hit.secondName || ''} ${hit.lastName || ''}`.trim();
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `مسجل مسبقاً للمسافر (${fullName || 'غير محدد'}) بتاريخ ${new Date(hit.createdAt).toLocaleDateString('ar-YE')}`
      };
    }
  } else if (type === 'report') {
    const hit = getReports().find(r => {
      if (r.id === excludeId) return false;
      const numMatch = r.autoNumber && normalizeArabic(r.autoNumber).toLowerCase() === cleanKey;
      const titleMatch = normalizeArabic(r.title || '').replace(/\s+/g, '').toLowerCase() === cleanKey;
      return Boolean(numMatch || titleMatch);
    });
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `يوجد بلاغ مسجل برقم/عنوان مطابق: "${hit.title}"`
      };
    }
  } else if (type === 'seizure') {
    const hit = getSeizures().find(
      s => s.id !== excludeId && normalizeArabic(s.passportNumber || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `يوجد محضر ضبط مفتوح لهذا الجواز (${hit.recordNumber} - الحالة: ${hit.status})`
      };
    }
  } else if (type === 'foreigner') {
    const hit = getForeigners().find(
      f => f.id !== excludeId && normalizeArabic(f.passportNumber || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `الوافد مسجل مسبقاً (${hit.fullName} - رقم إقامة ${hit.residenceNumber})`
      };
    }
  } else if (type === 'permit') {
    const hit = getMovementPermits().find(
      p => p.id !== excludeId && normalizeArabic(p.permitCode || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `رمز التصريح مستخدم مسبقاً للوفد: ${hit.delegationName}`
      };
    }
  } else if (type === 'company') {
    const hit = getMonitoredCompanies().find(
      c => c.id !== excludeId && normalizeArabic(c.companyName || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `الجهة/الوكالة مدرجة مسبقاً (${hit.securityClearanceStatus})`
      };
    }
  } else if (type === 'movement_active') {
    const hit = getMovements().find(
      m => m.id !== excludeId && m.status === 'خروج' && normalizeArabic(m.plateNumber || '').replace(/\s+/g, '').toLowerCase() === cleanKey
    );
    if (hit) {
      return {
        isDuplicate: true,
        existingId: hit.id,
        summary: `المركبة مسجلة حالياً في مهمة خروج (${hit.driverName} - ${hit.mission}) ولم تثبت عودتها بعد.`
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * 4. الفحص الأمني الحي أثناء الكتابة ضد بلاغات الضبط ومحاضر الحجز
 */
export function checkLiveWatchlistMatch(passportOrId: string, fullName: string): LiveWatchlistCheckResult {
  const cleanId = normalizeArabic(passportOrId || '').replace(/\s+/g, '').toLowerCase();
  const cleanName = normalizeArabic(fullName || '').toLowerCase();
  if (cleanId.length < 4 && cleanName.length < 5) return { matched: false };

  const reports = getReports();
  for (const r of reports) {
    const haystack = normalizeArabic(`${r.title || ''} ${r.description || ''}`).toLowerCase();
    if (cleanId.length >= 4 && haystack.includes(cleanId)) {
      return { matched: true, title: r.title, source: 'بلاغ ضبط', details: `تطابق رقم الوثيقة (${passportOrId}) مع البلاغ` };
    }
    if (cleanName.length >= 6 && haystack.includes(cleanName)) {
      return { matched: true, title: r.title, source: 'بلاغ ضبط', details: `تطابق الاسم (${fullName}) مع البلاغ` };
    }
  }

  const seizures = getSeizures();
  for (const s of seizures) {
    if (s.status === 'تم التسليم') continue;
    const sPass = normalizeArabic(s.passportNumber || '').replace(/\s+/g, '').toLowerCase();
    const sName = normalizeArabic(s.travelerName || '').toLowerCase();
    if (cleanId.length >= 4 && sPass === cleanId) {
      return {
        matched: true,
        title: `محضر احتجاز جواز (${s.recordNumber})`,
        source: 'محضر احتجاز',
        details: `الجواز محتجز في ${s.seizurePort} (${s.reason})`
      };
    }
    if (cleanName.length >= 6 && sName === cleanName) {
      return {
        matched: true,
        title: `محضر احتجاز جواز (${s.recordNumber})`,
        source: 'محضر احتجاز',
        details: `الاسم مدرج بمحضر احتجاز جواز رقم ${s.passportNumber}`
      };
    }
  }

  return { matched: false };
}

/**
 * 5. التحقق من الحالة الأمنية لوكالة السفر عند الاختيار
 */
export function getAgencyClearanceWarning(agencyName: string): { status?: string; isBlocked: boolean; message?: string } {
  const norm = normalizeArabic(agencyName || '');
  if (!norm) return { isBlocked: false };
  const comp = getMonitoredCompanies().find(c => normalizeArabic(c.companyName) === norm);
  if (!comp) return { isBlocked: false };
  if (comp.securityClearanceStatus === 'إيقاف مؤقت' || comp.securityClearanceStatus === 'سحب الترخيص الأمني') {
    return {
      status: comp.securityClearanceStatus,
      isBlocked: true,
      message: `تنبيه رقابي: "${comp.companyName}" مصنفة (${comp.securityClearanceStatus}) — يرجى مراجعة الرقابة قبل الاعتماد.`
    };
  }
  return { status: comp.securityClearanceStatus, isBlocked: false };
}

/**
 * 6. حفظ واسترجاع مسودات النماذج تلقائياً (Auto-Save Drafts)
 */
export function saveFormDraft(draftKey: string, data: any): void {
  try {
    kvSet(`draft_${draftKey}`, JSON.stringify({ data, savedAt: new Date().toISOString() }));
  } catch {
    // Ignore storage issues for drafts
  }
}

export function loadFormDraft<T>(draftKey: string): { data: T; savedAt: string } | null {
  try {
    const raw = kvGet(`draft_${draftKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ? parsed : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(draftKey: string): void {
  try {
    kvRemove(`draft_${draftKey}`);
  } catch {
    // ignore
  }
}

/**
 * 7. ضغط الصور محلياً قبل التخزين لتفادي امتلاء localStorage
 */
export function compressImageFileToDataUrl(file: File, maxWidth = 960, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (!file.type.startsWith('image/') || typeof Image === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 8. محلل ذكي محلي لنصوص بلاغات استخبارات الشرطة والشعب الأمنية
 */
export function parseIntelligenceReportText(rawText: string) {
  const text = (rawText || '').trim();
  const extractLine = (label: string): string => {
    const reg = new RegExp(`${label}\\s*[:：]\\s*(.+)`, 'i');
    const m = text.match(reg);
    return m ? m[1].trim() : '';
  };

  const autoNumber = extractLine('الرقم الآلي');
  const reportDate = extractLine('تاريخ البلاغ');
  const sendingAuthority = extractLine('جهة الإرسال');
  const subject = extractLine('الموضوع');
  const type = extractLine('التصنيف') || 'إداري';
  const priorityRaw = extractLine('درجة الأهمية');
  const priority: 'عادي' | 'عاجل' | 'سري وعاجل' =
    priorityRaw.includes('سري') ? 'سري وعاجل' : priorityRaw.includes('عاجل') ? 'عاجل' : 'عادي';
  const title = extractLine('العنوان') || subject;
  const actionsTaken = extractLine('الإجراءات المتخذة');

  // Extract body between مضمون البلاغ: and الإجراءات المتخذة: (or end)
  let description = text;
  const bodyMatch = text.match(/مضمون البلاغ\s*[:：]\s*([\s\S]*?)(?:الإجراءات المتخذة\s*[:：]|━{3,}|$)/i);
  if (bodyMatch && bodyMatch[1].trim()) {
    description = bodyMatch[1].trim();
  }

  // Extract transport breakdown if present
  const driverMatch = text.match(/السائق\s*[\/:]\s*([^\nو]+)/i);
  const escortMatch = text.match(/المرافق\s*[\/:]\s*([^\nعلى]+)/i);
  const plateMatch = text.match(/رقم اللوح[هة]\s*[\(\s]*([^\)\n]+)/i);
  const totalPassMatch = text.match(/اجمالي عدد الجوازات[\s\n]*\(\s*(\d+)\s*\)/i);

  return {
    autoNumber: autoNumber || undefined,
    reportDate: /^\d{4}-\d{2}-\d{2}/.test(reportDate) ? reportDate.slice(0, 10) : undefined,
    sendingAuthority: sendingAuthority || (text.includes('استخبارت الشرطة') || text.includes('استخبارات الشرطة') ? 'فرع استخبارات الشرطة - أمانة العاصمة' : undefined),
    subject: subject || undefined,
    type,
    priority,
    title: title || 'بلاغ أمني / إداري جديد',
    description,
    actionsTaken: actionsTaken || undefined,
    driverName: driverMatch?.[1]?.trim(),
    escortName: escortMatch?.[1]?.trim(),
    plateNumber: plateMatch?.[1]?.trim(),
    totalPassports: totalPassMatch ? parseInt(totalPassMatch[1], 10) : undefined
  };
}
