/**
 * محرك التعرف الذكي على أسماء الحقول والتصنيف السيادي للوحدات
 * Intelligent Field & Column Synonym Recognition, Fuzzy Normalization,
 * Department Auto-Detection & Additional Information Aggregator
 */

import { ExtractedTravelerData, Traveler } from './types';
import { normalizeArabic, cleanArabicText } from './storage';

// 1. القاموس الموسع لمرادفات الحقول (عربي وإنجليزي بجميع الصيغ المحتملة)
export const FIELD_SYNONYMS = {
  // الرقم التسلسلي في الكشوفات (م / مسلسل)
  serialNumber: [
    'م',
    'م.',
    'مسلسل',
    'رقم تسلسلي',
    'التسلسل',
    'ت',
    'رقم السطر',
    'line no',
    'line no.',
    'lineno',
    'sn',
    's/n',
    'no',
    'no.',
    'serial',
    'serial no',
    '#'
  ],

  // حقول الأسماء الأساسية (مفصولة عن اسم الجواز لمنع التداخل)
  name: [
    'الاسم',
    'الإسم',
    'اسم المسافر',
    'الاسم الرباعي',
    'الاسم الكامل',
    'الاسم عربي',
    'اسم الشخص',
    'الاسم الثلاثي',
    'الاسم الخماسي',
    'اسم المواطن',
    'اسم الوافد',
    'اسم اللاجئ',
    'اسم المهاجر',
    'اسم العميل',
    'الاسم بالكامل',
    'اسم المسافر رباعي',
    'صاحب الجواز',
    'حامل الجواز',
    'حامل الوثيقة',
    'full name',
    'fullname',
    'name',
    'passenger name',
    'traveler name',
    'passport holder',
    'client name',
    'person name',
    'routings / names'
  ],

  // أسماء مجزأة (في حال كانت الأعمدة مقسمة)
  firstName: ['الاسم الاول', 'الاسم الأول', 'الاسم1', 'first name', 'firstname', 'given name', 'given names'],
  secondName: ['اسم الاب', 'اسم الأب', 'اسم الوالد', 'الاسم الثاني', 'second name', 'father name', 'middle name'],
  thirdName: ['اسم الجد', 'الاسم الثالث', 'third name', 'grandfather name'],
  fourthName: ['الاسم الرابع', 'fourth name'],
  lastName: ['اللقب', 'اسم العائلة', 'اسم العائله', 'القبيلة', 'اسم الشهرة', 'العائلة', 'الكنية', 'last name', 'lastname', 'surname', 'family name'],

  // حقول أرقام الهواتف والجوال
  phone: [
    'رقم الهاتف',
    'رقم الموبايل',
    'رقم التلفون',
    'رقم الجوال',
    'الهاتف',
    'الموبايل',
    'التلفون',
    'الجوال',
    'هاتف',
    'موبايل',
    'تلفون',
    'جوال',
    'رقم الاتصال',
    'وسيلة الاتصال',
    'تلفون المسافر',
    'جوال المسافر',
    'هاتف التواصل',
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'cell',
    'telephone',
    'tel',
    'contact',
    'contact number'
  ],

  // حقول أرقام الجوازات والوثائق والهويات
  idNumber: [
    'رقم الجواز',
    'رقم جواز السفر',
    'رقم الوثيقة',
    'رقم وثيقة السفر',
    'رقم البطاقة',
    'رقم البطاقة العائلية',
    'رقم الهوية',
    'رقم الإقامة',
    'رقم الاقامة',
    'رقم الكرت',
    'رقم تصريح الإقامة',
    'رقم ملف اللجوء',
    'رقم المفوضية',
    'رقم السجل',
    'رقم الجواز / البطاقة',
    'جواز السفر',
    'الجواز',
    'الهوية',
    'الوثيقة',
    'id/passport',
    'passport - id',
    'passport-id',
    'passport number',
    'passport no',
    'passport',
    'id number',
    'id no',
    'document number',
    'document no',
    'doc no',
    'residence no',
    'residence number',
    'unhcr number'
  ],

  // نوع الوثيقة
  idType: [
    'نوع الوثيقة',
    'نوع الهوية',
    'نوع البطاقة',
    'نوع الجواز',
    'وثيقة السفر',
    'document type',
    'id type',
    'doc type'
  ],

  // الجنسية والدولة
  country: [
    'الجنسية',
    'الجنسيه',
    'الدولة',
    'الدوله',
    'بلد الجنسية',
    'البلد',
    'الدولة التابع لها',
    'القطر',
    'بلد الإقامة',
    'دولة القدوم',
    'nationality',
    'country',
    'citizenship'
  ],

  // المحافظة والمدينة
  governorate: [
    'المحافظة',
    'المحافظه',
    'المدينة',
    'المدينه',
    'المديرية',
    'العنوان',
    'محل الإقامة',
    'محل الميلاد',
    'السكن',
    'مكان السكن',
    'المنطقة',
    'governorate',
    'city',
    'address',
    'province',
    'state'
  ],

  // العمر (مفصول تماماً عن تاريخ الميلاد)
  age: [
    'العمر',
    'السن',
    'عمر المسافر',
    'age'
  ],

  // الوجهة ومحطة العبور
  destination: [
    'الوجهة',
    'الوجهه',
    'جهة السفر',
    'جهة القدوم',
    'جهة المغادرة',
    'الدولة المقصودة',
    'محطة الوصول',
    'محطة الانطلاق',
    'خط السير',
    'المقصد',
    'مركز التسليم',
    'destination',
    'dest',
    'coming from',
    'travel to',
    'route'
  ],

  // سبب الزيارة / الغرض (مفصول تماماً عن المهنة ونوع التأشيرة)
  visitReason: [
    'سبب الزيارة',
    'الغرض من السفر',
    'سبب السفر',
    'الغرض من الدخول',
    'الغرض',
    'visit reason',
    'purpose',
    'reason'
  ],

  // نوع التأشيرة
  visaType: [
    'نوع التأشيرة',
    'نوع التاشيرة',
    'نوع الفيزا',
    'فئة التأشيرة',
    'التأشيرة',
    'التاشيرة',
    'الفيزا',
    'visa type',
    'visa'
  ],

  // المنفذ أو المركز
  center: [
    'مركز الإستلام',
    'مركز الاستلام',
    'المركز الرئيسي',
    'المركز',
    'المنفذ البري',
    'المنفذ الجوي',
    'المنفذ البحري',
    'منفذ العبور',
    'نقطة العبور',
    'ميناء الدخول',
    'مطار الدخول',
    'المنفذ',
    'orig',
    'port',
    'center',
    'border crossing',
    'point of entry'
  ],

  // الوكالة أو الكفيل أو جهة العمل أو المنظمة
  agency: [
    'اسم الوكالة',
    'إسم الوكالة',
    'وكالة السفر',
    'الوكالة',
    'مكتب السفر',
    'اسم المكتب',
    'إسم المكتب',
    'شركة السفر',
    'وكيل السفر',
    'شركة النقل',
    'شركة الطيران',
    'الناقل',
    'جهة العمل',
    'اسم الكفيل',
    'الكفيل',
    'المنشأة',
    'المنظمة',
    'agency',
    'org.',
    'org',
    'carrier',
    'travel agent',
    'travel agency',
    'sponsor',
    'employer'
  ],

  // تاريخ الاستلام أو المغادرة أو الخروج
  receiveDate: [
    'تاريخ الخروج من السفارة',
    'تاريخ الخروج',
    'ت. الخروج',
    'ت الخروج',
    'تاريخ الاستلام',
    'تاريخ الإستلام',
    'ت. الاستلام',
    'تاريخ الدفعة',
    'تاريخ السفر',
    'تاريخ العبور',
    'تاريخ الوصول',
    'تاريخ المغادرة',
    'تاريخ المعاملة',
    'التاريخ',
    'exit date',
    'travel date',
    'departure date',
    'arrival date',
    'receive date',
    'date'
  ],

  // قرار السفر
  travelAllowed: [
    'قرار السفر',
    'حالة السفر',
    'السفر مسموح',
    'مسموح بالعبور',
    'مسموح',
    'القرار',
    'travel decision',
    'allowed'
  ],

  // الحالة العامة
  status: [
    'حالة المعاملة',
    'حالة التأشيرة',
    'حالة الجواز بالسفارة',
    'حالة السجل',
    'طريقة الإرسال',
    'الحالة',
    'الحاله',
    'الوضع',
    'status'
  ],

  // سبب الإرجاع أو الرفض
  returnReason: [
    'سبب الإرتجاع',
    'سبب الارتجاع',
    'سبب الإرجاع',
    'سبب الارجاع',
    'ملاحظة الإرتجاع',
    'ملاحظات الإرتجاع',
    'نوع المردود',
    'بيانات المردود',
    'سبب المنع',
    'سبب الرفض',
    'سبب عدم السماح',
    'ملاحظات الرفض',
    'return reason',
    'rejection reason'
  ],

  // ضابط التحقيق
  investigatingOfficer: [
    'ضابط التحقيق',
    'المحقق',
    'المستلم',
    'الموظف المختص',
    'اسم الضابط',
    'ضابط الجوازات',
    'المعاين',
    'officer',
    'investigator'
  ],

  // رقم الطلب أو الدفعة أو المعاملة
  requestNumber: [
    'رقم الدفعة',
    'رقم الطلب',
    'رقم المعاملة',
    'رقم القيد',
    'رقم الإحالة',
    'pax id nr',
    'request number',
    'batch number',
    'reference'
  ],

  // حقول وثيقة الجواز المخصصة
  passportName: [
    'اسم المسافر بالجواز',
    'الاسم كما في الجواز',
    'اسم جواز السفر',
    'اسم صاحب الجواز',
    'اسم حامل الجواز',
    'الاسم بالجواز',
    'الاسم في الجواز',
    'اسم في الجواز',
    'اسم وثيقة السفر',
    'اسم الجواز',
    'إسم الجواز',
    'passport name',
    'name in passport'
  ],

  passportStatus: [
    'حالة جواز السفر',
    'حالة وثيقة السفر',
    'وضع وثيقة السفر',
    'صلاحية الجواز',
    'حالة الجواز',
    'حاله الجواز',
    'وضع الجواز',
    'passport status',
    'document status'
  ],

  profession: [
    'section / job title',
    'job title',
    'pax sub category',
    'مهنة المسافر',
    'مهنة الوافد',
    'طبيعة العمل',
    'المهنة',
    'المهنه',
    'الوظيفة',
    'الوظيفه',
    'الصفة',
    'التخصص',
    'العمل',
    'profession',
    'occupation',
    'job'
  ],

  issueDate: [
    'تاريخ اصدار الجواز',
    'تاريخ إصدار الجواز',
    'تاريخ منح الجواز',
    'تاريخ الإصدار',
    'تاريخ الاصدار',
    'ت. الإصدار',
    'ت. الاصدار',
    'date of issue',
    'issue date'
  ],

  expiryDate: [
    'تاريخ انتهاء الجواز',
    'تاريخ صلاحية الجواز',
    'تاريخ الانتهاء',
    'تاريخ الإنتهاء',
    'نهاية الصلاحية',
    'انتهاء الجواز',
    'صالح حتى',
    'ت. الانتهاء',
    'date of expiry',
    'expiry date'
  ],

  placeOfIssue: [
    'مكان إصدار الجواز',
    'مكان الإصدار',
    'مكان الاصدار',
    'جهة الإصدار',
    'جهة الاصدار',
    'فرع الإصدار',
    'دائرة الإصدار',
    'place of issue',
    'issuing authority'
  ],

  gender: [
    '(m/w/a/c/i)',
    'm/w',
    'ذكر/أنثى',
    'الجنس',
    'النوع',
    'gender',
    'sex',
    'gen'
  ],

  birthDate: [
    'تاريخ الميلاد',
    'تاريخ الولادة',
    'سنة الميلاد',
    'ت. الميلاد',
    'الميلاد',
    'المواليد',
    'date of birth',
    'birth date',
    'dob'
  ],

  nationalId: [
    'رقم الهوية الوطنية',
    'رقم البطاقة الشخصية',
    'الرقم الوطني',
    'الرقم القومي',
    'national id',
    'national number'
  ],

  // المباينات الأمنية
  vettingWanted: ['نتائج المباينة من قاعدة المطلوبين', 'قائمة المطلوبين', 'المطلوبين', 'مطلوب'],
  vettingPrisons: ['نتائج المباينة من قاعدة السجون', 'أرباب السوابق', 'السجون', 'سجين'],
  vettingMercenaries: ['نتائج المباينة من قاعدة مرتزقة', 'مرتزقة', 'مرتزق'],
  vettingReturnees: ['نتائج المباينة من قاعدة مركز العائدين', 'مركز العائدين', 'العائدين', 'عائد'],
  vettingGeneral: ['نتائج المباينة', 'الفحص الأمني', 'نتائج التدقيق', 'القيود الأمنية', 'المباينة', 'vetting'],

  // معلومات إضافية وملاحظات عامة
  notes: [
    'معلومات إضافية',
    'معلومات اضافية',
    'بيانات إضافية',
    'ملاحظات عامة',
    'ملاحظات التدقيق',
    'معلومات أخرى',
    'بيانات أخرى',
    'ملاحظات',
    'تفاصيل',
    'أخرى',
    'additional info',
    'additional notes',
    'remarks',
    'remark',
    'comments',
    'details',
    'notes'
  ]
};

