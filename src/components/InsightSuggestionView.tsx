import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FileSpreadsheet,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  BrainCircuit,
  User,
  CreditCard,
  Globe,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Database,
  ArrowLeftRight,
  Layers,
  ChevronRight,
  Check,
  Zap,
  Info,
  Languages,
  BookOpenCheck,
  GraduationCap,
  Trash2,
  ClipboardEdit
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { brain, DocumentInsightSummary, CustomReaderInstruction } from '../lib/LearningBrainService';
import { localMatchColumn } from '../lib/dynamicColumnMapper';
import { SecurityScanResult } from '../lib/securityThreatScanner';

import { UnifiedImportCategory } from '../lib/unifiedImportHub';
import { MofaVisaRequest } from '../lib/types';

export interface ExtractedEntities {
  serialNumber?: string;
  fullName?: string;
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  lastName?: string;
  idNumber?: string;
  idType?: string;
  nationality?: string;
  birthDate?: string;
  profession?: string;
  phone?: string;
  agency?: string;
  center?: string;
  destination?: string;
  visaType?: string;
  receiveDate?: string;
  exitDate?: string;
  travelAllowed?: string;
  status?: string;
  returnReason?: string;
  vettingResult?: string;
  additionalInfo?: string;
  [key: string]: any;
}

export interface InsightFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'excel' | 'pdf' | 'image' | 'other';
  status: 'staged' | 'uploading' | 'pending' | 'analyzing' | 'ready' | 'error';
  uploadProgress: number;
  analysisProgress: number;
  error?: string;
  recordsCount?: number;
  columns?: string[];
  records?: any[];
  samples?: any[];
  keyEntities?: ExtractedEntities;
  category?: UnifiedImportCategory;
  suggestedModule?: string;
  confidence?: number;
  reason?: string;
  securityScan?: SecurityScanResult;
  analysisInsight?: DocumentInsightSummary;
  mofaRequest?: MofaVisaRequest;
  seizureMeta?: any;
  sanitizationSummary?: {
    cleanedRecordsCount: number;
    removedPhrases: string[];
  };
  reviewed?: boolean;
}

interface InsightSuggestionViewProps {
  selectedFile: InsightFileItem | null;
  onUpdateCategory: (fileId: string, category: string, moduleName: string) => void;
  onOpenSmartMapping: (file: InsightFileItem) => void;
  onOpenReviewStage?: (file: InsightFileItem) => void;
  onInstantImport: (file: InsightFileItem) => void;
  onReanalyze?: (file: InsightFileItem) => void;
  onStartStagedAnalysis?: () => void;
  onTeachInstruction?: (instructionText: string, keywords: string, targetCategory: string) => void;
  customInstructions?: CustomReaderInstruction[];
  onDeleteInstruction?: (instructionId: string) => void;
}

const AVAILABLE_MODULES = [
  { id: 'traveler', label: 'المسافرين', description: 'سجلات العبور والتأشيرات العامة والمنافذ', icon: User, color: 'emerald' },
  { id: 'foreigner', label: 'الوافدون الأجانب', description: 'سجل الإقامات والأجانب وتجديدها', icon: Building2, color: 'teal' },
  { id: 'visa', label: 'مذكرات وتأشيرات الخارجية', description: 'تأشيرات المنظمات والمذكرات الدبلوماسية', icon: Building2, color: 'blue' },
  { id: 'seizure', label: 'المضبوطات والجوازات', description: 'الجوازات المحتجزة ومحاضر الضبط', icon: Layers, color: 'amber' },
  { id: 'refugee', label: 'شؤون اللاجئين', description: 'ملفات المفوضية وتصاريح اللجوء', icon: Globe, color: 'cyan' },
  { id: 'migrant', label: 'المهاجرين غير النظاميين', description: 'حصر المهاجرين ومراكز الإيواء والترحيل', icon: Globe, color: 'purple' },
  { id: 'permit', label: 'تصاريح التنقل', description: 'تصاريح البعثات والمنظمات الداخلية', icon: FileText, color: 'indigo' },
  { id: 'report', label: 'بلاغات الضبط', description: 'بلاغات التحري والتعميم والمطلوبين', icon: ShieldAlert, color: 'rose' },
];

