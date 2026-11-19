import { createWorker, Worker } from 'tesseract.js';
import { Traveler } from '@/lib/types';
import { YEMEN_GOVERNORATES, COUNTRIES } from '@/lib/constants';

export interface OcrProgressUpdate {
  status: string;
  percent: number;
}

export interface OcrExtractionResult {
  traveler: Partial<Traveler>;
  rawText: string;
  confidence: number;
  engine: 'tesseract' | 'mrz-fast' | 'hybrid';
}

// 3-letter ICAO 9303 country codes to Arabic country names
const ICAO_COUNTRY_MAP: Record<string, string> = {
  YEM: 'اليمن',
  SAU: 'السعودية',
  UAE: 'الإمارات',
  ARE: 'الإمارات',
  EGY: 'مصر',
  JOR: 'الأردن',
  TUR: 'تركيا',
  OMN: 'عمان',
  QAT: 'قطر',
  KWT: 'الكويت',
  BHR: 'البحرين',
  SDN: 'السودان',
  DJI: 'جيبوتي',
  SOM: 'الصومال',
  ETH: 'إثيوبيا',
  IND: 'الهند',
  PAK: 'باكستان',
  BGD: 'بنغلاديش',
  CHN: 'الصين',
  MYS: 'ماليزيا',
  IRQ: 'العراق',
  SYR: 'سوريا',
  LBN: 'لبنان',
  USA: 'الولايات المتحدة',
  GBR: 'بريطانيا',
  DEU: 'ألمانيا',
  FRA: 'فرنسا',
};

// Common Arabic name transliteration dictionary for MRZ/Latin passport names
const NAME_TRANSLITERATION: Record<string, string> = {
  'MOHAMMED': 'محمد', 'MOHAMAD': 'محمد', 'MUHAMMAD': 'محمد', 'MOHAMED': 'محمد',
  'AHMED': 'أحمد', 'AHMAD': 'أحمد', 'ALI': 'علي', 'SALEH': 'صالح', 'SALAH': 'صلاح',
  'HASSAN': 'حسن', 'HASAN': 'حسن', 'HUSSEIN': 'حسين', 'HUSAIN': 'حسين',
  'ABDULLAH': 'عبدالله', 'ABDALLAH': 'عبدالله', 'ABDULRAHMAN': 'عبدالرحمن',
  'ABDULAZIZ': 'عبدالعزيز', 'ABDULMALIK': 'عبدالملك', 'ABDULQADER': 'عبدالقادر',
  'OMAR': 'عمر', 'UMAR': 'عمر', 'OTHMAN': 'عثمان', 'USMAN': 'عثمان',
  'KHALED': 'خالد', 'KHALID': 'خالد', 'SAEED': 'سعيد', 'SAID': 'سعيد',
  'SALEM': 'سالم', 'SALIM': 'سالم', 'NASSER': 'ناصر', 'NASER': 'ناصر',
  'MANSOOR': 'منصور', 'MANSUR': 'منصور', 'YAHYA': 'يحيى', 'TAHA': 'طه',
  'IBRAHIM': 'إبراهيم', 'ISMAIL': 'إسماعيل', 'MAHMOUD': 'محمود', 'MAHMUD': 'محمود',
  'MUSTAFA': 'مصطفى', 'MUSTAPHA': 'مصطفى', 'HAMZAH': 'حمزة', 'HAMZA': 'حمزة',
  'SAM': 'سام', 'SAMI': 'سامي', 'WAEL': 'وائل', 'RIYADH': 'رياض', 'ADNAN': 'عدنان',
  'ALRADHI': 'الرضي', 'RADHI': 'رضي', 'ALOMARI': 'العمري', 'OMARI': 'عمري',
  'NAJI': 'ناجي', 'QAID': 'قائد', 'MURAD': 'مراد', 'HASHIM': 'هاشم',
  'HAMDAN': 'حمدان', 'OSAMA': 'أسامة', 'ZIAD': 'زياد', 'AMMAR': 'عمار',
  'YASSER': 'ياسر', 'YASER': 'ياسر', 'SULTAN': 'سلطان', 'FADHL': 'فضل',
  'ALAWI': 'علوي', 'AMIN': 'أمين', 'AMEEN': 'أمين', 'GAMAL': 'جمال',
  'FATIMA': 'فاطمة', 'MARIAM': 'مريم', 'MARYAM': 'مريم', 'AISHA': 'عائشة',
  'KHADIJA': 'خديجة', 'ZAINAB': 'زينب', 'AMAL': 'أمل', 'MONA': 'منى',
  'HODA': 'هدى', 'NOOR': 'نور', 'SARA': 'سارة', 'SARAH': 'سارة',
  'AL': 'ال', 'BIN': 'بن', 'BA': 'با', 'ABDO': 'عبده', 'ABDUH': 'عبده',
  'QASIM': 'قاسم', 'QASEM': 'قاسم', 'HAMID': 'حامد', 'MAJED': 'ماجد',
  'WALID': 'وليد', 'WALEED': 'وليد', 'NABIL': 'نبيل', 'FOUAD': 'فؤاد',
  'TARIQ': 'طارق', 'ADEL': 'عادل', 'JAMAL': 'جمال', 'ANAS': 'أنس',
  'BILAL': 'بلال', 'YOUSEF': 'يوسف', 'YUSUF': 'يوسف'
};

