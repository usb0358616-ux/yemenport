import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Trash2,
  Plus,
  Play,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Sparkles
} from 'lucide-react';
import { Button } from './ui/button';
import { openUnifiedImport, UnifiedImportCategory } from '@/lib/unifiedImportHub';

export type FilePreviewStatus =
  | 'staged'
  | 'uploading'
  | 'pending'
  | 'analyzing'
  | 'ready'
  | 'error';

export interface FilePreviewItem {
  id: string;
  file: File;
  name?: string;
  size?: number;
  status?: FilePreviewStatus;
  recordsCount?: number;
  suggestedModule?: string;
  analysisProgress?: number;
  error?: string;
}

export interface FileFormatMeta {
  kind: 'excel' | 'csv' | 'pdf' | 'image' | 'other';
  badge: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconWrapClass: string;
}

export function detectFileFormatMeta(fileName: string, mimeType?: string): FileFormatMeta {
  const cleanName = (fileName || '').trim();
  const ext = cleanName.includes('.') ? cleanName.split('.').pop()!.toLowerCase() : '';
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet') || mime.includes('excel')) {
    return {
      kind: 'excel',
      badge: ext ? ext.toUpperCase() : 'XLSX',
      label: 'ملف إكسل',
      Icon: FileSpreadsheet,
      iconWrapClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
    };
  }

  if (ext === 'csv' || mime.includes('csv')) {
    return {
      kind: 'csv',
      badge: 'CSV',
      label: 'جدول بيانات CSV',
      Icon: FileSpreadsheet,
      iconWrapClass:
        'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800'
    };
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    return {
      kind: 'pdf',
      badge: 'PDF',
      label: 'مستند PDF',
      Icon: FileText,
      iconWrapClass:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
    };
  }

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) {
    return {
      kind: 'image',
      badge: ext ? ext.toUpperCase() : 'IMG',
      label: 'صورة وثيقة',
      Icon: ImageIcon,
      iconWrapClass:
        'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800'
    };
  }

  return {
    kind: 'other',
    badge: ext ? ext.toUpperCase().slice(0, 5) : 'FILE',
    label: 'ملف مرفق',
    Icon: FileIcon,
    iconWrapClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createFilePreviewEntries(files: File[]): FilePreviewItem[] {
  return files.map((file, idx) => ({
    id: `staged-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    name: file.name,
    size: file.size,
    status: 'staged'
  }));
}

interface FilePreviewListProps {
  files: FilePreviewItem[];
  onRemoveFile: (id: string) => void;
  onClearAll?: () => void;
  onAddMore?: () => void;
  onStartAnalysis?: () => void;
  onSelectFile?: (id: string) => void;
  selectedFileId?: string | null;
  isAnalyzing?: boolean;
  title?: string;
  startButtonLabel?: string;
  variant?: 'inline' | 'panel';
  maxHeightClass?: string;
  className?: string;
}

export const FilePreviewList: React.FC<FilePreviewListProps> = ({
  files,
  onRemoveFile,
  onClearAll,
  onAddMore,
  onStartAnalysis,
  onSelectFile,
  selectedFileId,
  isAnalyzing = false,
  title = 'الملفات المختارة قبل التحليل',
  startButtonLabel,
  variant = 'inline',
  maxHeightClass = 'max-h-56 sm:max-h-64',
  className = ''
}) => {
  if (!files || files.length === 0) return null;

  const totalBytes = files.reduce((sum, item) => sum + (item.size ?? item.file?.size ?? 0), 0);
  const stagedCount = files.filter(f => !f.status || f.status === 'staged').length;
  const effectiveStartLabel =
    startButtonLabel || `بدء التحليل الشامل (${stagedCount > 0 ? stagedCount : files.length})`;

  const renderStatusText = (item: FilePreviewItem) => {
    switch (item.status) {
      case 'uploading':
        return (
          <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 font-semibold">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>جاري الحفظ</span>
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
            <Clock className="h-3 w-3 shrink-0" />
            <span>قيد الانتظار</span>
          </span>
        );
      case 'analyzing':
        return (
          <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300 font-semibold tabular-nums">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>جاري التحليل {item.analysisProgress ? `${item.analysisProgress}%` : ''}</span>
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>
              تم التحليل{item.recordsCount !== undefined ? ` · ${item.recordsCount} سجل` : ''}
            </span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 font-semibold">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>تعذر التحليل</span>
          </span>
        );
      case 'staged':
      default:
        return (
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            جاهز للمعاينة والتحليل
          </span>
        );
    }
  };

  return (
    <div
      dir="rtl"
      className={`border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col ${className}`}
    >
      {/* Header Bar */}
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="font-black text-slate-800 dark:text-slate-100 truncate">
            {title}
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
            {files.length} ملف
          </span>
          <span className="text-slate-400 hidden sm:inline" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
            {formatFileSize(totalBytes)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onAddMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddMore}
              className="h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3 w-3" />
              <span>إضافة ملفات</span>
            </Button>
          )}
          {onClearAll && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              disabled={isAnalyzing}
              className="h-7 px-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg whitespace-nowrap shrink-0"
            >
              تفريغ الكل
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Selected Files Region */}
      <div
        className={`overflow-y-auto adaptive-scroll-region divide-y divide-slate-100 dark:divide-slate-800 ${maxHeightClass}`}
      >
        {files.map(item => {
          const fileName = item.name || item.file?.name || 'ملف بدون اسم';
          const fileSize = item.size ?? item.file?.size ?? 0;
          const mimeType = item.file?.type;
          const meta = detectFileFormatMeta(fileName, mimeType);
          const FormatIcon = meta.Icon;
          const isSelected = Boolean(selectedFileId && selectedFileId === item.id);

          return (
            <div
              key={item.id}
              onClick={onSelectFile ? () => onSelectFile(item.id) : undefined}
              className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                onSelectFile ? 'cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-800/40' : ''
              } ${isSelected ? 'bg-primary/5 dark:bg-primary/15' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Format Icon */}
                <div
                  className={`h-9 w-9 rounded-xl border flex flex-col items-center justify-center shrink-0 ${meta.iconWrapClass}`}
                  title={meta.label}
                >
                  <FormatIcon className="h-4 w-4" />
                </div>

                {/* File Name & Clean Single-Line Metadata */}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate"
                    title={fileName}
                  >
                    {fileName}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {meta.badge}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatFileSize(fileSize)}</span>
                    <span aria-hidden="true">·</span>
                    {renderStatusText(item)}
                    {item.suggestedModule && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          {item.suggestedModule}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Single File Delete Button — Always Accessible Before Analysis */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onRemoveFile(item.id);
                }}
                disabled={item.status === 'analyzing'}
                aria-label={`حذف ${fileName}`}
                title="حذف هذا الملف من القائمة"
                className="h-9 w-9 rounded-xl border border-transparent hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Pinned Action Bar for Starting Comprehensive Analysis */}
      {onStartAnalysis && (
        <div
          className={`px-3.5 py-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            variant === 'panel'
              ? 'bg-slate-50/90 dark:bg-slate-800/60'
              : 'bg-slate-50 dark:bg-slate-800/50'
          }`}
        >
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            يمكنك مراجعة الملفات أو حذف أي ملف غير مطلوب قبل بدء التحليل.
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onStartAnalysis}
            disabled={isAnalyzing || files.length === 0}
            className="rounded-xl h-8 px-4 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{effectiveStartLabel}</span>
          </Button>
        </div>
      )}
    </div>
  );
};

interface ImportButtonWithPreviewProps {
  category?: UnifiedImportCategory;
  sourceTitle?: string;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary';
  buttonClassName?: string;
  showCenterShortcut?: boolean;
  centerShortcutClassName?: string;
  accept?: string;
  previewContainerClassName?: string;
}

/**
 * Unified multi-file import button paired directly with an inline FilePreviewList dock.
 * Users select one or multiple files, preview icons/sizes & remove any single file before
 * launching comprehensive analysis inside the Unified Import Center.
 */
export const ImportButtonWithPreview: React.FC<ImportButtonWithPreviewProps> = ({
  category = 'traveler',
  sourceTitle,
  buttonLabel = 'استيراد ملفات (متعدد)',
  buttonVariant = 'default',
  buttonClassName = '',
  showCenterShortcut = true,
  centerShortcutClassName = '',
  accept = '.xlsx,.xls,.csv,.pdf,image/*',
  previewContainerClassName = 'w-full'
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stagedFiles, setStagedFiles] = useState<FilePreviewItem[]>([]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length === 0) return;

    const entries = createFilePreviewEntries(picked);
    setStagedFiles(prev => [...prev, ...entries]);
    e.target.value = '';
  };

  const handleRemoveSingle = (id: string) => {
    setStagedFiles(prev => prev.filter(item => item.id !== id));
  };

  const handleStartComprehensiveAnalysis = () => {
    if (stagedFiles.length === 0) return;
    const filesToAnalyze = stagedFiles.map(item => item.file);
    setStagedFiles([]);
    openUnifiedImport({
      category,
      files: filesToAnalyze,
      sourceTitle: sourceTitle || buttonLabel,
      autoStartAnalysis: true
    });
  };

  return (
    <div className="inline-flex flex-col items-stretch gap-2.5 max-w-full" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={buttonVariant}
          onClick={() => inputRef.current?.click()}
          className={`gap-2 font-bold whitespace-nowrap shrink-0 ${buttonClassName}`}
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>{buttonLabel}</span>
          {stagedFiles.length > 0 && (
            <span className="font-mono tabular-nums text-[11px] opacity-90">
              ({stagedFiles.length})
            </span>
          )}
        </Button>

        {showCenterShortcut && (
          <Button
            type="button"
            variant="outline"
            onClick={() => openUnifiedImport({ category, sourceTitle })}
            className={`gap-1.5 font-bold whitespace-nowrap shrink-0 ${centerShortcutClassName}`}
            title="فتح مركز الاستيراد الموحد (إفلات الملفات والمطابقة الشاملة)"
          >
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <span>المركز الموحد</span>
          </Button>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={handleFilesSelected}
        />
      </div>

      {stagedFiles.length > 0 && (
        <FilePreviewList
          files={stagedFiles}
          onRemoveFile={handleRemoveSingle}
          onClearAll={() => setStagedFiles([])}
          onAddMore={() => inputRef.current?.click()}
          onStartAnalysis={handleStartComprehensiveAnalysis}
          title="معاينة الملفات قبل التحليل الشامل"
          className={`w-full sm:min-w-[400px] max-w-xl ${previewContainerClassName}`}
          maxHeightClass="max-h-52"
        />
      )}
    </div>
  );
};
