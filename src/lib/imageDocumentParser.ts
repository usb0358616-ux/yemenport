/**
 * محرك استخراج البيانات الذكي من الصور (جوازات سفر، وثائق إقامة، ومحاضر ضبط أمنية)
 * Intelligent Image OCR & Document Data Extractor
 */

import { ExtractedTravelerData } from './types';
import { cleanArabicText } from './storage';
import { formatParsedDate, splitFullName } from './localDocumentParser';
import { runTesseractOcr } from '../services/tesseractOcrService';

export interface ImageExtractionResult {
  docType: 'passport' | 'seizure_memo' | 'id_card' | 'visa' | 'unknown';
  docTypeLabel: string;
  suggestedDepartment: 'travelers' | 'foreigners' | 'seizures' | 'refugees' | 'migrants';
  confidence: number;
  travelerData?: ExtractedTravelerData;
  seizureData?: {
    recordNumber: string;
    seizurePort: string;
    seizureDate: string;
    driverName: string;
    carPlate: string;
    direction: string;
    reason: string;
    passports: Array<{
      travelerName: string;
      passportNumber: string;
      nationality: string;
      issueDate?: string;
      issueGovernorate?: string;
    }>;
  };
  rawTextSample?: string;
  sourceImageName: string;
}

// Static sample images removed to keep project bundle lightweight
export const ATTACHED_IMAGE_SAMPLES: Array<{
  name: string;
  filename: string;
  url: string;
  tag: string;
  department: 'travelers' | 'foreigners' | 'seizures' | 'refugees' | 'migrants';
  desc: string;
}> = [];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resizeImageDataUrl(dataUrl: string, maxDim = 1600): Promise<{ dataUrl: string; mimeType: string }> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) {
    return { dataUrl, mimeType: 'image/jpeg' };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = img;
        if (!width || !height || (width <= maxDim && height <= maxDim)) {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), mimeType: 'image/jpeg' });
      } catch {
        resolve({ dataUrl, mimeType: 'image/jpeg' });
      }
    };
    img.onerror = () => resolve({ dataUrl, mimeType: 'image/jpeg' });
    img.src = dataUrl;
  });
}

function calcAge(isoDate?: string, explicitAge?: any): number {
  const numAge = Number(explicitAge);
  if (Number.isFinite(numAge) && numAge > 0 && numAge < 120) return numAge;
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const yr = parseInt(isoDate.slice(0, 4), 10);
    const diff = new Date().getFullYear() - yr;
    if (diff >= 0 && diff < 120) return diff;
  }
  return 0;
}