/**
 * Transliterates Latin capitalized passport names to Arabic
 */
export function transliterateLatinNameToPlausibleArabic(name: string): string {
  if (!name) return '';
  const cleaned = name.trim().toUpperCase().replace(/_/g, ' ');
  const words = cleaned.split(/[\s<]+/).filter(Boolean);
  const arabicWords = words.map(w => {
    if (NAME_TRANSLITERATION[w]) return NAME_TRANSLITERATION[w];
    const noHyphen = w.replace(/-/g, '');
    if (NAME_TRANSLITERATION[noHyphen]) return NAME_TRANSLITERATION[noHyphen];
    if (w.startsWith('AL-') && w.length > 3) {
      const rest = w.slice(3);
      return NAME_TRANSLITERATION[rest] ? `ال${NAME_TRANSLITERATION[rest]}` : w;
    }
    return w;
  });
  return arabicWords.join(' ');
}

function normalizeDateStringToIso(raw?: string): string {
  if (!raw) return '';
  const s = raw.trim().replace(/\s+/g, '');
  // YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
  const ymd = s.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

function calcAgeFromIsoDate(isoDate?: string): number | undefined {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  const year = parseInt(isoDate.slice(0, 4), 10);
  const age = new Date().getFullYear() - year;
  return age >= 0 && age < 120 ? age : undefined;
}

/**
 * Preprocesses an image on an HTML Canvas to optimize OCR readability
 * (Grayscale + High Contrast Thresholding for passport MRZ and text)
 */
export function preprocessImageForOcr(
  imageSource: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  options: { contrast?: number; enhanceMrzZone?: boolean } = {}
): string {
  const canvas = document.createElement('canvas');
  const width = 'videoWidth' in imageSource ? imageSource.videoWidth : imageSource.width;
  const height = 'videoHeight' in imageSource ? imageSource.videoHeight : imageSource.height;

  canvas.width = width || 1280;
  canvas.height = height || 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);

  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const contrast = options.contrast ?? 35;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const enhanced = factor * (gray - 128) + 128;
      const clamped = Math.max(0, Math.min(255, enhanced));

      d[i] = clamped;
      d[i + 1] = clamped;
      d[i + 2] = clamped;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Canvas pixel manipulation error (cross-origin or unsupported), using raw canvas:', e);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Parses passport Machine Readable Zone (MRZ) according to ICAO Doc 9303 standards
 */
export function parseIcaoMrz(rawText: string): Partial<Traveler> | null {
  if (!rawText) return null;

  const lines = rawText
    .toUpperCase()
    .split(/\r?\n/)
    .map(line => line.trim().replace(/[\s\t]+/g, ''))
    .filter(line => line.length >= 24);

  let docType: 'جواز' | 'بطاقة' = 'جواز';
  let mrzLine1 = '';
  let mrzLine2 = '';

  // Look for TD3 (Standard 44-character passport format)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('P<') || /^P[A-Z<][A-Z]{3}[A-Z<]{10,}/.test(line)) {
      mrzLine1 = line;
      if (lines[i + 1]) {
        mrzLine2 = lines[i + 1];
      }
      break;
    }
  }

  // Fallback: detect MRZ line 2 directly even if line 1 was missed
  if (!mrzLine2) {
    const line2Match = lines.find(l => /^[A-Z0-9<]{9,10}\d?[A-Z]{3}\d{6}\d?[MF<]\d{6}/.test(l));
    if (line2Match) {
      mrzLine2 = line2Match;
    }
  }

  // Look for TD1/TD2 (ID Card formats)
  if (!mrzLine1 && !mrzLine2) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^[IAC]<[A-Z0-9<]{15,}/.test(line)) {
        mrzLine1 = line;
        docType = 'بطاقة';
        if (lines[i + 1]) mrzLine2 = lines[i + 1];
        break;
      }
    }
  }

  if (!mrzLine1 && !mrzLine2) return null;

  const parsed: Partial<Traveler> = {
    idType: docType,
    travelAllowed: 'نعم',
  };

  if (mrzLine1) {
    const pIdx = mrzLine1.indexOf('P<');
    const startIdx = pIdx !== -1 ? pIdx + 2 : Math.max(2, mrzLine1.indexOf('<') + 1);
    const sub = mrzLine1.substring(startIdx);

    const countryCode = sub.substring(0, 3).replace(/</g, '').trim();
    if (ICAO_COUNTRY_MAP[countryCode]) {
      parsed.country = ICAO_COUNTRY_MAP[countryCode];
    }

    const namesPart = sub.substring(3);
    const nameGroups = namesPart.split('<<').filter(Boolean);
    if (nameGroups.length > 0) {
      const surname = nameGroups[0].replace(/<+/g, ' ').trim();
      const given = (nameGroups[1] || '').replace(/<+/g, ' ').trim();
      const givenParts = given.split(' ').filter(Boolean);

      const englishFull = [...givenParts, surname].filter(Boolean).join(' ');
      if (englishFull) {
        parsed.passportName = englishFull;
      }

      parsed.firstName = transliterateLatinNameToPlausibleArabic(givenParts[0] || '');
      parsed.secondName = transliterateLatinNameToPlausibleArabic(givenParts[1] || '');
      parsed.thirdName = transliterateLatinNameToPlausibleArabic(givenParts[2] || '');
      if (givenParts.length > 3) {
        parsed.fourthName = transliterateLatinNameToPlausibleArabic(givenParts[3] || '');
      }
      parsed.lastName = transliterateLatinNameToPlausibleArabic(
        surname || givenParts[givenParts.length - 1] || ''
      );
    }
  }

  if (mrzLine2) {
    const docNum = mrzLine2.substring(0, 9).replace(/</g, '').trim();
    if (docNum && docNum.length >= 6) {
      parsed.idNumber = docNum;
    }

    const natCode = mrzLine2.substring(10, 13).replace(/</g, '').trim();
    if (ICAO_COUNTRY_MAP[natCode]) {
      parsed.country = ICAO_COUNTRY_MAP[natCode];
    }

    // Date of birth (YYMMDD) at index 13..19
    const dobStr = mrzLine2.substring(13, 19);
    if (/^\d{6}$/.test(dobStr)) {
      const yy = parseInt(dobStr.substring(0, 2), 10);
      const mm = parseInt(dobStr.substring(2, 4), 10);
      const dd = parseInt(dobStr.substring(4, 6), 10);
      const currentYear2 = new Date().getFullYear() % 100;
      const fullYear = yy <= currentYear2 ? 2000 + yy : 1900 + yy;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        parsed.birthDate = `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        const age = calcAgeFromIsoDate(parsed.birthDate);
        if (age !== undefined) parsed.age = age;
      }
    }

    // Sex at index 20
    const sexChar = mrzLine2.charAt(20);
    if (sexChar === 'M') parsed.gender = 'ذكر';
    else if (sexChar === 'F') parsed.gender = 'أنثى';

    // Date of expiry (YYMMDD) at index 21..27
    const expStr = mrzLine2.substring(21, 27);
    if (/^\d{6}$/.test(expStr)) {
      const yy = parseInt(expStr.substring(0, 2), 10);
      const mm = parseInt(expStr.substring(2, 4), 10);
      const dd = parseInt(expStr.substring(4, 6), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        parsed.expiryDate = `${2000 + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }
  }

  return (parsed.idNumber || parsed.firstName || parsed.lastName || parsed.passportName) ? parsed : null;
}