// أولوية ربط الحقول: الأدق أولاً (تواريخ الميلاد/الإصدار/الانتهاء، اسم الجواز، حالة الجواز، المهنة، التأشيرة) قبل الحقول الأعم
const FIELD_MATCH_PRIORITY: (keyof typeof FIELD_SYNONYMS)[] = [
  'serialNumber',
  'birthDate',
  'issueDate',
  'expiryDate',
  'passportName',
  'passportStatus',
  'nationalId',
  'firstName',
  'secondName',
  'thirdName',
  'fourthName',
  'lastName',
  'name',
  'idNumber',
  'idType',
  'country',
  'governorate',
  'age',
  'phone',
  'gender',
  'profession',
  'placeOfIssue',
  'visaType',
  'visitReason',
  'destination',
  'center',
  'agency',
  'receiveDate',
  'travelAllowed',
  'returnReason',
  'status',
  'investigatingOfficer',
  'requestNumber',
  'vettingWanted',
  'vettingPrisons',
  'vettingMercenaries',
  'vettingReturnees',
  'vettingGeneral',
  'notes'
];

/**
 * تسوية ذكية وموحدة للنصوص للبحث المقارن
 */
export function cleanKey(key: string): string {
  return normalizeArabic(String(key || ''))
    .toLowerCase()
    .replace(/ـ/g, '')
    .replace(/[\s_\-\/\.\(\)\:\;\\\[\]\،\,]/g, '')
    .trim();
}

