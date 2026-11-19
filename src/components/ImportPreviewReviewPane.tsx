import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardEdit,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Wand2
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { InsightFileItem } from './InsightSuggestionView';
import { formatParsedDate, sanitizeExtractedArabicName, splitFullName } from '../lib/localDocumentParser';
import { cleanArabicText } from '../lib/storage';

interface ImportPreviewReviewPaneProps {
  selectedFile: InsightFileItem | null;
  onUpdateRecords: (
    fileId: string,
    updatedRecords: any[],
    extraUpdates?: Partial<InsightFileItem>
  ) => void;
  onCleanCustomPhrase: (fileId: string, customPhrase?: string) => void;
  onApproveAndSaveFile: (file: InsightFileItem) => void;
  onBackToInsights: () => void;
  isSaving?: boolean;
}

const SUSPICIOUS_NOISE_REGEX =
  /(?:في\s+الجدول|في\s+الكشف|في\s+البيان|مدرج\s+في|موضح\s+أدناه|مرفق\s+طيه|بيانات\s+الجدول)/i;

function isValidIsoDate(val?: string): boolean {
  if (!val) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

function recordNeedsAttention(rec: any): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const name = cleanArabicText(
    rec.fullName || [rec.firstName, rec.secondName, rec.thirdName, rec.lastName].filter(Boolean).join(' ')
  );
  if (!name || name.split(/\s+/).filter(Boolean).length < 2) {
    reasons.push('الاسم غير مكتمل');
  }
  if (SUSPICIOUS_NOISE_REGEX.test(name)) {
    reasons.push('يحتوي عبارة جدولية');
  }
  const dateStr = String(rec.exitDate || rec.receiveDate || '').trim();
  if (dateStr && !isValidIsoDate(dateStr)) {
    reasons.push('تنسيق التاريخ غير قياسي');
  }
  return { needsReview: reasons.length > 0, reasons };
}

