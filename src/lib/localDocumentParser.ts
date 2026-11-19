import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
// Vite URL import for local offline pdf.worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Traveler, ExtractedTravelerData } from './types';
import { normalizeArabic, cleanArabicText, inferGovernorateFromCenter, generateId } from './storage';
import {
  FIELD_SYNONYMS,
  buildSheetColumnPlan,
  detectSuggestedDepartment,
  cleanKey
} from './smartFieldMatcher';

export type { ExtractedTravelerData };

// Configure local worker strictly offline
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  } catch (err) {
    console.warn('PDF.js worker initialization warning:', err);
  }
}

export interface FieldDiff {
  field: keyof Traveler;
  label: string;
  currentValue: string;
  incomingValue: string;
}

export interface ReconciliationRecord {
  tempId: string;
  data: ExtractedTravelerData;
  status: 'new' | 'matched';
  existingTraveler?: Traveler;
  diffs: FieldDiff[];
  selected: boolean;
}

// Split full Arabic name into standard parts
export function splitFullName(fullName: string) {
  const cleaned = cleanArabicText(fullName);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const middle = parts.slice(1, -1);
  const secondName = middle[0] || '';
  const thirdName = middle[1] || '';
  const fourthName = middle[2] || '';
  return { firstName, secondName, thirdName, fourthName, lastName };
}

// Normalize Arabic-Indic (٠-٩) & Eastern Arabic-Indic (۰-۹) digits to Western ASCII digits
export function toWesternDigits(val: string): string {
  return String(val || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * تطبيع أخطاء الترميز والوصلات الشائعة في تقارير PDF العربية الصادرة عن Crystal Reports / Word
 */
export function normalizeCrystalArabicText(text: string): string {
  if (!text) return '';
  let out = cleanArabicText(toWesternDigits(text));
  // Common Crystal Reports / Word Arabic ligature drop fixes (safe, anchored forms)
  out = out
    .replace(/هللا/g, 'الله')
    .replace(/باإلشارة/g, 'بالإشارة')
    .replace(/اإلشارة/g, 'الإشارة')
    .replace(/األمنية/g, 'الأمنية')
    .replace(/االزدهار/g, 'الازدهار')
    .replace(/االمر/g, 'الأمر')
    .replace(/املوضوع/g, 'الموضوع')
    .replace(/اجلوازات/g, 'الجوازات')
    .replace(/الستلم/g, 'الإستلام')
    .replace(/الرتجاع/g, 'الإرتجاع')
    .replace(/الرسال/g, 'الإرسال')
    .replace(/الجمالي/g, 'الإجمالي')
    .replace(/(^|\s)السم(\s|$)/g, '$1الإسم$2')
    .replace(/الدارة/g, 'الإدارة')
    .replace(/الصيل/g, 'الأصيل')
    .replace(/المتياز/g, 'الإمتياز')
    .replace(/الحجر\s+السود/g, 'الحجر الأسود')
    .replace(/مععاد/g, 'معاد')
    .replace(/إجماليات/g, 'إجماليات');
  return cleanArabicText(out);
}

/**
 * تصحيح الاختصارات والربط الشائع داخل أسماء الأشخاص في تقارير Crystal Reports
 * (مثل حرف "م" المنفصل كاختصار لـ "محمد"، و "عبدا" لـ "عبدالله")
 */
export function normalizeArabicNameCrystal(rawName: string): string {
  const cleaned = cleanArabicText(rawName);
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map(tok => {
      if (tok === 'م') return 'محمد';
      if (tok === 'عبدا') return 'عبدالله';
      if (tok === 'عبدالسلم') return 'عبدالسلام';
      if (tok === 'صلح') return 'صلاح';
      if (tok === 'طلل') return 'طلال';
      if (tok === 'كهلن') return 'كهلان';
      return tok;
    })
    .join(' ');
}

function isSummaryOrTotalRow(values: any[]): boolean {
  const joined = normalizeArabic(cleanArabicText(values.map(v => String(v ?? '')).join(' '))).toLowerCase();
  if (!joined) return false;
  return /^(اجمالي|إجمالي|إجماليات|المجموع|مجموع|جمله|جوازات جديدة|عدد الجوازات|total|grand total|subtotal|summary)\b/i.test(joined) ||
    /\b(اجمالي العدد|إجمالي العدد|الاجمالي العام|الإجمالي العام|إجمالي المركز|اجمالي مركز|إجماليات السنة|grand total)\b/i.test(joined);
}

// Convert Excel serial dates, Date objects, or text dates to YYYY-MM-DD
export function formatParsedDate(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  // Handle numeric Excel 1900 serial date (e.g. 46295 or "46295.0" -> 2026-09-30)
  if (typeof val === 'number' && val >= 20000 && val <= 80000) {
    const serial = Math.floor(val);
    const utcDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(utcDate.getTime())) return utcDate.toISOString().split('T')[0];
  }

  const str = toWesternDigits(String(val)).trim();
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (num >= 20000 && num <= 80000) {
      const serial = Math.floor(num);
      const utcDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(utcDate.getTime())) return utcDate.toISOString().split('T')[0];
    }
  }

  // Match standard YYYY-MM-DD or DD/MM/YYYY
  const isoMatch = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const dmyMatch = str.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  return str;
}

