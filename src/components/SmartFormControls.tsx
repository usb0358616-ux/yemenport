import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  FileIcon,
  History,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  compressImageFileToDataUrl,
  DateAndPassportValidation,
  DuplicateCheckResult,
  LiveWatchlistCheckResult,
  PersonLookupResult
} from '@/lib/formIntelligence';

/* ============================================================================
 * 1. SearchableCombobox — قائمة بحث واختيار ذكية مع دعم القيم الجديدة والتنبيهات
 * ============================================================================ */
export interface ComboboxOption {
  value: string;
  label?: string;
  meta?: string;
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | ComboboxOption)[];
  placeholder?: string;
  allowCustom?: boolean;
  warningMessage?: string;
  className?: string;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = 'ابحث أو اختر من القائمة...',
  allowCustom = true,
  warningMessage,
  className = ''
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const normalizedOptions: ComboboxOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : { ...opt, label: opt.label || opt.value }
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? normalizedOptions.filter(
        (o) =>
          o.value.toLowerCase().includes(q) ||
          (o.label && o.label.toLowerCase().includes(q)) ||
          (o.meta && o.meta.toLowerCase().includes(q))
      )
    : normalizedOptions;

  const exactExists = normalizedOptions.some((o) => o.value.trim().toLowerCase() === q);

  return (
    <div ref={containerRef} className={`relative ${className}`} dir="rtl">
      <div className="relative flex items-center">
        <Input
          value={open ? query : value}
          onFocus={() => {
            setQuery(value || '');
            setOpen(true);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (!open) setOpen(true);
            if (allowCustom) onChange(next);
          }}
          placeholder={placeholder}
          className="text-right pl-14 h-9 text-xs bg-background"
        />
        <div className="absolute left-1.5 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setQuery('');
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
              title="مسح"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setQuery(value || '');
              setOpen((prev) => !prev);
            }}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            title="فتح القائمة"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {warningMessage && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-800">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
          <span>{warningMessage}</span>
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto adaptive-scroll-region divide-y divide-slate-100">
            {allowCustom && q.length > 0 && !exactExists && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-right text-xs font-bold text-primary hover:bg-primary/5 flex items-center justify-between gap-2"
              >
                <span>إدراج قيمة جديدة: "{query.trim()}"</span>
                <Plus className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-slate-400">
                لا توجد خيارات مطابقة
              </div>
            ) : (
              filtered.slice(0, 60).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setQuery(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-right text-xs flex items-center justify-between gap-2 transition-colors hover:bg-slate-50 ${
                    opt.value === value ? 'bg-primary/5 font-bold text-primary' : 'text-slate-800'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.meta && <span className="text-[10px] text-slate-400 shrink-0 font-mono">{opt.meta}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 2. LiveFormAlertsBanner — شريط الفحص الذكي اللحظي (تطابق أمني / تكرار / إكمال تلقائي / تواريخ)
 * ============================================================================ */
interface LiveFormAlertsBannerProps {
  lookupMatch?: PersonLookupResult | null;
  onApplyAutoFill?: (match: PersonLookupResult) => void;
  duplicateCheck?: DuplicateCheckResult | null;
  onOpenExistingDuplicate?: (existingId: string) => void;
  watchlistCheck?: LiveWatchlistCheckResult | null;
  validation?: DateAndPassportValidation | null;
}

export const LiveFormAlertsBanner: React.FC<LiveFormAlertsBannerProps> = ({
  lookupMatch,
  onApplyAutoFill,
  duplicateCheck,
  onOpenExistingDuplicate,
  watchlistCheck,
  validation
}) => {
  const hasAnything =
    Boolean(watchlistCheck?.matched) ||
    Boolean(duplicateCheck?.isDuplicate) ||
    Boolean(lookupMatch) ||
    Boolean(validation && validation.warnings.length > 0);

  if (!hasAnything) return null;

  return (
    <div className="space-y-2" dir="rtl">
      {watchlistCheck?.matched && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900">
          <div className="flex items-start gap-2 min-w-0">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold">
                تنبيه أمني فوري ({watchlistCheck.source}): {watchlistCheck.title}
              </p>
              {watchlistCheck.details && (
                <p className="text-[11px] text-rose-700 mt-0.5">{watchlistCheck.details}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {duplicateCheck?.isDuplicate && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold">تنبيه تكرار سجل</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{duplicateCheck.summary}</p>
            </div>
          </div>
          {duplicateCheck.existingId && onOpenExistingDuplicate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenExistingDuplicate(duplicateCheck.existingId!)}
              className="h-8 text-[11px] font-bold border-amber-300 bg-white hover:bg-amber-100 text-amber-900 whitespace-nowrap shrink-0"
            >
              فتح/تحديث السجل القائم
            </Button>
          )}
        </div>
      )}

      {lookupMatch && onApplyAutoFill && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
          <div className="flex items-start gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold">
                تطابق مع السجل التاريخي ({lookupMatch.sourceModule}): {lookupMatch.fullName}
              </p>
              <p className="text-[11px] text-sky-800 mt-0.5">
                عدد السجلات/الرحلات السابقة: <strong className="font-mono tabular-nums">{lookupMatch.previousTripsCount}</strong> · الجنسية: {lookupMatch.country}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onApplyAutoFill(lookupMatch)}
            className="h-8 text-[11px] font-bold bg-sky-700 hover:bg-sky-800 text-white whitespace-nowrap shrink-0"
          >
            تعبئة تلقائية من السجل
          </Button>
        </div>
      )}

      {validation && validation.warnings.length > 0 && (
        <div
          className={`rounded-xl border px-3 py-2 text-[11px] space-y-1 ${
            validation.isExpired || validation.hasDateInversion
              ? 'border-rose-200 bg-rose-50/70 text-rose-800'
              : 'border-amber-200 bg-amber-50/70 text-amber-800'
          }`}
        >
          {validation.warnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. DraftRecoveryBanner — شريط استرجاع المسودة المحفوظة تلقائياً
 * ============================================================================ */
interface DraftRecoveryBannerProps {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}

export const DraftRecoveryBanner: React.FC<DraftRecoveryBannerProps> = ({
  savedAt,
  onRestore,
  onDiscard
}) => {
  const formattedTime = (() => {
    try {
      return new Date(savedAt).toLocaleString('ar-YE', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short'
      });
    } catch {
      return savedAt;
    }
  })();

  return (
    <div
      className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-950"
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0">
        <History className="h-4 w-4 text-indigo-600 shrink-0" />
        <span className="font-medium">
          توجد مسودة غير محفوظة من جلسة سابقة (<span className="font-mono tabular-nums">{formattedTime}</span>)
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          size="sm"
          onClick={onRestore}
          className="h-8 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shrink-0"
        >
          استرجاع المسودة
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDiscard}
          className="h-8 text-[11px] border-indigo-200 bg-white hover:bg-indigo-100 whitespace-nowrap shrink-0"
        >
          تجاهل
        </Button>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. StructuredAttachmentsField — رفع وضغط الصور تلقائياً قبل الحفظ
 * ============================================================================ */
interface StructuredAttachmentsFieldProps {
  attachments: string[];
  onChange: (next: string[]) => void;
  label?: string;
}

export const StructuredAttachmentsField: React.FC<StructuredAttachmentsFieldProps> = ({
  attachments,
  onChange,
  label = 'المرفقات (صور مضغوطة تلقائياً / ملفات PDF)'
}) => {
  const [compressing, setCompressing] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCompressing(true);
    try {
      const processed: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await compressImageFileToDataUrl(file, 960, 0.72);
        processed.push(dataUrl);
      }
      onChange([...attachments, ...processed]);
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-700">{label}</label>
        {compressing && <span className="text-[11px] text-primary font-medium">جاري ضغط الصور وتجهيزها...</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att, i) => (
          <div key={i} className="relative group w-20 h-20 border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
            {att.startsWith('data:image') ? (
              <img src={att} alt={`مرفق ${i + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-slate-600">
                <FileIcon className="h-6 w-6 mb-1 text-rose-500" />
                PDF
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}
              className="absolute top-1 left-1 bg-rose-600 text-white p-1 rounded-md opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shadow-xs"
              title="حذف المرفق"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="w-20 h-20 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors text-slate-500">
          <Upload className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-medium">رفع ملف</span>
          <input type="file" className="hidden" accept="image/*,.pdf" multiple onChange={handleFiles} />
        </label>
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. InlineBatchGridEditor — محرر جدولي سريع ولصق جماعي من الحافظة / Excel
 * ============================================================================ */
export interface BatchColumnDef {
  key: string;
  label: string;
  placeholder?: string;
  mono?: boolean;
}

interface InlineBatchGridEditorProps<T extends Record<string, string>> {
  title: string;
  subtitle?: string;
  columns: BatchColumnDef[];
  rows: T[];
  onChange: (nextRows: T[]) => void;
  createEmptyRow: () => T;
}

export function InlineBatchGridEditor<T extends Record<string, string>>({
  title,
  subtitle,
  columns,
  rows,
  onChange,
  createEmptyRow
}: InlineBatchGridEditorProps<T>) {
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');

  const handleParsePaste = () => {
    const lines = pasteBuffer
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const newRows = lines.map((line) => {
      const cells = line.split(/\t|,|\||;/).map((c) => c.trim());
      const row = createEmptyRow();
      columns.forEach((col, idx) => {
        if (cells[idx] !== undefined) {
          (row as Record<string, string>)[col.key] = cells[idx];
        }
      });
      return row;
    });

    const filteredExisting = rows.filter((r) =>
      Object.values(r).some((v) => String(v || '').trim().length > 0)
    );
    onChange([...filteredExisting, ...newRows]);
    setPasteBuffer('');
    setPasteMode(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900">{title}</h4>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPasteMode((prev) => !prev)}
            className="h-8 text-[11px] gap-1 bg-white whitespace-nowrap shrink-0"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-indigo-600" />
            لصق جماعي من Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...rows, createEmptyRow()])}
            className="h-8 text-[11px] gap-1 bg-white whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-600" />
            إضافة صف
          </Button>
        </div>
      </div>

      {pasteMode && (
        <div className="rounded-lg border border-indigo-200 bg-white p-2.5 space-y-2">
          <p className="text-[11px] text-slate-600">
            الصق الأسطر هنا مفصولة بـ (Tab أو فاصلة): ترتيب الأعمدة: <strong>{columns.map((c) => c.label).join(' ، ')}</strong>
          </p>
          <textarea
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
            rows={4}
            placeholder="مثال: احمد محمد علي، 14253678، اليمن"
            className="w-full rounded-lg border border-slate-200 p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setPasteMode(false)} className="h-8 text-xs">
              إلغاء
            </Button>
            <Button type="button" size="sm" onClick={handleParsePaste} className="h-8 text-xs gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> إدراج الصفوف
            </Button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs text-right min-w-[440px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-2 w-8 text-center">#</th>
                {columns.map((col) => (
                  <th key={col.key} className="p-2">
                    {col.label}
                  </th>
                ))}
                <th className="p-2 w-10 text-center">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="p-1.5 text-center font-mono tabular-nums text-slate-400">{idx + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="p-1.5">
                      <Input
                        value={row[col.key] || ''}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...next[idx], [col.key]: e.target.value };
                          onChange(next);
                        }}
                        placeholder={col.placeholder}
                        className={`h-8 text-xs text-right ${col.mono ? 'font-mono tabular-nums' : ''}`}
                      />
                    </td>
                  ))}
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      title="حذف الصف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * مساعد لتسريع الإدخال بمفتاح Enter والانتقال للحقل التالي داخل النموذج
 */
export function handleEnterAdvanceFocus(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter') return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
  const formContainer = (e.target as HTMLElement).closest('form, [role="dialog"]');
  if (!formContainer) return;
  const focusables = Array.from(
    formContainer.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled])'
    )
  );
  const idx = focusables.indexOf(e.target as HTMLElement);
  if (idx >= 0 && idx < focusables.length - 1) {
    e.preventDefault();
    focusables[idx + 1].focus();
  }
}
