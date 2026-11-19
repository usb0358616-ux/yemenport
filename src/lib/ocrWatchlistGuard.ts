/**
 * محرك التحقق الفوري من تطابق بيانات الجواز (OCR) مع قائمة المطلوبين أمنياً وبلاغات الضبط
 * مع بث تنبيه فوري إلى لوحة التحكم وسجل التدقيق السيادي
 */
import {
  addAuditLog,
  cleanArabicText,
  generateId,
  getReports,
  getSeizures,
  getTravelers,
  normalizeArabic
} from './storage';
import { notifySovereignDataUpdated } from './unifiedImportHub';
import { kvGet, kvSet } from './sovereignStorageBackend';

export const LIVE_WATCHLIST_ALERTS_KEY = 'sovereign_live_watchlist_alerts';
export const OCR_WATCHLIST_ALERT_EVENT = 'sovereign-ocr-watchlist-alert';

export type OcrAlertSourceType = 'mlkit_upload' | 'camera_ocr' | 'batch_import' | 'manual_entry';

export interface OcrWatchlistAlert {
  id: string;
  detectedAt: string;
  sourceType: OcrAlertSourceType;
  sourceLabel: string;
  travelerName: string;
  passportNameEn?: string;
  passportNumber: string;
  birthDate?: string;
  matchType: 'رقم الجواز' | 'الاسم الكامل' | 'الاسم وتاريخ الميلاد';
  alertSource: 'بلاغ ضبط أمني' | 'محضر احتجاز جواز' | 'قائمة المنع والترقب';
  matchedRecordTitle: string;
  matchedRecordId?: string;
  severity: 'critical' | 'high';
  details: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface WatchlistVerificationInput {
  fullName?: string;
  fullNameEnglish?: string;
  passportNumber?: string;
  birthDate?: string;
  sourceType?: OcrAlertSourceType;
  sourceLabel?: string;
  emitDashboardAlert?: boolean;
}

export interface WatchlistVerificationResult {
  matched: boolean;
  alert?: OcrWatchlistAlert;
  matchType?: OcrWatchlistAlert['matchType'];
  alertSource?: OcrWatchlistAlert['alertSource'];
  matchedRecordTitle?: string;
  matchedRecordId?: string;
  severity?: 'critical' | 'high';
  details?: string;
}

const WANTED_KEYWORDS_REGEX =
  /مطلوب|تعميم|منع|ممنوع|توقيف|ضبط|تحري|أمني|امني|إلقاء القبض|القاء القبض|مشتبه|تزوير|قائمة سوداء|مطلوبين/;

function normalizeId(val?: string): string {
  return normalizeArabic(val || '').replace(/[\s\-_]+/g, '').toLowerCase();
}

function getArabicNameTokens(val?: string): string[] {
  const norm = normalizeArabic(val || '')
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return norm.split(' ').filter(t => t.length >= 2);
}

function doesNameMatchHaystack(queryName: string, haystackNormalized: string): boolean {
  const cleanQ = normalizeArabic(queryName).toLowerCase().trim();
  if (cleanQ.length < 6) return false;
  if (haystackNormalized.includes(cleanQ)) return true;

  const tokens = getArabicNameTokens(cleanQ);
  if (tokens.length < 3) return false;

  // Check if at least first + second + last (or >=3 sequential/significant tokens) appear in haystack
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!haystackNormalized.includes(first) || !haystackNormalized.includes(last)) return false;

  const matchedCount = tokens.filter(tok => haystackNormalized.includes(tok)).length;
  return matchedCount >= Math.min(tokens.length, 3) && matchedCount / tokens.length >= 0.75;
}

export function getLiveOcrWatchlistAlerts(): OcrWatchlistAlert[] {
  try {
    const raw = kvGet(LIVE_WATCHLIST_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLiveOcrWatchlistAlerts(alerts: OcrWatchlistAlert[]): void {
  kvSet(LIVE_WATCHLIST_ALERTS_KEY, JSON.stringify(alerts.slice(0, 60)));
}

export function acknowledgeOcrWatchlistAlert(id: string, officerName?: string): OcrWatchlistAlert[] {
  const current = getLiveOcrWatchlistAlerts();
  const next = current.map(item =>
    item.id === id
      ? {
          ...item,
          acknowledged: true,
          acknowledgedBy: officerName || 'ضابط المناوبة',
          acknowledgedAt: new Date().toISOString()
        }
      : item
  );
  saveLiveOcrWatchlistAlerts(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OCR_WATCHLIST_ALERT_EVENT, { detail: { updated: true } }));
  }
  notifySovereignDataUpdated('watchlist_alert');
  return next;
}

export function acknowledgeAllOcrWatchlistAlerts(officerName?: string): OcrWatchlistAlert[] {
  const current = getLiveOcrWatchlistAlerts();
  const now = new Date().toISOString();
  const next = current.map(item =>
    item.acknowledged
      ? item
      : {
          ...item,
          acknowledged: true,
          acknowledgedBy: officerName || 'ضابط المناوبة',
          acknowledgedAt: now
        }
  );
  saveLiveOcrWatchlistAlerts(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OCR_WATCHLIST_ALERT_EVENT, { detail: { updated: true } }));
  }
  notifySovereignDataUpdated('watchlist_alert');
  return next;
}