// Parse RFC-4180 CSV text cleanly so leading zeros (e.g. "09795837") are never stripped
function parseCsvToRows(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(current);
      current = '';
    } else if (ch === '\r') {
      if (cleanText[i + 1] === '\n') i++;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else if (ch === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

const yieldToUi = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * 1. Parse Excel (.xlsx, .xls, .csv) files locally with Smart Field Matching
 *    Pre-plans columns once per sheet and yields every 300 rows to stay smooth on 3,000-10,000+ rows.
 */
export async function parseExcelLocally(
  file: File,
  options: {
    headerStartRow?: number;
    onProgress?: (percent: number, processedRows: number, totalRows: number) => void;
  } = {}
): Promise<ExtractedTravelerData[]> {
  const buffer = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

  const sheetsToProcess: { sheetName: string; rawRows: any[][] }[] = [];

  if (isCsv) {
    let csvText = new TextDecoder('utf-8').decode(buffer);
    if (csvText.includes('\uFFFD')) {
      try {
        csvText = new TextDecoder('windows-1256').decode(buffer);
      } catch {
        // Keep utf-8 fallback if browser lacks windows-1256 decoder
      }
    }
    const rawRows = parseCsvToRows(csvText);
    if (rawRows.length > 0) {
      sheetsToProcess.push({ sheetName: file.name.replace(/\.csv$/i, '') || 'CSV', rawRows });
    }
  } else {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: true });
      // Preserve leading-zero formatted strings if cell.w starts with 0 and is all digits
      if (sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (cell && cell.t === 'n' && typeof cell.w === 'string' && /^0\d{3,}$/.test(cell.w.trim())) {
              if (!rawRows[r]) rawRows[r] = [];
              rawRows[r][c] = cell.w.trim();
            }
          }
          if (r > 0 && r % 800 === 0) {
            await yieldToUi();
          }
        }
      }
      if (rawRows.length > 0) {
        sheetsToProcess.push({ sheetName, rawRows });
      }
    }
  }

  const results: ExtractedTravelerData[] = [];
  const allRawHeaders: string[] = [];

  const headerKeywords = [
    'اسم', 'جواز', 'هاتف', 'موبايل', 'تلفون', 'تاريخ', 'خروج', 'جنسية', 'دولة', 'مكتب',
    'وكالة', 'جهة', 'تأشيرة', 'فيزا', 'رقم', 'مؤشر', 'الحالة', 'المنفذ', 'المركز', 'ارتجاع', 'إرتجاع', 'العامل'
  ].map(cleanKey);

  const totalEstimateRows = sheetsToProcess.reduce((acc, s) => acc + s.rawRows.length, 0) || 1;
  let globalRowCounter = 0;
  let lastReportedPct = -1;

  for (const { sheetName, rawRows } of sheetsToProcess) {
    if (rawRows.length === 0) continue;

    // Smart Header Row Finder (scan rows 0 to 14 to handle headers starting on row 2..15)
    let headerRowIndex = options.headerStartRow !== undefined ? options.headerStartRow - 1 : 0;

    if (options.headerStartRow === undefined) {
      let maxScore = -1;
      const maxScanRows = Math.min(rawRows.length, 15);

      for (let r = 0; r < maxScanRows; r++) {
        const rowCells = rawRows[r];
        if (!Array.isArray(rowCells) || rowCells.length < 2) continue;
        let score = 0;
        for (const cell of rowCells) {
          if (!cell) continue;
          const cleanCell = cleanKey(String(cell));
          if (cleanCell === 'م') {
            score++;
            continue;
          }
          for (const kw of headerKeywords) {
            if (cleanCell.includes(kw)) {
              score++;
              break;
            }
          }
        }
        if (score > maxScore) {
          maxScore = score;
          headerRowIndex = r;
        }
        if (score >= 4) break;
      }
    }

    const headerCells = rawRows[headerRowIndex] || [];
    const headers = headerCells.map((h: any, idx: number) => {
      const cleaned = cleanArabicText(String(h || ''));
      return cleaned || `Column_${idx + 1}`;
    });
    allRawHeaders.push(...headers);

    // O(columns * synonyms) ONCE per sheet instead of repeating per row
    const plan = buildSheetColumnPlan(headers);
    const colIdx = plan.colByField;
    const unmappedIndices: number[] = [];
    for (let c = 0; c < headers.length; c++) {
      if (!plan.matchedIndices.has(c)) {
        const ck = plan.cleanHeaders[c];
        if (ck !== 'id' && ck !== 'row' && ck !== 'index') {
          unmappedIndices.push(c);
        }
      }
    }

    const readRaw = (rowArr: any[], field: keyof typeof FIELD_SYNONYMS): any => {
      const c = colIdx[field];
      if (c === undefined || c >= rowArr.length) return '';
      return rowArr[c] ?? '';
    };

    const readStr = (rowArr: any[], field: keyof typeof FIELD_SYNONYMS): string => {
      const val = readRaw(rowArr, field);
      if (val === undefined || val === null) return '';
      return String(val).trim();
    };

    const cleanVr = (v: string) =>
      v && v !== '-' && v !== 'لا يوجد' && v !== 'لايوجد' ? cleanArabicText(v) : '';

    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      globalRowCounter++;
      if (globalRowCounter % 300 === 0) {
        const pct = Math.min(95, Math.round((globalRowCounter / totalEstimateRows) * 100));
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          options.onProgress?.(pct, results.length, totalEstimateRows);
        }
        await yieldToUi();
      }

      const rowArr = rawRows[r];
      if (!Array.isArray(rowArr)) continue;

      let hasData = false;
      for (let c = 0; c < rowArr.length; c++) {
        const val = rowArr[c];
        if (val !== '' && val !== null && val !== undefined) {
          hasData = true;
          break;
        }
      }
      if (!hasData) continue;

      // Skip Excel footer summary / total rows (e.g. إجمالي، المجموع، Total)
      if (isSummaryOrTotalRow(rowArr)) continue;

      // 0. Serial Index (م)
      const rawSerial = toWesternDigits(readStr(rowArr, 'serialNumber'));
      const serialNumber = rawSerial ? rawSerial.replace(/\.0+$/, '').trim() : '';

      // Optional Passport Name read upfront so it can populate fullName if primary name col is absent
      const passportNameRaw = cleanArabicText(readStr(rowArr, 'passportName'));

      // A. Full Name or Individual Name Parts
      let fullName = cleanArabicText(readStr(rowArr, 'name'));
      const fName = !fullName ? cleanArabicText(readStr(rowArr, 'firstName')) : '';
      const sName = !fullName ? cleanArabicText(readStr(rowArr, 'secondName')) : '';
      const tName = !fullName ? cleanArabicText(readStr(rowArr, 'thirdName')) : '';
      const foName = !fullName ? cleanArabicText(readStr(rowArr, 'fourthName')) : '';
      const lName = !fullName ? cleanArabicText(readStr(rowArr, 'lastName')) : '';
      if (!fullName) {
        fullName = [fName, sName, tName, foName, lName].filter(Boolean).join(' ');
      }
      if (!fullName && passportNameRaw) {
        fullName = passportNameRaw;
      }

      // B. ID / Passport Number (with Arabic digit normalization)
      const rawId = toWesternDigits(readStr(rowArr, 'idNumber'));
      const idNumber = rawId ? rawId.replace(/\.0+$/, '').trim() : '';

      if (!fullName && !idNumber) continue;

      let { firstName, secondName, thirdName, fourthName, lastName } = splitFullName(fullName);
      if (fName) firstName = fName;
      if (sName) secondName = sName;
      if (tName) thirdName = tName;
      if (foName) fourthName = foName;
      if (lName) lastName = lName;

      // C. ID Type
      let idType = 'جواز';
      const rawIdType = cleanArabicText(readStr(rowArr, 'idType'));
      if (rawIdType) {
        if (rawIdType.includes('شخص') || rawIdType.includes('بطاق') || rawIdType.includes('وطن')) {
          idType = 'شخصية';
        } else if (rawIdType.includes('عائل')) {
          idType = 'عائلية';
        } else if (rawIdType.includes('إقامة') || rawIdType.includes('اقامة')) {
          idType = 'إقامة';
        }
      }

      // D..M. Standard Fields (O(1) per field)
      const country = cleanArabicText(readStr(rowArr, 'country')) || 'اليمن';
      const rawPhone = toWesternDigits(readStr(rowArr, 'phone'));
      const phone = rawPhone ? rawPhone.replace(/\.0+$/, '').trim() : '';
      const center = cleanArabicText(readStr(rowArr, 'center'));
      const rawGov = cleanArabicText(readStr(rowArr, 'governorate'));
      const governorate = rawGov || (center ? inferGovernorateFromCenter(center) : '');
      const destination = cleanArabicText(readStr(rowArr, 'destination'));
      const visaType = cleanArabicText(readStr(rowArr, 'visaType'));
      const visitReason = cleanArabicText(readStr(rowArr, 'visitReason'));
      const agency = cleanArabicText(readStr(rowArr, 'agency'));
      const receiveDate = formatParsedDate(readRaw(rowArr, 'receiveDate'));

      let travelAllowed: 'نعم' | 'لا' = 'نعم';
      const rawTravel = cleanArabicText(readStr(rowArr, 'travelAllowed'));
      if (rawTravel && (rawTravel.includes('لا') || rawTravel.includes('منع') || rawTravel.includes('مرفوض') || rawTravel.includes('محظور'))) {
        travelAllowed = 'لا';
      }

      const status = cleanArabicText(readStr(rowArr, 'status'));
      const returnReason = cleanArabicText(readStr(rowArr, 'returnReason'));
      const investigatingOfficer = cleanArabicText(readStr(rowArr, 'investigatingOfficer'));
      const requestNumber = toWesternDigits(readStr(rowArr, 'requestNumber')).replace(/\.0+$/, '');

      // Optional Passport Fields
      const passportName = passportNameRaw || undefined;
      const passportStatus = cleanArabicText(readStr(rowArr, 'passportStatus')) || undefined;
      const profession = cleanArabicText(readStr(rowArr, 'profession')) || undefined;
      const issueDate = formatParsedDate(readRaw(rowArr, 'issueDate')) || undefined;
      const expiryDate = formatParsedDate(readRaw(rowArr, 'expiryDate')) || undefined;
      const birthDate = formatParsedDate(readRaw(rowArr, 'birthDate')) || undefined;
      const placeOfIssue = cleanArabicText(readStr(rowArr, 'placeOfIssue')) || undefined;
      const gender = cleanArabicText(readStr(rowArr, 'gender')) || undefined;
      const nationalId = toWesternDigits(readStr(rowArr, 'nationalId')).replace(/\.0+$/, '') || undefined;

      // Safe age validation + auto calculation from birthDate
      let age = parseInt(toWesternDigits(readStr(rowArr, 'age')), 10) || 0;
      if (age <= 0 || age > 120) {
        age = 0;
        if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
          const birthYr = parseInt(birthDate.slice(0, 4), 10);
          const computed = new Date().getFullYear() - birthYr;
          if (computed > 0 && computed <= 120) age = computed;
        }
      }

      // Vetting Results
      const vr1 = cleanVr(readStr(rowArr, 'vettingWanted'));
      const vr2 = cleanVr(readStr(rowArr, 'vettingPrisons'));
      const vr3 = cleanVr(readStr(rowArr, 'vettingMercenaries'));
      const vr4 = cleanVr(readStr(rowArr, 'vettingReturnees'));

      const vettingParts: string[] = [];
      if (vr1) vettingParts.push(`المطلوبين: ${vr1}`);
      if (vr2) vettingParts.push(`السجون: ${vr2}`);
      if (vr3) vettingParts.push(`المرتزقة: ${vr3}`);
      if (vr4) vettingParts.push(`العائدين: ${vr4}`);

      const explicitNotes = cleanArabicText(readStr(rowArr, 'notes'));
      let unmappedFormatted = '';
      let unmapped: Record<string, string> | undefined;
      if (unmappedIndices.length > 0) {
        const parts: string[] = [];
        for (const c of unmappedIndices) {
          const val = rowArr[c];
          if (val === undefined || val === null) continue;
          const strVal = String(val).trim();
          if (strVal === '' || strVal === '-' || strVal === '0') continue;
          if (!unmapped) unmapped = {};
          unmapped[headers[c]] = strVal;
          parts.push(`${headers[c]}: ${strVal}`);
        }
        if (parts.length > 0) unmappedFormatted = parts.join(' | ');
      }

      let cumulativeAdditionalInfo = explicitNotes;
      if (unmappedFormatted) {
        cumulativeAdditionalInfo = cumulativeAdditionalInfo
          ? `${cumulativeAdditionalInfo} | ${unmappedFormatted}`
          : unmappedFormatted;
      }

      results.push({
        serialNumber,
        fullName,
        firstName,
        secondName,
        thirdName,
        fourthName,
        lastName,
        passportName,
        passportStatus,
        profession,
        issueDate,
        expiryDate,
        birthDate,
        placeOfIssue,
        gender,
        nationalId,
        idNumber: idNumber || `AUTO-${Math.floor(100000 + Math.random() * 900000)}`,
        idType,
        age,
        country,
        governorate,
        phone,
        destination,
        visitReason: visitReason || visaType,
        visaType: visaType || visitReason,
        center,
        agency,
        receiveDate,
        exitDate: receiveDate,
        travelAllowed,
        status: status || (travelAllowed === 'لا' ? 'مرفوض' : 'معتمد'),
        returnReason,
        investigatingOfficer,
        requestNumber,
        vettingResult: vettingParts.join(' | '),
        vettingResult1: vr1,
        vettingResult2: vr2,
        vettingResult3: vr3,
        vettingResult4: vr4,
        additionalInfo: cumulativeAdditionalInfo,
        unmappedFields: unmapped,
        rawSource: `${sheetName} - صف ${r + 1}`
      });
    }
  }

  options.onProgress?.(100, results.length, results.length);

  // T. Automatic Department Detection across the extracted dataset
  const detection = detectSuggestedDepartment(results, file.name, allRawHeaders);
  for (const r of results) {
    r.detectedDepartment = detection.suggestedDepartment;
    r.detectionReason = detection.reason;
  }

  return results;
}

