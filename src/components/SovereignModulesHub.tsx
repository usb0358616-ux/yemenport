import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  SOVEREIGN_PORTS,
  SLA_SERVICES_CATALOG,
  MONITORED_COMPANY_TYPES,
  SOVEREIGN_ROLES,
  SovereignPort,
  COUNTRIES,
  YEMEN_GOVERNORATES
} from '@/lib/constants';
import {
  getSeizures,
  saveSeizures,
  getMigrants,
  saveMigrants,
  getRefugees,
  saveRefugees,
  getForeigners,
  saveForeigners,
  getMovementPermits,
  saveMovementPermits,
  getCitizenshipCases,
  saveCitizenshipCases,
  getMonitoredCompanies,
  saveMonitoredCompanies,
  getCorrespondence,
  saveCorrespondence,
  getAuditLogs,
  addAuditLog,
  getDeveloperSettings,
  saveDeveloperSettings,
  generateId,
  getCurrentUser,
  getTravelers,
  getCustomPorts,
  updatePortSupervisor,
  getPortOfficers,
  getAgencyVisaStats,
  syncTravelAgenciesWithVisas,
  normalizeArabic,
  cleanArabicText
} from '@/lib/storage';
import {
  notifySovereignDataUpdated,
  mapDepartmentToUnifiedCategory,
  SOVEREIGN_DATA_UPDATED_EVENT
} from '@/lib/unifiedImportHub';
import { ImportButtonWithPreview } from '@/components/FilePreviewList';
import {
  lookupPersonByPassportOrId,
  checkDuplicateEntry,
  checkLiveWatchlistMatch,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  PersonLookupResult
} from '@/lib/formIntelligence';
import {
  DraftRecoveryBanner,
  LiveFormAlertsBanner,
  SearchableCombobox,
  InlineBatchGridEditor,
  handleEnterAdvanceFocus
} from '@/components/SmartFormControls';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { MapsGroundingModal } from '@/components/MapsGroundingPanel';
import {
  PassportSeizure,
  UndocumentedMigrant,
  RefugeeRecord,
  ForeignerResident,
  InternalMovementPermit,
  CitizenshipAndLegalCase,
  MonitoredCompany,
  OfficialCorrespondence,
  AuditLogEntity,
  DeveloperSystemSettings,
  PassportTimelineStatus,
  PortOfficer
} from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { exportToExcel, exportToPDF, handlePrint } from '@/lib/exportUtils';
import {
  ShieldCheck,
  Plane,
  Truck,
  Anchor,
  FileText,
  AlertTriangle,
  UserX,
  Users,
  Compass,
  Building,
  Mail,
  Sliders,
  CheckCircle,
  Clock,
  Search,
  Plus,
  Printer,
  Download,
  Eye,
  FileSpreadsheet,
  Stamp,
  UserCheck,
  ChevronRight,
  Sparkles,
  MapPin,
  Lock,
  ArrowRightLeft,
  Building2,
  Edit2,
  RefreshCw,
  Tag,
  Calendar
} from 'lucide-react';

interface SovereignModulesHubProps {
  initialModule?: 'ports' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'permits' | 'citizenship' | 'companies' | 'correspondence' | 'audit' | 'developer' | 'intelligence';
}