function pushDashboardWatchlistAlert(alert: OcrWatchlistAlert) {
  const existing = getLiveOcrWatchlistAlerts();
  // Deduplicate exact same unacknowledged alert triggered within last 60 seconds
  const recentSame = existing.find(
    a =>
      !a.acknowledged &&
      a.passportNumber === alert.passportNumber &&
      a.matchedRecordTitle === alert.matchedRecordTitle &&
      Date.now() - new Date(a.detectedAt).getTime() < 60000
  );
  if (recentSame) {
    return recentSame;
  }

  const next = [alert, ...existing].slice(0, 60);
  saveLiveOcrWatchlistAlerts(next);

  addAuditLog(
    'تنبيه أمني OCR',
    'المسافرين',
    `[${alert.alertSource}] تطابق (${alert.matchType}) للمسافر "${alert.travelerName}" (جواز: ${alert.passportNumber || '-'}) مع: ${alert.matchedRecordTitle}`,
    alert.matchedRecordId
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OCR_WATCHLIST_ALERT_EVENT, { detail: { alert } }));
  }
  notifySovereignDataUpdated('watchlist_alert');
  return alert;
}

/**
 * التحقق المتقاطع لبيانات الجواز المستخرجة عبر OCR مع:
 * 1) بلاغات الضبط والمطلوبين أمنياً (Reports)
 * 2) محاضر الجوازات المحتجزة المفتوحة (PassportSeizures)
 * 3) سجلات الممنوعين من السفر (Banned Travelers)
 */