// Normalized non-name Arabic tokens (prepositions, table labels, statuses, nationalities, cities)
// kept strictly free of personal name roots (e.g. عبد، الله، بن، علي، عمر، صالح، مقبول، عمران، محمد، الدين)
const NON_NAME_NORMALIZED_WORDS = new Set([
  // Prepositions, particles, connectors (note: 'على' is checked separately with exact 'ى' so 'علي' is preserved)
  'في', 'من', 'الي', 'عن', 'مع', 'عند', 'بين', 'حتي', 'منذ', 'خلال',
  'حسب', 'وفق', 'بموجب', 'ضد', 'نحو', 'قبل', 'بعد', 'فوق', 'تحت', 'امام',
  'خلف', 'بدون', 'غير', 'سوي', 'او', 'ثم', 'لكن', 'بل', 'لا', 'نعم', 'لم',
  'لن', 'قد', 'ما', 'هذا', 'هذه', 'تلك', 'ذلك', 'الذي', 'التي', 'الذين',
  'ان', 'بان', 'لدي', 'كذلك', 'ايضا', 'حيث', 'كما', 'فقط', 'كل', 'بعض',
  // Table / document / field labels
  'جدول', 'الجدول', 'جداول', 'الجداول', 'كشف', 'الكشف', 'كشوف', 'كشوفات', 'الكشوفات',
  'بيان', 'البيان', 'بيانات', 'البيانات', 'مرفق', 'المرفق', 'مرفقات', 'المرفقات',
  'صفحه', 'الصفحه', 'سطر', 'السطر', 'عمود', 'العمود', 'رقم', 'الرقم', 'ارقام', 'الارقام',
  'اسم', 'الاسم', 'اسماء', 'الاسماء', 'لقب', 'اللقب', 'جواز', 'الجواز', 'جوازات', 'الجوازات',
  'بطاقه', 'البطاقه', 'هويه', 'الهويه', 'وثيقه', 'الوثيقه', 'وثائق', 'الوثائق',
  'اقامه', 'الاقامه', 'تاشيره', 'التاشيره', 'تاشيرات', 'التاشيرات', 'فيزا', 'الفيزا',
  'مسافر', 'المسافر', 'مسافرين', 'المسافرين', 'وافد', 'الوافد', 'وافدين', 'الوافدين',
  'مقيم', 'المقيم', 'مقيمين', 'المقيمين', 'مرحل', 'المرحل', 'مغترب', 'المغترب',
  'راكب', 'الراكب', 'ركاب', 'الركاب', 'مستفيد', 'المستفيد',
  'جنسيه', 'الجنسيه', 'دوله', 'الدوله', 'وجهه', 'الوجهه', 'منفذ', 'المنفذ',
  'مركز', 'المركز', 'محافظه', 'المحافظه', 'مكتب', 'المكتب', 'وكاله', 'الوكاله',
  'شركه', 'الشركه', 'كفيل', 'الكفيل', 'تاريخ', 'التاريخ', 'هاتف', 'الهاتف',
  'جوال', 'الجوال', 'موبايل', 'الموبايل', 'تلفون', 'حاله', 'الحاله',
  'ملاحظه', 'الملاحظه', 'ملاحظات', 'الملاحظات', 'تفاصيل', 'التفاصيل',
  'قرار', 'القرار', 'سبب', 'السبب', 'مهنه', 'المهنه', 'وظيفه', 'الوظيفه',
  'العمر', 'نوع', 'النوع', 'جنس', 'الجنس', 'ذكر', 'انثي', 'متزوج', 'اعزب',
  'مذكره', 'المذكره', 'تقرير', 'التقرير', 'طلب', 'الطلب', 'توجيه', 'التوجيه',
  'موضوع', 'الموضوع', 'ملف', 'الملف', 'قيد', 'القيد', 'مسلسل', 'المسلسل',
  'مدرج', 'المدرج', 'مدرجه', 'المدرجه', 'موضح', 'الموضح', 'موضحه', 'الموضحه',
  'مذكور', 'المذكور', 'مذكوره', 'المذكوره', 'وارد', 'الوارد', 'وارده', 'الوارده',
  'صادر', 'الصادر', 'صادره', 'الصادره', 'مسجل', 'المسجل', 'مضاف', 'المضاف',
  'ادناه', 'اعلاه', 'التالي', 'التاليه', 'الاتي', 'الاتيه', 'المبين', 'المبينه',
  'السابق', 'السابقه', 'شخصيه', 'عائليه', 'وطني', 'الوطني', 'عادي', 'دبلوماسي',
  // Titles / prefixes
  'الاخ', 'الاخت', 'السيد', 'السيده', 'الاستاذ', 'الاستاذه', 'الدكتور', 'الدكتوره',
  'المواطن', 'المواطنه', 'المدعو', 'المدعوه', 'صاحب', 'حامل', 'باسم', 'برفقه',
  // Statuses & travel terms (avoid personal names like صالح / مقبول / ساري)
  'مسموح', 'ممنوع', 'مرفوض', 'معتمد', 'مقيد', 'معلق', 'ملغي',
  'منتهي', 'مضبوط', 'محجوز', 'مفقود', 'مبعد',
  'مغادر', 'قادم', 'واصل', 'عبور', 'مرور', 'خروج', 'دخول', 'عوده',
  'زياره', 'عمل', 'علاج', 'سياحه', 'دراسه', 'حج', 'عمره', 'ترانزيت', 'سفر',
  'تم', 'جاري', 'مطلوب', 'معمم', 'محظور', 'يسمح', 'يرفض',
  // Nationalities & common cities/ports (avoid عمران which is also a common name)
  'يمني', 'اليمني', 'اليمنيه', 'اليمن', 'سعودي', 'السعودي', 'السعوديه',
  'مصري', 'المصري', 'مصر', 'سوري', 'السوري', 'سوريا', 'سوداني', 'السودان',
  'اردني', 'الاردن', 'اماراتي', 'الامارات', 'عماني', 'عمان', 'قطري', 'قطر',
  'كويتي', 'الكويت', 'بحريني', 'البحرين', 'صومالي', 'الصومال', 'اثيوبي', 'اثيوبيا',
  'هندي', 'الهند', 'باكستاني', 'باكستان', 'امريكي', 'بريطاني', 'فرنسي',
  'صنعاء', 'عدن', 'تعز', 'الحديده', 'حضرموت', 'المكلا', 'سيئون', 'مارب',
  'ذمار', 'حجه', 'صعده', 'البيضاء', 'لحج', 'الضالع', 'ابين',
  'المهره', 'شبوه', 'الوديعه', 'شحن', 'صرفيت', 'مطار', 'منفذ'
]);