function mapAiParsedToResult(
  parsed: any,
  rawText: string,
  fileName: string
): ImageExtractionResult | null {
  if (!parsed || typeof parsed !== 'object') return null;

  if (parsed.docType === 'seizure_memo' && parsed.seizureData && Array.isArray(parsed.seizureData.passports) && parsed.seizureData.passports.length > 0) {
    return {
      docType: 'seizure_memo',
      docTypeLabel: 'محضر ضبط أمني صادر من استخبارات الشرطة',
      suggestedDepartment: 'seizures',
      confidence: 0.96,
      seizureData: parsed.seizureData,
      rawTextSample: rawText.slice(0, 400),
      sourceImageName: fileName,
    };
  }

  const rawFullAr = cleanArabicText(
    parsed.fullNameArabic ||
      parsed.fullName ||
      [parsed.firstName, parsed.secondName, parsed.thirdName, parsed.fourthName, parsed.lastName]
        .filter(Boolean)
        .join(' ')
  );
  const fullNameEnglish = String(parsed.fullNameEnglish || parsed.passportName || '').trim();
  const idNumber = String(parsed.idNumber || parsed.passportNumber || '').replace(/\s+/g, '').trim();

  if (!rawFullAr && !fullNameEnglish && !idNumber) {
    return null;
  }

  const splitParts = rawFullAr ? splitFullName(rawFullAr) : {
    firstName: '',
    secondName: '',
    thirdName: '',
    fourthName: '',
    lastName: '',
  };

  const firstName = cleanArabicText(parsed.firstName || splitParts.firstName || '');
  const secondName = cleanArabicText(parsed.secondName || splitParts.secondName || '');
  const thirdName = cleanArabicText(parsed.thirdName || splitParts.thirdName || '');
  const fourthName = cleanArabicText(parsed.fourthName || splitParts.fourthName || '');
  const lastName = cleanArabicText(parsed.lastName || splitParts.lastName || '');
  const fullName = rawFullAr || [firstName, secondName, thirdName, fourthName, lastName].filter(Boolean).join(' ');

  const birthDate = formatParsedDate(parsed.birthDate || parsed.dateOfBirth || '');
  const issueDate = formatParsedDate(parsed.issueDate || '');
  const expiryDate = formatParsedDate(parsed.expiryDate || '');
  const age = calcAge(birthDate, parsed.age);

  const country = cleanArabicText(parsed.country || parsed.nationality || 'اليمن') || 'اليمن';
  const isYemeni = /اليمن|يمني|YEM/i.test(country);
  const normalizedCountry = isYemeni ? 'اليمن' : country;

  let suggestedDepartment: ImageExtractionResult['suggestedDepartment'] =
    normalizedCountry === 'اليمن' ? 'travelers' : 'foreigners';
  if (
    parsed.suggestedDepartment === 'travelers' ||
    parsed.suggestedDepartment === 'foreigners' ||
    parsed.suggestedDepartment === 'seizures' ||
    parsed.suggestedDepartment === 'refugees' ||
    parsed.suggestedDepartment === 'migrants'
  ) {
    suggestedDepartment = parsed.suggestedDepartment;
  }

  const docType: ImageExtractionResult['docType'] =
    parsed.docType === 'id_card' || parsed.docType === 'visa' || parsed.docType === 'passport'
      ? parsed.docType
      : 'passport';

  const docTypeLabel =
    docType === 'id_card'
      ? `بطاقة هوية (${normalizedCountry})`
      : docType === 'visa'
        ? `تأشيرة / إقامة (${normalizedCountry})`
        : `جواز سفر (${normalizedCountry})`;

  const governorate = cleanArabicText(parsed.governorate || parsed.placeOfBirth || '');
  const placeOfIssue = cleanArabicText(parsed.placeOfIssue || '');
  const profession = cleanArabicText(parsed.profession || '');
  const gender = cleanArabicText(parsed.gender || '');

  const infoParts = [
    fullNameEnglish ? `الاسم بالإنجليزية: ${fullNameEnglish}` : '',
    birthDate ? `الميلاد: ${birthDate}` : '',
    gender ? `الجنس: ${gender}` : '',
    governorate ? `محل الميلاد: ${governorate}` : '',
    profession ? `المهنة: ${profession}` : '',
    placeOfIssue ? `جهة الإصدار: ${placeOfIssue}` : '',
    issueDate ? `تاريخ الإصدار: ${issueDate}` : '',
    expiryDate ? `تاريخ الانتهاء: ${expiryDate}` : '',
    parsed.mrzText ? `MRZ: ${String(parsed.mrzText).replace(/\s+/g, ' ').trim()}` : '',
  ].filter(Boolean);

  return {
    docType,
    docTypeLabel,
    suggestedDepartment,
    confidence: 0.96,
    travelerData: {
      fullName,
      firstName: firstName || fullName,
      secondName,
      thirdName,
      fourthName,
      lastName,
      passportName: fullNameEnglish,
      idNumber,
      idType: docType === 'id_card' ? 'بطاقة' : 'جواز',
      country: normalizedCountry,
      governorate,
      placeOfIssue,
      birthDate,
      issueDate,
      expiryDate,
      gender,
      profession,
      age,
      destination: cleanArabicText(parsed.destination || ''),
      visitReason: cleanArabicText(parsed.visitReason || ''),
      visaType: cleanArabicText(parsed.visaType || ''),
      travelAllowed: 'نعم',
      status: fullName && idNumber ? 'مستخرج آلياً' : 'بحاجة لمراجعة يدوية',
      additionalInfo: infoParts.join(' | ') || `تم الاستخراج من صورة ${fileName}`,
    },
    rawTextSample: rawText.slice(0, 400),
    sourceImageName: fileName,
  };
}

/**
 * محرك استخراج البيانات من الصور (ملف File محلي أو صورة مستوردة)
 * يعتمد على الرؤية الحاسوبية عبر الخادم ثم التعرف الضوئي المحلي (Tesseract ara+eng + ICAO MRZ) كبديل احتياطي.
 */
