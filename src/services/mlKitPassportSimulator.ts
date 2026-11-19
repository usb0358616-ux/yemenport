/**
 * محرك محاكاة Google Android ML Kit TextRecognition v2 للويب
 * يحاكي هيكلية كتل النصوص في أندرويد (Text -> TextBlock -> Line -> Element)
 * ويستخرج بيانات جواز السفر تلقائياً (الاسم، رقم الجواز، تاريخ الميلاد، الصلاحية)
 * مع التحقق الأمني الفوري ضد قائمة المطلوبين وبلاغات الضبط.
 */
import { parseImageDocument } from '../lib/imageDocumentParser';
import { splitFullName } from '../lib/localDocumentParser';
import { cleanArabicText, inferGovernorateFromCenter } from '../lib/storage';
import { compressImageFileToDataUrl } from '../lib/formIntelligence';
import {
  verifyOcrPassportAgainstWatchlist,
  WatchlistVerificationResult
} from '../lib/ocrWatchlistGuard';

export interface MlKitTextElement {
  text: string;
  confidence: number;
}

export interface MlKitTextLine {
  text: string;
  confidence: number;
  elements: MlKitTextElement[];
}

export interface MlKitTextBlock {
  id: string;
  regionLabel: string;
  text: string;
  confidence: number;
  lines: MlKitTextLine[];
}

export interface MlKitExtractedFields {
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  lastName: string;
  passportName: string;
  passportNumber: string;
  idType: string;
  birthDate: string;
  age: number;
  nationality: string;
  governorate: string;
  gender: string;
  profession: string;
  placeOfIssue: string;
  issueDate: string;
  expiryDate: string;
  mrzText: string;
}

export interface MlKitVisionResult {
  engineName: string;
  sdkPackage: string;
  processingTimeMs: number;
  sourceFileName: string;
  photoDataUrl: string;
  confidence: number;
  mrzDetected: boolean;
  mrzLines: string[];
  blocks: MlKitTextBlock[];
  rawCombinedText: string;
  extractedFields: MlKitExtractedFields;
  watchlistVerification: WatchlistVerificationResult;
}

function buildMlKitBlock(
  id: string,
  regionLabel: string,
  lineTexts: string[],
  confidence: number
): MlKitTextBlock | null {
  const cleanLines = lineTexts.map(l => l.trim()).filter(Boolean);
  if (cleanLines.length === 0) return null;

  const lines: MlKitTextLine[] = cleanLines.map(lineText => ({
    text: lineText,
    confidence,
    elements: lineText.split(/\s+/).filter(Boolean).map(tok => ({
      text: tok,
      confidence
    }))
  }));

  return {
    id,
    regionLabel,
    text: cleanLines.join('\n'),
    confidence,
    lines
  };
}

function computeAgeFromDob(birthDate?: string, fallbackAge?: number): number {
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const birth = new Date(birthDate);
    if (!isNaN(birth.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      if (age >= 0 && age < 120) return age;
    }
  }
  return fallbackAge && fallbackAge > 0 ? fallbackAge : 0;
}