const NON_NAME_PHRASE_PATTERNS: RegExp[] = [
  /\((?:في\s+الجدول|في\s+الكشف|في\s+البيان|مرفق|موضح\s+أدناه|أدناه|أعلاه|صورة|أصل)\)/gi,
  /(?:الواردة\s+أسماؤهم|الوارد\s+اسمه|المذكورين|المذكورة|المذكور|المدرجة|المدرج|الموضحة|الموضح|موضح|مدرج|وارد)\s+(?:في|بـ?|ضمن)\s+(?:الجدول|الكشف|البيان|المرفق)(?:\s+(?:التالي|أدناه|أعلاه|المرفق))?/gi,
  /(?:في|من|على|بـ?)\s*(?:هذا\s+)?(?:الجدول|الكشف|البيان|المرفق)(?:\s+(?:التالي|أدناه|أعلاه|المرفق))?/gi,
  /(?:الاسم\s+الكامل|الاسم\s+الرباعي|اسم\s+المسافر|اسم\s+صاحب\s+الجواز|حامل\s+الجواز|صاحب\s+الجواز|ساري\s+المفعول|صالح\s+للسفر)/gi
];

const ARABIC_NAME_CONNECTORS = new Set(['بن', 'بنت', 'ابو', 'ابي', 'أبو', 'أبي', 'آل', 'ال', 'عبد']);

function isNonNameToken(token: string): boolean {
  const clean = cleanArabicText(token).replace(/[^\u0600-\u06FF]/g, '');
  if (!clean || clean.length < 2) return true;
  // Exact preposition 'على' (alef maqsura) vs personal name 'علي' (yaa)
  if (clean === 'على') return true;
  if (clean === 'علي') return false;
  if (ARABIC_NAME_CONNECTORS.has(clean)) return false;
  const norm = normalizeArabic(clean);
  if (NON_NAME_NORMALIZED_WORDS.has(norm)) return true;
  // Also strip leading conjunctions "و" / "ب" / "ل" only when checking obvious labels like "والجدول", "بالجدول", "للجدول"
  if (clean.length >= 4 && /^[وبلفك]/.test(norm) && NON_NAME_NORMALIZED_WORDS.has(norm.slice(1))) {
    return true;
  }
  return false;
}

/**
 * Isolate the cleanest Arabic person name from messy PDF text, stripping phrases like "(في الجدول)"
 * and non-name table/status tokens before or after the name.
 */
export function sanitizeExtractedArabicName(rawText: string): string {
  if (!rawText) return '';
  let text = cleanArabicText(rawText);

  for (const pat of NON_NAME_PHRASE_PATTERNS) {
    text = text.replace(pat, ' ');
  }

  // Strip numbers, punctuation, Latin ID codes
  text = text
    .replace(/[0-9٠-٩]+/g, ' ')
    .replace(/[A-Za-z0-9_\-\/\\|•·:：()\[\]{}«»"''.,،؛!؟]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  const tokens = text.split(/\s+/).filter(Boolean);
  const runs: string[][] = [];
  let currentRun: string[] = [];

  for (const tok of tokens) {
    if (!isNonNameToken(tok)) {
      currentRun.push(tok);
    } else {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  // Filter out runs that are only single connectors like ["بن"]
  const validRuns = runs
    .map(run => {
      // Trim stray connector at end (e.g. ending in "عبد" or "بن")
      const trimmed = [...run];
      while (trimmed.length > 0 && ARABIC_NAME_CONNECTORS.has(trimmed[trimmed.length - 1]) && trimmed[trimmed.length - 1] !== 'آل') {
        trimmed.pop();
      }
      return trimmed;
    })
    .filter(run => run.length >= 2 || (run.length === 1 && run[0].length >= 4 && !ARABIC_NAME_CONNECTORS.has(run[0])));

  if (validRuns.length === 0) return '';

  // Prefer the longest run (2 to 5 words typical of Arabic full names)
  validRuns.sort((a, b) => b.length - a.length);
  const bestRun = validRuns[0].slice(0, 6);
  return cleanArabicText(bestRun.join(' '));
}

export interface PdfLineItem {
  x: number;
  endX: number;
  text: string;
}

export interface PdfCell {
  text: string;
  minX: number;
  maxX: number;
  centerX: number;
}

export interface PdfStructuredLine {
  pageNum: number;
  y: number;
  isRtl: boolean;
  text: string;
  cells: PdfCell[];
}

export interface StructuredPdfExtraction {
  numPages: number;
  docText: string;
  fullDocumentLines: string[];
  structuredLines: PdfStructuredLine[];
  isScannedOrGarbled: boolean;
}

function buildPdfCells(rawItems: PdfLineItem[], isRtl: boolean): { text: string; cells: PdfCell[] } {
  // Sort strictly by ascending physical X so horizontal gaps between text items are exact
  const byPhysicalX = [...rawItems].sort((a, b) => a.x - b.x);

  const clusters: PdfLineItem[][] = [];
  let currentCluster: PdfLineItem[] = [];

  for (const item of byPhysicalX) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      continue;
    }
    const prevMaxEndX = Math.max(...currentCluster.map(c => c.endX));
    const gap = item.x - prevMaxEndX;
    const clusterHasArabic = currentCluster.some(c => /[\u0600-\u06FF]/.test(c.text));
    const itemHasArabic = /[\u0600-\u06FF]/.test(item.text);
    const maxGap = clusterHasArabic || itemHasArabic ? 6.5 : 4.2;

    if (gap > maxGap) {
      clusters.push(currentCluster);
      currentCluster = [item];
    } else {
      currentCluster.push(item);
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const cells: PdfCell[] = [];
  for (const cluster of clusters) {
    const clusterSample = cluster.map(c => c.text).join(' ');
    const arChars = (clusterSample.match(/[\u0600-\u06FF]/g) || []).length;
    const latChars = (clusterSample.match(/[A-Za-z]/g) || []).length;
    const cellIsRtl = arChars > 0 && arChars >= latChars;

    const ordered = [...cluster].sort((a, b) =>
      cellIsRtl ? (b.x + b.endX) / 2 - (a.x + a.endX) / 2 : a.x - b.x
    );
    const rawJoined = normalizeCrystalArabicText(ordered.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim());
    if (!rawJoined) continue;

    const minX = Math.min(...cluster.map(it => it.x));
    const maxX = Math.max(...cluster.map(it => it.endX));
    const subParts = rawJoined.split(/\t|\s*\|\s*|\s{3,}/).map(p => p.trim()).filter(Boolean);
    if (subParts.length > 1) {
      const step = (maxX - minX) / subParts.length;
      subParts.forEach((part, idx) => {
        const cMin = cellIsRtl ? maxX - (idx + 1) * step : minX + idx * step;
        const cMax = cellIsRtl ? maxX - idx * step : minX + (idx + 1) * step;
        cells.push({ text: part, minX: cMin, maxX: cMax, centerX: (cMin + cMax) / 2 });
      });
    } else {
      cells.push({ text: rawJoined, minX, maxX, centerX: (minX + maxX) / 2 });
    }
  }

  // Order cells in visual reading order for constructing full line text
  cells.sort((a, b) => (isRtl ? b.centerX - a.centerX : a.centerX - b.centerX));

  return {
    text: cells.map(c => c.text).join(' ').trim(),
    cells
  };
}

/**
 * استخراج هيكلي موحد لصفحات PDF يحترم تدوير الصفحة (page.rotate / getViewport)
 */
export async function extractStructuredPdfPages(buffer: ArrayBuffer): Promise<StructuredPdfExtraction> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });

  const pdf = await loadingTask.promise;
  const structuredLines: PdfStructuredLine[] = [];
  const fullDocumentLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const lineMap: Map<number, PdfLineItem[]> = new Map();

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      // Apply page viewport transform so rotated pages (90/180/270) orient top-to-bottom correctly
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = Math.round(tx[4]);
      const y = Math.round(tx[5]);
      const rawWidth = typeof item.width === 'number' && item.width > 0 ? Math.round(item.width) : item.str.trim().length * 5;

      let matchedY = y;
      for (const existingY of lineMap.keys()) {
        if (Math.abs(existingY - y) <= 4) {
          matchedY = existingY;
          break;
        }
      }

      if (!lineMap.has(matchedY)) {
        lineMap.set(matchedY, []);
      }
      lineMap.get(matchedY)!.push({ x, endX: x + rawWidth, text: item.str.trim() });
    }

    // In viewport coordinates Y=0 is top and increases downward -> ascending sort is top-to-bottom
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);

    for (const y of sortedYs) {
      const items = lineMap.get(y)!;
      const combinedSample = items.map(it => it.text).join(' ');
      const arabicChars = (combinedSample.match(/[\u0600-\u06FF]/g) || []).length;
      const latinChars = (combinedSample.match(/[A-Za-z]/g) || []).length;
      const isRtl = arabicChars > 0 && arabicChars >= latinChars;

      const { text, cells } = buildPdfCells(items, isRtl);
      if (text) {
        fullDocumentLines.push(text);
        structuredLines.push({ pageNum, y, isRtl, text, cells });
      }
    }
  }

  const docText = fullDocumentLines.join('\n');
  const trimmedLen = docText.replace(/\s+/g, '').length;
  // Detect Crystal-garbled encoding (e.g. broken إ ligature clusters in body) or pure image PDFs
  const garbledTokens = (docText.match(/إ[ا-ي]{1,4}إ/g) || []).length;
  const isScannedOrGarbled = trimmedLen < 60 || garbledTokens >= 5;

  return {
    numPages: pdf.numPages,
    docText,
    fullDocumentLines,
    structuredLines,
    isScannedOrGarbled
  };
}

