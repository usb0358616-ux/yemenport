import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  FileCheck,
  Search,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileText,
  Stamp,
  Eye,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
  ScanLine,
  Sparkles
} from 'lucide-react';
import { getTravelers, saveTravelers, getReports, saveReports, generateId } from '@/lib/storage';
import { Traveler, Report } from '@/lib/types';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { ImportButtonWithPreview } from '@/components/FilePreviewList';

interface DocumentRegistryProps {
  initialSearch?: string;
}

export const DocumentRegistry: React.FC<DocumentRegistryProps> = ({ initialSearch = '' }) => {
  const { toast } = useToast();
  const [travelers, setTravelers] = useState<Traveler[]>(getTravelers);
  const [search, setSearch] = useState(initialSearch);
  const [filterType, setFilterType] = useState<string>('الكل');
  const [filterStatus, setFilterStatus] = useState<string>('الكل');
  
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verifyingTraveler, setVerifyingTraveler] = useState<Traveler | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);

  // New Document / Virtual OCR Scan Registration Modal State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [isScanningOCR, setIsScanningOCR] = useState(false);
  const [docForm, setDocForm] = useState({
    firstName: '',
    lastName: '',
    idNumber: '',
    idType: 'جواز',
    country: 'اليمن',
    issueDate: '2023-01-15',
    expiryDate: '2033-01-14',
    passportStatus: 'صالح',
    profession: 'مواطن يمني',
    travelAllowed: 'نعم',
    placeOfIssue: 'صنعاء - المركز الرئيسي'
  });

  useEffect(() => {
    setTravelers(getTravelers());
    const handleUpdated = () => setTravelers(getTravelers());
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleUpdated);
  }, []);

  // Helper to check expiry
  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return { isExpired: false, isExpiringSoon: false };
    const exp = new Date(expiryDate);
    const now = new Date();
    const diffMonths = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const isExpired = exp < now;
    const isExpiringSoon = !isExpired && diffMonths <= 6; // Expiring within 6 months
    return { isExpired, isExpiringSoon };
  };

  // Filter travelers / documents
  const filteredTravelers = travelers.filter(t => {
    const fullName = [t.firstName, t.secondName, t.lastName, t.passportName].filter(Boolean).join(' ');
    const matchSearch =
      fullName.includes(search) ||
      (t.idNumber && t.idNumber.includes(search)) ||
      (t.country && t.country.includes(search));

    const matchType = filterType === 'الكل' || t.idType === filterType;

    const { isExpired, isExpiringSoon } = getExpiryStatus(t.expiryDate);
    let matchStatus = true;
    if (filterStatus === 'صالح') {
      matchStatus = !isExpired && !isExpiringSoon && (t.passportStatus === 'صالح' || !t.passportStatus);
    } else if (filterStatus === 'قريب الانتهاء') {
      matchStatus = isExpiringSoon;
    } else if (filterStatus === 'منتهي') {
      matchStatus = isExpired || t.passportStatus === 'منتهي';
    } else if (filterStatus === 'مشتبه') {
      matchStatus = t.passportStatus === 'مشتبه' || t.travelAllowed === 'لا';
    }

    return matchSearch && matchType && matchStatus;
  });

  const handleVerifyPassport = (traveler: Traveler) => {
    setVerifyingTraveler(traveler);
    setIsVerifying(true);
    setVerificationResult(null);
    setVerificationModalOpen(true);

    setTimeout(() => {
      const { isExpired, isExpiringSoon } = getExpiryStatus(traveler.expiryDate);
      const reports = getReports();
      const fullName = [traveler.firstName, traveler.lastName].filter(Boolean).join(' ');
      const matchReport = reports.find(r => r.title.includes(fullName) || (traveler.idNumber && r.description.includes(traveler.idNumber)));

      setVerificationResult({
        isValid: !isExpired && !isExpiringSoon && !matchReport && traveler.travelAllowed !== 'لا',
        isExpired,
        isExpiringSoon,
        hasWatchlistMatch: !!matchReport,
        watchlistReport: matchReport,
        checkedAt: new Date().toLocaleString('ar-YE'),
        securityCode: `SEC-VERIFY-${traveler.idNumber || 'YEM'}-${Math.floor(Math.random() * 89999 + 10000)}`
      });
      setIsVerifying(false);
    }, 800);
  };

  const handleCreateReportFromDocument = (traveler: Traveler) => {
    const reports = getReports();
    const newReport: Report = {
      id: generateId(),
      title: `بلاغ ضبط / تدقيق وثيقة مسافر: ${traveler.firstName} ${traveler.lastName || ''}`,
      description: `تم رصد ومراجعة وثيقة المسافر رقم (${traveler.idNumber || 'غير محدد'}) - الجنسية: (${traveler.country || 'اليمن'}). حالة السفر: (${traveler.travelAllowed}).`,
      type: 'ضبط أمني',
      status: 'جديد',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: traveler.photoUrl ? [traveler.photoUrl] : []
    };
    const updatedReports = [newReport, ...reports];
    saveReports(updatedReports);
    toast({
      title: 'تم إنشاء بلاغ الضبط بنجاح',
      description: `تم ربط وثيقة المسافر ${traveler.firstName} بنظام بلاغات الضبط والتحري.`
    });
  };

  // Virtual OCR Scan Simulation
  const handleSimulateOCRScan = () => {
    setIsScanningOCR(true);
    setTimeout(() => {
      const randomNames = [
        { first: 'عبدالله', last: 'صالح الحاشدي', passport: 'P9876541' },
        { first: 'فاطمة', last: 'محمد العمري', passport: 'P4561239' },
        { first: 'جمال', last: 'ناصر القاضي', passport: 'P1122338' }
      ];
      const picked = randomNames[Math.floor(Math.random() * randomNames.length)];
      setDocForm({
        firstName: picked.first,
        lastName: picked.last,
        idNumber: picked.passport,
        idType: 'جواز',
        country: 'اليمن',
        issueDate: '2024-05-10',
        expiryDate: '2034-05-09',
        passportStatus: 'صالح',
        profession: 'موظف حكومي',
        travelAllowed: 'نعم',
        placeOfIssue: 'صنعاء - المركز الرئيسي'
      });
      setIsScanningOCR(false);
      toast({
        title: 'نجاح المسح الضوئي (OCR)',
        description: 'تم استخراج بيانات الجواز والرمز الآلي بنجاح عبر الماسح الضوئي الافتراضي.'
      });
    }, 1200);
  };

  const handleSaveNewDocument = () => {
    if (!docForm.firstName.trim() || !docForm.idNumber.trim()) {
      toast({ title: 'خطأ', description: 'يرجى إدخال اسم المسافر ورقم الوثيقة على الأقل', variant: 'destructive' });
      return;
    }

    const newTraveler: Traveler = {
      id: 'doc-' + generateId(),
      firstName: docForm.firstName.trim(),
      secondName: '',
      thirdName: '',
      lastName: docForm.lastName.trim(),
      idNumber: docForm.idNumber.trim(),
      idType: docForm.idType as any,
      country: docForm.country,
      issueDate: docForm.issueDate,
      expiryDate: docForm.expiryDate,
      passportStatus: docForm.passportStatus as any,
      profession: docForm.profession,
      travelAllowed: docForm.travelAllowed as any,
      placeOfIssue: docForm.placeOfIssue,
      createdAt: new Date().toISOString()
    } as Traveler;

    const updated = [newTraveler, ...travelers];
    setTravelers(updated);
    saveTravelers(updated);
    setRegisterModalOpen(false);
    toast({
      title: 'تم إدراج الوثيقة بنجاح في السجل',
      description: `تم حفظ جواز السفر رقم (${docForm.idNumber}) للمسافر ${docForm.firstName} ${docForm.lastName}`
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-primary to-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-amber-400 text-amber-300 text-[10px]">
              السجل السيادي الموحد
            </Badge>
            <span className="text-xs text-slate-300">الجمهورية اليمنية · مصلحة الجوازات</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
            سجل الوثائق وجوازات السفر الرسمية
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            قاعدة بيانات شاملة لجميع جوازات السفر والبطائق وتصاريح السفر، مع محرك مسح ضوئي افتراضي (OCR)، التحقق من الصلاحية والتنبيه المبكر.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <ImportButtonWithPreview
            category="traveler"
            sourceTitle="سجل الوثائق والجوازات"
            buttonLabel="استيراد ملفات متعددة"
            buttonClassName="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-9 shadow-sm"
            centerShortcutClassName="bg-white/10 text-white border-white/25 hover:bg-white/20 text-xs h-9"
          />
          <Button
            onClick={() => setRegisterModalOpen(true)}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs gap-2"
          >
            <Plus className="h-4 w-4" />
            إدراج وثيقة / مسح ضوئي جديد
          </Button>
          <Button
            variant="outline"
            className="bg-white/10 text-white border-white/20 hover:bg-white/20 text-xs font-bold gap-2"
            onClick={() => exportToExcel(travelers, 'سجل_الوثائق_والجوازات')}
          >
            <FileText className="h-4 w-4" />
            تصدير (Excel)
          </Button>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الجواز، اسم المسافر الكامل، أو الدولة..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10 text-right text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 text-xs"><SelectValue placeholder="نوع الوثيقة" /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="الكل">كل أنواع الوثائق</SelectItem>
                  <SelectItem value="جواز">جواز سفر</SelectItem>
                  <SelectItem value="شخصية">بطاقة شخصية</SelectItem>
                  <SelectItem value="عائلية">بطاقة عائلية</SelectItem>
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40 text-xs"><SelectValue placeholder="حالة الصلاحية" /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="الكل">كل الحالات والصلاحيات</SelectItem>
                  <SelectItem value="صالح">صالح وساري</SelectItem>
                  <SelectItem value="قريب الانتهاء">⚠️ قريب الانتهاء (&lt;6 أشهر)</SelectItem>
                  <SelectItem value="منتهي">✕ منتهي الصلاحية</SelectItem>
                  <SelectItem value="مشتبه">مشتبه / محظور</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>إجمالي الوثائق المعروضة: <strong className="text-primary font-mono">{filteredTravelers.length}</strong> وثيقة</span>
            <span>نظام التنبيه المبكر لصلاحية الجوازات مفعل</span>
          </div>
        </CardContent>
      </Card>

      {/* Documents Adaptive List & Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Mobile Adaptive Vertical Cards */}
          <div className="md:hidden max-h-[65dvh] overflow-y-auto adaptive-scroll-region divide-y divide-slate-100">
            {filteredTravelers.map((traveler) => {
              const fullName = [traveler.firstName, traveler.secondName, traveler.lastName].filter(Boolean).join(' ') || traveler.passportName || 'غير محدد';
              const { isExpired, isExpiringSoon } = getExpiryStatus(traveler.expiryDate);

              return (
                <div key={traveler.id} className="p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-slate-200 border overflow-hidden shrink-0 flex items-center justify-center">
                        {traveler.photoUrl ? (
                          <img src={traveler.photoUrl} alt={fullName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-600">{fullName.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{fullName}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {traveler.idNumber || '-'} ({traveler.idType || 'جواز'})
                        </p>
                      </div>
                    </div>
                    {isExpired ? (
                      <Badge variant="destructive" className="text-[10px] shrink-0">منتهي</Badge>
                    ) : isExpiringSoon ? (
                      <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px] shrink-0">قريب الانتهاء</Badge>
                    ) : (
                      <Badge className="text-[10px] bg-emerald-600 text-white shrink-0">✓ ساري</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>الجنسية: <strong>{traveler.country || 'اليمن'}</strong></div>
                    <div>القرار: <strong className={traveler.travelAllowed === 'نعم' ? 'text-emerald-700' : 'text-rose-700'}>{traveler.travelAllowed === 'نعم' ? 'مسموح' : 'ممنوع'}</strong></div>
                    <div className="font-mono">إصدار: {traveler.issueDate || '-'}</div>
                    <div className={`font-mono ${isExpired ? 'text-rose-600 font-bold' : isExpiringSoon ? 'text-amber-600 font-bold' : ''}`}>
                      انتهاء: {traveler.expiryDate || '-'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs font-bold gap-1 text-primary"
                      onClick={() => handleVerifyPassport(traveler)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> تحقق
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs gap-1"
                      onClick={() => {
                        setSelectedTraveler(traveler);
                        setDetailsOpen(true);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" /> عرض
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => handleCreateReportFromDocument(traveler)}
                      title="إصدار بلاغ ضبط من الوثيقة"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredTravelers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-xs">
                لا توجد وثائق مطابقة للبحث أو معايير الفلترة المحددة.
              </div>
            )}
          </div>

          {/* Desktop Bounded Sticky Table */}
          <div className="hidden md:block adaptive-table-container">
            <Table>
              <TableHeader className="bg-slate-50/95 backdrop-blur-xs sticky top-0 z-10 shadow-2xs">
                <TableRow>
                  <TableHead className="text-right font-bold text-slate-800">صورة المسافر والاسم</TableHead>
                  <TableHead className="text-right font-bold text-slate-800">رقم الوثيقة ونوعها</TableHead>
                  <TableHead className="text-right font-bold text-slate-800">الجنسية / الدولة</TableHead>
                  <TableHead className="text-right font-bold text-slate-800">تاريخ الإصدار والانتهاء</TableHead>
                  <TableHead className="text-center font-bold text-slate-800">حالة الصلاحية والتنبيه</TableHead>
                  <TableHead className="text-center font-bold text-slate-800">القرار الأمني</TableHead>
                  <TableHead className="text-center font-bold text-slate-800">الإجراءات والتحقق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTravelers.map((traveler) => {
                  const fullName = [traveler.firstName, traveler.secondName, traveler.lastName].filter(Boolean).join(' ') || traveler.passportName || 'غير محدد';
                  const { isExpired, isExpiringSoon } = getExpiryStatus(traveler.expiryDate);

                  return (
                    <TableRow key={traveler.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-bold text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-200 border overflow-hidden shrink-0 flex items-center justify-center">
                            {traveler.photoUrl ? (
                              <img src={traveler.photoUrl} alt={fullName} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-slate-600">{fullName.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{fullName}</p>
                            <p className="text-[10px] text-muted-foreground">{traveler.profession || 'مواطن / مسافر'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-slate-800">
                        <div>{traveler.idNumber || '-'}</div>
                        <span className="text-[10px] text-muted-foreground font-sans font-normal">({traveler.idType || 'جواز'})</span>
                      </TableCell>
                      <TableCell className="text-slate-700 text-xs font-semibold">
                        {traveler.country || 'اليمن'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">
                        <div>إصدار: {traveler.issueDate || '-'}</div>
                        <div className={isExpired ? 'text-rose-600 font-bold' : isExpiringSoon ? 'text-amber-600 font-bold' : ''}>
                          انتهاء: {traveler.expiryDate || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {isExpired ? (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" /> منتهي الصلاحية
                          </Badge>
                        ) : isExpiringSoon ? (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" /> تنبيه: قريب الانتهاء
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px] bg-emerald-600 text-white">
                            ✓ صالح وساري
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`text-[10px] ${
                            traveler.travelAllowed === 'نعم'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {traveler.travelAllowed === 'نعم' ? '✓ مسموح بالسفر' : '✕ ممنوع / محظور'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs font-bold gap-1 text-primary hover:bg-primary/5"
                            onClick={() => handleVerifyPassport(traveler)}
                            title="التحقق الآلي من الوثيقة"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            تحقق
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-primary"
                            onClick={() => {
                              setSelectedTraveler(traveler);
                              setDetailsOpen(true);
                            }}
                            title="عرض التفاصيل الكاملة"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleCreateReportFromDocument(traveler)}
                            title="إصدار بلاغ ضبط من الوثيقة"
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredTravelers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      لا توجد وثائق مطابقة للبحث أو معايير الفلترة المحددة.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Register Document / Virtual OCR Scan */}
      <Dialog open={registerModalOpen} onOpenChange={setRegisterModalOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary shrink-0" />
              <span>إدراج وثيقة رسمية أو مسح ضوئي جديد (OCR)</span>
            </DialogTitle>
            <DialogDescription>
              أدخل بيانات الجواز أو البطاقة يدوياً أو استخدم نظام المسح الضوئي الافتراضي لاستخراج البيانات آلياً.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4 text-xs">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">المسح الضوئي الذكي (Virtual OCR)</p>
                  <p className="text-[11px] text-slate-600">قراءة بيانات جواز السفر والباركود أو استمارة المسافر تلقائياً</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleSimulateOCRScan}
                disabled={isScanningOCR}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5 w-full sm:w-auto shrink-0"
              >
                {isScanningOCR ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                مسح ضوئي تجريبي
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">الاسم الأول:</label>
                <Input
                  value={docForm.firstName}
                  onChange={e => setDocForm({ ...docForm, firstName: e.target.value })}
                  placeholder="مثال: محمد"
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">اسم العائلة / اللقب:</label>
                <Input
                  value={docForm.lastName}
                  onChange={e => setDocForm({ ...docForm, lastName: e.target.value })}
                  placeholder="مثال: القاضي"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">رقم الوثيقة / الجواز:</label>
                <Input
                  value={docForm.idNumber}
                  onChange={e => setDocForm({ ...docForm, idNumber: e.target.value })}
                  placeholder="مثال: P9876541"
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">نوع الوثيقة:</label>
                <Select
                  value={docForm.idType}
                  onValueChange={v => setDocForm({ ...docForm, idType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="جواز">جواز سفر</SelectItem>
                    <SelectItem value="شخصية">بطاقة شخصية</SelectItem>
                    <SelectItem value="عائلية">بطاقة عائلية</SelectItem>
                    <SelectItem value="أخرى">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">تاريخ الإصدار:</label>
                <Input
                  type="date"
                  value={docForm.issueDate}
                  onChange={e => setDocForm({ ...docForm, issueDate: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">تاريخ الانتهاء:</label>
                <Input
                  type="date"
                  value={docForm.expiryDate}
                  onChange={e => setDocForm({ ...docForm, expiryDate: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">الجنسية:</label>
                <Input
                  value={docForm.country}
                  onChange={e => setDocForm({ ...docForm, country: e.target.value })}
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">حالة الجواز:</label>
                <Select
                  value={docForm.passportStatus}
                  onValueChange={v => setDocForm({ ...docForm, passportStatus: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="صالح">صالح وساري</SelectItem>
                    <SelectItem value="منتهي">منتهي</SelectItem>
                    <SelectItem value="مشتبه">مشتبه</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">قرار السفر:</label>
                <Select
                  value={docForm.travelAllowed}
                  onValueChange={v => setDocForm({ ...docForm, travelAllowed: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="نعم">مسموح بالسفر</SelectItem>
                    <SelectItem value="لا">ممنوع / محظور</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setRegisterModalOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={handleSaveNewDocument} className="bg-primary hover:bg-primary/90 text-white font-bold w-full sm:w-auto">
              حفظ وإدراج في السجل السيادي
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Document Details */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary shrink-0" />
              <span>تفاصيل الوثيقة الرسمية وجواز السفر</span>
            </DialogTitle>
            <DialogDescription>عرض كامل لبيانات المسافر، الختم، وقوائم المباينة الأمنية.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5">
            {selectedTraveler && (
              <div className="space-y-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border">
                  <div className="h-20 w-20 rounded-lg overflow-hidden border bg-white shrink-0 flex items-center justify-center mx-auto sm:mx-0">
                    {selectedTraveler.photoUrl ? (
                      <img src={selectedTraveler.photoUrl} alt="صورة" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground font-bold">بدون صورة</span>
                    )}
                  </div>
                  <div className="space-y-1 text-center sm:text-right min-w-0">
                    <h3 className="font-extrabold text-slate-900 text-sm">
                      {[selectedTraveler.firstName, selectedTraveler.secondName, selectedTraveler.lastName].filter(Boolean).join(' ') || selectedTraveler.passportName}
                    </h3>
                    <p className="font-mono font-bold text-primary">رقم الوثيقة: {selectedTraveler.idNumber}</p>
                    <p className="text-slate-600">الجنسية: {selectedTraveler.country || 'اليمن'} · المحافظة: {selectedTraveler.governorate || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 border rounded-xl">
                  <div><span className="text-muted-foreground block text-[10px]">نوع الوثيقة:</span> <strong className="text-slate-800">{selectedTraveler.idType}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">حالة الجواز:</span> <strong className="text-slate-800">{selectedTraveler.passportStatus || 'صالح'}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">تاريخ الإصدار:</span> <strong className="text-slate-800 font-mono">{selectedTraveler.issueDate || '-'}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">تاريخ الانتهاء:</span> <strong className="text-slate-800 font-mono">{selectedTraveler.expiryDate || '-'}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">مكان الإصدار:</span> <strong className="text-slate-800">{selectedTraveler.placeOfIssue || '-'}</strong></div>
                  <div><span className="text-muted-foreground block text-[10px]">المهنة:</span> <strong className="text-slate-800">{selectedTraveler.profession || '-'}</strong></div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border space-y-1.5">
                  <span className="text-muted-foreground block text-[10px] font-bold">نتائج المباينة الأمنية وقوائم الترقب:</span>
                  <p className="text-slate-900 font-semibold leading-relaxed">
                    {selectedTraveler.vettingResult || 'تمت المطابقة الأمنية بنجاح - لا توجد قيود أمنية أو بلاغات سارية'}
                  </p>
                  {selectedTraveler.additionalInfo && (
                    <p className="text-slate-600 text-[11px] pt-1 border-t border-slate-200 mt-1">
                      {selectedTraveler.additionalInfo}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          {selectedTraveler && (
            <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setDetailsOpen(false)} className="w-full sm:w-auto">إغلاق</Button>
              <Button onClick={() => { setDetailsOpen(false); handleVerifyPassport(selectedTraveler); }} className="gap-2 w-full sm:w-auto">
                <ShieldCheck className="h-4 w-4" /> فحص وتحقق شامل
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Verification Result Modal */}
      <Dialog open={verificationModalOpen} onOpenChange={setVerificationModalOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              <span>نتيجة الفحص والتحقق الآلي من الوثيقة</span>
            </DialogTitle>
            <DialogDescription>نتيجة التدقيق في قاعدة البيانات المركزية وقوائم المباينة.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5">
            {isVerifying ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs font-bold text-slate-700">جاري مطابقة بصمة الجواز وقوائم المنع والترقب...</p>
              </div>
            ) : verificationResult && (
              <div className="space-y-4 text-xs">
                <div className={`p-4 rounded-2xl border text-center space-y-2 ${verificationResult.isValid ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                  <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-xs">
                    {verificationResult.isValid ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-rose-600" />}
                  </div>
                  <h3 className="font-extrabold text-base">
                    {verificationResult.isValid ? '✓ الوثيقة سليمة ومعتمدة للعبور' : '✕ تحذير أمني! الوثيقة مرفوضة أو منتهية'}
                  </h3>
                  <p className="text-[11px] opacity-90">
                    {verificationResult.isValid ? 'تمت المطابقة بنجاح ولم ينسحب عليها أي قيود أو بلاغات.' : 'تم رصد ملاحظة أمنية أو انتهاء صلاحية الجواز.'}
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border space-y-2">
                  <div className="flex justify-between border-b pb-1 gap-2">
                    <span className="text-muted-foreground">رقم التحقق المرجعي:</span>
                    <span className="font-mono font-bold text-slate-800">{verificationResult.securityCode}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1 gap-2">
                    <span className="text-muted-foreground">حالة الصلاحية الزمنية:</span>
                    <span className={verificationResult.isExpired || verificationResult.isExpiringSoon ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                      {verificationResult.isExpired ? 'منتهية الصلاحية' : verificationResult.isExpiringSoon ? 'قريبة الانتهاء (تحذير)' : 'سارية ومطابقة'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">قوائم المطلوبين والبلاغات:</span>
                    <span className={verificationResult.hasWatchlistMatch ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                      {verificationResult.hasWatchlistMatch ? 'تطابق مع بلاغ ضبط!' : 'لا توجد بلاغات سارية'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isVerifying && verificationResult && (
            <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setVerificationModalOpen(false)} className="w-full sm:w-auto">إغلاق</Button>
              {verifyingTraveler && (
                <Button
                  onClick={() => {
                    setVerificationModalOpen(false);
                    handleCreateReportFromDocument(verifyingTraveler);
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5 w-full sm:w-auto"
                >
                  <ShieldAlert className="h-4 w-4" /> إصدار بلاغ ضبط فوري
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