export const ImportPreviewReviewPane: React.FC<ImportPreviewReviewPaneProps> = ({
  selectedFile,
  onUpdateRecords,
  onCleanCustomPhrase,
  onApproveAndSaveFile,
  onBackToInsights,
  isSaving = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'attention' | 'edited'>('all');
  const [customNoisePhrase, setCustomNoisePhrase] = useState('');
  const [editedIndices, setEditedIndices] = useState<Set<number>>(new Set());

  const records = selectedFile?.records || [];

  const stats = useMemo(() => {
    let attentionCount = 0;
    for (const r of records) {
      if (recordNeedsAttention(r).needsReview) attentionCount++;
    }
    return {
      total: records.length,
      attentionCount,
      editedCount: editedIndices.size
    };
  }, [records, editedIndices]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records
      .map((rec, originalIndex) => {
        const displayName = cleanArabicText(
          rec.fullName ||
            [rec.firstName, rec.secondName, rec.thirdName, rec.fourthName, rec.lastName]
              .filter(Boolean)
              .join(' ')
        );
        const attention = recordNeedsAttention(rec);
        const isEdited = editedIndices.has(originalIndex);
        return { rec, originalIndex, displayName, attention, isEdited };
      })
      .filter(({ rec, displayName, attention, isEdited }) => {
        if (filterMode === 'attention' && !attention.needsReview) return false;
        if (filterMode === 'edited' && !isEdited) return false;
        if (!q) return true;
        const idStr = String(rec.idNumber || rec.passportNumber || '').toLowerCase();
        const destStr = String(rec.destination || rec.country || '').toLowerCase();
        return (
          displayName.toLowerCase().includes(q) ||
          idStr.includes(q) ||
          destStr.includes(q)
        );
      });
  }, [records, searchQuery, filterMode, editedIndices]);

  if (!selectedFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/50" dir="rtl">
        <ClipboardEdit className="h-12 w-12 text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          اختر ملفاً من القائمة الجانبية لمعاينة ومراجعة السجلات المستخرجة وتعديلها يدوياً قبل الحفظ.
        </p>
      </div>
    );
  }

  const updateSingleRecord = (index: number, patch: Record<string, any>) => {
    const nextRecords = [...records];
    const current = { ...nextRecords[index], ...patch };

    if (patch.fullName !== undefined) {
      const cleanedFull = cleanArabicText(String(patch.fullName));
      const parts = splitFullName(cleanedFull);
      current.fullName = cleanedFull;
      current.firstName = parts.firstName || cleanedFull;
      current.secondName = parts.secondName;
      current.thirdName = parts.thirdName;
      current.fourthName = parts.fourthName;
      current.lastName = parts.lastName;
    }

    if (patch.exitDate !== undefined) {
      const val = String(patch.exitDate);
      current.exitDate = val;
      current.receiveDate = val;
    } else if (patch.receiveDate !== undefined) {
      const val = String(patch.receiveDate);
      current.receiveDate = val;
      current.exitDate = val;
    }

    nextRecords[index] = current;
    setEditedIndices(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    onUpdateRecords(selectedFile.id, nextRecords, { reviewed: true });
  };

  const handleDeleteRecord = (index: number) => {
    const nextRecords = records.filter((_, idx) => idx !== index);
    setEditedIndices(new Set());
    onUpdateRecords(selectedFile.id, nextRecords, { reviewed: true });
  };

  const handleAddBlankRecord = () => {
    const newRec = {
      serialNumber: String(records.length + 1),
      fullName: '',
      firstName: '',
      secondName: '',
      thirdName: '',
      lastName: '',
      idNumber: '',
      idType: 'جواز',
      country: 'اليمن',
      destination: '',
      exitDate: new Date().toISOString().split('T')[0],
      receiveDate: new Date().toISOString().split('T')[0],
      travelAllowed: 'نعم',
      status: 'مسموح'
    };
    const nextRecords = [newRec, ...records];
    setEditedIndices(new Set([0]));
    onUpdateRecords(selectedFile.id, nextRecords, { reviewed: true });
  };

  const handleAutoNormalizeDate = (index: number, rawDate: string) => {
    const normalized = formatParsedDate(rawDate);
    if (normalized) {
      updateSingleRecord(index, { exitDate: normalized, receiveDate: normalized });
    }
  };

  const handleQuickStripNameNoise = (index: number, rawName: string) => {
    const cleaned = sanitizeExtractedArabicName(rawName) || cleanArabicText(rawName);
    updateSingleRecord(index, { fullName: cleaned });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 overflow-hidden" dir="rtl">
      {/* Top Toolbar: Review Header & NLP Cleaner Bar */}
      <div className="p-3.5 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <ClipboardEdit className="h-4 w-4" />
              </div>
              <h4 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 truncate">
                مرحلة المعاينة والمراجعة اليدوية: {selectedFile.name}
              </h4>
              <Badge variant="outline" className="text-[10px] font-bold bg-white dark:bg-slate-800">
                {stats.total} سجل
              </Badge>
              {stats.attentionCount > 0 ? (
                <Badge className="bg-amber-500 text-white border-none text-[10px] font-bold">
                  {stats.attentionCount} بحاجة لمراجعة
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 text-white border-none text-[10px] font-bold">
                  السجلات نظيفة ومكتملة
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              عدّل أي اسم أو رقم وثيقة أو تاريخ يدوياً قبل الحفظ النهائي؛ كما يمكنك إزالة أي كلمة متكررة شائبة عبر فلتر NLP بالأسفل.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddBlankRecord}
              className="rounded-xl text-xs font-bold gap-1 h-8 border-slate-300"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>إضافة سجل</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onCleanCustomPhrase(selectedFile.id)}
              className="rounded-xl text-xs font-bold gap-1 h-8 border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
            >
              <Wand2 className="h-3.5 w-3.5 text-indigo-600" />
              <span>إعادة تنقية NLP/Regex</span>
            </Button>
          </div>
        </div>

        {/* NLP Sanitization Summary + Custom Noise Word Remover */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث في السجلات بالاسم أو رقم الجواز أو الوجهة..."
              className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-primary"
            />
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 text-[11px] font-bold shrink-0">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                filterMode === 'all' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('attention')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                filterMode === 'attention' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              مراجعة ({stats.attentionCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('edited')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                filterMode === 'edited' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              معدّلة ({stats.editedCount})
            </button>
          </div>

          {/* Custom word/phrase cleaner input */}
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={customNoisePhrase}
              onChange={e => setCustomNoisePhrase(e.target.value)}
              placeholder="احذف عبارة متكررة (مثلاً: في الجدول)"
              className="w-44 sm:w-48 px-2.5 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-indigo-500"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!customNoisePhrase.trim()}
              onClick={() => {
                onCleanCustomPhrase(selectedFile.id, customNoisePhrase.trim());
                setCustomNoisePhrase('');
              }}
              className="h-8 px-2.5 text-[11px] font-bold rounded-lg gap-1"
            >
              <Sparkles className="h-3 w-3 text-indigo-600" />
              <span>حذف من الكل</span>
            </Button>
          </div>
        </div>

        {selectedFile.sanitizationSummary && selectedFile.sanitizationSummary.removedPhrases.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-indigo-800 dark:text-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/30 px-3 py-1.5 rounded-xl border border-indigo-200/70">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <span className="font-bold">عبارات تمت إزالتها تلقائياً قبل العرض ({selectedFile.sanitizationSummary.cleanedRecordsCount} سجل):</span>
            {selectedFile.sanitizationSummary.removedPhrases.map((phrase, idx) => (
              <Badge key={idx} variant="outline" className="bg-white dark:bg-slate-900 border-indigo-200 text-indigo-700 text-[10px] font-bold">
                {phrase}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Main Editable Review List / Table */}
      <div className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-3 sm:p-5">
        {filteredEntries.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold">
            لا توجد سجلات مطابقة لمعايير البحث أو التصفية الحالية.
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {filteredEntries.map(({ rec, originalIndex, displayName, attention, isEdited }) => {
                const dateVal = String(rec.exitDate || rec.receiveDate || '');
                return (
                  <div
                    key={originalIndex}
                    className={`p-3.5 rounded-2xl border space-y-2.5 ${
                      attention.needsReview
                        ? 'bg-amber-50/60 border-amber-300 dark:bg-amber-950/20'
                        : isEdited
                        ? 'bg-emerald-50/40 border-emerald-300 dark:bg-emerald-950/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-bold">
                          #{originalIndex + 1}
                        </span>
                        {attention.needsReview && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                            <AlertTriangle className="h-3 w-3" />
                            {attention.reasons[0]}
                          </span>
                        )}
                        {isEdited && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            <UserCheck className="h-3 w-3" />
                            معدّل
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(originalIndex)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                        title="حذف هذا السجل"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500">الاسم الكامل</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={displayName}
                          onChange={e => updateSingleRecord(originalIndex, { fullName: e.target.value })}
                          placeholder="أدخل الاسم الكامل..."
                          className="flex-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuickStripNameNoise(originalIndex, displayName)}
                          className="px-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-bold"
                          title="تنقية الاسم لغوياً"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">رقم الجواز / الهوية</label>
                        <input
                          type="text"
                          value={String(rec.idNumber || '')}
                          onChange={e => updateSingleRecord(originalIndex, { idNumber: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">التاريخ (YYYY-MM-DD)</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={dateVal}
                            placeholder="YYYY-MM-DD"
                            onChange={e => updateSingleRecord(originalIndex, { exitDate: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-primary"
                          />
                          <input
                            type="date"
                            value={isValidIsoDate(dateVal) ? dateVal : ''}
                            onChange={e => updateSingleRecord(originalIndex, { exitDate: e.target.value })}
                            className="w-8 px-1 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
                            title="اختيار من التقويم"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">الجنسية</label>
                        <input
                          type="text"
                          value={String(rec.country || rec.nationality || '')}
                          onChange={e => updateSingleRecord(originalIndex, { country: e.target.value, nationality: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">الوجهة / الملاحظة</label>
                        <input
                          type="text"
                          value={String(rec.destination || '')}
                          onChange={e => updateSingleRecord(originalIndex, { destination: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Editable Table */}
            <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5 min-w-[230px]">الاسم الكامل (قابل للتعديل)</th>
                      <th className="p-2.5 w-36">رقم الوثيقة</th>
                      <th className="p-2.5 w-44">تاريخ الخروج / الاستلام</th>
                      <th className="p-2.5 w-36">تاريخ الميلاد</th>
                      <th className="p-2.5 w-28">الجنسية</th>
                      <th className="p-2.5 w-36">الوجهة</th>
                      <th className="p-2.5 w-24 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEntries.map(({ rec, originalIndex, displayName, attention, isEdited }) => {
                      const dateVal = String(rec.exitDate || rec.receiveDate || '');
                      const birthVal = String(rec.birthDate || '');
                      return (
                        <tr
                          key={originalIndex}
                          className={`transition-colors ${
                            attention.needsReview
                              ? 'bg-amber-50/50 dark:bg-amber-950/15'
                              : isEdited
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/15'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-2 text-center font-mono text-[11px] text-slate-500">
                            <div className="flex flex-col items-center gap-0.5">
                              <span>{rec.serialNumber || originalIndex + 1}</span>
                              {attention.needsReview && (
                                <span title={attention.reasons.join(' • ')}>
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                </span>
                              )}
                              {isEdited && !attention.needsReview && (
                                <span title="تم تعديل السجل يدوياً">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={displayName}
                                onChange={e => updateSingleRecord(originalIndex, { fullName: e.target.value })}
                                placeholder="أدخل الاسم الكامل..."
                                className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border outline-none transition-colors ${
                                  attention.needsReview
                                    ? 'border-amber-300 bg-white focus:border-amber-500'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleQuickStripNameNoise(originalIndex, displayName)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-600 shrink-0"
                                title="تنظيف تلقائي للاسم (NLP)"
                              >
                                <Wand2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={String(rec.idNumber || '')}
                              onChange={e => updateSingleRecord(originalIndex, { idNumber: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                dir="ltr"
                                value={dateVal}
                                placeholder="YYYY-MM-DD"
                                onChange={e => updateSingleRecord(originalIndex, { exitDate: e.target.value })}
                                className={`w-full px-2 py-1.5 text-[11px] font-mono rounded-lg border outline-none ${
                                  dateVal && !isValidIsoDate(dateVal)
                                    ? 'border-amber-300 bg-amber-50/40 focus:border-amber-500'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary'
                                }`}
                              />
                              <input
                                type="date"
                                value={isValidIsoDate(dateVal) ? dateVal : ''}
                                onChange={e => updateSingleRecord(originalIndex, { exitDate: e.target.value })}
                                className="w-7 px-0.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
                                title="اختيار التاريخ من التقويم"
                              />
                              {dateVal && !isValidIsoDate(dateVal) && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoNormalizeDate(originalIndex, dateVal)}
                                  className="px-1.5 py-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0"
                                  title={`تنسيق تلقائي للتاريخ: ${dateVal}`}
                                >
                                  <Calendar className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                dir="ltr"
                                value={birthVal}
                                placeholder="YYYY-MM-DD"
                                onChange={e => updateSingleRecord(originalIndex, { birthDate: e.target.value })}
                                className="w-full px-2 py-1.5 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-primary"
                              />
                              <input
                                type="date"
                                value={isValidIsoDate(birthVal) ? birthVal : ''}
                                onChange={e => updateSingleRecord(originalIndex, { birthDate: e.target.value })}
                                className="w-7 px-0.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
                                title="اختيار تاريخ الميلاد"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={String(rec.country || rec.nationality || '')}
                              onChange={e => updateSingleRecord(originalIndex, { country: e.target.value, nationality: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={String(rec.destination || '')}
                              onChange={e => updateSingleRecord(originalIndex, { destination: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(originalIndex)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="حذف السجل من الاستيراد"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Review Stage Pinned Footer */}
      <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="truncate">
            تُحفظ التعديلات الفردية مباشرة في الذاكرة المؤقتة ولن يتم ترحيل البيانات إلا بعد الاعتماد.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToInsights}
            className="rounded-xl font-bold text-xs h-9"
          >
            العودة للملخص
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSaving || records.length === 0}
            onClick={() => onApproveAndSaveFile(selectedFile)}
            className="rounded-xl font-black text-xs h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
          >
            <span>اعتماد وحفظ ({records.length} سجل)</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