export function verifyOcrPassportAgainstWatchlist(
  input: WatchlistVerificationInput
): WatchlistVerificationResult {
  const cleanId = normalizeId(input.passportNumber);
  const fullNameAr = cleanArabicText(input.fullName || '');
  const fullNameEn = String(input.fullNameEnglish || '').trim().toLowerCase();

  if (cleanId.length < 4 && fullNameAr.length < 5 && fullNameEn.length < 5) {
    return { matched: false };
  }

  let matchFound: Omit<WatchlistVerificationResult, 'matched' | 'alert'> | null = null;

  // 1. Check Security Reports & Wanted Bulletins
  const reports = getReports();
  for (const r of reports) {
    const haystack = normalizeArabic(`${r.autoNumber || ''} ${r.subject || ''} ${r.title || ''} ${r.description || ''}`).toLowerCase();
    const isWantedPriority = r.priority === 'سري وعاجل' || r.priority === 'عاجل' || WANTED_KEYWORDS_REGEX.test(haystack);

    if (cleanId.length >= 5 && haystack.includes(cleanId)) {
      matchFound = {
        matchType: 'رقم الجواز',
        alertSource: 'بلاغ ضبط أمني',
        matchedRecordTitle: r.title,
        matchedRecordId: r.id,
        severity: isWantedPriority ? 'critical' : 'high',
        details: `تطابق رقم الجواز (${input.passportNumber}) مع البلاغ رقم ${r.autoNumber || r.id}: ${r.title}`
      };
      break;
    }

    const nameMatched =
      (fullNameAr.length >= 6 && doesNameMatchHaystack(fullNameAr, haystack)) ||
      (fullNameEn.length >= 6 && haystack.includes(fullNameEn));

    if (nameMatched) {
      const dobMatched = Boolean(input.birthDate && haystack.includes(input.birthDate));
      matchFound = {
        matchType: dobMatched ? 'الاسم وتاريخ الميلاد' : 'الاسم الكامل',
        alertSource: 'بلاغ ضبط أمني',
        matchedRecordTitle: r.title,
        matchedRecordId: r.id,
        severity: isWantedPriority ? 'critical' : 'high',
        details: `تطابق اسم صاحب الجواز (${fullNameAr || input.fullNameEnglish}) مع البلاغ الأمني: ${r.title}`
      };
      break;
    }
  }

  // 2. Check Open Passport Seizures
  if (!matchFound) {
    const seizures = getSeizures();
    for (const s of seizures) {
      if (s.status === 'تم التسليم') continue;
      const sPass = normalizeId(s.passportNumber);
      const sName = normalizeArabic(s.travelerName || '').toLowerCase();

      if (cleanId.length >= 5 && sPass === cleanId) {
        matchFound = {
          matchType: 'رقم الجواز',
          alertSource: 'محضر احتجاز جواز',
          matchedRecordTitle: `محضر احتجاز ${s.recordNumber} (${s.status})`,
          matchedRecordId: s.id,
          severity: 'critical',
          details: `رقم الجواز (${input.passportNumber}) محتجز حالياً في ${s.seizurePort} — السبب: ${s.reason}`
        };
        break;
      }

      if (fullNameAr.length >= 6 && doesNameMatchHaystack(fullNameAr, sName)) {
        matchFound = {
          matchType: 'الاسم الكامل',
          alertSource: 'محضر احتجاز جواز',
          matchedRecordTitle: `محضر احتجاز ${s.recordNumber}`,
          matchedRecordId: s.id,
          severity: 'high',
          details: `الاسم (${fullNameAr}) مدرج في محضر احتجاز الجواز رقم ${s.passportNumber}`
        };
        break;
      }
    }
  }

  // 3. Check Banned Travelers (`travelAllowed === 'لا'`)
  if (!matchFound) {
    const travelers = getTravelers();
    for (const t of travelers) {
      const hasBanFlag =
        t.travelAllowed === 'لا' ||
        /ممنوع|مطلوب|تزوير|تعميم/.test(`${t.vettingResult || ''} ${t.status || ''}`);
      if (!hasBanFlag) continue;

      const tPass = normalizeId(t.idNumber);
      const tFullName = normalizeArabic(
        `${t.firstName || ''} ${t.secondName || ''} ${t.thirdName || ''} ${t.fourthName || ''} ${t.lastName || ''} ${t.passportName || ''}`
      ).toLowerCase();

      if (cleanId.length >= 5 && tPass === cleanId) {
        matchFound = {
          matchType: 'رقم الجواز',
          alertSource: 'قائمة المنع والترقب',
          matchedRecordTitle: `مسافر ممنوع من السفر (${t.firstName} ${t.lastName || ''})`.trim(),
          matchedRecordId: t.id,
          severity: 'critical',
          details: `رقم الجواز (${input.passportNumber}) مقيد بقرار منع سفر: ${t.vettingResult || t.returnReason || 'قرار أمني'}`
        };
        break;
      }

      const nameHit =
        (fullNameAr.length >= 6 && doesNameMatchHaystack(fullNameAr, tFullName)) ||
        (fullNameEn.length >= 6 && tFullName.includes(fullNameEn));
      if (nameHit) {
        const dobHit = Boolean(input.birthDate && t.birthDate && t.birthDate === input.birthDate);
        matchFound = {
          matchType: dobHit ? 'الاسم وتاريخ الميلاد' : 'الاسم الكامل',
          alertSource: 'قائمة المنع والترقب',
          matchedRecordTitle: `سجل منع سفر مطابق (${t.idNumber})`,
          matchedRecordId: t.id,
          severity: dobHit ? 'critical' : 'high',
          details: `تطابق الاسم مع مسافر ممنوع من السفر (وثيقة رقم ${t.idNumber}): ${t.vettingResult || 'ممنوع من العبور'}`
        };
        break;
      }
    }
  }

  if (!matchFound) {
    return { matched: false };
  }

  let persistedAlert: OcrWatchlistAlert | undefined;
  if (input.emitDashboardAlert !== false) {
    persistedAlert = pushDashboardWatchlistAlert({
      id: `ocr-alert-${Date.now()}-${generateId()}`,
      detectedAt: new Date().toISOString(),
      sourceType: input.sourceType || 'mlkit_upload',
      sourceLabel: input.sourceLabel || 'فحص جواز عبر OCR',
      travelerName: fullNameAr || input.fullNameEnglish || 'صاحب الوثيقة',
      passportNameEn: input.fullNameEnglish,
      passportNumber: input.passportNumber || '-',
      birthDate: input.birthDate,
      matchType: matchFound.matchType!,
      alertSource: matchFound.alertSource!,
      matchedRecordTitle: matchFound.matchedRecordTitle!,
      matchedRecordId: matchFound.matchedRecordId,
      severity: matchFound.severity!,
      details: matchFound.details!,
      acknowledged: false
    });
  }

  return {
    matched: true,
    alert: persistedAlert,
    ...matchFound
  };
}
