import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Sparkles, ArrowLeftRight, CheckCircle2, AlertCircle, FileSpreadsheet, FileText, Database } from 'lucide-react';
import { SmartMappingItem, generateSmartMappingWithGemini } from '../services/geminiService';
import { toast } from 'sonner';
import { brain } from '../lib/LearningBrainService';
import { localMatchColumn } from '../lib/dynamicColumnMapper';

interface SmartMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  filesData: { fileName: string; columns: string[]; sampleRows: any[]; fileType: string }[];
  onConfirmImport: (finalMappings: Record<string, Record<string, string>>, targetModules: Record<string, string>, headerStartRow: number) => void;
}

export const SmartMappingDialog: React.FC<SmartMappingDialogProps> = ({
  isOpen,
  onClose,
  filesData,
  onConfirmImport,
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [mappings, setMappings] = useState<Record<string, Record<string, string>>>({});
  const [headerStartRow, setHeaderStartRow] = useState<number>(1);
  const [targetModules, setTargetModules] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, SmartMappingItem[]>>({});

  const currentFile = filesData[activeFileIndex] || { fileName: '', columns: [], sampleRows: [], fileType: 'excel' };

  const dbFieldsList = [
    { key: 'serialNumber', label: 'الرقم التسلسلي بالكشف (م)' },
    { key: 'fullName', label: 'الاسم الكامل' },
    { key: 'passportName', label: 'اسم الجواز' },
    { key: 'firstName', label: 'الاسم الأول' },
    { key: 'lastName', label: 'اسم العائلة / اللقب' },
    { key: 'idNumber', label: 'رقم الجواز / الهوية' },
    { key: 'passportStatus', label: 'حالة الجواز' },
    { key: 'center', label: 'المركز / المنفذ' },
    { key: 'agency', label: 'إسم الوكالة / مكتب السفر' },
    { key: 'visaType', label: 'التأشيرة / نوع التأشيرة' },
    { key: 'exitDate', label: 'ت. الخروج / تاريخ السفر' },
    { key: 'receiveDate', label: 'تاريخ الاستلام' },
    { key: 'status', label: 'الحالة (مؤشر / مرتجع)' },
    { key: 'returnReason', label: 'سبب الإرتجاع' },
    { key: 'nationality', label: 'الجنسية' },
    { key: 'governorate', label: 'المحافظة' },
    { key: 'destination', label: 'الوجهة' },
    { key: 'profession', label: 'المهنة' },
    { key: 'birthDate', label: 'تاريخ الميلاد' },
    { key: 'gender', label: 'الجنس' },
    { key: 'issueDate', label: 'تاريخ الإصدار' },
    { key: 'expiryDate', label: 'تاريخ الانتهاء' },
    { key: 'phone', label: 'رقم الهاتف' },
    { key: 'organization', label: 'الجهة / المنظمة' },
    { key: 'workLocation', label: 'مكان العمل' },
    { key: 'additionalInfo', label: 'معلومات إضافية' },
    { key: 'ignore', label: '-- تجاهل هذا العمود --' }
  ];

  useEffect(() => {
    if (isOpen && filesData.length > 0) {
      loadAiMappingsForFiles();
    }
  }, [isOpen, filesData]);

  const loadAiMappingsForFiles = async () => {
    setIsLoading(true);
    toast.loading('جاري تحليل الأعمدة والمستندات باستخدام الذكاء الاصطناعي...', { id: 'mapping-load' });
    try {
      const newMappings: Record<string, Record<string, string>> = {};
      const newSuggestions: Record<string, SmartMappingItem[]> = {};
      const newTargetModules: Record<string, string> = {};

      const categoryMap: Record<string, string> = {
        'traveler': 'المسافرين',
        'foreigner': 'الوافدون الأجانب',
        'visa': 'مذكرات الخارجية',
        'report': 'البلاغات',
        'seizure': 'المضبوطات والجوازات',
        'refugee': 'شؤون اللاجئين',
        'migrant': 'المهاجرين غير النظاميين',
        'permit': 'تصاريح التنقل'
      };

      for (let i = 0; i < filesData.length; i++) {
        const file = filesData[i] as any;
        newTargetModules[file.fileName] = categoryMap[file.category] || 'المسافرين';
        
        // 1. محاولة استخدام "الدماغ المحلي" المبني على الخبرة السابقة
        const fileMap: Record<string, string> = {};
        const unmappedCols: string[] = [];

        file.columns.forEach((col: string) => {
          const localPrediction = brain.predictField(col);
          if (localPrediction && localPrediction !== 'ignore') {
            fileMap[col] = localPrediction;
          } else {
            const synMatch = localMatchColumn(col);
            if (synMatch.target !== 'ignore') {
              fileMap[col] = synMatch.target;
            } else {
              unmappedCols.push(col);
            }
          }
        });

        // 2. إذا كانت هناك أعمدة غير معروفة، نطلب المساعدة من Gemini (لو توفر الإنترنت)
        if (unmappedCols.length > 0 && navigator.onLine) {
          try {
            const suggestions = await generateSmartMappingWithGemini(unmappedCols, file.sampleRows);
            newSuggestions[file.fileName] = suggestions;
            unmappedCols.forEach((col: string) => {
              const match = suggestions.find(s => s.sourceColumn.toLowerCase() === col.toLowerCase() || s.sourceColumn.includes(col));
              fileMap[col] = match ? match.targetField : 'ignore';
            });
          } catch (e) {
            console.warn('Gemini mapping failed, using fallback', e);
            unmappedCols.forEach(col => { fileMap[col] = fileMap[col] || 'ignore'; });
          }
        } else {
          unmappedCols.forEach(col => { fileMap[col] = fileMap[col] || 'ignore'; });
        }

        newMappings[file.fileName] = fileMap;
      }

      setMappings(newMappings);
      setAiSuggestions(newSuggestions);
      setTargetModules(newTargetModules);
      toast.dismiss('mapping-load');
      toast.success('تم تحليل الأعمدة بناءً على الخبرة السابقة والذكاء الاصطناعي!');
    } catch (err: any) {
      toast.dismiss('mapping-load');
      toast.error('فشل التحليل الذكي للأعمدة، يرجى التحديد اليدوي');
      const fallbackMappings: Record<string, Record<string, string>> = {};
      filesData.forEach(file => {
        const m: Record<string, string> = {};
        file.columns.forEach(col => { m[col] = 'ignore'; });
        fallbackMappings[file.fileName] = m;
      });
      setMappings(fallbackMappings);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (columnName: string, targetField: string) => {
    setMappings(prev => ({
      ...prev,
      [currentFile.fileName]: {
        ...(prev[currentFile.fileName] || {}),
        [columnName]: targetField
      }
    }));
  };

  const handleFinalConfirm = () => {
    // تعلم من قرارات المستخدم قبل الحفظ
    Object.entries(mappings).forEach(([fileName, fileMap]) => {
      Object.entries(fileMap).forEach(([col, field]) => {
        if (field !== 'ignore') {
          brain.learnMapping(col, field);
        }
      });
    });

    onConfirmImport(mappings as any, targetModules as any, headerStartRow);
    onClose();
    toast.success('تم تحديث خبرة "الدماغ المحلي" بنجاح للملفات القادمة.');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 sm:p-2.5 rounded-2xl text-primary shrink-0">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse text-amber-500" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-xl font-bold truncate">المطابقة الذكية والتعلم الآلي (Self-Learning AI)</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                النظام الآن يتعلم من خياراتك. سيتم تطبيق "الخبرة المكتسبة" تلقائياً في المرات القادمة.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="text-sm font-bold text-slate-600">جاري تفعيل "الدماغ المحلي" وتحليل الأعمدة...</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {/* File Tabs Switcher */}
              {filesData.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto adaptive-scroll-region pb-2 border-b border-slate-200">
                  {filesData.map((file, idx) => (
                    <button
                      key={file.fileName}
                      onClick={() => setActiveFileIndex(idx)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        activeFileIndex === idx
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {file.fileType === 'excel' ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="max-w-[160px] truncate">{file.fileName}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Current File Info & Target Section Suggestion */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5">
                <div className="min-w-0 w-full md:w-auto">
                  <p className="text-xs text-slate-400 font-medium">الملف النشط حالياً:</p>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2 mt-0.5 min-w-0">
                    {currentFile.fileType === 'excel' ? <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" /> : <FileText className="h-5 w-5 text-blue-600 shrink-0" />}
                    <span className="truncate">{currentFile.fileName}</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">عدد الأعمدة المكتشفة: {currentFile.columns.length} عمود | عدد العينات: {currentFile.sampleRows.length} صف</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-2 md:w-52">
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">القسم المستهدف:</span>
                    <select
                      value={targetModules[currentFile.fileName] || 'المسافرين'}
                      onChange={(e) => setTargetModules(prev => ({ ...prev, [currentFile.fileName]: e.target.value }))}
                      className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 w-full"
                    >
                      <option value="المسافرين">قسم المسافرين المركزي</option>
                      <option value="الوافدون الأجانب">الوافدون الأجانب والإقامات</option>
                      <option value="مذكرات الخارجية">مذكرات وتأشيرات الخارجية</option>
                      <option value="المضبوطات والجوازات">المضبوطات وجوازات السفر</option>
                      <option value="شؤون اللاجئين">شؤون اللاجئين وتصاريح (UNHCR)</option>
                      <option value="المهاجرين غير النظاميين">المهاجرين غير النظاميين</option>
                      <option value="تصاريح التنقل">تصاريح التنقل الداخلي</option>
                      <option value="البلاغات">بلاغات الضبط</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 md:w-36">
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">بداية العناوين (صف):</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={headerStartRow}
                      onChange={(e) => setHeaderStartRow(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 w-full"
                    />
                  </div>
                </div>
              </div>

              {/* AI Suggestion Insight */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-900 leading-relaxed">
                  <p className="font-bold mb-1">ذكاء اصطناعي داخلي (بدون مفاتيح):</p>
                  <p>هذه المطابقة تمت بناءً على "خبرة النظام المتراكمة" من استيراداتك السابقة. كلما استعملت النظام أكثر، زادت دقة التوقعات تلقائياً.</p>
                </div>
              </div>

              {/* Adaptive Mapping Table -> Vertical Cards on Mobile, Grid on Desktop */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <div className="hidden md:grid bg-slate-100 px-4 py-3 border-b border-slate-200 grid-cols-12 text-xs font-bold text-slate-700 sticky top-0 z-10">
                  <div className="col-span-4">عمود الملف الأصلي</div>
                  <div className="col-span-3">عينة من البيانات</div>
                  <div className="col-span-5">الحقل المستهدف في قاعدة البيانات (اختر أو عدّل)</div>
                </div>
                <div className="divide-y divide-slate-100 max-h-[42dvh] overflow-y-auto adaptive-scroll-region">
                  {currentFile.columns.map((col) => {
                    const nonEmptySampleRow = currentFile.sampleRows.find((r) => r && r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== '');
                    const sampleVal = nonEmptySampleRow ? nonEmptySampleRow[col] : '-';
                    const currentMappedField = mappings[currentFile.fileName]?.[col] || 'ignore';

                    return (
                      <div key={col} className="p-3.5 md:px-4 md:py-3 flex flex-col gap-2 md:grid md:grid-cols-12 md:items-center md:gap-2 hover:bg-slate-50 transition-colors">
                        <div className="md:col-span-4 flex items-center justify-between gap-2 font-bold text-slate-800 text-xs">
                          <span className="truncate" title={col}>{col}</span>
                          {currentMappedField !== 'ignore' && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 md:hidden" />
                          )}
                        </div>
                        <div className="md:col-span-3 text-xs text-slate-500 font-mono truncate bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100" title={String(sampleVal)}>
                          <span className="md:hidden text-slate-400 font-sans ml-1">عينة:</span>
                          {String(sampleVal)}
                        </div>
                        <div className="md:col-span-5 flex items-center gap-2">
                          <select
                            value={currentMappedField}
                            onChange={(e) => handleFieldChange(col, e.target.value)}
                            className={`w-full border rounded-xl px-3 py-2 md:py-1.5 text-xs font-bold outline-none transition-all ${
                              currentMappedField === 'ignore'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold shadow-xs'
                            }`}
                          >
                            {dbFieldsList.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                          {currentMappedField !== 'ignore' && <CheckCircle2 className="hidden md:block h-4 w-4 text-emerald-600 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl w-full sm:w-auto">
            إلغاء
          </Button>
          <Button
            onClick={handleFinalConfirm}
            className="rounded-xl bg-primary text-primary-foreground font-bold px-6 gap-2 w-full sm:w-auto"
          >
            <Database className="h-4 w-4" />
            <span>تأكيد استيراد وحفظ الملفات ({filesData.length})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
