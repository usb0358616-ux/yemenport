import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Traveler, Report, PortOfficer, MonitoredCompany } from '@/lib/types';
import {
  getTravelers,
  saveTravelers,
  generateId,
  normalizeArabic,
  cleanArabicText,
  getReports,
  saveReports,
  repairAndMigrateTravelers,
  extractStructuredDataFromNotes,
  getPortOfficers,
  getDefaultOfficerName,
  smartAddOrUpdateTraveler,
  getMonitoredCompanies,
  findOrCreateTravelAgency,
  inferGovernorateFromCenter,
  isMeaningfulAgencyName,
  addAuditLog,
  getCurrentUser
} from '@/lib/storage';
import { hasPermission } from '@/lib/rbac';
import { verifyOcrPassportAgainstWatchlist } from '@/lib/ocrWatchlistGuard';
import { ImageOCRProcessor } from '@/components/ImageOCRProcessor';
import { MlKitVisionResult } from '@/services/mlKitPassportSimulator';
import { YEMEN_GOVERNORATES, COUNTRIES, ID_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Printer, Trash2, AlertCircle, Link as LinkIcon, FileText, Globe, User, MapPin, Download, Save, Image as ImageIcon, FileJson, Sparkles, Cloud, Camera, LayoutGrid, TableProperties, Eye, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Fingerprint, ScanLine, Stamp, Wrench, CheckCircle2, ShieldCheck, BadgeCheck, Building2, Calendar, Tag } from 'lucide-react';
import { GoogleWorkspacePortal } from '@/components/GoogleWorkspacePortal';
import { CameraScanner } from '@/components/CameraScanner';
import { OfficialPrintReport } from '@/components/OfficialPrintReport';
import { BiometricEnrollmentModal } from '@/components/BiometricEnrollmentModal';
import { QRCodeCanvas } from 'qrcode.react';
import { DeleteConfirmation } from '@/components/DeleteConfirmation';
import { WatchlistAlertModal } from '@/components/WatchlistAlertModal';
import { exportToExcel, exportToPDF, exportToImage, exportToWord, handlePrint } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifySovereignDataUpdated, SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { ImportButtonWithPreview } from '@/components/FilePreviewList';
import {
  lookupPersonByPassportOrId,
  validatePassportAndDates,
  checkDuplicateEntry,
  checkLiveWatchlistMatch,
  getAgencyClearanceWarning,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  compressImageFileToDataUrl,
  PersonLookupResult
} from '@/lib/formIntelligence';
import {
  DraftRecoveryBanner,
  LiveFormAlertsBanner,
  SearchableCombobox,
  StructuredAttachmentsField,
  handleEnterAdvanceFocus
} from '@/components/SmartFormControls';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';

export function getTravelerDisplayName(t: Traveler): string {
  const parts = [t.firstName, t.secondName, t.thirdName, t.fourthName, t.lastName].filter(Boolean);
  const full = parts.join(' ').trim();
  if (full && full !== 'مسافر' && full !== 'غير معروف' && full !== 'غير محدد') {
    return full;
  }
  if (t.passportName && t.passportName.trim()) {
    return t.passportName.trim();
  }
  if (t.additionalInfo) {
    const extracted = extractStructuredDataFromNotes(t.additionalInfo);
    if (extracted.passportName) return extracted.passportName;
  }
  return full || `مسافر (${t.idNumber || 'غير محدد'})`;
}

const emptyTraveler = (): Partial<Traveler> => ({
  serialNumber: '',
  firstName: '', secondName: '', thirdName: '', fourthName: '', lastName: '',
  passportName: '', passportStatus: 'صالح', profession: '', placeOfIssue: '',
  issueDate: '', expiryDate: '', birthDate: '', gender: 'ذكر', nationalId: '',
  age: 0, idNumber: '', idType: 'جواز', country: 'اليمن', governorate: '',
  phone: '', vettingResult: '', destination: '', visitReason: '',
  investigatingOfficer: getDefaultOfficerName(), travelAllowed: 'نعم',
  center: localStorage.getItem('config_centerName') || 'المركز الرئيسي - العاصمة صنعاء',
  agency: '', agencyId: '',
  receiveDate: '', exitDate: '', status: '', returnReason: '', visaType: '',
  additionalInfo: '',
});