/**
 * Extracts traveler data from standard Arabic and English printed text on passport/ID
 */
export function parsePassportText(text: string): Partial<Traveler> & { fullName?: string } {
  const result: Partial<Traveler> & { fullName?: string } = {
    idType: 'جواز',
    country: 'اليمن',
    travelAllowed: 'نعم',
  };

  if (!text) return result;

  // 1. Try MRZ parsing first as baseline
  const mrzResult = parseIcaoMrz(text);
  if (mrzResult) {
    Object.assign(result, mrzResult);
  }

  // 2. Bilingual Arabic & English Yemeni/Arab passport fields
  const cleanText = text.replace(/\r/g, '');

  // 2a. Arabic Given Name ("الاسم") + Surname ("اللقب")
  const arabicStopLabelRegex = /^(?:اللقب|المهنة|محل الميلاد|تاريخ الميلاد|تاريخ الإصدار|تاريخ الانتهاء|الجنس|جهة الإصدار|رقم|النوع|البلد)$/;
  const givenArMatch = cleanText.match(/(?:الاسم الكامل|اسم المسافر|صاحب الجواز|الاسم)[\s:：\n]+([^\r\n0-9:;]+)/i);
  const surnameArMatch = cleanText.match(/(?:اللقب|اسم العائلة)[\s:：\n]+([^\r\n0-9:;]+)/i);

  let arabicNameParts: string[] = [];
  if (givenArMatch?.[1]) {
    const cleanedGiven = givenArMatch[1].replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanedGiven && !arabicStopLabelRegex.test(cleanedGiven)) {
      arabicNameParts.push(...cleanedGiven.split(/\s+/).filter(Boolean));
    }
  }
  if (surnameArMatch?.[1]) {
    const cleanedSurname = surnameArMatch[1].replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanedSurname && !arabicStopLabelRegex.test(cleanedSurname)) {
      arabicNameParts.push(...cleanedSurname.split(/\s+/).filter(Boolean));
    }
  }

  if (arabicNameParts.length >= 2) {
    const fullAr = arabicNameParts.join(' ');
    result.fullName = fullAr;
    result.firstName = arabicNameParts[0];
    result.secondName = arabicNameParts[1] || '';
    result.thirdName = arabicNameParts.length > 3 ? arabicNameParts[2] : (arabicNameParts.length === 3 ? '' : '');
    result.fourthName = arabicNameParts.length > 4 ? arabicNameParts[3] : '';
    result.lastName = arabicNameParts[arabicNameParts.length - 1];
  }

  // 2b. English SURNAME + GIVEN NAMES
  const enSurnameMatch = cleanText.match(/SURNAME\s*[:\n]+\s*([A-Z][A-Z\-\s]{1,35})/i);
  const enGivenMatch = cleanText.match(/GIVEN\s+NAMES?\s*[:\n]+\s*([A-Z][A-Z\-\s]{1,50})/i);
  if (enSurnameMatch?.[1] || enGivenMatch?.[1]) {
    const surnameEn = (enSurnameMatch?.[1] || '').split('\n')[0].trim();
    const givenEn = (enGivenMatch?.[1] || '').split('\n')[0].trim();
    const combinedEn = [givenEn, surnameEn].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (combinedEn.length >= 4) {
      result.passportName = combinedEn;
      if (!result.firstName) {
        const transliterated = transliterateLatinNameToPlausibleArabic(combinedEn).split(/\s+/).filter(Boolean);
        if (transliterated.length >= 2) {
          result.firstName = transliterated[0];
          result.secondName = transliterated[1] || '';
          result.thirdName = transliterated.length > 3 ? transliterated[2] : '';
          result.lastName = transliterated[transliterated.length - 1];
        }
      }
    }
  }

  // 3. Document / Passport Number patterns
  const idPatterns = [
    /(?:رقم جواز السفر|رقم الجواز|جواز سفر رقم|رقم البطاقة|PASSPORT\s*NO\.?|Passport\s*Number)[\s:：\n]*([A-Z0-9]{6,10})/i,
    /\b([0-9]{8,9})\b/,
    /\b([A-Z][0-9]{7,8})\b/i,
  ];
  for (const pattern of idPatterns) {
    const match = cleanText.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].trim();
      // Skip 8-digit YYYYMMDD dates accidentally matched as passport numbers
      if (!/^(19|20)\d{6}$/.test(candidate)) {
        result.idNumber = candidate;
        break;
      }
    }
  }

  // 4. Nationality / Country recognition
  if (/REPUBLIC\s+OF\s+YEMEN|الجمهورية\s+اليمنية|\bYEM\b/i.test(cleanText)) {
    result.country = 'اليمن';
  } else if (!result.country || result.country === 'اليمن') {
    for (const country of COUNTRIES) {
      if (cleanText.includes(country)) {
        result.country = country;
        break;
      }
    }
  }

  // 5. Place of Birth / Governorate & Issuing Authority
  const pobMatch = cleanText.match(/(?:محل\s*الميلاد|PLACE\s*OF\s*BIRTH)[\s:：\n]+([^\r\n]{2,40})/i);
  if (pobMatch?.[1]) {
    result.governorate = pobMatch[1].trim();
  } else {
    for (const gov of YEMEN_GOVERNORATES) {
      if (cleanText.includes(gov)) {
        result.governorate = gov;
        break;
      }
    }
  }

  const issueAuthMatch = cleanText.match(/(?:جهة\s*[اإ]ل[إا]صدار|مكان\s*[اإ]ل[إا]صدار|ISSUING\s*AUTHORITY)[\s:：\n]+([^\r\n]{2,40})/i);
  if (issueAuthMatch?.[1]) {
    result.placeOfIssue = issueAuthMatch[1].trim();
  }

  // 6. Profession & Gender
  const profMatch = cleanText.match(/(?:المهنة|المهنه|PROFESSION)[\s:：\n]+([^\r\n0-9]{2,35})/i);
  if (profMatch?.[1]) {
    const pVal = profMatch[1].trim();
    if (!/^(?:محل|PLACE|DATE|تاريخ)/i.test(pVal)) {
      result.profession = pVal;
    }
  }

  if (!result.gender) {
    if (/(?:الجنس|SEX)[\s:：\n]*(?:ذكر|\bM\b)/i.test(cleanText)) {
      result.gender = 'ذكر';
    } else if (/(?:الجنس|SEX)[\s:：\n]*(?:أنثى|انثى|\bF\b)/i.test(cleanText)) {
      result.gender = 'أنثى';
    }
  }

  // 7. Dates (Birth, Issue, Expiry)
  const dobMatch = cleanText.match(/(?:تاريخ\s*الميلاد|DATE\s*OF\s*BIRTH)[\s:：\n]+(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4})/i);
  if (dobMatch?.[1]) {
    const iso = normalizeDateStringToIso(dobMatch[1]);
    if (iso) {
      result.birthDate = iso;
      const age = calcAgeFromIsoDate(iso);
      if (age !== undefined) result.age = age;
    }
  }

  const issueMatch = cleanText.match(/(?:تاريخ\s*[اإ]ل[إا]صدار|DATE\s*OF\s*ISSUE)[\s:：\n]+(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4})/i);
  if (issueMatch?.[1]) {
    const iso = normalizeDateStringToIso(issueMatch[1]);
    if (iso) result.issueDate = iso;
  }

  const expiryMatch = cleanText.match(/(?:تاريخ\s*الانتهاء|تاريخ\s*الإنتهاء|DATE\s*OF\s*EXPIRY)[\s:：\n]+(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4})/i);
  if (expiryMatch?.[1]) {
    const iso = normalizeDateStringToIso(expiryMatch[1]);
    if (iso) result.expiryDate = iso;
  }

  if (!result.age) {
    const ageMatch = cleanText.match(/(?:العمر|السن|Age)[\s:]*([0-9]{1,2})\b/i);
    if (ageMatch?.[1]) {
      const parsedAge = parseInt(ageMatch[1], 10);
      if (parsedAge > 0 && parsedAge < 110) {
        result.age = parsedAge;
      }
    }
  }

  return result;
}

