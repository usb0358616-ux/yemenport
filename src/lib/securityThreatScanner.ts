import { getReports, normalizeArabic } from './storage';

export interface SecurityThreatItem {
  id: string;
  type: 'wanted_person' | 'forgery_suspect' | 'date_anomaly' | 'duplicate_passport_conflict' | 'security_flag';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  field?: string;
  value?: string;
  matchedReportId?: string;
}

export interface SecurityScanResult {
  status: 'clean' | 'warning' | 'threat_detected';
  score: number; // 0 to 100 (100 = completely clean, <70 = warning, <50 = threat)
  scannedAt: string;
  summary: string;
  threats: SecurityThreatItem[];
  totalThreatsDetected?: number;
  checkedRules: {
    watchlistChecked: boolean;
    forgeryRulesChecked: boolean;
    dateIntegrityChecked: boolean;
    passportFormatChecked: boolean;
  };
}

// Arabic keywords associated with document forgery or suspicion
const FORGERY_SUSPICION_KEYWORDS = [
  'تزوير',
  'مزور',
  'اشتباه تزوير',
  'تعديل غير مصرح',
  'ملغي',
  'ملغية',
  'مفقود',
  'منتحل صفة',
  'أختام مقلدة',
  'ختم مقلد',
  'بدل فاقد مشبوه',
  'غير مطابق',
  'معدل يدويا',
  'صفحة تالفة',
  'صورة مستبدلة'
];

const MAX_RENDERED_THREATS = 80;

const yieldToUi = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

interface IndexedReport {
  id: string;
  title: string;
  normTextLower: string;
  normTextUpper: string;
}

function buildIndexedReports(): IndexedReport[] {
  const reports = getReports();
  return reports.map(r => {
    const combined = normalizeArabic(`${r.title || ''} ${r.description || ''}`);
    return {
      id: r.id,
      title: r.title,
      normTextLower: combined.toLowerCase(),
      normTextUpper: combined.toUpperCase()
    };
  });
}