const Travelers = () => {
  const [travelers, setTravelers] = useState(getTravelers);
  const [companies, setCompanies] = useState<MonitoredCompany[]>(getMonitoredCompanies);
  const [registeredOfficers, setRegisteredOfficers] = useState<PortOfficer[]>([]);
  const [googlePortalOpen, setGooglePortalOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Traveler | null>(null);
  const [form, setForm] = useState<Partial<Traveler>>(emptyTraveler());
  const [search, setSearch] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [watchlistMatch, setWatchlistMatch] = useState<string | null>(null);
  const [watchlistAlertModal, setWatchlistAlertModal] = useState<{
    isOpen: boolean;
    travelerName: string;
    idNumber: string;
    matchedReportTitle: string;
  }>({
    isOpen: false,
    travelerName: '',
    idNumber: '',
    matchedReportTitle: ''
  });
  const [viewingTraveler, setViewingTraveler] = useState<Traveler | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [newReportDialogOpen, setNewReportDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [travelerToDelete, setTravelerToDelete] = useState<string | null>(null);
  const [newReportForm, setNewReportForm] = useState({ title: '', description: '', type: 'عام' });
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [biometricTargetTraveler, setBiometricTargetTraveler] = useState<Traveler | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50; // Maximum 50 persons per page
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [printableTraveler, setPrintableTraveler] = useState<Traveler | null>(null);
  const [filters, setFilters] = useState({
    country: 'الكل',
    travelAllowed: 'الكل',
    agency: 'الكل',
    visaType: 'الكل',
    visaStatus: 'الكل',
    startDate: '',
    endDate: ''
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pendingTravelerDraft, setPendingTravelerDraft] = useState<{ data: Partial<Traveler>; savedAt: string } | null>(null);

  // Smart Data Repair & Extraction Dialog state
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairResult, setRepairResult] = useState<{ totalRepaired: number; totalTravelers: number; details: string[] } | null>(null);

  const handleRunDataRepair = () => {
    const res = repairAndMigrateTravelers();
    setRepairResult({
      totalRepaired: res.totalRepaired,
      totalTravelers: res.totalTravelers,
      details: res.repairedDetails
    });
    setTravelers(getTravelers());
    setRepairModalOpen(true);
    if (res.totalRepaired > 0) {
      toast({
        title: 'تم إصلاح وفصل البيانات بنجاح',
        description: `تم استخراج أسماء الجوازات وحالاتها وتوزيعها على الحقول الرسمية لـ ${res.totalRepaired} مسافر.`,
      });
    } else {
      toast({
        title: 'جميع البيانات مفروزة ومطابقة',
        description: `تم فحص ${res.totalTravelers} مسافر، وجميع أسماء الجوازات وبياناتها مسجلة بحقولها الصحيحة.`,
      });
    }
  };

  const currentUser = getCurrentUser();
  const canDeleteTraveler = hasPermission(currentUser, 'delete_traveler');
  const canApproveTravelBan = hasPermission(currentUser, 'approve_travel_ban');
  const canExportData = hasPermission(currentUser, 'export_data');

  const handleMlKitPassportExtracted = (mlResult: MlKitVisionResult) => {
    const ef = mlResult.extractedFields;
    const hit = mlResult.watchlistVerification;

    setForm(prev => ({
      ...prev,
      firstName: ef.firstName || prev.firstName,
      secondName: ef.secondName || prev.secondName,
      thirdName: ef.thirdName || prev.thirdName,
      fourthName: ef.fourthName || prev.fourthName,
      lastName: ef.lastName || prev.lastName,
      passportName: ef.passportName || prev.passportName,
      idNumber: ef.passportNumber || prev.idNumber,
      idType: ef.idType || prev.idType || 'جواز',
      birthDate: ef.birthDate || prev.birthDate,
      age: ef.age || prev.age || 0,
      country: ef.nationality || prev.country || 'اليمن',
      governorate: ef.governorate || prev.governorate,
      gender: ef.gender || prev.gender || 'ذكر',
      profession: ef.profession || prev.profession,
      placeOfIssue: ef.placeOfIssue || prev.placeOfIssue,
      issueDate: ef.issueDate || prev.issueDate,
      expiryDate: ef.expiryDate || prev.expiryDate,
      photoUrl: mlResult.photoDataUrl || prev.photoUrl,
      vettingResult: hit.matched
        ? `تطابق أمني عبر ML Kit OCR (${hit.alertSource}): ${hit.matchedRecordTitle}`
        : prev.vettingResult,
      travelAllowed: hit.matched && canApproveTravelBan ? 'لا' : prev.travelAllowed
    }));

    if (mlResult.photoDataUrl) {
      setPhotoPreview(mlResult.photoDataUrl);
    }

    if (hit.matched) {
      setWatchlistMatch(hit.matchedRecordTitle || 'تطابق أمني');
      setWatchlistAlertModal({
        isOpen: true,
        travelerName: ef.fullName || ef.passportName || 'مسافر قيد الفحص',
        idNumber: ef.passportNumber || '',
        matchedReportTitle: hit.matchedRecordTitle || 'قائمة المطلوبين أمنياً'
      });
    } else {
      const checkName = ef.fullName || `${ef.firstName} ${ef.lastName}`.trim();
      if (checkName || ef.passportNumber) {
        checkWatchlist(checkName, ef.passportNumber, true);
      }
    }
  };

  const handleCameraScanComplete = (extractedData: Partial<Traveler>, photoDataUrl: string) => {
    const fullName = [
      extractedData.firstName,
      extractedData.secondName,
      extractedData.thirdName,
      extractedData.fourthName,
      extractedData.lastName
    ].filter(Boolean).join(' ');
    if (fullName || extractedData.idNumber) checkWatchlist(fullName, extractedData.idNumber, true);

    setEditing(null);
    setForm(prev => ({
      ...prev,
      ...extractedData,
      photoUrl: photoDataUrl
    }));
    setPhotoPreview(photoDataUrl);
    setOpen(true);
    toast({
      title: 'تم مسح الوثيقة بنجاح',
      description: 'تم استخراج البيانات وملء النموذج تلقائياً بواسطة الكاميرا'
    });
  };

  const handleOpenBiometrics = (t: Traveler, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setBiometricTargetTraveler(t);
    setBiometricModalOpen(true);
  };

  const handleSaveBiometrics = (updatedBiometrics: NonNullable<Traveler['biometrics']>) => {
    if (!biometricTargetTraveler) return;
    const now = new Date().toISOString();
    const updated = travelers.map(t => {
      if (t.id === biometricTargetTraveler.id) {
        return {
          ...t,
          biometrics: updatedBiometrics,
          updatedAt: now,
        };
      }
      return t;
    });

    saveTravelers(updated);
    setTravelers(updated);

    if (viewingTraveler && viewingTraveler.id === biometricTargetTraveler.id) {
      setViewingTraveler({
        ...viewingTraveler,
        biometrics: updatedBiometrics,
        updatedAt: now,
      });
    }

    toast({
      title: 'تم حفظ البيانات البيومترية بنجاح',
      description: `تم تحديث بصمة الإصبع ومسح الوجه للمسافر ${biometricTargetTraveler.firstName} ${biometricTargetTraveler.lastName}`,
    });
  };

  const handleOfficialPrint = (t?: Traveler | null) => {
    const target = t || viewingTraveler;
    if (!target) return;
    setPrintableTraveler(target);
    // Give state a tick to update the print template
    setTimeout(() => {
      window.print();
    }, 150);
  };

  useEffect(() => {
    setRegisteredOfficers(getPortOfficers());
    const handleUpdated = () => {
      setTravelers(getTravelers());
      setCompanies(getMonitoredCompanies());
    };
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
  }, []);

  useEffect(() => {
    const q = searchParams.get('search');
    const agencyParam = searchParams.get('agency');
    if (q) setSearch(q);
    if (agencyParam) {
      setFilters(prev => ({ ...prev, agency: agencyParam }));
    }
  }, [searchParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  // Auto-save new traveler draft while modal is open
  useEffect(() => {
    if (!open || editing) return;
    if (form.firstName || form.idNumber || form.passportName || form.agency) {
      saveFormDraft('traveler_new_v1', form);
    }
  }, [open, editing, form]);

  // Live form intelligence checks
  const personLookupMatch = useMemo(() => {
    if (!open || editing || !form.idNumber) return null;
    return lookupPersonByPassportOrId(form.idNumber);
  }, [open, editing, form.idNumber]);

  const duplicateTravelerCheck = useMemo(() => {
    if (!open || !form.idNumber) return { isDuplicate: false };
    return checkDuplicateEntry('traveler', form.idNumber, editing?.id);
  }, [open, form.idNumber, editing?.id]);

  const liveWatchlistCheck = useMemo(() => {
    if (!open) return { matched: false };
    const fullN = [form.firstName, form.secondName, form.lastName].filter(Boolean).join(' ') || form.passportName || '';
    return checkLiveWatchlistMatch(form.idNumber || '', fullN);
  }, [open, form.idNumber, form.firstName, form.secondName, form.lastName, form.passportName]);

  const passportDatesValidation = useMemo(() => {
    if (!open) return null;
    return validatePassportAndDates({
      idNumber: form.idNumber,
      issueDate: form.issueDate,
      expiryDate: form.expiryDate,
      birthDate: form.birthDate
    });
  }, [open, form.idNumber, form.issueDate, form.expiryDate, form.birthDate]);

  const agencySecurityWarning = useMemo(() => {
    if (!form.agency) return { isBlocked: false };
    return getAgencyClearanceWarning(form.agency);
  }, [form.agency]);

  const applyLookupAutoFill = (match: PersonLookupResult) => {
    setForm((prev) => ({
      ...prev,
      firstName: prev.firstName || match.firstName,
      secondName: prev.secondName || match.secondName,
      thirdName: prev.thirdName || match.thirdName,
      fourthName: prev.fourthName || match.fourthName,
      lastName: prev.lastName || match.lastName,
      country: match.country || prev.country,
      governorate: match.governorate || prev.governorate,
      phone: prev.phone || match.phone,
      age: prev.age || match.age || 0,
      profession: prev.profession || match.profession || '',
      issueDate: prev.issueDate || match.issueDate || '',
      expiryDate: prev.expiryDate || match.expiryDate || '',
      placeOfIssue: prev.placeOfIssue || match.placeOfIssue || ''
    }));
    toast({
      title: 'تمت التعبئة التلقائية',
      description: `تم سحب البيانات السابقة من سجل (${match.sourceModule})`
    });
  };

  useEffect(() => {
    if (id) {
      const traveler = travelers.find(t => t.id === id);
      if (traveler) {
        setViewingTraveler(traveler);
      } else {
        toast({ title: 'خطأ', description: 'المسافر غير موجود', variant: 'destructive' });
        navigate('/', { replace: true });
      }
    } else {
      setViewingTraveler(null);
    }
  }, [id, travelers, navigate, toast]);

  const checkWatchlist = (name: string, idNum?: string, showModal: boolean = false) => {
    const cleanName = (name || '').trim();
    const cleanId = (idNum || '').trim();
    if (cleanName.length < 3 && cleanId.length < 4) {
      setWatchlistMatch(null);
      return null;
    }
    const reports = getReports();
    const normName = normalizeArabic(cleanName);
    const match = reports.find(r => {
      const matchByName = normName.length >= 3 && (normalizeArabic(r.title).includes(normName) || normalizeArabic(r.description).includes(normName));
      const matchById = cleanId.length >= 4 && (r.title.includes(cleanId) || r.description.includes(cleanId));
      return matchByName || matchById;
    });
    if (match) {
      setWatchlistMatch(match.title);
      if (showModal) {
        setWatchlistAlertModal({
          isOpen: true,
          travelerName: cleanName || 'مسافر قيد الفحص',
          idNumber: cleanId || form.idNumber || '',
          matchedReportTitle: match.title
        });
      }
      return match;
    } else {
      setWatchlistMatch(null);
      return null;
    }
  };

  const f = (key: keyof Traveler, value: string | number) => {
    if (key === 'travelAllowed' && value === 'لا' && !canApproveTravelBan) {
      toast({
        title: 'صلاحية مقيدة',
        description: 'إصدار قرار المنع من السفر مقتصر على المشرفين وضباط التحقيق والمناوبين.',
        variant: 'destructive'
      });
      return;
    }

    if (key === 'birthDate' && typeof value === 'string') {
      let computedAge = form.age || 0;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const bDate = new Date(value);
        if (!isNaN(bDate.getTime())) {
          const today = new Date();
          let calc = today.getFullYear() - bDate.getFullYear();
          const m = today.getMonth() - bDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) calc--;
          if (calc >= 0 && calc < 120) computedAge = calc;
        }
      }
      setForm({ ...form, birthDate: value, age: computedAge });
      return;
    }

    setForm({ ...form, [key]: value });
    if (key === 'firstName' || key === 'lastName' || key === 'idNumber') {
      const fullName = `${key === 'firstName' ? value : form.firstName || ''} ${key === 'lastName' ? value : form.lastName || ''}`.trim();
      const idVal = key === 'idNumber' ? String(value) : (form.idNumber || '');
      checkWatchlist(fullName, idVal, key === 'idNumber' && idVal.length >= 5);
    }
  };

  const save = () => {
    // إذا كان الاسم الأول غير محدد ولكن اسم الجواز مدخل، نقوم بتجزئة اسم الجواز تلقائياً
    const updatedForm = { ...form };
    if ((!updatedForm.firstName || updatedForm.firstName === 'مسافر') && updatedForm.passportName) {
      const parts = cleanArabicText(updatedForm.passportName).split(/\s+/).filter(Boolean);
      updatedForm.firstName = parts[0] || 'مسافر';
      updatedForm.lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      const middle = parts.slice(1, -1);
      updatedForm.secondName = middle[0] || '';
      updatedForm.thirdName = middle[1] || '';
      updatedForm.fourthName = middle[2] || '';
    }

    if (!updatedForm.firstName || !updatedForm.idNumber) {
      toast({ title: 'خطأ', description: 'الاسم (أو اسم الجواز) ورقم الوثيقة مطلوبان', variant: 'destructive' });
      return;
    }

    // توحيد وتنظيف حقول التأشيرة والوكالة وتاريخ الخروج
    const dateVal = updatedForm.exitDate || updatedForm.receiveDate || '';
    updatedForm.exitDate = dateVal;
    updatedForm.receiveDate = dateVal;
    if (updatedForm.visaType && !updatedForm.visitReason) {
      updatedForm.visitReason = updatedForm.visaType;
    } else if (updatedForm.visitReason && !updatedForm.visaType) {
      updatedForm.visaType = updatedForm.visitReason;
    }
    if (updatedForm.status) updatedForm.status = cleanArabicText(updatedForm.status);
    if (updatedForm.returnReason) updatedForm.returnReason = cleanArabicText(updatedForm.returnReason);
    if (updatedForm.center) {
      updatedForm.center = cleanArabicText(updatedForm.center);
      if (!updatedForm.governorate) {
        updatedForm.governorate = inferGovernorateFromCenter(updatedForm.center);
      }
    }

    if (updatedForm.agency && isMeaningfulAgencyName(updatedForm.agency)) {
      const linkedComp = findOrCreateTravelAgency(
        updatedForm.agency,
        updatedForm.center || updatedForm.governorate
      );
      if (linkedComp) {
        updatedForm.agency = linkedComp.companyName;
        updatedForm.agencyId = linkedComp.id;
      }
    }

    const fullNameCheck = [
      updatedForm.firstName,
      updatedForm.secondName,
      updatedForm.thirdName,
      updatedForm.fourthName,
      updatedForm.lastName
    ].filter(Boolean).join(' ');
    const matchedReport = checkWatchlist(fullNameCheck, updatedForm.idNumber, true);
    const unifiedGuardHit = verifyOcrPassportAgainstWatchlist({
      fullName: fullNameCheck,
      fullNameEnglish: updatedForm.passportName,
      passportNumber: updatedForm.idNumber,
      birthDate: updatedForm.birthDate,
      sourceType: 'manual_entry',
      sourceLabel: editing ? 'تحديث سجل مسافر' : 'قيد مسافر جديد',
      emitDashboardAlert: true
    });

    if (matchedReport || unifiedGuardHit.matched) {
      updatedForm.travelAllowed = 'لا';
      updatedForm.vettingResult =
        matchedReport
          ? `تطابق مع بلاغ ضبط: ${matchedReport.title}`
          : `تطابق مع ${unifiedGuardHit.alertSource}: ${unifiedGuardHit.matchedRecordTitle}`;
    }

    if (editing) {
      const now = new Date().toISOString();
      const updated = travelers.map(t => t.id === editing.id ? { ...t, ...updatedForm, updatedAt: now } as Traveler : t);
      saveTravelers(updated);
      setTravelers(updated);
      addAuditLog(
        'تعديل',
        'المسافرين',
        `تعديل بيانات المسافر (${fullNameCheck || updatedForm.firstName}) - جواز/وثيقة: ${updatedForm.idNumber}`,
        editing.id
      );
      toast({ title: 'تم حفظ التعديلات وتحديث البيانات وربط الوكالة بنجاح' });
    } else {
      const result = smartAddOrUpdateTraveler(updatedForm, 'الإدخال اليدوي المباشر / OCR');
      setTravelers(getTravelers());
      addAuditLog(
        'إنشاء',
        'المسافرين',
        `${result.isNew ? 'تسجيل مسافر جديد' : 'تحديث مدمج SmartMerge'} (${fullNameCheck || updatedForm.firstName}) - وثيقة: ${updatedForm.idNumber}`
      );
      toast({
        title: result.isNew ? 'تم تسجيل المسافر الجديد' : 'دمج ذكي (SmartMerge)',
        description: result.message
      });
    }

    setCompanies(getMonitoredCompanies());
    notifySovereignDataUpdated('traveler');
    notifySovereignDataUpdated('companies');
    if (!editing) {
      clearFormDraft('traveler_new_v1');
    }
    setOpen(false);
    setForm(emptyTraveler());
    setEditing(null);
  };

  const deleteTraveler = (id: string) => {
    if (!canDeleteTraveler) {
      toast({
        title: 'صلاحية مقيدة',
        description: 'لا تملك صلاحية حذف سجلات المسافرين — يرجى مراجعة المشرف أو المدير العام.',
        variant: 'destructive'
      });
      return;
    }
    setTravelerToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!travelerToDelete || !canDeleteTraveler) return;
    const victim = travelers.find(t => t.id === travelerToDelete);
    const updated = travelers.filter(t => t.id !== travelerToDelete);
    saveTravelers(updated);
    setTravelers(updated);
    addAuditLog(
      'حذف',
      'المسافرين',
      `حذف سجل المسافر (${victim ? `${victim.firstName} ${victim.lastName || ''}`.trim() : travelerToDelete}) - وثيقة: ${victim?.idNumber || '-'}`,
      travelerToDelete
    );
    setDeleteConfirmOpen(false);
    setTravelerToDelete(null);
    toast({ title: 'تم الحذف وتوثيق العملية في سجل التدقيق' });
  };

  const linkReport = (reportId: string) => {
    if (!viewingTraveler) return;
    const updatedTravelers = travelers.map(t => {
      if (t.id === viewingTraveler.id) {
        const linkedIds = t.linkedReportIds || [];
        if (linkedIds.includes(reportId)) return t;
        return { ...t, linkedReportIds: [...linkedIds, reportId] };
      }
      return t;
    });
    saveTravelers(updatedTravelers);
    setTravelers(updatedTravelers);
    setViewingTraveler(updatedTravelers.find(t => t.id === viewingTraveler.id) || null);
    setLinkDialogOpen(false);
    toast({ title: 'تم ربط البلاغ' });
  };

  const createAndLinkReport = () => {
    if (!viewingTraveler || !newReportForm.title) return;
    const reports = getReports();
    const newReportId = generateId();
    const now = new Date().toISOString();
    const newReport: Report = {
      title: newReportForm.title || '',
      description: newReportForm.description || '',
      type: newReportForm.type || 'عام',
      id: newReportId,
      status: 'جديد',
      linkedTravelerIds: [viewingTraveler.id],
      createdAt: now,
      updatedAt: now
    };
    saveReports([...reports, newReport]);
    
    const updatedTravelers = travelers.map(t => {
      if (t.id === viewingTraveler.id) {
        return { ...t, linkedReportIds: [...(t.linkedReportIds || []), newReportId] };
      }
      return t;
    });
    saveTravelers(updatedTravelers);
    setTravelers(updatedTravelers);
    setViewingTraveler(updatedTravelers.find(t => t.id === viewingTraveler.id) || null);
    setNewReportDialogOpen(false);
    setNewReportForm({ title: '', description: '', type: 'عام' });
    toast({ title: 'تم إنشاء وربط البلاغ' });
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = await compressImageFileToDataUrl(file, 640, 0.78);
      setPhotoPreview(url);
      setForm({ ...form, photoUrl: url });
    }
  };




  const travelAgencyOptions = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach(c => {
      if (isMeaningfulAgencyName(c.companyName)) {
        map.set(normalizeArabic(c.companyName), c.companyName);
      }
    });
    travelers.forEach(t => {
      if (isMeaningfulAgencyName(t.agency)) {
        const key = normalizeArabic(t.agency!);
        if (!map.has(key)) map.set(key, cleanArabicText(t.agency!));
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [companies, travelers]);

  const visaTypeOptions = useMemo(() => {
    const set = new Set<string>();
    travelers.forEach(t => {
      const vt = cleanArabicText(t.visaType || '');
      if (vt && vt !== '-') set.add(vt);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [travelers]);

  const filtered = useMemo(() => travelers.filter(t => {
    const normSearch = normalizeArabic(search);
    const fullName = normalizeArabic(`${t.firstName} ${t.secondName} ${t.thirdName} ${t.fourthName} ${t.lastName} ${t.passportName || ''}`);
    const matchesSearch =
      !search ||
      fullName.includes(normSearch) ||
      normalizeArabic(t.idNumber).includes(normSearch) ||
      normalizeArabic(t.agency || '').includes(normSearch) ||
      normalizeArabic(t.returnReason || '').includes(normSearch);

    const matchesCountry = filters.country === 'الكل' || t.country === filters.country;
    const matchesTravel = filters.travelAllowed === 'الكل' || t.travelAllowed === filters.travelAllowed;

    const matchesAgency =
      filters.agency === 'الكل' ||
      normalizeArabic(t.agency || '') === normalizeArabic(filters.agency);

    const tVisa = cleanArabicText(t.visaType || t.visitReason || '');
    const matchesVisaType =
      filters.visaType === 'الكل' ||
      normalizeArabic(tVisa) === normalizeArabic(filters.visaType);

    const tStatus = cleanArabicText(t.status || '');
    const matchesVisaStatus =
      filters.visaStatus === 'الكل' ||
      normalizeArabic(tStatus) === normalizeArabic(filters.visaStatus);

    let matchesDate = true;
    if (filters.startDate || filters.endDate) {
      const dateStr = t.exitDate || t.receiveDate;
      const travelDate = dateStr ? new Date(dateStr) : null;
      if (travelDate && !isNaN(travelDate.getTime())) {
        if (filters.startDate && travelDate < new Date(filters.startDate)) matchesDate = false;
        if (filters.endDate && travelDate > new Date(filters.endDate)) matchesDate = false;
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesCountry && matchesTravel && matchesAgency && matchesVisaType && matchesVisaStatus && matchesDate;
  }), [travelers, search, filters]);

  const visaStats = useMemo(() => {
    let issuedCount = 0;
    let returnedCount = 0;
    const agencyKeys = new Set<string>();
    filtered.forEach(t => {
      const st = cleanArabicText(t.status || '');
      if (st.includes('مرتجع')) returnedCount++;
      else if (st.includes('مؤشر')) issuedCount++;
      if (isMeaningfulAgencyName(t.agency)) {
        agencyKeys.add(normalizeArabic(t.agency!));
      }
    });
    return {
      issuedCount,
      returnedCount,
      linkedAgenciesCount: agencyKeys.size
    };
  }, [filtered]);

  // Pagination calculation - 50 travelers maximum per page
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedTravelers = filtered.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (activePage > 3) pages.push('...');
      const start = Math.max(2, activePage - 1);
      const end = Math.min(totalPages - 1, activePage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (activePage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const openEdit = (t: Traveler) => {
    setEditing(t);
    setForm(t);
    setPhotoPreview(t.photoUrl || '');
    setPendingTravelerDraft(null);
    setOpen(true);
  };

  const openEditFromView = (t: Traveler) => {
    setViewingTraveler(null);
    navigate('/');
    setTimeout(() => {
      openEdit(t);
    }, 100);
  };

  const printTraveler = (t: Traveler) => {
    handleOfficialPrint(t);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">المسافرين</h1>
        <div className="flex gap-2 flex-wrap">
          {canExportData && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" /> تصدير الكشف
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" dir="rtl">
                <DropdownMenuItem onClick={() => exportToExcel(filtered, 'كشف_المسافرين')}>
                  <FileJson className="h-4 w-4 ml-2 text-green-600" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToPDF('travelers-table', 'كشف_المسافرين')}>
                  <FileText className="h-4 w-4 ml-2 text-red-600" /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button onClick={() => setGooglePortalOpen(true)} variant="outline" className="gap-2 border-blue-200 hover:bg-blue-50/50 hover:text-blue-700 hover:border-blue-300">
            <Cloud className="h-4 w-4 text-blue-600" /> بوابة Google Workspace
          </Button>

          <Button 
            onClick={() => setCameraScannerOpen(true)} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm"
          >
            <Camera className="h-4 w-4 ml-1" /> مسح الجواز بالكاميرا (OCR)
          </Button>

          <div className="flex border rounded-lg overflow-hidden bg-muted/40 p-0.5">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="h-9 px-2.5 text-xs gap-1"
              title="عرض البطاقات (مناسب للجوال)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">بطاقات</span>
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-9 px-2.5 text-xs gap-1"
              title="عرض الجدول"
            >
              <TableProperties className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">جدول</span>
            </Button>
          </div>

          <Button 
            onClick={() => navigate('/sovereign')}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold gap-1.5 shadow-sm border border-slate-700"
          >
            <Stamp className="h-4 w-4 ml-1 text-amber-400" />
            الوحدات السيادية الـ 14
          </Button>

          <ImportButtonWithPreview
            category="traveler"
            sourceTitle="سجل المسافرين والمباينة"
            buttonLabel="استيراد ملفات (Excel / PDF / صور)"
            buttonClassName="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
          />
          <Button onClick={() => { setEditing(null); setForm(emptyTraveler()); setPhotoPreview(''); setPendingTravelerDraft(loadFormDraft<Partial<Traveler>>('traveler_new_v1')); setOpen(true); }}><Plus className="h-4 w-4 ml-2" />إضافة مسافر</Button>
        </div>
      </div>

      <div className="space-y-3 bg-muted/30 p-3.5 sm:p-4 rounded-xl border">
        <div className="flex flex-wrap gap-2.5">
          <div className="relative flex-1 min-w-0 w-full sm:min-w-[220px]">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم، رقم الجواز، الوكالة، أو سبب الإرتجاع..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 bg-background"
            />
          </div>

          <div className="w-full sm:w-48">
            <Select value={filters.agency} onValueChange={v => setFilters({ ...filters, agency: v })}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="إسم الوكالة" /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="الكل">كل وكالات ومكاتب السفر</SelectItem>
                {travelAgencyOptions.map(ag => (
                  <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[calc(50%-0.35rem)] sm:w-36">
            <Select value={filters.visaType} onValueChange={v => setFilters({ ...filters, visaType: v })}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="التأشيرة" /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="الكل">كل التأشيرات</SelectItem>
                {visaTypeOptions.map(vt => (
                  <SelectItem key={vt} value={vt}>{vt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[calc(50%-0.35rem)] sm:w-32">
            <Select value={filters.visaStatus} onValueChange={v => setFilters({ ...filters, visaStatus: v })}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="حالة التأشيرة" /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="الكل">الحالة: الكل</SelectItem>
                <SelectItem value="مؤشر">مؤشر</SelectItem>
                <SelectItem value="مرتجع">مرتجع</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[calc(50%-0.35rem)] sm:w-36">
            <Select value={filters.country} onValueChange={v => setFilters({ ...filters, country: v })}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="الدولة" /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="الكل">كل الدول</SelectItem>
                {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[calc(50%-0.35rem)] sm:w-32">
            <Select value={filters.travelAllowed} onValueChange={v => setFilters({ ...filters, travelAllowed: v })}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="العبور" /></SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="الكل">العبور: الكل</SelectItem>
                <SelectItem value="نعم">مسموح</SelectItem>
                <SelectItem value="لا">ممنوع</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
            <Input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} className="flex-1 sm:w-36 min-w-0 bg-background font-mono text-xs" />
            <span className="text-muted-foreground text-xs shrink-0">إلى</span>
            <Input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} className="flex-1 sm:w-36 min-w-0 bg-background font-mono text-xs" />
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setFilters({ country: 'الكل', travelAllowed: 'الكل', agency: 'الكل', visaType: 'الكل', visaStatus: 'الكل', startDate: '', endDate: '' });
              if (searchParams.get('agency') || searchParams.get('search')) {
                navigate('/', { replace: true });
              }
            }}
          >
            إعادة ضبط
          </Button>
        </div>

        {/* Summary KPI Strip & Travel Agency Linkage Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-slate-200 font-semibold text-slate-700">
              السجلات المطابقة: <strong className="font-mono tabular-nums text-slate-900">{filtered.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-semibold text-emerald-800">
              مؤشر: <strong className="font-mono tabular-nums">{visaStats.issuedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 font-semibold text-amber-800">
              مرتجع: <strong className="font-mono tabular-nums">{visaStats.returnedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 font-semibold text-indigo-800">
              <Building2 className="h-3.5 w-3.5" />
              الوكالات المرتبطة: <strong className="font-mono tabular-nums">{visaStats.linkedAgenciesCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {filters.agency !== 'الكل' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/travel-agencies?agency=${encodeURIComponent(filters.agency)}`)}
                className="h-7 text-[11px] font-bold gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>ملف وكالة: {filters.agency}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/travel-agencies')}
              className="h-7 text-[11px] font-bold gap-1"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span>دليل وكالات ومكاتب السفر ({companies.length})</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Cards View (Optimized for Mobile Smartphones & Touch) */}
      <div className={`${viewMode === 'cards' ? 'grid' : 'hidden'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4`}>
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-card rounded-2xl border border-slate-200 text-muted-foreground">
            لا توجد بيانات مطابقة للبحث
          </div>
        ) : (
          paginatedTravelers.map(t => {
            const displayName = getTravelerDisplayName(t);
            const visaStatusClean = cleanArabicText(t.status || '');
            const exitDateStr = t.exitDate || t.receiveDate || '-';
            const visaLabel = t.visaType || t.visitReason || '-';

            return (
              <div
                key={t.id}
                onClick={() => navigate(`/travelers/${t.id}`)}
                className="bg-card rounded-2xl border border-slate-200 p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 group active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 overflow-hidden">
                    {t.photoUrl ? (
                      <img src={t.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <h3 className="font-bold text-sm text-slate-800 truncate group-hover:text-primary transition-colors">
                        {t.serialNumber ? <span className="font-mono tabular-nums text-[11px] text-slate-400 ml-1">#{t.serialNumber}</span> : null}
                        {displayName}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {visaStatusClean && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              visaStatusClean.includes('مرتجع')
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {visaStatusClean}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            t.travelAllowed === 'نعم'
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          {t.travelAllowed === 'نعم' ? 'مسموح' : 'ممنوع'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums font-bold text-slate-700">{t.idNumber}</span>
                      <span>·</span>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">{t.idType}</span>
                      {t.country && (
                        <>
                          <span>·</span>
                          <span className="text-[10px] text-slate-500">{t.country}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100 bg-slate-50/60 p-2.5 rounded-xl">
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    <Building2 className="h-3 w-3 text-indigo-500 shrink-0" />
                    {isMeaningfulAgencyName(t.agency) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/travel-agencies?agency=${encodeURIComponent(t.agency!)}`);
                        }}
                        className="truncate font-bold text-indigo-700 hover:underline text-right"
                        title={`عرض تأشيرات ${t.agency}`}
                      >
                        {t.agency}
                      </button>
                    ) : (
                      <span className="truncate">{t.agency || 'غير محدد'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="truncate">{t.center || t.governorate || 'المنفذ الرئيسي'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    <Tag className="h-3 w-3 text-teal-600 shrink-0" />
                    <span className="truncate font-medium">{visaLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                    <Calendar className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="truncate font-mono tabular-nums">{exitDateStr}</span>
                  </div>
                </div>

                {t.returnReason && (
                  <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    سبب الإرتجاع: {t.returnReason}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 no-print" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 border-slate-200 hover:bg-slate-100"
                      onClick={() => navigate(`/travelers/${t.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>تفاصيل</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      onClick={(e) => handleOpenBiometrics(t, e)}
                      title="تسجيل أو فحص البصمة والوجه"
                    >
                      <Fingerprint className="h-3.5 w-3.5" />
                      <span>بصمة</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-primary border-primary/20 hover:bg-primary/5"
                      onClick={() => handleOfficialPrint(t)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>طباعة</span>
                    </Button>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-primary"
                      onClick={() => openEdit(t)}
                      title="تعديل"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    {canDeleteTraveler && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteTraveler(t.id)}
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table View (Optimized for Wide Screens / High Density & 4-Way Scroll) */}
      <div className={`${viewMode === 'table' ? 'block' : 'hidden'} rounded-lg border bg-card adaptive-table-container shadow-xs`} id="travelers-table">
        <Table className="min-w-[1040px] w-full">
          <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs shadow-2xs">
            <TableRow className="bg-muted/50">
              <TableHead className="text-center w-12">م</TableHead>
              <TableHead className="text-right">الإسم</TableHead>
              <TableHead className="text-right">رقم الجواز / الوثيقة</TableHead>
              <TableHead className="text-right">المركز</TableHead>
              <TableHead className="text-right">إسم الوكالة</TableHead>
              <TableHead className="text-right">التأشيرة</TableHead>
              <TableHead className="text-right">ت. الخروج</TableHead>
              <TableHead className="text-right">الحالة / سبب الإرتجاع</TableHead>
              <TableHead className="text-right no-print">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
            ) : paginatedTravelers.map((t, idx) => {
              const displayName = getTravelerDisplayName(t);
              const visaStatusClean = cleanArabicText(t.status || '');
              const exitDateStr = t.exitDate || t.receiveDate || '-';
              const visaLabel = t.visaType || t.visitReason || '-';

              return (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => navigate(`/travelers/${t.id}`)}>
                  <TableCell className="text-center font-mono tabular-nums text-xs text-muted-foreground">
                    {t.serialNumber || startIndex + idx + 1}
                  </TableCell>
                  <TableCell className="font-medium text-right">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate max-w-[200px]">{displayName}</div>
                        {t.destination && t.destination !== 'غير محدد' && (
                          <div className="text-[10px] text-muted-foreground truncate">{t.destination}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col">
                      <span className="font-mono tabular-nums font-bold text-xs">{t.idNumber}</span>
                      <span className="text-[10px] text-muted-foreground">{t.idType}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span>{t.center || t.governorate || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs" onClick={(e) => e.stopPropagation()}>
                    {isMeaningfulAgencyName(t.agency) ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/travel-agencies?agency=${encodeURIComponent(t.agency!)}`)}
                        className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:text-indigo-900 hover:underline text-right"
                        title={`عرض تأشيرات وكالة ${t.agency}`}
                      >
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{t.agency}</span>
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{t.agency || '-'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">{visaLabel}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs">{exitDateStr}</TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {visaStatusClean ? (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              visaStatusClean.includes('مرتجع')
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {visaStatusClean}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                        {t.travelAllowed === 'لا' && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700">
                            ممنوع
                          </span>
                        )}
                      </div>
                      {t.returnReason && (
                        <span className="text-[11px] text-amber-800 truncate max-w-[190px]" title={t.returnReason}>
                          {t.returnReason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="no-print">
                    <div className="flex gap-1 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-indigo-600 hover:bg-indigo-50"
                        onClick={(e) => handleOpenBiometrics(t, e)}
                        title={`البصمات الحيوية (${t.biometrics?.biometricStatus || 'غير مسجل'})`}
                      >
                        <Fingerprint className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleOfficialPrint(t)} title="طباعة التقرير">
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="تعديل">
                        <FileText className="h-4 w-4 text-primary" />
                      </Button>
                      {canDeleteTraveler && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteTraveler(t.id)} title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls - Max 50 persons per page with page numbers below */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border rounded-xl p-3 sm:px-5 mt-4 shadow-xs">
          {/* Summary Indicator */}
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground order-2 sm:order-1">
            <span>
              عرض <strong className="text-foreground font-bold">{startIndex + 1}</strong> إلى{' '}
              <strong className="text-foreground font-bold">{endIndex}</strong> من إجمالي{' '}
              <strong className="text-foreground font-bold">{totalItems}</strong> مسافر
            </span>
            <span className="hidden md:inline-flex bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-medium">
              50 شخص كحد أقصى لكل صفحة
            </span>
          </div>

          {/* Page Buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center order-1 sm:order-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activePage === 1}
              onClick={() => setCurrentPage(1)}
              className="h-8 px-2 text-xs gap-1"
              title="الصفحة الأولى"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">الأولى</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={activePage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="h-8 px-2.5 text-xs gap-1"
              title="الصفحة السابقة"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span>السابق</span>
            </Button>

            <div className="flex items-center gap-1">
              {getPageNumbers().map((pageItem, pIdx) => {
                if (pageItem === '...') {
                  return (
                    <span key={`dots-${pIdx}`} className="px-1 text-xs text-muted-foreground select-none">
                      ...
                    </span>
                  );
                }
                const pageNum = pageItem as number;
                const isActive = pageNum === activePage;
                return (
                  <Button
                    key={pageNum}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 p-0 text-xs font-bold transition-all ${
                      isActive ? 'bg-primary text-primary-foreground shadow-xs' : 'hover:bg-muted/80'
                    }`}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={activePage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="h-8 px-2.5 text-xs gap-1"
              title="الصفحة التالية"
            >
              <span>التالي</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={activePage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="h-8 px-2 text-xs gap-1"
              title="الصفحة الأخيرة"
            >
              <span className="hidden sm:inline">الأخيرة</span>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <DeleteConfirmation 
        isOpen={deleteConfirmOpen} 
        onClose={() => setDeleteConfirmOpen(false)} 
        onConfirm={confirmDelete} 
        title="حذف بيانات المسافر"
        description={`هل أنت متأكد من حذف بيانات المسافر "${travelers.find(t => t.id === travelerToDelete)?.firstName}"؟`}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-right">{editing ? 'تعديل بيانات المسافر' : 'إضافة مسافر جديد'}</DialogTitle>
                <DialogDescription className="text-right">
                  فحص أمني حي، تعبئة تلقائية من السجلات السابقة، والتحقق الفوري من تواريخ الجواز وحالة الوكالات.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCameraScannerOpen(true)}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-bold gap-1.5 text-xs shadow-2xs shrink-0"
              >
                <Camera className="h-3.5 w-3.5 text-emerald-600" />
                <span>ملء آلي بالكاميرا (OCR)</span>
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4">
          <ImageOCRProcessor onMlKitExtracted={handleMlKitPassportExtracted} />

          {pendingTravelerDraft && !editing && (
            <DraftRecoveryBanner
              savedAt={pendingTravelerDraft.savedAt}
              onRestore={() => {
                setForm(pendingTravelerDraft.data);
                setPhotoPreview(pendingTravelerDraft.data.photoUrl || '');
                setPendingTravelerDraft(null);
                toast({ title: 'تم استرجاع مسودة المسافر' });
              }}
              onDiscard={() => {
                clearFormDraft('traveler_new_v1');
                setPendingTravelerDraft(null);
              }}
            />
          )}

          <LiveFormAlertsBanner
            lookupMatch={personLookupMatch}
            onApplyAutoFill={applyLookupAutoFill}
            duplicateCheck={duplicateTravelerCheck}
            onOpenExistingDuplicate={(existingId) => {
              const hit = travelers.find(item => item.id === existingId);
              if (hit) openEdit(hit);
            }}
            watchlistCheck={liveWatchlistCheck}
            validation={passportDatesValidation}
          />

          <div className="flex flex-col-reverse md:flex-row gap-4 sm:gap-6 bg-white rounded-lg" id={editing ? `traveler-card-${editing.id}` : undefined}>
            {/* Form fields on the right */}
            <div className="flex-1 min-w-0 space-y-4">
              {watchlistMatch && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-red-800">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p className="font-bold text-xs">تنبيه أمني: تطابق مع بلاغ ضبط: {watchlistMatch}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs font-bold shrink-0"
                    onClick={() => setWatchlistAlertModal({
                      isOpen: true,
                      travelerName: `${form.firstName || ''} ${form.lastName || ''}`.trim() || 'مسافر قيد الفحص',
                      idNumber: form.idNumber || '',
                      matchedReportTitle: watchlistMatch
                    })}
                  >
                    عرض التنبيه الفوري
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-xs text-muted-foreground">الاسم الأول *</label><Input value={form.firstName} onChange={e => f('firstName', e.target.value)} className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">الاسم الثاني</label><Input value={form.secondName} onChange={e => f('secondName', e.target.value)} className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">الاسم الثالث</label><Input value={form.thirdName} onChange={e => f('thirdName', e.target.value)} className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">الاسم الرابع</label><Input value={form.fourthName} onChange={e => f('fourthName', e.target.value)} className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">اللقب</label><Input value={form.lastName} onChange={e => f('lastName', e.target.value)} className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">الاسم بالجواز (إنجليزي)</label><Input value={form.passportName || ''} onChange={e => f('passportName', e.target.value)} placeholder="LATIN PASSPORT NAME" className="text-left font-mono text-xs" dir="ltr" /></div>
              <div><label className="text-xs text-muted-foreground">رقم الجواز/البطاقة *</label><Input value={form.idNumber} onChange={e => f('idNumber', e.target.value)} className="text-right font-mono tabular-nums" /></div>
              <div>
                <label className="text-xs text-muted-foreground">نوع الوثيقة</label>
                <Select value={form.idType} onValueChange={v => f('idType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">تاريخ الميلاد</label><Input type="date" value={form.birthDate || ''} onChange={e => f('birthDate', e.target.value)} className="text-right font-mono tabular-nums" /></div>
              <div><label className="text-xs text-muted-foreground">العمر</label><Input type="number" value={form.age} onChange={e => f('age', +e.target.value)} className="text-right font-mono tabular-nums" /></div>
              <div>
                <label className="text-xs text-muted-foreground">الجنس</label>
                <Select value={form.gender || 'ذكر'} onValueChange={v => f('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ذكر">ذكر</SelectItem>
                    <SelectItem value="أنثى">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">المهنة</label><Input value={form.profession || ''} onChange={e => f('profession', e.target.value)} placeholder="مثال: عامل / مهندس" className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">جهة الإصدار</label><Input value={form.placeOfIssue || ''} onChange={e => f('placeOfIssue', e.target.value)} placeholder="مثال: تعز / صنعاء" className="text-right" /></div>
              <div><label className="text-xs text-muted-foreground">تاريخ إصدار الوثيقة</label><Input type="date" value={form.issueDate || ''} onChange={e => f('issueDate', e.target.value)} className="text-right font-mono tabular-nums" /></div>
              <div><label className="text-xs text-muted-foreground">تاريخ انتهاء الوثيقة</label><Input type="date" value={form.expiryDate || ''} onChange={e => f('expiryDate', e.target.value)} className="text-right font-mono tabular-nums" /></div>
              <div>
                <label className="text-xs text-muted-foreground">البلاد</label>
                <SearchableCombobox
                  value={form.country || ''}
                  onChange={v => f('country', v)}
                  options={COUNTRIES}
                  placeholder="اختر أو ابحث عن الدولة..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">المحافظة</label>
                <Select value={form.governorate} onValueChange={v => f('governorate', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{YEMEN_GOVERNORATES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">رقم الهاتف</label><Input value={form.phone} onChange={e => f('phone', e.target.value)} className="text-right font-mono" /></div>
              <div>
                <label className="text-xs text-muted-foreground">مكتب / وكالة السفر والسياحة (إسم الوكالة)</label>
                <SearchableCombobox
                  value={form.agency || ''}
                  onChange={v => f('agency', v)}
                  options={travelAgencyOptions}
                  placeholder="ابحث أو أضف اسم وكالة السفر..."
                  warningMessage={agencySecurityWarning.isBlocked ? agencySecurityWarning.message : undefined}
                />
              </div>
              <div><label className="text-xs text-muted-foreground">الرقم التسلسلي بالكشف (م)</label><Input value={form.serialNumber || ''} onChange={e => f('serialNumber', e.target.value)} placeholder="مثال: 1" className="text-right font-mono" /></div>
              <div><label className="text-xs text-muted-foreground">رقم تصريح التنقل الداخلي (إن وجد)</label><Input value={form.requestNumber || ''} onChange={e => f('requestNumber', e.target.value)} placeholder="تصريح-أمني-2026-..." className="text-right font-mono" /></div>
              <div><label className="text-xs text-muted-foreground">الدولة المتجه إليها</label><Input value={form.destination || ''} onChange={e => f('destination', e.target.value)} className="text-right" /></div>
              <div>
                <label className="text-xs text-muted-foreground">التأشيرة / نوع التأشيرة</label>
                <SearchableCombobox
                  value={form.visaType || form.visitReason || ''}
                  onChange={val => setForm(prev => ({ ...prev, visaType: val, visitReason: val }))}
                  options={['زيارة عائلية', 'عمل', 'زيارة', 'إقامة', 'عمرة', 'علاج', ...visaTypeOptions].filter((v, i, a) => a.indexOf(v) === i)}
                  placeholder="زيارة عائلية / عمل / عمرة..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ت. الخروج / تاريخ السفر</label>
                <Input
                  type="date"
                  value={form.exitDate || form.receiveDate || ''}
                  onChange={e => setForm(prev => ({ ...prev, exitDate: e.target.value, receiveDate: e.target.value }))}
                  className="text-right font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">الحالة (مؤشر / مرتجع)</label>
                <SearchableCombobox
                  value={form.status || ''}
                  onChange={val => f('status', val)}
                  options={['مؤشر', 'مرتجع', 'معتمد']}
                  placeholder="مؤشر / مرتجع..."
                />
              </div>
              <div><label className="text-xs text-muted-foreground">سبب الإرتجاع</label><Input value={form.returnReason || ''} onChange={e => f('returnReason', e.target.value)} placeholder="يُملأ في حال كانت الحالة مرتجع" className="text-right" /></div>
              <div className="col-span-full">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs text-muted-foreground">نتائج المباينة الأمنية</label>
                  <VoiceDictationButton
                    label="إملاء المباينة"
                    contextHint="نتيجة مباينة وفحص أمني لمسافر"
                    onTranscript={(t) =>
                      setForm((prev) => ({
                        ...prev,
                        vettingResult: prev.vettingResult ? `${prev.vettingResult} ${t}` : t,
                      }))
                    }
                  />
                </div>
                <Textarea value={form.vettingResult} onChange={e => f('vettingResult', e.target.value)} className="text-right" />
              </div>
              <div className="col-span-full">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs text-muted-foreground">معلومات إضافية وملاحظات التدقيق (بيانات تكميلية / كفيل / عمل)</label>
                  <VoiceDictationButton
                    label="إملاء الملاحظات"
                    contextHint="ملاحظات تدقيق مسافر، كفيل، أو جهة عمل"
                    onTranscript={(t) =>
                      setForm((prev) => ({
                        ...prev,
                        additionalInfo: prev.additionalInfo ? `${prev.additionalInfo}\n${t}` : t,
                      }))
                    }
                  />
                </div>
                <Textarea
                  value={form.additionalInfo || ''}
                  onChange={e => f('additionalInfo', e.target.value)}
                  className="text-right font-sans"
                  placeholder="أي معلومات إضافية، بيانات الكفيل، جهة العمل، أرقام الموبايل الإضافية، أو الملاحظات الواردة من الكشوفات..."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">المنفذ / المركز</label>
                <Input
                  value={form.center || ''}
                  onChange={e => f('center', e.target.value)}
                  placeholder="المركز الرئيسي - العاصمة صنعاء"
                  className="text-right"
                />
              </div>
              <div className="col-span-full md:col-span-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">الضابط المحقق / ضابط المنفذ</label>
                  <button
                    type="button"
                    onClick={() => f('investigatingOfficer', getDefaultOfficerName())}
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    تعيين المناوب الحالي
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={form.investigatingOfficer || ''}
                    onChange={e => f('investigatingOfficer', e.target.value)}
                    className="text-right font-medium"
                    placeholder="أدخل اسم ضابط المنفذ..."
                  />
                  {registeredOfficers.length > 0 && (
                    <Select onValueChange={v => f('investigatingOfficer', v)}>
                      <SelectTrigger className="w-32 text-xs shrink-0"><SelectValue placeholder="اختر ضابط" /></SelectTrigger>
                      <SelectContent dir="rtl">
                        {registeredOfficers.map(o => (
                          <SelectItem key={o.id} value={`${o.rank ? o.rank + '/ ' : ''}${o.name}`}>
                            {o.rank} {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">السماح بالسفر</label>
                <Select value={form.travelAllowed} onValueChange={v => f('travelAllowed', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نعم">نعم</SelectItem>
                    <SelectItem value="لا">لا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Photo on the left */}
            <div className="flex-shrink-0 w-full md:w-40">
              <label className="text-xs text-muted-foreground block mb-2 text-center">صورة المسافر (4×6)</label>
              <div
                className="border-2 border-dashed rounded-lg p-2 text-center cursor-pointer hover:bg-muted/50 h-44 md:h-52 flex items-center justify-center max-w-[180px] mx-auto md:max-w-none"
                onClick={() => fileRef.current?.click()}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="صورة" className="h-full w-full object-cover rounded" />
                ) : (
                  <p className="text-sm text-muted-foreground">اضغط لرفع صورة</p>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </div>
          </div>

          {/* Document attachments section with compression */}
          <div className="border-t pt-4">
            <StructuredAttachmentsField
              attachments={form.documentsUrls || []}
              onChange={(next) => setForm(prev => ({ ...prev, documentsUrls: next }))}
              label="مرفقات إضافية (ضغط تلقائي للصور / PDF)"
            />
          </div>
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-wrap gap-2 justify-start">
            <Button onClick={save} className="gap-2">
              <Save className="h-4 w-4" /> حفظ البيانات
            </Button>
            {editing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> تصدير
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent dir="rtl">
                  <DropdownMenuItem onClick={() => printTraveler(editing)}>
                    <Printer className="h-4 w-4 ml-2" /> طباعة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToWord(`بيانات المسافر: ${editing.firstName}`, editing, `مسافر_${editing.idNumber}`)}>
                    <FileText className="h-4 w-4 ml-2 text-blue-600" /> Word
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToPDF(`traveler-card-${editing.id}`, `مسافر_${editing.idNumber}`)}>
                    <FileText className="h-4 w-4 ml-2 text-red-600" /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToImage(`traveler-card-${editing.id}`, `مسافر_${editing.idNumber}`)}>
                    <ImageIcon className="h-4 w-4 ml-2 text-purple-600" /> صورة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* View Details Dialog */}
      <Dialog open={!!viewingTraveler} onOpenChange={(open) => {
        if (!open) navigate('/');
      }}>
        <DialogContent className="max-w-3xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden" dir="rtl">
          {viewingTraveler && (
            <>
              <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-right flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-800">تفاصيل المسافر</span>
              <div className="flex gap-2 flex-wrap items-center">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleOfficialPrint(viewingTraveler)}
                  className="h-8 bg-primary hover:bg-primary/90 text-white font-bold gap-1.5 shadow-sm px-3"
                >
                  <Printer className="h-4 w-4 ml-1" />
                  <span>طباعة التقرير</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenBiometrics(viewingTraveler)}
                  className="h-8 text-indigo-700 border-indigo-300 hover:bg-indigo-50 font-bold gap-1.5 shadow-xs"
                >
                  <Fingerprint className="h-4 w-4 ml-1" />
                  <span>البصمة الحيوية والوجه</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <Download className="h-4 w-4 ml-1" /> تصدير
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent dir="rtl">
                    <DropdownMenuItem onClick={() => exportToImage('traveler-view-content', `مسافر_${viewingTraveler.idNumber}`)}>
                      <ImageIcon className="h-4 w-4 ml-2 text-purple-600" /> صورة PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToPDF('traveler-view-content', `مسافر_${viewingTraveler.idNumber}`)}>
                      <FileText className="h-4 w-4 ml-2 text-red-600" /> ملف PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => openEditFromView(viewingTraveler)} className="h-8 text-primary border-primary/20 hover:bg-primary/5">
                  <FileText className="h-4 w-4 ml-1" /> تعديل
                </Button>
                {canDeleteTraveler && (
                  <Button variant="outline" size="sm" onClick={() => { setViewingTraveler(null); navigate('/'); deleteTraveler(viewingTraveler.id); }} className="h-8 text-destructive border-destructive/20 hover:bg-destructive/5">
                    <Trash2 className="h-4 w-4" /> حذف
                  </Button>
                )}
              </div>
            </DialogTitle>
            <DialogDescription className="text-right">
              عرض البيانات الكاملة للمسافر وسجل البلاغات المرتبطة والمرفقات.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5">
          <div id="traveler-view-content" className="bg-white p-2 sm:p-4 rounded-lg">
            {viewingTraveler && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-2">
              <div className="md:col-span-1 flex flex-col items-center gap-4">
                {viewingTraveler.photoUrl ? (
                  <img src={viewingTraveler.photoUrl} alt="صورة" className="w-full max-w-[160px] md:max-w-none aspect-[3/4] object-cover rounded-lg border-2 border-primary/20" />
                ) : (
                  <div className="w-full max-w-[160px] md:max-w-none aspect-[3/4] bg-muted flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 text-muted-foreground text-xs text-center">لا توجد صورة</div>
                )}
                <div className={`w-full py-2 rounded text-center font-bold ${viewingTraveler.travelAllowed === 'نعم' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {viewingTraveler.travelAllowed === 'نعم' ? 'مسموح بالسفر' : 'ممنوع من السفر'}
                </div>
                <div className="w-full">
                  <QRCodeCanvas value={`TRAVELER:${viewingTraveler.idNumber}:${viewingTraveler.firstName} ${viewingTraveler.lastName}`} size={120} className="mx-auto" />
                </div>
              </div>
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                <div className="col-span-full border-b pb-1 font-bold text-primary">البيانات الشخصية</div>
                <div><span className="text-muted-foreground block text-xs">الاسم الكامل</span> {viewingTraveler.firstName} {viewingTraveler.secondName} {viewingTraveler.thirdName} {viewingTraveler.fourthName} {viewingTraveler.lastName}</div>
                <div><span className="text-muted-foreground block text-xs">الاسم بالجواز (إنجليزي)</span> <span className="font-mono text-xs">{viewingTraveler.passportName || '-'}</span></div>
                <div><span className="text-muted-foreground block text-xs">رقم الوثيقة ({viewingTraveler.idType})</span> <span className="font-mono tabular-nums font-bold">{viewingTraveler.idNumber}</span></div>
                <div><span className="text-muted-foreground block text-xs">تاريخ الميلاد / العمر</span> <span className="font-mono tabular-nums">{viewingTraveler.birthDate || '-'}</span> {viewingTraveler.age ? `(${viewingTraveler.age} سنة)` : ''}</div>
                <div><span className="text-muted-foreground block text-xs">الجنس / المهنة</span> {viewingTraveler.gender || '-'} · {viewingTraveler.profession || '-'}</div>
                <div><span className="text-muted-foreground block text-xs">تاريخ الإصدار / الانتهاء</span> <span className="font-mono tabular-nums">{viewingTraveler.issueDate || '-'} ← {viewingTraveler.expiryDate || '-'}</span></div>
                <div><span className="text-muted-foreground block text-xs">المحل / المحافظة</span> {viewingTraveler.country} - {viewingTraveler.governorate}</div>
                <div><span className="text-muted-foreground block text-xs">جهة الإصدار / الهاتف</span> {viewingTraveler.placeOfIssue || '-'} · <span className="font-mono">{viewingTraveler.phone || '-'}</span></div>
                
                <div className="col-span-full border-b pb-1 font-bold text-primary mt-2">بيانات التأشيرة ووكالة السفر</div>
                <div><span className="text-muted-foreground block text-xs">الرقم التسلسلي بالكشف (م)</span> <span className="font-mono tabular-nums">{viewingTraveler.serialNumber || '-'}</span></div>
                <div><span className="text-muted-foreground block text-xs">المركز / المنفذ</span> {viewingTraveler.center || '-'}</div>
                <div>
                  <span className="text-muted-foreground block text-xs">إسم الوكالة / مكتب السفر</span>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="font-bold text-slate-900">{viewingTraveler.agency || '-'}</span>
                    {isMeaningfulAgencyName(viewingTraveler.agency) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => navigate(`/travel-agencies?agency=${encodeURIComponent(viewingTraveler.agency!)}`)}
                        className="h-6 text-[11px] text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1"
                      >
                        <Building2 className="h-3 w-3" />
                        <span>عرض ملف الوكالة وتأشيراتها</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div><span className="text-muted-foreground block text-xs">نوع التأشيرة / سبب الزيارة</span> {viewingTraveler.visaType || viewingTraveler.visitReason || '-'}</div>
                <div><span className="text-muted-foreground block text-xs">ت. الخروج / الاستلام</span> <span className="font-mono tabular-nums">{viewingTraveler.exitDate || viewingTraveler.receiveDate || '-'}</span></div>
                <div>
                  <span className="text-muted-foreground block text-xs">الحالة</span>
                  <span className={`font-bold ${viewingTraveler.status === 'مرتجع' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {viewingTraveler.status || '-'}
                  </span>
                </div>
                <div><span className="text-muted-foreground block text-xs">الوجهة</span> {viewingTraveler.destination || '-'}</div>
                {viewingTraveler.returnReason && (
                  <div className="col-span-full bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
                    <span className="text-amber-700 block text-xs font-bold mb-0.5">سبب الإرتجاع</span>
                    {viewingTraveler.returnReason}
                  </div>
                )}
                
                <div className="col-span-full border-b pb-1 font-bold text-primary mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span>التحقق البيومتري (بصمة الإصبع ومسح الوجه)</span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleOpenBiometrics(viewingTraveler)}
                    className="h-6 text-[11px] text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1"
                  >
                    <Fingerprint className="h-3 w-3" />
                    <span>تحديث / تسجيل البصمات</span>
                  </Button>
                </div>
                <div className="col-span-full bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                      <Fingerprint className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          بصمة الأصابع:{' '}
                          {viewingTraveler.biometrics?.fingerprintTemplate ? (
                            <span className="text-emerald-700 font-bold">✓ مسجلة ومعتمدة</span>
                          ) : (
                            <span className="text-slate-400 font-normal">غير مسجلة</span>
                          )}
                        </span>
                        <span>·</span>
                        <span className="text-xs font-bold text-slate-800">
                          مسح الوجه الحيوي:{' '}
                          {viewingTraveler.biometrics?.faceEmbedding ? (
                            <span className="text-emerald-700 font-bold">✓ مسجل ومطابق</span>
                          ) : (
                            <span className="text-slate-400 font-normal">غير مسجل</span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5 break-all">
                        {viewingTraveler.biometrics?.fingerprintTemplate || 'لا يوجد كود قالب بيومتري'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      viewingTraveler.biometrics?.biometricStatus === 'مكتمل'
                        ? 'bg-emerald-100 text-emerald-800'
                        : viewingTraveler.biometrics?.biometricStatus === 'جزئي'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    الحالة البيومترية: {viewingTraveler.biometrics?.biometricStatus || 'غير مسجل'}
                  </span>
                </div>

                <div className="col-span-full border-b pb-1 font-bold text-primary mt-2">المباينة الأمنية وقوائم الترقب</div>
                <div className="col-span-full bg-muted/50 p-2 rounded text-xs">{viewingTraveler.vettingResult || 'لا توجد نتائج مباينة مسجلة'}</div>

                {viewingTraveler.additionalInfo && (
                  <>
                    <div className="col-span-full border-b pb-1 font-bold text-primary mt-3 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <span>معلومات إضافية وملاحظات التدقيق التراكمية (من الملفات والكشوفات)</span>
                    </div>
                    <div className="col-span-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line font-sans">
                      {viewingTraveler.additionalInfo}
                    </div>
                  </>
                )}
                
                <div className="col-span-full border-b pb-1 font-bold text-primary mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span>البلاغات المرتبطة</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => setLinkDialogOpen(true)} className="h-7 text-[10px]">
                      <LinkIcon className="h-3 w-3 ml-1" /> ربط بلاغ موجود
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => setNewReportDialogOpen(true)} className="h-7 text-[10px]">
                      <Plus className="h-3 w-3 ml-1" /> بلاغ جديد
                    </Button>
                  </div>
                </div>
                <div className="col-span-full space-y-2">
                  {(viewingTraveler.linkedReportIds || []).length > 0 ? (
                    getReports().filter(r => viewingTraveler.linkedReportIds?.includes(r.id)).map(r => (
                      <div key={r.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3 w-3 text-primary shrink-0" />
                          <span className="font-bold truncate">{r.title}</span>
                          <span className="text-muted-foreground shrink-0">({r.type})</span>
                        </div>
                        <Button variant="ghost" size="xs" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => {
                          const updated = travelers.map(t => t.id === viewingTraveler.id ? { ...t, linkedReportIds: t.linkedReportIds?.filter(id => id !== r.id) } : t);
                          saveTravelers(updated);
                          setTravelers(updated);
                          setViewingTraveler(updated.find(t => t.id === viewingTraveler.id) || null);
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-xs italic">لا توجد بلاغات مرتبطة</div>
                  )}
                </div>

                {viewingTraveler.documentsUrls && viewingTraveler.documentsUrls.length > 0 && (
                  <div className="col-span-full mt-2">
                    <span className="text-muted-foreground block text-xs mb-2">المرفقات ({viewingTraveler.documentsUrls.length})</span>
                    <div className="flex gap-2 overflow-x-auto pb-2 adaptive-scroll-region">
                      {viewingTraveler.documentsUrls.map((doc, i) => (
                        <div key={i} className="flex-shrink-0 w-20 h-20 border rounded overflow-hidden bg-muted">
                          {doc.startsWith('data:image') ? (
                            <img src={doc} alt="مرفق" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px]">PDF</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setViewingTraveler(null);
                navigate('/');
              }}
              className="gap-1.5 font-bold"
            >
              <ChevronRight className="h-4 w-4" />
              <span>رجوع للقائمة</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEditFromView(viewingTraveler)}
              className="text-primary border-primary/20 hover:bg-primary/5 gap-1.5 font-bold"
            >
              <FileText className="h-4 w-4" />
              <span>تعديل البيانات</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOfficialPrint(viewingTraveler)}
              className="gap-1.5 font-bold"
            >
              <Printer className="h-4 w-4" />
              <span>طباعة التقرير</span>
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setViewingTraveler(null);
              navigate('/');
            }}
          >
            إغلاق
          </Button>
        </div>
            </>
          )}
      </DialogContent>
    </Dialog>

      {/* Link Existing Report Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-right">ربط بلاغ موجود</DialogTitle>
            <DialogDescription className="text-right">
              اختر أحد البلاغات المسجلة في النظام لربطها بملف هذا المسافر.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-4 sm:p-5 space-y-2">
            {getReports().filter(r => !viewingTraveler?.linkedReportIds?.includes(r.id)).length > 0 ? (
              getReports().filter(r => !viewingTraveler?.linkedReportIds?.includes(r.id)).map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-3 border rounded hover:bg-muted/50 cursor-pointer" onClick={() => linkReport(r.id)}>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                  </div>
                  <Button size="sm" className="shrink-0">ربط</Button>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted-foreground">لا توجد بلاغات إضافية للربط</div>
            )}
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end">
            <Button variant="ghost" onClick={() => setLinkDialogOpen(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Report Dialog */}
      <Dialog open={newReportDialogOpen} onOpenChange={setNewReportDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-right">إنشاء بلاغ جديد وربطه</DialogTitle>
            <DialogDescription className="text-right">
              قم بإنشاء بلاغ جديد وسيتم ربطه تلقائياً بملف هذا المسافر بعد الحفظ.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-4 sm:p-5 space-y-4">
            <div><label className="text-sm">عنوان البلاغ</label><Input value={newReportForm.title} onChange={e => setNewReportForm({...newReportForm, title: e.target.value})} /></div>
            <div><label className="text-sm">التصنيف</label><Input value={newReportForm.type} onChange={e => setNewReportForm({...newReportForm, type: e.target.value})} /></div>
            <div><label className="text-sm">الوصف</label><Textarea value={newReportForm.description} onChange={e => setNewReportForm({...newReportForm, description: e.target.value})} rows={4} /></div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setNewReportDialogOpen(false)}>إلغاء</Button>
            <Button onClick={createAndLinkReport}>إنشاء وربط</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Workspace Portal */}
      <GoogleWorkspacePortal
        isOpen={googlePortalOpen}
        onClose={() => setGooglePortalOpen(false)}
        travelers={travelers}
        onImportComplete={(updated) => {
          saveTravelers(updated);
          setTravelers(updated);
        }}
      />

      {/* Official Printable Border Clearance Report (Triggered by window.print()) */}
      <OfficialPrintReport traveler={printableTraveler || viewingTraveler} />

      {/* Camera-Based Passport & ID Scanner */}
      <CameraScanner
        isOpen={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onScanComplete={handleCameraScanComplete}
      />

      {/* Biometric Enrollment & Verification Modal (Fingerprint & Face Scan) */}
      {biometricTargetTraveler && (
        <BiometricEnrollmentModal
          isOpen={biometricModalOpen}
          onClose={() => {
            setBiometricModalOpen(false);
            setBiometricTargetTraveler(null);
          }}
          traveler={biometricTargetTraveler}
          onSaveBiometrics={handleSaveBiometrics}
        />
      )}

      {/* Real-Time Security Watchlist Alert Popup */}
      <WatchlistAlertModal
        isOpen={watchlistAlertModal.isOpen}
        onClose={() => setWatchlistAlertModal(prev => ({ ...prev, isOpen: false }))}
        travelerName={watchlistAlertModal.travelerName}
        idNumber={watchlistAlertModal.idNumber}
        matchedReportTitle={watchlistAlertModal.matchedReportTitle}
        onCreateReport={() => {
          const reports = getReports();
          const now = new Date().toISOString();
          const newReport: Report = {
            id: generateId(),
            title: `محضر مطابقة وضبط فوري: ${watchlistAlertModal.travelerName}`,
            description: `تم رصد تطابق فوري لبيانات المسافر (${watchlistAlertModal.travelerName}) - رقم الوثيقة (${watchlistAlertModal.idNumber || 'غير محدد'}) مع البلاغ المسجل: (${watchlistAlertModal.matchedReportTitle}).`,
            type: 'ضبط أمني',
            status: 'جديد',
            createdAt: now,
            updatedAt: now,
          };
          saveReports([newReport, ...reports]);
          toast({
            title: 'تم توثيق بلاغ الضبط الفوري',
            description: 'تم تحويل الحالة إلى واجهة بلاغات الضبط والتحري.',
          });
        }}
      />
    </div>
  );
};

export default Travelers;