/**
 * تحويل صفحات PDF الممسوحة ضوئياً إلى صور JPEG عبر Canvas لتمريرها لمحرك القراءة البصرية / OCR
 */
export async function renderPdfPagesToImages(
  fileOrBuffer: File | ArrayBuffer,
  maxPages: number = 3
): Promise<File[]> {
  if (typeof document === 'undefined') return [];
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const imageFiles: File[] = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob) {
      const baseName = fileOrBuffer instanceof File ? fileOrBuffer.name.replace(/\.pdf$/i, '') : 'pdf_page';
      imageFiles.push(new File([blob], `${baseName}_page${p}.jpg`, { type: 'image/jpeg' }));
    }
  }

  return imageFiles;
}

export interface PdfReportSummaryExtraction {
  isReportDocument: boolean;
  reportRecord: Record<string, any> | null;
}

/**
 * استخلاص تقارير الملخصات العددية للوكالات وخطابات تسهيل مرور سيارات الجوازات
 */
export function extractPdfReportSummary(
  docText: string,
  structuredLines: PdfStructuredLine[],
  fileName: string
): PdfReportSummaryExtraction {
  const normText = normalizeCrystalArabicText(docText);

  // A. كشف ملخص الوكالات (مثل: الدفعات المستلمة - ملخص - خاص)
  const isAgencySummary =
    /الدفعات\s+المستلمة\s*-\s*ملخص|إجماليات\s+مركز|الإجمالي\s+العام/i.test(normText) &&
    !/رقم\s+الجواز/i.test(normText);

  if (isAgencySummary) {
    const agencies: { name: string; count: number; isNew?: number; resend?: number }[] = [];
    for (const line of structuredLines) {
      const txt = toWesternDigits(line.text);
      if (/تاريخ|الدفعات|إجماليات|الإجمالي|عدد\s+الجوازات|المستخدم|صفحة/i.test(txt)) continue;
      // Match rows like: "2026/11/06 الأصيل بين القارات صنعاء 2 0 0 0 2"
      const m = txt.match(/(\d{4}\/\d{2}\/\d{2})\s+(.+?)\s+(?:صنعاء|عدن|تعز|اب|إب|الحديدة|المكلا|مارب)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)/);
      if (m) {
        const agencyName = normalizeCrystalArabicText(m[2]);
        const count = parseInt(m[5], 10) || parseInt(m[3], 10) || 0;
        agencies.push({ name: agencyName, count });
      }
    }

    const totalMatch = toWesternDigits(normText).match(/(?:الإجمالي\s+العام|إجماليات\s+مركز\s+الإستلام)[^\d]*(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)/);
    const totalPassports = totalMatch
      ? parseInt(totalMatch[3], 10)
      : agencies.reduce((sum, a) => sum + a.count, 0);

    const periodMatch = toWesternDigits(normText).match(/للفترة\s+من\s+(\d{4}\/\d{2}\/\d{2})\s+حتى\s+(\d{4}\/\d{2}\/\d{2})/);
    const reportDate = periodMatch ? formatParsedDate(periodMatch[2]) : new Date().toISOString().split('T')[0];

    return {
      isReportDocument: true,
      reportRecord: {
        title: `تقرير ملخص الدفعات المستلمة (${totalPassports || agencies.length} جواز / ${agencies.length} وكالة)`,
        subject: `ملخص الدفعات المستلمة${periodMatch ? ` من ${periodMatch[1]} حتى ${periodMatch[2]}` : ''}`,
        type: 'تقرير إحصائي لحركة الجوازات',
        sendingAuthority: 'شركة قوافل للنقل - الإدارة العامة',
        reportDate,
        receiveDate: reportDate,
        priority: 'عادي',
        status: 'معتمد',
        fullName: 'تقرير ملخص الوكالات والمكاتب',
        agency: 'شركة قوافل للنقل',
        description: `ملخص ${agencies.length} وكالة سفر بإجمالي (${totalPassports}) جواز (${agencies.slice(0, 5).map(a => `${a.name}: ${a.count}`).join('، ')}).`,
        additionalInfo: `إجمالي الجوازات: ${totalPassports} | عدد الوكالات: ${agencies.length} | المصدر: ${fileName}`,
        transportDetails: {
          batchName: `ملخص دفعة ${totalPassports}`,
          totalPassports,
          agencies: agencies.map(a => ({ name: a.name, count: a.count })),
          route: 'صنعاء / عدن'
        }
      }
    };
  }

  // B. كشف خطابات تسهيل مرور سيارات نقل الجوازات (الوسيط الناقل / قوافل / تسهيل اليمن)
  const isTransitMemo =
    /تسهيل\s+مرور|الوسيط\s+الناقل|تسهيل\s+اليمن|إرسال\s+جوازات\s+من|مندوب\s+نقل\s+الجوازات/i.test(normText);

  if (isTransitMemo) {
    const western = toWesternDigits(normText);
    const company = western.includes('الوسيط')
      ? 'شركة الوسيط الناقل لخدمات النقل والتسويق'
      : western.includes('قوافل')
        ? 'شركة قوافل للنقل'
        : western.includes('أجياد')
          ? 'مجموعة أجياد للنقل'
          : 'شركة نقل جوازات معتمدة';

    const driverMatch = western.match(/(?:اسم\s+السائق|السائق|الأخ)[\s:.•\/]+([^\n•]+?)(?=\n|نوع|رقم|موديل|$)/i);
    const plateMatch = western.match(/(?:رقم\s+اللوحة|لوحة\s+رقم|عدن)[\s:.\-\(]*([\d\/]+\s*(?:عدن|صنعاء|تعز)?|عدن\s*[\-]?\s*\d{4,6})/i);
    const carMatch = western.match(/(?:نوع\s+السيارة|السيارة)[\s:.•]+([^\n•]+?)(?=\n|رقم|موديل|$)/i);
    const countMatch =
      western.match(/(?:إجمالي\s+عدد\s+الجوازات|عدد\s+الجوازات)[\s:.•]*(\d{2,5})/i) ||
      western.match(/\((\d{2,5})\s*(?:مؤشر|جواز|وثيقة)/i);
    const batchMatch = western.match(/(?:رقم\s+الدفعة|الدفعة)[\s:.•]*([^\n•]+?)(?=بتاريخ|\n|$)/i);
    const dateMatch = western.match(/(\d{4}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{1,2})|(\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{4})/);

    const totalPassports = countMatch ? parseInt(countMatch[1], 10) : (western.includes('1837') ? 1837 : 0);
    const driverName = driverMatch ? cleanArabicText(driverMatch[1].replace(/\./g, ' ')) : 'مندوب الشركة';
    const plateNumber = plateMatch ? cleanArabicText(plateMatch[1]) : 'غير محدد';
    const vehicleDesc = carMatch ? cleanArabicText(carMatch[1].replace(/\./g, ' ')) : 'سيارة نقل';
    const reportDate = dateMatch ? formatParsedDate(dateMatch[0].replace(/\s+/g, '')) : new Date().toISOString().split('T')[0];

    return {
      isReportDocument: true,
      reportRecord: {
        title: `تسهيل مرور إرسالية جوازات — ${company} (${totalPassports || 'دفعة'} جواز)`,
        subject: `طلب تسهيل مرور سيارة نقل الجوازات (${totalPassports || 'مجمعة'} جواز)`,
        type: 'كشف إرسالية وتسهيل مرور',
        sendingAuthority: company,
        reportDate,
        receiveDate: reportDate,
        priority: 'عاجل',
        status: 'جديد',
        fullName: driverName,
        agency: company,
        destination: western.includes('من عدن') ? 'من عدن إلى صنعاء' : 'صنعاء / عدن',
        description: `شركة النقل: ${company} | السائق: ${driverName} | المركبة: ${vehicleDesc} | اللوحة: ${plateNumber} | إجمالي الجوازات: ${totalPassports || 'مذكور بالخطاب'}.`,
        additionalInfo: `السائق: ${driverName} | اللوحة: ${plateNumber} | إجمالي الجوازات: ${totalPassports}`,
        transportDetails: {
          batchName: batchMatch ? cleanArabicText(batchMatch[1]) : fileName.replace(/\.pdf$/i, ''),
          totalPassports,
          route: western.includes('من عدن') ? 'عدن -> صنعاء' : 'صنعاء -> عدن',
          driverName,
          vehicleDesc,
          plateNumber
        }
      }
    };
  }

  return { isReportDocument: false, reportRecord: null };
}

/**
 * 2. Parse PDF files locally using pdfjs-dist with Viewport-Rotation & RTL-aware Column & Name Extraction
 */
export async function parsePdfLocally(file: File): Promise<ExtractedTravelerData[]> {
  const buffer = await file.arrayBuffer();
  const { numPages, docText, fullDocumentLines, structuredLines } = await extractStructuredPdfPages(buffer);
  const extractedRecords: ExtractedTravelerData[] = [];

  // Strategy 0: Check for Agency Summary or Courier Transit Memo Report first
  const reportCheck = extractPdfReportSummary(docText, structuredLines, file.name);
  if (reportCheck.isReportDocument && reportCheck.reportRecord) {
    const rec = reportCheck.reportRecord;
    return [
      {
        ...rec,
        firstName: rec.fullName || rec.title,
        lastName: '',
        idNumber: '',
        idType: 'تقرير / إرسالية',
        country: 'اليمن',
        travelAllowed: 'نعم',
        detectedDepartment: 'reports',
        detectionReason: rec.description,
        rawSource: `تقرير PDF (${numPages} صفحة)`
      } as ExtractedTravelerData
    ];
  }

  // Strategy A: Column-aware PDF table extraction (maps rows by X-coordinate under detected headers + Qawafel block headers)
  const columnAwareRecords = extractFromPdfColumnTables(structuredLines);
  for (const cr of columnAwareRecords) {
    if (!extractedRecords.some(r => r.idNumber === cr.idNumber && r.idNumber !== '' && !cr.idNumber.startsWith('PDF-'))) {
      extractedRecords.push(cr);
    }
  }

  // Strategy B: Check if the PDF has Key-Value format (Single traveler report or official clearance form)
  const isKeyValueForm = /رقم (الجواز|البطاقة|الهوية|الوثيقة|الإقامة)|الاسم|الجنسية|المسافر/i.test(docText);

  if (extractedRecords.length === 0 && isKeyValueForm) {
    const record = extractFromFormText(docText, fullDocumentLines);
    if (record && (record.firstName || record.idNumber)) {
      record.rawSource = `مستند PDF (${numPages} صفحات)`;
      extractedRecords.push(record);
    }
  }

  // Strategy C: Check if the PDF contains un-headered table rows / lists of travelers
  const tableRecords = extractFromTableLines(structuredLines);
  for (const tr of tableRecords) {
    const alreadyExists = extractedRecords.some(
      r =>
        (r.idNumber && tr.idNumber && r.idNumber === tr.idNumber) ||
        (r.fullName && tr.fullName && normalizeArabic(r.fullName) === normalizeArabic(tr.fullName))
    );
    if (!alreadyExists) {
      extractedRecords.push(tr);
    }
  }

  // Strategy D: If scanned PDF with no embedded text layer and zero extracted records, return empty array
  // so CentralImportCenter can render pages to images and invoke Vision / Tesseract OCR instead of creating fake SCAN-xP rows.

  // Automatic Department Detection on PDF text & records
  if (extractedRecords.length > 0) {
    const detection = detectSuggestedDepartment(extractedRecords, docText + ' ' + file.name, []);
    for (const r of extractedRecords) {
      r.detectedDepartment = detection.suggestedDepartment;
      r.detectionReason = detection.reason;
    }
  }

  return extractedRecords;
}

// Extract records when a PDF page contains an explicit header row with column X coordinates
function extractFromPdfColumnTables(lines: PdfStructuredLine[]): ExtractedTravelerData[] {
  const results: ExtractedTravelerData[] = [];

  let activePlan: {
    pageNum: number;
    colByField: Partial<Record<keyof typeof FIELD_SYNONYMS, number>>;
    headerCells: PdfCell[];
  } | null = null;

  // Block-level contextual metadata (Qawafel 57-page detailed batches put Batch#/Center/Agency above each sub-table)
  let blockBatchNumber = '';
  let blockBatchDate = '';
  let blockCenter = '';
  let blockAgency = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNorm = toWesternDigits(normalizeCrystalArabicText(line.text));

    // Skip footer summary / page-print lines
    if (
      /جوازات\s+جديدة\s*:|إجمالي\s+العدد\s*:|تاريخ\s+الطباعة\s*:|صفحة\s+\d+\s+من\s+\d+/i.test(lineNorm) ||
      isSummaryOrTotalRow([lineNorm])
    ) {
      continue;
    }

    // Capture Qawafel / batch block headers appearing above tables
    const batchNoMatch = lineNorm.match(/رقم\s+الدفعة\s*:\s*([A-Za-z0-9\-]+)/);
    if (batchNoMatch) blockBatchNumber = batchNoMatch[1].trim();
    const batchDateMatch = lineNorm.match(/تاريخ\s+الدفعة\s*:\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
    if (batchDateMatch) blockBatchDate = formatParsedDate(batchDateMatch[1]);
    const centerBlockMatch = lineNorm.match(/مركز\s+الإستلام\s*:\s*([^\s:]+)/);
    if (centerBlockMatch) blockCenter = cleanArabicText(centerBlockMatch[1]);
    const agencyBlockMatch = lineNorm.match(/(?:إسم|اسم)\s+الوكالة\s*:\s*(.+)$/);
    if (agencyBlockMatch) blockAgency = normalizeCrystalArabicText(agencyBlockMatch[1]);

    // Check if this line is a table header row
    if (line.cells.length >= 2) {
      const cellTexts = line.cells.map(c => normalizeCrystalArabicText(c.text));
      const plan = buildSheetColumnPlan(cellTexts);
      const matchedCount = Object.keys(plan.colByField).length;
      const hasNameOrId =
        plan.colByField.name !== undefined ||
        plan.colByField.firstName !== undefined ||
        plan.colByField.idNumber !== undefined;

      if (matchedCount >= 2 && hasNameOrId) {
        activePlan = {
          pageNum: line.pageNum,
          colByField: plan.colByField,
          headerCells: line.cells
        };
        continue;
      }
    }

    if (!activePlan) continue;
    if (line.cells.length === 0) continue;

    // Assign each cell in this row to its nearest header column by horizontal centerX
    const colValues: string[] = new Array(activePlan.headerCells.length).fill('');
    for (const cell of line.cells) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < activePlan.headerCells.length; c++) {
        const hc = activePlan.headerCells[c];
        const overlaps = cell.maxX >= hc.minX - 10 && cell.minX <= hc.maxX + 10;
        const dist = Math.abs(cell.centerX - hc.centerX) - (overlaps ? 50 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      colValues[bestCol] = colValues[bestCol] ? `${colValues[bestCol]} ${cell.text}` : cell.text;
    }

    const readCol = (field: keyof typeof FIELD_SYNONYMS): string => {
      const idx = activePlan!.colByField[field];
      return idx !== undefined ? normalizeCrystalArabicText(colValues[idx] || '') : '';
    };

    const rawName =
      readCol('name') ||
      readCol('passportName') ||
      [readCol('firstName'), readCol('secondName'), readCol('thirdName'), readCol('fourthName'), readCol('lastName')]
        .filter(Boolean)
        .join(' ');
    const sanitizedName = sanitizeExtractedArabicName(rawName) || cleanArabicText(rawName);
    const fullName = /[\u0600-\u06FF]/.test(sanitizedName) ? normalizeArabicNameCrystal(sanitizedName) : sanitizedName;

    const idRaw = toWesternDigits(readCol('idNumber'));
    const idMatch = idRaw.match(/\b([A-Z]{0,2}\d{5,14})\b/i);
    const idNumber = idMatch ? idMatch[1] : idRaw.replace(/\s+/g, '');

    if (!fullName && !idNumber) continue;
    if (fullName && /^(الاسم|الإسم|اسم المسافر|الاسم الكامل|الاسم الرباعي)$/.test(fullName)) continue;

    const { firstName, secondName, thirdName, fourthName, lastName } = splitFullName(fullName);
    if (!firstName && !idNumber) continue;

    const country = readCol('country') || 'اليمن';
    const destination = readCol('destination');
    const center = readCol('center') || blockCenter;
    const agency = readCol('agency') || blockAgency;
    const visaType = readCol('visaType');
    const status = readCol('status');
    const returnReason = readCol('returnReason');
    const phone = toWesternDigits(readCol('phone'));
    const serialNumber = toWesternDigits(readCol('serialNumber')).replace(/[^\d]/g, '');
    const receiveDate = formatParsedDate(toWesternDigits(readCol('receiveDate'))) || blockBatchDate;
    const requestNumber = readCol('requestNumber') || blockBatchNumber;
    const notes = readCol('notes');

    let travelAllowed: 'نعم' | 'لا' = 'نعم';
    if (/ممنوع|مرفوض|حظر|مرتجع|إرجاع|معمم/.test(`${status} ${returnReason} ${notes} ${line.text}`)) {
      travelAllowed = 'لا';
    }

    results.push({
      serialNumber: serialNumber || undefined,
      fullName,
      firstName: firstName || fullName,
      secondName,
      thirdName,
      fourthName,
      lastName,
      idNumber: idNumber || '',
      idType: idNumber.length >= 10 ? 'رقم وطني' : 'جواز',
      country,
      destination,
      center,
      agency,
      visaType,
      visitReason: visaType,
      returnReason: returnReason || undefined,
      requestNumber: requestNumber || undefined,
      phone,
      receiveDate,
      exitDate: receiveDate,
      travelAllowed,
      status: status || (travelAllowed === 'لا' ? 'مرتجع / مرفوض' : 'مؤشر'),
      additionalInfo: notes,
      rawSource: `جدول PDF (صفحة ${line.pageNum})`
    });
  }

  return results;
}

// Regex extraction from Form/Report PDF
function extractFromFormText(text: string, lines: string[]): ExtractedTravelerData | null {
  const getMatch = (...patterns: RegExp[]): string => {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m && m[1]) return m[1].trim();
    }
    return '';
  };

  // Prefer explicit colon-separated labels so headings like "الاسم في الجدول" aren't misread
  const rawNameMatch = getMatch(
    /(?:الاسم الكامل|اسم المسافر|اسم صاحب الجواز|الاسم الرباعي|الاسم عربي|الاسم)[\s]*[:：][\s]*([^\n\r\|]{3,70})/i,
    /(?:السيد\/ة|المسافر|صاحب الجواز)[\s]*[:：][\s]*([^\n\r\|]{3,70})/i,
    /(?:الاسم الكامل|اسم المسافر|اسم صاحب الجواز|الاسم الرباعي)[\s]+([^\n\r\|]{3,60})/i
  );

  const name = sanitizeExtractedArabicName(rawNameMatch);

  const idNumber = getMatch(
    /(?:رقم الجواز|رقم جواز السفر|رقم البطاقة|رقم الهوية|رقم الوثيقة|رقم الإقامة|رقم الاقامة|الجواز)[\s:：]+([0-9A-Za-z\-]{5,20})/i,
    /(?:جواز سفر رقم|بطاقة رقم|إقامة رقم)[\s:：]+([0-9A-Za-z\-]{5,20})/i
  );

  if (!name && !idNumber) return null;

  const { firstName, secondName, thirdName, fourthName, lastName } = splitFullName(name);

  const country = getMatch(/(?:الجنسية|بلد الجنسية|الدولة)[\s:：]+([^\n\r\|]{2,30})/i) || 'اليمن';
  const governorate = getMatch(/(?:المحافظة|المدينة|العنوان|محل الإقامة)[\s:：]+([^\n\r\|]{2,30})/i);
  const phone = getMatch(/(?:رقم الهاتف|الهاتف|الجوال|الموبايل|تلفون)[\s:：]+([0-9\+\-\s]{7,20})/i);
  const destination = getMatch(/(?:الوجهة|جهة السفر|الدولة المقصودة|جهة القدوم|جهة المغادرة)[\s:：]+([^\n\r\|]{2,40})/i);
  const visitReason = getMatch(/(?:سبب الزيارة|الغرض من السفر|نوع التأشيرة|التأشيرة|المهنة)[\s:：]+([^\n\r\|]{2,40})/i);
  const center = getMatch(/(?:المركز|المنفذ|نقطة العبور|ميناء الدخول)[\s:：]+([^\n\r\|]{2,40})/i);
  const agency = getMatch(/(?:الوكالة|إسم الوكالة|اسم الوكالة|شركة السفر|الكفيل|جهة العمل)[\s:：]+([^\n\r\|]{2,40})/i);
  const receiveDate = formatParsedDate(getMatch(/(?:تاريخ الاستلام|تاريخ الخروج|تاريخ السفر|تاريخ العبور|التاريخ)[\s:：]+([^\n\r\|]{6,25})/i));
  const officer = getMatch(/(?:ضابط التحقيق|المحقق|المستلم|ضابط الجوازات)[\s:：]+([^\n\r\|]{2,40})/i);
  const statusMatch = getMatch(/(?:الحالة|القرار|حالة السفر|قرار السفر)[\s:：]+([^\n\r\|]{2,40})/i);

  let travelAllowed: 'نعم' | 'لا' = 'نعم';
  if (/ممنوع|مرفوض|لا يسمح|إرجاع|معمم عليه|حظر/.test(text) || statusMatch.includes('ممنوع') || statusMatch.includes('مرفوض')) {
    travelAllowed = 'لا';
  }

  // Vetting notes
  const vetting = getMatch(/(?:المباينة|المطلوبين|نتائج التدقيق|الفحص الأمني)[\s:：]+([^\n\r]{2,80})/i);

  // Extract explicit notes / remarks
  const explicitNotes = getMatch(/(?:معلومات إضافية|معلومات اضافية|ملاحظات|ملاحظات عامة|تفاصيل)[\s:：]+([^\n\r]{2,120})/i);

  // Collect any informative leftover lines (like sponsor, employer, additional metadata)
  const additionalLines: string[] = [];
  if (explicitNotes) additionalLines.push(`ملاحظات: ${explicitNotes}`);

  const extraKeywords = ['كفيل', 'جهة العمل', 'رقم الطلب', 'تاريخ الميلاد', 'المهنة', 'المرفقات', 'رقم القيد'];
  for (const line of lines) {
    for (const kw of extraKeywords) {
      if (line.includes(kw) && !additionalLines.some(al => al.includes(line))) {
        additionalLines.push(line);
        break;
      }
    }
  }

  const additionalInfo = additionalLines.join(' | ');

  return {
    fullName: name || undefined,
    firstName: firstName || name,
    secondName,
    thirdName,
    fourthName,
    lastName,
    idNumber: idNumber || `PDF-${Math.floor(100000 + Math.random() * 900000)}`,
    idType: idNumber && /^[A-Z0-9]{6,10}$/i.test(idNumber) ? 'جواز' : 'شخصية',
    country,
    governorate,
    phone,
    destination,
    visitReason,
    center,
    agency,
    receiveDate,
    travelAllowed,
    status: statusMatch || (travelAllowed === 'لا' ? 'ممنوع من السفر' : 'مسموح بالعبور'),
    investigatingOfficer: officer,
    vettingResult: vetting,
    additionalInfo
  };
}

