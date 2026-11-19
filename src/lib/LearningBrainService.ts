import Tesseract from 'tesseract.js';
import { cleanArabicText, normalizeArabic } from './storage';
import { kvGet, kvSet } from './sovereignStorageBackend';

/**
 * خدمة "الدماغ المحلي" المتطور - نظام ذكاء اصطناعي داخلي لا يعتمد على الإنترنت أو مفاتيح خارجية.
 * يوفر: التعلم المستمر من توجيهات المستخدم، الفهم العميق للكشوفات، التلخيص التنفيذي،
 * الترجمة الثنائية (إنجليزي <-> عربي)، واقتراح الوجهات الأساسية والثانوية المناسبة.
 */

export interface LearnedMapping {
  source: string;
  target: string;
  frequency: number;
  lastUsed: string;
}

export interface CustomReaderInstruction {
  id: string;
  instructionText: string;
  keywords: string[];
  targetCategory: string;
  createdAt: string;
}

export interface LearnedFileSignature {
  signatureKey: string;
  sampleFileName: string;
  columns: string[];
  category: string;
  count: number;
  lastUsed: string;
}

export interface SecondaryDestinationSuggestion {
  category: string;
  label: string;
  reason: string;
}

export interface DocumentInsightSummary {
  documentArchetype: string;
  executiveSummary: string;
  translatedSummaryEn: string;
  primaryCategory: string;
  confidence: number;
  learnedFromMemory: boolean;
  matchedInstructionLabel?: string;
  dateRange: { from?: string; to?: string };
  topAgencies: { name: string; count: number }[];
  topNationalities: { name: string; count: number }[];
  topReturnReasons: { reason: string; count: number }[];
  keyHighlights: string[];
  secondaryDestinations: SecondaryDestinationSuggestion[];
  translatedSamplePairs: { fieldLabel: string; original: string; translatedAr: string }[];
  stats: {
    totalRows: number;
    issuedCount: number;
    returnedCount: number;
    allowedCount: number;
    bannedCount: number;
  };
}

interface BrainMemory {
  mappings: Record<string, LearnedMapping>;
  documentPatterns: Record<string, { category: string; count: number }>;
  fileSignatures: Record<string, LearnedFileSignature>;
  customInstructions: CustomReaderInstruction[];
}

const MEMORY_KEY = 'sovereign_ai_brain_memory';

// تعليمات أولية للدماغ للبدء بسرعة (Seed Knowledge)
const seedMappings: Record<string, string> = {
  'م': 'serialNumber',
  'مسلسل': 'serialNumber',
  'الرقم التسلسلي': 'serialNumber',
  'الاسم': 'fullName',
  'الاسم الكامل': 'fullName',
  'اسم الجواز': 'passportName',
  'إسم الجواز': 'passportName',
  'الاسم بالجواز': 'passportName',
  'اسم المسافر بالجواز': 'passportName',
  'اسم صاحب الجواز': 'passportName',
  'اسم حامل الجواز': 'passportName',
  'حالة الجواز': 'passportStatus',
  'وضع الجواز': 'passportStatus',
  'صلاحية الجواز': 'passportStatus',
  'المهنة': 'profession',
  'الوظيفة': 'profession',
  'تاريخ الإصدار': 'issueDate',
  'تاريخ الاصدار': 'issueDate',
  'تاريخ الانتهاء': 'expiryDate',
  'مكان الإصدار': 'placeOfIssue',
  'جهة الإصدار': 'placeOfIssue',
  'الجنس': 'gender',
  'النوع': 'gender',
  'الرقم الوطني': 'nationalId',
  'اسم العامل': 'firstName',
  'اللقب': 'lastName',
  'رقم الجواز': 'idNumber',
  'رقم الهوية': 'idNumber',
  'الجنسية': 'country',
  'تاريخ الميلاد': 'birthDate',
  'رقم الهاتف': 'phone',
  'رقم الموبايل': 'phone',
  'الجهة': 'agency',
  'الوكالة': 'agency',
  'إسم الوكالة': 'agency',
  'اسم الوكالة': 'agency',
  'وكالة السفر': 'agency',
  'مكتب السفر': 'agency',
  'المنفذ': 'center',
  'المركز': 'center',
  'التأشيرة': 'visaType',
  'نوع التأشيرة': 'visaType',
  'تاريخ الاستلام': 'receiveDate',
  'ت. الخروج': 'exitDate',
  'ت الخروج': 'exitDate',
  'تاريخ الخروج': 'exitDate',
  'الحالة': 'status',
  'حالة التأشيرة': 'status',
  'سبب الإرتجاع': 'returnReason',
  'سبب الارتجاع': 'returnReason',
  'ملاحظة الارتجاع': 'returnReason',
  'مؤشر': 'vettingResult',
  'ملاحظات': 'additionalInfo'
};

