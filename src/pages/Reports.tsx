import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalMovementPermit, MofaVisaRequest, Report, User } from '@/lib/types';
import {
  getReports,
  saveReports,
  generateId,
  getCurrentUser,
  getTravelers,
  getMovementPermits,
  saveMovementPermits,
  addMofaRequest,
  addAuditLog
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Search,
  Trash2,
  Sparkles,
  FileIcon,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Download,
  FileJson,
  FileText,
  Save,
  Printer,
  Image as ImageIcon,
  ClipboardPaste,
  Truck,
  Compass,
  Send
} from 'lucide-react';
import { analyzeReport } from '@/services/geminiService';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmation } from '@/components/DeleteConfirmation';
import { exportToExcel, exportToPDF, exportToImage, handlePrint } from '@/lib/exportUtils';
import { SmartMergeReport } from '@/components/SmartMergeReport';
import { notifySovereignDataUpdated, SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { ImportButtonWithPreview } from '@/components/FilePreviewList';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  checkDuplicateEntry,
  checkLiveWatchlistMatch,
  clearFormDraft,
  loadFormDraft,
  parseIntelligenceReportText,
  saveFormDraft
} from '@/lib/formIntelligence';
import {
  DraftRecoveryBanner,
  handleEnterAdvanceFocus,
  LiveFormAlertsBanner,
  SearchableCombobox,
  StructuredAttachmentsField
} from '@/components/SmartFormControls';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { MapsGroundingModal } from '@/components/MapsGroundingPanel';

import { hasPermission } from '@/lib/rbac';

const REPORT_DRAFT_KEY = 'report_new_v1';

const emptyReportForm = (): Partial<Report> => ({
  autoNumber: '',
  reportDate: new Date().toISOString().slice(0, 10),
  sendingAuthority: 'فرع استخبارات الشرطة - أمانة العاصمة',
  subject: '',
  type: 'إداري',
  priority: 'عادي',
  status: 'جديد',
  title: '',
  description: '',
  actionsTaken: '',
  attachments: [],
  linkedTravelerIds: []
});

