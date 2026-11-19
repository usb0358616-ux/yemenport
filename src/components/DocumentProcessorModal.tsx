import { useState, useRef, useEffect } from 'react';
import { Traveler } from '@/lib/types';
import {
  generateId,
  saveTravelers,
  getSeizures,
  saveSeizures,
  getMigrants,
  saveMigrants,
  getRefugees,
  saveRefugees,
  getForeigners,
  saveForeigners,
  addAuditLog,
  smartMergeTraveler
} from '@/lib/storage';
import {
  PassportSeizure,
  UndocumentedMigrant,
  RefugeeRecord,
  ForeignerResident
} from '@/lib/types';
import {
  parseExcelLocally,
  parsePdfLocally,
  reconcileWithDatabase,
  ReconciliationRecord,
  ExtractedTravelerData
} from '@/lib/localDocumentParser';
import {
  mergeAdditionalInfo,
  SovereignDepartment,
  detectSuggestedDepartment
} from '@/lib/smartFieldMatcher';
import {
  parseImageDocument,
  ATTACHED_IMAGE_SAMPLES
} from '@/lib/imageDocumentParser';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { openUnifiedImport, mapDepartmentToUnifiedCategory } from '@/lib/unifiedImportHub';
import {
  FileSpreadsheet,
  FileText,
  UploadCloud,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  Users,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Download,
  Info,
  Sparkles,
  Image as ImageIcon,
  CheckCircle,
  Camera,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface DocumentProcessorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTravelers: Traveler[];
  onDataUpdated: (updatedList: Traveler[]) => void;
  defaultDestination?: 'travelers' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'mofa_visas';
  onDepartmentUpdated?: () => void;
}