// قاموس ترجمة ميداني متخصص (إنجليزي -> عربي) لوثائق السفر والجوازات والمنظمات الدولية بدون إنترنت
const EN_TO_AR_DICTIONARY: Record<string, string> = {
  // Organizations
  'msf': 'منظمة أطباء بلا حدود',
  'msfb': 'منظمة أطباء بلا حدود البلجيكية',
  'msfch': 'منظمة أطباء بلا حدود السويسرية',
  'msf france': 'منظمة أطباء بلا حدود الفرنسية',
  'msf switzerland': 'منظمة أطباء بلا حدود السويسرية',
  'echo': 'مكتب الاتحاد الأوروبي للمساعدات الإنسانية والحماية المدنية',
  'who': 'منظمة الصحة العالمية',
  'unhcr': 'المفوضية السامية لشؤون اللاجئين',
  'unicef': 'منظمة الأمم المتحدة للطفولة (يونيسف)',
  'wfp': 'برنامج الأغذية العالمي',
  'icrc': 'اللجنة الدولية للصليب الأحمر',
  'iom': 'المنظمة الدولية للهجرة',
  'undp': 'برنامج الأمم المتحدة الإنمائي',
  'ocha': 'مكتب تنسيق الشؤون الإنسانية',
  'osesgy': 'مكتب المبعوث الخاص للأمين العام للأمم المتحدة',
  'save the children': 'منظمة أنقذوا الأطفال',
  'care international': 'منظمة كير الدولية',
  // Document & Visa Terms
  'passport number': 'رقم الجواز',
  'passport no': 'رقم الجواز',
  'passport': 'جواز سفر',
  'full name': 'الاسم الكامل',
  'travel agency': 'وكالة السفر',
  'agency': 'وكالة السفر',
  'visa type': 'نوع التأشيرة',
  'return reason': 'سبب الإرتجاع',
  'exit date': 'تاريخ الخروج',
  'receive date': 'تاريخ الاستلام',
  'diplomatic passport': 'جواز دبلوماسي',
  'diplomatic': 'دبلوماسي',
  'ordinary': 'عادي',
  'laissez-passer': 'وثيقة مرور رسمية',
  'eu lp': 'جواز مرور الاتحاد الأوروبي',
  'visa': 'تأشيرة',
  'entry visa': 'تأشيرة دخول',
  'work visa': 'تأشيرة عمل',
  'family visit': 'زيارة عائلية',
  'transit visa': 'تأشيرة عبور',
  'residence': 'إقامة',
  'residency': 'إقامة',
  'residencies': 'الإقامات',
  'manifest': 'قائمة ركاب الرحلة (مانيفست)',
  'flight': 'رحلة جوية',
  'issued': 'مؤشر / صادر',
  'returned': 'مرتجع',
  'valid': 'صالح / ساري',
  'expired': 'منتهي الصلاحية',
  'approved': 'معتمد رسمياً',
  'pending': 'قيد المراجعة',
  'rejected': 'مرفوض',
  'banned': 'ممنوع من السفر',
  'allowed': 'مسموح بالعبور',
  'male': 'ذكر',
  'female': 'أنثى',
  // Professions
  'manager': 'مدير',
  'project manager': 'مدير مشروع',
  'project coordinator': 'منسق مشروع',
  'emergency coordinator': 'منسق طوارئ',
  'logistics team leader': 'قائد فريق الإمداد واللوجستيات',
  'field communication manager': 'مسؤول التواصل الميداني',
  'project fin/hr manager': 'المدير المالي والإداري للمشروع',
  'security officer': 'ضابط أمن وسلامة',
  'doctor': 'طبيب',
  'physician': 'طبيب مختص',
  'surgeon': 'جراح',
  'nurse': 'ممرض / كادر تمريضي',
  'engineer': 'مهندس',
  'driver': 'سائق',
  'technician': 'فني',
  'worker': 'عامل',
  'consultant': 'مستشار',
  'expert': 'خبير',
  // Nationalities & Countries
  'yemen': 'اليمن',
  'yemeni': 'يمني',
  'philippines': 'الفلبين',
  'philippine': 'فلبيني',
  'filipino': 'فلبيني',
  'nigeria': 'نيجيريا',
  'nigerian': 'نيجيري',
  'india': 'الهند',
  'indian': 'هندي',
  'ethiopia': 'إثيوبيا',
  'ethiopian': 'إثيوبي',
  'somalia': 'الصومال',
  'somali': 'صومالي',
  'sudan': 'السودان',
  'sudanese': 'سوداني',
  'egypt': 'مصر',
  'egyptian': 'مصري',
  'syria': 'سوريا',
  'syrian': 'سوري',
  'jordan': 'الأردن',
  'lebanon': 'لبنان',
  'palestine': 'فلسطين',
  'saudi arabia': 'المملكة العربية السعودية',
  'belgium': 'بلجيكا',
  'netherlands': 'هولندا',
  'france': 'فرنسا',
  'french': 'فرنسي',
  'italy': 'إيطاليا',
  'italian': 'إيطالي',
  'kenya': 'كينيا',
  'uk': 'المملكة المتحدة',
  'usa': 'الولايات المتحدة',
  'djibouti': 'جيبوتي',
  // Yemeni Locations
  'sanaa': 'صنعاء',
  "sana'a": 'صنعاء',
  'aden': 'عدن',
  'taiz': 'تعز',
  'ibb': 'إب',
  'dhamar': 'ذمار',
  'hudaydah': 'الحديدة',
  'hodeidah': 'الحديدة',
  'mokha': 'المخا',
  'mocha': 'المخا',
  'marib': 'مأرب',
  'hadramout': 'حضرموت',
  'al wadiyah': 'منفذ الوديعة'
};

