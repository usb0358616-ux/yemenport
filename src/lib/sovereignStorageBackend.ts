/**
 * محرك التخزين السيادي عالي السعة (IndexedDB + In-Memory Sync Cache)
 * يحل مشكلة امتلاء localStorage (حد 5 ميجابايت) نهائياً عبر نقل قواعد البيانات الضخمة
 * (المسافرون، البلاغات، المذكرات، المضبوطات، الصور والوثائق) إلى IndexedDB بسعة تصل لمئات الميجابايت
 * مع الإبقاء على واجهة قراءة/كتابة متزامنة (Synchronous) 100% متوافقة مع كل وحدات النظام.
 */

const DB_NAME = 'sovereign_borders_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';

const BULK_KEYS = new Set<string>([
  'travelers',
  'reports',
  'mofa_visa_requests',
  'sovereign_seizures',
  'sovereign_migrants',
  'sovereign_refugees',
  'sovereign_foreigners',
  'sovereign_permits',
  'sovereign_citizenship_cases',
  'sovereign_companies',
  'sovereign_correspondence',
  'sovereign_audit_logs',
  'movements',
  'sovereign_ai_brain_memory',
  'sovereign_live_watchlist_alerts'
]);

const memoryCache = new Map<string, string>();
let idbInstance: IDBDatabase | null = null;
let idbReady = false;
let initPromise: Promise<void> | null = null;

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('IndexedDB open failed, falling back to memory + safe localStorage:', request.error);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeToIdb(key: string, value: string): Promise<boolean> {
  if (!idbInstance) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      const tx = idbInstance!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function deleteFromIdb(key: string): Promise<boolean> {
  if (!idbInstance) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      const tx = idbInstance!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function loadAllFromIdb(db: IDBDatabase): Promise<Record<string, string>> {
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const result: Record<string, string> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && typeof cursor.value === 'string') {
            result[cursor.key] = cursor.value;
          }
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      cursorReq.onerror = () => resolve(result);
    } catch {
      resolve({});
    }
  });
}

/**
 * تهيئة محرك التخزين السيادي وترحيل أي بيانات سابقة من localStorage إلى IndexedDB تلقائياً
 */
export async function initSovereignStorage(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dbPromise = openDatabase();
    const db = await Promise.race([
      dbPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
    ]);

    if (db) {
      idbInstance = db;
      idbReady = true;

      const existingIdbEntries = await Promise.race([
        loadAllFromIdb(db),
        new Promise<Record<string, string>>(resolve => setTimeout(() => resolve({}), 1500))
      ]);

      for (const [k, v] of Object.entries(existingIdbEntries)) {
        if (!memoryCache.has(k)) {
          memoryCache.set(k, v);
        }
      }
    }

    // Migrate pre-existing localStorage keys into memory + IndexedDB
    if (canUseLocalStorage()) {
      const keysToMigrate: { key: string; value: string }[] = [];
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (!key) continue;
          const val = window.localStorage.getItem(key);
          if (val === null) continue;
          if (!memoryCache.has(key)) {
            memoryCache.set(key, val);
          }
          if (idbReady && (!BULK_KEYS.has(key) || !memoryCache.has(key) || val.length > 0)) {
            keysToMigrate.push({ key, value: memoryCache.get(key) || val });
          }
        }
      } catch {
        // ignore enumeration errors
      }

      if (idbReady && keysToMigrate.length > 0) {
        for (const item of keysToMigrate) {
          const ok = await writeToIdb(item.key, item.value);
          // Once bulky domain tables are persisted safely in IndexedDB, remove them from 5MB localStorage
          if (ok && BULK_KEYS.has(item.key)) {
            try {
              window.localStorage.removeItem(item.key);
            } catch {
              // ignore
            }
          }
        }
      }
    }
  })();

  return initPromise;
}

/**
 * قراءة متزامنة فائقة السرعة من الذاكرة المخبئية (مع رجوع تلقائي لـ localStorage قبل التهيئة)
 */
