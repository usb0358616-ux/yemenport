import { generateSmartMappingWithGemini, SmartMappingItem } from '../services/geminiService';
import { FIELD_SYNONYMS } from './smartFieldMatcher';
import { normalizeArabic } from './storage';
import { appBrain } from './LearningBrainService';

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reason: string;
}

/**
 * Local sovereign matching using synonyms and brain
 */
export function localMatchColumn(column: string): { target: string; confidence: number; reason: string } {
  const normCol = normalizeArabic(column).toLowerCase().trim();
  if (!normCol) {
    return { target: 'ignore', confidence: 0.1, reason: 'عمود فارغ' };
  }

  // Exact short column headers (e.g., م / ت / #)
  if (normCol === 'م' || normCol === 'م.' || normCol === 'ت' || normCol === 'no' || normCol === '#' || normCol === 'sn') {
    return {
      target: 'serialNumber',
      confidence: 0.99,
      reason: 'مطابقة تسلسلي: الرقم التسلسلي في الكشف (م)'
    };
  }

  // 1. Check brain memory
  const brainPred = appBrain.predictField(column);
  if (brainPred && brainPred !== 'ignore') {
    return {
      target: brainPred,
      confidence: 0.95,
      reason: 'مطابقة مبنية على ذاكرة التعلم الآلي والخبرة السابقة'
    };
  }

  // 2. Check synonyms directly
  const synonymMapping: [keyof typeof FIELD_SYNONYMS, string, string][] = [
    ['serialNumber', 'serialNumber', 'مطابقة تسلسلي: الرقم التسلسلي (م)'],
    ['passportName', 'passportName', 'مطابقة وثيقة: اسم الجواز'],
    ['name', 'fullName', 'مطابقة ذكية: الاسم الكامل'],
    ['idNumber', 'idNumber', 'مطابقة وثيقة: رقم الجواز / الهوية'],
    ['passportStatus', 'passportStatus', 'مطابقة وثيقة: حالة الجواز'],
    ['profession', 'profession', 'مطابقة بيانات شخصية: المهنة / الوظيفة'],
    ['issueDate', 'issueDate', 'مطابقة وثيقة: تاريخ الإصدار'],
    ['expiryDate', 'expiryDate', 'مطابقة وثيقة: تاريخ الانتهاء'],
    ['placeOfIssue', 'placeOfIssue', 'مطابقة وثيقة: مكان الإصدار'],
    ['gender', 'gender', 'مطابقة بيانات شخصية: الجنس'],
    ['birthDate', 'birthDate', 'مطابقة بيانات شخصية: تاريخ الميلاد'],
    ['country', 'nationality', 'مطابقة بيانات: الجنسية'],
    ['phone', 'phone', 'مطابقة اتصال: رقم الهاتف'],
    ['governorate', 'governorate', 'مطابقة جغرافية: المحافظة'],
    ['destination', 'destination', 'مطابقة حركة: الوجهة'],
    ['visitReason', 'visitReason', 'مطابقة حركة: سبب الزيارة'],
    ['visaType', 'visaType', 'مطابقة تأشيرات: نوع التأشيرة'],
    ['center', 'center', 'مطابقة منافذ: المنفذ / المركز'],
    ['agency', 'agency', 'مطابقة وكالات: اسم الوكالة / مكتب السفر'],
    ['receiveDate', 'exitDate', 'مطابقة حركة: ت. الخروج / تاريخ الاستلام'],
    ['status', 'status', 'مطابقة تأشيرات: الحالة (مؤشر / مرتجع)'],
    ['returnReason', 'returnReason', 'مطابقة تأشيرات: سبب الإرتجاع'],
    ['nationalId', 'nationalId', 'مطابقة هوية: الرقم الوطني'],
    ['notes', 'additionalInfo', 'مطابقة معلومات: معلومات إضافية وملاحظات']
  ];

  for (const [synKey, targetField, reasonText] of synonymMapping) {
    const list = FIELD_SYNONYMS[synKey] || [];
    for (const syn of list) {
      const normSyn = normalizeArabic(syn).toLowerCase().trim();
      if (!normSyn) continue;
      if (normCol === normSyn) {
        return {
          target: targetField,
          confidence: 0.98,
          reason: reasonText
        };
      }
      if (normSyn.length >= 3 && normCol.length >= 3 && (normCol.includes(normSyn) || normSyn.includes(normCol))) {
        return {
          target: targetField,
          confidence: 0.88,
          reason: reasonText
        };
      }
    }
  }

  return {
    target: 'ignore',
    confidence: 0.1,
    reason: 'حقل غير معروف تلقائياً، يمكنك اختياره يدوياً'
  };
}