/**
 * مطابقة ذكية لعمود مع قائمة من المترادفات
 */
export function matchColumnFuzzy(
  row: Record<string, any>,
  synonyms: string[]
): { value: string; key: string } | null {
  const rowKeys = Object.keys(row);
  if (rowKeys.length === 0) return null;

  // 1. فحص التطابق الدقيق بعد التنظيف
  for (const synonym of synonyms) {
    const cleanSyn = cleanKey(synonym);
    for (const rawKey of rowKeys) {
      if (cleanKey(rawKey) === cleanSyn) {
        const val = row[rawKey];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return { value: String(val).trim(), key: rawKey };
        }
      }
    }
  }

  // 2. فحص الاحتواء (Substring / Partial Match) مع إعطاء الأولوية للمرادفات الأطول والأكثر تحديداً
  const sortedSyns = [...synonyms].sort((a, b) => cleanKey(b).length - cleanKey(a).length);
  for (const synonym of sortedSyns) {
    const cleanSyn = cleanKey(synonym);
    if (cleanSyn.length < 3) continue;
    for (const rawKey of rowKeys) {
      const cKey = cleanKey(rawKey);
      if (cKey.length < 3) continue;
      if (cKey.includes(cleanSyn) || cleanSyn.includes(cKey)) {
        const val = row[rawKey];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return { value: String(val).trim(), key: rawKey };
        }
      }
    }
  }

  return null;
}