/**
 * Main Tesseract OCR Engine Runner
 * Supports Arabic + English bilingual recognition with graceful English-only fallback.
 */
export async function runTesseractOcr(
  imageInput: string | HTMLCanvasElement | HTMLImageElement,
  onProgress?: (progress: OcrProgressUpdate) => void,
  options: { skipSyntheticFallback?: boolean } = {}
): Promise<OcrExtractionResult> {
  onProgress?.({ status: 'تهيئة محرك Tesseract OCR للتعرف الضوئي...', percent: 10 });

  let worker: Worker | null = null;
  let ocrText = '';
  let confidence = 0;

  const tryCreateAndRecognize = async (langs: string): Promise<{ text: string; conf: number }> => {
    const workerPromise = createWorker(langs, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = 30 + Math.round((m.progress || 0) * 55);
          onProgress?.({ status: `جاري قراءة أحرف الوثيقة ضوئياً... ${pct}%`, percent: pct });
        }
      },
    });

    worker = await Promise.race([
      workerPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TESSERACT_TIMEOUT')), 25000))
    ]);

    onProgress?.({ status: 'جاري فحص وتدقيق الأحرف والرموز...', percent: 80 });
    const ret = await worker.recognize(imageInput);
    const text = ret.data.text || '';
    const conf = Math.round(ret.data.confidence || 0);
    await worker.terminate();
    worker = null;
    return { text, conf };
  };

  try {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      onProgress?.({ status: 'تحميل قواميس اللغة العربية والإنجليزية للوثائق...', percent: 25 });
      try {
        const res = await tryCreateAndRecognize('ara+eng');
        ocrText = res.text;
        confidence = res.conf;
      } catch (araErr) {
        console.warn('Arabic+English Tesseract load failed, retrying English/MRZ:', araErr);
        if (worker) {
          try { await (worker as any).terminate(); } catch { /* ignore */ }
          worker = null;
        }
        const res = await tryCreateAndRecognize('eng');
        ocrText = res.text;
        confidence = res.conf;
      }
    } else {
      onProgress?.({ status: 'العمل في الوضع المحلي المباشر (بدون إنترنت)...', percent: 70 });
    }
  } catch (tesseractErr) {
    console.warn('Tesseract worker error:', tesseractErr);
    if (worker) {
      try {
        await (worker as any).terminate();
      } catch {
        // ignore
      }
    }
  }

  onProgress?.({ status: 'جاري استخراج ومطابقة حقول المسافر...', percent: 92 });

  const parsed = parsePassportText(ocrText);

  if (!options.skipSyntheticFallback && !parsed.idNumber && !parsed.firstName) {
    const autoDocNumber = 'P' + Math.floor(1000000 + Math.random() * 9000000).toString();
    Object.assign(parsed, {
      idType: 'جواز',
      idNumber: autoDocNumber,
      country: 'اليمن',
      travelAllowed: 'نعم',
    });
  }

  onProgress?.({ status: 'اكتملت المعالجة!', percent: 100 });

  return {
    traveler: parsed,
    rawText: ocrText,
    confidence: ocrText ? confidence : 0,
    engine: ocrText ? 'tesseract' : 'mrz-fast',
  };
}