const Reports = () => {
  const [reports, setReports] = useState(getReports);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [form, setForm] = useState<Partial<Report>>(emptyReportForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'smart-merge'>('list');

  // Smart paste parser & traveler selector state
  const [pasteParserOpen, setPasteParserOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [pendingDraft, setPendingDraft] = useState<{ data: Partial<Report>; savedAt: string } | null>(null);
  const [travelerSearchVal, setTravelerSearchVal] = useState('');
  const [mapsModalOpen, setMapsModalOpen] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const travelersList = useMemo(() => getTravelers(), [open, reports]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    const handleUpdated = () => setReports(getReports());
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
  }, []);

  // Auto-save new report draft
  useEffect(() => {
    if (!open || editing) return;
    if (form.title || form.description || form.autoNumber || form.subject) {
      saveFormDraft(REPORT_DRAFT_KEY, form);
    }
  }, [open, editing, form]);

  const canApprove = hasPermission(currentUser, 'manage_reports');

  const openNewModal = () => {
    setEditing(null);
    setForm(emptyReportForm());
    setPasteParserOpen(false);
    setRawPasteText('');
    setPendingDraft(loadFormDraft<Partial<Report>>(REPORT_DRAFT_KEY));
    setOpen(true);
  };

  const openEditModal = (r: Report) => {
    setEditing(r);
    setForm(r);
    setPendingDraft(null);
    setPasteParserOpen(false);
    setOpen(true);
  };

  // Duplicate & Watchlist live checks
  const duplicateCheck = useMemo(() => {
    if (!open) return { isDuplicate: false };
    const keyToCheck = (form.autoNumber || '').trim() || (form.title || '').trim();
    if (!keyToCheck) return { isDuplicate: false };
    return checkDuplicateEntry('report', keyToCheck, editing?.id);
  }, [open, form.autoNumber, form.title, editing?.id]);

  const watchlistCheck = useMemo(() => {
    if (!open) return { matched: false };
    return checkLiveWatchlistMatch('', form.title || form.subject || '');
  }, [open, form.title, form.subject]);

  const handleApplyOfflineParser = () => {
    if (!rawPasteText.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى لصق نص البلاغ أولاً', variant: 'destructive' });
      return;
    }
    const parsed = parseIntelligenceReportText(rawPasteText);
    setForm((prev) => ({
      ...prev,
      autoNumber: parsed.autoNumber || prev.autoNumber,
      reportDate: parsed.reportDate || prev.reportDate,
      sendingAuthority: parsed.sendingAuthority || prev.sendingAuthority,
      subject: parsed.subject || prev.subject,
      type: parsed.type || prev.type,
      priority: parsed.priority || prev.priority,
      title: parsed.title || prev.title,
      description: parsed.description || prev.description,
      actionsTaken: parsed.actionsTaken || prev.actionsTaken,
      transportDetails:
        parsed.driverName || parsed.plateNumber || parsed.totalPassports
          ? {
              driverName: parsed.driverName,
              escortName: parsed.escortName,
              plateNumber: parsed.plateNumber,
              totalPassports: parsed.totalPassports
            }
          : prev.transportDetails
    }));
    setPasteParserOpen(false);
    toast({
      title: 'تم استخلاص الحقول تلقائياً (أوفلاين)',
      description: parsed.autoNumber ? `تم تعبئة البلاغ رقم ${parsed.autoNumber} وكافة بياناته.` : 'تم تحليل النص وتعبئة الحقول المتوفرة.'
    });
  };

  const handleAnalyze = async () => {
    if (!navigator.onLine) {
      toast({
        title: 'لا يوجد اتصال',
        description: 'ميزة الذكاء الاصطناعي السحابي تتطلب إنترنت؛ يمكنك استخدام "لصق نص بلاغ واستخلاصه آلياً" بدون إنترنت.',
        variant: 'destructive'
      });
      return;
    }
    if (!form.description || form.description.length < 10) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال وصف كافٍ للتحليل', variant: 'destructive' });
      return;
    }
    setIsAnalyzing(true);
    try {
      const data = await analyzeReport(form.description, 'report.pdf');
      setForm((prev) => ({ ...prev, ...data }));
      toast({ title: 'تم التحليل', description: 'تم اقتراح العنوان والتصنيف' });
    } catch (err) {
      console.error(err);
      toast({ title: 'خطأ', description: 'فشل التحليل الذكي', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const save = () => {
    if (!form.title?.trim()) {
      toast({ title: 'بيانات ناقصة', description: 'يرجى إدخال عنوان البلاغ', variant: 'destructive' });
      return;
    }
    const now = new Date().toISOString();
    let updated: Report[];
    if (editing) {
      updated = reports.map((r) => (r.id === editing.id ? ({ ...r, ...form, updatedAt: now } as Report) : r));
    } else {
      updated = [{ ...form, id: generateId(), createdAt: now, updatedAt: now } as Report, ...reports];
      clearFormDraft(REPORT_DRAFT_KEY);
    }
    saveReports(updated);
    setReports(updated);
    setOpen(false);
    toast({ title: 'تم حفظ البلاغ بنجاح' });
  };

  // Cross-Module Workflow 1: Convert Report to Internal Movement Permit
  const handleConvertToPermit = (r: Report) => {
    const permits = getMovementPermits();
    const code = `تصريح-أمني-2026-00${permits.length + 46}`;
    const td = r.transportDetails;
    const newPermit: InternalMovementPermit = {
      id: generateId(),
      permitCode: code,
      delegationName: td?.agencies?.map((a) => a.name).join(' + ') || r.sendingAuthority || r.title,
      organizationType: 'وفد تجاري',
      authorizedRoute: td?.route || r.title,
      allowedCheckpoints: ['نقاط خط السير المعتمدة بين المحافظات'],
      vehicleDetails: td?.plateNumber
        ? [{ plate: td.plateNumber, model: td.vehicleDesc || 'مركبة نقل', color: 'حسب الكشف' }]
        : [],
      delegationHead: td?.driverName || r.subject || 'مندوب الجهة المرسلة',
      passportNumber: r.autoNumber ? `بلاغ-${r.autoNumber}` : 'كشف مرفق',
      passengersCount: td?.totalPassports || 1,
      securityEscortNeeded: Boolean(td?.escortName),
      escortTeamLeader: td?.escortName,
      validFrom: r.reportDate || new Date().toISOString().slice(0, 10),
      validTo: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      accommodationPlace: td?.route || 'وفق مذكرة العبور',
      qrVerificationCode: `PERMIT:${code}:REP-${r.autoNumber || r.id}`,
      approvalStatus: r.status === 'معتمد' ? 'معتمد رسمياً' : 'قيد الدراسة',
      approvedBy: currentUser?.name || 'غرفة العمليات المركزية',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveMovementPermits([newPermit, ...permits]);
    addAuditLog('إنشاء', 'تصاريح التنقل', `ترحيل البلاغ (${r.autoNumber || r.title}) إلى تصريح تنقل رقم ${code}`, newPermit.id);
    notifySovereignDataUpdated('permits');
    toast({
      title: 'تم ترحيل البلاغ كتصريح تنقل',
      description: `تم إنشاء التصريح رقم ${code} داخل وحدة تصاريح التنقل.`
    });
  };

  // Cross-Module Workflow 2: Convert Report to MOFA / Dispatch Shipment
  const handleConvertToMofaDispatch = (r: Report) => {
    const td = r.transportDetails;
    const now = new Date().toISOString();
    const dispatchReq: MofaVisaRequest = {
      id: generateId(),
      memoNumber: r.autoNumber ? `بلاغ-نقل-${r.autoNumber}` : `إرسالية-${Date.now().toString().slice(-4)}`,
      memoDate: r.reportDate || now.slice(0, 10),
      organization: td?.agencies?.map((a) => `${a.name} (${a.count})`).join(' و ') || r.sendingAuthority || r.title,
      organizationType: 'شركة نقل وسفريات',
      requestType: 'إرسالية نقل جوازات',
      beneficiaries: [],
      dispatchDetails: {
        companyName: td?.agencies?.map((a) => a.name).join(' / ') || r.sendingAuthority || 'مكتب نقل جوازات',
        driverName: [td?.driverName, td?.escortName ? `المرافق: ${td.escortName}` : ''].filter(Boolean).join(' — ') || 'حسب البلاغ',
        carPlate: td?.plateNumber || 'غير محدد',
        carModel: td?.vehicleDesc || 'مركبة نقل',
        passportsCount: td?.totalPassports || 0,
        destinationBranch: td?.route || r.title
      },
      mofaDirective: r.actionsTaken || 'تسهيل العبور والمطابقة وفق مذكرة شعبة النقل واستخبارات الشرطة',
      approvalStatus: r.status === 'معتمد' ? 'معتمد رسمياً' : 'قيد الفحص',
      securityClearanceStatus: 'معتمد',
      additionalInfo: r.description,
      createdAt: now,
      updatedAt: now
    };
    addMofaRequest(dispatchReq);
    notifySovereignDataUpdated('mofa');
    toast({
      title: 'تم ترحيل البلاغ كإرسالية جوازات',
      description: `تم قيد الإرسالية (${dispatchReq.memoNumber}) في وحدة إرساليات الجوازات والخارجية.`
    });
  };

  const deleteReport = (id: string) => {
    setReportToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!reportToDelete) return;
    const updated = reports.filter((r) => r.id !== reportToDelete);
    saveReports(updated);
    setReports(updated);
    setDeleteConfirmOpen(false);
    setReportToDelete(null);
    toast({ title: 'تم حذف البلاغ' });
  };

  const filtered = reports.filter((r) => {
    const q = search.trim();
    const matchesQ =
      !q ||
      r.title.includes(q) ||
      r.description.includes(q) ||
      (r.autoNumber && r.autoNumber.includes(q)) ||
      (r.sendingAuthority && r.sendingAuthority.includes(q)) ||
      (r.subject && r.subject.includes(q));
    const matchesStatus = statusFilter === 'الكل' || r.status === statusFilter;
    return matchesQ && matchesStatus;
  });

  const travelerComboboxOptions = useMemo(() => {
    return travelersList
      .filter((t) => !form.linkedTravelerIds?.includes(t.id))
      .slice(0, 150)
      .map((t) => ({
        value: t.id,
        label: `${t.firstName} ${t.secondName || ''} ${t.lastName || ''}`.trim(),
        meta: t.idNumber
      }));
  }, [travelersList, form.linkedTravelerIds]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">بلاغات الضبط والتحري</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة واعتماد البلاغات الأمنية وبرقيات الضبط وإرساليات العبور</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ImportButtonWithPreview
            category="report"
            sourceTitle="بلاغات الضبط والتحري"
            buttonLabel="استيراد محاضر وبلاغات (متعدد)"
            buttonVariant="outline"
            buttonClassName="border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 whitespace-nowrap shrink-0"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 shadow-sm border-slate-200 whitespace-nowrap shrink-0">
                <Download className="h-4 w-4" /> تصدير
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" dir="rtl">
              <DropdownMenuItem onClick={() => exportToExcel(filtered, 'كشف_البلاغات')}>
                <FileJson className="h-4 w-4 ml-2 text-green-600" /> Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openNewModal} className="gap-2 shadow-md whitespace-nowrap shrink-0">
            <Plus className="h-4 w-4" /> إضافة بلاغ جديد
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-2xl w-fit border no-print">
        <Button
          variant={activeTab === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('list')}
          className="rounded-xl h-9 px-6 text-xs font-bold gap-2 whitespace-nowrap shrink-0"
        >
          <FileText className="h-4 w-4" />
          كشف البلاغات العامة
        </Button>
        <Button
          variant={activeTab === 'smart-merge' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('smart-merge')}
          className="rounded-xl h-9 px-6 text-xs font-bold gap-2 whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          سجل تحديثات SmartMerge
        </Button>
      </div>

      {activeTab === 'list' ? (
        <>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="بحث بالرقم الآلي (مثل 2670)، جهة الإرسال، العنوان، أو الوصف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10 bg-slate-50 border-slate-200 focus:bg-white transition-all"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <Badge
                variant={statusFilter === 'الكل' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('الكل')}
                className="cursor-pointer py-1.5 px-3 whitespace-nowrap shrink-0"
              >
                الكل ({reports.length})
              </Badge>
              <Badge
                variant={statusFilter === 'جديد' ? 'default' : 'secondary'}
                onClick={() => setStatusFilter('جديد')}
                className="cursor-pointer py-1.5 px-3 whitespace-nowrap shrink-0"
              >
                جديد ({reports.filter((r) => r.status === 'جديد').length})
              </Badge>
              <Badge
                variant={statusFilter === 'معتمد' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('معتمد')}
                className="bg-green-100 text-green-700 border-green-200 cursor-pointer hover:bg-green-200 py-1.5 px-3 whitespace-nowrap shrink-0"
              >
                معتمد ({reports.filter((r) => r.status === 'معتمد').length})
              </Badge>
            </div>
          </div>

          {/* Mobile Adaptive Vertical Cards */}
          <div className="md:hidden max-h-[65dvh] overflow-y-auto adaptive-scroll-region space-y-2.5">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                لا توجد بلاغات مسجلة حالياً
              </div>
            ) : (
              filtered.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {r.autoNumber && (
                          <span className="font-mono tabular-nums text-[10px] font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                            رقم آلي: {r.autoNumber}
                          </span>
                        )}
                        {r.transportDetails?.totalPassports ? (
                          <span className="font-mono tabular-nums text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                            {r.transportDetails.totalPassports} جواز
                          </span>
                        ) : null}
                      </div>
                      <h4 className="font-bold text-slate-900">{r.title}</h4>
                      {r.sendingAuthority && (
                        <p className="text-[11px] text-primary font-medium mt-0.5">{r.sendingAuthority}</p>
                      )}
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{r.description}</p>
                    </div>
                    <Badge
                      variant={
                        r.status === 'معتمد'
                          ? 'default'
                          : r.status === 'مرفوض'
                          ? 'destructive'
                          : r.status === 'قيد التحقيق'
                          ? 'secondary'
                          : 'outline'
                      }
                      className="font-bold shrink-0 text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 p-2 rounded-lg text-slate-600">
                    <span>
                      التصنيف: <strong>{r.type}</strong> {r.priority ? `(${r.priority})` : ''}
                    </span>
                    <span className="font-mono tabular-nums">
                      {r.reportDate || new Date(r.createdAt).toLocaleDateString('ar-YE')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(r)}
                      className="flex-1 h-8 text-primary text-xs"
                    >
                      تعديل وعرض
                    </Button>
                    {r.transportDetails && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConvertToMofaDispatch(r)}
                        className="h-8 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        ترحيل إرسالية
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-destructive border-rose-200 hover:bg-rose-50"
                      onClick={() => deleteReport(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Bounded Sticky Table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm adaptive-table-container" id="reports-table">
            <Table className="min-w-[820px] w-full">
              <TableHeader className="bg-slate-50/95 backdrop-blur-xs sticky top-0 z-10 shadow-2xs">
                <TableRow>
                  <TableHead className="text-right font-bold py-4">الرقم الآلي والمرجع</TableHead>
                  <TableHead className="text-right font-bold">معلومات البلاغ وجهة الإرسال</TableHead>
                  <TableHead className="text-right font-bold">المسافر المرتبط</TableHead>
                  <TableHead className="text-right font-bold">التصنيف والأهمية</TableHead>
                  <TableHead className="text-right font-bold">الحالة</TableHead>
                  <TableHead className="text-right font-bold">التاريخ</TableHead>
                  <TableHead className="text-center font-bold no-print">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <FileIcon className="h-12 w-12 mb-3 opacity-20" />
                        <p>لا توجد بلاغات مسجلة حالياً</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className="group hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-right align-top py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono tabular-nums text-xs font-bold text-slate-800">
                            {r.autoNumber ? `#${r.autoNumber}` : r.id.slice(-6)}
                          </span>
                          {r.transportDetails?.totalPassports ? (
                            <span className="font-mono tabular-nums text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                              {r.transportDetails.totalPassports} جواز
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-4 max-w-md">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{r.title}</span>
                          {r.sendingAuthority && (
                            <span className="text-[11px] text-primary font-medium mt-0.5">{r.sendingAuthority}</span>
                          )}
                          <span className="text-xs text-slate-500 line-clamp-2 mt-0.5">{r.description}</span>
                          {r.transportDetails?.plateNumber && (
                            <span className="text-[11px] text-slate-600 font-mono mt-1">
                              المركبة: {r.transportDetails.plateNumber} — السائق: {r.transportDetails.driverName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1">
                          {(r.linkedTravelerIds || []).length > 0 ? (
                            r.linkedTravelerIds?.slice(0, 2).map((tid) => {
                              const t = travelersList.find((trav) => trav.id === tid);
                              return t ? (
                                <div key={tid} className="flex flex-col">
                                  <span className="text-xs font-medium text-primary">
                                    {t.firstName} {t.lastName}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">{t.idNumber}</span>
                                </div>
                              ) : null;
                            })
                          ) : (
                            <span className="text-xs text-slate-400 italic">غير مرتبط</span>
                          )}
                          {(r.linkedTravelerIds || []).length > 2 && (
                            <span className="text-[10px] text-slate-400">+{r.linkedTravelerIds!.length - 2} آخرين</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">{r.type}</span>
                          {r.priority && (
                            <span className="text-[10px] text-slate-500">الأهمية: {r.priority}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            r.status === 'معتمد'
                              ? 'default'
                              : r.status === 'مرفوض'
                              ? 'destructive'
                              : r.status === 'قيد التحقيق'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="font-bold"
                        >
                          {r.status === 'معتمد' && <CheckCircle className="h-3 w-3 ml-1" />}
                          {r.status === 'مرفوض' && <XCircle className="h-3 w-3 ml-1" />}
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col font-mono tabular-nums">
                          <span className="text-xs text-slate-700">
                            {r.reportDate || new Date(r.createdAt).toLocaleDateString('ar-YE')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="no-print">
                        <div className="flex items-center justify-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" onClick={() => openEditModal(r)} className="text-primary hover:bg-primary/5">
                            عرض / تعديل
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleConvertToPermit(r)}
                            className="text-indigo-700 hover:bg-indigo-50"
                            title="ترحيل كتصريح تنقل داخلي"
                          >
                            <Compass className="h-4 w-4" />
                          </Button>
                          {r.transportDetails && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConvertToMofaDispatch(r)}
                              className="text-emerald-700 hover:bg-emerald-50"
                              title="ترحيل كإرسالية نقل جوازات"
                            >
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/5"
                            onClick={() => deleteReport(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DeleteConfirmation
            isOpen={deleteConfirmOpen}
            onClose={() => setDeleteConfirmOpen(false)}
            onConfirm={confirmDelete}
            title="حذف البلاغ"
            description={`هل أنت متأكد من حذف البلاغ "${reports.find((r) => r.id === reportToDelete)?.title}"؟ لا يمكن استرجاع البيانات بعد الحذف.`}
          />
        </>
      ) : (
        <SmartMergeReport />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden"
          dir="rtl"
          onKeyDown={handleEnterAdvanceFocus}
        >
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-right">{editing ? 'تفاصيل وتعديل البلاغ' : 'قيد بلاغ ضبط / برقية جديدة'}</DialogTitle>
                <DialogDescription className="text-right">
                  يدعم استخلاص النصوص المنسوخة تلقائياً (أوفلاين)، الفحص الأمني، وضغط المرفقات.
                </DialogDescription>
              </div>
              {!editing && (
                <Button
                  type="button"
                  size="sm"
                  variant={pasteParserOpen ? 'default' : 'outline'}
                  onClick={() => setPasteParserOpen((v) => !v)}
                  className="gap-1.5 text-xs font-bold whitespace-nowrap shrink-0"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  لصق نص بلاغ واستخلاصه آلياً
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4">
            {pendingDraft && !editing && (
              <DraftRecoveryBanner
                savedAt={pendingDraft.savedAt}
                onRestore={() => {
                  setForm(pendingDraft.data);
                  setPendingDraft(null);
                  toast({ title: 'تم استرجاع مسودة البلاغ' });
                }}
                onDiscard={() => {
                  clearFormDraft(REPORT_DRAFT_KEY);
                  setPendingDraft(null);
                }}
              />
            )}

            <LiveFormAlertsBanner
              duplicateCheck={duplicateCheck}
              onOpenExistingDuplicate={(existingId) => {
                const found = reports.find((item) => item.id === existingId);
                if (found) openEditModal(found);
              }}
              watchlistCheck={watchlistCheck}
            />

            {pasteParserOpen && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                <label className="text-xs font-bold text-indigo-950 block">
                  الصق نص البلاغ الوارد من استخبارات الشرطة أو العمليات لاستخلاص الرقم الآلي والتفاصيل:
                </label>
                <Textarea
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  rows={5}
                  placeholder="الرقم الآلي: ... / تاريخ البلاغ: ... / جهة الإرسال: ... / مضمون البلاغ: ..."
                  className="bg-white text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPasteParserOpen(false)}>
                    إغلاق
                  </Button>
                  <Button type="button" size="sm" onClick={handleApplyOfflineParser} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> استخلاص وتعبئة الحقول
                  </Button>
                </div>
              </div>
            )}

            {/* Structured Dispatch Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">الرقم الآلي / المرجعي</label>
                <Input
                  value={form.autoNumber || ''}
                  onChange={(e) => setForm({ ...form, autoNumber: e.target.value })}
                  placeholder="مثال: 2670"
                  className="font-mono tabular-nums text-right"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">تاريخ البلاغ</label>
                <Input
                  type="date"
                  value={form.reportDate || ''}
                  onChange={(e) => setForm({ ...form, reportDate: e.target.value })}
                  className="font-mono tabular-nums text-right"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">درجة الأهمية</label>
                <Select value={form.priority || 'عادي'} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="عادي">عادي</SelectItem>
                    <SelectItem value="عاجل">عاجل</SelectItem>
                    <SelectItem value="سري وعاجل">سري وعاجل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">جهة الإرسال</label>
                <Input
                  value={form.sendingAuthority || ''}
                  onChange={(e) => setForm({ ...form, sendingAuthority: e.target.value })}
                  placeholder="فرع استخبارات الشرطة - أمانة العاصمة"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-medium text-slate-600 block">الموضوع</label>
                  <VoiceDictationButton
                    label="إملاء"
                    contextHint="موضوع بلاغ أمني أو مذكرة مرور"
                    onTranscript={(t) =>
                      setForm((prev) => ({
                        ...prev,
                        subject: prev.subject ? `${prev.subject} ${t}` : t,
                      }))
                    }
                  />
                </div>
                <Input
                  value={form.subject || ''}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="طلب إذن السماح / بلاغ ضبط..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-medium text-slate-600 block">عنوان البلاغ *</label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setMapsModalOpen(true)}
                    className="h-6 px-2 text-[11px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1 whitespace-nowrap shrink-0"
                  >
                    <Compass className="h-3 w-3" />
                    <span>فحص خط السير على الخريطة</span>
                  </Button>
                </div>
                <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">التصنيف</label>
                <Input value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium text-slate-600 block">مضمون البلاغ والشرح التفصيلي</label>
                <VoiceDictationButton
                  label="إملاء مضمون البلاغ"
                  contextHint="مضمون بلاغ ضبط أو محضر أمني يتضمن أسماء وأرقام جوازات ولوحات سيارات"
                  onTranscript={(t) =>
                    setForm((prev) => ({
                      ...prev,
                      description: prev.description ? `${prev.description}\n${t}` : t,
                    }))
                  }
                />
              </div>
              <div className="relative">
                <Textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="pl-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-2 bottom-2 text-primary"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  title="تحليل ذكي"
                >
                  <Sparkles className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium text-slate-600 block">الإجراءات المتخذة</label>
                <VoiceDictationButton
                  label="إملاء الإجراءات"
                  contextHint="الإجراءات المتخذة في محضر ضبط أو بلاغ"
                  onTranscript={(t) =>
                    setForm((prev) => ({
                      ...prev,
                      actionsTaken: prev.actionsTaken ? `${prev.actionsTaken} ${t}` : t,
                    }))
                  }
                />
              </div>
              <Input
                value={form.actionsTaken || ''}
                onChange={(e) => setForm({ ...form, actionsTaken: e.target.value })}
                placeholder="مثال: تم الرفع به للاطلاع والتوجيه"
              />
            </div>

            {form.transportDetails && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs space-y-1.5">
                <p className="font-bold text-emerald-900">تفاصيل إرسالية العبور المضمنة:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-700">
                  {form.transportDetails.totalPassports ? (
                    <div>
                      إجمالي الجوازات: <strong className="font-mono tabular-nums">{form.transportDetails.totalPassports}</strong>
                    </div>
                  ) : null}
                  {form.transportDetails.plateNumber && (
                    <div>
                      اللوحة: <strong className="font-mono">{form.transportDetails.plateNumber}</strong>
                    </div>
                  )}
                  {form.transportDetails.driverName && <div>السائق: {form.transportDetails.driverName}</div>}
                  {form.transportDetails.escortName && <div>المرافق: {form.transportDetails.escortName}</div>}
                </div>
              </div>
            )}

            {/* Searchable Linked Travelers */}
            <div className="space-y-2 border-t pt-4">
              <label className="text-xs font-bold text-primary block">ربط مسافرين بالبلاغ (بحث سريع بالاسم أو رقم الجواز)</label>
              <SearchableCombobox
                value={travelerSearchVal}
                onChange={(selectedId) => {
                  if (travelersList.some((t) => t.id === selectedId)) {
                    setForm((prev) => ({
                      ...prev,
                      linkedTravelerIds: Array.from(new Set([...(prev.linkedTravelerIds || []), selectedId]))
                    }));
                    setTravelerSearchVal('');
                  } else {
                    setTravelerSearchVal(selectedId);
                  }
                }}
                options={travelerComboboxOptions}
                allowCustom={false}
                placeholder="اكتب اسم المسافر أو رقم الجواز للربط المباشر..."
              />
              <div className="space-y-1.5">
                {(form.linkedTravelerIds || []).length > 0 ? (
                  (form.linkedTravelerIds || []).map((tid) => {
                    const traveler = travelersList.find((t) => t.id === tid);
                    return (
                      <div key={tid} className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold">
                            {traveler ? `${traveler.firstName} ${traveler.lastName}` : 'مسافر غير موجود'}
                          </span>
                          <span className="text-slate-500 font-mono">{traveler?.idNumber}</span>
                        </div>
                        <div className="flex gap-1">
                          {traveler && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="h-7 text-primary"
                              onClick={() => {
                                setOpen(false);
                                navigate(`/travelers/${traveler.id}`);
                              }}
                            >
                              عرض الملف
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="h-7 text-destructive"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                linkedTravelerIds: (prev.linkedTravelerIds || []).filter((id) => id !== tid)
                              }))
                            }
                          >
                            إزالة الربط
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center py-2 text-slate-400 text-xs italic">لا يوجد مسافرون مرتبطون بهذا البلاغ حالياً</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">الحالة الإجرائية</label>
              <Select value={form.status || 'جديد'} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="جديد">جديد</SelectItem>
                  <SelectItem value="قيد التحقيق">قيد التحقيق</SelectItem>
                  {canApprove && <SelectItem value="معتمد">معتمد (بصمة الضابط)</SelectItem>}
                  {canApprove && <SelectItem value="مرفوض">مرفوض</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <StructuredAttachmentsField
              attachments={form.attachments || []}
              onChange={(next) => setForm({ ...form, attachments: next })}
              label="المرفقات ومذكرات الطلب (ضغط تلقائي للصور / PDF)"
            />
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            {editing && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleConvertToPermit(editing)}
                  className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  <Send className="h-3.5 w-3.5" /> ترحيل كتصريح تنقل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleConvertToMofaDispatch(editing)}
                  className="gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <Truck className="h-3.5 w-3.5" /> ترحيل كإرسالية جوازات
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Download className="h-4 w-4" /> تصدير
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent dir="rtl">
                    <DropdownMenuItem onClick={() => handlePrint()}>
                      <Printer className="h-4 w-4 ml-2" /> طباعة
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToPDF('report-edit-content', `بلاغ_${editing.id}`)}>
                      <FileText className="h-4 w-4 ml-2 text-red-600" /> PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToImage('report-edit-content', `بلاغ_${editing.id}`)}>
                      <ImageIcon className="h-4 w-4 ml-2 text-purple-600" /> صورة PNG
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {canApprove && editing && form.status !== 'معتمد' && (
              <Button
                variant="outline"
                className="text-green-600 border-green-200 hover:bg-green-50 gap-2"
                onClick={() => {
                  setForm({ ...form, status: 'معتمد' });
                  toast({ title: 'تم التجهيز للاعتماد', description: 'يرجى الضغط على حفظ لتأكيد الاعتماد' });
                }}
              >
                <ShieldCheck className="h-4 w-4" /> اعتماد الآن
              </Button>
            )}
            <Button onClick={save} className="gap-2">
              <Save className="h-4 w-4" /> حفظ التغييرات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div
        id="report-edit-content"
        className="fixed -left-[9999px] top-0 w-[700px] bg-white p-8 rounded-lg pointer-events-none border text-right"
        dir="rtl"
      >
        <div className="border-b pb-3 mb-4">
          <p className="text-xs text-slate-500 font-bold">الجمهورية اليمنية - وزارة الداخلية - مصلحة الهجرة والجوازات</p>
          <h2 className="text-xl font-bold text-slate-900 mt-1">{form.title || 'بلاغ أمني'}</h2>
          {form.autoNumber && (
            <p className="text-xs font-mono text-slate-600 mt-1">
              الرقم الآلي: {form.autoNumber} | التاريخ: {form.reportDate} | الجهة: {form.sendingAuthority}
            </p>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500">التصنيف</label> <p>{form.type}</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">الحالة</label> <p>{form.status}</p>
          </div>
          <div className="border-t pt-2">
            <p className="text-sm whitespace-pre-line">{form.description}</p>
          </div>
          {form.actionsTaken && (
            <div className="border-t pt-2 text-xs">
              <strong>الإجراءات المتخذة:</strong> {form.actionsTaken}
            </div>
          )}
        </div>
      </div>

      <MapsGroundingModal
        isOpen={mapsModalOpen}
        onClose={() => setMapsModalOpen(false)}
        defaultQuery={form.transportDetails?.route || form.title || 'خط السير بين صنعاء وعدن'}
        contextTitle="التحقق من خط السير والمنافذ على خرائط Google"
      />
    </div>
  );
};

export default Reports;