export const InsightSuggestionView: React.FC<InsightSuggestionViewProps> = ({
  selectedFile,
  onUpdateCategory,
  onOpenSmartMapping,
  onOpenReviewStage,
  onInstantImport,
  onReanalyze,
  onStartStagedAnalysis,
  onTeachInstruction,
  customInstructions = [],
  onDeleteInstruction
}) => {
  const [summaryLang, setSummaryLang] = React.useState<'ar' | 'en'>('ar');
  const [showTrainer, setShowTrainer] = React.useState(false);
  const [ruleInstruction, setRuleInstruction] = React.useState('');
  const [ruleKeywords, setRuleKeywords] = React.useState('');
  const [ruleCategory, setRuleCategory] = React.useState<string>('traveler');
  // If no file is selected
  if (!selectedFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/50 h-full select-none" dir="rtl">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl animate-pulse" />
          <div className="h-28 w-28 rounded-3xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-xl flex items-center justify-center relative">
            <BrainCircuit className="h-14 w-14 text-primary/70" />
          </div>
          <div className="absolute -bottom-2 -left-2 bg-amber-400 text-primary-foreground p-2 rounded-xl shadow-md">
            <Sparkles className="h-5 w-5 text-slate-900" />
          </div>
        </div>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">
          لوحة استعراض الاقتراحات والبيانات المستخرجة
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-6">
          اختر أي ملف تم تحميله من القائمة الجانبية لعرض تحليله الذكي فوراً، والاطلاع على الأسماء وأرقام الجوازات والوجهة المقترحة من قبل الدماغ المحلي.
        </p>
        <div className="flex items-center gap-3 text-xs text-slate-400 bg-white dark:bg-slate-800 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>يبدأ التحليل تلقائياً بمجرد اكتمال حفظ كل ملف ورفعه.</span>
        </div>
      </div>
    );
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const entities = selectedFile.keyEntities || {};
  const currentCategory = selectedFile.category || 'traveler';
  const currentModuleName = selectedFile.suggestedModule || 'المسافرين';
  const records = selectedFile.records || [];
  const columns = selectedFile.columns || [];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 overflow-hidden" dir="rtl">
      {/* 1. Header Bar for Selected File */}
      <div className="p-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl shrink-0 shadow-xs border ${
            selectedFile.type === 'excel'
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40'
              : selectedFile.type === 'pdf'
              ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40'
              : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40'
          }`}>
            {selectedFile.type === 'excel' ? <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6" /> :
             selectedFile.type === 'pdf' ? <FileText className="h-5 w-5 sm:h-6 sm:w-6" /> :
             <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-lg font-black text-slate-800 dark:text-slate-100 truncate" title={selectedFile.name}>
                {selectedFile.name}
              </h3>
              {selectedFile.status === 'ready' && (
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 shrink-0" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] font-bold text-slate-500 border-slate-200 bg-white dark:bg-slate-800">
                الحجم: {formatSize(selectedFile.size)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-bold text-slate-500 border-slate-200 bg-white dark:bg-slate-800">
                الصيغة: {selectedFile.type.toUpperCase()}
              </Badge>
              {selectedFile.recordsCount !== undefined && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                  {selectedFile.recordsCount} سجل مكتشف
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {selectedFile.status === 'ready' && (
            <>
              {onOpenReviewStage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenReviewStage(selectedFile)}
                  className="flex-1 sm:flex-initial rounded-xl text-xs font-bold gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 h-8"
                >
                  <ClipboardEdit className="h-3.5 w-3.5 text-amber-700" />
                  <span>معاينة ومراجعة ({selectedFile.recordsCount || 0})</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenSmartMapping(selectedFile)}
                className="flex-1 sm:flex-initial rounded-xl text-xs font-bold gap-1.5 border-slate-200 hover:bg-slate-100 h-8"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                <span>مطابقة الأعمدة</span>
              </Button>
              <Button
                size="sm"
                onClick={() => onInstantImport(selectedFile)}
                className="flex-1 sm:flex-initial rounded-xl text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 h-8"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>استيراد فوري للملف</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-3.5 sm:p-6 space-y-5">
        {/* Staged Pre-Analysis Banner */}
        {selectedFile.status === 'staged' && (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                الملف جاهز في قائمة المعاينة قبل التحليل
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                يمكنك مراجعة الملفات المختارة أو حذف أي ملف غير مرغوب من القائمة ثم الضغط على بدء التحليل الشامل لاستخراج السجلات وتوجيهها.
              </p>
            </div>
            {onStartStagedAnalysis && (
              <Button
                type="button"
                size="sm"
                onClick={onStartStagedAnalysis}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 h-9 gap-1.5 whitespace-nowrap shrink-0"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>بدء التحليل الشامل الآن</span>
              </Button>
            )}
          </div>
        )}

        {/* Analyzing / Uploading Banner */}
        {selectedFile.status === 'analyzing' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-gradient-to-r from-primary/10 via-indigo-50/50 to-primary/5 border border-primary/20 dark:from-primary/20 dark:to-slate-900"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-bold text-sm text-primary">جاري فحص واستخراج البيانات بواسطة الذكاء الاصطناعي...</span>
              </div>
              <span className="text-xs font-black text-primary font-mono">{selectedFile.analysisProgress}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${selectedFile.analysisProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              يقوم "الدماغ المحلي" الآن بقراءة الحقول واستخراج الكيانات تلقائياً لتقديم الاقتراحات المناسبة فوراً.
            </p>
          </motion.div>
        )}

        {selectedFile.status === 'error' && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>فشل التحليل: {selectedFile.error || 'تعذر استخراج البيانات من هذا الملف'}</span>
            </div>
            {onReanalyze && (
              <Button size="sm" variant="outline" onClick={() => onReanalyze(selectedFile)} className="rounded-xl text-xs">
                إعادة المحاولة
              </Button>
            )}
          </div>
        )}

        {/* NLP / Regex Sanitization Notice for PDF & Extracted Texts */}
        {selectedFile.status === 'ready' && (selectedFile.sanitizationSummary || selectedFile.type === 'pdf') && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-black text-indigo-950 dark:text-indigo-100">
                  تنقية النصوص اللغوية (NLP & Regex) قبل العرض
                </span>
                {selectedFile.reviewed && (
                  <Badge className="bg-emerald-600 text-white border-none text-[10px]">
                    تمت المراجعة اليدوية
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-indigo-800/90 dark:text-indigo-200/90 leading-relaxed">
                {selectedFile.sanitizationSummary && selectedFile.sanitizationSummary.cleanedRecordsCount > 0
                  ? `تم تنظيف ${selectedFile.sanitizationSummary.cleanedRecordsCount} سجل تلقائياً وإزالة الكلمات غير الاسمية المتكررة (${selectedFile.sanitizationSummary.removedPhrases.join('، ')}).`
                  : 'تم تطبيق فلترة النصوص والتواريخ تلقائياً. يمكنك مراجعة وتعديل الأسماء والتواريخ يدوياً قبل الحفظ النهائي.'}
              </p>
            </div>
            {onOpenReviewStage && (
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenReviewStage(selectedFile)}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 h-8 gap-1.5 shrink-0"
              >
                <ClipboardEdit className="h-3.5 w-3.5" />
                <span>تعديل ومراجعة السجلات</span>
              </Button>
            )}
          </div>
        )}

        {/* Automatic Security Scan & Forgery Detection Pre-Check */}
        {selectedFile.securityScan && (
          <section className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            selectedFile.securityScan.status === 'threat_detected'
              ? 'bg-rose-50/80 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
              : selectedFile.securityScan.status === 'warning'
              ? 'bg-amber-50/80 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
              : 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  selectedFile.securityScan.status === 'threat_detected'
                    ? 'bg-rose-600 text-white shadow-md'
                    : selectedFile.securityScan.status === 'warning'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-emerald-600 text-white shadow-md'
                }`}>
                  {selectedFile.securityScan.status === 'clean' ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                      نتيجة المسح الأمني التلقائي وكشف التزوير
                    </h4>
                    <Badge className={`text-[10px] font-bold ${
                      selectedFile.securityScan.status === 'threat_detected'
                        ? 'bg-rose-600 text-white'
                        : selectedFile.securityScan.status === 'warning'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}>
                      درجة الأمان: {selectedFile.securityScan.score}%
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {selectedFile.securityScan.summary}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="bg-white/80 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  فحص القوائم: ✓
                </span>
                <span className="bg-white/80 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  كشف التزوير: ✓
                </span>
              </div>
            </div>

            {/* If threats or warnings exist, render threat cards */}
            {selectedFile.securityScan.threats.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                {selectedFile.securityScan.threats.map((threat) => (
                  <div
                    key={threat.id}
                    className="p-3 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-xs shadow-2xs"
                  >
                    <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
                      threat.severity === 'critical' ? 'text-rose-600' : 'text-amber-500'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{threat.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          threat.severity === 'critical' ? 'border-rose-400 text-rose-700' : 'border-amber-400 text-amber-700'
                        }`}>
                          {threat.severity === 'critical' ? 'حرج أمنياً' : 'اشتباه للمراجعة'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{threat.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* AI Suggestions & Target Department Card */}
        <section className="bg-gradient-to-br from-amber-50/60 via-white to-indigo-50/40 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-800 p-4 sm:p-5 rounded-2xl border border-amber-200/80 dark:border-slate-700 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-400 text-slate-900 rounded-2xl shadow-sm shrink-0">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                    تصنيف وتوجيه القارئ الذكي المحلي
                  </h4>
                  <Badge className="bg-emerald-600 text-white border-none text-[10px] px-2.5 py-0.5 font-mono tabular-nums">
                    ثقة {selectedFile.confidence || 95}%
                  </Badge>
                  {selectedFile.analysisInsight?.learnedFromMemory && (
                    <Badge className="bg-indigo-600 text-white border-none text-[10px] px-2 py-0.5">
                      مكتسب من الذاكرة
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {selectedFile.reason || `تم التعرف على بنية هذا المستند وتصنيفه تلقائياً كملف يخص ${currentModuleName}.`}
                </p>
              </div>
            </div>

            {/* Quick Destination Switcher */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700 w-full md:w-auto max-w-full shrink-0">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  توجيه القسم (يحفظ اختيارك في الذاكرة):
                </label>
                {onTeachInstruction && (
                  <button
                    type="button"
                    onClick={() => {
                      setRuleCategory(currentCategory);
                      setShowTrainer(v => !v);
                    }}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    <GraduationCap className="h-3 w-3" />
                    <span>تعليم القارئ قاعدة</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                {AVAILABLE_MODULES.map(mod => {
                  const isCurrent = currentCategory === mod.id;
                  const Icon = mod.icon;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => onUpdateCategory(selectedFile.id, mod.id, mod.label)}
                      className={`flex items-center justify-center sm:justify-start gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all min-w-0 ${
                        isCurrent
                          ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{mod.label}</span>
                      {isCurrent && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Interactive Reader Teaching Form */}
          {showTrainer && onTeachInstruction && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-primary/25 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  تعليم القارئ المحلي قاعدة توجيه وفهم جديدة
                </span>
                <span className="text-[10px] text-slate-400">تُحفظ محلياً وتُطبق تلقائياً على الملفات القادمة</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={ruleInstruction}
                  onChange={e => setRuleInstruction(e.target.value)}
                  placeholder="وصف القاعدة (مثال: كشوفات العمال الأجانب)"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={ruleKeywords}
                  onChange={e => setRuleKeywords(e.target.value)}
                  placeholder="كلمات دلالية مفصولة بفاصلة (إقامة، كفيل، مهنة)"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <select
                    value={ruleCategory}
                    onChange={e => setRuleCategory(e.target.value)}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
                  >
                    {AVAILABLE_MODULES.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (!ruleInstruction.trim()) return;
                      onTeachInstruction(ruleInstruction.trim(), ruleKeywords.trim() || ruleInstruction.trim(), ruleCategory);
                      setRuleInstruction('');
                      setRuleKeywords('');
                      setShowTrainer(false);
                    }}
                    className="rounded-lg font-bold text-xs px-3 h-9 bg-primary text-white"
                  >
                    حفظ القاعدة
                  </Button>
                </div>
              </div>
              {customInstructions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                  {customInstructions.slice(0, 6).map(inst => (
                    <div key={inst.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                      <span>{inst.instructionText}</span>
                      {onDeleteInstruction && (
                        <button
                          type="button"
                          onClick={() => onDeleteInstruction(inst.id)}
                          className="text-rose-600 hover:text-rose-700"
                          title="حذف القاعدة"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Executive Summary & Bilingual Translation Panel */}
          {selectedFile.analysisInsight && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
              {/* Executive Summary */}
              <div className="p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <BookOpenCheck className="h-4 w-4 text-primary" />
                    <span>الملخص التنفيذي والفهم الآلي للوثيقة</span>
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setSummaryLang('ar')}
                      className={`px-2 py-0.5 ${summaryLang === 'ar' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
                    >
                      العربية
                    </button>
                    <button
                      type="button"
                      onClick={() => setSummaryLang('en')}
                      className={`px-2 py-0.5 ${summaryLang === 'en' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
                    >
                      English
                    </button>
                  </div>
                </div>
                <p
                  dir={summaryLang === 'en' ? 'ltr' : 'rtl'}
                  className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium"
                >
                  {summaryLang === 'ar'
                    ? selectedFile.analysisInsight.executiveSummary
                    : selectedFile.analysisInsight.translatedSummaryEn}
                </p>
                {selectedFile.analysisInsight.keyHighlights.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {selectedFile.analysisInsight.keyHighlights.map((hl, i) => (
                      <div key={i} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{hl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Offline Translation & Secondary Routing Suggestions */}
              <div className="p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Languages className="h-4 w-4 text-indigo-600" />
                    <span>الترجمة الميدانية والربط التلقائي للوجهات</span>
                  </span>
                </div>

                {selectedFile.analysisInsight.secondaryDestinations.length > 0 && (
                  <div className="space-y-1.5">
                    {selectedFile.analysisInsight.secondaryDestinations.map((dest, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 text-[11px]">
                        <div className="font-bold text-indigo-900 dark:text-indigo-200">{dest.label}</div>
                        <div className="text-indigo-700/90 dark:text-indigo-300/90 text-[10px] mt-0.5">{dest.reason}</div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedFile.analysisInsight.translatedSamplePairs.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {selectedFile.analysisInsight.translatedSamplePairs.slice(0, 4).map((pair, idx) => (
                      <div key={idx} className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/70 text-[11px] flex items-center justify-between gap-2">
                        <span className="text-slate-500 truncate">{pair.fieldLabel}:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                          {pair.translatedAr !== pair.original
                            ? `${pair.translatedAr} (${pair.original})`
                            : pair.translatedAr}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Key Extracted Entities Showcase (Names, Passports, Nationalities, etc.) */}
        <section>
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                البيانات الرئيسية المستخرجة (عينة ممثلة)
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">مستخرجة مباشرة من محتوى الملف</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Name */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <User className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider">الاسم المستخرج</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate" title={entities.fullName || entities.firstName || '-'}>
                {entities.fullName || [entities.firstName, entities.secondName, entities.lastName].filter(Boolean).join(' ') || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">غير محدد</span>
                )}
              </p>
            </div>

            {/* 2. Passport / ID */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">رقم الجواز / الهوية</span>
              </div>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono truncate" title={entities.idNumber || '-'}>
                {entities.idNumber || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">غير محدد</span>
                )}
              </p>
            </div>

            {/* 3. Nationality / Center */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Globe className="h-4 w-4 text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">الجنسية والمركز</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {entities.center
                  ? `${entities.nationality || entities.country || 'اليمن'} — ${entities.center}`
                  : (entities.nationality || entities.country || 'اليمن')}
              </p>
            </div>

            {/* 4. Phone / Mobile */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Phone className="h-4 w-4 text-purple-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">رقم الهاتف / التسلسل</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono tabular-nums truncate">
                {entities.phone || (entities.serialNumber ? `م #${entities.serialNumber}` : null) || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">غير متوفر</span>
                )}
              </p>
            </div>

            {/* 5. Exit Date / Travel Date */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Calendar className="h-4 w-4 text-amber-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">ت. الخروج / السفر</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate font-mono tabular-nums">
                {entities.exitDate || entities.receiveDate || entities.birthDate || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">تلقائي</span>
                )}
              </p>
            </div>

            {/* 6. Travel Agency / Employer / Organization */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Building2 className="h-4 w-4 text-indigo-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">إسم الوكالة / الجهة</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate" title={entities.agency || entities.center || '-'}>
                {entities.agency || entities.center || entities.organization || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">المنفذ المركزي</span>
                )}
              </p>
            </div>

            {/* 7. Visa Type / Profession */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Briefcase className="h-4 w-4 text-teal-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">التأشيرة / المهنة</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {entities.visaType || entities.profession || entities.destination || (
                  <span className="text-slate-300 dark:text-slate-600 font-normal italic">عادي</span>
                )}
              </p>
            </div>

            {/* 8. Visa Status / Return Reason / Vetting */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">الحالة / سبب الإرتجاع</span>
              </div>
              <p className={`text-sm font-black truncate ${
                entities.status === 'مرتجع'
                  ? 'text-amber-600 dark:text-amber-400'
                  : entities.travelAllowed === 'لا'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {entities.status
                  ? `${entities.status}${entities.returnReason ? ` — ${entities.returnReason}` : ''}`
                  : entities.travelAllowed === 'لا'
                  ? 'ممنوع من السفر'
                  : 'مسموح بالعبور'}
              </p>
            </div>
          </div>
        </section>

        {/* Tabular Records Preview (First records) */}
        {records.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  جدول عينات السجلات المستخرجة ({records.length} سجل)
                </h4>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                عرض أول {Math.min(8, records.length)} سجلات
              </Badge>
            </div>

            {/* Mobile Adaptive Vertical Cards */}
            <div className="md:hidden border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <div className="max-h-64 overflow-y-auto adaptive-scroll-region divide-y divide-slate-100 dark:divide-slate-700/60">
                {records.slice(0, 8).map((rec, idx) => {
                  const recName = rec.fullName || [rec.firstName, rec.secondName, rec.thirdName, rec.lastName].filter(Boolean).join(' ') || `سجل ${idx + 1}`;
                  const recId = rec.idNumber || rec.passportNumber || '-';
                  const recCenter = rec.center || rec.country || rec.nationality || '-';
                  const recAgency = rec.agency || '-';
                  const recVisa = rec.visaType || rec.visitReason || '-';
                  const recExit = rec.exitDate || rec.receiveDate || '-';
                  const recStatus = rec.status || (rec.travelAllowed === 'لا' ? 'ممنوع' : 'مسموح');
                  const isReturned = recStatus === 'مرتجع';
                  const isBlocked = recStatus === 'ممنوع' || rec.travelAllowed === 'لا';

                  return (
                    <div key={idx} className="p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {rec.serialNumber || idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{recName}</span>
                        </div>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          isBlocked
                            ? 'bg-rose-100 text-rose-700'
                            : isReturned
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {recStatus}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-900/40 p-2 rounded-xl">
                        <div className="truncate">الجواز: <strong className="font-mono tabular-nums text-emerald-700">{recId}</strong></div>
                        <div className="truncate">التأشيرة: <strong>{recVisa}</strong></div>
                        <div className="truncate">الوكالة: <strong>{recAgency}</strong></div>
                        <div className="truncate">المركز / ت.الخروج: <span className="font-mono tabular-nums">{recCenter} • {recExit}</span></div>
                      </div>
                      {rec.returnReason && (
                        <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/70 rounded-lg px-2 py-1">
                          سبب الإرتجاع: {rec.returnReason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Bounded Sticky Table */}
            <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <div className="overflow-auto max-h-60 adaptive-scroll-region">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/95 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-12 text-center">م</th>
                      <th className="p-3">الإسم</th>
                      <th className="p-3">رقم الجواز</th>
                      <th className="p-3">المركز</th>
                      <th className="p-3">إسم الوكالة</th>
                      <th className="p-3">التأشيرة</th>
                      <th className="p-3">ت. الخروج</th>
                      <th className="p-3">الحالة / الإرتجاع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                    {records.slice(0, 8).map((rec, idx) => {
                      const recName = rec.fullName || [rec.firstName, rec.secondName, rec.thirdName, rec.lastName].filter(Boolean).join(' ') || `سجل ${idx + 1}`;
                      const recId = rec.idNumber || rec.passportNumber || '-';
                      const recCenter = rec.center || rec.country || rec.nationality || '-';
                      const recAgency = rec.agency || '-';
                      const recVisa = rec.visaType || rec.visitReason || '-';
                      const recExit = rec.exitDate || rec.receiveDate || '-';
                      const recStatus = rec.status || (rec.travelAllowed === 'لا' ? 'ممنوع' : 'مسموح');
                      const isReturned = recStatus === 'مرتجع';
                      const isBlocked = recStatus === 'ممنوع' || rec.travelAllowed === 'لا';

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="p-3 text-center text-slate-400 font-mono tabular-nums text-[10px]">{rec.serialNumber || idx + 1}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">{recName}</td>
                          <td className="p-3 font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{recId}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{recCenter}</td>
                          <td className="p-3 text-slate-700 dark:text-slate-200 font-semibold truncate max-w-[130px]">{recAgency}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{recVisa}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300 font-mono tabular-nums">{recExit}</td>
                          <td className="p-3">
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isBlocked
                                  ? 'bg-rose-100 text-rose-700'
                                  : isReturned
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {recStatus}
                              </span>
                              {rec.returnReason && (
                                <span className="text-[10px] text-amber-700 dark:text-amber-400 truncate max-w-[150px]" title={rec.returnReason}>
                                  {rec.returnReason}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Suggested Column Mappings Overview */}
        {columns.length > 0 && (
          <section className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2.5">
              <h5 className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                مطابقة الأعمدة التلقائية المحفوظة في الدماغ المحلي:
              </h5>
              <span className="text-[10px] text-slate-400">تم التعرف على {columns.length} عمود</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {columns.slice(0, 12).map((col) => {
                const predicted = brain.predictField(col) || localMatchColumn(col).target;
                return (
                  <div
                    key={col}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs shadow-2xs"
                  >
                    <span className="font-bold text-slate-700 dark:text-slate-200">{col}</span>
                    <ChevronRight className="h-3 w-3 text-slate-400" />
                    <span className="text-primary font-mono text-[11px] font-bold">
                      {predicted && predicted !== 'ignore' ? predicted : 'تلقائي'}
                    </span>
                  </div>
                );
              })}
              {columns.length > 12 && (
                <div className="px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  +{columns.length - 12} أعمدة أخرى
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 3. Pinned Footer with Confirmation & Navigation */}
      <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 shrink-0 z-10">
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="truncate">الملف جاهز للاستيراد والدمج الذكي (SmartMerge) في وحدة {currentModuleName}.</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {onOpenReviewStage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenReviewStage(selectedFile)}
              className="flex-1 sm:flex-initial rounded-xl font-bold text-xs gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 h-9"
            >
              <ClipboardEdit className="h-3.5 w-3.5" />
              <span>معاينة ومراجعة</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenSmartMapping(selectedFile)}
            className="flex-1 sm:flex-initial rounded-xl font-bold text-xs gap-1.5 border-slate-300 h-9"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>مراجعة المطابقة</span>
          </Button>

          <Button
            size="sm"
            onClick={() => onInstantImport(selectedFile)}
            className="flex-1 sm:flex-initial rounded-xl font-black text-xs gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 px-4 h-9"
          >
            <span>استيراد وتحديث البيانات</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
