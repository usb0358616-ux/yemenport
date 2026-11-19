import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  BrainCircuit,
  Plus,
  Loader2,
  Clock,
  Trash2,
  RefreshCw,
  Search,
  Check,
  Zap,
  FolderOpen,
  Filter,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  BarChart3,
  ClipboardEdit
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { InsightSuggestionView, InsightFileItem, ExtractedEntities } from './InsightSuggestionView';
import { ImportPreviewReviewPane } from './ImportPreviewReviewPane';
import { FilePreviewList } from './FilePreviewList';
import { ImportAnalyticsPatternsView } from './ImportAnalyticsPatternsView';
import { SmartMappingDialog } from './SmartMappingDialog';
import {
  parseExcelLocally,
  parsePdfLocally,
  formatParsedDate,
  sanitizeExtractedArabicName,
  splitFullName
} from '../lib/localDocumentParser';
import { cleanArabicText, normalizeArabic } from '../lib/storage';
import { parseImageDocument } from '../lib/imageDocumentParser';
import { parseMofaDocument } from '../lib/mofaDocumentParser';
import { brain, CustomReaderInstruction } from '../lib/LearningBrainService';
import { classifyDocumentWithGemini } from '../services/geminiService';
import { scanFileForSecurityAndForgeryAsync } from '../lib/securityThreatScanner';
import { verifyOcrPassportAgainstWatchlist } from '../lib/ocrWatchlistGuard';
import {
  UnifiedImportCategory,
  CATEGORY_LABELS,
  distributeRecordsToModuleAsync,
  mapDepartmentToUnifiedCategory,
  WatchlistHit
} from '../lib/unifiedImportHub';
import { toast } from 'sonner';

interface CentralImportCenterProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: File[];
  defaultCategory?: UnifiedImportCategory;
  sourceTitle?: string;
  autoStartAnalysis?: boolean;
  onConsumeInitialFiles?: () => void;
}