export function kvGet(key: string): string | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }
  if (canUseLocalStorage()) {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        memoryCache.set(key, val);
        return val;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * كتابة متزامنة فورية في الذاكرة + حفظ غير متزامن دائم في IndexedDB بدون أي قيود 5MB
 */
export function kvSet(key: string, value: string): void {
  const strVal = String(value);
  memoryCache.set(key, strVal);

  if (idbReady && idbInstance) {
    void writeToIdb(key, strVal).then(ok => {
      if (ok && BULK_KEYS.has(key) && canUseLocalStorage()) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    });
  }

  // Mirror lightweight session/config keys to localStorage safely; never store >120KB blobs in localStorage
  const isBulk = BULK_KEYS.has(key) || key.startsWith('draft_') || strVal.length > 120_000;
  if (!isBulk && canUseLocalStorage()) {
    try {
      window.localStorage.setItem(key, strVal);
    } catch {
      // Never throw QuotaExceededError — IndexedDB + memoryCache hold the authoritative data
    }
  } else if (!idbReady && canUseLocalStorage() && strVal.length <= 2_500_000) {
    // Only if IndexedDB isn't available at all (e.g., unit test), try best-effort fallback
    try {
      window.localStorage.setItem(key, strVal);
    } catch {
      // keep in memoryCache without crashing
    }
  }
}

export function kvRemove(key: string): void {
  memoryCache.delete(key);
  if (idbReady && idbInstance) {
    void deleteFromIdb(key);
  }
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function isBulkStorageKey(key: string): boolean {
  return BULK_KEYS.has(key);
}

export interface SovereignStorageBreakdownItem {
  key: string;
  label: string;
  bytes: number;
  count?: number;
}

export interface SovereignStorageStats {
  idbReady: boolean;
  totalKeys: number;
  totalBytes: number;
  localStorageBytes: number;
  browserQuotaBytes?: number;
  browserUsageBytes?: number;
  breakdown: SovereignStorageBreakdownItem[];
}

const KEY_LABELS: Record<string, string> = {
  travelers: 'سجل المسافرين والتأشيرات',
  reports: 'بلاغات الضبط والنقل والتقارير',
  mofa_visa_requests: 'مذكرات الخارجية والمنظمات والرحلات',
  sovereign_seizures: 'محاضر الضبط والجوازات المحتجزة',
  sovereign_migrants: 'سجل المهاجرين غير الشرعيين',
  sovereign_refugees: 'ملفات اللاجئين (UNHCR)',
  sovereign_foreigners: 'الوافدون الأجانب والإقامات',
  sovereign_permits: 'تصاريح التنقل الداخلي',
  sovereign_citizenship_cases: 'معاملات الجنسية ووثائق السفر',
  sovereign_companies: 'الشركات ووكالات السفر',
  sovereign_correspondence: 'المكاتبات والبرقيات الرسمية',
  sovereign_audit_logs: 'سجلات التدقيق والرقابة',
  sovereign_ai_brain_memory: 'ذاكرة القارئ الذكي',
  sovereign_live_watchlist_alerts: 'تنبيهات التطابق الأمني OCR'
};

export function formatBytesArabic(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

export async function getSovereignStorageStats(): Promise<SovereignStorageStats> {
  let totalBytes = 0;
  const breakdown: SovereignStorageBreakdownItem[] = [];

  for (const [k, v] of memoryCache.entries()) {
    const bytes = v.length * 2;
    totalBytes += bytes;
    if (KEY_LABELS[k]) {
      let count: number | undefined;
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) count = parsed.length;
      } catch {
        // ignore
      }
      breakdown.push({ key: k, label: KEY_LABELS[k], bytes, count });
    }
  }
  breakdown.sort((a, b) => b.bytes - a.bytes);

  let localStorageBytes = 0;
  if (canUseLocalStorage()) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        const v = window.localStorage.getItem(k) || '';
        localStorageBytes += (k.length + v.length) * 2;
      }
    } catch {
      // ignore
    }
  }

  let browserQuotaBytes: number | undefined;
  let browserUsageBytes: number | undefined;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      browserQuotaBytes = est.quota;
      browserUsageBytes = est.usage;
    } catch {
      // ignore
    }
  }

  return {
    idbReady,
    totalKeys: memoryCache.size,
    totalBytes,
    localStorageBytes,
    browserQuotaBytes,
    browserUsageBytes,
    breakdown
  };
}

/**
 * تنظيف وضغط السجلات المكررة والبيانات الثقيلة وإخلاء localStorage بالكامل ليبقى للجلسة فقط
 */
export async function optimizeSovereignStorage(): Promise<{ freedLocalStorageBytes: number; compactedTravelers: number }> {
  let freedLocalStorageBytes = 0;
  if (idbReady && canUseLocalStorage()) {
    for (const bulkKey of BULK_KEYS) {
      const lsVal = window.localStorage.getItem(bulkKey);
      if (lsVal) {
        freedLocalStorageBytes += lsVal.length * 2;
        if (!memoryCache.has(bulkKey)) {
          memoryCache.set(bulkKey, lsVal);
        }
        await writeToIdb(bulkKey, memoryCache.get(bulkKey)!);
        try {
          window.localStorage.removeItem(bulkKey);
        } catch {
          // ignore
        }
      }
    }
  }

  let compactedTravelers = 0;
  const rawTravelers = kvGet('travelers');
  if (rawTravelers) {
    try {
      const list = JSON.parse(rawTravelers);
      if (Array.isArray(list)) {
        const compacted = list.map((t: any) => {
          let changed = false;
          const next = { ...t };
          if (Array.isArray(next.mergeHistory) && next.mergeHistory.length > 5) {
            next.mergeHistory = next.mergeHistory.slice(-5);
            changed = true;
          }
          if (next.unmappedFields && Object.keys(next.unmappedFields).length === 0) {
            delete next.unmappedFields;
            changed = true;
          }
          if (changed) compactedTravelers++;
          return next;
        });
        if (compactedTravelers > 0) {
          kvSet('travelers', JSON.stringify(compacted));
        }
      }
    } catch {
      // ignore
    }
  }

  return { freedLocalStorageBytes, compactedTravelers };
}