export interface SheetColumnPlan {
  colByField: Partial<Record<keyof typeof FIELD_SYNONYMS, number>>;
  matchedIndices: Set<number>;
  cleanHeaders: string[];
}

/**
 * تخطيط مسبق للأعمدة على مرحلتين:
 * المرحلة 1: التطابق التام عبر جميع الحقول أولاً (لمنع سرقة عمود محدد من قِبل حقل أعم)
 * المرحلة 2: التطابق الجزئي للأعمدة غير المحجوزة فقط مرتبةً من الأدق للأعم (FIELD_MATCH_PRIORITY)
 */
export function buildSheetColumnPlan(headers: string[]): SheetColumnPlan {
  const cleanHeaders = headers.map(h => cleanKey(h));
  const colByField: Partial<Record<keyof typeof FIELD_SYNONYMS, number>> = {};
  const matchedIndices = new Set<number>();

  // Pass 1: Strict exact normalized match across all fields
  for (const field of FIELD_MATCH_PRIORITY) {
    const synonyms = FIELD_SYNONYMS[field];
    let matchedIdx = -1;
    for (const syn of synonyms) {
      const cleanSyn = cleanKey(syn);
      if (!cleanSyn) continue;
      for (let c = 0; c < cleanHeaders.length; c++) {
        if (matchedIndices.has(c)) continue;
        if (cleanHeaders[c] === cleanSyn) {
          matchedIdx = c;
          break;
        }
      }
      if (matchedIdx !== -1) break;
    }
    if (matchedIdx !== -1) {
      colByField[field] = matchedIdx;
      matchedIndices.add(matchedIdx);
    }
  }

  // Pass 2: Substring match only for unclaimed fields & unclaimed columns (longest synonym first)
  for (const field of FIELD_MATCH_PRIORITY) {
    if (colByField[field] !== undefined) continue;
    const sortedSyns = [...FIELD_SYNONYMS[field]].sort((a, b) => cleanKey(b).length - cleanKey(a).length);
    let matchedIdx = -1;

    for (const syn of sortedSyns) {
      const cleanSyn = cleanKey(syn);
      if (cleanSyn.length < 3) continue;
      for (let c = 0; c < cleanHeaders.length; c++) {
        if (matchedIndices.has(c)) continue;
        const ch = cleanHeaders[c];
        if (ch.length < 3) continue;
        if (ch.includes(cleanSyn) || cleanSyn.includes(ch)) {
          matchedIdx = c;
          break;
        }
      }
      if (matchedIdx !== -1) break;
    }

    if (matchedIdx !== -1) {
      colByField[field] = matchedIdx;
      matchedIndices.add(matchedIdx);
    }
  }

  return { colByField, matchedIndices, cleanHeaders };
}