export const CentralImportCenter: React.FC<CentralImportCenterProps> = ({
  isOpen,
  onClose,
  initialFiles,
  defaultCategory,
  sourceTitle,
  autoStartAnalysis,
  onConsumeInitialFiles
}) => {
  const [fileList, setFileList] = useState<InsightFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isUploadingAndSaving, setIsUploadingAndSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [isAnalyzingActive, setIsAnalyzingActive] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [overallAnalysisProgress, setOverallAnalysisProgress] = useState(0);
  const [currentlyAnalyzingFileName, setCurrentlyAnalyzingFileName] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'ready' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'insights' | 'review' | 'patterns'>('insights');
  const [mobilePane, setMobilePane] = useState<'files' | 'preview'>('preview');
  const [customInstructions, setCustomInstructions] = useState<CustomReaderInstruction[]>(() =>
    brain.getCustomInstructions()
  );

  // Dialog for column mapping
  const [smartMappingOpen, setSmartMappingOpen] = useState(false);
  const [batchDataToMap, setBatchDataToMap] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Regex patterns for common repeating Arabic boilerplate phrases found in PDF tables/memos
  const PDF_NLP_BOILERPLATE_PATTERNS: { label: string; regex: RegExp }[] = [
    {
      label: 'في الجدول',
      regex: /\(?\s*(?:مدرج|موضح|وارد|مذكور)?\s*(?:في|بـ?|ضمن)\s*(?:هذا\s+)?الجدول(?:\s+(?:التالي|أدناه|أعلاه|المرفق))?\s*\)?/gi
    },
    {
      label: 'في الكشف',
      regex: /\(?\s*(?:مدرج|موضح|وارد|مذكور)?\s*(?:في|بـ?|ضمن)\s*(?:هذا\s+)?الكشف(?:\s+(?:التالي|أدناه|أعلاه|المرفق))?\s*\)?/gi
    },
    {
      label: 'في البيان',
      regex: /\(?\s*(?:مدرج|موضح|وارد|مذكور)?\s*(?:في|بـ?|ضمن)\s*(?:هذا\s+)?البيان(?:\s+(?:التالي|أدناه|أعلاه|المرفق))?\s*\)?/gi
    },
    {
      label: 'في المرفق',
      regex: /\(?\s*(?:مرفق\s+طيه|في\s+المرفق|بالمرفق|بيانات\s+الجدول|موضح\s+أدناه)\s*\)?/gi
    },
    {
      label: 'عناوين الحقول',
      regex: /(?:^|\s)(?:الاسم\s+الكامل|الاسم\s+الرباعي|اسم\s+المسافر|اسم\s+صاحب\s+الجواز|حامل\s+الجواز|صاحب\s+الجواز)\s*[:：\-]?/gi
    }
  ];

  const toWesternDigits = (val: string): string =>
    val.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  // NLP frequency detector: finds 2-3 word non-name prefixes/phrases repeated across >=2 rows
  const detectRepeatingPdfNoiseNgrams = (records: any[]): string[] => {
    if (records.length < 2) return [];
    const triggerWords = new Set([
      'في', 'من', 'الي', 'علي', 'عن', 'الجدول', 'جدول', 'الكشف', 'كشف',
      'البيان', 'بيان', 'المرفق', 'مرفق', 'مدرج', 'موضح', 'وارد', 'صادر',
      'صفحه', 'سطر', 'عمود', 'تاريخ', 'رقم', 'حاله', 'ملاحظه', 'ملاحظات'
    ]);
    const protectedNameWords = new Set(['عبد', 'الله', 'بن', 'بنت', 'ابو', 'ابي', 'آل', 'ال', 'الدين']);
    const counts = new Map<string, { raw: string; count: number }>();

    for (const rec of records) {
      const rawName = cleanArabicText(
        rec.fullName || [rec.firstName, rec.secondName, rec.thirdName, rec.lastName].filter(Boolean).join(' ')
      );
      if (!rawName) continue;
      const tokens = rawName.split(/\s+/).filter(Boolean);
      const seenInRow = new Set<string>();
      for (const size of [2, 3]) {
        if (tokens.length <= size) continue;
        for (let i = 0; i <= tokens.length - size; i++) {
          const slice = tokens.slice(i, i + size);
          const normSlice = slice.map(t => normalizeArabic(t));
          const hasTrigger = normSlice.some(nt => triggerWords.has(nt));
          const allProtected = normSlice.every(nt => protectedNameWords.has(nt));
          if (!hasTrigger || allProtected) continue;
          const key = normSlice.join(' ');
          if (!seenInRow.has(key)) {
            seenInRow.add(key);
            const prev = counts.get(key);
            counts.set(key, { raw: slice.join(' '), count: (prev?.count || 0) + 1 });
          }
        }
      }
    }

    return Array.from(counts.values())
      .filter(entry => entry.count >= 2)
      .sort((a, b) => b.raw.length - a.raw.length)
      .map(entry => entry.raw);
  };

  // Full NLP + Regex sanitization pass for PDF records before displaying to user
  const cleanPdfExtractedRecordsWithNlp = (
    records: any[],
    customPhrase?: string
  ): {
    cleanedRecords: any[];
    cleanedRecordsCount: number;
    removedPhrases: string[];
  } => {
    if (!records || records.length === 0) {
      return { cleanedRecords: [], cleanedRecordsCount: 0, removedPhrases: [] };
    }

    const removedPhrasesSet = new Set<string>();
    const repeatedNgrams = detectRepeatingPdfNoiseNgrams(records);
    const customRegex = customPhrase?.trim()
      ? new RegExp(customPhrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      : null;

    let cleanedRecordsCount = 0;

    const stripNoiseFromString = (input: string): string => {
      if (!input) return '';
      let txt = cleanArabicText(input);

      if (customRegex) {
        if (customRegex.test(txt)) {
          removedPhrasesSet.add(customPhrase!.trim());
          txt = txt.replace(customRegex, ' ');
        }
      }

      for (const pat of PDF_NLP_BOILERPLATE_PATTERNS) {
        if (pat.regex.test(txt)) {
          removedPhrasesSet.add(pat.label);
          pat.regex.lastIndex = 0;
          txt = txt.replace(pat.regex, ' ');
        }
        pat.regex.lastIndex = 0;
      }

      for (const ngram of repeatedNgrams) {
        const ngRegex = new RegExp(ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (ngRegex.test(txt)) {
          removedPhrasesSet.add(ngram);
          txt = txt.replace(ngRegex, ' ');
        }
      }

      return cleanArabicText(txt);
    };

    const cleanedRecords = records.map(rec => {
      const next = { ...rec };
      const originalRawName = cleanArabicText(
        rec.fullName ||
          [rec.firstName, rec.secondName, rec.thirdName, rec.fourthName, rec.lastName].filter(Boolean).join(' ')
      );

      let cleanedName = stripNoiseFromString(originalRawName);
      // Apply Arabic personal name isolator when text contains Arabic characters
      if (/[\u0600-\u06FF]/.test(cleanedName)) {
        const isolated = sanitizeExtractedArabicName(cleanedName);
        if (isolated && isolated.length >= 3) {
          cleanedName = isolated;
        }
      }

      if (cleanedName !== originalRawName) {
        cleanedRecordsCount++;
      }

      if (cleanedName) {
        const parts = splitFullName(cleanedName);
        next.fullName = cleanedName;
        next.firstName = parts.firstName || cleanedName;
        next.secondName = parts.secondName;
        next.thirdName = parts.thirdName;
        next.fourthName = parts.fourthName;
        next.lastName = parts.lastName;
      }

      // Clean other text fields from leaked PDF boilerplate phrases
      for (const field of ['destination', 'agency', 'center', 'status', 'additionalInfo'] as const) {
        if (typeof next[field] === 'string' && next[field]) {
          next[field] = stripNoiseFromString(next[field]);
        }
      }

      // Normalize ID and dates cleanly
      if (next.idNumber) {
        next.idNumber = toWesternDigits(String(next.idNumber)).trim();
      }
      for (const dateField of ['receiveDate', 'exitDate', 'birthDate', 'issueDate', 'expiryDate'] as const) {
        if (next[dateField]) {
          next[dateField] = formatParsedDate(toWesternDigits(String(next[dateField])));
        }
      }
      if (next.exitDate && !next.receiveDate) next.receiveDate = next.exitDate;
      if (next.receiveDate && !next.exitDate) next.exitDate = next.receiveDate;

      return next;
    });

    return {
      cleanedRecords,
      cleanedRecordsCount,
      removedPhrases: Array.from(removedPhrasesSet)
    };
  };

  const buildKeyEntitiesFromRecord = (first: any): ExtractedEntities => {
    if (!first) return {};
    return {
      serialNumber: first.serialNumber,
      fullName:
        first.fullName ||
        [first.firstName, first.secondName, first.thirdName, first.fourthName, first.lastName]
          .filter(Boolean)
          .join(' '),
      firstName: first.firstName,
      secondName: first.secondName,
      thirdName: first.thirdName,
      fourthName: first.fourthName,
      lastName: first.lastName,
      passportName: first.passportName,
      idNumber: first.idNumber,
      idType: first.idType || 'جواز',
      nationality: first.country || first.nationality,
      birthDate: first.birthDate,
      age: first.age,
      gender: first.gender,
      profession: first.profession,
      governorate: first.governorate,
      placeOfIssue: first.placeOfIssue,
      issueDate: first.issueDate,
      expiryDate: first.expiryDate,
      phone: first.phone,
      agency: first.agency,
      center: first.center,
      destination: first.destination,
      visaType: first.visaType,
      receiveDate: first.receiveDate,
      exitDate: first.exitDate || first.receiveDate,
      travelAllowed: first.travelAllowed,
      status: first.status,
      returnReason: first.returnReason,
      vettingResult: first.vettingResult,
      additionalInfo: first.additionalInfo
    };
  };

  // Ingest initialFiles when opened from any page trigger
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      handleFilesAdded(initialFiles, defaultCategory, Boolean(autoStartAnalysis));
      onConsumeInitialFiles?.();
    }
  }, [isOpen, initialFiles]);

  // Handle incoming files from file picker or drag & drop
  const handleFilesAdded = (
    files: File[],
    hintCategory?: UnifiedImportCategory,
    immediateStart: boolean = false
  ) => {
    if (!files || files.length === 0) return;

    const newItems: InsightFileItem[] = files.map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let fileType: InsightFileItem['type'] = 'other';
      if (['xlsx', 'xls', 'csv'].includes(ext)) fileType = 'excel';
      else if (ext === 'pdf' || file.type === 'application/pdf') fileType = 'pdf';
      else if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) fileType = 'image';

      return {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: fileType,
        status: immediateStart ? 'uploading' : 'staged',
        uploadProgress: 0,
        analysisProgress: 0,
        category: hintCategory || defaultCategory
      };
    });

    setFileList(prev => [...prev, ...newItems]);
    if (!selectedFileId && newItems.length > 0) {
      setSelectedFileId(newItems[0].id);
    }

    if (immediateStart) {
      triggerUploadAndSave(newItems);
    } else {
      toast.info(`تمت إضافة ${newItems.length} ملف(ات) إلى قائمة المعاينة — يمكنك مراجعتها أو حذف أي ملف قبل بدء التحليل الشامل.`);
    }
  };

  const handleStartComprehensiveAnalysis = () => {
    const stagedQueue = fileList.filter(f => f.status === 'staged');
    if (stagedQueue.length === 0) {
      toast.error('لا توجد ملفات في قائمة الانتظار لبدء التحليل');
      return;
    }
    triggerUploadAndSave(stagedQueue);
  };

  /**
   * 1. مرحلة التحميل والحفظ (Upload & Save Phase)
   */
  const triggerUploadAndSave = (itemsToUpload: InsightFileItem[]) => {
    setIsUploadingAndSaving(true);
    setSaveProgress(20);

    const stepInterval = setInterval(() => {
      setSaveProgress(prev => {
        if (prev >= 90) {
          clearInterval(stepInterval);
          return 95;
        }
        return prev + 25;
      });
    }, 100);

    setTimeout(() => {
      clearInterval(stepInterval);
      setSaveProgress(100);

      setFileList(prev =>
        prev.map(item =>
          itemsToUpload.some(u => u.id === item.id)
            ? { ...item, status: 'pending', uploadProgress: 100 }
            : item
        )
      );

      setIsUploadingAndSaving(false);
      toast.success(`تم استقبال ${itemsToUpload.length} ملف(ات)! بدأ التحليل التلقائي...`);
      runSequentialAnalysis(
        itemsToUpload.map(i => ({ ...i, status: 'pending', uploadProgress: 100 }))
      );
    }, 450);
  };

  const mapCategoryToLabel = (cat: UnifiedImportCategory): string => CATEGORY_LABELS[cat] || 'المسافرين';

  const runSequentialAnalysis = async (queue: InsightFileItem[]) => {
    if (queue.length === 0) return;
    setIsAnalyzingActive(true);
    let completedCount = 0;
    const total = queue.length;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setCurrentlyAnalyzingFileName(item.name);
      updateFile(item.id, { status: 'analyzing', analysisProgress: 15 });

      try {
        let extractedRecords: any[] = [];
        let detectedColumns: string[] = [];
        let textForClassification = '';
        let extractedEntities: ExtractedEntities = {};
        let forcedCategory: UnifiedImportCategory | undefined = item.category;
        let forcedReason = '';
        let mofaRequestMeta: any = undefined;
        let seizureMeta: any = undefined;
        let sanitizationSummary: InsightFileItem['sanitizationSummary'] = undefined;

        if (item.type === 'excel') {
          updateFile(item.id, { analysisProgress: 20 });
          extractedRecords = await parseExcelLocally(item.file, {
            onProgress: p => updateFile(item.id, { analysisProgress: Math.round(20 + p * 0.45) })
          });
          updateFile(item.id, { analysisProgress: 65 });

          if (extractedRecords.length > 0) {
            detectedColumns = Object.keys(extractedRecords[0]).filter(
              k => !['unmappedFields', 'rawSource', 'detectedDepartment', 'detectionReason'].includes(k)
            );
            textForClassification = JSON.stringify(extractedRecords.slice(0, 5));

            const first = extractedRecords[0];
            if (first.detectedDepartment) {
              const detectedCat = mapDepartmentToUnifiedCategory(first.detectedDepartment);
              if (!forcedCategory || detectedCat !== 'traveler') {
                forcedCategory = detectedCat;
                forcedReason = first.detectionReason || '';
              }
            }

            extractedEntities = {
              serialNumber: first.serialNumber,
              fullName: [first.firstName, first.secondName, first.thirdName, first.lastName].filter(Boolean).join(' ') || first.fullName,
              firstName: first.firstName,
              secondName: first.secondName,
              thirdName: first.thirdName,
              lastName: first.lastName,
              idNumber: first.idNumber,
              idType: first.idType,
              nationality: first.country,
              birthDate: first.birthDate,
              phone: first.phone,
              agency: first.agency,
              center: first.center,
              destination: first.destination,
              visaType: first.visaType,
              receiveDate: first.receiveDate,
              exitDate: first.exitDate || first.receiveDate,
              travelAllowed: first.travelAllowed,
              status: first.status,
              returnReason: first.returnReason,
              vettingResult: first.vettingResult,
              additionalInfo: first.additionalInfo
            };
          }
        } else if (item.type === 'pdf') {
          updateFile(item.id, { analysisProgress: 35 });
          const lowerName = item.name.toLowerCase();
          const looksLikeMofa =
            forcedCategory === 'visa' ||
            /manifest|mofa|echo|residencies|additional_pax|ino132h|5200001|ca________r|44a660b9|قوافل|أجياد|مذكرة|تأشيرة|خارجية/.test(
              lowerName
            );

          if (looksLikeMofa) {
            const mofaRes = await parseMofaDocument(item.file, item.name);
            mofaRequestMeta = mofaRes.request;
            forcedCategory = 'visa';
            forcedReason = `${mofaRes.docTypeLabel} — ${mofaRes.request.organization}`;
            textForClassification = mofaRes.extractedTextSample || item.name;
            extractedRecords = (mofaRes.request.beneficiaries || []).map(b => ({
              fullName: b.fullName || b.fullNameEn || 'مستفيد دولي',
              firstName: (b.fullName || '').split(' ')[0] || 'مستفيد',
              lastName: (b.fullName || '').split(' ').slice(1).join(' '),
              idNumber: b.passportNumber,
              country: b.nationality,
              nationality: b.nationality,
              profession: b.profession,
              agency: mofaRes.request.organization,
              receiveDate: mofaRes.request.memoDate,
              visaType: mofaRes.request.requestType,
              destination: b.workLocation || 'الجمهورية اليمنية',
              additionalInfo: mofaRes.request.mofaDirective
            }));
          } else {
            extractedRecords = await parsePdfLocally(item.file);
            if (extractedRecords.length > 0 && extractedRecords[0].detectedDepartment) {
              forcedCategory = mapDepartmentToUnifiedCategory(extractedRecords[0].detectedDepartment);
              forcedReason = extractedRecords[0].detectionReason || '';
            }
          }

          // NLP & Regex cleaning pass for PDF records before displaying to the user
          if (extractedRecords.length > 0) {
            const nlpRes = cleanPdfExtractedRecordsWithNlp(extractedRecords);
            extractedRecords = nlpRes.cleanedRecords;
            sanitizationSummary = {
              cleanedRecordsCount: nlpRes.cleanedRecordsCount,
              removedPhrases: nlpRes.removedPhrases
            };
            if (nlpRes.cleanedRecordsCount > 0 && nlpRes.removedPhrases.length > 0) {
              toast.info(
                `تمت تنقية ${nlpRes.cleanedRecordsCount} سجل من "${item.name}" وإزالة العبارات المتكررة (${nlpRes.removedPhrases.join('، ')}) قبل العرض.`
              );
            }
          }

          updateFile(item.id, { analysisProgress: 70 });

          if (extractedRecords.length > 0) {
            detectedColumns = Object.keys(extractedRecords[0]).filter(
              k => !['unmappedFields', 'rawSource', 'detectedDepartment', 'detectionReason'].includes(k)
            );
            const first = extractedRecords[0];
            if (!textForClassification) {
              textForClassification = extractedRecords.slice(0, 3).map(r => `${r.firstName || r.fullName} ${r.idNumber}`).join(', ');
            }

            extractedEntities = buildKeyEntitiesFromRecord(first);
          }
        } else if (item.type === 'image') {
          updateFile(item.id, { analysisProgress: 30 });
          const imgResult = await parseImageDocument(item.file);
          updateFile(item.id, { analysisProgress: 65 });

          textForClassification = imgResult.rawTextSample || imgResult.docTypeLabel || item.name;
          if (imgResult.docType === 'seizure_memo' && imgResult.seizureData) {
            seizureMeta = imgResult.seizureData;
            forcedCategory = 'seizure';
            forcedReason = imgResult.docTypeLabel;
            extractedRecords = imgResult.seizureData.passports.map(p => {
              const parts = splitFullName(p.travelerName || '');
              return {
                fullName: p.travelerName,
                firstName: parts.firstName || 'مسافر',
                secondName: parts.secondName,
                thirdName: parts.thirdName,
                fourthName: parts.fourthName,
                lastName: parts.lastName,
                idNumber: p.passportNumber,
                idType: 'جواز',
                country: p.nationality || 'اليمن',
                center: imgResult.seizureData?.seizurePort || 'نقطة يسلح',
                receiveDate: imgResult.seizureData?.seizureDate || new Date().toISOString().split('T')[0],
                governorate: p.issueGovernorate || '',
                travelAllowed: 'لا',
                status: 'مضبوط',
                vettingResult: imgResult.seizureData?.reason || 'محضر ضبط جوازات',
                additionalInfo: `محضر: ${imgResult.seizureData?.recordNumber} | السائق: ${imgResult.seizureData?.driverName}`
              };
            });
          } else if (imgResult.travelerData) {
            const td = imgResult.travelerData;
            if (!forcedCategory || imgResult.suggestedDepartment !== 'travelers') {
              forcedCategory = mapDepartmentToUnifiedCategory(imgResult.suggestedDepartment);
            }
            forcedReason = imgResult.docTypeLabel;
            const resolvedFull = cleanArabicText(
              td.fullName ||
                [td.firstName, td.secondName, td.thirdName, td.fourthName, td.lastName]
                  .filter(Boolean)
                  .join(' ')
            );
            const parts = resolvedFull ? splitFullName(resolvedFull) : {
              firstName: td.firstName || '',
              secondName: td.secondName || '',
              thirdName: td.thirdName || '',
              fourthName: td.fourthName || '',
              lastName: td.lastName || '',
            };
            extractedRecords = [
              {
                ...td,
                fullName: resolvedFull || td.fullName || '',
                firstName: td.firstName || parts.firstName,
                secondName: td.secondName || parts.secondName,
                thirdName: td.thirdName || parts.thirdName,
                fourthName: td.fourthName || parts.fourthName,
                lastName: td.lastName || parts.lastName,
              }
            ];
            if (td.status === 'بحاجة لمراجعة يدوية') {
              toast.warning(`تعذر استخراج بعض حقول "${item.name}" آلياً — يمكنك تعديلها يدوياً من تبويب المعاينة والمراجعة.`);
            }
          }

          if (extractedRecords.length > 0) {
            const first = extractedRecords[0];
            detectedColumns = Object.keys(first).filter(
              k => !['unmappedFields', 'rawSource', 'detectedDepartment', 'detectionReason'].includes(k)
            );
            extractedEntities = buildKeyEntitiesFromRecord(first);
          }
        }

        updateFile(item.id, { analysisProgress: 70 });

        const securityScan = await scanFileForSecurityAndForgeryAsync(
          item.name,
          textForClassification,
          extractedRecords,
          p => updateFile(item.id, { analysisProgress: Math.round(70 + p * 0.25) })
        );

        // Emit immediate Dashboard Watchlist Alerts for OCR-extracted records (images / scanned docs)
        if (item.type === 'image' && extractedRecords.length > 0) {
          extractedRecords.slice(0, 10).forEach(rec => {
            const recName = cleanArabicText(
              rec.fullName ||
                [rec.firstName, rec.secondName, rec.thirdName, rec.fourthName, rec.lastName]
                  .filter(Boolean)
                  .join(' ')
            );
            verifyOcrPassportAgainstWatchlist({
              fullName: recName,
              fullNameEnglish: rec.passportName,
              passportNumber: rec.idNumber || rec.passportNumber,
              birthDate: rec.birthDate,
              sourceType: 'batch_import',
              sourceLabel: `الاستيراد الموحد (${item.name})`,
              emitDashboardAlert: true
            });
          });
        }

        if (securityScan.status === 'threat_detected') {
          toast.error(`⚠️ تنبيه أمني عالي الخطورة في "${item.name}": تم رصد تطابق مطلوبين أو تزوير!`);
        } else if (securityScan.status === 'warning') {
          const totalThreats = securityScan.totalThreatsDetected || securityScan.threats.length;
          toast.warning(`🔍 اشتباه أمني في "${item.name}": تم رصد ${totalThreats} ملاحظات بالوثيقة.`);
        }

        const analysisInsight = brain.analyzeAndSummarizeDocument(
          item.name,
          textForClassification,
          extractedRecords,
          detectedColumns,
          forcedCategory
        );

        let category: UnifiedImportCategory =
          forcedCategory || (analysisInsight.primaryCategory as UnifiedImportCategory) || 'traveler';
        let moduleName = mapCategoryToLabel(category);
        let reason = forcedReason || analysisInsight.executiveSummary;

        if (!forcedCategory && typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const geminiResult = await classifyDocumentWithGemini(textForClassification, item.name);
            if (geminiResult && geminiResult.category) {
              category = mapDepartmentToUnifiedCategory(geminiResult.category);
              moduleName = mapCategoryToLabel(category);
              reason = geminiResult.summary || reason;
            }
          } catch {
            // Keep local brain result cleanly offline
          }
        }

        updateFile(item.id, {
          status: 'ready',
          analysisProgress: 100,
          recordsCount: extractedRecords.length,
          records: extractedRecords,
          columns: detectedColumns,
          samples: extractedRecords.slice(0, 5),
          keyEntities: extractedEntities,
          category,
          suggestedModule: moduleName,
          confidence: Math.max(analysisInsight.confidence || 90, 92),
          reason,
          securityScan,
          analysisInsight,
          mofaRequest: mofaRequestMeta,
          seizureMeta,
          sanitizationSummary
        });

        setSelectedFileId(prev => (prev === null ? item.id : prev));
      } catch (err: any) {
        console.error('Analysis error for file:', item.name, err);
        updateFile(item.id, {
          status: 'error',
          analysisProgress: 100,
          error: err.message || 'تعذر تحليل محتوى الملف'
        });
      }

      completedCount++;
      setOverallAnalysisProgress(Math.round((completedCount / total) * 100));
    }

    setIsAnalyzingActive(false);
    setCurrentlyAnalyzingFileName('');
    toast.success(`اكتمل تحليل (${completedCount}) ملفات — جاهزة للإدراج في أماكنها المناسبة`);
  };

  const updateFile = (id: string, updates: Partial<InsightFileItem>) => {
    setFileList(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleRemoveFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFileList(prev => {
      const filtered = prev.filter(f => f.id !== id);
      if (selectedFileId === id) {
        setSelectedFileId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleReanalyze = (file: InsightFileItem) => {
    updateFile(file.id, { status: 'pending', analysisProgress: 0 });
    runSequentialAnalysis([{ ...file, status: 'pending', analysisProgress: 0 }]);
  };

  const handleUpdateCategory = (fileId: string, category: string, moduleName: string) => {
    const targetFile = fileList.find(f => f.id === fileId);
    if (targetFile) {
      brain.learnFileClassification(targetFile.name, targetFile.columns || [], category);
    }
    updateFile(fileId, {
      category: category as UnifiedImportCategory,
      suggestedModule: moduleName,
      reason: `تم توجيه الوجهة يدوياً وحفظ النمط في ذاكرة القارئ لوحدة ${moduleName}.`
    });
    toast.info(`تم توجيه الملف لوحدة ${moduleName} وحفظ التفضيل في الذاكرة المحلية`);
  };

  const handleUpdateFileRecords = (
    fileId: string,
    updatedRecords: any[],
    extraUpdates?: Partial<InsightFileItem>
  ) => {
    const first = updatedRecords[0];
    updateFile(fileId, {
      records: updatedRecords,
      recordsCount: updatedRecords.length,
      samples: updatedRecords.slice(0, 5),
      keyEntities: first ? buildKeyEntitiesFromRecord(first) : {},
      ...extraUpdates
    });
  };

  const handleCleanCustomPhrase = (fileId: string, customPhrase?: string) => {
    const targetFile = fileList.find(f => f.id === fileId);
    if (!targetFile || !targetFile.records) return;

    const nlpRes = cleanPdfExtractedRecordsWithNlp(targetFile.records, customPhrase);
    const existingPhrases = targetFile.sanitizationSummary?.removedPhrases || [];
    const mergedPhrases = Array.from(new Set([...existingPhrases, ...nlpRes.removedPhrases]));

    handleUpdateFileRecords(fileId, nlpRes.cleanedRecords, {
      sanitizationSummary: {
        cleanedRecordsCount:
          (targetFile.sanitizationSummary?.cleanedRecordsCount || 0) + nlpRes.cleanedRecordsCount,
        removedPhrases: mergedPhrases
      },
      reviewed: true
    });

    if (nlpRes.cleanedRecordsCount > 0 || customPhrase) {
      toast.success(
        customPhrase
          ? `تمت إزالة "${customPhrase}" وتحديث ${nlpRes.cleanedRecords.length} سجل.`
          : `تمت إعادة تنقية ${nlpRes.cleanedRecordsCount} سجل بالمعالجة اللغوية.`
      );
    } else {
      toast.info('السجلات نظيفة بالفعل ولا تحتوي عبارات متكررة إضافية.');
    }
  };

  const handleTeachInstruction = (instructionText: string, keywords: string, targetCategory: string) => {
    brain.learnCustomInstruction(instructionText, keywords, targetCategory);
    setCustomInstructions(brain.getCustomInstructions());
    toast.success('تم تعليم القارئ القاعدة الجديدة بنجاح وسيتم تطبيقها تلقائياً على الملفات المشابهة.');
  };

  const handleDeleteInstruction = (instructionId: string) => {
    setCustomInstructions(brain.removeCustomInstruction(instructionId));
    toast.info('تم حذف القاعدة من ذاكرة القارئ.');
  };

  const notifyWatchlistHits = (hits: WatchlistHit[]) => {
    if (hits.length > 0) {
      hits.slice(0, 10).forEach(h => {
        verifyOcrPassportAgainstWatchlist({
          fullName: h.travelerName,
          passportNumber: h.idNumber,
          sourceType: 'batch_import',
          sourceLabel: 'استيراد ومطابقة القوائم',
          emitDashboardAlert: true
        });
      });
      toast.error(`🚨 تنبيه أمني: مطابقة (${hits.length}) سجل مع قوائم المطلوبين والبلاغات أثناء الاستيراد!`, {
        duration: 8000
      });
    }
  };

  // Instant single-file distribution to its target module (non-blocking for 3000+ rows)
  const handleInstantImport = async (file: InsightFileItem) => {
    const records = file.records || [];
    if (records.length === 0 && !file.mofaRequest) {
      toast.error('لا توجد سجلات مستخرجة في هذا الملف للاستيراد');
      return;
    }

    setIsDistributing(true);
    try {
      const cat: UnifiedImportCategory = file.category || 'traveler';
      brain.learnFileClassification(file.name, file.columns || [], cat);

      const res = await distributeRecordsToModuleAsync(cat, records, file.name, {
        mofaRequest: file.mofaRequest,
        seizureMeta: file.seizureMeta,
        onProgress: p => updateFile(file.id, { analysisProgress: p })
      });

      notifyWatchlistHits(res.watchlistHits);
      const agencySummary = res.linkedAgenciesCount ? ` وربط ${res.linkedAgenciesCount} وكالة سفر` : '';
      toast.success(
        `تم إيداع "${file.name}" في [${res.moduleLabel}] (${res.added} جديد${res.updated > 0 ? `، ${res.updated} تحديث` : ''}${agencySummary}).`
      );
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء توزيع وحفظ البيانات');
    } finally {
      setIsDistributing(false);
    }
  };

  // Batch distribute ALL ready files straight to their respective appropriate modules!
  const handleImportAllReady = async () => {
    const readyFiles = fileList.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) {
      toast.error('لا توجد ملفات جاهزة للاستيراد');
      return;
    }

    setIsDistributing(true);
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalLinkedAgencies = 0;
    const allHits: WatchlistHit[] = [];
    const touchedModules = new Set<string>();

    try {
      for (const file of readyFiles) {
        const cat: UnifiedImportCategory = file.category || 'traveler';
        brain.learnFileClassification(file.name, file.columns || [], cat);
        setCurrentlyAnalyzingFileName(file.name);

        const res = await distributeRecordsToModuleAsync(cat, file.records || [], file.name, {
          mofaRequest: file.mofaRequest,
          seizureMeta: file.seizureMeta
        });
        totalAdded += res.added;
        totalUpdated += res.updated;
        totalLinkedAgencies += res.linkedAgenciesCount || 0;
        allHits.push(...res.watchlistHits);
        touchedModules.add(res.moduleLabel);
      }

      notifyWatchlistHits(allHits);
      const agencyMsg = totalLinkedAgencies > 0 ? `، مع ربط ${totalLinkedAgencies} وكالة سفر بالتأشيرات` : '';
      toast.success(
        `تم توزيع وحفظ ${readyFiles.length} ملفات في أماكنها المناسبة (${Array.from(touchedModules).join('، ')}) — ${totalAdded} سجل جديد، ${totalUpdated} تحديث${agencyMsg}.`
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setIsDistributing(false);
      setCurrentlyAnalyzingFileName('');
    }
  };

  // Open SmartMapping dialog for review
  const handleOpenSmartMapping = (file?: InsightFileItem) => {
    const readyItems = file ? [file] : fileList.filter(f => f.status === 'ready');
    if (readyItems.length === 0) {
      toast.error('لا توجد ملفات جاهزة للمطابقة');
      return;
    }

    const payload = readyItems.map(item => ({
      fileName: item.name,
      fileType: item.type === 'excel' ? 'excel' : 'pdf',
      columns: item.columns || [],
      sampleRows: item.samples || [],
      records: item.records || [],
      category: item.category,
      mofaRequest: item.mofaRequest,
      seizureMeta: item.seizureMeta
    }));

    setBatchDataToMap(payload);
    setSmartMappingOpen(true);
  };

  // Confirm mapping from SmartMappingDialog & distribute to each selected module
  const handleConfirmMapping = async (
    allMappings: Record<string, Record<string, string>>,
    targetModules: Record<string, string>,
    _headerStartRow: number
  ) => {
    setIsDistributing(true);
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalLinkedAgencies = 0;
    const allHits: WatchlistHit[] = [];

    try {
      for (const fileData of batchDataToMap) {
        const records = fileData.records || [];
        const mapping = allMappings[fileData.fileName] || {};
        const targetModuleLabel = targetModules[fileData.fileName] || 'المسافرين';
        const targetCat = mapDepartmentToUnifiedCategory(targetModuleLabel);
        brain.learnFileClassification(fileData.fileName, fileData.columns || [], targetCat);

        const mappedRows: any[] = [];
        for (let i = 0; i < records.length; i++) {
          const row = records[i];
          const mappedData: any = { ...row };
          Object.entries(mapping).forEach(([col, field]) => {
            if (field !== 'ignore' && row[col] !== undefined) {
              const rawVal = row[col];
              if (field === 'exitDate' || field === 'receiveDate' || field === 'issueDate' || field === 'expiryDate' || field === 'birthDate') {
                mappedData[field] = formatParsedDate(rawVal);
              } else if (field === 'serialNumber' || field === 'idNumber' || field === 'phone') {
                mappedData[field] = String(rawVal).trim().replace(/\.0$/, '');
              } else {
                mappedData[field] = typeof rawVal === 'string' ? cleanArabicText(rawVal) : rawVal;
              }
            }
          });
          if (mappedData.exitDate && !mappedData.receiveDate) {
            mappedData.receiveDate = mappedData.exitDate;
          } else if (mappedData.receiveDate && !mappedData.exitDate) {
            mappedData.exitDate = mappedData.receiveDate;
          }
          if (mappedData.fullName) {
            const cleanedFull = cleanArabicText(String(mappedData.fullName));
            const parts = cleanedFull.split(/\s+/).filter(Boolean);
            mappedData.fullName = cleanedFull;
            mappedData.firstName = parts[0] || '';
            mappedData.secondName = parts[1] || '';
            mappedData.thirdName = parts[2] || '';
            mappedData.fourthName = parts.length > 4 ? parts[3] : '';
            mappedData.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
          }
          mappedRows.push(mappedData);
          if (i > 0 && i % 400 === 0) {
            await new Promise<void>(r => setTimeout(r, 0));
          }
        }

        const res = await distributeRecordsToModuleAsync(targetCat, mappedRows, fileData.fileName, {
          mofaRequest: fileData.mofaRequest,
          seizureMeta: fileData.seizureMeta
        });
        totalAdded += res.added;
        totalUpdated += res.updated;
        totalLinkedAgencies += res.linkedAgenciesCount || 0;
        allHits.push(...res.watchlistHits);
      }

      notifyWatchlistHits(allHits);
      toast.success(
        `تم إتمام الاستيراد والمطابقة الشاملة: ${totalAdded} جديد، ${totalUpdated} دمج وتحديث${totalLinkedAgencies > 0 ? `، وربط ${totalLinkedAgencies} وكالة سفر` : ''}.`
      );
      setSmartMappingOpen(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء تأكيد المطابقة والحفظ');
    } finally {
      setIsDistributing(false);
    }
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  // Filtered files for search
  const filteredFiles = fileList.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'ready') return matchSearch && f.status === 'ready';
    if (filterType === 'pending') return matchSearch && (f.status === 'staged' || f.status === 'pending' || f.status === 'analyzing');
    return matchSearch;
  });

  const selectedFile = fileList.find(f => f.id === selectedFileId) || null;
  const stagedFiles = fileList.filter(f => f.status === 'staged');
  const readyFilesCount = fileList.filter(f => f.status === 'ready').length;
  const totalExtractedRecords = fileList.reduce((acc, f) => acc + (f.recordsCount || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-2 sm:p-5" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[94dvh] max-h-[94dvh] sm:h-[90dvh] rounded-2xl sm:rounded-[2.2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col"
      >
        {/* 1. Compact Responsive Header with Golden/Indigo Gradient */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-r from-primary via-indigo-900 to-primary text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="p-2 sm:p-2.5 bg-white/10 backdrop-blur-md rounded-xl sm:rounded-2xl border border-white/20 text-amber-300 shadow-md shrink-0">
                <BrainCircuit className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h2 className="text-sm sm:text-xl font-black tracking-tight truncate">
                    مركز الاستيراد والمعالجة الموحد
                  </h2>
                  <Badge className="hidden sm:inline-flex bg-amber-400 text-slate-900 hover:bg-amber-300 border-none font-bold text-[10px] px-2">
                    اختيار متعدد
                  </Badge>
                  {(sourceTitle || defaultCategory) && (
                    <Badge className="bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 font-bold text-[10px] px-2 truncate max-w-[180px] sm:max-w-none">
                      الوجهة: {sourceTitle || CATEGORY_LABELS[defaultCategory!]}
                    </Badge>
                  )}
                </div>
                <p className="hidden sm:block text-white/75 text-xs mt-0.5">
                  اختر عدة ملفات دفعة واحدة (Excel, PDF, صور وثائق ومذكرات) ليتم تحليلها وتوزيعها تلقائياً في أماكنها المناسبة.
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="sm:hidden text-white/90 hover:text-white hover:bg-white/10 rounded-xl h-8 w-8 shrink-0"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial bg-white/15 hover:bg-white/25 text-white border-white/25 rounded-xl font-bold text-[11px] sm:text-xs h-8 sm:h-9 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>اختيار عدة ملفات</span>
            </Button>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesAdded(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
              accept=".xlsx,.xls,.csv,.pdf,image/*"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hidden sm:inline-flex text-white/80 hover:text-white hover:bg-white/10 rounded-xl h-9 w-9 shrink-0"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* 2. Visual Progress Indicator Banner for Analysis & Upload */}
        <AnimatePresence>
          {isUploadingAndSaving && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-blue-600 text-white px-3.5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-white shrink-0" />
                <span className="truncate">جاري حفظ وتحميل الملفات في الذاكرة المركزية... ({saveProgress}%)</span>
              </div>
              <div className="w-full sm:w-48 h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div className="h-full bg-white rounded-full" style={{ width: `${saveProgress}%` }} />
              </div>
            </motion.div>
          )}

          {isAnalyzingActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-gradient-to-r from-amber-500 via-primary to-indigo-600 text-white px-3.5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold shadow-inner overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1 bg-white/20 rounded-lg animate-pulse shrink-0">
                  <Sparkles className="h-4 w-4 text-amber-200" />
                </div>
                <div className="min-w-0 truncate">
                  <span className="font-black">بدء التحليل الذكي:</span>{' '}
                  <span className="text-white/90">
                    "{currentlyAnalyzingFileName || 'الملفات'}"
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <span className="text-white/90 font-mono text-[11px] shrink-0">{overallAnalysisProgress}%</span>
                <div className="flex-1 sm:w-48 h-2 bg-white/20 rounded-full overflow-hidden border border-white/20">
                  <motion.div
                    className="h-full bg-amber-300 rounded-full"
                    animate={{ width: `${overallAnalysisProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. Main Workspace Area: FilePreviewList (Pre-Analysis) + Split View */}
        {stagedFiles.length > 0 && fileList.length > stagedFiles.length && (
          <div className="px-3 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <FilePreviewList
              files={stagedFiles}
              onRemoveFile={id => setFileList(prev => prev.filter(f => f.id !== id))}
              onClearAll={() => setFileList(prev => prev.filter(f => f.status !== 'staged'))}
              onAddMore={() => fileInputRef.current?.click()}
              onStartAnalysis={handleStartComprehensiveAnalysis}
              isAnalyzing={isUploadingAndSaving || isAnalyzingActive}
              title="ملفات جديدة مضافة قبل بدء التحليل"
              maxHeightClass="max-h-36"
            />
          </div>
        )}

        {fileList.length === 0 ? (
          // Empty State: Drag & Drop Dropzone
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 min-h-0 overflow-y-auto adaptive-scroll-region flex flex-col items-center justify-center p-5 sm:p-14 text-center cursor-pointer transition-all m-3 sm:m-6 rounded-[1.5rem] sm:rounded-[2rem] border-4 border-dashed ${
              isDragging
                ? 'border-primary bg-primary/5 scale-99'
                : 'border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:bg-slate-50/50'
            }`}
          >
            <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 sm:mb-6 shadow-inner shrink-0">
              <Upload className="h-8 w-8 sm:h-10 sm:w-10 animate-bounce" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">
              اسحب وأفلت الملفات هنا، أو انقر للاختيار
            </h3>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-8">
              يدعم المركز كشوفات إكسل (XLSX, CSV)، مستندات PDF، وصور الوثائق والجوازات.
              ستظهر قائمة الملفات المختارة للمراجعة والحذف الفردي قبل بدء التحليل الشامل.
            </p>

            <Button size="lg" className="rounded-2xl px-8 font-black gap-2 shadow-lg shadow-primary/20">
              <FolderOpen className="h-5 w-5" />
              <span>تصفح واختيار الملفات من جهازك</span>
            </Button>
          </div>
        ) : stagedFiles.length === fileList.length && !isUploadingAndSaving && !isAnalyzingActive ? (
          // Dedicated Pre-Analysis Staging Screen using FilePreviewList
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-3.5 sm:p-6 bg-slate-50/60 dark:bg-slate-900/50 space-y-4"
          >
            <FilePreviewList
              files={stagedFiles}
              selectedFileId={selectedFileId}
              onSelectFile={id => setSelectedFileId(id)}
              onRemoveFile={id => {
                setFileList(prev => {
                  const next = prev.filter(f => f.id !== id);
                  if (selectedFileId === id) {
                    setSelectedFileId(next.length > 0 ? next[0].id : null);
                  }
                  return next;
                });
              }}
              onClearAll={() => {
                setFileList([]);
                setSelectedFileId(null);
              }}
              onAddMore={() => fileInputRef.current?.click()}
              onStartAnalysis={handleStartComprehensiveAnalysis}
              isAnalyzing={isUploadingAndSaving || isAnalyzingActive}
              title="قائمة الملفات المختارة قبل بدء التحليل الشامل"
              variant="panel"
              maxHeightClass="max-h-[45dvh]"
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Mobile Pane Switcher (visible < md only) */}
            <div className="md:hidden px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMobilePane('preview')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                  mobilePane === 'preview'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                <span>البيانات والمعاينة ({selectedFile?.recordsCount ?? totalExtractedRecords})</span>
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('files')}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                  mobilePane === 'files'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>قائمة الملفات ({fileList.length})</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              {/* Right Pane: Uploaded File List Sidebar */}
              <div
                className={`${
                  mobilePane === 'files' ? 'flex flex-1 min-h-0' : 'hidden'
                } md:flex md:flex-initial md:w-80 lg:w-96 border-l border-slate-200 dark:border-slate-800 flex-col bg-slate-50/70 dark:bg-slate-900/40 md:shrink-0 min-h-0`}
              >
                {/* Search & Filter Header */}
                <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h4 className="font-black text-slate-800 dark:text-slate-100 text-sm">
                      الملفات المحملة ({fileList.length})
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs font-bold text-primary gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>إضافة</span>
                  </Button>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="بحث في أسماء الملفات..."
                    className="w-full pl-3 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-primary font-medium"
                  />
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      filterType === 'all'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    الكل ({fileList.length})
                  </button>
                  <button
                    onClick={() => setFilterType('ready')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      filterType === 'ready'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    جاهز ({readyFilesCount})
                  </button>
                  <button
                    onClick={() => setFilterType('pending')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      filterType === 'pending'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    قيد المعالجة ({fileList.filter(f => f.status === 'pending' || f.status === 'analyzing').length})
                  </button>
                </div>
              </div>

              {/* Scrollable List of Uploaded Files */}
              <div className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-3 space-y-2">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">لا توجد ملفات مطابقة</div>
                ) : (
                  filteredFiles.map(item => {
                    const isSelected = selectedFileId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedFileId(item.id);
                          setMobilePane('preview');
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'bg-white dark:bg-slate-800 border-primary shadow-md ring-2 ring-primary/10'
                            : item.status === 'ready'
                            ? 'bg-white/80 dark:bg-slate-800/80 border-slate-200 hover:border-primary/40'
                            : item.status === 'analyzing'
                            ? 'bg-primary/5 border-primary/30 animate-pulse'
                            : item.status === 'error'
                            ? 'bg-rose-50/50 border-rose-200'
                            : 'bg-white/60 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* File Type Icon */}
                          <div className={`p-2 rounded-xl shrink-0 ${
                            item.type === 'excel'
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50'
                              : item.type === 'pdf'
                              ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50'
                              : 'bg-blue-100 text-blue-600 dark:bg-blue-950/50'
                          }`}>
                            {item.type === 'excel' ? <FileSpreadsheet className="h-4 w-4" /> :
                             item.type === 'pdf' ? <FileText className="h-4 w-4" /> :
                             <ImageIcon className="h-4 w-4" />}
                          </div>

                          {/* File Meta */}
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-xs truncate block text-slate-800 dark:text-slate-100" title={item.name}>
                              {item.name}
                            </span>

                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {/* Visual Status Indicators Required by User */}
                              {item.status === 'uploading' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                  <span>جاري الحفظ...</span>
                                </span>
                              ) : item.status === 'pending' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300">
                                  <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span>في انتظار التحليل</span>
                                </span>
                              ) : item.status === 'analyzing' ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 ring-2 ring-blue-400/30 animate-pulse">
                                  <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />
                                  <span>يتم التحليل الآن ({item.analysisProgress}%)</span>
                                </span>
                              ) : item.status === 'ready' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span>تم اكتمال التحليل</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertCircle className="h-3 w-3 text-rose-600 shrink-0" />
                                  <span>تعذر التحليل</span>
                                </span>
                              )}

                              {/* Security Scan Result Badge */}
                              {item.securityScan && (
                                item.securityScan.status === 'threat_detected' ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white shadow-2xs" title={item.securityScan.summary}>
                                    <ShieldAlert className="h-2.5 w-2.5" />
                                    <span>تنبيه أمني</span>
                                  </span>
                                ) : item.securityScan.status === 'warning' ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-white shadow-2xs" title={item.securityScan.summary}>
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    <span>اشتباه تزوير</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="تم الفحص: سليم ومبرأ">
                                    <ShieldCheck className="h-2.5 w-2.5 text-emerald-600" />
                                    <span>سليم أمنياً</span>
                                  </span>
                                )
                              )}

                              {/* Target Module Badge */}
                              {item.suggestedModule && item.status === 'ready' && (
                                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                  {item.suggestedModule}
                                </span>
                              )}

                              {item.recordsCount !== undefined && item.recordsCount > 0 && (
                                <span className="text-[10px] text-slate-400 font-medium">
                                  • {item.recordsCount} سجل
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Delete File Button — Always visible on touch devices */}
                          <button
                            onClick={e => handleRemoveFile(e, item.id)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all shrink-0"
                            title="حذف الملف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Progress Bar for analyzing file */}
                        {item.status === 'analyzing' && (
                          <div className="mt-2.5 h-1 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${item.analysisProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom sidebar actions */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-bold">
                  {readyFilesCount} من أصل {fileList.length} ملفات جاهزة
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFileList([])}
                  className="text-rose-600 hover:bg-rose-50 text-[11px] font-bold h-7"
                >
                  تفريغ القائمة
                </Button>
              </div>
            </div>

            {/* Left Pane: Mode Switcher (Insight View vs Multi-File Pattern Analytics View) */}
            <div
              className={`${
                mobilePane === 'preview' ? 'flex' : 'hidden'
              } md:flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-white dark:bg-slate-900`}
            >
              {/* Mode Tabs Header */}
              <div className="px-3 sm:px-5 py-2 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
                  <button
                    onClick={() => setViewMode('insights')}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all ${
                      viewMode === 'insights'
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <BrainCircuit className="h-3.5 w-3.5" />
                    <span>الملخص والاقتراحات</span>
                  </button>

                  <button
                    onClick={() => setViewMode('review')}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all ${
                      viewMode === 'review'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-50 border border-amber-200 dark:border-slate-700'
                    }`}
                  >
                    <ClipboardEdit className="h-3.5 w-3.5" />
                    <span>معاينة ومراجعة قبل الحفظ ({selectedFile?.recordsCount ?? totalExtractedRecords})</span>
                  </button>

                  <button
                    onClick={() => setViewMode('patterns')}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all ${
                      viewMode === 'patterns'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-amber-300" />
                    <span>تحليلات الأنماط والتكرار</span>
                  </button>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                  {readyFilesCount > 0 && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                      {readyFilesCount} ملفات جاهزة
                    </Badge>
                  )}
                </div>
              </div>

              {/* View Content */}
              {viewMode === 'insights' ? (
                <InsightSuggestionView
                  selectedFile={selectedFile}
                  onUpdateCategory={handleUpdateCategory}
                  onOpenSmartMapping={file => handleOpenSmartMapping(file)}
                  onOpenReviewStage={file => {
                    setSelectedFileId(file.id);
                    setViewMode('review');
                    setMobilePane('preview');
                  }}
                  onInstantImport={handleInstantImport}
                  onReanalyze={handleReanalyze}
                  onStartStagedAnalysis={handleStartComprehensiveAnalysis}
                  onTeachInstruction={handleTeachInstruction}
                  customInstructions={customInstructions}
                  onDeleteInstruction={handleDeleteInstruction}
                />
              ) : viewMode === 'review' ? (
                <ImportPreviewReviewPane
                  selectedFile={selectedFile}
                  onUpdateRecords={handleUpdateFileRecords}
                  onCleanCustomPhrase={handleCleanCustomPhrase}
                  onApproveAndSaveFile={handleInstantImport}
                  onBackToInsights={() => setViewMode('insights')}
                  isSaving={isDistributing}
                />
              ) : (
                <ImportAnalyticsPatternsView
                  files={fileList}
                  onSelectFile={id => {
                    setSelectedFileId(id);
                    setViewMode('insights');
                    setMobilePane('preview');
                  }}
                />
              )}
            </div>
            </div>
          </div>
        )}

        {/* 4. Bottom Footer Bar with Always-Visible Global Actions */}
        <div className="px-3 py-2.5 sm:px-6 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-xs border border-emerald-200 shrink-0 font-mono tabular-nums">
              {stagedFiles.length > 0 && readyFilesCount === 0 ? stagedFiles.length : readyFilesCount}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                {isDistributing
                  ? `جاري دمج وحفظ السجلات بدون تهنيج (${currentlyAnalyzingFileName || 'الدفعة'})...`
                  : stagedFiles.length > 0
                  ? `في قائمة الانتظار قبل التحليل: ${stagedFiles.length} ملف`
                  : `جاهز للاستيراد: ${readyFilesCount} ملف (${totalExtractedRecords.toLocaleString()} سجل مكتشف)`}
              </p>
              <p className="hidden sm:block text-[10px] text-slate-400">
                يتم دمج ومطابقة البيانات تلقائياً لمنع التكرار (SmartMerge)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
            {stagedFiles.length > 0 && (
              <Button
                disabled={isUploadingAndSaving || isAnalyzingActive || isDistributing}
                onClick={handleStartComprehensiveAnalysis}
                className="flex-1 sm:flex-initial rounded-xl font-black text-[11px] sm:text-xs px-3 sm:px-5 h-9 bg-primary hover:bg-primary/90 text-white shadow-md gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>بدء التحليل الشامل ({stagedFiles.length})</span>
              </Button>
            )}
            {readyFilesCount > 0 && viewMode !== 'review' && (
              <Button
                variant="outline"
                disabled={isAnalyzingActive || isDistributing}
                onClick={() => {
                  if (!selectedFileId) {
                    const firstReady = fileList.find(f => f.status === 'ready');
                    if (firstReady) setSelectedFileId(firstReady.id);
                  }
                  setViewMode('review');
                  setMobilePane('preview');
                }}
                className="rounded-xl font-bold text-[11px] sm:text-xs px-2.5 sm:px-4 h-9 gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                title="مراجعة وتعديل الأسماء والتواريخ قبل الحفظ"
              >
                <ClipboardEdit className="h-3.5 w-3.5 text-amber-700" />
                <span>معاينة ومراجعة</span>
              </Button>
            )}
            <Button
              disabled={readyFilesCount === 0 || isAnalyzingActive || isDistributing}
              onClick={handleImportAllReady}
              className="flex-1 sm:flex-initial rounded-xl font-black text-[11px] sm:text-xs px-3 sm:px-5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5 whitespace-nowrap"
            >
              {isDistributing ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
              <span>{isDistributing ? 'جاري التوزيع والحفظ...' : `اعتماد وحفظ الكل (${totalExtractedRecords.toLocaleString()})`}</span>
              {!isDistributing && <ArrowRight className="h-3.5 w-3.5 shrink-0" />}
            </Button>

            <Button
              variant="outline"
              disabled={readyFilesCount === 0 || isDistributing}
              onClick={() => handleOpenSmartMapping()}
              className="rounded-xl font-bold text-[11px] sm:text-xs px-2.5 sm:px-4 h-9 gap-1 border-slate-300"
              title="المطابقة الشاملة للأعمدة (SmartMapping)"
            >
              <Filter className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">مطابقة الأعمدة (SmartMapping)</span>
              <span className="sm:hidden">مطابقة</span>
            </Button>

            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-xl font-bold text-[11px] sm:text-xs px-3 sm:px-4 h-9"
            >
              إغلاق
            </Button>
          </div>
        </div>
      </motion.div>

      {/* SmartMappingDialog Modal */}
      <SmartMappingDialog
        isOpen={smartMappingOpen}
        onClose={() => setSmartMappingOpen(false)}
        filesData={batchDataToMap}
        onConfirmImport={handleConfirmMapping}
      />
    </div>
  );
};