export async function parseImageDocument(file: File): Promise<ImageExtractionResult> {
  const fileName = file.name;

  // 1. قراءة الصورة وتصغيرها إن كانت ضخمة لتحسين سرعة ودقة القراءة
  const rawBase64 = await readFileAsDataUrl(file);
  const { dataUrl: optimizedDataUrl, mimeType } = await resizeImageDataUrl(rawBase64, 1600);

  // 2. التحليل الذكي بالرؤية الحاسوبية عبر نقطة الخادم الآمنة
  const isOnline = typeof window === 'undefined' ? true : window.navigator.onLine;
  if (isOnline) {
    try {
      const res = await fetch('/api/gemini/analyze-document-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: optimizedDataUrl,
          mimeType: file.type || mimeType || 'image/jpeg',
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result?.success && result?.parsed) {
          const mapped = mapAiParsedToResult(result.parsed, result.rawText || '', fileName);
          if (mapped) {
            return mapped;
          }
        }
      }
    } catch (aiErr) {
      console.warn('AI Vision extraction failed, falling back to local Tesseract OCR:', aiErr);
    }
  }

  // 3. البديل المحلي: تشغيل محرك Tesseract OCR ثنائي اللغة (ara+eng) + قارئ MRZ ICAO-9303
  try {
    const ocrRes = await runTesseractOcr(optimizedDataUrl, undefined, { skipSyntheticFallback: true });
    const t = ocrRes.traveler as ExtractedTravelerData & { fullName?: string };
    const combinedName = cleanArabicText(
      t.fullName || [t.firstName, t.secondName, t.thirdName, t.fourthName, t.lastName].filter(Boolean).join(' ')
    );

    if (combinedName || t.idNumber || t.passportName) {
      const parts = combinedName ? splitFullName(combinedName) : {
        firstName: '',
        secondName: '',
        thirdName: '',
        fourthName: '',
        lastName: '',
      };
      const country = cleanArabicText(t.country || 'اليمن') || 'اليمن';
      const suggestedDepartment: ImageExtractionResult['suggestedDepartment'] =
        country === 'اليمن' ? 'travelers' : 'foreigners';

      return {
        docType: 'passport',
        docTypeLabel: `جواز سفر (${country}) — تعرف ضوئي محلي (OCR)`,
        suggestedDepartment,
        confidence: Math.max(0.55, Math.min(0.88, (ocrRes.confidence || 70) / 100)),
        travelerData: {
          fullName: combinedName,
          firstName: t.firstName || parts.firstName || '',
          secondName: t.secondName || parts.secondName || '',
          thirdName: t.thirdName || parts.thirdName || '',
          fourthName: t.fourthName || parts.fourthName || '',
          lastName: t.lastName || parts.lastName || '',
          passportName: t.passportName || '',
          idNumber: t.idNumber || '',
          idType: t.idType || 'جواز',
          country,
          governorate: t.governorate || '',
          placeOfIssue: t.placeOfIssue || '',
          birthDate: t.birthDate || '',
          issueDate: t.issueDate || '',
          expiryDate: t.expiryDate || '',
          gender: t.gender || '',
          profession: t.profession || '',
          age: t.age || calcAge(t.birthDate),
          travelAllowed: 'نعم',
          status: combinedName && t.idNumber ? 'مستخرج محلياً (OCR)' : 'بحاجة لمراجعة يدوية',
          additionalInfo: [
            t.passportName ? `الاسم بالإنجليزية: ${t.passportName}` : '',
            t.birthDate ? `الميلاد: ${t.birthDate}` : '',
            t.profession ? `المهنة: ${t.profession}` : '',
            t.placeOfIssue ? `جهة الإصدار: ${t.placeOfIssue}` : '',
            t.expiryDate ? `تاريخ الانتهاء: ${t.expiryDate}` : '',
          ]
            .filter(Boolean)
            .join(' | ') || `تمت القراءة عبر محرك Tesseract OCR من ${fileName}`,
        },
        rawTextSample: (ocrRes.rawText || '').slice(0, 400),
        sourceImageName: fileName,
      };
    }
  } catch (ocrErr) {
    console.warn('Local Tesseract OCR fallback failed:', ocrErr);
  }

  // 4. سجل جاهز للمراجعة اليدوية إذا تعذرت القراءة الآلية كلياً
  return {
    docType: 'unknown',
    docTypeLabel: 'صورة وثيقة (تحتاج مراجعة وتعبئة يدوية)',
    suggestedDepartment: 'travelers',
    confidence: 0.2,
    travelerData: {
      fullName: '',
      firstName: '',
      secondName: '',
      thirdName: '',
      lastName: '',
      idNumber: '',
      idType: 'جواز',
      country: 'اليمن',
      governorate: '',
      age: 0,
      travelAllowed: 'نعم',
      status: 'بحاجة لمراجعة يدوية',
      additionalInfo: `تعذر التعرف الآلي على الحقول من (${fileName}) — يرجى التحقق من اتصال الشبكة أو إكمال الحقول يدوياً في تبويب المعاينة والمراجعة.`,
    },
    sourceImageName: fileName,
  };
}