/**
 * استخراج قيمة الحقل بأمان من الصف
 */
export function getSmartFieldValue(row: Record<string, any>, synonyms: string[]): string {
  const match = matchColumnFuzzy(row, synonyms);
  return match ? match.value : '';
}

/**
 * استخلاص كافة الحقول غير المجدولة لتجميعها في "معلومات إضافية"
 */
export function extractUnmappedFields(
  row: Record<string, any>,
  matchedKeys: Set<string>
): { unmapped: Record<string, string>; formatted: string } {
  const unmapped: Record<string, string> = {};
  const formattedParts: string[] = [];

  for (const [key, val] of Object.entries(row)) {
    if (matchedKeys.has(key)) continue;
    if (val === undefined || val === null) continue;
    const strVal = String(val).trim();
    if (strVal === '' || strVal === '-' || strVal === '0') continue;

    // استبعاد المفاتيح الفنية أو التلقائية
    const cKey = cleanKey(key);
    if (cKey === 'id' || cKey === '__row__' || cKey === 'index') continue;

    unmapped[key] = strVal;
    formattedParts.push(`${key}: ${strVal}`);
  }

  return {
    unmapped,
    formatted: formattedParts.join(' | ')
  };
}

/**
 * دمج معلومات إضافية جديدة مع المعلومات السابقة دون فقدان أي بيانات
 */
