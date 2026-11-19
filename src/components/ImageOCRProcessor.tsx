import React, { useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Upload,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  Cpu,
  ChevronDown,
  ChevronUp,
  FileImage
} from 'lucide-react';
import { ExtractedDocumentData } from '../services/geminiService';
import { openUnifiedImport } from '../lib/unifiedImportHub';
import {
  runMlKitPassportSimulation,
  MlKitVisionResult
} from '../services/mlKitPassportSimulator';
import { toast } from 'sonner';

interface ImageOCRProcessorProps {
  onExtracted?: (data: ExtractedDocumentData) => void;
  onMlKitExtracted?: (result: MlKitVisionResult) => void;
  buttonLabel?: string;
  className?: string;
}

export const ImageOCRProcessor: React.FC<ImageOCRProcessorProps> = ({
  onExtracted,
  onMlKitExtracted,
  buttonLabel = 'رفع صورة الجواز للتعبئة التلقائية (ML Kit OCR)',
  className = ''
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [lastResult, setLastResult] = useState<MlKitVisionResult | null>(null);
  const [showBlocks, setShowBlocks] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processSelectedFile = async (file: File) => {
    setIsProcessing(true);
    setProgressStage('تهيئة محاكي Android ML Kit OCR...');
    setProgressPercent(10);

    try {
      const mlResult = await runMlKitPassportSimulation(file, (stage, pct) => {
        setProgressStage(stage);
        setProgressPercent(pct);
      });

      setLastResult(mlResult);

      if (onMlKitExtracted) {
        onMlKitExtracted(mlResult);
      }
      if (onExtracted) {
        const ef = mlResult.extractedFields;
        onExtracted({
          firstName: ef.firstName,
          secondName: ef.secondName,
          thirdName: ef.thirdName,
          lastName: ef.lastName,
          fullName: ef.fullName || ef.passportName,
          passportNumber: ef.passportNumber,
          idNumber: ef.passportNumber,
          nationality: ef.nationality,
          dateOfBirth: ef.birthDate,
          gender: ef.gender,
          profession: ef.profession,
          placeOfIssue: ef.placeOfIssue,
          issueDate: ef.issueDate,
          expiryDate: ef.expiryDate,
          additionalInfo: ef.mrzText ? `MRZ: ${ef.mrzText}` : undefined
        });
      }

      if (mlResult.watchlistVerification.matched) {
        toast.error(
          `تنبيه أمني فوري: تطابق بيانات الجواز (${mlResult.extractedFields.passportNumber || efSummary(mlResult)}) مع قائمة المطلوبين وبلاغات الضبط!`,
          { duration: 7000 }
        );
      } else if (mlResult.extractedFields.fullName || mlResult.extractedFields.passportNumber) {
        toast.success('تمت قراءة الجواز بمحاكاة ML Kit وتعبئة الحقول تلقائياً.');
      } else {
        toast.warning('تم مسح الصورة، يرجى استكمال أو مراجعة الحقول يدوياً.');
      }
    } catch (err: any) {
      toast.error(`تعذر تحليل صورة الجواز: ${err?.message || 'خطأ غير متوقع'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const efSummary = (res: MlKitVisionResult) =>
    res.extractedFields.fullName || res.extractedFields.passportName || 'صاحب الوثيقة';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    if (files.length > 1) {
      openUnifiedImport({
        category: 'traveler',
        files,
        sourceTitle: 'استخراج OCR متعدد الصور'
      });
      return;
    }

    await processSelectedFile(files[0]);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    if (files.length > 1) {
      openUnifiedImport({
        category: 'traveler',
        files,
        sourceTitle: 'استخراج OCR متعدد الصور'
      });
      return;
    }
    await processSelectedFile(files[0]);
  };

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50/80'
      } p-3 space-y-2.5 ${className}`}
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      dir="rtl"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Cpu className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              محاكاة Android ML Kit OCR — تعبئة آلية وفحص أمني فوري
            </p>
            <p className="text-[11px] text-slate-500">
              اسحب صورة جواز السفر هنا أو انقر للرفع؛ يستخرج (الاسم، رقم الجواز، تاريخ الميلاد) ويفحص قوائم المطلوبين تلقائياً.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
          className="bg-primary hover:bg-primary/90 text-white font-bold gap-1.5 whitespace-nowrap shrink-0"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جاري التعرف ({progressPercent}%)</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <span>{buttonLabel}</span>
            </>
          )}
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-1.5 pt-1">
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-600">{progressStage}</p>
        </div>
      )}

      {!isProcessing && lastResult && (
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>ML Kit TextRecognizer v2</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-600">
                {lastResult.processingTimeMs} ms
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-[11px] text-slate-600 flex items-center gap-1">
                <FileImage className="h-3 w-3" />
                {lastResult.blocks.length} كتل نصية
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowBlocks(v => !v)}
              className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>{showBlocks ? 'إخفاء كتل ML Kit' : 'عرض كتل ML Kit TextBlocks'}</span>
              {showBlocks ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
            <div>
              <span className="text-[10px] text-slate-500 block">الاسم المستخرج</span>
              <span className="font-bold text-slate-900">
                {lastResult.extractedFields.fullName || lastResult.extractedFields.passportName || '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">رقم الجواز</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {lastResult.extractedFields.passportNumber || '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">تاريخ الميلاد</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {lastResult.extractedFields.birthDate || '-'}
              </span>
            </div>
          </div>

          {lastResult.watchlistVerification.matched && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 flex items-start gap-2 text-rose-900">
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-xs">
                  تطابق فوري مع قائمة المطلوبين ({lastResult.watchlistVerification.alertSource})
                </p>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  {lastResult.watchlistVerification.details}
                </p>
              </div>
            </div>
          )}

          {showBlocks && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100 max-h-48 overflow-y-auto">
              {lastResult.blocks.map(block => (
                <div key={block.id} className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500 font-mono mb-0.5">
                    <span>{block.regionLabel}</span>
                    <span>conf: {Math.round(block.confidence * 100)}%</span>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-800 leading-relaxed">
                    {block.text}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