export const SovereignModulesHub: React.FC<SovereignModulesHubProps> = ({ initialModule }) => {
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramModule = searchParams.get('module') as any;

  // Active module tab
  const [activeModule, setActiveModule] = useState<
    'ports' | 'seizures' | 'migrants' | 'refugees' | 'foreigners' | 'permits' | 'citizenship' | 'companies' | 'correspondence' | 'audit' | 'developer' | 'intelligence'
  >(initialModule || paramModule || 'ports');

  useEffect(() => {
    if (initialModule) {
      setActiveModule(initialModule);
    } else if (paramModule) {
      setActiveModule(paramModule);
    }
  }, [initialModule, paramModule]);

  // Datasets state
  const [seizures, setSeizures] = useState<PassportSeizure[]>(getSeizures);
  const [migrants, setMigrants] = useState<UndocumentedMigrant[]>(getMigrants);
  const [refugees, setRefugees] = useState<RefugeeRecord[]>(getRefugees);
  const [foreigners, setForeigners] = useState<ForeignerResident[]>(getForeigners);
  const [permits, setPermits] = useState<InternalMovementPermit[]>(getMovementPermits);
  const [citizenshipCases, setCitizenshipCases] = useState<CitizenshipAndLegalCase[]>(getCitizenshipCases);
  const [companies, setCompanies] = useState<MonitoredCompany[]>(getMonitoredCompanies);
  const [correspondences, setCorrespondences] = useState<OfficialCorrespondence[]>(getCorrespondence);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntity[]>(getAuditLogs);
  const [devSettings, setDevSettings] = useState<DeveloperSystemSettings>(getDeveloperSettings);
  const [travelers, setTravelers] = useState(getTravelers);

  // Dynamic Sovereign Ports & Officers state
  const [portsList, setPortsList] = useState<SovereignPort[]>([]);
  const [registeredOfficers, setRegisteredOfficers] = useState<PortOfficer[]>([]);
  const [portSupervisorDialogOpen, setPortSupervisorDialogOpen] = useState(false);
  const [selectedPortForSupervisor, setSelectedPortForSupervisor] = useState<SovereignPort | null>(null);
  const [supervisorNameInput, setSupervisorNameInput] = useState('');

  const refreshAllData = () => {
    setSeizures(getSeizures());
    setMigrants(getMigrants());
    setRefugees(getRefugees());
    setForeigners(getForeigners());
    setPermits(getMovementPermits());
    setCitizenshipCases(getCitizenshipCases());
    setCompanies(getMonitoredCompanies());
    setCorrespondences(getCorrespondence());
    setTravelers(getTravelers());
    setAuditLogs(getAuditLogs());
    setPortsList(getCustomPorts());
    setRegisteredOfficers(getPortOfficers());
  };

  useEffect(() => {
    setPortsList(getCustomPorts());
    setRegisteredOfficers(getPortOfficers());
    const handleDataUpdated = () => refreshAllData();
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleDataUpdated);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleDataUpdated);
  }, []);

  const handleSavePortSupervisor = () => {
    if (!selectedPortForSupervisor) return;
    const updated = updatePortSupervisor(selectedPortForSupervisor.id, supervisorNameInput.trim());
    setPortsList(updated);
    setPortSupervisorDialogOpen(false);
    toast({
      title: 'تم تحديث ضابط المنفذ',
      description: `تم إدراج الضابط المسؤول لمنفذ ${selectedPortForSupervisor.name}`
    });
  };

  // Search filter
  const [search, setSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [companyTypeFilter, setCompanyTypeFilter] = useState<string>('الكل');
  const [selectedAgencyForVisas, setSelectedAgencyForVisas] = useState<MonitoredCompany | null>(null);
  const [agencyVisaStatusFilter, setAgencyVisaStatusFilter] = useState<'الكل' | 'مؤشر' | 'مرتجع'>('الكل');
  const [agencyVisaSearch, setAgencyVisaSearch] = useState('');

  const closeAgencyVisasModal = () => {
    setSelectedAgencyForVisas(null);
    if (searchParams.has('agency') || searchParams.has('agencyId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('agency');
      next.delete('agencyId');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const qAgencyId = searchParams.get('agencyId');
    const qAgencyName = searchParams.get('agency');
    if (qAgencyId || qAgencyName) {
      const matched = companies.find(c =>
        (qAgencyId && c.id === qAgencyId) ||
        (qAgencyName && normalizeArabic(c.companyName) === normalizeArabic(qAgencyName))
      );
      if (matched) {
        setSelectedAgencyForVisas(matched);
      } else if (qAgencyName) {
        setCompanySearch(qAgencyName);
      }
    }
  }, [searchParams, companies]);

  const handleSyncAgenciesWithVisas = () => {
    const res = syncTravelAgenciesWithVisas();
    refreshAllData();
    notifySovereignDataUpdated('companies');
    notifySovereignDataUpdated('traveler');
    toast({
      title: 'تمت مزامنة وربط وكالات السفر بالتأشيرات',
      description: `تم إنشاء ${res.createdAgencies.length} وكالة جديدة وربط ${res.linkedRecords} سجل تأشيرة بنجاح.`
    });
  };

  // Modals
  const [newSeizureOpen, setNewSeizureOpen] = useState(false);
  const [newMigrantOpen, setNewMigrantOpen] = useState(false);
  const [newRefugeeOpen, setNewRefugeeOpen] = useState(false);
  const [newForeignerOpen, setNewForeignerOpen] = useState(false);
  const [newPermitOpen, setNewPermitOpen] = useState(false);
  const [newCitizenshipOpen, setNewCitizenshipOpen] = useState(false);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCorrespondenceOpen, setNewCorrespondenceOpen] = useState(false);
  const [viewPermitItem, setViewPermitItem] = useState<InternalMovementPermit | null>(null);
  const [mapsHubModal, setMapsHubModal] = useState<{
    isOpen: boolean;
    defaultQuery: string;
    title: string;
    applyToPermitRoute?: boolean;
  }>({ isOpen: false, defaultQuery: '', title: '' });

  // Batch entry & draft recovery state
  const [seizureBatchMode, setSeizureBatchMode] = useState(false);
  const [seizureBatchRows, setSeizureBatchRows] = useState<
    { travelerName: string; passportNumber: string; nationality: string; reason: string }[]
  >([{ travelerName: '', passportNumber: '', nationality: 'اليمن', reason: '' }]);
  const [permitPassengers, setPermitPassengers] = useState<
    { fullName: string; passportNumber: string; nationality: string; role: string }[]
  >([]);
  const [pendingHubDraft, setPendingHubDraft] = useState<{ module: string; data: any; savedAt: string } | null>(null);

  // Forms
  const [seizureForm, setSeizureForm] = useState<Partial<PassportSeizure>>({
    travelerName: '',
    passportNumber: '',
    nationality: 'اليمن',
    seizurePort: 'مطار صنعاء الدولي',
    officerInCharge: currentUser?.name || localStorage.getItem('config_default_officer') || 'ضابط المناوبة بالمنفذ',
    reason: '',
    status: 'جديد',
    referredTo: 'فرع استخبارات الشرطة'
  });

  const [migrantForm, setMigrantForm] = useState<Partial<UndocumentedMigrant>>({
    fullName: '',
    nationality: 'إثيوبيا',
    countryOfOrigin: 'إثيوبيا',
    infiltrationPoint: 'ساحل ذباب - باب المندب',
    gender: 'ذكر',
    approximateAge: 25,
    medicalCheckStatus: 'سليم',
    shelterCenter: 'مركز إيواء عمران'
  });

  const [permitForm, setPermitForm] = useState<Partial<InternalMovementPermit>>({
    delegationName: '',
    organizationType: 'منظمة أمم متحدة (UN)',
    authorizedRoute: 'صنعاء -> ذمار -> إب -> تعز',
    delegationHead: '',
    passportNumber: '',
    passengersCount: 4,
    securityEscortNeeded: true
  });

  const [corrForm, setCorrForm] = useState<Partial<OfficialCorrespondence>>({
    letterType: 'طلب تحري أمني',
    recipientEntity: 'الأخ/ مدير فرع استخبارات الشرطة المحترم',
    referenceText: 'عطفاً على مذكرة المنفذ بتاريخ اليوم',
    subject: '',
    introClause: 'نفيدكم علماً بأنه تم ضبط حالة اشتباه تتطلب المباينة الجنائية.',
    actionRequired: 'وعليه نرجو التكرم بالتوجيه بالتحري وموافاتنا برأيكم الأمني.',
    signatoryTitle: 'مدير عام المنافذ والرقابة الحدودية',
    signatoryName: currentUser?.name || localStorage.getItem('config_director_name') || 'مدير عام المنافذ والرقابة الحدودية'
  });

  const [refugeeForm, setRefugeeForm] = useState<Partial<RefugeeRecord>>({
    unhcrNumber: '',
    fullName: '',
    nationality: 'الصومال',
    familyMembersCount: 1,
    securityVettingStatus: 'مبرأ ومطابق',
    permitStatus: 'ساري',
    permitExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    residentialAddress: 'أمانة العاصمة - صنعاء',
    phone: ''
  });

  const [foreignerForm, setForeignerForm] = useState<Partial<ForeignerResident>>({
    fullName: '',
    passportNumber: '',
    nationality: 'الهند',
    employer: '',
    profession: '',
    entryPort: 'مطار صنعاء الدولي',
    residenceExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    medicalExamResult: 'لائق طبياً',
    reEntryVisaStatus: 'سارية',
    securityClearanceStatus: 'معتمد'
  });

  const [citizenshipForm, setCitizenshipForm] = useState<Partial<CitizenshipAndLegalCase>>({
    serviceType: 'زواج يمني من أجنبية',
    applicantName: '',
    applicantIdOrPassport: '',
    applicantNationality: 'اليمن',
    spouseOrBeneficiaryName: '',
    spouseNationality: '',
    targetDaysSla: 20,
    status: 'جديد',
    investigatingOfficer: currentUser?.name || localStorage.getItem('config_vetting_officer') || 'ضابط المباينة والتحقيق',
    notes: ''
  });

  const [companyForm, setCompanyForm] = useState<Partial<MonitoredCompany>>({
    companyName: '',
    commercialRecord: '',
    type: 'شركات ووكالات السفر والسياحة',
    ownerName: '',
    supervisorName: '',
    securityClearanceStatus: 'معتمد وساري',
    governorate: 'صنعاء',
    address: '',
    phone: ''
  });

  // Draft auto-save effects for active modals
  useEffect(() => {
    if (newSeizureOpen && (seizureForm.travelerName || seizureForm.passportNumber)) {
      saveFormDraft('hub_seizure_v1', seizureForm);
    }
  }, [newSeizureOpen, seizureForm]);

  useEffect(() => {
    if (newPermitOpen && (permitForm.delegationName || permitForm.delegationHead)) {
      saveFormDraft('hub_permit_v1', { permitForm, permitPassengers });
    }
  }, [newPermitOpen, permitForm, permitPassengers]);

  useEffect(() => {
    if (newForeignerOpen && (foreignerForm.fullName || foreignerForm.passportNumber)) {
      saveFormDraft('hub_foreigner_v1', foreignerForm);
    }
  }, [newForeignerOpen, foreignerForm]);

  useEffect(() => {
    if (newCitizenshipOpen && (citizenshipForm.applicantName || citizenshipForm.applicantIdOrPassport)) {
      saveFormDraft('hub_citizenship_v1', citizenshipForm);
    }
  }, [newCitizenshipOpen, citizenshipForm]);

  const openModalWithDraft = (moduleKey: string, openSetter: (v: boolean) => void) => {
    const draft = loadFormDraft<any>(moduleKey);
    setPendingHubDraft(draft ? { module: moduleKey, data: draft.data, savedAt: draft.savedAt } : null);
    openSetter(true);
  };

  // Cross-module workflow helpers
  const openPrefilledCorrespondence = (params: {
    subject: string;
    referenceText: string;
    introClause: string;
    actionRequired?: string;
  }) => {
    setCorrForm((prev) => ({
      ...prev,
      letterType: 'طلب تحري أمني',
      subject: params.subject,
      referenceText: params.referenceText,
      introClause: params.introClause,
      actionRequired: params.actionRequired || 'وعليه نرجو التكرم بالاطلاع والتوجيه بإجراء التحري اللازم وموافاتنا.'
    }));
    setNewCorrespondenceOpen(true);
  };

  const handleDeliverSeizureWithReceipt = (sz: PassportSeizure) => {
    const updated = seizures.map((s) =>
      s.id === sz.id ? { ...s, status: 'تم التسليم' as PassportTimelineStatus, updatedAt: new Date().toISOString() } : s
    );
    setSeizures(updated);
    saveSeizures(updated);

    const receiptNum = `سند-تسليم-2026-00${correspondences.length + 43}`;
    const receiptLetter: OfficialCorrespondence = {
      id: generateId(),
      incomingOutgoingNumber: receiptNum,
      letterType: 'مذكرة رسمية',
      gregorianDate: new Date().toISOString().split('T')[0],
      hijriDate: 'مؤرخ آلياً',
      senderEntity: `مصلحة الهجرة والجوازات - ${sz.seizurePort}`,
      recipientEntity: `صاحب الجواز / ${sz.travelerName}`,
      referenceText: `بشأن تسليم الجواز المحرر بموجب محضر ضبط رقم (${sz.recordNumber})`,
      subject: `سند تسليم وإخلاء جواز سفر رقم ${sz.passportNumber}`,
      introClause: `نشهد بأنه تم استكمال الفحص والمباينة وتسليم الجواز لصاحبه (${sz.travelerName}) بحالة سليمة.`,
      actionRequired: 'حرر للعلم وإغلاق القيد بالمنفذ.',
      closingClause: 'التوقيع بالاستلام / ضابط المنفذ،،،',
      signatoryTitle: 'ضابط المناوبة وتسليم المضبوطات',
      signatoryName: currentUser?.name || sz.officerInCharge,
      isUrgent: false,
      status: 'معتمد ومرسل',
      linkedEntityId: sz.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const nextCorr = [receiptLetter, ...correspondences];
    setCorrespondences(nextCorr);
    saveCorrespondence(nextCorr);
    addAuditLog('تعديل', 'المضبوطات والجوازات', `تسليم الجواز رقم ${sz.passportNumber} وإصدار سند تسليم ${receiptNum}`, sz.id);
    toast({
      title: 'تم التسليم وإصدار السند بنجاح',
      description: `تم تحديث المحضر إلى (تم التسليم) وإصدار السند رقم ${receiptNum}`
    });
  };

  // Action handlers
  const handleSaveSeizure = () => {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    if (seizureBatchMode) {
      const validRows = seizureBatchRows.filter((r) => r.travelerName.trim() && r.passportNumber.trim());
      if (validRows.length === 0) {
        toast({ title: 'خطأ', description: 'أدخل صفاً واحداً على الأقل يحتوي على الاسم ورقم الجواز', variant: 'destructive' });
        return;
      }
      const batchRecords: PassportSeizure[] = validRows.map((row, idx) => ({
        id: generateId(),
        recordNumber: `محضر-2026-00${seizures.length + 15 + idx}`,
        travelerName: row.travelerName.trim(),
        passportNumber: row.passportNumber.trim(),
        nationality: row.nationality.trim() || 'اليمن',
        seizurePort: seizureForm.seizurePort || 'مطار صنعاء الدولي',
        seizureDate: today,
        officerInCharge: seizureForm.officerInCharge || currentUser?.name || 'ضابط المناوبة بالمنفذ',
        reason: row.reason.trim() || seizureForm.reason || 'ضبط جماعي للفحص والمباينة',
        status: (seizureForm.status as PassportTimelineStatus) || 'جديد',
        referredTo: seizureForm.referredTo as any,
        referralDate: today,
        referralNotes: 'قيد جماعي بالمنفذ',
        createdAt: now,
        updatedAt: now
      }));
      const updated = [...batchRecords, ...seizures];
      setSeizures(updated);
      saveSeizures(updated);
      addAuditLog('إنشاء', 'المضبوطات والجوازات', `قيد جماعي لعدد ${batchRecords.length} جوازات مضبوطة بالمنفذ`, batchRecords[0].id);
      clearFormDraft('hub_seizure_v1');
      setNewSeizureOpen(false);
      setSeizureBatchMode(false);
      setSeizureBatchRows([{ travelerName: '', passportNumber: '', nationality: 'اليمن', reason: '' }]);
      toast({ title: 'تم حفظ المحاضر الجماعية بنجاح', description: `تم قيد ${batchRecords.length} جواز مضبوط.` });
      return;
    }

    if (!seizureForm.travelerName || !seizureForm.passportNumber) {
      toast({ title: 'خطأ', description: 'اسم المسافر ورقم الجواز مطلوبان', variant: 'destructive' });
      return;
    }
    const newRecord: PassportSeizure = {
      id: generateId(),
      recordNumber: `محضر-2026-00${seizures.length + 15}`,
      travelerName: seizureForm.travelerName || '',
      passportNumber: seizureForm.passportNumber || '',
      nationality: seizureForm.nationality || 'اليمن',
      seizurePort: seizureForm.seizurePort || 'مطار صنعاء الدولي',
      seizureDate: today,
      officerInCharge: seizureForm.officerInCharge || currentUser?.name || localStorage.getItem('config_default_officer') || 'ضابط المناوبة بالمنفذ',
      reason: seizureForm.reason || 'اشتباه تزوير أو مخالفة شروط العبور',
      status: (seizureForm.status as PassportTimelineStatus) || 'جديد',
      referredTo: seizureForm.referredTo as any,
      referralDate: today,
      referralNotes: 'رقم القيد الأمني: 001 / ملف التحقيق المركزي: 001',
      createdAt: now,
      updatedAt: now
    };
    const updated = [newRecord, ...seizures];
    setSeizures(updated);
    saveSeizures(updated);
    addAuditLog('إنشاء', 'المضبوطات والجوازات', `قيد محضر ضبط جواز رقم ${newRecord.passportNumber} بالمنفذ`, newRecord.id);
    clearFormDraft('hub_seizure_v1');
    setNewSeizureOpen(false);
    toast({ title: 'تم حفظ محضر الضبط', description: `تم إصدار الرقم: ${newRecord.recordNumber}` });
  };

  const handleUpdateSeizureStatus = (id: string, newStatus: PassportTimelineStatus) => {
    const updated = seizures.map((s) => (s.id === id ? { ...s, status: newStatus, updatedAt: new Date().toISOString() } : s));
    setSeizures(updated);
    saveSeizures(updated);
    addAuditLog('تعديل', 'المضبوطات والجوازات', `تحديث الخط الزمني للمحضر إلى: ${newStatus}`, id);
    toast({ title: 'تم تحديث الخط الزمني للمضبوطات' });
  };

  const handleSaveMigrant = () => {
    if (!migrantForm.fullName) {
      toast({ title: 'خطأ', description: 'الاسم الكامل مطلوب', variant: 'destructive' });
      return;
    }
    const newRecord: UndocumentedMigrant = {
      id: generateId(),
      fileNumber: `هجرة-2026-00${migrants.length + 91}`,
      fullName: migrantForm.fullName || '',
      nationality: migrantForm.nationality || 'إثيوبيا',
      countryOfOrigin: migrantForm.countryOfOrigin || 'إثيوبيا',
      infiltrationPoint: migrantForm.infiltrationPoint || 'ساحل ذباب',
      apprehensionDate: new Date().toISOString().split('T')[0],
      apprehensionPlace: 'القطاع الساحلي الغربي',
      gender: (migrantForm.gender as any) || 'ذكر',
      approximateAge: Number(migrantForm.approximateAge) || 25,
      medicalCheckStatus: (migrantForm.medicalCheckStatus as any) || 'سليم',
      fingerprintRegistered: true,
      shelterCenter: migrantForm.shelterCenter || 'مركز إيواء عمران',
      deportationStatus: 'قيد الإيواء والتحقيق',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...migrants];
    setMigrants(updated);
    saveMigrants(updated);
    addAuditLog('إنشاء', 'المهاجرون غير الشرعيين', `قيد وضبط مهاجر غير نظامي: ${newRecord.fullName}`, newRecord.id);
    setNewMigrantOpen(false);
    toast({ title: 'تم قيد المهاجر بنجاح', description: `رقم الملف: ${newRecord.fileNumber}` });
  };

  const applyPermitDurationPreset = (days: number) => {
    const start = permitForm.validFrom || new Date().toISOString().split('T')[0];
    const startMs = new Date(start).getTime();
    const end = new Date((isNaN(startMs) ? Date.now() : startMs) + days * 86400000).toISOString().split('T')[0];
    setPermitForm((prev) => ({ ...prev, validFrom: start, validTo: end }));
  };

  const handleSavePermit = () => {
    if (!permitForm.delegationName || !permitForm.delegationHead) {
      toast({ title: 'خطأ', description: 'اسم الوفد ورئيس الوفد مطلوبان', variant: 'destructive' });
      return;
    }
    const validPassengers = permitPassengers.filter((p) => p.fullName.trim() || p.passportNumber.trim());
    const code = `تصريح-أمني-2026-00${permits.length + 46}`;
    const newRecord: InternalMovementPermit = {
      id: generateId(),
      permitCode: code,
      delegationName: permitForm.delegationName || '',
      organizationType: (permitForm.organizationType as any) || 'منظمة أمم متحدة (UN)',
      authorizedRoute: permitForm.authorizedRoute || 'صنعاء -> ذمار -> إب -> تعز',
      allowedCheckpoints: ['نقطة يسلح', 'نقطة نجد الأحمر', 'نقطة مفرق ذمار'],
      vehicleDetails: [{ plate: 'أمم متحدة 105', model: 'Toyota Prado', color: 'أبيض' }],
      delegationHead: permitForm.delegationHead || '',
      passportNumber: permitForm.passportNumber || 'UN-PASSPORT',
      passengersCount: validPassengers.length > 0 ? validPassengers.length + 1 : Number(permitForm.passengersCount) || 4,
      passengersList: validPassengers,
      securityEscortNeeded: Boolean(permitForm.securityEscortNeeded),
      validFrom: permitForm.validFrom || new Date().toISOString().split('T')[0],
      validTo: permitForm.validTo || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      accommodationPlace: 'مقر المنظمة الرسمي بالمحافظة',
      qrVerificationCode: `PERMIT:${code}:${permitForm.delegationHead}`,
      approvalStatus: 'معتمد رسمياً',
      approvedBy: currentUser?.name || 'مدير عام العمليات',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...permits];
    setPermits(updated);
    saveMovementPermits(updated);
    addAuditLog('إنشاء', 'تصاريح التنقل', `إصدار تصريح أمني للوفد: ${newRecord.delegationName}`, newRecord.id);
    clearFormDraft('hub_permit_v1');
    setPermitPassengers([]);
    setNewPermitOpen(false);
    setViewPermitItem(newRecord);
    toast({ title: 'تم إصدار التصريح الأمني بنجاح', description: code });
  };

  const handleSaveCorrespondence = () => {
    if (!corrForm.subject) {
      toast({ title: 'خطأ', description: 'موضوع البرقية/المذكرة مطلوب', variant: 'destructive' });
      return;
    }
    const inOut = `ص-2026-00${correspondences.length + 43}`;
    const newRecord: OfficialCorrespondence = {
      id: generateId(),
      incomingOutgoingNumber: inOut,
      letterType: (corrForm.letterType as any) || 'طلب تحري أمني',
      gregorianDate: new Date().toISOString().split('T')[0],
      hijriDate: '26 جمادى الأولى 1448هـ',
      senderEntity: 'مصلحة الهجرة والجوازات والجنسية - الإدارة العامة للمنافذ والرقابة الحدودية',
      recipientEntity: corrForm.recipientEntity || 'الأخ/ مدير فرع استخبارات الشرطة المحترم',
      referenceText: corrForm.referenceText || 'بشأن مباينة أمنية عاجلة',
      subject: corrForm.subject || '',
      introClause: corrForm.introClause || 'نفيدكم علماً بأنه تم ضبط حالة اشتباه.',
      actionRequired: corrForm.actionRequired || 'يرجى التكرم بالاطلاع والتوجيه بالتحري.',
      closingClause: 'وتقبلوا خالص التحية والتقدير،،،',
      signatoryTitle: corrForm.signatoryTitle || 'مدير عام المنافذ والرقابة الحدودية',
      signatoryName: corrForm.signatoryName || currentUser?.name || localStorage.getItem('config_director_name') || 'مدير عام المنافذ والرقابة الحدودية',
      isUrgent: true,
      status: 'معتمد ومرسل',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...correspondences];
    setCorrespondences(updated);
    saveCorrespondence(updated);
    addAuditLog('إنشاء', 'المكاتبات والبرقيات', `توليد برقية رسمية رقم ${inOut} بشأن ${newRecord.subject}`, newRecord.id);
    setNewCorrespondenceOpen(false);
    toast({ title: 'تم تصدير المكاتبة الرسمية', description: inOut });
  };

  const handleSaveRefugee = () => {
    if (!refugeeForm.fullName || !refugeeForm.unhcrNumber) {
      toast({ title: 'خطأ', description: 'اسم اللاجئ ورقم ملف UNHCR مطلوبان', variant: 'destructive' });
      return;
    }
    const permitNo = `تصريح-لجوء-2026-0${refugees.length + 13}`;
    const newRecord: RefugeeRecord = {
      id: generateId(),
      unhcrNumber: refugeeForm.unhcrNumber || '',
      temporaryPermitNumber: permitNo,
      fullName: refugeeForm.fullName || '',
      nationality: refugeeForm.nationality || 'الصومال',
      arrivalDate: new Date().toISOString().split('T')[0],
      familyMembersCount: Number(refugeeForm.familyMembersCount) || 1,
      securityVettingStatus: (refugeeForm.securityVettingStatus as any) || 'مبرأ ومطابق',
      vettingOfficer: currentUser?.name || 'ضابط شؤون اللاجئين',
      permitStatus: (refugeeForm.permitStatus as any) || 'ساري',
      permitExpiryDate: refugeeForm.permitExpiryDate || '2027-12-31',
      qrVerificationCode: `REF:${refugeeForm.unhcrNumber}:${refugeeForm.fullName}`,
      residentialAddress: refugeeForm.residentialAddress || 'صنعاء',
      phone: refugeeForm.phone || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...refugees];
    setRefugees(updated);
    saveRefugees(updated);
    addAuditLog('إنشاء', 'اللاجئون', `إصدار بطاقة لجوء مؤقتة رقم ${permitNo} للاجئ ${newRecord.fullName}`, newRecord.id);
    setNewRefugeeOpen(false);
    toast({ title: 'تم تسجيل ملف اللاجئ بنجاح', description: permitNo });
  };

  const handleSaveForeigner = () => {
    if (!foreignerForm.fullName || !foreignerForm.passportNumber) {
      toast({ title: 'خطأ', description: 'الاسم الكامل ورقم الجواز مطلوبان', variant: 'destructive' });
      return;
    }
    const resNo = `إقامة-2026-0${foreigners.length + 342}`;
    const newRecord: ForeignerResident = {
      id: generateId(),
      residenceNumber: resNo,
      fullName: foreignerForm.fullName || '',
      passportNumber: foreignerForm.passportNumber || '',
      nationality: foreignerForm.nationality || 'الهند',
      employer: foreignerForm.employer || 'جهة عمل مرخصة',
      profession: foreignerForm.profession || 'خبير / موظف',
      entryDate: new Date().toISOString().split('T')[0],
      entryPort: foreignerForm.entryPort || 'مطار صنعاء الدولي',
      residenceExpiryDate: foreignerForm.residenceExpiryDate || '2027-12-31',
      medicalExamResult: (foreignerForm.medicalExamResult as any) || 'لائق طبياً',
      reEntryVisaStatus: (foreignerForm.reEntryVisaStatus as any) || 'سارية',
      securityClearanceStatus: (foreignerForm.securityClearanceStatus as any) || 'معتمد',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...foreigners];
    setForeigners(updated);
    saveForeigners(updated);
    addAuditLog('إنشاء', 'الوافدون الأجانب', `تسجيل إقامة وافد أجنبي برقم ${resNo} لـ ${newRecord.fullName}`, newRecord.id);
    clearFormDraft('hub_foreigner_v1');
    setNewForeignerOpen(false);
    toast({ title: 'تم تسجيل إقامة الوافد الأجنبي', description: resNo });
  };

  const handleSaveCitizenship = () => {
    if (!citizenshipForm.applicantName || !citizenshipForm.applicantIdOrPassport) {
      toast({ title: 'خطأ', description: 'اسم مقدم الطلب ورقم الهوية/الجواز مطلوبان', variant: 'destructive' });
      return;
    }
    const caseNo = `معاملة-2026-0${citizenshipCases.length + 106}`;
    const slaDays = Number(citizenshipForm.targetDaysSla) || 20;
    const targetDate = new Date(Date.now() + slaDays * 86400000).toISOString().split('T')[0];
    const newRecord: CitizenshipAndLegalCase = {
      id: generateId(),
      caseNumber: caseNo,
      serviceType: (citizenshipForm.serviceType as any) || 'زواج يمني من أجنبية',
      applicantName: citizenshipForm.applicantName || '',
      applicantIdOrPassport: citizenshipForm.applicantIdOrPassport || '',
      applicantNationality: citizenshipForm.applicantNationality || 'اليمن',
      spouseOrBeneficiaryName: citizenshipForm.spouseOrBeneficiaryName || '',
      spouseNationality: citizenshipForm.spouseNationality || '',
      submissionDate: new Date().toISOString().split('T')[0],
      targetCompletionDate: targetDate,
      targetDaysSla: slaDays,
      status: (citizenshipForm.status as any) || 'جديد',
      investigatingOfficer: citizenshipForm.investigatingOfficer || currentUser?.name || 'ضابط التحقيق',
      notes: citizenshipForm.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...citizenshipCases];
    setCitizenshipCases(updated);
    saveCitizenshipCases(updated);
    addAuditLog('إنشاء', 'الجنسية ووثائق السفر', `فتح معاملة ${newRecord.serviceType} رقم ${caseNo}`, newRecord.id);
    clearFormDraft('hub_citizenship_v1');
    setNewCitizenshipOpen(false);
    toast({ title: 'تم قيد معاملة الجنسية/الزواج بنجاح', description: caseNo });
  };

  const handleSaveCompany = () => {
    if (!companyForm.companyName || !companyForm.commercialRecord) {
      toast({ title: 'خطأ', description: 'اسم الشركة والسجل التجاري مطلوبان', variant: 'destructive' });
      return;
    }
    const licNo = `ترخيص-أمني-2026-0${companies.length + 89}`;
    const newRecord: MonitoredCompany = {
      id: generateId(),
      licenseNumber: licNo,
      companyName: companyForm.companyName || '',
      commercialRecord: companyForm.commercialRecord || '',
      type: (companyForm.type as any) || 'شركات ووكالات السفر والسياحة',
      ownerName: companyForm.ownerName || '',
      supervisorName: companyForm.supervisorName || '',
      securityClearanceStatus: (companyForm.securityClearanceStatus as any) || 'معتمد وساري',
      lastInspectionDate: new Date().toISOString().split('T')[0],
      violationsCount: 0,
      violationsLog: [],
      governorate: companyForm.governorate || 'صنعاء',
      address: companyForm.address || '',
      phone: companyForm.phone || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...companies];
    setCompanies(updated);
    saveMonitoredCompanies(updated);
    addAuditLog('إنشاء', 'الرقابة على الشركات', `إدراج منشأة ${newRecord.companyName} برقم ${licNo}`, newRecord.id);
    setNewCompanyOpen(false);
    toast({ title: 'تم اعتماد وإدراج الشركة/الوكالة', description: licNo });
  };

  return (
    <div className="space-y-6">
      {/* Sovereign Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-primary to-slate-900 text-white p-5 rounded-2xl shadow-md border border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-white/10 rounded-2xl border border-white/20 shrink-0">
            <img src="./assets/aistudio/ic_launcher_e65b28d6.png" alt="الشعار السيادي" className="h-10 w-auto object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">منظومة الوحدات السيادية الـ 14</h1>
              <Badge className="bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 text-xs">
                Sovereign Central
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              الرقابة المركزية على المنافذ الـ {SOVEREIGN_PORTS.length}، استخبارات الشرطة، قضايا الجنسية والزواج، والمضبوطات والتصاريح الأمنية.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch lg:self-auto flex-wrap">
          <Link to="/mofa-visas">
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 shadow-sm rounded-xl"
            >
              <Building2 className="h-4 w-4" />
              <span>مذكرات وتأشيرات الخارجية والمنظمات</span>
            </Button>
          </Link>

          <ImportButtonWithPreview
            category={mapDepartmentToUnifiedCategory(activeModule)}
            sourceTitle="منظومة الوحدات السيادية"
            buttonLabel="استيراد ملفات متعددة"
            buttonClassName="bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-sm rounded-xl"
            centerShortcutClassName="bg-white/10 hover:bg-white/20 text-white border-white/25 rounded-xl"
          />

          <div className="bg-black/30 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <span className="text-slate-400 block text-[10px]">المستخدم الحالي:</span>
            <span className="font-bold text-amber-300">{currentUser?.name}</span>
            <span className="text-[10px] text-white/80 block">({currentUser?.role || 'مدير عام'})</span>
          </div>
        </div>
      </div>

      {/* 14 Sovereign Modules Nav Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto adaptive-scroll-region pb-2 border-b">
        {[
          { id: 'ports', label: `المنافذ الـ ${SOVEREIGN_PORTS.length} السيادية`, icon: Plane, count: SOVEREIGN_PORTS.length },
          { id: 'seizures', label: 'محاضر الجوازات المضبوطة', icon: Stamp, count: seizures.length },
          { id: 'migrants', label: 'المهاجرون غير الشرعيين', icon: UserX, count: migrants.length },
          { id: 'refugees', label: 'اللاجئون و UNHCR', icon: Users, count: refugees.length },
          { id: 'foreigners', label: 'الوافدون الأجانب', icon: UserCheck, count: foreigners.length },
          { id: 'permits', label: 'تصاريح التحرك الداخلي', icon: Compass, count: permits.length },
          { id: 'citizenship', label: 'الجنسية والزواج المختلط', icon: FileText, count: citizenshipCases.length },
          { id: 'companies', label: 'الرقابة على الشركات الـ 5', icon: Building, count: companies.length },
          { id: 'intelligence', label: 'فرع استخبارات الشرطة', icon: ShieldCheck, count: 'مركزي 001' },
          { id: 'correspondence', label: 'البرقيات والمكاتبات', icon: Mail, count: correspondences.length },
          { id: 'audit', label: 'سجل العمليات الرقابي', icon: Clock, count: auditLogs.length },
          { id: 'developer', label: 'وحدة المطور وتخصيص EAV', icon: Sliders, count: 'Super' },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveModule(item.id as any);
                setSearch('');
              }}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Module 1 & 4: 13 Sovereign Ports Dashboard */}
      {activeModule === 'ports' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">حالة المنافذ السيادية الـ {SOVEREIGN_PORTS.length} الرسمية</h2>
              <p className="text-xs text-muted-foreground">7 منافذ جوية · 5 منافذ برية · 6 موانئ بحرية رئيسية مع مراقبة الكثافة اللحظية وضباط المناوبة.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setMapsHubModal({
                    isOpen: true,
                    defaultQuery: 'مواقع المنافذ البرية والجوية والبحرية في الجمهورية اليمنية',
                    title: 'الخريطة المرجعية للمنافذ السيادية اليمنية',
                  })
                }
                className="gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50 font-bold"
              >
                <MapPin className="h-3.5 w-3.5" /> التحقق الجغرافي للمنافذ (Maps)
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportToExcel(SOVEREIGN_PORTS, `المنافذ_السيادية_الـ${SOVEREIGN_PORTS.length}`)}>
                <Download className="h-3.5 w-3.5 ml-1" /> تصدير الكشف
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(portsList.length > 0 ? portsList : SOVEREIGN_PORTS).map((port) => (
              <Card key={port.id} className="border shadow-2xs hover:shadow-md transition-all rounded-2xl overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/70 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        {port.category === 'جوي' ? <Plane className="h-4 w-4" /> : port.category === 'بري' ? <Truck className="h-4 w-4" /> : <Anchor className="h-4 w-4" />}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-900">{port.name}</CardTitle>
                        <span className="text-[10px] text-muted-foreground">{port.governorate} · كود: {port.code}</span>
                      </div>
                    </div>
                    <Badge variant={port.status === 'يعمل بكفاءة' ? 'default' : 'destructive'} className="text-[10px]">
                      {port.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">الكثافة اللحظية:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${port.currentTraffic === 'مزدحم جداً' ? 'bg-rose-100 text-rose-800' : port.currentTraffic === 'مرتفع' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {port.currentTraffic}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">الضباط المناوبون:</span>
                    <span className="font-bold text-slate-800">{port.activeOfficersCount} ضابط</span>
                  </div>

                  {/* Dynamic Port Officer Option */}
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">ضابط / مشرف المنفذ:</span>
                      {port.shiftSupervisor ? (
                        <span className="font-bold text-slate-900 text-xs">{port.shiftSupervisor}</span>
                      ) : (
                        <span className="text-amber-700 font-semibold text-[11px]">لم يُحدد الضابط بعد</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-primary font-bold hover:bg-primary/10 gap-1 border-primary/20"
                      onClick={() => {
                        setSelectedPortForSupervisor(port);
                        setSupervisorNameInput(port.shiftSupervisor || '');
                        setPortSupervisorDialogOpen(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                      {port.shiftSupervisor ? 'تغيير' : 'إدراج ضابط'}
                    </Button>
                  </div>

                  <div className="pt-2 border-t flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">الطاقة الاستيعابية:</span>
                    <span className="font-mono font-bold text-primary">{port.capacityPerDay.toLocaleString()} مسافر/يوم</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 2: Seizures & Confiscated Passports with Timeline */}
      {activeModule === 'seizures' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">محاضر الضبط والجوازات المحتجزة (Seizures & Passports)</h2>
              <p className="text-xs text-muted-foreground">خط زمني إجرائي لتتبع حالة الجواز المضبوط من لحظة الاحتجاز حتى الفحص والإحالة أو التسليم.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openModalWithDraft('hub_seizure_v1', setNewSeizureOpen)} className="gap-1.5 font-bold whitespace-nowrap shrink-0">
                <Plus className="h-4 w-4" /> إنشاء محضر ضبط جديد
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {seizures.map((sz) => (
              <Card key={sz.id} className="p-4 rounded-2xl border shadow-xs hover:border-primary/40 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b pb-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl">
                      <Stamp className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{sz.travelerName}</span>
                        <Badge variant="outline" className="font-mono text-xs">{sz.recordNumber}</Badge>
                        <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-none text-[10px]">
                          {sz.seizurePort}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        جواز سفر رقم: <strong className="font-mono text-slate-800">{sz.passportNumber}</strong> ({sz.nationality}) · الضابط: {sz.officerInCharge}
                      </p>
                    </div>
                  </div>

                  {/* Status Timeline Selector + Cross-Module Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openPrefilledCorrespondence({
                          subject: `تحري وفحص جواز سفر مضبوط رقم (${sz.passportNumber}) — ${sz.travelerName}`,
                          referenceText: `محضر ضبط رقم (${sz.recordNumber}) في ${sz.seizurePort}`,
                          introClause: `نفيدكم باحتجاز جواز السفر الموضح أعلاه بتاريخ ${sz.seizureDate} بسبب: ${sz.reason}.`
                        })
                      }
                      className="h-8 text-[11px] font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 whitespace-nowrap shrink-0"
                    >
                      برقية تحري
                    </Button>
                    {sz.status !== 'تم التسليم' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeliverSeizureWithReceipt(sz)}
                        className="h-8 text-[11px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                      >
                        تسليم وإصدار سند
                      </Button>
                    )}
                    <Select value={sz.status} onValueChange={(val: any) => handleUpdateSeizureStatus(sz.id, val)}>
                      <SelectTrigger className="h-8 text-xs font-bold w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="جديد">1. جديد</SelectItem>
                        <SelectItem value="بانتظار الفحص">2. بانتظار الفحص</SelectItem>
                        <SelectItem value="تم الفحص">3. تم الفحص</SelectItem>
                        <SelectItem value="سليم">4. سليم</SelectItem>
                        <SelectItem value="مزور">5. مزور</SelectItem>
                        <SelectItem value="محال">6. محال للتحقيق</SelectItem>
                        <SelectItem value="جاهز للتسليم">7. جاهز للتسليم</SelectItem>
                        <SelectItem value="تم التسليم">8. تم التسليم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Passport Timeline Visualizer */}
                <div className="bg-slate-50 p-3 rounded-xl border text-xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>سبب الضبط: <strong className="text-slate-800">{sz.reason}</strong></span>
                    {sz.referredTo && (
                      <span className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        محال إلى: {sz.referredTo} ({sz.referralNotes})
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{
                        width:
                          sz.status === 'جديد' ? '15%' :
                          sz.status === 'بانتظار الفحص' ? '30%' :
                          sz.status === 'تم الفحص' ? '50%' :
                          sz.status === 'مزور' || sz.status === 'سليم' ? '70%' :
                          sz.status === 'محال' ? '85%' : '100%'
                      }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 3: Undocumented Migrants */}
      {activeModule === 'migrants' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">المهاجرون غير الشرعيين وضبط التسلل</h2>
              <p className="text-xs text-muted-foreground">قيد المضبوطين، الفحص الطبي الإلزامي، البصمات العشرية، ومراكز الإيواء والترحيل.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setMapsHubModal({
                    isOpen: true,
                    defaultQuery: 'ساحل ذباب وباب المندب ومراكز الإيواء والمستشفيات القريبة في تعز والحديدة',
                    title: 'خرائط نقاط التسلل الساحلية ومراكز الإيواء',
                  })
                }
                className="gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50 font-bold whitespace-nowrap shrink-0"
              >
                <MapPin className="h-4 w-4" /> خرائط نقاط التسلل والإيواء
              </Button>
              <Button onClick={() => setNewMigrantOpen(true)} className="gap-1.5 font-bold whitespace-nowrap shrink-0">
                <Plus className="h-4 w-4" /> قيد مهاجر غير شرعي جديد
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {migrants.map((m) => (
              <Card key={m.id} className="p-4 rounded-2xl border shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{m.fullName}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{m.fileNumber} · {m.nationality}</p>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs">
                    {m.deportationStatus}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-xl">
                  <div><span className="text-muted-foreground block text-[10px]">نقطة التسلل:</span> {m.infiltrationPoint}</div>
                  <div><span className="text-muted-foreground block text-[10px]">مكان الضبط:</span> {m.apprehensionPlace}</div>
                  <div><span className="text-muted-foreground block text-[10px]">الفحص الطبي:</span> <strong className="text-emerald-700">{m.medicalCheckStatus}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">مركز الإيواء:</span> {m.shelterCenter}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 5: Refugees & UNHCR */}
      {activeModule === 'refugees' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">إدارة شؤون اللاجئين وتصاريح الحماية المؤقتة</h2>
              <p className="text-xs text-muted-foreground">ربط ملفات المفوضية السامية (UNHCR) والتحقق الأمني وإصدار بطاقات مشفرة بـ QR.</p>
            </div>
            <Button onClick={() => setNewRefugeeOpen(true)} className="gap-1.5 font-bold">
              <Plus className="h-4 w-4" /> تسجيل لاجئ وتصريح جديد
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {refugees.map((ref) => (
              <Card key={ref.id} className="p-4 rounded-2xl border shadow-xs flex gap-4 items-center">
                <div className="p-2 bg-white rounded-xl border shrink-0">
                  <QRCodeCanvas value={ref.qrVerificationCode} size={90} />
                </div>
                <div className="space-y-1 text-xs flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-sm text-slate-900">{ref.fullName}</h4>
                    <Badge className="bg-emerald-100 text-emerald-800 border-none text-[10px]">{ref.permitStatus}</Badge>
                  </div>
                  <p className="text-muted-foreground font-mono">{ref.unhcrNumber} · {ref.nationality}</p>
                  <p className="text-slate-700 text-[11px]">تصريح رقم: <strong className="font-mono">{ref.temporaryPermitNumber}</strong></p>
                  <p className="text-slate-500 text-[10px]">ساري حتى: {ref.permitExpiryDate} · الضابط: {ref.vettingOfficer}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 6: Foreigner Residents */}
      {activeModule === 'foreigners' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">شؤون الوافدين الأجانب والإقامات</h2>
              <p className="text-xs text-muted-foreground">متابعة إقامات الأجانب، جهات العمل، الفحص الطبي الإلزامي، وتأشيرات الخروج والعودة.</p>
            </div>
            <Button onClick={() => openModalWithDraft('hub_foreigner_v1', setNewForeignerOpen)} className="gap-1.5 font-bold whitespace-nowrap shrink-0">
              <Plus className="h-4 w-4" /> قيد إقامة وافد أجنبي
            </Button>
          </div>

          {/* Mobile Vertical Cards View */}
          <div className="md:hidden space-y-2.5 max-h-[65dvh] overflow-y-auto adaptive-scroll-region pl-0.5">
            {foreigners.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border rounded-xl bg-card">لا توجد إقامات مسجلة</div>
            ) : foreigners.map((f) => (
              <div key={f.id} className="bg-card border rounded-xl p-3.5 shadow-2xs space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{f.fullName}</h4>
                    <span className="font-mono font-bold text-primary text-[11px]">{f.residenceNumber}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{f.securityClearanceStatus}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2 rounded-lg text-[11px]">
                  <div><span className="text-muted-foreground block text-[10px]">الجنسية والجواز:</span> <span className="font-mono font-semibold">{f.nationality} ({f.passportNumber})</span></div>
                  <div><span className="text-muted-foreground block text-[10px]">انتهاء الإقامة:</span> <span className="font-semibold">{f.residenceExpiryDate}</span></div>
                  <div><span className="text-muted-foreground block text-[10px]">جهة العمل:</span> <span className="font-medium truncate block">{f.employer}</span></div>
                  <div><span className="text-muted-foreground block text-[10px]">الفحص الطبي:</span> <span className="text-emerald-700 font-bold">{f.medicalExamResult}</span></div>
                </div>
                <div className="pt-1 border-t flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openPrefilledCorrespondence({
                        subject: `استعلام / متابعة إقامة الوافد الأجنبي: ${f.fullName}`,
                        referenceText: `إقامة رقم (${f.residenceNumber}) - جواز (${f.passportNumber})`,
                        introClause: `نفيدكم بملف الوافد ${f.fullName} (${f.nationality}) العامل لدى ${f.employer} بمهنة ${f.profession}.`
                      })
                    }
                    className="h-7 text-[11px] font-bold text-indigo-700 border-indigo-200"
                  >
                    صياغة مذكرة متابعة
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Scrollable Table */}
          <div className="hidden md:block adaptive-table-container rounded-2xl border bg-card">
            <table className="w-full min-w-[820px] text-xs text-right">
              <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs border-b shadow-2xs">
                <tr>
                  <th className="p-3">رقم الإقامة</th>
                  <th className="p-3">الاسم الكامل</th>
                  <th className="p-3">الجنسية والجواز</th>
                  <th className="p-3">جهة العمل / الكفيل</th>
                  <th className="p-3">المهنة</th>
                  <th className="p-3">انتهاء الإقامة</th>
                  <th className="p-3">الفحص الطبي</th>
                  <th className="p-3">الحالة الأمنية</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {foreigners.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-primary">{f.residenceNumber}</td>
                    <td className="p-3 font-bold text-slate-800">{f.fullName}</td>
                    <td className="p-3 font-mono">{f.nationality} ({f.passportNumber})</td>
                    <td className="p-3">{f.employer}</td>
                    <td className="p-3">{f.profession}</td>
                    <td className="p-3 font-mono">{f.residenceExpiryDate}</td>
                    <td className="p-3 text-emerald-700 font-bold">{f.medicalExamResult}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{f.securityClearanceStatus}</Badge></td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openPrefilledCorrespondence({
                            subject: `استعلام / متابعة إقامة الوافد الأجنبي: ${f.fullName}`,
                            referenceText: `إقامة رقم (${f.residenceNumber}) - جواز (${f.passportNumber})`,
                            introClause: `نفيدكم بملف الوافد ${f.fullName} (${f.nationality}) العامل لدى ${f.employer} بمهنة ${f.profession}.`
                          })
                        }
                        className="h-7 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
                      >
                        مذكرة تحري
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Module 7: Internal Movement Permits */}
      {activeModule === 'permits' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">تصاريح التنقل والتحرك الداخلي للوفود الأجنبية والدبلوماسية</h2>
              <p className="text-xs text-muted-foreground">إصدار تصاريح خط السير الإلزامي، بيانات المرافقين، وطباعة التصريح الأمني بالختم الرسمي وكود QR.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setMapsHubModal({
                    isOpen: true,
                    defaultQuery: 'خط السير والمسافة والمدن بين صنعاء وذمار وإب وتعز',
                    title: 'الاستعلام الجغرافي لخطوط السير وتصاريح التنقل',
                    applyToPermitRoute: false,
                  })
                }
                className="gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50 font-bold whitespace-nowrap shrink-0"
              >
                <MapPin className="h-4 w-4" /> فحص خطوط السير (Maps)
              </Button>
              <Button onClick={() => openModalWithDraft('hub_permit_v1', setNewPermitOpen)} className="gap-1.5 font-bold whitespace-nowrap shrink-0">
                <Plus className="h-4 w-4" /> إصدار تصريح أمني جديد
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {permits.map((p) => (
              <Card key={p.id} className="p-5 rounded-2xl border shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="mb-1 text-[10px] bg-primary/10 text-primary border-primary/20">{p.organizationType}</Badge>
                    <h3 className="font-bold text-base text-slate-900">{p.delegationName}</h3>
                    <p className="text-xs text-slate-500 font-mono">{p.permitCode}</p>
                  </div>
                  <QRCodeCanvas value={p.qrVerificationCode} size={65} className="p-1 border rounded-lg bg-white" />
                </div>
                <div className="text-xs space-y-1.5 bg-slate-50 p-3 rounded-xl border">
                  <div><span className="text-muted-foreground">خط السير المصرح:</span> <strong className="text-slate-800">{p.authorizedRoute}</strong></div>
                  <div><span className="text-muted-foreground">رئيس الوفد:</span> {p.delegationHead} ({p.passengersCount} ركاب)</div>
                  <div><span className="text-muted-foreground">فترة السريان:</span> من {p.validFrom} إلى {p.validTo}</div>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-emerald-700 font-bold">✓ {p.approvalStatus}</span>
                  <Button size="sm" variant="outline" onClick={() => { setViewPermitItem(p); setTimeout(() => handlePrint(), 300); }}>
                    <Printer className="h-3.5 w-3.5 ml-1" /> طباعة التصريح
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 8, 9 & 10: Visas, Citizenship & Special Travel Documents */}
      {activeModule === 'citizenship' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">الجنسية، الزواج المختلط، ووثائق السفر الخاصة</h2>
              <p className="text-xs text-muted-foreground">كتالوج الخدمات الـ 15 ومتابعة مدد الاستجابة القانونية (SLA: 20 يوماً للزواج، 3 أيام للجوازات، 30 يوماً للأمر الجمهوري).</p>
            </div>
            <Button onClick={() => openModalWithDraft('hub_citizenship_v1', setNewCitizenshipOpen)} className="gap-1.5 font-bold whitespace-nowrap shrink-0">
              <Plus className="h-4 w-4" /> قيد معاملة جنسية / زواج
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Catalog Services (15 Services) */}
            <Card className="lg:col-span-1 p-4 rounded-2xl border shadow-xs space-y-3">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> كتالوج خدمات المصلحة الـ 15 (SLA)
              </CardTitle>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {SLA_SERVICES_CATALOG.map((srv) => (
                  <div key={srv.id} className="p-2.5 rounded-xl border bg-slate-50 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{srv.name}</span>
                      <span className="text-primary font-mono">{srv.targetDays} يوم</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{srv.department}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Active Citizenship & Marriage Cases */}
            <Card className="lg:col-span-2 p-4 rounded-2xl border shadow-xs space-y-3">
              <CardTitle className="text-sm font-bold text-slate-800">معاملات الجنسية والزواج الجارية</CardTitle>
              <div className="space-y-3">
                {citizenshipCases.map((c) => (
                  <div key={c.id} className="p-3.5 rounded-xl border bg-card hover:bg-slate-50/80 transition-colors text-xs space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-sm text-slate-900">{c.serviceType}</span>
                        <p className="text-muted-foreground font-mono text-[11px]">{c.caseNumber} · صاحب الطلب: {c.applicantName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openPrefilledCorrespondence({
                              subject: `استطلاع أمني لمعاملة (${c.serviceType}) — ${c.applicantName}`,
                              referenceText: `معاملة رقم (${c.caseNumber}) - وثيقة (${c.applicantIdOrPassport})`,
                              introClause: `عطفاً على طلب ${c.serviceType} المقدم من المواطن/ ${c.applicantName} والطرف الآخر/ ${c.spouseOrBeneficiaryName || '-'}.`
                            })
                          }
                          className="h-7 text-[11px] font-bold text-indigo-700 border-indigo-200 whitespace-nowrap shrink-0"
                        >
                          تحرير برقية تحري
                        </Button>
                        <Badge variant="outline" className="text-primary font-bold">
                          الهدف: {c.targetDaysSla} يوماً (SLA)
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-100 p-2 rounded-lg">
                      <span>الطرف الآخر/المستفيد: <strong>{c.spouseOrBeneficiaryName || '-'}</strong></span>
                      <span>الحالة: <strong className="text-indigo-700">{c.status}</strong></span>
                      <span>المحقق: {c.investigatingOfficer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Module 11: Monitored Companies & Travel Agencies Visa Linkage */}
      {activeModule === 'companies' && (() => {
        const companyStatsList = companies.map((comp) => ({
          company: comp,
          stats: getAgencyVisaStats(comp, travelers)
        }));

        const travelAgencyCount = companyStatsList.filter(
          (item) => item.company.type === 'شركات ووكالات السفر والسياحة' || item.stats.totalVisas > 0
        ).length;
        const totalLinkedVisas = companyStatsList.reduce((sum, item) => sum + item.stats.totalVisas, 0);
        const totalIssuedVisas = companyStatsList.reduce((sum, item) => sum + item.stats.issuedCount, 0);
        const totalReturnedVisas = companyStatsList.reduce((sum, item) => sum + item.stats.returnedCount, 0);

        const filteredCompanies = companyStatsList.filter(({ company }) => {
          const matchesType = companyTypeFilter === 'الكل' || company.type === companyTypeFilter;
          const normQ = normalizeArabic(companySearch);
          const matchesQ =
            !normQ ||
            normalizeArabic(company.companyName).includes(normQ) ||
            normalizeArabic(company.governorate).includes(normQ) ||
            normalizeArabic(company.licenseNumber).includes(normQ);
          return matchesType && matchesQ;
        });

        return (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-card p-4 rounded-xl border">
              <div>
                <h2 className="text-lg font-bold text-slate-900">وكالات السفر والسياحة والمنشآت المراقبة وربطها بالتأشيرات</h2>
                <p className="text-xs text-muted-foreground">
                  ربط آلي ومباشر بين كشوفات التأشيرات الصادرة للمواطنين وملفات مكاتب ووكالات السفر (المؤشرة والمرتجعة).
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ImportButtonWithPreview
                  category="traveler"
                  sourceTitle="استيراد كشوفات التأشيرات وربط الوكالات"
                  buttonLabel="استيراد كشوفات التأشيرات"
                  buttonVariant="outline"
                  buttonClassName="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  showCenterShortcut={false}
                />
                <Button
                  variant="outline"
                  onClick={handleSyncAgenciesWithVisas}
                  className="gap-1.5 font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <RefreshCw className="h-4 w-4" /> مزامنة وربط الوكالات بالتأشيرات
                </Button>
                <Button onClick={() => setNewCompanyOpen(true)} className="gap-1.5 font-bold">
                  <Plus className="h-4 w-4" /> إدراج وكالة / شركة
                </Button>
              </div>
            </div>

            {/* Agency-Visa Linkage KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-card border rounded-xl p-3.5 shadow-2xs">
                <span className="text-[11px] font-bold text-muted-foreground block">إجمالي المنشآت والوكالات</span>
                <span className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1 block">{companies.length}</span>
              </div>
              <div className="bg-card border rounded-xl p-3.5 shadow-2xs">
                <span className="text-[11px] font-bold text-indigo-700 block">وكالات سفر مرتبطة بتأشيرات</span>
                <span className="text-2xl font-black font-mono tabular-nums text-indigo-700 mt-1 block">{travelAgencyCount}</span>
              </div>
              <div className="bg-card border rounded-xl p-3.5 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-700 block">التأشيرات المرتبطة (مؤشر)</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black font-mono tabular-nums text-emerald-700">{totalLinkedVisas}</span>
                  <span className="text-xs font-mono tabular-nums text-emerald-600">({totalIssuedVisas} مؤشر)</span>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3.5 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-700 block">إجمالي المرتجعات بالوكالات</span>
                <span className="text-2xl font-black font-mono tabular-nums text-amber-700 mt-1 block">{totalReturnedVisas}</span>
              </div>
            </div>

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-2.5 bg-muted/30 p-3 rounded-xl border">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="بحث باسم الوكالة أو المحافظة أو رقم الترخيص..."
                  className="pr-9 bg-background"
                />
              </div>
              <div className="w-full sm:w-64">
                <Select value={companyTypeFilter} onValueChange={setCompanyTypeFilter}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="تصنيف النشاط" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="الكل">كل الأنشطة والوكالات</SelectItem>
                    {MONITORED_COMPANY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCompanies.length === 0 ? (
                <div className="col-span-full text-center py-10 bg-card border rounded-xl text-xs text-muted-foreground">
                  لا توجد وكالات أو شركات مطابقة لخيارات البحث الحالية
                </div>
              ) : filteredCompanies.map(({ company: comp, stats }) => (
                <Card key={comp.id} className="p-4 rounded-2xl border shadow-xs flex flex-col justify-between gap-3">
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <Badge variant="outline" className="text-[10px] mb-1">{comp.type}</Badge>
                        <h3 className="font-bold text-base text-slate-900 truncate">{comp.companyName}</h3>
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          سجل: {comp.commercialRecord} · ترخيص: {comp.licenseNumber}
                        </p>
                      </div>
                      <Badge variant={comp.securityClearanceStatus === 'معتمد وساري' ? 'default' : 'destructive'} className="text-[10px] shrink-0">
                        {comp.securityClearanceStatus}
                      </Badge>
                    </div>

                    {/* Linked Visa Stats Strip */}
                    <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 border rounded-xl p-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block">التأشيرات المرتبطة</span>
                        <span className="text-sm font-black font-mono tabular-nums text-slate-900">{stats.totalVisas}</span>
                      </div>
                      <div className="border-x border-slate-200">
                        <span className="text-[10px] text-emerald-700 block">مؤشر</span>
                        <span className="text-sm font-black font-mono tabular-nums text-emerald-700">{stats.issuedCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-700 block">مرتجع</span>
                        <span className="text-sm font-black font-mono tabular-nums text-amber-700">{stats.returnedCount}</span>
                      </div>
                    </div>

                    <div className="text-xs bg-slate-50/70 p-2.5 rounded-xl border space-y-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span><span className="text-muted-foreground">المالك / المدير:</span> {comp.ownerName}</span>
                        <span><span className="text-muted-foreground">الموقع:</span> {comp.governorate} - {comp.address}</span>
                      </div>
                      {stats.centers.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">المراكز النشطة:</span>{' '}
                          <strong className="text-slate-800">{stats.centers.join('، ')}</strong>
                        </div>
                      )}
                      {Object.keys(stats.visaTypes).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-muted-foreground">أنواع التأشيرات:</span>
                          {Object.entries(stats.visaTypes).slice(0, 4).map(([vt, cnt]) => (
                            <span key={vt} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border text-[10px] font-medium">
                              {vt}: <strong className="font-mono tabular-nums">{cnt}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {stats.lastExitDate && (
                        <div>
                          <span className="text-muted-foreground">آخر تاريخ خروج:</span>{' '}
                          <span className="font-mono tabular-nums font-bold text-slate-800">{stats.lastExitDate}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">المخالفات المرصودة:</span>{' '}
                        <strong className="text-rose-600 font-bold font-mono tabular-nums">{comp.violationsCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant={stats.totalVisas > 0 ? 'default' : 'outline'}
                      onClick={() => {
                        setAgencyVisaSearch('');
                        setAgencyVisaStatusFilter('الكل');
                        setSelectedAgencyForVisas(comp);
                      }}
                      className="flex-1 text-xs font-bold gap-1.5 h-8"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>عرض التأشيرات المرتبطة ({stats.totalVisas})</span>
                    </Button>
                    <Link
                      to={`/?agency=${encodeURIComponent(comp.companyName)}`}
                      className="inline-flex items-center justify-center gap-1 px-3 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                      <span>سجل المسافرين</span>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Module 12: Official Correspondence */}
      {activeModule === 'correspondence' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">المكاتبات والبرقيات الرسمية المؤتمتة</h2>
              <p className="text-xs text-muted-foreground">توليد برقيات ومذكرات رسمية قانونية بالصياغة المعتمدة (من/إلى/الإشارة/الموضوع/المتضمن/وعليه/التوقيع).</p>
            </div>
            <Button onClick={() => setNewCorrespondenceOpen(true)} className="gap-1.5 font-bold">
              <Plus className="h-4 w-4" /> إنشاء برقية/مذكرة جديدة
            </Button>
          </div>

          <div className="space-y-3">
            {correspondences.map((cr) => (
              <Card key={cr.id} className="p-4 rounded-2xl border shadow-xs space-y-3">
                <div className="flex justify-between items-start border-b pb-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary">{cr.incomingOutgoingNumber}</span>
                    <h3 className="font-bold text-sm text-slate-900">{cr.subject}</h3>
                    <p className="text-xs text-muted-foreground">{cr.letterType} · التاريخ: {cr.gregorianDate}م ({cr.hijriDate})</p>
                  </div>
                  <Badge className="bg-indigo-100 text-indigo-800 border-none text-[10px]">{cr.status}</Badge>
                </div>
                <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border space-y-1 font-serif leading-relaxed">
                  <p><strong>من:</strong> {cr.senderEntity}</p>
                  <p><strong>إلى:</strong> {cr.recipientEntity}</p>
                  <p><strong>الإشارة:</strong> {cr.referenceText}</p>
                  <p><strong>المتضمن:</strong> {cr.introClause}</p>
                  <p><strong>وعليه:</strong> {cr.actionRequired}</p>
                  <div className="text-left font-bold text-slate-900 pt-2 border-t mt-2">
                    {cr.signatoryTitle}<br />
                    {cr.signatoryName}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Module 13: Audit Log */}
      {activeModule === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">سجل العمليات الرقابي السيادي (Audit Log Entity)</h2>
              <p className="text-xs text-muted-foreground">سجل غير قابل للتعديل يوثق كافة حركات الإنشاء والتعديل والحذف وتصدير الكشوفات مع هوية الضابط وعنوان الجهاز.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(auditLogs, 'سجل_العمليات_الرقابي')}>
              <Download className="h-3.5 w-3.5 ml-1" /> تصدير السجل الرقابي
            </Button>
          </div>

          {/* Mobile Vertical Cards View */}
          <div className="md:hidden space-y-2.5 max-h-[65dvh] overflow-y-auto adaptive-scroll-region pl-0.5">
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border rounded-xl bg-card">لا توجد عمليات مسجلة</div>
            ) : auditLogs.map((log) => (
              <div key={log.id} className="bg-card border rounded-xl p-3.5 shadow-2xs space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{log.officerName}</h4>
                    <span className="font-mono text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString('ar-YE')}</span>
                  </div>
                  <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded text-[10px] shrink-0">{log.action}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="outline" className="text-[10px]">{log.officerRole}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{log.targetModule}</Badge>
                  <span className="text-slate-600">{log.portOrDepartment}</span>
                </div>
                <p className="text-xs text-slate-700 bg-slate-50/80 p-2 rounded-lg leading-relaxed">{log.details}</p>
              </div>
            ))}
          </div>

          {/* Desktop Scrollable Table */}
          <div className="hidden md:block adaptive-table-container rounded-2xl border bg-card">
            <table className="w-full min-w-[780px] text-xs text-right">
              <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs border-b shadow-2xs">
                <tr>
                  <th className="p-3">الوقت والتاريخ</th>
                  <th className="p-3">الضابط / المستخدم</th>
                  <th className="p-3">الرتبة والدور</th>
                  <th className="p-3">المنفذ / الإدارة</th>
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">الوحدة المستهدفة</th>
                  <th className="p-3">تفاصيل العملية</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-[11px]">{new Date(log.timestamp).toLocaleString('ar-YE')}</td>
                    <td className="p-3 font-bold text-slate-800">{log.officerName}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{log.officerRole}</Badge></td>
                    <td className="p-3">{log.portOrDepartment}</td>
                    <td className="p-3 font-bold text-primary">{log.action}</td>
                    <td className="p-3">{log.targetModule}</td>
                    <td className="p-3 max-w-xs truncate text-slate-600">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Module 14: Developer Module (EAV & System Customization) */}
      {activeModule === 'developer' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border">
            <div>
              <h2 className="text-lg font-bold text-slate-800">وحدة المطور وتخصيص المنظومة (Developer Module - Super Admin)</h2>
              <p className="text-xs text-muted-foreground">إدارة الحقول الديناميكية (EAV)، أنماط الترقيم التلقائي، وتعديل ترويسات التقارير الرسمية محلياً.</p>
            </div>
            <Badge className="bg-purple-100 text-purple-800 border-none font-bold">صلاحيات المدير العام (Super Admin)</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-5 rounded-2xl border shadow-xs space-y-4">
              <CardTitle className="text-base font-bold text-slate-800">أنماط الترقيم التلقائي (AutoField Rules)</CardTitle>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">نمط ترقيم محاضر الضبط:</label>
                  <Input value={devSettings.autoFieldRules.seizurePrefix} onChange={(e) => setDevSettings({ ...devSettings, autoFieldRules: { ...devSettings.autoFieldRules, seizurePrefix: e.target.value } })} />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">نمط ملفات المهاجرين:</label>
                  <Input value={devSettings.autoFieldRules.migrantPrefix} onChange={(e) => setDevSettings({ ...devSettings, autoFieldRules: { ...devSettings.autoFieldRules, migrantPrefix: e.target.value } })} />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">نمط التصاريح الأمنية:</label>
                  <Input value={devSettings.autoFieldRules.permitPrefix} onChange={(e) => setDevSettings({ ...devSettings, autoFieldRules: { ...devSettings.autoFieldRules, permitPrefix: e.target.value } })} />
                </div>
                <Button size="sm" onClick={() => { saveDeveloperSettings(devSettings); toast({ title: 'تم حفظ أنماط الترقيم' }); }}>حفظ الأنماط</Button>
              </div>
            </Card>

            <Card className="p-5 rounded-2xl border shadow-xs space-y-4">
              <CardTitle className="text-base font-bold text-slate-800">ترويسات المخرجات الرسمية (Official Headers)</CardTitle>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">الدولة:</label>
                  <Input value={devSettings.printHeaders.republicTitle} onChange={(e) => setDevSettings({ ...devSettings, printHeaders: { ...devSettings.printHeaders, republicTitle: e.target.value } })} />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">الوزارة:</label>
                  <Input value={devSettings.printHeaders.ministryTitle} onChange={(e) => setDevSettings({ ...devSettings, printHeaders: { ...devSettings.printHeaders, ministryTitle: e.target.value } })} />
                </div>
                <div>
                  <label className="text-muted-foreground block mb-1">المصلحة:</label>
                  <Input value={devSettings.printHeaders.departmentTitle} onChange={(e) => setDevSettings({ ...devSettings, printHeaders: { ...devSettings.printHeaders, departmentTitle: e.target.value } })} />
                </div>
                <Button size="sm" onClick={() => { saveDeveloperSettings(devSettings); toast({ title: 'تم تحديث ترويسات الطباعة' }); }}>حفظ الترويسات</Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Police Intelligence Branch (فرع استخبارات الشرطة) */}
      {activeModule === 'intelligence' && (
        <Card className="p-6 rounded-2xl border shadow-xs space-y-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold">فرع استخبارات الشرطة المركزي</h2>
              <p className="text-xs text-slate-400">
                رقم القيد الأمني: <strong className="text-amber-300 font-mono">001/ المرجع السنوي</strong> · رقم ملف التحقيق المركزي: <strong className="text-amber-300 font-mono">001</strong>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-bold text-amber-300">المهام الاستخباراتية السيادية:</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>فحص خلفيات المسافرين والمشتبه بهم ومقارنتهم بالقوائم السوداء.</li>
                <li>التحري عن الشركات والوكالات المشبوهة ووكالات السفر غير المرخصة.</li>
                <li>إصدار قرارات الإدراج في قوائم المنع أو رفع القيود الأمنية.</li>
                <li><strong>SLA الاستخباراتي الميداني:</strong> مدة أقصاها 3 أيام للرد على استفسارات المنافذ.</li>
              </ul>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-2">
              <h3 className="font-bold text-amber-300">مصفوفة الصلاحيات والأدوار السبعة (RBAC):</h3>
              <div className="space-y-1 text-[11px] text-slate-300">
                {SOVEREIGN_ROLES.map((r, i) => (
                  <div key={i} className="flex justify-between border-b border-white/5 py-1">
                    <span>{i + 1}. {r}</span>
                    <span className="text-slate-400">صلاحيات سيادية محددة</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Modal: New Seizure (with Single + Batch Mode & Smart Alerts) */}
      <Dialog open={newSeizureOpen} onOpenChange={setNewSeizureOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <DialogTitle>إنشاء محضر ضبط جواز سفر</DialogTitle>
                <DialogDescription>توثيق فردي أو جماعي بالمنفذ مع فحص آلي للسجلات السابقة وقائمة المطلوبين.</DialogDescription>
              </div>
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSeizureBatchMode(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${!seizureBatchMode ? 'bg-primary text-white' : 'text-slate-600'}`}
                >
                  جواز مفرد
                </button>
                <button
                  type="button"
                  onClick={() => setSeizureBatchMode(true)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${seizureBatchMode ? 'bg-primary text-white' : 'text-slate-600'}`}
                >
                  ضبط جماعي متعدد
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            {pendingHubDraft?.module === 'hub_seizure_v1' && !seizureBatchMode && (
              <DraftRecoveryBanner
                savedAt={pendingHubDraft.savedAt}
                onRestore={() => {
                  setSeizureForm(pendingHubDraft.data);
                  setPendingHubDraft(null);
                  toast({ title: 'تم استرجاع مسودة محضر الضبط' });
                }}
                onDiscard={() => {
                  clearFormDraft('hub_seizure_v1');
                  setPendingHubDraft(null);
                }}
              />
            )}

            {!seizureBatchMode && (
              <LiveFormAlertsBanner
                lookupMatch={seizureForm.passportNumber ? lookupPersonByPassportOrId(seizureForm.passportNumber) : null}
                onApplyAutoFill={(m: PersonLookupResult) =>
                  setSeizureForm((prev) => ({
                    ...prev,
                    travelerName: prev.travelerName || m.fullName,
                    nationality: m.country || prev.nationality
                  }))
                }
                duplicateCheck={seizureForm.passportNumber ? checkDuplicateEntry('seizure', seizureForm.passportNumber) : undefined}
                watchlistCheck={checkLiveWatchlistMatch(seizureForm.passportNumber || '', seizureForm.travelerName || '')}
              />
            )}

            {seizureBatchMode ? (
              <InlineBatchGridEditor
                title="قائمة الجوازات المضبوطة في العملية الواحدة"
                subtitle="أضف صفوفاً أو الصق مباشرة من كشوفات Excel (الاسم الكامل، رقم الجواز، الجنسية، السبب)."
                columns={[
                  { key: 'travelerName', label: 'اسم المسافر', placeholder: 'الاسم الكامل' },
                  { key: 'passportNumber', label: 'رقم الجواز', placeholder: '0849...', mono: true },
                  { key: 'nationality', label: 'الجنسية', placeholder: 'اليمن' },
                  { key: 'reason', label: 'سبب الضبط', placeholder: 'اشتباه تزوير / ...' }
                ]}
                rows={seizureBatchRows}
                onChange={setSeizureBatchRows}
                createEmptyRow={() => ({ travelerName: '', passportNumber: '', nationality: 'اليمن', reason: '' })}
              />
            ) : (
              <>
                <div><label className="text-muted-foreground block mb-1">اسم المسافر الكامل *</label><Input value={seizureForm.travelerName} onChange={(e) => setSeizureForm({ ...seizureForm, travelerName: e.target.value })} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><label className="text-muted-foreground block mb-1">رقم الجواز *</label><Input value={seizureForm.passportNumber} onChange={(e) => setSeizureForm({ ...seizureForm, passportNumber: e.target.value })} className="font-mono" /></div>
                  <div>
                    <label className="text-muted-foreground block mb-1">الجنسية:</label>
                    <SearchableCombobox
                      value={seizureForm.nationality || ''}
                      onChange={(v) => setSeizureForm({ ...seizureForm, nationality: v })}
                      options={COUNTRIES}
                      placeholder="اختر أو اكتب الجنسية..."
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">منفذ الضبط:</label>
                <Select value={seizureForm.seizurePort} onValueChange={(v) => setSeizureForm({ ...seizureForm, seizurePort: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {(portsList.length > 0 ? portsList : SOVEREIGN_PORTS).map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">جهة الإحالة:</label>
                <Select value={seizureForm.referredTo} onValueChange={(v) => setSeizureForm({ ...seizureForm, referredTo: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="فرع استخبارات الشرطة">فرع استخبارات الشرطة</SelectItem>
                    <SelectItem value="المباحث الجنائية">المباحث الجنائية</SelectItem>
                    <SelectItem value="النيابة العامة">النيابة العامة</SelectItem>
                    <SelectItem value="مصلحة الجوازات">مصلحة الجوازات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">اسم ضابط المنفذ / محرر المحضر:</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={seizureForm.officerInCharge || ''}
                  onChange={(e) => setSeizureForm({ ...seizureForm, officerInCharge: e.target.value })}
                  placeholder="أدخل اسم ضابط المنفذ أو اختر من القائمة..."
                  className="text-right"
                />
                {registeredOfficers.length > 0 && (
                  <Select onValueChange={(v) => setSeizureForm({ ...seizureForm, officerInCharge: v })}>
                    <SelectTrigger className="w-full sm:w-36 text-xs shrink-0"><SelectValue placeholder="اختر ضابط" /></SelectTrigger>
                    <SelectContent dir="rtl">
                      {registeredOfficers.map((o) => (
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
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">سبب الضبط العام والملاحظات:</label>
                <VoiceDictationButton
                  label="إملاء سبب الضبط"
                  contextHint="سبب ضبط جواز سفر بالمنفذ الأمني"
                  onTranscript={(t) =>
                    setSeizureForm((prev) => ({
                      ...prev,
                      reason: prev.reason ? `${prev.reason} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input value={seizureForm.reason} onChange={(e) => setSeizureForm({ ...seizureForm, reason: e.target.value })} placeholder="اشتباه تزوير، تعديل صور، بلاغ ضبط سابق..." />
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewSeizureOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveSeizure}>{seizureBatchMode ? `اعتماد المحاضر (${seizureBatchRows.filter(r => r.passportNumber.trim()).length})` : 'اعتماد المحضر'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Migrant */}
      <Dialog open={newMigrantOpen} onOpenChange={setNewMigrantOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>تسجيل وضبط مهاجر غير نظامي</DialogTitle>
            <DialogDescription>قيد بيانات المهاجر، نقطة التسلل، وإجراءات الإيواء والترحيل.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            <LiveFormAlertsBanner
              watchlistCheck={checkLiveWatchlistMatch('', migrantForm.fullName || '')}
            />
            <div><label className="text-muted-foreground block mb-1">الاسم الكامل:</label><Input value={migrantForm.fullName} onChange={(e) => setMigrantForm({ ...migrantForm, fullName: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">الجنسية:</label>
                <SearchableCombobox
                  value={migrantForm.nationality || ''}
                  onChange={(v) => setMigrantForm({ ...migrantForm, nationality: v })}
                  options={['إثيوبيا', 'الصومال', 'إريتريا', 'السودان', ...COUNTRIES].filter((v, i, a) => a.indexOf(v) === i)}
                />
              </div>
              <div><label className="text-muted-foreground block mb-1">العمر التقريبي:</label><Input type="number" value={migrantForm.approximateAge} onChange={(e) => setMigrantForm({ ...migrantForm, approximateAge: Number(e.target.value) })} className="font-mono" /></div>
            </div>
            <div><label className="text-muted-foreground block mb-1">نقطة التسلل أو الساحل:</label><Input value={migrantForm.infiltrationPoint} onChange={(e) => setMigrantForm({ ...migrantForm, infiltrationPoint: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">الفحص الطبي الأولي:</label>
                <Select value={migrantForm.medicalCheckStatus} onValueChange={(v) => setMigrantForm({ ...migrantForm, medicalCheckStatus: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="سليم">سليم ولائق</SelectItem>
                    <SelectItem value="اشتباه مرضي">اشتباه مرضي</SelectItem>
                    <SelectItem value="بحاجة عزل">بحاجة عزل صحي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-muted-foreground block mb-1">مركز الإيواء:</label><Input value={migrantForm.shelterCenter} onChange={(e) => setMigrantForm({ ...migrantForm, shelterCenter: e.target.value })} /></div>
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewMigrantOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveMigrant}>حفظ وقيد المهاجر</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Permit (with Inline Batch Manifest + Quick Duration Presets + Draft Auto-Save) */}
      <Dialog open={newPermitOpen} onOpenChange={setNewPermitOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>إصدار تصريح أمني للتحرك الداخلي</DialogTitle>
            <DialogDescription>تصريح خط السير للوفود والمنظمات الدولية مع كشف المرافقين ومدد الصلاحية السريعة.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            {pendingHubDraft?.module === 'hub_permit_v1' && (
              <DraftRecoveryBanner
                savedAt={pendingHubDraft.savedAt}
                onRestore={() => {
                  if (pendingHubDraft.data?.permitForm) setPermitForm(pendingHubDraft.data.permitForm);
                  if (Array.isArray(pendingHubDraft.data?.permitPassengers)) setPermitPassengers(pendingHubDraft.data.permitPassengers);
                  setPendingHubDraft(null);
                  toast({ title: 'تم استرجاع مسودة التصريح' });
                }}
                onDiscard={() => {
                  clearFormDraft('hub_permit_v1');
                  setPendingHubDraft(null);
                }}
              />
            )}

            <LiveFormAlertsBanner
              lookupMatch={permitForm.passportNumber ? lookupPersonByPassportOrId(permitForm.passportNumber) : null}
              onApplyAutoFill={(m: PersonLookupResult) =>
                setPermitForm((prev) => ({ ...prev, delegationHead: prev.delegationHead || m.fullName }))
              }
              watchlistCheck={checkLiveWatchlistMatch(permitForm.passportNumber || '', permitForm.delegationHead || '')}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">اسم الوفد أو المنظمة *</label><Input value={permitForm.delegationName} onChange={(e) => setPermitForm({ ...permitForm, delegationName: e.target.value })} placeholder="مثال: بعثة اللجنة الدولية للصليب الأحمر" /></div>
              <div>
                <label className="text-muted-foreground block mb-1">تصنيف الجهة:</label>
                <Select value={permitForm.organizationType} onValueChange={(v) => setPermitForm({ ...permitForm, organizationType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="منظمة أمم متحدة (UN)">منظمة أمم متحدة (UN)</SelectItem>
                    <SelectItem value="منظمة دولية (INGO)">منظمة دولية (INGO)</SelectItem>
                    <SelectItem value="بعثة دبلوماسية">بعثة دبلوماسية</SelectItem>
                    <SelectItem value="وفد تجاري">وفد تجاري</SelectItem>
                    <SelectItem value="خبراء أجانب">خبراء أجانب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">رئيس الوفد *</label><Input value={permitForm.delegationHead} onChange={(e) => setPermitForm({ ...permitForm, delegationHead: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم الجواز:</label><Input value={permitForm.passportNumber} onChange={(e) => setPermitForm({ ...permitForm, passportNumber: e.target.value })} className="font-mono" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">خط السير الإلزامي المصرح به:</label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    setMapsHubModal({
                      isOpen: true,
                      defaultQuery: permitForm.authorizedRoute || 'صنعاء -> ذمار -> إب -> تعز',
                      title: 'التحقق من خط السير الإلزامي بالخريطة',
                      applyToPermitRoute: true,
                    })
                  }
                  className="h-6 px-2 text-[11px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1 whitespace-nowrap shrink-0"
                >
                  <MapPin className="h-3 w-3" />
                  <span>التحقق بالخريطة</span>
                </Button>
              </div>
              <Input value={permitForm.authorizedRoute} onChange={(e) => setPermitForm({ ...permitForm, authorizedRoute: e.target.value })} placeholder="صنعاء -> ذمار -> إب -> تعز" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <div>
                <label className="text-muted-foreground block mb-1">ساري من تاريخ:</label>
                <Input type="date" value={permitForm.validFrom || new Date().toISOString().split('T')[0]} onChange={(e) => setPermitForm({ ...permitForm, validFrom: e.target.value })} className="font-mono" />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">ساري حتى تاريخ:</label>
                <Input type="date" value={permitForm.validTo || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]} onChange={(e) => setPermitForm({ ...permitForm, validTo: e.target.value })} className="font-mono" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">تعيين مدة سريان سريعة:</span>
              {[7, 15, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => applyPermitDurationPreset(days)}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700"
                >
                  +{days} يوم
                </button>
              ))}
            </div>

            <InlineBatchGridEditor
              title="كشف المرافقين والركاب المضمنين بالتصريح (اختياري)"
              subtitle="أضف المرافقين أو الصق القائمة دفعة واحدة من Excel ليحتسب العدد تلقائياً."
              columns={[
                { key: 'fullName', label: 'الاسم الكامل', placeholder: 'اسم المرافق' },
                { key: 'passportNumber', label: 'رقم الجواز', placeholder: 'رقم الجواز', mono: true },
                { key: 'nationality', label: 'الجنسية', placeholder: 'الجنسية' },
                { key: 'role', label: 'الصفة', placeholder: 'خبير / سائق / مترجم' }
              ]}
              rows={permitPassengers}
              onChange={setPermitPassengers}
              createEmptyRow={() => ({ fullName: '', passportNumber: '', nationality: 'اليمن', role: 'مرافق' })}
            />
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewPermitOpen(false)}>إلغاء</Button>
            <Button onClick={handleSavePermit}>إصدار التصريح فوراً</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Correspondence */}
      <Dialog open={newCorrespondenceOpen} onOpenChange={setNewCorrespondenceOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>صياغة برقية أو مذكرة رسمية</DialogTitle>
            <DialogDescription>وفق النماذج القانونية لوزارة الداخلية ومصلحة الجوازات.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">نوع المكاتبة:</label>
              <Select value={corrForm.letterType} onValueChange={(v) => setCorrForm({ ...corrForm, letterType: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="طلب تحري أمني">طلب تحري أمني عاجل</SelectItem>
                  <SelectItem value="برقية داخلية عاجلة">برقية داخلية عاجلة</SelectItem>
                  <SelectItem value="مذكرة رسمية">مذكرة رسمية</SelectItem>
                  <SelectItem value="رد على مذكرة">رد على مذكرة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-muted-foreground block mb-1">الجهة المرسل إليها:</label><Input value={corrForm.recipientEntity} onChange={(e) => setCorrForm({ ...corrForm, recipientEntity: e.target.value })} /></div>
            <div><label className="text-muted-foreground block mb-1">الإشارة المرجعية:</label><Input value={corrForm.referenceText} onChange={(e) => setCorrForm({ ...corrForm, referenceText: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">الموضوع:</label>
                <VoiceDictationButton
                  label="إملاء الموضوع"
                  contextHint="موضوع برقية أو مذكرة رسمية في مصلحة الجوازات"
                  onTranscript={(t) =>
                    setCorrForm((prev) => ({
                      ...prev,
                      subject: prev.subject ? `${prev.subject} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input value={corrForm.subject} onChange={(e) => setCorrForm({ ...corrForm, subject: e.target.value })} placeholder="شأن المسافر / القضية..." />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">المتضمن:</label>
                <VoiceDictationButton
                  label="إملاء المتن"
                  contextHint="متن مذكرة أو برقية رسمية لجهة أمنية"
                  onTranscript={(t) =>
                    setCorrForm((prev) => ({
                      ...prev,
                      introClause: prev.introClause ? `${prev.introClause} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input value={corrForm.introClause} onChange={(e) => setCorrForm({ ...corrForm, introClause: e.target.value })} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">وعليه:</label>
                <VoiceDictationButton
                  label="إملاء المطلوب"
                  contextHint="التوجيه والإجراء المطلوب في مذكرة رسمية"
                  onTranscript={(t) =>
                    setCorrForm((prev) => ({
                      ...prev,
                      actionRequired: prev.actionRequired ? `${prev.actionRequired} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input value={corrForm.actionRequired} onChange={(e) => setCorrForm({ ...corrForm, actionRequired: e.target.value })} />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">اسم المسؤول / الضابط الموقع:</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={corrForm.signatoryName || ''}
                  onChange={(e) => setCorrForm({ ...corrForm, signatoryName: e.target.value })}
                  placeholder="أدخل اسم المسؤول الموقع..."
                  className="text-right"
                />
                {registeredOfficers.length > 0 && (
                  <Select onValueChange={(v) => setCorrForm({ ...corrForm, signatoryName: v })}>
                    <SelectTrigger className="w-full sm:w-36 text-xs shrink-0"><SelectValue placeholder="اختر مسؤول" /></SelectTrigger>
                    <SelectContent dir="rtl">
                      {registeredOfficers.map((o) => (
                        <SelectItem key={o.id} value={`${o.rank ? o.rank + '/ ' : ''}${o.name}`}>
                          {o.rank} {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewCorrespondenceOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveCorrespondence}>اعتماد وإرسال البرقية</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Set Port Supervisor / Officer */}
      <Dialog open={portSupervisorDialogOpen} onOpenChange={setPortSupervisorDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>إدراج / تعيين ضابط المنفذ</DialogTitle>
            <DialogDescription>
              {selectedPortForSupervisor?.name} ({selectedPortForSupervisor?.category} - محافظة {selectedPortForSupervisor?.governorate})
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4 text-xs">
            <div>
              <label className="text-slate-700 font-bold block mb-1.5">اسم ورتبة ضابط المنفذ / مشرف النوبة:</label>
              <Input
                value={supervisorNameInput}
                onChange={(e) => setSupervisorNameInput(e.target.value)}
                placeholder="أدخل اسم الضابط أو اختر من الدليل..."
                className="text-right font-semibold"
                autoFocus
              />
            </div>

            {registeredOfficers.length > 0 && (
              <div>
                <label className="text-slate-500 block mb-1">أو اختيار سريع من قائمة الضباط المسجلين:</label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto adaptive-scroll-region p-2 bg-slate-50 border rounded-lg">
                  {registeredOfficers.map((officer) => (
                    <button
                      key={officer.id}
                      type="button"
                      onClick={() => setSupervisorNameInput(`${officer.rank ? officer.rank + '/ ' : ''}${officer.name}`)}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md hover:bg-primary/5 hover:border-primary text-slate-800 transition-all text-right font-medium"
                    >
                      {officer.rank} {officer.name} ({officer.portOrCenter})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPortSupervisorDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSavePortSupervisor} className="bg-primary hover:bg-primary/90 text-white font-bold">
              حفظ ضابط المنفذ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Refugee */}
      <Dialog open={newRefugeeOpen} onOpenChange={setNewRefugeeOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>تسجيل لاجئ وتصريح حماية مؤقتة (UNHCR)</DialogTitle>
            <DialogDescription>إدراج بيانات اللاجئ والتحقق الأمني وإصدار بطاقة تصريح برمز QR.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            <LiveFormAlertsBanner
              lookupMatch={refugeeForm.unhcrNumber ? lookupPersonByPassportOrId(refugeeForm.unhcrNumber) : null}
              onApplyAutoFill={(m: PersonLookupResult) =>
                setRefugeeForm((prev) => ({
                  ...prev,
                  fullName: prev.fullName || m.fullName,
                  nationality: m.country || prev.nationality,
                  phone: prev.phone || m.phone
                }))
              }
              watchlistCheck={checkLiveWatchlistMatch(refugeeForm.unhcrNumber || '', refugeeForm.fullName || '')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">الاسم الكامل *</label><Input value={refugeeForm.fullName} onChange={(e) => setRefugeeForm({ ...refugeeForm, fullName: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم ملف المفوضية (UNHCR) *</label><Input value={refugeeForm.unhcrNumber} onChange={(e) => setRefugeeForm({ ...refugeeForm, unhcrNumber: e.target.value })} placeholder="UNHCR-YEM-..." className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">الجنسية:</label>
                <SearchableCombobox
                  value={refugeeForm.nationality || ''}
                  onChange={(v) => setRefugeeForm({ ...refugeeForm, nationality: v })}
                  options={['الصومال', 'إثيوبيا', 'سوريا', 'فلسطين', 'السودان', ...COUNTRIES].filter((v, i, a) => a.indexOf(v) === i)}
                />
              </div>
              <div><label className="text-muted-foreground block mb-1">عدد أفراد الأسرة:</label><Input type="number" value={refugeeForm.familyMembersCount} onChange={(e) => setRefugeeForm({ ...refugeeForm, familyMembersCount: Number(e.target.value) })} className="font-mono" /></div>
              <div><label className="text-muted-foreground block mb-1">انتهاء التصريح:</label><Input type="date" value={refugeeForm.permitExpiryDate} onChange={(e) => setRefugeeForm({ ...refugeeForm, permitExpiryDate: e.target.value })} className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">عنوان السكن:</label><Input value={refugeeForm.residentialAddress} onChange={(e) => setRefugeeForm({ ...refugeeForm, residentialAddress: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم الهاتف:</label><Input value={refugeeForm.phone} onChange={(e) => setRefugeeForm({ ...refugeeForm, phone: e.target.value })} dir="ltr" className="font-mono" /></div>
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewRefugeeOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveRefugee}>اعتماد وإصدار التصريح</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Foreigner Resident */}
      <Dialog open={newForeignerOpen} onOpenChange={setNewForeignerOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>قيد إقامة وافد أجنبي</DialogTitle>
            <DialogDescription>تعبئة تلقائية من السجلات، تحقق من التكرار، وربط مباشر بجهة العمل أو الكفيل.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            {pendingHubDraft?.module === 'hub_foreigner_v1' && (
              <DraftRecoveryBanner
                savedAt={pendingHubDraft.savedAt}
                onRestore={() => {
                  setForeignerForm(pendingHubDraft.data);
                  setPendingHubDraft(null);
                  toast({ title: 'تم استرجاع مسودة الوافد' });
                }}
                onDiscard={() => {
                  clearFormDraft('hub_foreigner_v1');
                  setPendingHubDraft(null);
                }}
              />
            )}

            <LiveFormAlertsBanner
              lookupMatch={foreignerForm.passportNumber ? lookupPersonByPassportOrId(foreignerForm.passportNumber) : null}
              onApplyAutoFill={(m: PersonLookupResult) =>
                setForeignerForm((prev) => ({
                  ...prev,
                  fullName: prev.fullName || m.fullName,
                  nationality: m.country || prev.nationality,
                  profession: prev.profession || m.profession || ''
                }))
              }
              duplicateCheck={foreignerForm.passportNumber ? checkDuplicateEntry('foreigner', foreignerForm.passportNumber) : undefined}
              watchlistCheck={checkLiveWatchlistMatch(foreignerForm.passportNumber || '', foreignerForm.fullName || '')}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">الاسم الكامل *</label><Input value={foreignerForm.fullName} onChange={(e) => setForeignerForm({ ...foreignerForm, fullName: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم الجواز *</label><Input value={foreignerForm.passportNumber} onChange={(e) => setForeignerForm({ ...foreignerForm, passportNumber: e.target.value })} className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">الجنسية:</label>
                <SearchableCombobox
                  value={foreignerForm.nationality || ''}
                  onChange={(v) => setForeignerForm({ ...foreignerForm, nationality: v })}
                  options={COUNTRIES}
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">جهة العمل / الكفيل:</label>
                <SearchableCombobox
                  value={foreignerForm.employer || ''}
                  onChange={(v) => setForeignerForm({ ...foreignerForm, employer: v })}
                  options={companies.map((c) => c.companyName)}
                  placeholder="اختر منشأة أو اكتب جهة العمل..."
                />
              </div>
              <div><label className="text-muted-foreground block mb-1">المهنة:</label><Input value={foreignerForm.profession} onChange={(e) => setForeignerForm({ ...foreignerForm, profession: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">انتهاء الإقامة:</label><Input type="date" value={foreignerForm.residenceExpiryDate} onChange={(e) => setForeignerForm({ ...foreignerForm, residenceExpiryDate: e.target.value })} className="font-mono" /></div>
              <div>
                <label className="text-muted-foreground block mb-1">نتيجة الفحص الطبي:</label>
                <Select value={foreignerForm.medicalExamResult} onValueChange={(v) => setForeignerForm({ ...foreignerForm, medicalExamResult: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="لائق طبياً">لائق طبياً</SelectItem>
                    <SelectItem value="بانتظار الفحص">بانتظار الفحص</SelectItem>
                    <SelectItem value="غير لائق">غير لائق</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewForeignerOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveForeigner}>حفظ وقيد الإقامة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Citizenship / Marriage Case */}
      <Dialog open={newCitizenshipOpen} onOpenChange={setNewCitizenshipOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>فتح معاملة جنسية / زواج مختلط / وثيقة خاصة</DialogTitle>
            <DialogDescription>توثيق المعاملة وربطها بمؤشر الاستجابة الزمني المعتمد (SLA).</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            {pendingHubDraft?.module === 'hub_citizenship_v1' && (
              <DraftRecoveryBanner
                savedAt={pendingHubDraft.savedAt}
                onRestore={() => {
                  setCitizenshipForm(pendingHubDraft.data);
                  setPendingHubDraft(null);
                  toast({ title: 'تم استرجاع مسودة المعاملة' });
                }}
                onDiscard={() => {
                  clearFormDraft('hub_citizenship_v1');
                  setPendingHubDraft(null);
                }}
              />
            )}

            <LiveFormAlertsBanner
              lookupMatch={citizenshipForm.applicantIdOrPassport ? lookupPersonByPassportOrId(citizenshipForm.applicantIdOrPassport) : null}
              onApplyAutoFill={(m: PersonLookupResult) =>
                setCitizenshipForm((prev) => ({
                  ...prev,
                  applicantName: prev.applicantName || m.fullName,
                  applicantNationality: m.country || prev.applicantNationality
                }))
              }
              watchlistCheck={checkLiveWatchlistMatch(citizenshipForm.applicantIdOrPassport || '', citizenshipForm.applicantName || '')}
            />

            <div>
              <label className="text-muted-foreground block mb-1">نوع المعاملة:</label>
              <Select value={citizenshipForm.serviceType} onValueChange={(v) => setCitizenshipForm({ ...citizenshipForm, serviceType: v as any, targetDaysSla: v.includes('جوازات') || v.includes('وثائق') ? 3 : v.includes('جمهوري') ? 30 : 20 })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="زواج يمني من أجنبية">زواج يمني من أجنبية (20 يوم SLA)</SelectItem>
                  <SelectItem value="زواج أجنبي من يمنية">زواج أجنبي من يمنية (20 يوم SLA)</SelectItem>
                  <SelectItem value="اكتساب الجنسية لزوجة يمني">اكتساب الجنسية لزوجة يمني (20 يوم SLA)</SelectItem>
                  <SelectItem value="طلب الجنسية بأمر جمهوري">طلب الجنسية بأمر جمهوري (30 يوم SLA)</SelectItem>
                  <SelectItem value="طلب إذن اكتساب جنسية أجنبية">طلب إذن اكتساب جنسية أجنبية (20 يوم SLA)</SelectItem>
                  <SelectItem value="وثائق سفر للاجئين">وثائق سفر للاجئين (3 أيام SLA)</SelectItem>
                  <SelectItem value="جوازات سفر أبناء اليمنيات">جوازات سفر أبناء اليمنيات (3 أيام SLA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">اسم مقدم الطلب *</label><Input value={citizenshipForm.applicantName} onChange={(e) => setCitizenshipForm({ ...citizenshipForm, applicantName: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم الهوية / الجواز *</label><Input value={citizenshipForm.applicantIdOrPassport} onChange={(e) => setCitizenshipForm({ ...citizenshipForm, applicantIdOrPassport: e.target.value })} className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">الطرف الآخر / المستفيد:</label><Input value={citizenshipForm.spouseOrBeneficiaryName} onChange={(e) => setCitizenshipForm({ ...citizenshipForm, spouseOrBeneficiaryName: e.target.value })} /></div>
              <div>
                <label className="text-muted-foreground block mb-1">جنسية الطرف الآخر:</label>
                <SearchableCombobox
                  value={citizenshipForm.spouseNationality || ''}
                  onChange={(v) => setCitizenshipForm({ ...citizenshipForm, spouseNationality: v })}
                  options={COUNTRIES}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-muted-foreground block">ملاحظات وقيد الاستخبارات:</label>
                <VoiceDictationButton
                  label="إملاء الملاحظات"
                  contextHint="ملاحظات معاملة جنسية أو زواج مختلط"
                  onTranscript={(t) =>
                    setCitizenshipForm((prev) => ({
                      ...prev,
                      notes: prev.notes ? `${prev.notes} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input value={citizenshipForm.notes} onChange={(e) => setCitizenshipForm({ ...citizenshipForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewCitizenshipOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveCitizenship}>قيد وإحالة المعاملة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: New Monitored Company */}
      <Dialog open={newCompanyOpen} onOpenChange={setNewCompanyOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl" onKeyDown={handleEnterAdvanceFocus}>
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>إدراج شركة أو وكالة ضمن الرقابة الأمنية</DialogTitle>
            <DialogDescription>قيد التراخيص الأمنية لشركات الحج والعمرة، الصرافة، السفر، التوظيف، والتأمين.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3 text-xs">
            <LiveFormAlertsBanner
              duplicateCheck={companyForm.companyName ? checkDuplicateEntry('company', companyForm.companyName) : undefined}
            />
            <div>
              <label className="text-muted-foreground block mb-1">تصنيف النشاط:</label>
              <Select value={companyForm.type} onValueChange={(v) => setCompanyForm({ ...companyForm, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {MONITORED_COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">اسم الشركة / المنشأة *</label><Input value={companyForm.companyName} onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">رقم السجل التجاري *</label><Input value={companyForm.commercialRecord} onChange={(e) => setCompanyForm({ ...companyForm, commercialRecord: e.target.value })} className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="text-muted-foreground block mb-1">اسم المالك:</label><Input value={companyForm.ownerName} onChange={(e) => setCompanyForm({ ...companyForm, ownerName: e.target.value })} /></div>
              <div><label className="text-muted-foreground block mb-1">اسم المشرف المعتمد:</label><Input value={companyForm.supervisorName} onChange={(e) => setCompanyForm({ ...companyForm, supervisorName: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-muted-foreground block mb-1">المحافظة:</label>
                <SearchableCombobox
                  value={companyForm.governorate || ''}
                  onChange={(v) => setCompanyForm({ ...companyForm, governorate: v })}
                  options={YEMEN_GOVERNORATES}
                />
              </div>
              <div><label className="text-muted-foreground block mb-1">العنوان:</label><Input value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} placeholder="شارع..." /></div>
              <div><label className="text-muted-foreground block mb-1">رقم الهاتف:</label><Input value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} dir="ltr" className="font-mono" /></div>
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewCompanyOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveCompany}>اعتماد الترخيص الأمني</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Agency Linked Visas Dossier */}
      <Dialog open={!!selectedAgencyForVisas} onOpenChange={(openState) => !openState && closeAgencyVisasModal()}>
        <DialogContent className="max-w-5xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          {selectedAgencyForVisas && (() => {
            const agencyStats = getAgencyVisaStats(selectedAgencyForVisas, travelers);
            const normAgencyQ = normalizeArabic(agencyVisaSearch);
            const filteredAgencyVisas = agencyStats.visas.filter((t) => {
              const st = cleanArabicText(t.status || '');
              const matchesSt =
                agencyVisaStatusFilter === 'الكل' ||
                (agencyVisaStatusFilter === 'مؤشر' && st.includes('مؤشر')) ||
                (agencyVisaStatusFilter === 'مرتجع' && st.includes('مرتجع'));
              if (!matchesSt) return false;
              if (!normAgencyQ) return true;
              const fullN = normalizeArabic(`${t.firstName} ${t.secondName} ${t.thirdName} ${t.lastName} ${t.passportName || ''}`);
              return (
                fullN.includes(normAgencyQ) ||
                normalizeArabic(t.idNumber).includes(normAgencyQ) ||
                normalizeArabic(t.returnReason || '').includes(normAgencyQ) ||
                normalizeArabic(t.visaType || '').includes(normAgencyQ)
              );
            });

            return (
              <>
                <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary shrink-0" />
                        <span>ملف التأشيرات المرتبطة — {selectedAgencyForVisas.companyName}</span>
                      </DialogTitle>
                      <DialogDescription className="text-xs mt-0.5">
                        {selectedAgencyForVisas.type} · ترخيص <span className="font-mono">{selectedAgencyForVisas.licenseNumber}</span> · المراكز: {agencyStats.centers.join('، ') || selectedAgencyForVisas.governorate}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 sm:p-5 gap-3.5">
                  {/* Stats + Filter Toolbar */}
                  <div className="grid grid-cols-3 gap-2.5 shrink-0">
                    <div className="bg-slate-50 border rounded-xl p-2.5 text-center">
                      <span className="text-[11px] text-slate-500 block">إجمالي التأشيرات</span>
                      <span className="text-lg font-black font-mono tabular-nums text-slate-900">{agencyStats.totalVisas}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                      <span className="text-[11px] text-emerald-700 block">مؤشر</span>
                      <span className="text-lg font-black font-mono tabular-nums text-emerald-700">{agencyStats.issuedCount}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
                      <span className="text-[11px] text-amber-700 block">مرتجع</span>
                      <span className="text-lg font-black font-mono tabular-nums text-amber-700">{agencyStats.returnedCount}</span>
                    </div>
                  </div>

                  {agencyStats.topReturnReasons.length > 0 && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 text-xs shrink-0">
                      <span className="font-bold text-amber-900 block mb-1.5">توزيع أسباب الإرتجاع لدى الوكالة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {agencyStats.topReturnReasons.map(({ reason, count }) => (
                          <span key={reason} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-200 text-[11px] text-amber-900">
                            {reason}: <strong className="font-mono tabular-nums">{count}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={agencyVisaSearch}
                        onChange={(e) => setAgencyVisaSearch(e.target.value)}
                        placeholder="بحث داخل تأشيرات الوكالة بالاسم أو الجواز أو سبب الإرتجاع..."
                        className="pr-9"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['الكل', 'مؤشر', 'مرتجع'] as const).map((st) => (
                        <Button
                          key={st}
                          type="button"
                          size="sm"
                          variant={agencyVisaStatusFilter === st ? 'default' : 'outline'}
                          onClick={() => setAgencyVisaStatusFilter(st)}
                          className="h-9 text-xs font-bold"
                        >
                          {st}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Mobile Vertical Cards View */}
                  <div className="md:hidden flex-1 min-h-0 overflow-y-auto adaptive-scroll-region space-y-2.5 border rounded-xl p-2.5 bg-slate-50/50">
                    {filteredAgencyVisas.length === 0 ? (
                      <div className="text-center py-10 text-xs text-muted-foreground">لا توجد تأشيرات مطابقة</div>
                    ) : (
                      filteredAgencyVisas.map((t, i) => {
                        const fullName = [t.firstName, t.secondName, t.thirdName, t.fourthName, t.lastName].filter(Boolean).join(' ') || t.passportName || '-';
                        const st = cleanArabicText(t.status || '');
                        return (
                          <div key={t.id} className="bg-white border rounded-xl p-3 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 truncate">
                                <span className="font-mono tabular-nums text-[10px] text-slate-400 ml-1">#{t.serialNumber || i + 1}</span>
                                {fullName}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                                st.includes('مرتجع') ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {st || '-'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                              <div>الجواز: <strong className="font-mono tabular-nums text-slate-900">{t.idNumber}</strong></div>
                              <div>التأشيرة: <strong>{t.visaType || t.visitReason || '-'}</strong></div>
                              <div>المركز: {t.center || '-'}</div>
                              <div>ت. الخروج: <span className="font-mono tabular-nums">{t.exitDate || t.receiveDate || '-'}</span></div>
                            </div>
                            {t.returnReason && (
                              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                سبب الإرتجاع: {t.returnReason}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop Scrollable Table */}
                  <div className="hidden md:block flex-1 min-h-0 overflow-auto adaptive-scroll-region border rounded-xl bg-white">
                    <table className="w-full min-w-[760px] text-xs text-right">
                      <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs border-b font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5 text-center w-12">م</th>
                          <th className="p-2.5">الإسم</th>
                          <th className="p-2.5">رقم الجواز</th>
                          <th className="p-2.5">المركز</th>
                          <th className="p-2.5">التأشيرة</th>
                          <th className="p-2.5">ت. الخروج</th>
                          <th className="p-2.5">الحالة</th>
                          <th className="p-2.5">سبب الإرتجاع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredAgencyVisas.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد تأشيرات مرتبطة مطابقة للبحث</td>
                          </tr>
                        ) : (
                          filteredAgencyVisas.map((t, i) => {
                            const fullName = [t.firstName, t.secondName, t.thirdName, t.fourthName, t.lastName].filter(Boolean).join(' ') || t.passportName || '-';
                            const st = cleanArabicText(t.status || '');
                            return (
                              <tr key={t.id} className="hover:bg-slate-50">
                                <td className="p-2.5 text-center font-mono tabular-nums text-slate-400">{t.serialNumber || i + 1}</td>
                                <td className="p-2.5 font-bold text-slate-900">{fullName}</td>
                                <td className="p-2.5 font-mono tabular-nums font-bold text-emerald-700">{t.idNumber}</td>
                                <td className="p-2.5">{t.center || '-'}</td>
                                <td className="p-2.5">{t.visaType || t.visitReason || '-'}</td>
                                <td className="p-2.5 font-mono tabular-nums">{t.exitDate || t.receiveDate || '-'}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    st.includes('مرتجع') ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {st || '-'}
                                  </span>
                                </td>
                                <td className="p-2.5 text-amber-800">{t.returnReason || '-'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <DialogFooter className="p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs shrink-0 flex flex-col sm:flex-row sm:justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToExcel(filteredAgencyVisas, `تأشيرات_${selectedAgencyForVisas.companyName}`)}
                      className="gap-1.5 font-bold"
                    >
                      <Download className="h-4 w-4 text-emerald-600" />
                      <span>تصدير Excel ({filteredAgencyVisas.length})</span>
                    </Button>
                    <Link
                      to={`/?agency=${encodeURIComponent(selectedAgencyForVisas.companyName)}`}
                      onClick={closeAgencyVisasModal}
                      className="inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-800"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      <span>فتح في سجل المسافرين</span>
                    </Link>
                  </div>
                  <Button variant="ghost" onClick={closeAgencyVisasModal}>إغلاق</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <MapsGroundingModal
        isOpen={mapsHubModal.isOpen}
        onClose={() => setMapsHubModal((prev) => ({ ...prev, isOpen: false }))}
        defaultQuery={mapsHubModal.defaultQuery}
        contextTitle={mapsHubModal.title}
        onApplyRouteText={
          mapsHubModal.applyToPermitRoute
            ? (routeTxt) => setPermitForm((prev) => ({ ...prev, authorizedRoute: routeTxt }))
            : undefined
        }
      />
    </div>
  );
};