export function mergeAdditionalInfo(
  existingInfo?: string,
  incomingInfo?: string,
  sourceLabel?: string
): string {
  const existing = (existingInfo || '').trim();
  const incoming = (incomingInfo || '').trim();

  if (!incoming) return existing;
  if (!existing) return incoming;

  // فحص منع التكرار المطابق
  if (existing.includes(incoming)) return existing;

  const timestamp = new Date().toLocaleDateString('ar-YE');
  const sourcePrefix = sourceLabel ? `[تحديث ${sourceLabel} - ${timestamp}]` : `[تحديث ${timestamp}]`;

  return `${existing}\n\n${sourcePrefix}: ${incoming}`;
}

export type SovereignDepartment =
  | 'travelers'
  | 'seizures'
  | 'migrants'
  | 'refugees'
  | 'foreigners'
  | 'mofa_visas'
  | 'reports'
  | 'permits';

export interface DepartmentDetectionResult {
  suggestedDepartment: SovereignDepartment;
  label: string;
  reason: string;
  confidence: number;
}

/**
 * محرك الفحص والتعرف التلقائي الذكي على الوحدة المناسبة لمحتوى الملف
 * يفحص الكلمات الدلالية، طبيعة الأعمدة، ونسب الجنسيات ونوع الوثيقة
 */