export async function runMlKitPassportSimulation(
  file: File,
  onProgress?: (stageLabel: string, percent: number) => void
): Promise<MlKitVisionResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  onProgress?.('تهيئة محاكي Android ML Kit TextRecognizer v2...', 15);
  const photoDataUrl = await compressImageFileToDataUrl(file, 960, 0.82);

  onProgress?.('تحليل الصورة واستخلاص كتل النصوص ثنائية اللغة (عربي / إنجليزي)...', 45);
  const extraction = await parseImageDocument(file);

  onProgress?.('تفسير حقول الجواز ومنطقة القراءة الآلية ICAO 9303 MRZ...', 78);
  const td = extraction.travelerData;

  const resolvedFullAr = cleanArabicText(
    td?.fullName ||
      [td?.firstName, td?.secondName, td?.thirdName, td?.fourthName, td?.lastName]
        .filter(Boolean)
        .join(' ')
  );
  const nameParts = resolvedFullAr
    ? splitFullName(resolvedFullAr)
    : {
        firstName: td?.firstName || '',
        secondName: td?.secondName || '',
        thirdName: td?.thirdName || '',
        fourthName: td?.fourthName || '',
        lastName: td?.lastName || ''
      };

  const birthDate = td?.birthDate || '';
  const age = computeAgeFromDob(birthDate, td?.age);
  const passportNumber = String(td?.idNumber || '').trim();
  const passportName = String(td?.passportName || '').trim();
  const nationality = cleanArabicText(td?.country || 'اليمن') || 'اليمن';
  const governorate =
    cleanArabicText(td?.governorate || '') ||
    inferGovernorateFromCenter(td?.placeOfIssue || '') ||
    'أمانة العاصمة';

  // Extract MRZ lines if present in rawTextSample or additionalInfo
  const mrzSource = `${extraction.rawTextSample || ''}\n${td?.additionalInfo || ''}`;
  const mrzCandidates = mrzSource
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^MRZ:\s*/i, ''))
    .filter(l => /[A-Z0-9<]{20,}/.test(l) && l.includes('<'));

  const mrzMatchFromInfo = td?.additionalInfo?.match(/MRZ:\s*([^\n|]+)/i);
  if (mrzCandidates.length === 0 && mrzMatchFromInfo?.[1]) {
    const tokens = mrzMatchFromInfo[1].trim().split(/\s+/);
    mrzCandidates.push(...tokens.filter(t => t.includes('<')));
  }

  const conf = Math.round((extraction.confidence || 0.85) * 100) / 100;

  const blocks: MlKitTextBlock[] = [
    buildMlKitBlock(
      'blk-header',
      'HEADER / ISSUING_STATE',
      [
        nationality === 'اليمن' ? 'REPUBLIC OF YEMEN · الجمهورية اليمنية' : nationality,
        td?.idType === 'بطاقة' ? 'IDENTITY CARD · بطاقة شخصية' : 'PASSPORT · جواز سفر'
      ],
      conf
    ),
    buildMlKitBlock(
      'blk-passport-no',
      'PASSPORT_NUMBER_BOX',
      passportNumber ? [`PASSPORT NO: ${passportNumber}`] : [],
      conf
    ),
    buildMlKitBlock(
      'blk-name-ar',
      'ARABIC_IDENTITY_BLOCK',
      [
        resolvedFullAr ? `الاسم الكامل: ${resolvedFullAr}` : '',
        td?.profession ? `المهنة: ${td.profession}` : '',
        governorate ? `محل الميلاد: ${governorate}` : ''
      ],
      conf
    ),
    buildMlKitBlock(
      'blk-name-en',
      'LATIN_IDENTITY_BLOCK',
      passportName ? [`FULL NAME (EN): ${passportName}`] : [],
      conf
    ),
    buildMlKitBlock(
      'blk-dates',
      'DATES_AND_METADATA_BLOCK',
      [
        birthDate ? `DATE OF BIRTH: ${birthDate}` : '',
        td?.gender ? `SEX: ${td.gender}` : '',
        td?.issueDate ? `DATE OF ISSUE: ${td.issueDate}` : '',
        td?.expiryDate ? `DATE OF EXPIRY: ${td.expiryDate}` : '',
        td?.placeOfIssue ? `ISSUING AUTHORITY: ${td.placeOfIssue}` : ''
      ],
      conf
    ),
    buildMlKitBlock(
      'blk-mrz',
      'ICAO_9303_MRZ_ZONE',
      mrzCandidates,
      Math.min(0.99, conf + 0.02)
    )
  ].filter((b): b is MlKitTextBlock => b !== null);

  onProgress?.('مطابقة البيانات المستخرجة مع قائمة المطلوبين أمنياً وبلاغات الضبط...', 92);
  const watchlistVerification = verifyOcrPassportAgainstWatchlist({
    fullName: resolvedFullAr,
    fullNameEnglish: passportName,
    passportNumber,
    birthDate,
    sourceType: 'mlkit_upload',
    sourceLabel: `محاكاة ML Kit OCR (${file.name})`,
    emitDashboardAlert: true
  });

  const elapsed = Math.max(
    120,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
  );

  onProgress?.('اكتمل الاستخراج والفحص الأمني بنجاح', 100);

  return {
    engineName: 'Android ML Kit TextRecognition v2 (Simulated Web Adapter)',
    sdkPackage: 'com.google.mlkit:text-recognition:16.0.1',
    processingTimeMs: elapsed,
    sourceFileName: file.name,
    photoDataUrl,
    confidence: conf,
    mrzDetected: mrzCandidates.length > 0,
    mrzLines: mrzCandidates,
    blocks,
    rawCombinedText: blocks.map(b => b.text).join('\n\n'),
    extractedFields: {
      fullName: resolvedFullAr,
      firstName: td?.firstName || nameParts.firstName,
      secondName: td?.secondName || nameParts.secondName,
      thirdName: td?.thirdName || nameParts.thirdName,
      fourthName: td?.fourthName || nameParts.fourthName,
      lastName: td?.lastName || nameParts.lastName,
      passportName,
      passportNumber,
      idType: td?.idType || 'جواز',
      birthDate,
      age,
      nationality,
      governorate,
      gender: td?.gender || '',
      profession: td?.profession || '',
      placeOfIssue: td?.placeOfIssue || '',
      issueDate: td?.issueDate || '',
      expiryDate: td?.expiryDate || '',
      mrzText: mrzCandidates.join('\n')
    },
    watchlistVerification
  };
}
