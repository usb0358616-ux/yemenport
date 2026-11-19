import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  FileSpreadsheet, 
  ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Pause, 
  Play, 
  ShieldCheck, 
  UserPlus, 
  RefreshCw,
  Layers,
  ArrowRight,
  BrainCircuit,
  Sparkles,
  Database,
  Brain,
  Users
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { classifyDocumentWithGemini } from '../services/geminiService';
import { parseExcelLocally, parsePdfLocally } from '../lib/localDocumentParser';
import { toast } from 'sonner';
import { brain } from '../lib/LearningBrainService';

export interface QueuedFile {
  id: string;
  file: File;
  status: 'pending' | 'analyzing' | 'mapping' | 'ready' | 'error' | 'paused' | 'waiting';
  category?: 'traveler' | 'visa' | 'report' | 'seizure' | 'migrant' | 'permit';
  suggestedModule?: string;
  progress: number;
  recordsCount?: number;
  error?: string;
}

interface BatchUploadMonitorProps {
  files: File[];
  onClose: () => void;
  onProcessed: (fileId: string, data: any[], category: string, metadata: any) => void;
  onFinalImport: (filesData: any[]) => void;
}

export const BatchUploadMonitor: React.FC<BatchUploadMonitorProps> = ({
  files: initialFiles,
  onClose,
  onProcessed,
  onFinalImport
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>(
    initialFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending',
      progress: 0
    }))
  );

  const [extractedDataStore, setExtractedDataStore] = useState<Record<string, { records: any[], columns: string[], samples: any[], classification?: any }>>({});
  const [isProcessing, setIsProcessing] = useState(false); // Change to false for manual start
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [lastProcessedTime, setLastProcessedTime] = useState<number>(0);

  // Auto-start analysis after a small delay (simulating 'saving' finished)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queue.some(f => f.status === 'pending') && !isProcessing) {
        handleStartAnalysis();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isProcessing) {
      const nextToProcess = queue.find(f => f.status === 'pending');
      if (nextToProcess) {
        const timeSinceLast = Date.now() - lastProcessedTime;
        const delay = Math.max(0, 12000 - timeSinceLast);
        
        if (delay > 0) {
          updateFileStatus(nextToProcess.id, { status: 'waiting' });
        }

        const timer = setTimeout(() => {
          processNextInQueue();
        }, delay);
        return () => clearTimeout(timer);
      } else {
        // Check if all are done
        const allDone = queue.every(f => f.status === 'ready' || f.status === 'error');
        if (allDone) setIsProcessing(false);
      }
    }
  }, [isProcessing, queue, lastProcessedTime]);

  const processNextInQueue = async () => {
    const next = queue.find(f => f.status === 'pending' || f.status === 'waiting');
    if (!next) return;

    updateFileStatus(next.id, { status: 'analyzing', progress: 10 });

    try {
      let textContent = '';
      let records: any[] = [];
      let columns: string[] = [];

      if (next.file.name.match(/\.(xlsx|xls|csv)$/i)) {
        records = await parseExcelLocally(next.file);
        if (records.length > 0) {
          columns = Object.keys(records[0]).filter(k => k !== 'unmappedFields' && k !== 'rawSource' && k !== 'detectedDepartment' && k !== 'detectionReason');
        }
        textContent = JSON.stringify(records.slice(0, 5));
      } else if (next.file.name.match(/\.pdf$/i)) {
        records = await parsePdfLocally(next.file);
        if (records.length > 0) {
          columns = Object.keys(records[0]).filter(k => k !== 'unmappedFields' && k !== 'rawSource' && k !== 'detectedDepartment' && k !== 'detectionReason');
        }
        textContent = records.slice(0, 3).map((r: any) => `${r.firstName} ${r.idNumber}`).join(', ');
      } else if (next.file.type.startsWith('image/')) {
        updateFileStatus(next.id, { progress: 20 });
        textContent = await brain.extractTextFromImage(URL.createObjectURL(next.file), (p) => {
          updateFileStatus(next.id, { progress: 20 + (p * 0.5) });
        });
        const entities = brain.extractEntities(textContent);
        records = [{ ...entities, firstName: 'مستخرج آلياً', idNumber: entities.idNumber || 'قيد المعالجة' }];
        columns = Object.keys(entities);
      }

      updateFileStatus(next.id, { progress: 80 });
      const localResult = brain.classifyContent(textContent, next.file.name);
      
      let classification = { 
        category: localResult.category as any, 
        suggestedModule: localResult.category === 'traveler' ? 'قسم المسافرين' : 'قسم المستندات',
        extractedRecordsCount: records.length 
      };

      if (navigator.onLine) {
        try {
          const geminiResult = await classifyDocumentWithGemini(textContent, next.file.name);
          classification = {
            ...classification,
            category: geminiResult.category as any,
            suggestedModule: geminiResult.suggestedModule,
            extractedRecordsCount: records.length || geminiResult.extractedRecordsCount
          };
        } catch (e) {
          console.warn('Gemini classification skipped', e);
        }
      }
      
      setLastProcessedTime(Date.now());
      setExtractedDataStore(prev => ({
        ...prev,
        [next.id]: { records, columns, samples: records.slice(0, 3), classification }
      }));

      updateFileStatus(next.id, {
        status: 'ready',
        progress: 100,
        category: classification.category,
        suggestedModule: classification.suggestedModule,
        recordsCount: classification.extractedRecordsCount
      });

      onProcessed(next.id, records, classification.category, { 
        fileName: next.file.name, 
        columns, 
        samples: records.slice(0, 3),
        fileType: next.file.type.startsWith('image/') ? 'image' : next.file.name.match(/\.(xlsx|xls|csv)$/i) ? 'excel' : 'pdf'
      });

    } catch (err: any) {
      updateFileStatus(next.id, { status: 'error', error: err.message, progress: 100 });
    }
  };

  const updateFileStatus = (id: string, updates: Partial<QueuedFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeFromFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setQueue(prev => prev.filter(f => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
    if (queue.length <= 1) onClose();
  };

  const handleStartAnalysis = () => setIsProcessing(true);

  const handleStartFinalImport = () => {
    const readyItems = queue.filter(f => f.status === 'ready');
    const filesData = readyItems.map(item => ({
      fileId: item.id,
      fileName: item.file.name,
      fileType: item.file.name.match(/\.(xlsx|xls|csv)$/i) ? 'excel' : 'pdf',
      columns: extractedDataStore[item.id]?.columns || [],
      sampleRows: extractedDataStore[item.id]?.samples || [],
      records: extractedDataStore[item.id]?.records || [],
      category: item.category
    }));
    onFinalImport(filesData);
  };

  const selectedFileData = selectedFileId ? extractedDataStore[selectedFileId] : null;
  const selectedFile = selectedFileId ? queue.find(f => f.id === selectedFileId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row"
      >
        {/* Sidebar: File List */}
        <div className="w-full md:w-80 border-l border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              قائمة الملفات
            </h3>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <AnimatePresence>
              {queue.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  onClick={() => item.status === 'ready' && setSelectedFileId(item.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer group relative ${
                    selectedFileId === item.id ? 'border-primary bg-white dark:bg-slate-800 shadow-md ring-4 ring-primary/5' :
                    item.status === 'ready' ? 'border-emerald-100 bg-white hover:border-primary/30' :
                    item.status === 'error' ? 'border-rose-100 bg-rose-50/20' :
                    'border-slate-100 bg-white/40 opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      item.file.name.match(/\.(xlsx|xls)$/i) ? 'bg-emerald-100 text-emerald-600' :
                      item.file.name.match(/\.pdf$/i) ? 'bg-rose-100 text-rose-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {item.file.name.match(/\.(xlsx|xls)$/i) ? <FileSpreadsheet className="h-4 w-4" /> : 
                       item.file.name.match(/\.pdf$/i) ? <FileText className="h-4 w-4" /> : 
                       <ImageIcon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-[11px] truncate block text-slate-700 dark:text-slate-200">{item.file.name}</span>
                      <div className="mt-1">
                        {item.status === 'analyzing' ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span className="text-[9px] text-primary font-bold">جاري التحليل...</span>
                          </div>
                        ) : item.status === 'ready' ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            <span className="text-[9px] text-emerald-600 font-bold">{item.suggestedModule}</span>
                          </div>
                        ) : item.status === 'waiting' ? (
                          <span className="text-[9px] text-amber-500 animate-pulse">في انتظار الكوتا...</span>
                        ) : (
                          <span className="text-[9px] text-slate-400">جاهز للتحليل</span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={(e) => removeFromFile(e, item.id)} 
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 rounded-lg text-rose-500 transition-all absolute top-2 left-2"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {item.status === 'analyzing' && (
                    <div className="absolute bottom-0 right-4 left-4 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            {!isProcessing && queue.some(f => f.status === 'pending') && (
              <Button onClick={handleStartAnalysis} className="w-full rounded-2xl py-6 font-black gap-2 shadow-lg shadow-primary/20">
                <Sparkles className="h-5 w-5" />
                بدء التحليل الذكي
              </Button>
            )}
            {isProcessing && (
              <div className="text-center p-2 rounded-xl bg-primary/5 text-primary text-xs font-bold animate-pulse">
                جاري معالجة الملفات...
              </div>
            )}
          </div>
        </div>

        {/* Main Area: Preview & Insights */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
          {selectedFile && selectedFileData ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-inner">
                    {selectedFile.file.name.match(/\.(xlsx|xls)$/i) ? <FileSpreadsheet className="h-8 w-8" /> : 
                     selectedFile.file.name.match(/\.pdf$/i) ? <FileText className="h-8 w-8" /> : 
                     <ImageIcon className="h-8 w-8" />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {selectedFile.file.name}
                      {selectedFile.status === 'ready' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-0.5 rounded-full text-[10px] font-bold">
                        {Math.round(selectedFile.file.size / 1024)} KB
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-400">نظام الملفات المحلي</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFileId(null)} className="rounded-xl h-10 px-4 gap-2 text-slate-500">
                    <X className="h-4 w-4" />
                    إغلاق المعاينة
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* AI Summary & Category Selection */}
                <section className="bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-900/10 dark:to-slate-900 p-8 rounded-[2rem] border border-indigo-100 dark:border-indigo-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
                  
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1">
                      <h4 className="text-sm font-black text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4" />
                        قرار الدماغ المحلي
                      </h4>
                      <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed max-w-xl">
                        بناءً على تحليل المحتوى والاسم، يقترح النظام تصنيف هذا الملف ضمن <strong className="text-primary">{selectedFile.suggestedModule}</strong>. 
                        تم استخراج <strong className="text-emerald-600 font-black">{selectedFile.recordsCount || 0}</strong> سجلاً جاهزاً للمطابقة.
                      </p>
                    </div>

                    <div className="shrink-0 space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block px-1">تغيير الوجهة المستهدفة</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'traveler', label: 'المسافرين', icon: UserPlus },
                          { id: 'visa', label: 'التأشيرات', icon: ShieldCheck },
                          { id: 'report', label: 'البلاغات', icon: FileText },
                          { id: 'seizure', label: 'المضبوطات', icon: Layers },
                          { id: 'migrant', label: 'المهاجرين', icon: Users }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => updateFileStatus(selectedFile.id, { 
                              category: cat.id as any, 
                              suggestedModule: cat.label 
                            })}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                              selectedFile.category === cat.id 
                                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' 
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/30'
                            }`}
                          >
                            <cat.icon className="h-3.5 w-3.5" />
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Extracted Fields Preview */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Database className="h-4 w-4 text-emerald-500" />
                      البيانات المستخرجة (عينة من أول سجل)
                    </h4>
                    <Badge variant="outline" className="rounded-lg text-[10px] border-emerald-100 text-emerald-600 bg-emerald-50/30">
                      تم استخراج {selectedFileData.columns.length} أعمدة
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedFileData.samples[0] ? (
                      Object.entries(selectedFileData.samples[0]).map(([key, val]) => (
                        key !== 'unmappedFields' && key !== 'rawSource' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={key} 
                            className="p-5 rounded-[1.5rem] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group"
                          >
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 group-hover:text-primary transition-colors">{key}</p>
                            <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                              {val ? String(val) : <span className="text-slate-300 font-normal italic">فارغ</span>}
                            </p>
                          </motion.div>
                        )
                      ))
                    ) : (
                      <div className="col-span-full py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm font-bold">لا توجد بيانات قابلة للعرض في هذه العينة</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Instruction for SmartMapping */}
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 p-6 rounded-3xl flex items-start gap-4">
                  <div className="p-3 bg-amber-500/10 rounded-2xl shrink-0">
                    <RefreshCw className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">خطوة المطابقة النهائية</h5>
                    <p className="text-xs text-amber-700/70 dark:text-amber-300/70 leading-relaxed">
                      الخطوة التالية هي مطابقة هذه الأعمدة (مثل "{selectedFileData.columns[0] || 'الاسم'}") مع حقول النظام الأساسية. 
                      سيتعلم النظام من قراراتك هذه المرة لتقديم اقتراحات أدق في المستقبل.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/30 dark:bg-slate-900/30">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                <div className="h-40 w-40 rounded-[3rem] bg-white dark:bg-slate-800 shadow-2xl flex items-center justify-center relative border border-slate-100 dark:border-slate-800">
                  <BrainCircuit className="h-20 w-20 text-primary/40" />
                </div>
                <div className="absolute -bottom-4 -right-4 h-12 w-12 rounded-2xl bg-amber-400 shadow-lg flex items-center justify-center border-4 border-white dark:border-slate-800">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-3">جاهز لتحليل ذكي عميق</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                اضغط على "بدء التحليل" لمعالجة كافة الملفات المرفوعة، أو اختر ملفاً تم تحليله لاستعراض محتواه واقتراحات الوجهة.
              </p>
              
              {!isProcessing && queue.some(f => f.status === 'pending') && (
                <Button 
                  onClick={handleStartAnalysis} 
                  className="mt-8 rounded-2xl h-14 px-10 font-black gap-3 shadow-2xl shadow-primary/30 text-lg hover:scale-105 active:scale-95 transition-all"
                >
                  <Sparkles className="h-6 w-6" />
                  ابدأ تحليل {queue.filter(f => f.status === 'pending').length} ملفات الآن
                </Button>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-3 space-x-reverse">
                {queue.slice(0, 3).map((f, i) => (
                  <div key={f.id} className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 flex items-center justify-center shadow-sm">
                    {f.status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <FileText className="h-5 w-5 text-slate-400" />}
                  </div>
                ))}
                {queue.length > 3 && (
                  <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-600">
                    +{queue.length - 3}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {queue.filter(f => f.status === 'ready').length} من أصل {queue.length} ملفات جاهزة
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">إجمالي السجلات: {queue.reduce((acc, f) => acc + (f.recordsCount || 0), 0)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={onClose}
                className="rounded-2xl h-14 px-8 font-bold border-slate-200"
              >
                إلغاء
              </Button>
              <Button 
                size="lg" 
                onClick={handleStartFinalImport}
                className="flex-1 sm:flex-none rounded-2xl font-black px-12 bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/20 h-14 gap-3 text-lg" 
                disabled={isProcessing || queue.filter(f => f.status === 'ready').length === 0}
              >
                استمرار للمطابقة (SmartMapping)
                <ArrowRight className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