/**
 * Utility to analyze headers and propose database field mappings
 * Combines local sovereign intelligence with optional cloud AI
 */
export async function analyzeHeadersForMapping(
  columns: string[],
  sampleRows: any[]
): Promise<ColumnMapping[]> {
  // First generate high-fidelity local mappings
  const localMappings: ColumnMapping[] = columns.map(col => {
    const match = localMatchColumn(col);
    return {
      sourceColumn: col,
      targetField: match.target,
      confidence: match.confidence,
      reason: match.reason
    };
  });

  // If local matching found strong matches for most columns, return immediately
  const strongMatchesCount = localMappings.filter(m => m.targetField !== 'ignore').length;
  if (strongMatchesCount >= Math.ceil(columns.length * 0.6)) {
    return localMappings;
  }

  // Otherwise, optionally attempt cloud enhancement if online
  if (navigator.onLine) {
    try {
      const mappings = await generateSmartMappingWithGemini(columns, sampleRows);
      if (mappings && mappings.length > 0) {
        return mappings.map(m => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
          confidence: m.confidence,
          reason: m.reason
        }));
      }
    } catch {
      // Soft fallback to local mappings
    }
  }

  return localMappings;
}

export const DB_FIELDS_METADATA = [
  { key: 'serialNumber', label: 'الرقم التسلسلي بالكشف (م)', category: 'travel' },
  { key: 'passportName', label: 'اسم الجواز (اسم المسافر)', category: 'identity' },
  { key: 'fullName', label: 'الاسم الكامل', category: 'personal' },
  { key: 'firstName', label: 'الاسم الأول', category: 'personal' },
  { key: 'secondName', label: 'اسم الأب', category: 'personal' },
  { key: 'thirdName', label: 'اسم الجد', category: 'personal' },
  { key: 'fourthName', label: 'الاسم الرابع', category: 'personal' },
  { key: 'lastName', label: 'اللقب / العائلة', category: 'personal' },
  { key: 'idNumber', label: 'رقم الجواز / الهوية', category: 'identity' },
  { key: 'passportStatus', label: 'حالة الجواز (صالح/منتهي/مفقود)', category: 'identity' },
  { key: 'idType', label: 'نوع الوثيقة', category: 'identity' },
  { key: 'nationality', label: 'الجنسية', category: 'personal' },
  { key: 'profession', label: 'المهنة / الوظيفة', category: 'personal' },
  { key: 'issueDate', label: 'تاريخ إصدار الجواز', category: 'identity' },
  { key: 'expiryDate', label: 'تاريخ انتهاء الجواز', category: 'identity' },
  { key: 'placeOfIssue', label: 'مكان / جهة الإصدار', category: 'identity' },
  { key: 'gender', label: 'الجنس (ذكر/أنثى)', category: 'personal' },
  { key: 'birthDate', label: 'تاريخ الميلاد', category: 'personal' },
  { key: 'nationalId', label: 'الرقم الوطني / الهوية', category: 'identity' },
  { key: 'age', label: 'العمر', category: 'personal' },
  { key: 'phone', label: 'رقم الهاتف', category: 'contact' },
  { key: 'governorate', label: 'المحافظة', category: 'personal' },
  { key: 'destination', label: 'الوجهة', category: 'travel' },
  { key: 'visitReason', label: 'سبب الزيارة', category: 'travel' },
  { key: 'visaType', label: 'التأشيرة / نوع التأشيرة', category: 'travel' },
  { key: 'exitDate', label: 'ت. الخروج / تاريخ السفر', category: 'travel' },
  { key: 'receiveDate', label: 'تاريخ الاستلام', category: 'travel' },
  { key: 'center', label: 'المنفذ / المركز', category: 'travel' },
  { key: 'agency', label: 'إسم الوكالة / مكتب السفر', category: 'travel' },
  { key: 'status', label: 'الحالة (مؤشر / مرتجع)', category: 'travel' },
  { key: 'returnReason', label: 'سبب الإرتجاع', category: 'travel' },
  { key: 'additionalInfo', label: 'معلومات إضافية', category: 'other' },
  { key: 'ignore', label: '-- تجاهل --', category: 'other' }
];