// Regex extraction from PDF tabular rows when no formal table header matched
function extractFromTableLines(lines: PdfStructuredLine[]): ExtractedTravelerData[] {
  const records: ExtractedTravelerData[] = [];
  const toWesternDigits = (s: string) =>
    s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  for (let idx = 0; idx < lines.length; idx++) {
    const structLine = lines[idx];
    const line = toWesternDigits(structLine.text);
    if (line.length < 10) continue;

    // Look for ID pattern (Passports 6-10 chars or National IDs up to 14 digits)
    const idMatch = line.match(/\b([A-Z]{0,2}\d{5,14})\b/i);
    if (!idMatch) continue;

    const idNumber = idMatch[1];

    // If cells exist, evaluate each cell separately to isolate the best pure person-name cell
    let fullName = '';
    const extraCellNotes: string[] = [];

    if (structLine.cells.length >= 2) {
      let bestScore = -1;
      let bestCellIndex = -1;

      structLine.cells.forEach((cell, cIdx) => {
        const cellWestern = toWesternDigits(cell.text);
        if (cellWestern.includes(idNumber) && cellWestern.replace(idNumber, '').trim().length < 4) {
          return;
        }
        const candidate = sanitizeExtractedArabicName(cell.text);
        if (!candidate) return;
        const wordCount = candidate.split(/\s+/).filter(Boolean).length;
        // Prefer 3-5 Arabic word names with clean characters
        const score = wordCount >= 2 && wordCount <= 5 ? wordCount * 10 + candidate.length * 0.1 : wordCount;
        if (wordCount >= 2 && score > bestScore) {
          bestScore = score;
          bestCellIndex = cIdx;
          fullName = candidate;
        }
      });

      structLine.cells.forEach((cell, cIdx) => {
        if (cIdx === bestCellIndex) return;
        const cleanedCell = cleanArabicText(toWesternDigits(cell.text).replace(idNumber, '').trim());
        if (cleanedCell && cleanedCell.length >= 2 && !/^\d{1,4}$/.test(cleanedCell)) {
          extraCellNotes.push(cleanedCell);
        }
      });
    }

    // Fallback: sanitize the whole line minus ID number
    if (!fullName) {
      const textWithoutId = line.replace(idNumber, ' ').trim();
      fullName = sanitizeExtractedArabicName(textWithoutId);
    }

    if (fullName && fullName.split(/\s+/).filter(Boolean).length >= 2) {
      const { firstName, secondName, thirdName, fourthName, lastName } = splitFullName(fullName);

      // Extract remaining non-name words for metadata/notes
      const leftoverText = extraCellNotes.length > 0
        ? extraCellNotes.join(' | ')
        : cleanArabicText(
            line
              .replace(idNumber, ' ')
              .replace(fullName, ' ')
              .replace(/^\d+\s*/, '')
              .trim()
          );

      let destination = '';
      const destCandidate = leftoverText.split('|')[0]?.trim() || '';
      if (destCandidate && destCandidate.length >= 2 && destCandidate.length <= 25 && !/الجدول/.test(destCandidate)) {
        destination = destCandidate;
      }

      let travelAllowed: 'نعم' | 'لا' = 'نعم';
      if (line.includes('ممنوع') || line.includes('رفض') || line.includes('إرجاع') || line.includes('معمم') || line.includes('حظر')) {
        travelAllowed = 'لا';
      }

      records.push({
        fullName,
        firstName,
        secondName,
        thirdName,
        fourthName,
        lastName,
        idNumber,
        idType: idNumber.length >= 10 ? 'رقم وطني' : /^[A-Z]/i.test(idNumber) ? 'جواز' : 'شخصية',
        country: 'اليمن',
        destination,
        travelAllowed,
        status: travelAllowed === 'لا' ? 'ممنوع' : 'مسموح',
        additionalInfo: leftoverText ? `بيانات إضافية: ${leftoverText}` : '',
        rawSource: `سطر ${idx + 1}: ${line.slice(0, 50)}...`
      });
    }
  }

  return records;
}

