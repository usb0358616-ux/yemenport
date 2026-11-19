import React, { useState, useMemo, useEffect } from 'react';
import {
  MofaVisaRequest,
  MofaBeneficiary
} from '@/lib/types';
import {
  getMofaRequests,
  saveMofaRequests
} from '@/lib/storage';
import { SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { ImportButtonWithPreview } from '@/components/FilePreviewList';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { exportToExcel, handlePrint } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  FileText,
  Users,
  Plane,
  Truck,
  Search,
  Printer,
  Download,
  Eye,
  Trash2,
  Sparkles,
  CheckCircle,
  ExternalLink,
  Briefcase,
  GraduationCap
} from 'lucide-react';

export default function MofaVisasHub() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<MofaVisaRequest[]>(getMofaRequests);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState('all');
  const [activeTab, setActiveTab] = useState<'memos' | 'beneficiaries' | 'flights' | 'dispatches'>('memos');

  // Modals
  const [selectedRequest, setSelectedRequest] = useState<MofaVisaRequest | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const refreshData = () => {
    setRequests(getMofaRequests());
  };

  useEffect(() => {
    const onUpdated = () => refreshData();
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, onUpdated);
  }, []);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchSearch =
        req.memoNumber.toLowerCase().includes(search.toLowerCase()) ||
        req.organization.toLowerCase().includes(search.toLowerCase()) ||
        req.requestType.toLowerCase().includes(search.toLowerCase()) ||
        req.beneficiaries.some(b =>
          (b.fullName && b.fullName.toLowerCase().includes(search.toLowerCase())) ||
          (b.fullNameEn && b.fullNameEn.toLowerCase().includes(search.toLowerCase())) ||
          b.passportNumber.toLowerCase().includes(search.toLowerCase())
        );

      const matchType = selectedType === 'all' || req.requestType.includes(selectedType);
      const matchOrg = selectedOrg === 'all' || req.organization.includes(selectedOrg);

      return matchSearch && matchType && matchOrg;
    });
  }, [requests, search, selectedType, selectedOrg]);

  // Flattened beneficiaries
  const allBeneficiaries = useMemo(() => {
    const list: Array<MofaBeneficiary & { parentReq: MofaVisaRequest }> = [];
    requests.forEach(req => {
      req.beneficiaries.forEach(ben => {
        list.push({ ...ben, parentReq: req });
      });
    });
    return list.filter(b => {
      if (!search) return true;
      return (
        (b.fullName && b.fullName.toLowerCase().includes(search.toLowerCase())) ||
        (b.fullNameEn && b.fullNameEn.toLowerCase().includes(search.toLowerCase())) ||
        b.passportNumber.toLowerCase().includes(search.toLowerCase()) ||
        b.nationality.toLowerCase().includes(search.toLowerCase()) ||
        b.parentReq.organization.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [requests, search]);

  // Flights list
  const flightRequests = useMemo(() => {
    return requests.filter(r => r.flightDetails || r.requestType.includes('مانيفست') || r.requestType.includes('طيران'));
  }, [requests]);

  // Dispatches list
  const dispatchRequests = useMemo(() => {
    return requests.filter(r => r.dispatchDetails || r.requestType.includes('إرسالية') || r.requestType.includes('نقل جوازات'));
  }, [requests]);

  // Metrics
  const totalBeneficiaries = useMemo(() => {
    return requests.reduce((acc, curr) => acc + (curr.beneficiaries?.length || 0), 0);
  }, [requests]);

  const handleDeleteRequest = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه المذكرة من السجل؟')) {
      const updated = requests.filter(r => r.id !== id);
      saveMofaRequests(updated);
      setRequests(updated);
      toast({
        title: 'تم حذف المذكرة',
        description: 'تم تحديث السجل بنجاح',
      });
    }
  };

  const handleExportAll = () => {
    const exportData = requests.map(r => ({
      'رقم المذكرة': r.memoNumber,
      'التاريخ': r.memoDate,
      'المنظمة / الجهة': r.organization,
      'نوع الطلب': r.requestType,
      'عدد المستفيدين': r.beneficiaries.length,
      'حالة الاعتماد': r.approvalStatus,
      'التوجيه الرسمي': r.mofaDirective,
      'اسم الملف المصدر': r.sourceFileName
    }));
    exportToExcel(exportData, `سجل_مذكرات_الخارجية_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Top Banner / Republic Header */}
      <div className="bg-gradient-to-l from-slate-900 via-primary to-slate-800 text-white p-6 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                الربط السيادي مع وزارة الخارجية والمغتربين
              </span>
              <span className="text-xs text-slate-300">نظام المنافذ والإقامات الموحد</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              مركز مذكرات وتأشيرات الخارجية والمنظمات والرحلات الدولية
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl">
              إدارة وتحليل طلبات تأشيرات الدخول، تجديد الإقامات، تصاريح التنقل للمنظمات الدولية والإنسانية، كشوفات ركاب الطيران (Manifest)، وإرساليات الجوازات مع المطابقة الذكية للـ PDF.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-2 shrink-0">
            <ImportButtonWithPreview
              category="visa"
              sourceTitle="مذكرات وتأشيرات الخارجية"
              buttonLabel="استيراد ملفات (PDF / صور)"
              buttonClassName="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
              centerShortcutClassName="bg-white/10 hover:bg-white/20 text-white border-white/25"
            />
            <Button
              variant="outline"
              onClick={handleExportAll}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-2"
            >
              <Download className="w-4 h-4" />
              تصدير إكسل
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePrint()}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-2"
            >
              <Printer className="w-4 h-4" />
              طباعة
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">إجمالي المذكرات والطلبات</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{requests.length}</h3>
              <p className="text-[11px] text-emerald-600 mt-0.5">معتمدة ومسجلة في النظام</p>
            </div>
            <div className="p-3 bg-blue-50 text-primary rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">الكوادر والوافدون الأجانب</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{totalBeneficiaries}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">مستفيدون مسجلون ومطابقون</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">رحلات الطيران الإنساني والمانيفست</p>
              <h3 className="text-2xl font-bold text-blue-700 mt-1">{flightRequests.length}</h3>
              <p className="text-[11px] text-blue-600 mt-0.5">رحلات MSF والأمم المتحدة</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Plane className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">إرساليات نقل الجوازات بين الفروع</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{dispatchRequests.length}</h3>
              <p className="text-[11px] text-amber-600 mt-0.5">شركات أجياد والقوافل</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Truck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('memos')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'memos'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          مذكرات وتأشيرات الخارجية ({requests.length})
        </button>

        <button
          onClick={() => setActiveTab('beneficiaries')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'beneficiaries'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          الكوادر والوافدون الأجانب المستخرجون ({allBeneficiaries.length})
        </button>

        <button
          onClick={() => setActiveTab('flights')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'flights'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Plane className="w-4 h-4" />
          رحلات الطيران الدولية والمانيفست ({flightRequests.length})
        </button>

        <button
          onClick={() => setActiveTab('dispatches')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'dispatches'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          إرساليات وكشوفات نقل الجوازات ({dispatchRequests.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-b-xl border border-t-0 border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <Input
            placeholder="بحث برقم المذكرة، المنظمة، اسم الوافد، أو رقم الجواز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-40 bg-slate-50 text-xs">
              <SelectValue placeholder="نوع المعاملة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعاملات</SelectItem>
              <SelectItem value="تأشيرة">تأشيرات دخول</SelectItem>
              <SelectItem value="إقامة">إقامات وتجديد</SelectItem>
              <SelectItem value="تنقل">تصاريح تنقل</SelectItem>
              <SelectItem value="مانيفست">رحلات ومانيفست</SelectItem>
              <SelectItem value="إرسالية">إرساليات جوازات</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setSelectedType('all');
              setSelectedOrg('all');
            }}
            className="text-xs text-slate-500"
          >
            إعادة تعيين
          </Button>
        </div>
      </div>

      {/* TAB 1: MEMOS & VISAS */}
      {activeTab === 'memos' && (
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          {/* Mobile Adaptive Vertical Cards */}
          <div className="md:hidden max-h-[65dvh] overflow-y-auto adaptive-scroll-region divide-y divide-slate-100">
            {filteredRequests.map((req) => (
              <div key={req.id} className="p-3.5 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-primary text-xs">{req.memoNumber}</span>
                    <h4 className="font-bold text-slate-900 truncate">{req.organization}</h4>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] shrink-0">
                    {req.approvalStatus}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-xl text-[11px] text-slate-600">
                  <div>التاريخ: <span className="font-mono">{req.memoDate}</span></div>
                  <div>المستفيدين: <strong>{req.beneficiaries.length}</strong></div>
                  <div className="col-span-2 truncate">النوع: {req.requestType}</div>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(req);
                      setViewModalOpen(true);
                    }}
                    className="flex-1 h-8 text-xs text-primary gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> عرض المذكرة
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteRequest(req.id)}
                    className="h-8 px-2.5 text-red-500 border-red-200 hover:bg-red-50"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredRequests.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs">
                لا توجد مذكرات مطابقة لخيارات البحث
              </div>
            )}
          </div>

          {/* Desktop Bounded Sticky Table */}
          <div className="hidden md:block adaptive-table-container">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="p-3">رقم المذكرة</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الجهة / المنظمة</th>
                  <th className="p-3">نوع المعاملة</th>
                  <th className="p-3">المستفيدون / الركاب</th>
                  <th className="p-3">التوجيه الوزاري</th>
                  <th className="p-3">الحالة السيادية</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-primary">
                      {req.memoNumber}
                    </td>
                    <td className="p-3 text-slate-600 font-mono">
                      {req.memoDate}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{req.organization}</div>
                      <span className="text-[10px] text-slate-400">{req.organizationType}</span>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[11px] bg-slate-50">
                        {req.requestType}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {req.beneficiaries.length}
                        </Badge>
                        <span className="text-slate-600 truncate max-w-[140px] block">
                          {req.beneficiaries[0] ? (req.beneficiaries[0].fullName || req.beneficiaries[0].fullNameEn) : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 max-w-xs text-slate-600 truncate" title={req.mofaDirective}>
                      {req.mofaDirective}
                    </td>
                    <td className="p-3">
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px]">
                        <CheckCircle className="w-3 h-3 ml-1" />
                        {req.approvalStatus}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedRequest(req);
                            setViewModalOpen(true);
                          }}
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          title="عرض ملف المذكرة والمرفقات"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRequest(req.id)}
                          className="h-8 w-8 text-red-500 hover:bg-red-50"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      لا توجد مذكرات مطابقة لخيارات البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: BENEFICIARIES */}
      {activeTab === 'beneficiaries' && (
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          {/* Mobile Adaptive Vertical Cards */}
          <div className="md:hidden max-h-[65dvh] overflow-y-auto adaptive-scroll-region divide-y divide-slate-100">
            {allBeneficiaries.map((b, idx) => (
              <div key={idx} className="p-3.5 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{b.fullName}</div>
                    {b.fullNameEn && <div className="text-[11px] text-slate-500 font-mono truncate">{b.fullNameEn}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{b.nationality}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-xl text-[11px] text-slate-600">
                  <div>الجواز: <strong className="font-mono text-primary">{b.passportNumber}</strong></div>
                  <div className="truncate">الجهة: {b.parentReq.organization}</div>
                  <div className="truncate">الوظيفة: {b.profession || 'خبير إنساني'}</div>
                  <div className="truncate font-mono">{b.missionDuration || (b.endDate ? `حتى ${b.endDate}` : 'سارية')}</div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(b.parentReq);
                      setViewModalOpen(true);
                    }}
                    className="h-7 text-xs font-mono text-primary"
                  >
                    مذكرة: {b.parentReq.memoNumber}
                  </Button>
                </div>
              </div>
            ))}
            {allBeneficiaries.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs">
                لا يوجد مستفيدون مسجلون مطابقون للبحث
              </div>
            )}
          </div>

          {/* Desktop Bounded Sticky Table */}
          <div className="hidden md:block adaptive-table-container">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">الاسم بالكامل</th>
                  <th className="p-3">رقم الجواز / الوثيقة</th>
                  <th className="p-3">الجنسية</th>
                  <th className="p-3">المنظمة / جهة العمل</th>
                  <th className="p-3">المسمى الوظيفي والتخصص</th>
                  <th className="p-3">مدة المهمة / الصلاحية</th>
                  <th className="p-3">مذكرة الخارجية المرتبطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allBeneficiaries.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900 text-sm">
                        {b.fullName}
                      </div>
                      {b.fullNameEn && (
                        <span className="text-[11px] text-slate-500 font-mono block">{b.fullNameEn}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">
                        {b.passportNumber}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {b.nationality}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {b.parentReq.organization}
                    </td>
                    <td className="p-3 text-slate-600">
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>{b.profession || 'خبير إنساني'}</span>
                      </div>
                      {b.educationDetails && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                          <GraduationCap className="w-3 h-3 text-slate-400" />
                          <span>{b.educationDetails}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 font-mono">
                      {b.missionDuration || (b.endDate ? `حتى ${b.endDate}` : 'سارية')}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(b.parentReq);
                          setViewModalOpen(true);
                        }}
                        className="p-0 text-primary text-xs font-mono font-bold"
                      >
                        {b.parentReq.memoNumber}
                      </Button>
                    </td>
                  </tr>
                ))}
                {allBeneficiaries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      لا يوجد مستفيدون مسجلون مطابقون للبحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: FLIGHTS */}
      {activeTab === 'flights' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flightRequests.map((req) => (
              <Card key={req.id} className="border-slate-200 shadow-sm bg-white hover:border-primary/50 transition-all">
                <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-blue-600 text-white gap-1">
                      <Plane className="w-3 h-3" />
                      رحلة طيران معتمدة
                    </Badge>
                    <span className="text-xs font-mono text-slate-500">
                      {req.flightDetails?.flightDate || req.memoDate}
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold text-slate-900 mt-2">
                    {req.flightDetails?.callSign || req.memoNumber}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600">
                    الناقل: {req.organization}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">مسار الرحلة</span>
                      <strong className="text-blue-950 font-bold">{req.flightDetails?.route || 'عدن - صنعاء - مأرب'}</strong>
                    </div>
                    <div className="flex flex-col items-center">
                      <Plane className="w-4 h-4 text-blue-500 rotate-180" />
                      <span className="text-[10px] text-blue-400">طراز: {req.flightDetails?.aircraftType || 'Dash-8'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-600">عدد الركاب في المانيفست:</span>
                    <Badge variant="secondary" className="font-mono font-bold">
                      {req.flightDetails?.totalPassengers || req.beneficiaries.length} راكباً
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">الملف: {req.sourceFileName}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(req);
                        setViewModalOpen(true);
                      }}
                      className="text-xs gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      كشف المانيفست
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DISPATCHES */}
      {activeTab === 'dispatches' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispatchRequests.map((req) => (
              <Card key={req.id} className="border-slate-200 shadow-sm bg-white hover:border-amber-500/50 transition-all">
                <CardHeader className="p-4 border-b border-slate-100 bg-amber-50/40">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-amber-600 text-white gap-1">
                      <Truck className="w-3 h-3" />
                      إرسالية نقل جوازات
                    </Badge>
                    <span className="text-xs font-mono text-slate-500">
                      {req.memoDate}
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold text-slate-900 mt-2">
                    {req.dispatchDetails?.companyName || req.organization}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600 font-mono">
                    فرع الوجهة: {req.dispatchDetails?.destinationBranch || 'الإدارة العامة'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">لوحة المركبة:</span>
                      <strong className="font-mono text-slate-900">{req.dispatchDetails?.carPlate || 'حافلة نقل جماعي'}</strong>
                    </div>
                    {req.dispatchDetails?.driverName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">السائق:</span>
                        <strong className="text-slate-900">{req.dispatchDetails.driverName}</strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">إجمالي الجوازات:</span>
                      <Badge className="bg-amber-600 text-white font-mono">
                        {req.dispatchDetails?.passportsCount || req.beneficiaries.length} جواز سفر
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">الملف: {req.sourceFileName}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(req);
                        setViewModalOpen(true);
                      }}
                      className="text-xs gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      عرض الإرسالية
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* DETAIL DOSSIER MODAL */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right font-sans" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedRequest?.memoNumber}
                </Badge>
                <Badge className="bg-emerald-600 text-white text-xs">
                  {selectedRequest?.approvalStatus}
                </Badge>
              </div>
              <DialogTitle className="text-base sm:text-xl font-extrabold text-slate-900 mt-1 truncate">
                ملف المعاملة السيادية: {selectedRequest?.organization}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                تاريخ الصدور: {selectedRequest?.memoDate} | نوع الطلب: {selectedRequest?.requestType}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5">
            {selectedRequest && (
              <div className="space-y-5">
                {/* Sovereign Official Letterhead Preview */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <h5 className="font-bold text-xs text-slate-800">الجمهورية اليمنية</h5>
                      <p className="text-[10px] text-slate-500">وزارة الخارجية وشؤون المغتربين - قطاع المراسم والمنظمات</p>
                    </div>
                    <div className="text-left font-mono text-[10px] text-slate-500">
                      <div>الرقم: {selectedRequest.memoNumber}</div>
                      <div>التاريخ: {selectedRequest.memoDate}</div>
                    </div>
                  </div>

                  <div>
                    <h6 className="font-bold text-xs text-slate-700">التوجيه الوزاري الرسمي:</h6>
                    <p className="text-xs text-slate-800 bg-white p-3 rounded-lg border border-slate-200 mt-1 leading-relaxed">
                      {selectedRequest.mofaDirective}
                    </p>
                  </div>
                </div>

                {/* Beneficiaries Adaptive View */}
                <div className="space-y-2">
                  <h5 className="font-bold text-sm text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" />
                      المستفيدون والأشخاص المقيدون في الوثيقة ({selectedRequest.beneficiaries.length}):
                    </span>
                  </h5>

                  {/* Mobile Vertical Beneficiary Cards */}
                  <div className="md:hidden border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto adaptive-scroll-region divide-y divide-slate-100 bg-white">
                    {selectedRequest.beneficiaries.map((b, idx) => (
                      <div key={idx} className="p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{b.fullName}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{b.nationality}</Badge>
                        </div>
                        {b.fullNameEn && <div className="text-[10px] text-slate-500">{b.fullNameEn}</div>}
                        <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded-lg text-[11px] text-slate-600">
                          <div>الجواز: <strong className="font-mono text-primary">{b.passportNumber}</strong></div>
                          <div className="truncate">{b.profession || 'خبير'}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block border border-slate-200 rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">الاسم</th>
                          <th className="p-2.5">رقم الجواز</th>
                          <th className="p-2.5">الجنسية</th>
                          <th className="p-2.5">الوظيفة / الدور</th>
                          <th className="p-2.5">مكان العمل / المدة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRequest.beneficiaries.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-900">
                              {b.fullName}
                              {b.fullNameEn && (
                                <span className="block text-[10px] text-slate-500 font-normal">{b.fullNameEn}</span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono font-semibold text-primary">{b.passportNumber}</td>
                            <td className="p-2.5">
                              <Badge variant="outline" className="text-[10px]">{b.nationality}</Badge>
                            </td>
                            <td className="p-2.5 text-slate-600">{b.profession || 'خبير'}</td>
                            <td className="p-2.5 text-slate-500">{b.workLocation || b.missionDuration || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Attached Files & Metadata */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-slate-500 block">ملف الوثيقة المصدر:</span>
                    <strong className="text-slate-800 font-mono truncate block">{selectedRequest.sourceFileName}</strong>
                  </div>
                  {selectedRequest.sourceFileUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = selectedRequest.sourceFileUrl || '';
                        link.target = '_blank';
                        link.click();
                      }}
                      className="text-xs gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      فتح ملف PDF الأصلي
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setViewModalOpen(false)} className="w-full sm:w-auto">
              إغلاق
            </Button>
            <Button
              onClick={() => handlePrint()}
              className="gap-1.5 w-full sm:w-auto"
            >
              <Printer className="w-4 h-4" />
              طباعة الملف
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