function evaluateRecordThreat(
  record: any,
  index: number,
  indexedReports: IndexedReport[],
  seenPassportToName: Map<string, string>,
  pushThreat: (item: SecurityThreatItem) => void
) {
  const rawFullName =
    [record.firstName, record.secondName, record.thirdName, record.lastName]
      .filter(Boolean)
      .join(' ') ||
    record.fullName ||
    '';
  const normName = normalizeArabic(rawFullName).trim();
  const normNameLower = normName.toLowerCase();
  const passportNo = String(record.idNumber || record.passportNumber || '').trim();
  const normPassport = passportNo.replace(/[\s\-_]/g, '').toUpperCase();

  // أ) مطابقة مع بلاغات الضبط وقوائم التعميم
  if (normNameLower.length >= 6 && indexedReports.length > 0) {
    const matchedReport = indexedReports.find(r => r.normTextLower.includes(normNameLower));
    if (matchedReport) {
      pushThreat({
        id: `threat-wanted-${index}`,
        type: 'wanted_person',
        severity: 'critical',
        title: 'تطابق مع قائمة المطلوبين أمنياً / بلاغ ضبط',
        description: `المسافر "${rawFullName}" مطابق للبلاغ الأمني المسجل: "${matchedReport.title}".`,
        field: 'الاسم الكامل',
        value: rawFullName,
        matchedReportId: matchedReport.id
      });
    }
  }

  // ب) مطابقة رقم الجواز مع البلاغات
  if (normPassport.length >= 5 && !normPassport.startsWith('AUTO-') && !normPassport.startsWith('PDF-')) {
    if (indexedReports.length > 0) {
      const matchedPassportReport = indexedReports.find(r => r.normTextUpper.includes(normPassport));
      if (matchedPassportReport) {
        pushThreat({
          id: `threat-pass-${index}`,
          type: 'wanted_person',
          severity: 'critical',
          title: 'رقم وثيقة سفر معمم عليها أمنياً',
          description: `رقم الجواز "${normPassport}" مدرج في قائمة التعميم: "${matchedPassportReport.title}".`,
          field: 'رقم الجواز',
          value: normPassport,
          matchedReportId: matchedPassportReport.id
        });
      }
    }

    // ج) فحص ازدواجية رقم الجواز بأسماء مختلفة (اشتباه انتحال شخصية)
    if (seenPassportToName.has(normPassport)) {
      const previousName = seenPassportToName.get(normPassport)!;
      if (normName && previousName && normalizeArabic(previousName) !== normName) {
        pushThreat({
          id: `threat-dup-conflict-${index}`,
          type: 'duplicate_passport_conflict',
          severity: 'high',
          title: 'رقم جواز مكرر بأسماء متعددة (اشتباه انتحال)',
          description: `رقم الجواز "${normPassport}" ظهر باسمين مختلفين: ("${previousName}") و ("${rawFullName}").`,
          field: 'رقم الجواز',
          value: normPassport
        });
      }
    } else if (normName) {
      seenPassportToName.set(normPassport, rawFullName);
    }

    // د) فحص بنية رقم الجواز (تكرار مشبوه لأرقام متطابقة مثل 000000 أو 111111)
    if (/^(.)\1{5,}$/.test(normPassport)) {
      pushThreat({
        id: `threat-malformed-pass-${index}`,
        type: 'forgery_suspect',
        severity: 'medium',
        title: 'بنية رقم جواز سفر غير منطقية أو وهمية',
        description: `رقم الجواز "${normPassport}" يحتوي على أرقام متكررة بصورة وهمية.`,
        field: 'رقم الجواز',
        value: normPassport
      });
    }
  }

  // هـ) فحص سلامة التواريخ
  const issueDateStr = record.issueDate ? String(record.issueDate) : '';
  const expiryDateStr = record.expiryDate ? String(record.expiryDate) : '';
  const birthDateStr = record.birthDate ? String(record.birthDate) : '';

  if (issueDateStr && expiryDateStr) {
    const issue = Date.parse(issueDateStr);
    const expiry = Date.parse(expiryDateStr);
    if (!Number.isNaN(issue) && !Number.isNaN(expiry) && expiry <= issue) {
      pushThreat({
        id: `threat-date-anomaly-${index}`,
        type: 'date_anomaly',
        severity: 'high',
        title: 'تناقض في صلاحية وثيقة السفر',
        description: `تاريخ انتهاء الجواز (${expiryDateStr}) يسبق أو يطابق تاريخ إصداره (${issueDateStr}).`,
        field: 'تاريخ الانتهاء',
        value: expiryDateStr
      });
    }
  }

  if (birthDateStr) {
    const birth = Date.parse(birthDateStr);
    if (!Number.isNaN(birth)) {
      const age = (Date.now() - birth) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 0 || age > 115) {
        pushThreat({
          id: `threat-age-anomaly-${index}`,
          type: 'date_anomaly',
          severity: 'medium',
          title: 'تاريخ ميلاد غير منطقي',
          description: `تاريخ الميلاد المسجل (${birthDateStr}) يعطي عمراً غير صحيح (${Math.round(age)} سنة).`,
          field: 'تاريخ الميلاد',
          value: birthDateStr
        });
      }
    }
  }

  // و) مؤشرات أمنية صريحة بالحظر أو الإرجاع
  const vettingNotes = String(record.vettingResult || record.additionalInfo || '');
  if (vettingNotes && /ممنوع|مرفوض|حظر|إرجاع|مباينة سلبية/i.test(vettingNotes)) {
    pushThreat({
      id: `threat-vetting-flag-${index}`,
      type: 'security_flag',
      severity: 'high',
      title: 'قيد أمني سلبي مدون بالسجل',
      description: `المسافر "${rawFullName || 'المستخرج'}" مسجل بحقه قيد: "${vettingNotes}".`,
      field: 'المباينة الأمنية',
      value: vettingNotes
    });
  }
}

function finalizeSecurityResult(
  threats: SecurityThreatItem[],
  totalCount: number,
  severityCounts: { critical: number; high: number; medium: number; low: number }
): SecurityScanResult {
  let score =
    100 -
    severityCounts.critical * 35 -
    severityCounts.high * 20 -
    severityCounts.medium * 10 -
    severityCounts.low * 5;
  score = Math.max(0, Math.min(100, score));

  if (totalCount > threats.length) {
    threats.push({
      id: 'threat-overflow-summary',
      type: 'security_flag',
      severity: 'medium',
      title: `تم اختصار العرض لأول ${threats.length} مؤشر أمني`,
      description: `إجمالي الملاحظات الأمنية المكتشفة عبر الكشف: ${totalCount} ملاحظة، يتم عرض أهمها حفاظاً على سرعة النظام.`
    });
  }

  let status: SecurityScanResult['status'] = 'clean';
  let summary = 'تم الفحص الأمني التلقائي: لم يتم رصد أي مؤشرات تزوير أو تعميمات أمنية مطابقة.';

  if (severityCounts.critical > 0) {
    status = 'threat_detected';
    summary = `تنبيه أمني عالي الخطورة! تم رصد تطابق مع قوائم المطلوبين أو وثائق معمم عليها (${totalCount} مؤشر).`;
  } else if (totalCount > 0) {
    status = 'warning';
    summary = `رصد اشتباهات أمنية أو تناقضات بالوثيقة تتطلب المراجعة (${totalCount} تنبيه).`;
  }

  return {
    status,
    score,
    scannedAt: new Date().toISOString(),
    summary,
    threats,
    totalThreatsDetected: totalCount,
    checkedRules: {
      watchlistChecked: true,
      forgeryRulesChecked: true,
      dateIntegrityChecked: true,
      passportFormatChecked: true
    }
  };
}