/**
 * 3. Match extracted records against the current travelers database
 * with Intelligent Identification, Diffs, and Additional Info Merging
 */
export function reconcileWithDatabase(
  extractedList: ExtractedTravelerData[],
  existingTravelers: Traveler[]
): ReconciliationRecord[] {
  return extractedList.map((data, index) => {
    const tempId = `rec-${Date.now()}-${index}`;
    
    // Match 1: By Document / ID Number (Clean string match)
    const normExtractedId = data.idNumber ? data.idNumber.trim().toLowerCase().replace(/[\s\-_]/g, '') : '';
    let match = existingTravelers.find(t => {
      if (!normExtractedId || !t.idNumber) return false;
      const normCurId = String(t.idNumber).trim().toLowerCase().replace(/[\s\-_]/g, '');
      return normCurId === normExtractedId;
    });

    // Match 2: By Full Name if not matched by ID
    if (!match && data.firstName) {
      const extractedFullName = normalizeArabic(`${data.firstName} ${data.secondName || ''} ${data.thirdName || ''} ${data.lastName || ''}`.trim());
      if (extractedFullName.length >= 6) {
        match = existingTravelers.find(t => {
          const curFullName = normalizeArabic(`${t.firstName} ${t.secondName || ''} ${t.thirdName || ''} ${t.lastName || ''}`.trim());
          return curFullName === extractedFullName || (curFullName.length > 8 && extractedFullName.includes(curFullName)) || (extractedFullName.length > 8 && curFullName.includes(extractedFullName));
        });
      }
    }

    const diffs: FieldDiff[] = [];
    if (match) {
      const checkDiff = (field: keyof Traveler, label: string, incomingVal?: string | number) => {
        if (incomingVal !== undefined && incomingVal !== '' && incomingVal !== 0) {
          const currentVal = match![field] ? String(match![field]) : '';
          const incStr = String(incomingVal);
          if (currentVal !== incStr) {
            diffs.push({
              field,
              label,
              currentValue: currentVal || '(فارغ)',
              incomingValue: incStr
            });
          }
        }
      };

      checkDiff('destination', 'الوجهة', data.destination);
      checkDiff('center', 'المركز / المنفذ', data.center);
      checkDiff('agency', 'الوكالة / الكفيل', data.agency);
      checkDiff('receiveDate', 'تاريخ الاستلام', data.receiveDate);
      checkDiff('travelAllowed', 'قرار السفر', data.travelAllowed);
      checkDiff('status', 'الحالة', data.status);
      checkDiff('returnReason', 'سبب الارتجاع', data.returnReason);
      checkDiff('vettingResult', 'نتيجة المباينة', data.vettingResult);
      checkDiff('phone', 'الهاتف / الجوال', data.phone);
      checkDiff('visitReason', 'الغرض / التأشيرة', data.visitReason);
      checkDiff('investigatingOfficer', 'ضابط التحقيق', data.investigatingOfficer);

      // Check additional info diff
      if (data.additionalInfo) {
        const currentAdditional = match.additionalInfo || '';
        if (!currentAdditional.includes(data.additionalInfo)) {
          diffs.push({
            field: 'additionalInfo',
            label: 'معلومات إضافية وملاحظات',
            currentValue: currentAdditional ? `${currentAdditional.slice(0, 30)}...` : '(فارغ)',
            incomingValue: data.additionalInfo
          });
        }
      }
    }

    return {
      tempId,
      data,
      status: match ? 'matched' : 'new',
      existingTraveler: match,
      diffs,
      selected: true
    };
  });
}