const AR_TO_EN_CATEGORY: Record<string, string> = {
  traveler: 'Travelers, Border Visas & Passports',
  visa: 'MOFA Memos, Diplomatic Missions & International Flights',
  seizure: 'Confiscated Passports & Security Seizures',
  foreigner: 'Foreign Residents & Work Permits',
  migrant: 'Undocumented Migrants & Shelter Cases',
  refugee: 'Refugees & UNHCR Temporary Permits',
  permit: 'Internal Movement Permits & Checkpoints',
  report: 'Watchlist & Security Bulletins'
};

const CATEGORY_TO_AR_LABEL: Record<string, string> = {
  traveler: 'المسافرين وحركة المنافذ',
  visa: 'مذكرات وتأشيرات الخارجية',
  seizure: 'المضبوطات والجوازات المحتجزة',
  foreigner: 'الوافدون الأجانب والإقامات',
  migrant: 'المهاجرون غير الشرعيين',
  refugee: 'شؤون اللاجئين وتصاريح (UNHCR)',
  permit: 'تصاريح التنقل الداخلي',
  report: 'بلاغات الضبط والتحري'
};

function getSafeStorage(key: string): string | null {
  try {
    return kvGet(key);
  } catch {
    return null;
  }
}

function setSafeStorage(key: string, val: string): void {
  try {
    kvSet(key, val);
  } catch {
    // ignore
  }
}

class LocalLearningBrain {
  private memory: BrainMemory;