export function detectSuggestedDepartment(
  records: ExtractedTravelerData[],
  rawTextSample: string = '',
  rawColumns: string[] = []
): DepartmentDetectionResult {
  const cleanedColumnsText = cleanArabicText(rawColumns.join(' '));
  const allText = cleanArabicText(
    rawTextSample +
      ' ' +
      cleanedColumnsText +
      ' ' +
      records
        .slice(0, 30)
        .map(r => `${r.firstName} ${r.lastName} ${r.country || ''} ${r.agency || ''} ${r.status || ''} ${r.returnReason || ''} ${r.vettingResult || ''}`)
        .join(' ')
  ).toLowerCase();

  const normAll = normalizeArabic(allText);
  const normCols = normalizeArabic(cleanedColumnsText).toLowerCase();

  // 1. فحص مذكرات تسهيل مرور سيارات الجوازات وكشوفات الملخص العددي للوكالات -> وحدة البلاغات والتقارير
  const hasRealIndividualIds = records.some(r => {
    const id = String(r.idNumber || '').trim();
    return id && !/^(AUTO|PDF|SCAN|RPT|BULK)-/i.test(id) && /\d{5,}/.test(id);
  });
  const isCourierTransitMemo =
    normAll.includes('تسهيل مرور') ||
    normAll.includes('نقطة الامنية') ||
    normAll.includes('النقاط الامنية') ||
    normAll.includes('الوسيط الناقل') ||
    normAll.includes('تسهيل اليمن') ||
    (normAll.includes('رقم اللوحة') && normAll.includes('اسم السائق'));
  const isAgencySummaryReport =
    (normAll.includes('الدفعات المستلمة') && normAll.includes('ملخص')) ||
    (normAll.includes('اجماليات مركز') && !hasRealIndividualIds) ||
    (normAll.includes('عدد الجوازات') && normAll.includes('اعادة ارسال') && !hasRealIndividualIds);

  if (!hasRealIndividualIds && (isCourierTransitMemo || isAgencySummaryReport)) {
    return {
      suggestedDepartment: 'reports',
      label: 'البلاغات والتقارير الميدانية (إرساليات وملخصات النقل)',
      reason: isCourierTransitMemo
        ? 'تم رصد خطاب/مذكرة تسهيل مرور شحنة جوازات (بيانات السائق والمركبة وعدد الجوازات)'
        : 'تم رصد كشف ملخص إجمالي لأعداد الجوازات حسب الوكالات دون أسماء مسافري أفراد',
      confidence: 0.97
    };
  }

  // 2. اكتشاف كشوفات التأشيرات الصادرة لليمنيين (السفارة + الوكالة + المركز + التأشيرة + ت. الخروج / الإستلام + مؤشر/مرتجع)
  const hasAgencyCol =
    normCols.includes('وكاله') ||
    normCols.includes('مكتب') ||
    normAll.includes('اسم الوكالة') ||
    normAll.includes('الدفعات المستلمة - تفصيلي');
  const hasVisaCol = normCols.includes('تاشير') || normCols.includes('فيزا') || normAll.includes('نوع التأشيرة');
  const hasReturnOrExitCol =
    normCols.includes('ارتجاع') ||
    normCols.includes('ارجاع') ||
    normCols.includes('خروج') ||
    normCols.includes('استلام') ||
    normCols.includes('طريقة الارسال') ||
    normAll.includes('مؤشر') ||
    normAll.includes('مرتجع') ||
    normAll.includes('الخارجة من السفارة');
  const yemeniRatio =
    records.length > 0
      ? records.filter(r => !r.country || normalizeArabic(r.country).includes('يمن')).length / records.length
      : 1;

  if (hasAgencyCol && (hasVisaCol || hasReturnOrExitCol) && yemeniRatio >= 0.6) {
    return {
      suggestedDepartment: 'travelers',
      label: 'التأشيرات الصادرة لليمنيين ووكالات السفر',
      reason: 'تم رصد كشف تأشيرات وجوازات صادر لليمنيين مع الوكالة وتواريخ الخروج/الإستلام — سيتم ربط وكالات السفر تلقائياً',
      confidence: 0.98
    };
  }

  const scores: Record<SovereignDepartment, number> = {
    foreigners: 0,
    refugees: 0,
    migrants: 0,
    seizures: 0,
    mofa_visas: 0,
    reports: 0,
    permits: 0,
    travelers: 10
  };

  const foreignerKeywords = [
    'رقم الإقامة', 'رقم الاقامة', 'كفيل', 'اسم الكفيل', 'جهة العمل', 'تصريح عمل',
    'خروج وعودة', 'وافد', 'وافدين', 'أجنبي', 'اجنبي', 'مقيم', 'تجديد إقامة', 'منشأة', 'استمارة أمنية'
  ];

  const mofaKeywords = [
    'وزارة الخارجية', 'دائرة المراسم', 'مذكرة خارجية', 'مانيفست', 'manifest',
    'flight manifest', 'msf', 'أطباء بلا حدود', 'echo', 'المفوضية الأوروبية',
    'أمم متحدة', 'united nations', 'laissez-passer', 'osesgy', 'برامج التغذية', 'wfp',
    'ocha', 'undp', 'دبلوماسية'
  ];

  const refugeeKeywords = [
    'unhcr', 'مفوضية', 'لجوء', 'تصريح لجوء', 'وثيقة لجوء', 'كرت لجوء', 'مخيم',
    'إريتري', 'صومالي', 'لاجئ', 'لاجئين', 'حماية دولية'
  ];

  const migrantKeywords = [
    'هجرة غير شرعية', 'تسلل', 'إيواء', 'ترحيل', 'مركز إيواء', 'نقطة تسلل',
    'مهاجر', 'مهاجرين', 'إثيوبي', 'أورومو', 'أورومي', 'ساحل', 'سواحل', 'قارب', 'محتجزين'
  ];

  const seizureKeywords = [
    'محضر ضبط', 'جواز محتجز', 'تزوير', 'اشتباه تزوير', 'إحالة نيابة',
    'قضية ضبط', 'مضبوطات', 'حظر سفر', 'تعميم أمني', 'تحريز', 'محرز', 'نقطة يسلح', 'الحزام الأمني'
  ];

  const permitKeywords = [
    'تصريح تنقل', 'خط السير', 'نقاط التفتيش', 'تحرك وفد', 'مرافقة أمنية', 'أمر مهمة', 'internal movement'
  ];

  const reportKeywords = [
    'بلاغ ضبط', 'تعميم مطلوب', 'الوسيط الناقل', 'تسهيل مرور سيارة', 'ملخص الدفعات'
  ];

  foreignerKeywords.forEach(k => {
    if (allText.includes(k)) scores.foreigners += 25;
  });
  mofaKeywords.forEach(k => {
    if (allText.includes(k)) scores.mofa_visas += 35;
  });
  refugeeKeywords.forEach(k => {
    if (allText.includes(k)) scores.refugees += 35;
  });
  migrantKeywords.forEach(k => {
    if (allText.includes(k)) scores.migrants += 35;
  });
  seizureKeywords.forEach(k => {
    if (allText.includes(k)) scores.seizures += 40;
  });
  permitKeywords.forEach(k => {
    if (allText.includes(k)) scores.permits += 35;
  });
  reportKeywords.forEach(k => {
    if (allText.includes(k)) scores.reports += 30;
  });

  // فحص نسب الجنسيات في السجلات
  if (records.length > 0) {
    const totalCount = records.length;
    let nonYemeniCount = 0;
    let ethiopianCount = 0;
    let somaliCount = 0;

    for (const r of records) {
      const c = (r.country || '').trim().toLowerCase();
      if (c && !c.includes('يمن') && !c.includes('yemen')) {
        nonYemeniCount++;
      }
      if (c.includes('إثيوب') || c.includes('اثيوب') || c.includes('ethiopia')) {
        ethiopianCount++;
      }
      if (c.includes('صومال') || c.includes('somalia') || c.includes('إريتر') || c.includes('اريتري')) {
        somaliCount++;
      }
    }

    const nonYemeniRatio = nonYemeniCount / totalCount;
    if (nonYemeniRatio > 0.4) {
      scores.foreigners += 30;
    }
    if (ethiopianCount / totalCount > 0.3) {
      scores.migrants += 45;
    }
    if (somaliCount / totalCount > 0.3) {
      scores.refugees += 45;
    }
  }

  let highest: SovereignDepartment = 'travelers';
  let maxScore = scores.travelers;

  const departments: SovereignDepartment[] = [
    'seizures',
    'mofa_visas',
    'permits',
    'reports',
    'refugees',
    'migrants',
    'foreigners'
  ];
  for (const dep of departments) {
    if (scores[dep] > maxScore && scores[dep] >= 35) {
      maxScore = scores[dep];
      highest = dep;
    }
  }

  const reasons: Record<SovereignDepartment, { label: string; reason: string }> = {
    travelers: {
      label: 'حركة المسافرين والتأشيرات',
      reason: 'البيانات تطابق سجل المسافرين والتأشيرات الصادرة ووكالات السفر'
    },
    foreigners: {
      label: 'وحدة الوافدين والإقامات الأجنبية',
      reason: 'تم رصد بيانات تخص الإقامات، الكفلاء، جهات العمل، أو جنسيات غير يمنية'
    },
    mofa_visas: {
      label: 'مذكرات وتأشيرات الخارجية والمنظمات والرحلات',
      reason: 'تم رصد بيانات مذكرات رسمية من وزارة الخارجية، منظمات دولية، أو كشوفات رحلات طيران إنسانية'
    },
    refugees: {
      label: 'وحدة شؤون اللاجئين (UNHCR)',
      reason: 'تم رصد إشارات لملفات المفوضية السامية، تصاريح لجوء، أو جنسيات لاجئة'
    },
    migrants: {
      label: 'وحدة قضايا الهجرة غير الشرعية',
      reason: 'تم رصد إشارات للتسلل الساحلي، مراكز الإيواء، أو جنسيات مهاجرين غير نظاميين'
    },
    seizures: {
      label: 'وحدة محاضر الضبط والجوازات المحتجزة',
      reason: 'تم رصد بيانات محاضر ضبط، اشتباه تزوير، أو جوازات سفر محرزة ومحالة'
    },
    permits: {
      label: 'وحدة تصاريح التنقل والتحرك الداخلي',
      reason: 'تم رصد طلبات وخطوط سير وتصاريح حركة لوفود ومنظمات داخلية'
    },
    reports: {
      label: 'بلاغات الضبط والتقارير الميدانية',
      reason: 'تم رصد تقرير إرسالية أو ملخص إجمالي أو تعميم أمني'
    }
  };

  const confidence = Math.min(1.0, maxScore / 80);

  return {
    suggestedDepartment: highest,
    label: reasons[highest].label,
    reason: reasons[highest].reason,
    confidence
  };
}