export function DocumentProcessorModal({
  open,
  onOpenChange,
  currentTravelers,
  onDataUpdated,
  defaultDestination = 'travelers',
  onDepartmentUpdated
}: DocumentProcessorModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'new' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [targetDestination, setTargetDestination] = useState<
    'travelers' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'mofa_visas' | 'permits' | 'reports'
  >(defaultDestination as any);
  const [detectedInfo, setDetectedInfo] = useState<{
    department: 'travelers' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'mofa_visas' | 'permits' | 'reports';
    reason: string;
    label: string;
  } | null>(null);
  const [dismissMismatchWarning, setDismissMismatchWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (defaultDestination) {
      setTargetDestination(defaultDestination);
    }
    setDismissMismatchWarning(false);
  }, [defaultDestination, open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    if (files.length > 1) {
      openUnifiedImport({
        category: mapDepartmentToUnifiedCategory(targetDestination),
        files,
        sourceTitle: 'معالجة وتوزيع الكشوفات'
      });
      e.target.value = '';
      onOpenChange(false);
      return;
    }
    await processFile(files[0]);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsProcessing(true);
    setRecords([]);
    setDetectedInfo(null);
    setDismissMismatchWarning(false);

    try {
      const fileName = selectedFile.name.toLowerCase();
      let extracted: ExtractedTravelerData[] = [];

      // 1. فحص نوع الملف (Excel أو PDF أو صورة أو كشف)
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        extracted = await parseExcelLocally(selectedFile);
      } else if (fileName.endsWith('.pdf')) {
        extracted = await parsePdfLocally(selectedFile);
      } else if (
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.jpeg') ||
        fileName.endsWith('.png') ||
        fileName.endsWith('.webp')
      ) {
        // استخراج البيانات من الصور (جوازات سفر، محاضر ضبط)
        const imgResult = await parseImageDocument(selectedFile);
        if (imgResult.docType === 'seizure_memo' && imgResult.seizureData) {
          extracted = imgResult.seizureData.passports.map((p, idx) => ({
            firstName: p.travelerName.split(' ')[0] || 'مسافر',
            secondName: p.travelerName.split(' ')[1] || '',
            thirdName: p.travelerName.split(' ')[2] || '',
            lastName: p.travelerName.split(' ').slice(3).join(' ') || '',
            idNumber: p.passportNumber,
            idType: 'جواز',
            country: p.nationality || 'اليمن',
            center: imgResult.seizureData?.seizurePort || 'نقطة يسلح',
            receiveDate: imgResult.seizureData?.seizureDate || new Date().toISOString().split('T')[0],
            governorate: p.issueGovernorate || 'تعز',
            investigatingOfficer: 'استخبارات الشرطة - الحزام الأمني',
            vettingResult: imgResult.seizureData?.reason || 'محضر ضبط جوازات',
            status: 'مضبوط',
            travelAllowed: 'لا',
            additionalInfo: `محضر رسمي: ${imgResult.seizureData?.recordNumber} | السائق: ${imgResult.seizureData?.driverName} | المركبة: ${imgResult.seizureData?.carPlate} | المسار: ${imgResult.seizureData?.direction}`,
            rawSource: selectedFile.name,
            detectedDepartment: 'seizures' as const,
            detectionReason: 'محضر ضبط رسمي صادر من استخبارات الشرطة'
          }));
        } else if (imgResult.travelerData) {
          extracted = [
            {
              ...imgResult.travelerData,
              rawSource: selectedFile.name,
              detectedDepartment: imgResult.suggestedDepartment,
              detectionReason: imgResult.docTypeLabel
            }
          ];
        }
      } else {
        toast({
          title: 'صيغة ملف غير مدعومة',
          description: 'يرجى اختيار ملف Excel (.xlsx, .xls) أو ملف PDF (.pdf) أو صورة وثيقة سفر (.jpg, .png)',
          variant: 'destructive'
        });
        setIsProcessing(false);
        return;
      }

      if (extracted.length === 0) {
        toast({
          title: 'لم يتم العثور على سجلات',
          description: 'تأكد من أن الملف أو الصورة تحتوي على نصوص أو أرقام وثائق واضحة.',
          variant: 'destructive'
        });
        setIsProcessing(false);
        return;
      }

      // 2. التحليل الذكي وتصنيف محتوى الملف (مسافرين، أجانب، تأشيرات، ضبط، لاجئين، مهاجرين)
      const detection = detectSuggestedDepartment(extracted, selectedFile.name);
      if (detection.suggestedDepartment !== targetDestination) {
        setDetectedInfo({
          department: detection.suggestedDepartment,
          reason: detection.reason,
          label: detection.label
        });
      } else {
        setDetectedInfo(null);
      }

      // 3. المطابقة التلقائية مع قاعدة البيانات المحلية (Smart Reconcile)
      const reconciled = reconcileWithDatabase(extracted, currentTravelers);
      setRecords(reconciled);

      const matchedCount = reconciled.filter(r => r.status === 'matched').length;
      const newCount = reconciled.filter(r => r.status === 'new').length;

      toast({
        title: 'تم استخراج وتحليل البيانات بنجاح',
        description: `تم استخراج ${reconciled.length} سجلاً (${newCount} جديد، ${matchedCount} مطابق لقاعدة البيانات الحالية)`
      });
    } catch (err: any) {
      console.error('Error processing file:', err);
      toast({
        title: 'حدث خطأ أثناء معالجة الملف',
        description: err?.message || 'تعذر استخراج البيانات من الملف محلياً.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // اختيار عينة من النماذج الـ 8 المرفقة
  const handleSelectPreloadedSample = async (sample: typeof ATTACHED_IMAGE_SAMPLES[0]) => {
    setIsProcessing(true);
    try {
      const resp = await fetch(sample.url);
      const blob = await resp.blob();
      const sampleFile = new File([blob], sample.filename, { type: 'image/jpeg' });
      await processFile(sampleFile);
    } catch (err) {
      console.error('Error loading sample image:', err);
      toast({
        title: 'خطأ في تحميل النموذج',
        description: 'تعذر جلب ملف النموذج، يرجى المحاولة مجدداً.',
        variant: 'destructive'
      });
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const toggleSelectRecord = (tempId: string) => {
    setRecords(prev =>
      prev.map(r => (r.tempId === tempId ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectAll = (select: boolean) => {
    setRecords(prev => prev.map(r => ({ ...r, selected: select })));
  };

  // تطبيق الاستيراد مع دمج ميزة SmartMerge التلقائية
  const applyImport = (targetStatus: 'all' | 'new_only' | 'matched_only') => {
    const selectedRecords = records.filter(r => {
      if (!r.selected) return false;
      if (targetStatus === 'new_only') return r.status === 'new';
      if (targetStatus === 'matched_only') return r.status === 'matched';
      return true;
    });

    if (selectedRecords.length === 0) {
      toast({
        title: 'تنبيه',
        description: 'يرجى تحديد سجل واحد على الأقل للتطبيق.',
        variant: 'destructive'
      });
      return;
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const sourceLabel = file ? file.name : 'استيراد ذكي';

    // 1. التوجيه إلى سجل الوافدين الأجانب (Foreigners)
    if (targetDestination === 'foreigners') {
      const existingForeigners = getForeigners();
      let addedForeigners = 0;
      let updatedForeigners = 0;

      selectedRecords.forEach((rec, i) => {
        const idNum = (rec.data.idNumber || '').trim().toUpperCase();
        const existing = existingForeigners.find(f => f.passportNumber.trim().toUpperCase() === idNum);

        if (existing) {
          // SmartMerge: تحديث الحقول الناقصة وتدوين الملاحظة دون تكرار
          if (!existing.employer && rec.data.agency) existing.employer = rec.data.agency;
          if (!existing.profession && rec.data.visitReason) existing.profession = rec.data.visitReason;
          existing.notes = `${existing.notes || ''}\n[تحديث SmartMerge - ${today}]: تم مطابقة وتحديث بيانات الإقامة من (${sourceLabel})`;
          existing.updatedAt = now;
          updatedForeigners++;
        } else {
          existingForeigners.unshift({
            id: generateId(),
            residenceNumber: `إقامة-2026-${String(existingForeigners.length + i + 1).padStart(4, '0')}`,
            fullName: `${rec.data.firstName} ${rec.data.secondName || ''} ${rec.data.thirdName || ''} ${rec.data.lastName || ''}`.trim(),
            passportNumber: rec.data.idNumber || 'P0000000',
            nationality: rec.data.country || 'أجنبي',
            employer: rec.data.agency || 'منشأة معتمدة',
            profession: rec.data.visitReason || 'مهني / مستثمر',
            entryDate: rec.data.receiveDate || today,
            entryPort: rec.data.center || 'مطار صنعاء الدولي',
            residenceExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            medicalExamResult: 'لائق طبياً',
            reEntryVisaStatus: 'سارية',
            securityClearanceStatus: 'معتمد',
            notes: `[إضافة SmartMerge أولى - ${today}]: تم الاستيراد من ${sourceLabel}`,
            createdAt: now,
            updatedAt: now
          });
          addedForeigners++;
        }
      });

      saveForeigners(existingForeigners);
      addAuditLog('استيراد كشف', 'الوافدون الأجانب', `استيراد ودمج ذكي للوافدين الأجانب (${addedForeigners} جديد، ${updatedForeigners} محدث) من ${sourceLabel}`);
      toast({
        title: 'تم إيداع البيانات في سجل الوافدين الأجانب (SmartMerge)',
        description: `تم إضافة ${addedForeigners} مقيم جديد وتحديث ${updatedForeigners} مقيم موجود دون تكرار.`
      });
      onDepartmentUpdated?.();
      onOpenChange(false);
      return;
    }

    // 2. التوجيه إلى محاضر الجوازات المضبوطة (Seizures)
    if (targetDestination === 'seizures') {
      const existingSeizures = getSeizures();
      let addedSeizures = 0;
      let updatedSeizures = 0;

      selectedRecords.forEach((rec, i) => {
        const idNum = (rec.data.idNumber || '').trim();
        const existing = existingSeizures.find(s => s.passportNumber.trim() === idNum);

        if (existing) {
          existing.notes = `${existing.notes || ''}\n[تحديث SmartMerge - ${today}]: تم التحريز وتأكيد حالة الضبط من ${sourceLabel}`;
          existing.updatedAt = now;
          updatedSeizures++;
        } else {
          existingSeizures.unshift({
            id: generateId(),
            recordNumber: `محضر-2026-${String(existingSeizures.length + i + 1).padStart(4, '0')}`,
            travelerName: `${rec.data.firstName} ${rec.data.secondName || ''} ${rec.data.lastName || ''}`.trim(),
            passportNumber: rec.data.idNumber || 'غير محدد',
            nationality: rec.data.country || 'اليمن',
            seizurePort: rec.data.center || 'نقطة يسلح الأمنية',
            seizureDate: rec.data.receiveDate || today,
            officerInCharge: rec.data.investigatingOfficer || 'استخبارات الشرطة - الحزام الأمني',
            reason: rec.data.vettingResult || 'محضر ضبط جوازات سفر مخالفة للتوجيهات',
            status: 'جديد',
            referredTo: 'فرع استخبارات الشرطة',
            referralDate: today,
            referralNotes: `تم الاستيراد والتحريز آلياً من ${sourceLabel} | ${rec.data.additionalInfo || ''}`,
            createdAt: now,
            updatedAt: now
          });
          addedSeizures++;
        }
      });

      saveSeizures(existingSeizures);
      addAuditLog('استيراد كشف', 'المضبوطات والجوازات', `استيراد ودمج ${addedSeizures} محضر ضبط جديد و ${updatedSeizures} تحديث من ${sourceLabel}`);
      toast({
        title: 'تم إيداع المضبوطات في وحدة الجوازات المحتجزة (SmartMerge)',
        description: `تم قيد ${addedSeizures} محضر ضبط جديد وتحديث ${updatedSeizures} محضر مسبق.`
      });
      onDepartmentUpdated?.();
      onOpenChange(false);
      return;
    }

    // 3. التوجيه إلى اللاجئين (Refugees)
    if (targetDestination === 'refugees') {
      const existingRefugees = getRefugees();
      const newRefugees: RefugeeRecord[] = selectedRecords.map((rec, i) => ({
        id: generateId(),
        unhcrNumber: `UNHCR-YEM-${rec.data.idNumber || String(Math.floor(100000 + Math.random() * 900000))}`,
        temporaryPermitNumber: `تصريح-لجوء-2026-${String(existingRefugees.length + i + 1).padStart(3, '0')}`,
        fullName: `${rec.data.firstName} ${rec.data.secondName || ''} ${rec.data.lastName || ''}`.trim(),
        nationality: rec.data.country || 'صومالي',
        arrivalDate: rec.data.receiveDate || today,
        familyMembersCount: 1,
        securityVettingStatus: 'مبرأ ومطابق',
        vettingOfficer: rec.data.investigatingOfficer || 'ضابط شؤون اللاجئين',
        permitStatus: 'ساري',
        permitExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        qrVerificationCode: `REF:UNHCR:${rec.data.idNumber}:${rec.data.firstName}`,
        residentialAddress: rec.data.governorate || 'أمانة العاصمة',
        phone: rec.data.phone || '',
        createdAt: now,
        updatedAt: now
      }));
      saveRefugees([...newRefugees, ...existingRefugees]);
      addAuditLog('استيراد كشف', 'اللاجئون', `استيراد وإيداع ${newRefugees.length} ملف لاجئ من ${sourceLabel}`);
      toast({
        title: 'تم استيراد الكشف وإيداعه في وحدة شؤون اللاجئين',
        description: `تم قيد ${newRefugees.length} لاجئ بنجاح.`
      });
      onDepartmentUpdated?.();
      onOpenChange(false);
      return;
    }

    // 4. التوجيه إلى المهاجرين (Migrants)
    if (targetDestination === 'migrants') {
      const existingMigrants = getMigrants();
      const newMigrants: UndocumentedMigrant[] = selectedRecords.map((rec, i) => ({
        id: generateId(),
        fileNumber: `هجرة-2026-${String(existingMigrants.length + i + 1).padStart(4, '0')}`,
        fullName: `${rec.data.firstName} ${rec.data.secondName || ''} ${rec.data.lastName || ''}`.trim(),
        nationality: rec.data.country || 'إثيوبيا',
        countryOfOrigin: rec.data.country || 'إثيوبيا',
        infiltrationPoint: rec.data.center || 'شريط الساحل التهامي',
        apprehensionDate: rec.data.receiveDate || today,
        apprehensionPlace: rec.data.governorate || 'منطقة ساحلية',
        gender: 'ذكر',
        approximateAge: rec.data.age || 28,
        medicalCheckStatus: 'سليم',
        fingerprintRegistered: true,
        shelterCenter: 'مركز الإيواء المؤقت المركزي',
        deportationStatus: 'قيد الإيواء والتحقيق',
        notes: `تم الاستيراد آلياً من ${sourceLabel} | ${rec.data.additionalInfo || ''}`,
        createdAt: now,
        updatedAt: now
      }));
      saveMigrants([...newMigrants, ...existingMigrants]);
      addAuditLog('استيراد كشف', 'المهاجرون غير الشرعيين', `استيراد وإيداع ${newMigrants.length} ملف مهاجر غير نظامي من ${sourceLabel}`);
      toast({
        title: 'تم استيراد الكشف وإيداعه في وحدة الهجرة غير الشرعية',
        description: `تم قيد ${newMigrants.length} ملف مهاجر غير شرعي.`
      });
      onDepartmentUpdated?.();
      onOpenChange(false);
      return;
    }

    // 5. التوجيه الافتراضي: سجل المسافرين وحركة المنافذ (Travelers) مع SmartMerge الكامل
    const updatedList = [...currentTravelers];
    let addedCount = 0;
    let updatedCount = 0;

    for (const rec of selectedRecords) {
      if (rec.status === 'new') {
        const newTraveler: Traveler = {
          id: generateId(),
          firstName: rec.data.firstName || 'مسافر',
          secondName: rec.data.secondName || '',
          thirdName: rec.data.thirdName || '',
          fourthName: rec.data.fourthName || '',
          lastName: rec.data.lastName || '',
          age: rec.data.age || 0,
          idNumber: rec.data.idNumber,
          idType: rec.data.idType || 'جواز',
          country: rec.data.country || 'اليمن',
          governorate: rec.data.governorate || '',
          phone: rec.data.phone || '',
          vettingResult: rec.data.vettingResult || '',
          vettingResult1: rec.data.vettingResult1,
          vettingResult2: rec.data.vettingResult2,
          vettingResult3: rec.data.vettingResult3,
          vettingResult4: rec.data.vettingResult4,
          destination: rec.data.destination || '',
          visitReason: rec.data.visitReason || '',
          visaType: rec.data.visaType || '',
          center: rec.data.center || '',
          agency: rec.data.agency || '',
          receiveDate: rec.data.receiveDate || '',
          travelAllowed: rec.data.travelAllowed || 'نعم',
          status: rec.data.status || 'معتمد',
          returnReason: rec.data.returnReason || '',
          investigatingOfficer: rec.data.investigatingOfficer || '',
          requestNumber: rec.data.requestNumber || '',
          additionalInfo: `[استيراد ذكي: ${today} من ${sourceLabel}]: ${rec.data.additionalInfo || 'قيد أولي'}`,
          createdAt: now,
          updatedAt: now
        };
        updatedList.unshift(newTraveler);
        addedCount++;
      } else if (rec.status === 'matched' && rec.existingTraveler) {
        const targetIndex = updatedList.findIndex(t => t.id === rec.existingTraveler!.id);
        if (targetIndex !== -1) {
          const current = updatedList[targetIndex];
          // تطبيق دالة SmartMerge المركزية لمنع التكرار وتحديث الحقول الناقصة وتاريخ التحديث
          const { merged } = smartMergeTraveler(current, rec.data, sourceLabel);
          updatedList[targetIndex] = merged;
          updatedCount++;
        }
      }
    }

    saveTravelers(updatedList);
    onDataUpdated(updatedList);
    addAuditLog('استيراد كشف', 'المسافرين', `دمج واستيراد ذكي (SmartMerge) لكشف المسافرين (${addedCount} جديد، ${updatedCount} مدمج ومحدث) من ${sourceLabel}`);

    toast({
      title: 'تم اعتماد وتطبيق البيانات بنجاح عبر SmartMerge',
      description: `تمت إضافة ${addedCount} مسافر جديد ودمج بيانات ${updatedCount} مسافر مسجل مسبقاً دون أي تكرار.`
    });

    onDepartmentUpdated?.();
    onOpenChange(false);
  };

  // Export reconciliation report to Excel
  const exportReconciliationReport = () => {
    if (records.length === 0) return;
    const exportData = records.map(r => ({
      'الحالة في النظام': r.status === 'new' ? 'مسافر جديد' : `مطابق لـ: ${r.existingTraveler?.firstName} ${r.existingTraveler?.lastName}`,
      'الاسم الكامل': `${r.data.firstName} ${r.data.secondName || ''} ${r.data.thirdName || ''} ${r.data.lastName || ''}`.trim(),
      'رقم الوثيقة': r.data.idNumber,
      'نوع الوثيقة': r.data.idType,
      'الجنسية': r.data.country,
      'الوجهة': r.data.destination,
      'المركز': r.data.center,
      'الوكالة': r.data.agency,
      'قرار السفر': r.data.travelAllowed,
      'حالة السفر': r.data.status,
      'تاريخ الاستلام': r.data.receiveDate,
      'نتائج المباينة': r.data.vettingResult,
      'مصدر الاستخراج': r.data.rawSource || 'الملف المرفوع'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير المعالجة والمطابقة');
    XLSX.writeFile(wb, `تقرير_معالجة_الملفات_${Date.now()}.xlsx`);
  };

  // Filtered list
  const filteredRecords = records.filter(r => {
    if (filterType === 'new' && r.status !== 'new') return false;
    if (filterType === 'matched' && r.status !== 'matched') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = `${r.data.firstName} ${r.data.secondName || ''} ${r.data.lastName || ''}`.toLowerCase();
      const id = (r.data.idNumber || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    }
    return true;
  });

  const matchedTotal = records.filter(r => r.status === 'matched').length;
  const newTotal = records.filter(r => r.status === 'new').length;
  const selectedCount = records.filter(r => r.selected).length;

  const getDepartmentLabel = (dep: string) => {
    switch (dep) {
      case 'foreigners': return 'وحدة الوافدين والإقامات الأجانب';
      case 'refugees': return 'وحدة شؤون اللاجئين (UNHCR)';
      case 'migrants': return 'وحدة قضايا الهجرة غير الشرعية';
      case 'seizures': return 'وحدة محاضر الضبط والجوازات المحتجزة';
      case 'mofa_visas': return 'مذكرات وتأشيرات الخارجية والمنظمات';
      default: return 'سجل المسافرين وحركة المنافذ';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] flex flex-col p-0 overflow-hidden text-right font-sans" dir="rtl">
        {/* Header */}
        <DialogHeader className="p-3.5 sm:p-5 border-b bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-xl font-extrabold flex flex-wrap items-center gap-2">
                  <span>المعالج الذكي للكشوفات والصور ومذكرات PDF (SmartMerge)</span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] sm:text-xs">
                    فرز وتصنيف ذكي 100%
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  استخراج الأسماء والجوازات من جداول Excel و PDF وصور الوثائق والمحاضر، مع ميزة الدمج الذكي (SmartMerge) والتوجيه الآلي للأقسام.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Body Container */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-3.5 sm:p-5 space-y-5">
          {/* File Upload Zone */}
          {records.length === 0 ? (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-primary/30 hover:border-primary/60 bg-muted/10 hover:bg-muted/20 transition-all rounded-2xl p-8 text-center flex flex-col items-center justify-center cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx, .xls, .csv, .pdf, .jpg, .jpeg, .png, .webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                
                <div className="flex items-center gap-3 mb-4 group-hover:scale-105 transition-transform">
                  <div className="w-13 h-13 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shadow-xs">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div className="w-13 h-13 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center shadow-xs">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="w-13 h-13 rounded-2xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shadow-xs">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-foreground mb-1">
                  اسحب وأفلت ملف Excel أو PDF أو صورة وثيقة سفر / محضر ضبط هنا
                </h3>
                <p className="text-xs text-muted-foreground max-w-lg mb-4 leading-relaxed">
                  يدعم كشوفات المسافرين، مذكرات الخارجية، محاضر الضبط الأمني، وصور الجوازات بصيغ Excel (.xlsx, .xls, .csv)، ملفات PDF (.pdf)، وصور الوثائق (.jpg, .png).
                </p>

                <Button
                  type="button"
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      جاري التحليل واستخراج البيانات...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4" />
                      اختيار ملف أو صورة من جهازك
                    </>
                  )}
                </Button>
              </div>

              {/* Attached Images Gallery - One Click Analysis */}
              {ATTACHED_IMAGE_SAMPLES.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-primary" />
                    معرض صور الجوازات والمحاضر الأمنية المرفقة ({ATTACHED_IMAGE_SAMPLES.length} صور للاستخراج الفوري):
                  </h4>
                  <span className="text-[11px] text-slate-500">انقر للتحليل الفوري بنقرة واحدة</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto p-1">
                  {ATTACHED_IMAGE_SAMPLES.map((sample, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectPreloadedSample(sample)}
                      className="p-3 rounded-xl border border-slate-200 hover:border-primary/60 hover:bg-slate-50/80 cursor-pointer transition-all flex items-start gap-3 bg-white shadow-2xs"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                        <img
                          src={sample.url}
                          alt={sample.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h5 className="font-bold text-xs text-slate-900 truncate">{sample.name}</h5>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 bg-slate-50 font-normal">
                            {sample.tag}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {sample.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          ) : (
            /* Uploaded File Banner & Statistics */
            <div className="space-y-4">
              {/* SMART DEPARTMENT MISMATCH ALERT & ONE-CLICK ROUTING BANNER */}
              {detectedInfo && detectedInfo.department !== targetDestination && !dismissMismatchWarning && (
                <div className="p-4 bg-amber-500/10 border-2 border-amber-500/50 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300 mt-0.5 shrink-0">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-amber-950 dark:text-amber-100">
                          تنبيه الفحص الذكي: عدم تطابق محتوى الملف مع القسم المختار
                        </h4>
                        <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px]">توجيه سيادي ذكي</Badge>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-200 mt-1 leading-relaxed">
                        بناءً على الكلمات الدلالية والأعمدة المكتشفة، هذا الملف يتبع قسم <strong className="underline underline-offset-4 font-bold">{detectedInfo.label}</strong>، بينما القسم الحالي المختار هو <strong className="underline underline-offset-4 font-bold">{getDepartmentLabel(targetDestination)}</strong>.
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        السبب: {detectedInfo.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                      onClick={() => {
                        setTargetDestination(detectedInfo.department);
                        toast({
                          title: 'تم تحويل وجهة الاستيراد بنجاح',
                          description: `تم توجيه الاستيراد تلقائياً إلى [${detectedInfo.label}]`,
                        });
                      }}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      تحويل الوجهة إلى {detectedInfo.label}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-amber-900 border-amber-300 bg-white hover:bg-amber-100"
                      onClick={() => setDismissMismatchWarning(true)}
                    >
                      متابعة في القسم الحالي
                    </Button>
                  </div>
                </div>
              )}

              {/* Sovereign Destination Selector */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-700" />
                    توجيه وإيداع الكشف إلى الوحدة السيادية المناسبة:
                  </span>
                  <p className="text-[11px] text-indigo-800/80 mt-0.5">
                    اختر المكان المناسب لإيداع السجلات المستخرجة (حركة المسافرين، الجوازات المضبوطة، المهاجرون، اللاجئون، أو الوافدون الأجانب).
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <Select
                    value={targetDestination}
                    onValueChange={(val: any) => setTargetDestination(val)}
                  >
                    <SelectTrigger className="bg-white border-indigo-300 font-bold text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="travelers">1. سجل المسافرين وحركة المنافذ</SelectItem>
                      <SelectItem value="seizures">2. محاضر الضبط والجوازات المحتجزة</SelectItem>
                      <SelectItem value="foreigners">3. الوافدون الأجانب والإقامات</SelectItem>
                      <SelectItem value="migrants">4. المهاجرون غير الشرعيين</SelectItem>
                      <SelectItem value="refugees">5. شؤون اللاجئين وتصاريح (UNHCR)</SelectItem>
                      <SelectItem value="mofa_visas">6. مذكرات وتأشيرات الخارجية والمنظمات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-muted/40 border rounded-xl">
                <div className="flex items-center gap-2.5">
                  {file?.name.toLowerCase().endsWith('.pdf') ? (
                    <FileText className="h-5 w-5 text-rose-600" />
                  ) : file?.name.toLowerCase().endsWith('.jpg') || file?.name.toLowerCase().endsWith('.png') ? (
                    <ImageIcon className="h-5 w-5 text-blue-600" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  )}
                  <div>
                    <span className="font-bold text-sm block">{file?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      الحجم: {file ? `${(file.size / 1024).toFixed(1)} KB` : ''} • تم استخراج {records.length} سجل
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRecords([]);
                      setFile(null);
                      setDetectedInfo(null);
                    }}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    تحميل ملف أو صورة أخرى
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportReconciliationReport}
                    className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    تصدير تقرير المطابقة
                  </Button>
                </div>
              </div>

              {/* Statistics & Filters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setFilterType('all')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterType === 'all'
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-muted hover:border-primary/40 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">إجمالي السجلات المستخرجة</span>
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xl font-bold mt-1">{records.length}</div>
                </div>

                <div
                  onClick={() => setFilterType('new')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterType === 'new'
                      ? 'border-emerald-500 bg-emerald-500/5 shadow-xs'
                      : 'border-muted hover:border-emerald-500/40 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">سجلات جديدة (غير مسجلة)</span>
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{newTotal}</div>
                </div>

                <div
                  onClick={() => setFilterType('matched')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterType === 'matched'
                      ? 'border-blue-500 bg-blue-500/5 shadow-xs'
                      : 'border-muted hover:border-blue-500/40 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">سجلات مطابقة (تحديث SmartMerge)</span>
                    <RefreshCw className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-bold text-blue-600 mt-1">{matchedTotal}</div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="relative w-full sm:w-72">
                  <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الأسماء أو أرقام الجوازات..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pr-9 h-9 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAll(true)}
                    className="text-xs h-8"
                  >
                    تحديد الكل ({records.length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAll(false)}
                    className="text-xs h-8"
                  >
                    إلغاء التحديد
                  </Button>
                </div>
              </div>

              {/* Records List / Table */}
              <div className="border rounded-xl overflow-hidden bg-card divide-y max-h-[40dvh] overflow-y-auto adaptive-scroll-region">
                {filteredRecords.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    لا توجد سجلات تطابق البحث أو الفلتر المحدد.
                  </div>
                ) : (
                  filteredRecords.map(rec => (
                    <div
                      key={rec.tempId}
                      className={`p-3 sm:p-3.5 transition-colors ${
                        rec.selected ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={rec.selected}
                            onChange={() => toggleSelectRecord(rec.tempId)}
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer shrink-0 mt-1 sm:mt-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-sm text-foreground break-words">
                                {rec.data.firstName} {rec.data.secondName || ''} {rec.data.thirdName || ''} {rec.data.lastName || ''}
                              </span>
                              {rec.status === 'matched' ? (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] py-0">
                                  مسجل مسبقاً (دمج SmartMerge)
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] py-0">
                                  سجل جديد
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                              <span>الجواز / الهوية: <strong className="font-mono text-foreground">{rec.data.idNumber}</strong></span>
                              <span>الجنسية: <strong>{rec.data.country || 'اليمن'}</strong></span>
                              {rec.data.destination && <span>الوجهة: {rec.data.destination}</span>}
                              {rec.data.center && <span>المنفذ: {rec.data.center}</span>}
                              {rec.data.phone && <span>الهاتف: {rec.data.phone}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedId(expandedId === rec.tempId ? null : rec.tempId)}
                            className="text-xs h-8 px-3 w-full sm:w-auto"
                          >
                            {expandedId === rec.tempId ? 'إخفاء التفاصيل' : 'عرض المطابقة'}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Comparison Drawer for Matched Records */}
                      {expandedId === rec.tempId && (
                        <div className="mt-3 p-3 bg-muted/40 rounded-lg border text-xs space-y-2">
                          {rec.status === 'matched' && rec.existingTraveler ? (
                            <div>
                              <span className="font-bold text-foreground block mb-1">
                                مقارنة السجل المستورد مع بيانات السجل الحالي:
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                <div className="p-2 bg-background rounded border">
                                  <span className="text-muted-foreground block">السجل الحالي بالنظام:</span>
                                  <div>الاسم: {rec.existingTraveler.firstName} {rec.existingTraveler.lastName}</div>
                                  <div>الجواز: {rec.existingTraveler.idNumber}</div>
                                  <div>الهاتف: {rec.existingTraveler.phone || 'غير مسجل'}</div>
                                  <div>معلومات إضافية: {rec.existingTraveler.additionalInfo || 'لا يوجد'}</div>
                                </div>
                                <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200">
                                  <span className="text-blue-700 dark:text-blue-300 block font-bold">البيانات الواردة بالملف:</span>
                                  <div>الاسم: {rec.data.firstName} {rec.data.lastName}</div>
                                  <div>الهاتف: {rec.data.phone || 'غير وارد'}</div>
                                  <div>الوجهة: {rec.data.destination || 'غير وارد'}</div>
                                  <div>الملاحظات: {rec.data.additionalInfo || 'لا يوجد'}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-muted-foreground">هذا الشخص غير مسجل في قاعدة البيانات وسيتم إضافته كقيد جديد.</span>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                مصدر الاستخراج: {rec.data.rawSource}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions — Pinned Always Visible */}
        {records.length > 0 ? (
          <div className="p-3 sm:p-4 border-t bg-muted/30 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 z-10">
            <div className="text-xs text-muted-foreground">
              تم تحديد <strong className="text-foreground font-mono">{selectedCount}</strong> من أصل {records.length} سجل للتطبيق في <strong className="text-primary">{getDepartmentLabel(targetDestination)}</strong>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs flex-1 sm:flex-initial"
              >
                إلغاء
              </Button>
              <Button
                size="sm"
                onClick={() => applyImport('matched_only')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 flex-1 sm:flex-initial"
                disabled={selectedCount === 0 || matchedTotal === 0}
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span>تحديث المطابقين ({matchedTotal})</span>
              </Button>
              <Button
                size="sm"
                onClick={() => applyImport('new_only')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 flex-1 sm:flex-initial"
                disabled={selectedCount === 0 || newTotal === 0}
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span>إضافة الجدد ({newTotal})</span>
              </Button>
              <Button
                size="sm"
                onClick={() => applyImport('all')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow w-full sm:w-auto"
                disabled={selectedCount === 0}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>اعتماد وتطبيق الكل SmartMerge ({selectedCount})</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 sm:p-4 border-t bg-muted/30 shrink-0 flex items-center justify-end gap-2 z-10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs w-full sm:w-auto"
            >
              إغلاق
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