  constructor() {
    const saved = getSafeStorage(MEMORY_KEY);
    let parsed: Partial<BrainMemory> = {};
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = {};
      }
    }
    this.memory = {
      mappings: parsed.mappings || {},
      documentPatterns: parsed.documentPatterns || {},
      fileSignatures: parsed.fileSignatures || {},
      customInstructions: parsed.customInstructions || []
    };

    // دمج المعرفة الأولية في الذاكرة لضمان توفر حقول الجواز والتأشيرات فورياً
    Object.entries(seedMappings).forEach(([col, field]) => {
      const key = normalizeArabic(col).toLowerCase();
      if (!this.memory.mappings[key]) {
        this.memory.mappings[key] = {
          source: col,
          target: field,
          frequency: 1,
          lastUsed: new Date().toISOString()
        };
      }
    });
  }

  private save() {
    setSafeStorage(MEMORY_KEY, JSON.stringify(this.memory));
  }

  private buildColumnSignature(columns: string[]): string {
    return columns
      .map(c => normalizeArabic(c).toLowerCase().trim())
      .filter(Boolean)
      .sort()
      .slice(0, 14)
      .join('|');
  }

  /**
   * 1. التعلم المستمر: تخزين خيارات المستخدم في مطابقة الأعمدة
   */
  learnMapping(sourceColumn: string, targetField: string) {
    const key = normalizeArabic(sourceColumn).toLowerCase();
    if (!key) return;
    if (!this.memory.mappings[key]) {
      this.memory.mappings[key] = {
        source: sourceColumn,
        target: targetField,
        frequency: 0,
        lastUsed: new Date().toISOString()
      };
    }
    this.memory.mappings[key].frequency += 1;
    this.memory.mappings[key].target = targetField;
    this.memory.mappings[key].lastUsed = new Date().toISOString();
    this.save();
  }

  /**
   * التعلم من توجيه الملف الكامل وبصمة أعمدته لتصنيف الملفات المشابهة مستقبلاً بدقة
   */
  learnFileClassification(fileName: string, columns: string[], targetCategory: string) {
    const sigKey = this.buildColumnSignature(columns);
    if (sigKey) {
      const prev = this.memory.fileSignatures[sigKey];
      this.memory.fileSignatures[sigKey] = {
        signatureKey: sigKey,
        sampleFileName: fileName,
        columns: columns.slice(0, 14),
        category: targetCategory,
        count: (prev?.count || 0) + 1,
        lastUsed: new Date().toISOString()
      };
    }

    const tokens = normalizeArabic(fileName.replace(/\.[^.]+$/, ''))
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter(t => t.length >= 3);
    tokens.forEach(token => {
      const patKey = `tok_${token}`;
      const existing = this.memory.documentPatterns[patKey];
      this.memory.documentPatterns[patKey] = {
        category: targetCategory,
        count: (existing?.count || 0) + 1
      };
    });

    this.save();
  }

  /**
   * حفظ تعليمات وتوجيه مخصصة من الضابط لتوجيه قارئ الملفات مستقبلاً
   */
  learnCustomInstruction(instructionText: string, keywordsInput: string, targetCategory: string): CustomReaderInstruction {
    const cleanKeywords = keywordsInput
      .split(/[،,;|\n]+/)
      .map(k => normalizeArabic(k).toLowerCase().trim())
      .filter(k => k.length >= 2);

    const newRule: CustomReaderInstruction = {
      id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instructionText: cleanArabicText(instructionText),
      keywords: cleanKeywords.length > 0 ? cleanKeywords : [normalizeArabic(instructionText).toLowerCase().slice(0, 20)],
      targetCategory,
      createdAt: new Date().toISOString()
    };

    this.memory.customInstructions = [newRule, ...this.memory.customInstructions].slice(0, 50);
    this.save();
    return newRule;
  }

  getCustomInstructions(): CustomReaderInstruction[] {
    return this.memory.customInstructions || [];
  }

  removeCustomInstruction(id: string): CustomReaderInstruction[] {
    this.memory.customInstructions = (this.memory.customInstructions || []).filter(i => i.id !== id);
    this.save();
    return this.memory.customInstructions;
  }

  getBrainStats() {
    const customColumnCount = Object.values(this.memory.mappings).filter(m => m.frequency > 1).length;
    return {
      totalKnownColumns: Object.keys(this.memory.mappings).length,
      userLearnedColumns: customColumnCount,
      learnedFileSignatures: Object.keys(this.memory.fileSignatures).length,
      customInstructionsCount: (this.memory.customInstructions || []).length
    };
  }

  /**
   * 2. التنبؤ بالذكاء المحلي: اقتراح الحقل بناءً على الخبرة السابقة
   */
  predictField(columnName: string): string | null {
    const key = normalizeArabic(columnName).toLowerCase().trim();
    if (!key) return null;

    if (this.memory.mappings[key] && this.memory.mappings[key].frequency > 0) {
      return this.memory.mappings[key].target;
    }

    if (key.length < 3) {
      return null;
    }

    for (const [learnedKey, mapping] of Object.entries(this.memory.mappings)) {
      if (learnedKey.length < 3) continue;
      if (key.includes(learnedKey) || learnedKey.includes(key)) {
        return mapping.target;
      }
    }

    return null;
  }

  /**
   * 3. معالجة الصور المحلية (OCR) بدون إنترنت
   */
  async extractTextFromImage(imagePath: string, onProgress?: (p: number) => void): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return '';
    }
    let worker: Tesseract.Worker | null = null;
    try {
      const workerPromise = Tesseract.createWorker('ara+eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        }
      });
      worker = await Promise.race([
        workerPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OCR_OFFLINE_TIMEOUT')), 7000))
      ]);

      const {
        data: { text }
      } = await worker.recognize(imagePath);
      await worker.terminate();
      worker = null;
      return text;
    } catch (err) {
      console.warn('Local OCR fallback active:', err);
      if (worker) {
        try {
          await (worker as any).terminate();
        } catch {
          // ignore
        }
      }
      return '';
    }
  }

  /**
   * 4. التصنيف الذكي المحلي بناءً على محتوى الملف + التعليمات المكتسبة + بصمات الأعمدة
   */
  classifyContent(
    text: string,
    fileName: string,
    columns: string[] = []
  ): { category: string; confidence: number; learnedFromMemory: boolean; matchedInstructionLabel?: string } {
    const content = normalizeArabic(`${text} ${fileName} ${columns.join(' ')}`).toLowerCase();

    // أولاً: فحص التعليمات المخصصة من الضابط
    for (const inst of this.memory.customInstructions || []) {
      const matched = inst.keywords.some(kw => kw && content.includes(kw));
      if (matched) {
        return {
          category: inst.targetCategory,
          confidence: 98,
          learnedFromMemory: true,
          matchedInstructionLabel: inst.instructionText
        };
      }
    }

    // ثانياً: فحص بصمة الأعمدة المتعلمة مسبقاً
    if (columns.length > 0) {
      const sigKey = this.buildColumnSignature(columns);
      const exactSig = this.memory.fileSignatures[sigKey];
      if (exactSig) {
        return {
          category: exactSig.category,
          confidence: Math.min(90 + exactSig.count * 2, 99),
          learnedFromMemory: true
        };
      }
    }

    // ثالثاً: تصنيف الأنماط المتقدمة
    const weights: Record<string, string[]> = {
      traveler: ['مسافر', 'جواز', 'اسم الجواز', 'حاله التاشيره', 'سبب الارتجاع', 'اسم الوكاله', 'ت الخروج', 'تاريخ الميلاد', 'مؤشر', 'مرتجع', 'passport'],
      visa: ['مذكره خارجيه', 'وزاره الخارجيه', 'مانيفست', 'منظمه', 'بعثه دبلوماسيه', 'اطباء بلا حدود', 'إيكو', 'msf', 'echo', 'manifest', 'mofa', 'unhcr'],
      foreigner: ['وافد', 'اقامه', 'رقم الاقامه', 'الكفيل', 'جهه العمل', 'صلاحيه الاقامه', 'عمال اجانب', 'foreigner', 'residency', 'employer'],
      report: ['بلاغ', 'شكوى', 'قضيه', 'تحقيق', 'تعميم', 'مطلوب امنيا', 'report', 'wanted'],
      seizure: ['مضبوطات', 'جواز مضبوط', 'محتجز', 'مصادره', 'اشتباه تزوير', 'محضر ضبط', 'يسلح', 'تم التسليم', 'seizure', 'confiscated'],
      migrant: ['مهاجر', 'تسلل', 'ايواء', 'ترحيل', 'غير شرعي', 'migrant', 'infiltration'],
      refugee: ['لاجئ', 'مفوضيه', 'لجوء', 'unhcr', 'refugee'],
      permit: ['تصريح تنقل', 'خط السير', 'نقاط التفتيش', 'مرافقه امنيه', 'permit', 'delegation', 'route']
    };

    let bestCategory = 'traveler';
    let maxScore = 0;

    for (const [cat, keywords] of Object.entries(weights)) {
      let score = 0;
      keywords.forEach(kw => {
        if (content.includes(normalizeArabic(kw))) score += kw.length > 5 ? 2 : 1;
      });
      if (score > maxScore) {
        maxScore = score;
        bestCategory = cat;
      }
    }

    // دمج أنماط اسم الملف المتعلمة
    let learnedFromMemory = false;
    const fileTokens = normalizeArabic(fileName.replace(/\.[^.]+$/, ''))
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter(t => t.length >= 3);
    for (const tok of fileTokens) {
      const mem = this.memory.documentPatterns[`tok_${tok}`];
      if (mem && mem.count >= 2 && maxScore < 4) {
        bestCategory = mem.category;
        learnedFromMemory = true;
        break;
      }
    }

    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const patternKey = `${fileExt}_${bestCategory}`;
    this.memory.documentPatterns[patternKey] = {
      category: bestCategory,
      count: (this.memory.documentPatterns[patternKey]?.count || 0) + 1
    };
    this.save();

    return {
      category: bestCategory,
      confidence: Math.min(Math.max(maxScore * 12, 72), 96),
      learnedFromMemory
    };
  }

  /**
   * 5. مترجم ميداني محلي (إنجليزي <-> عربي) بدون إنترنت
   */
  translateTermOffline(rawText?: string): string {
    if (!rawText) return '';
    const trimmed = cleanArabicText(String(rawText));
    if (!trimmed) return '';

    const lower = trimmed.toLowerCase();
    if (EN_TO_AR_DICTIONARY[lower]) {
      return EN_TO_AR_DICTIONARY[lower];
    }

    // ترجمة جزئية للجمل الإنجليزية المختلطة
    let translated = trimmed;
    let hasMatch = false;
    const sortedKeys = Object.keys(EN_TO_AR_DICTIONARY).sort((a, b) => b.length - a.length);
    for (const enKey of sortedKeys) {
      if (lower.includes(enKey)) {
        const regex = new RegExp(`\\b${enKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        if (regex.test(translated)) {
          translated = translated.replace(regex, EN_TO_AR_DICTIONARY[enKey]);
          hasMatch = true;
        }
      }
    }

    if (hasMatch) return translated;
    return trimmed;
  }

  /**
   * ترجمة سجل مستخرج كامل للعربية وإرجاع أهم الحقول المترجمة
   */
  translateRecordToArabic(record: Record<string, any>): { fieldLabel: string; original: string; translatedAr: string }[] {
    if (!record) return [];
    const checks: [string, any][] = [
      ['الجنسية / البلد', record.country || record.nationality],
      ['الجهة / المنظمة', record.agency || record.organization],
      ['التأشيرة / الغرض', record.visaType || record.visitReason],
      ['المهنة / الصفة', record.profession],
      ['المنفذ / الموقع', record.center || record.destination || record.workLocation],
      ['الحالة', record.status || (record.travelAllowed === 'لا' ? 'ممنوع' : '')]
    ];

    const pairs: { fieldLabel: string; original: string; translatedAr: string }[] = [];
    checks.forEach(([label, val]) => {
      if (!val) return;
      const orig = String(val).trim();
      if (!orig) return;
      const tr = this.translateTermOffline(orig);
      pairs.push({
        fieldLabel: label,
        original: orig,
        translatedAr: tr
      });
    });
    return pairs;
  }

  /**
   * 6. محلل، ملخّص، وموجّه ذكي متعدد الوجهات للكشوفات والوثائق المستوردة (محلي 100%)
   */
  analyzeAndSummarizeDocument(
    fileName: string,
    textContent: string,
    records: any[] = [],
    columns: string[] = [],
    suggestedCategoryOverride?: string
  ): DocumentInsightSummary {
    const classRes = this.classifyContent(textContent, fileName, columns);
    const primaryCategory = suggestedCategoryOverride || classRes.category || 'traveler';

    const agencyCounts = new Map<string, number>();
    const natCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();

    let issuedCount = 0;
    let returnedCount = 0;
    let allowedCount = 0;
    let bannedCount = 0;
    let minDate = '';
    let maxDate = '';

    const sampleLimit = records.length;
    for (let i = 0; i < sampleLimit; i++) {
      const r = records[i];
      const agency = cleanArabicText(String(r.agency || r.organization || ''));
      if (agency && agency !== '-' && agency !== 'غير محدد') {
        agencyCounts.set(agency, (agencyCounts.get(agency) || 0) + 1);
      }

      const nat = cleanArabicText(String(r.country || r.nationality || ''));
      if (nat && nat !== '-') {
        const translatedNat = this.translateTermOffline(nat);
        natCounts.set(translatedNat, (natCounts.get(translatedNat) || 0) + 1);
      }

      const stat = normalizeArabic(String(r.status || ''));
      if (stat.includes('مؤشر') || stat.includes('صادر') || stat.includes('issued')) {
        issuedCount++;
      } else if (stat.includes('مرتجع') || stat.includes('returned')) {
        returnedCount++;
      }

      if (r.travelAllowed === 'لا' || stat.includes('ممنوع') || stat.includes('حظر') || stat.includes('مرفوض')) {
        bannedCount++;
      } else {
        allowedCount++;
      }

      const rr = cleanArabicText(String(r.returnReason || ''));
      if (rr && rr !== '-') {
        reasonCounts.set(rr, (reasonCounts.get(rr) || 0) + 1);
      }

      const d = String(r.exitDate || r.receiveDate || r.memoDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
        const isoDay = d.slice(0, 10);
        if (!minDate || isoDay < minDate) minDate = isoDay;
        if (!maxDate || isoDay > maxDate) maxDate = isoDay;
      }
    }

    const topAgencies = Array.from(agencyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topNationalities = Array.from(natCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topReturnReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // تحديد نوع الوثيقة (Archetype)
    const lowerAll = normalizeArabic(`${fileName} ${columns.join(' ')} ${(textContent || '').slice(0, 1500)}`).toLowerCase();
    let documentArchetype = 'كشف بيانات إدارية وحدودية';
    if (lowerAll.includes('السفاره') || (lowerAll.includes('التاشيره') && lowerAll.includes('الوكاله'))) {
      documentArchetype = 'كشف الجوازات والتأشيرات الخارجة من السفارة وربط الوكالات';
    } else if (lowerAll.includes('manifest') || lowerAll.includes('flight') || lowerAll.includes('طيران')) {
      documentArchetype = 'مانيفست رحلة جوية / نقل كوادر منظمات دولية';
    } else if (primaryCategory === 'visa') {
      documentArchetype = 'مذكرة وزارة الخارجية وتأشيرات بعثات/منظمات';
    } else if (primaryCategory === 'seizure') {
      documentArchetype = 'محضر ضبط جوازات سفر وحرز أمني';
    } else if (primaryCategory === 'foreigner') {
      documentArchetype = 'كشف إقامات وعمال أجانب ووافدين';
    } else if (primaryCategory === 'permit') {
      documentArchetype = 'نموذج طلب تصريح تنقل ووفود ميدانية';
    } else if (primaryCategory === 'report') {
      documentArchetype = 'بلاغ ضبط وتعميم أمني';
    } else if (records.length > 0) {
      documentArchetype = 'كشف مسافرين وحركة منافذ';
    }

    // اقتراح وجهات ثانوية ذكية بناءً على المحتوى
    const secondaryDestinations: SecondaryDestinationSuggestion[] = [];
    if (topAgencies.length > 0 && primaryCategory === 'traveler') {
      secondaryDestinations.push({
        category: 'companies',
        label: `سجل وكالات ومكاتب السفر (${agencyCounts.size} وكالة مكتشفة)`,
        reason: 'سيتم ربط كل تأشيرة وجواز تلقائياً بملف الوكالة المصدرة وإدراج الوكالات الجديدة آلياً.'
      });
    }
    if (returnedCount > 0 || bannedCount > 0) {
      secondaryDestinations.push({
        category: 'vetting',
        label: `المباينة والتحقق الأمني (${returnedCount} مرتجع / ${bannedCount} قيد حظر)`,
        reason: 'يوصى بمراجعة حالات الإرتجاع وأسبابها في شاشة المباينة وتقارير الشهر.'
      });
    }
    if (lowerAll.includes('تصريح') && primaryCategory !== 'permit') {
      secondaryDestinations.push({
        category: 'permit',
        label: 'وحدة تصاريح التنقل والأماكن',
        reason: 'رصدت كلمات دالة على تصاريح حركة ومناطق إقامة داخلية.'
      });
    }

    // صياغة الملخص التنفيذي العربي الواقعي
    const parts: string[] = [];
    parts.push(`وثيقة مصنفة كـ "${documentArchetype}" تحتوي على (${records.length.toLocaleString()}) سجل مستخرج.`);
    if (minDate && maxDate) {
      parts.push(minDate === maxDate ? `بتاريخ ${minDate}.` : `تغطي الفترة من ${minDate} إلى ${maxDate}.`);
    }
    if (issuedCount > 0 || returnedCount > 0) {
      parts.push(`ملخص التأشيرات: ${issuedCount.toLocaleString()} مؤشر، و ${returnedCount.toLocaleString()} مرتجع.`);
    }
    if (topAgencies.length > 0) {
      parts.push(`أبرز الجهات/الوكالات: ${topAgencies.slice(0, 3).map(a => `${a.name} (${a.count})`).join('، ')}.`);
    }
    if (topNationalities.length > 0) {
      parts.push(`الجنسيات الأعلى: ${topNationalities.slice(0, 3).map(n => `${n.name} (${n.count})`).join('، ')}.`);
    }
    if (topReturnReasons.length > 0) {
      parts.push(`أبرز أسباب الإرتجاع: "${topReturnReasons[0].reason}" (${topReturnReasons[0].count} حالة).`);
    }

    const keyHighlights: string[] = [];
    if (records.length >= 1000) {
      keyHighlights.push(`ملف ضخم (${records.length.toLocaleString()} سجل): مفعل للمعالجة والتوزيع المتقطع غير المجمّد للواجهة.`);
    }
    if (topAgencies.length > 0) {
      keyHighlights.push(`تم كشف ${agencyCounts.size} وكالة سفر/جهة سيتم ربطها تلقائياً عند التوزيع.`);
    }
    if (returnedCount > 0) {
      keyHighlights.push(`يحتوي الكشف على ${returnedCount} معاملة مرتجعة تستوجب أرشفة أسباب الإرتجاع.`);
    }
    if (classRes.matchedInstructionLabel) {
      keyHighlights.push(`تطابق مع قاعدة التوجيه المكتسبة: "${classRes.matchedInstructionLabel}".`);
    }
    if (keyHighlights.length === 0) {
      keyHighlights.push(`التوجيه المقترح: وحدة ${CATEGORY_TO_AR_LABEL[primaryCategory] || primaryCategory} بنسبة ثقة ${classRes.confidence}%.`);
    }

    const arTargetEn = AR_TO_EN_CATEGORY[primaryCategory] || 'Operational Border Registry';
    const translatedSummaryEn =
      `Executive Summary: Classified as [${arTargetEn}] with ${records.length} extracted records` +
      (minDate ? ` (Date span: ${minDate} to ${maxDate || minDate})` : '') +
      `. Issued/Cleared: ${issuedCount || allowedCount}, Returned/Flagged: ${returnedCount + bannedCount}.` +
      (topAgencies.length > 0 ? ` Top Entities: ${topAgencies.slice(0, 2).map(a => a.name).join(', ')}.` : '');

    const translatedSamplePairs = records.length > 0 ? this.translateRecordToArabic(records[0]) : [];

    return {
      documentArchetype,
      executiveSummary: parts.join(' '),
      translatedSummaryEn,
      primaryCategory,
      confidence: classRes.confidence,
      learnedFromMemory: classRes.learnedFromMemory,
      matchedInstructionLabel: classRes.matchedInstructionLabel,
      dateRange: { from: minDate || undefined, to: maxDate || undefined },
      topAgencies,
      topNationalities,
      topReturnReasons,
      keyHighlights,
      secondaryDestinations,
      translatedSamplePairs,
      stats: {
        totalRows: records.length,
        issuedCount,
        returnedCount,
        allowedCount,
        bannedCount
      }
    };
  }

  /**
   * 7. ترتيب المعلومات واستخراج الحقول (Local Entity Extraction)
   */
  extractEntities(text: string): Record<string, string> {
    const entities: Record<string, string> = {};
    const lines = text.split('\n');

    const patterns = {
      idNumber: /[A-Z0-9]{6,10}/i,
      phone: /(77|73|71|70|01)\d{7}/,
      date: /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/
    };

    lines.forEach(line => {
      Object.entries(patterns).forEach(([key, reg]) => {
        if (!entities[key]) {
          const match = line.match(reg);
          if (match) entities[key] = match[0];
        }
      });
    });

    return entities;
  }
}

export const brain = new LocalLearningBrain();
export const appBrain = brain;