/**
 * فحص أمني استباقي شامل لكشف التهديدات الأمنية والتزوير في الملفات المستوردة (نسخة متزامنة)
 */
export function scanFileForSecurityAndForgery(
  fileName: string,
  textContent: string,
  extractedRecords: any[] = []
): SecurityScanResult {
  const threats: SecurityThreatItem[] = [];
  const indexedReports = buildIndexedReports();
  const normalizedDocText = normalizeArabic((textContent || '').slice(0, 20000) + ' ' + fileName).toLowerCase();

  let totalCount = 0;
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const pushThreat = (item: SecurityThreatItem) => {
    totalCount++;
    severityCounts[item.severity]++;
    if (threats.length < MAX_RENDERED_THREATS) {
      threats.push(item);
    }
  };

  FORGERY_SUSPICION_KEYWORDS.forEach(keyword => {
    if (normalizedDocText.includes(normalizeArabic(keyword))) {
      pushThreat({
        id: `forg-kw-${Math.random().toString(36).substr(2, 6)}`,
        type: 'forgery_suspect',
        severity: 'high',
        title: 'رصد مؤشر اشتباه تزوير بمحتوى الوثيقة',
        description: `تم رصد دلالة نصية مشتبهة ("${keyword}") بداخل بيانات المستند أو حواشيه.`,
        value: keyword
      });
    }
  });

  const seenPassportToName = new Map<string, string>();
  for (let i = 0; i < extractedRecords.length; i++) {
    evaluateRecordThreat(extractedRecords[i], i, indexedReports, seenPassportToName, pushThreat);
  }

  return finalizeSecurityResult(threats, totalCount, severityCounts);
}

/**
 * نسخة غير متزامنة ومقسمة (Chunked) للفحص الأمني على الكشوفات الضخمة (3000+ سجل) لمنع تهنيج الواجهة
 */
export async function scanFileForSecurityAndForgeryAsync(
  fileName: string,
  textContent: string,
  extractedRecords: any[] = [],
  onProgress?: (percent: number) => void
): Promise<SecurityScanResult> {
  const threats: SecurityThreatItem[] = [];
  const indexedReports = buildIndexedReports();
  const normalizedDocText = normalizeArabic((textContent || '').slice(0, 20000) + ' ' + fileName).toLowerCase();

  let totalCount = 0;
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const pushThreat = (item: SecurityThreatItem) => {
    totalCount++;
    severityCounts[item.severity]++;
    if (threats.length < MAX_RENDERED_THREATS) {
      threats.push(item);
    }
  };

  FORGERY_SUSPICION_KEYWORDS.forEach(keyword => {
    if (normalizedDocText.includes(normalizeArabic(keyword))) {
      pushThreat({
        id: `forg-kw-${Math.random().toString(36).substr(2, 6)}`,
        type: 'forgery_suspect',
        severity: 'high',
        title: 'رصد مؤشر اشتباه تزوير بمحتوى الوثيقة',
        description: `تم رصد دلالة نصية مشتبهة ("${keyword}") بداخل بيانات المستند أو حواشيه.`,
        value: keyword
      });
    }
  });

  const seenPassportToName = new Map<string, string>();
  const CHUNK_SIZE = 350;
  const total = extractedRecords.length;

  for (let i = 0; i < total; i++) {
    evaluateRecordThreat(extractedRecords[i], i, indexedReports, seenPassportToName, pushThreat);
    if (i > 0 && i % CHUNK_SIZE === 0) {
      if (onProgress && total > 0) {
        onProgress(Math.round((i / total) * 100));
      }
      await yieldToUi();
    }
  }

  onProgress?.(100);
  return finalizeSecurityResult(threats, totalCount, severityCounts);
}
