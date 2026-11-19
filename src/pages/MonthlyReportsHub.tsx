import React, { useState, useMemo, useEffect } from 'react';
import {
  getTravelers,
  getSeizures,
  getMigrants,
  getRefugees,
  getForeigners,
  getMovementPermits,
  getCitizenshipCases,
  getMonitoredCompanies,
  getCorrespondence,
  getMofaRequests,
  getCurrentUser,
  normalizeArabic,
  cleanArabicText
} from '@/lib/storage';
import { SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText,
  Printer,
  Calendar,
  Building2,
  Users,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  FileSpreadsheet,
  FileCheck,
  Edit3,
  Globe,
  Plane,
  Briefcase,
  HeartHandshake,
  Mail,
  MapPin,
  CheckCircle2,
  PackageCheck
} from 'lucide-react';
import { exportToExcel, exportToWord, handlePrint, OFFICIAL_HEADER } from '@/lib/exportUtils';
import { toast } from 'sonner';

export const MonthlyReportsHub = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dataTick, setDataTick] = useState(0);

  useEffect(() => {
    const refresh = () => setDataTick(t => t + 1);
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, refresh);
  }, []);

  const [signatories, setSignatories] = useState({
    preparer: localStorage.getItem('report_preparer') || 'ضابط الإحصاء والمعلومات',
    operations: localStorage.getItem('report_operations') || 'مدير غرفة العمليات والسيطرة المركزية (صنعاء)',
    director:
      localStorage.getItem('config_director_name') ||
      localStorage.getItem('report_director') ||
      'مدير عام المنافذ والرقابة الحدودية'
  });
  const [signatoriesDialogOpen, setSignatoriesDialogOpen] = useState(false);

  const handleSaveSignatories = () => {
    localStorage.setItem('report_preparer', signatories.preparer);
    localStorage.setItem('report_operations', signatories.operations);
    localStorage.setItem('report_director', signatories.director);
    setSignatoriesDialogOpen(false);
    toast.success('تم حفظ أسماء ورتب المسؤولين الموقعين على التقرير بنجاح');
  };

  const currentUser = getCurrentUser();

  const {
    travelers,
    seizures,
    migrants,
    refugees,
    foreigners,
    permits,
    citizenshipCases,
    companies,
    correspondence,
    mofaRequests
  } = useMemo(() => {
    return {
      travelers: getTravelers(),
      seizures: getSeizures(),
      migrants: getMigrants(),
      refugees: getRefugees(),
      foreigners: getForeigners(),
      permits: getMovementPermits(),
      citizenshipCases: getCitizenshipCases(),
      companies: getMonitoredCompanies(),
      correspondence: getCorrespondence(),
      mofaRequests: getMofaRequests()
    };
  }, [dataTick]);

  // Available months extracted cleanly from real records
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const extractYm = (s?: string) => {
      if (s && /^\d{4}-\d{2}/.test(s.trim())) {
        set.add(s.trim().slice(0, 7));
      }
    };
    travelers.forEach(t => {
      extractYm(t.exitDate);
      extractYm(t.receiveDate);
      extractYm(t.createdAt);
    });
    mofaRequests.forEach(m => {
      extractYm(m.memoDate);
      extractYm(m.createdAt);
    });
    seizures.forEach(s => {
      extractYm(s.seizureDate);
      extractYm(s.createdAt);
    });
    correspondence.forEach(c => {
      extractYm(c.gregorianDate);
      extractYm(c.createdAt);
    });
    citizenshipCases.forEach(c => {
      extractYm(c.submissionDate);
      extractYm(c.createdAt);
    });
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    set.add('2026-11');
    set.add('2026-10');
    set.add('2026-09');
    return Array.from(set).sort().reverse();
  }, [travelers, mofaRequests, seizures, correspondence, citizenshipCases]);

  // Real operational filtering by month
  const monthData = useMemo(() => {
    const matchAnyDate = (...dates: (string | undefined)[]) => {
      if (!selectedMonth || selectedMonth === 'all') return true;
      return dates.some(d => d && d.trim().startsWith(selectedMonth));
    };

    return {
      travelers: travelers.filter(t => matchAnyDate(t.exitDate, t.receiveDate, t.createdAt)),
      seizures: seizures.filter(s => matchAnyDate(s.seizureDate, s.deliveredAt, s.createdAt)),
      migrants: migrants.filter(m => matchAnyDate(m.apprehensionDate, m.createdAt)),
      refugees: refugees.filter(r => matchAnyDate(r.arrivalDate, r.createdAt)),
      foreigners: foreigners.filter(f => matchAnyDate(f.entryDate, f.createdAt)),
      permits: permits.filter(p => matchAnyDate(p.validFrom, p.createdAt)),
      citizenship: citizenshipCases.filter(c => matchAnyDate(c.submissionDate, c.createdAt)),
      companies,
      correspondence: correspondence.filter(co => matchAnyDate(co.gregorianDate, co.createdAt)),
      mofa: mofaRequests.filter(m => matchAnyDate(m.memoDate, m.createdAt))
    };
  }, [selectedMonth, travelers, seizures, migrants, refugees, foreigners, permits, citizenshipCases, companies, correspondence, mofaRequests]);

  // 1. التأشيرات المستخرجة لهذا الشهر + الوكالات + أسباب الإرتجاع
  const visaAnalytics = useMemo(() => {
    let issued = 0;
    let returned = 0;
    let other = 0;
    const byType = new Map<string, number>();
    const byAgency = new Map<string, { total: number; issued: number; returned: number }>();
    const byReturnReason = new Map<string, number>();
    const byPort = new Map<string, number>();

    monthData.travelers.forEach(t => {
      const statNorm = normalizeArabic(t.status || '');
      const isIssued = statNorm.includes('مؤشر') || statNorm.includes('صادر');
      const isReturned = statNorm.includes('مرتجع');

      if (isIssued) issued++;
      else if (isReturned) returned++;
      else other++;

      const vType = cleanArabicText(t.visaType || t.visitReason || 'عبور / سفر عام');
      byType.set(vType, (byType.get(vType) || 0) + 1);

      const port = cleanArabicText(t.center || 'المركز الرئيسي');
      byPort.set(port, (byPort.get(port) || 0) + 1);

      const agency = cleanArabicText(t.agency || '');
      if (agency && agency !== '-') {
        const cur = byAgency.get(agency) || { total: 0, issued: 0, returned: 0 };
        cur.total++;
        if (isIssued) cur.issued++;
        if (isReturned) cur.returned++;
        byAgency.set(agency, cur);
      }

      const rr = cleanArabicText(t.returnReason || '');
      if (rr && rr !== '-') {
        byReturnReason.set(rr, (byReturnReason.get(rr) || 0) + 1);
      }
    });

    const mofaVisaRequestsCount = monthData.mofa.filter(
      m => !m.requestType?.includes('رحلة') && !m.requestType?.includes('مانيفست')
    ).length;

    return {
      total: monthData.travelers.length,
      issued,
      returned,
      other,
      mofaVisaRequestsCount,
      topTypes: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      topAgencies: Array.from(byAgency.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.total - a.total),
      topReturnReasons: Array.from(byReturnReason.entries()).sort((a, b) => b[1] - a[1]),
      topPorts: Array.from(byPort.entries()).sort((a, b) => b[1] - a[1])
    };
  }, [monthData]);

  // 2. الجنسيات (توزيع شامل عبر كافة السجلات)
  const nationalityBreakdown = useMemo(() => {
    const map = new Map<string, { travelers: number; foreigners: number; refugees: number; migrants: number }>();
    const bump = (natRaw: string | undefined, key: 'travelers' | 'foreigners' | 'refugees' | 'migrants') => {
      const nat = cleanArabicText(natRaw || 'غير محدد') || 'غير محدد';
      const cur = map.get(nat) || { travelers: 0, foreigners: 0, refugees: 0, migrants: 0 };
      cur[key]++;
      map.set(nat, cur);
    };
    monthData.travelers.forEach(t => bump(t.country, 'travelers'));
    monthData.foreigners.forEach(f => bump(f.nationality, 'foreigners'));
    monthData.refugees.forEach(r => bump(r.nationality, 'refugees'));
    monthData.migrants.forEach(m => bump(m.nationality, 'migrants'));

    return Array.from(map.entries())
      .map(([nationality, c]) => ({
        nationality,
        ...c,
        total: c.travelers + c.foreigners + c.refugees + c.migrants
      }))
      .sort((a, b) => b.total - a.total);
  }, [monthData]);

  // 4. المنظمات والرحلات الدولية
  const orgsAndFlights = useMemo(() => {
    const flights = monthData.mofa.filter(
      m => Boolean(m.flightDetails) || m.requestType?.includes('رحلة') || m.requestType?.includes('مانيفست')
    );
    const orgMemos = monthData.mofa.filter(m => !flights.includes(m));
    const totalBeneficiaries = monthData.mofa.reduce((acc, m) => acc + (m.beneficiaries?.length || 0), 0);
    return { flights, orgMemos, totalBeneficiaries };
  }, [monthData.mofa]);

  // 5. طلبات الجنسية وطلبات الزواج
  const citizenshipAndMarriage = useMemo(() => {
    const marriageRequests = monthData.citizenship.filter(c => c.serviceType.includes('زواج'));
    const nationalityAndPassportRequests = monthData.citizenship.filter(c => !c.serviceType.includes('زواج'));
    return { marriageRequests, nationalityAndPassportRequests };
  }, [monthData.citizenship]);

  // 6. الخطابات الصادرة والواردة وملخصاتها
  const correspondenceBreakdown = useMemo(() => {
    const outgoing = monthData.correspondence.filter(
      c => c.incomingOutgoingNumber?.startsWith('ص') || c.senderEntity?.includes('مصلحة')
    );
    const incoming = monthData.correspondence.filter(c => !outgoing.includes(c));
    return { outgoing, incoming };
  }, [monthData.correspondence]);

  // 8. المباينة الأمنية على الجوازات
  const vettingRecords = useMemo(() => {
    return monthData.travelers.filter(
      t =>
        t.travelAllowed === 'لا' ||
        (t.vettingResult && t.vettingResult.trim() !== '' && t.vettingResult !== 'سليم') ||
        normalizeArabic(t.status || '').includes('مرتجع')
    );
  }, [monthData.travelers]);

  // 9. الجوازات التي تم تسليمها
  const deliveredPassports = useMemo(() => {
    const fromSeizures = monthData.seizures
      .filter(s => s.status === 'تم التسليم' || Boolean(s.deliveredAt))
      .map(s => ({
        id: s.id,
        holderName: s.travelerName,
        passportNumber: s.passportNumber,
        channel: `إفراج محضر (${s.recordNumber})`,
        recipient: s.recipientName || s.travelerName,
        deliveryDate: s.deliveredAt || s.updatedAt?.slice(0, 10) || '-',
        portOrAgency: s.seizurePort
      }));

    const fromIssuedVisas = monthData.travelers
      .filter(t => normalizeArabic(t.status || '').includes('مؤشر') && Boolean(t.exitDate || t.receiveDate))
      .slice(0, 25)
      .map(t => ({
        id: t.id,
        holderName: [t.firstName, t.secondName, t.thirdName, t.lastName].filter(Boolean).join(' ') || t.passportName || 'مسافر',
        passportNumber: t.idNumber,
        channel: t.visaType || 'جواز مؤشر ومسلم',
        recipient: t.agency || 'صاحب الجواز / المندوب',
        deliveryDate: t.exitDate || t.receiveDate || '-',
        portOrAgency: t.center || '-'
      }));

    return { fromSeizures, fromIssuedVisas, totalCount: fromSeizures.length + monthData.travelers.filter(t => normalizeArabic(t.status || '').includes('مؤشر')).length };
  }, [monthData.seizures, monthData.travelers]);

  // خلاصة تنفيذية واقعية محسوبة محلياً من الأرقام الفعلية دون أي بيانات صورية
  const executiveDigest = useMemo(() => {
    const periodLabel = selectedMonth === 'all' ? 'كافة الفترات المسجلة' : selectedMonth;
    const topNat = nationalityBreakdown[0]
      ? `${nationalityBreakdown[0].nationality} (${nationalityBreakdown[0].total})`
      : 'لا توجد جنسيات مسجلة';
    const topAgency = visaAnalytics.topAgencies[0]
      ? `${visaAnalytics.topAgencies[0].name} (${visaAnalytics.topAgencies[0].total} تأشيرة)`
      : 'المنفذ المباشر';

    return `ملخص الأداء التشغيلي والأمني لفترة (${periodLabel}): تم رصد (${visaAnalytics.total}) معاملة جواز وتأشيرة، منها (${visaAnalytics.issued}) مؤشرة و(${visaAnalytics.returned}) مرتجعة، مع نشاط أبرز للجهة "${topAgency}" وتصدر الجنسية "${topNat}". كما تم قيد (${monthData.foreigners.length}) عامل/وافد أجنبي، و(${orgsAndFlights.orgMemos.length}) مذكرة منظمة و(${orgsAndFlights.flights.length}) رحلة دولية، و(${citizenshipAndMarriage.marriageRequests.length}) طلب زواج و(${citizenshipAndMarriage.nationalityAndPassportRequests.length}) طلب جنسية، و(${monthData.correspondence.length}) خطاب صادر ووارد، وضبط (${monthData.seizures.length}) جوازاً مع مباشرة (${vettingRecords.length}) حالة مباينة أمنية وتسليم (${deliveredPassports.totalCount}) جوازاً وإصدار (${monthData.permits.length}) تصريح تنقل.`;
  }, [
    selectedMonth,
    nationalityBreakdown,
    visaAnalytics,
    monthData,
    orgsAndFlights,
    citizenshipAndMarriage,
    vettingRecords.length,
    deliveredPassports.totalCount
  ]);

  const handleExportExcelAll = () => {
    const summaryRows = [
      { 'البند الإحصائي الواقعي': '1. التأشيرات المستخرجة لهذا الشهر (إجمالي)', 'العدد': visaAnalytics.total, 'التفاصيل': `مؤشر: ${visaAnalytics.issued} | مرتجع: ${visaAnalytics.returned}` },
      { 'البند الإحصائي الواقعي': '2. الجنسيات المسجلة (تنوع)', 'العدد': nationalityBreakdown.length, 'التفاصيل': nationalityBreakdown.slice(0, 4).map(n => `${n.nationality}: ${n.total}`).join('، ') },
      { 'البند الإحصائي الواقعي': '3. العمال الأجانب والوافدين', 'العدد': monthData.foreigners.length, 'التفاصيل': 'إقامات وعقود عمل نشطة' },
      { 'البند الإحصائي الواقعي': '4. المنظمات والرحلات الدولية', 'العدد': monthData.mofa.length, 'التفاصيل': `رحلات: ${orgsAndFlights.flights.length} | مذكرات: ${orgsAndFlights.orgMemos.length} | مستفيدون: ${orgsAndFlights.totalBeneficiaries}` },
      { 'البند الإحصائي الواقعي': '5. طلبات الجنسية وطلبات الزواج', 'العدد': monthData.citizenship.length, 'التفاصيل': `طلبات زواج: ${citizenshipAndMarriage.marriageRequests.length} | جنسية وجوازات: ${citizenshipAndMarriage.nationalityAndPassportRequests.length}` },
      { 'البند الإحصائي الواقعي': '6. الخطابات الصادرة والواردة', 'العدد': monthData.correspondence.length, 'التفاصيل': `صادر: ${correspondenceBreakdown.outgoing.length} | وارد: ${correspondenceBreakdown.incoming.length}` },
      { 'البند الإحصائي الواقعي': '7. الجوازات المضبوطة والمحتجزة', 'العدد': monthData.seizures.length, 'التفاصيل': 'محاضر ضبط واشتباه تزوير' },
      { 'البند الإحصائي الواقعي': '8. المباينة الأمنية على الجوازات', 'العدد': vettingRecords.length, 'التفاصيل': 'حالات المنع والمراجعة الأمنية والإرتجاع' },
      { 'البند الإحصائي الواقعي': '9. الجوازات التي تم تسليمها', 'العدد': deliveredPassports.totalCount, 'التفاصيل': `مفرج عنها: ${deliveredPassports.fromSeizures.length} | مؤشرة ومسلمة: ${visaAnalytics.issued}` },
      { 'البند الإحصائي الواقعي': '10. تصاريح التنقل والأماكن', 'العدد': monthData.permits.length, 'التفاصيل': monthData.permits.map(p => p.accommodationPlace).slice(0, 3).join('، ') || 'خطوط السير ونقاط التفتيش' }
    ];
    exportToExcel(summaryRows, `التقرير_الإحصائي_الواقعي_${selectedMonth}`);
    toast.success('تم تصدير التقرير التفصيلي لبنود الشهر إلى ملف Excel بنجاح!');
  };

  const handleExportWordReport = () => {
    exportToWord(
      `التقرير الشهري الواقعي الشامل - فترة ${selectedMonth}`,
      {
        '1. التأشيرات المستخرجة (إجمالي / مؤشر / مرتجع)': `${visaAnalytics.total} / ${visaAnalytics.issued} / ${visaAnalytics.returned}`,
        '2. عدد الجنسيات المسجلة': nationalityBreakdown.length,
        '3. العمال الأجانب والوافدين': monthData.foreigners.length,
        '4. المنظمات والرحلات الدولية': `${orgsAndFlights.orgMemos.length} مذكرة / ${orgsAndFlights.flights.length} رحلة`,
        '5. طلبات الجنسية والزواج': `${citizenshipAndMarriage.nationalityAndPassportRequests.length} جنسية / ${citizenshipAndMarriage.marriageRequests.length} زواج`,
        '6. الخطابات الصادرة والواردة': `${correspondenceBreakdown.outgoing.length} صادر / ${correspondenceBreakdown.incoming.length} وارد`,
        '7. الجوازات المضبوطة': monthData.seizures.length,
        '8. حالات المباينة الأمنية': vettingRecords.length,
        '9. الجوازات التي تم تسليمها': deliveredPassports.totalCount,
        '10. تصاريح التنقل والأماكن': monthData.permits.length,
        'مُعد التقرير': currentUser?.name || signatories.preparer
      },
      `التقرير_الشهري_الواقعي_${selectedMonth}`
    );
    toast.success('تم تصدير التقرير إلى مستند Word رسمي بنجاح!');
  };

  return (
    <div className="space-y-6" id="printable-monthly-report">
      {/* Top Header & Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print bg-card border rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-2xl shrink-0">
            <FileCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100">
              مركز التقارير الشهرية الواقعية والشاملة
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              إحصائيات حقيقية مستخرجة مباشرة من السجلات: التأشيرات، الجنسيات، العمال الأجانب، المنظمات والرحلات، الجنسية والزواج، الخطابات، المضبوطات، المباينة، التسليم، وتصاريح التنقل.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-muted/60 border rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground font-medium">الفترة:</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-8 border-none bg-transparent shadow-none text-xs w-[135px] p-0 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">جميع الشهور (تراكمي)</SelectItem>
                {availableMonths.map(ym => (
                  <SelectItem key={ym} value={ym}>
                    {ym}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcelAll}
            className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-semibold h-10"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Excel</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportWordReport}
            className="gap-1.5 text-xs text-blue-700 hover:text-blue-800 font-semibold h-10"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Word</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 text-xs font-bold h-10"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة رسمية</span>
          </Button>
        </div>
      </div>

      {/* Main Report Container */}
      <div className="bg-card border rounded-2xl p-4 sm:p-6 shadow-xs space-y-8">
        {/* Official Sovereign Header */}
        <div className="text-center space-y-1.5 border-b pb-5">
          <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{OFFICIAL_HEADER.country}</p>
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{OFFICIAL_HEADER.ministry}</p>
          <p className="text-base font-extrabold text-primary">{OFFICIAL_HEADER.sector}</p>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {OFFICIAL_HEADER.headquarters} — {OFFICIAL_HEADER.branch}
          </p>
          <div className="pt-2">
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 inline-block px-5 py-1.5 bg-muted/40 border rounded-xl">
              التقرير التشغيلي الإحصائي الشهري — ({selectedMonth === 'all' ? 'شامل كافة الأشهر' : selectedMonth})
            </h2>
          </div>
        </div>

        {/* Executive Operational Summary (Computed strictly from real local data) */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
          <h3 className="text-xs font-black text-primary">الملخص التنفيذي للبيانات الفعلية المسجلة:</h3>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{executiveDigest}</p>
        </div>

        {/* Overview KPI Grid (10 Domains Summarized cleanly) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold">التأشيرات المستخرجة</span>
              <Stamp className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {visaAnalytics.total.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-600 mt-1 font-mono tabular-nums">
              مؤشر: {visaAnalytics.issued} • مرتجع: {visaAnalytics.returned}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold">الجنسيات المسجلة</span>
              <Globe className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {nationalityBreakdown.length}
            </div>
            <div className="text-[10px] text-slate-600 mt-1 truncate">
              الأعلى: {nationalityBreakdown[0]?.nationality || '-'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold">العمال الأجانب والوافدين</span>
              <Briefcase className="h-4 w-4 text-teal-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {monthData.foreigners.length}
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              اللاجئون: {monthData.refugees.length} • المهاجرون: {monthData.migrants.length}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold">المنظمات والرحلات</span>
              <Plane className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {monthData.mofa.length}
            </div>
            <div className="text-[10px] text-slate-600 mt-1 font-mono tabular-nums">
              رحلات: {orgsAndFlights.flights.length} • مستفيدون: {orgsAndFlights.totalBeneficiaries}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-slate-50/70 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold">المضبوطات والتسليم</span>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {monthData.seizures.length}
            </div>
            <div className="text-[10px] text-emerald-700 font-bold mt-1 font-mono tabular-nums">
              المسلمة: {deliveredPassports.totalCount} • المباينة: {vettingRecords.length}
            </div>
          </div>
        </div>

        {/* 1. التأشيرات المستخرجة لهذا الشهر + الوكالات + أسباب الإرتجاع */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-r-4 border-primary pr-2.5">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Stamp className="h-4 w-4 text-primary" />
              <span>1. التأشيرات المستخرجة لهذا الشهر والوكالات المرتبطة ({visaAnalytics.total.toLocaleString()} سجل)</span>
            </h3>
            <div className="flex flex-wrap gap-2 text-xs font-mono tabular-nums">
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">مؤشر: {visaAnalytics.issued}</Badge>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">مرتجع: {visaAnalytics.returned}</Badge>
              <Badge variant="outline">طلبات خارجية: {visaAnalytics.mofaVisaRequestsCount}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top Travel Agencies linked to Visas */}
            <Card className="rounded-xl shadow-none border">
              <CardHeader className="p-3.5 pb-2 border-b bg-slate-50/70">
                <CardTitle className="text-xs font-black flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>وكالات ومكاتب السفر الأكثر إصداراً</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 max-h-60 overflow-y-auto adaptive-scroll-region space-y-2 text-xs">
                {visaAnalytics.topAgencies.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">لا توجد وكالات مرتبطة في هذه الفترة</p>
                ) : (
                  visaAnalytics.topAgencies.slice(0, 12).map((ag, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-bold text-slate-800 truncate">{ag.name}</span>
                      <div className="flex items-center gap-1.5 font-mono tabular-nums text-[11px] shrink-0">
                        <span className="text-emerald-700 font-bold">{ag.issued} مؤشر</span>
                        {ag.returned > 0 && <span className="text-amber-700 font-bold">/{ag.returned} مرتجع</span>}
                        <Badge variant="outline" className="text-[10px]">{ag.total}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Visa Types */}
            <Card className="rounded-xl shadow-none border">
              <CardHeader className="p-3.5 pb-2 border-b bg-slate-50/70">
                <CardTitle className="text-xs font-black">أنواع التأشيرات وأغراض السفر</CardTitle>
              </CardHeader>
              <CardContent className="p-3 max-h-60 overflow-y-auto adaptive-scroll-region space-y-2 text-xs">
                {visaAnalytics.topTypes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">لا توجد تأشيرات مسجلة</p>
                ) : (
                  visaAnalytics.topTypes.slice(0, 12).map(([typeName, count], idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-semibold text-slate-700 truncate">{typeName}</span>
                      <Badge variant="outline" className="font-mono tabular-nums text-[11px]">{count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Return Reasons */}
            <Card className="rounded-xl shadow-none border">
              <CardHeader className="p-3.5 pb-2 border-b bg-slate-50/70">
                <CardTitle className="text-xs font-black">أسباب الإرتجاع المرصودة</CardTitle>
              </CardHeader>
              <CardContent className="p-3 max-h-60 overflow-y-auto adaptive-scroll-region space-y-2 text-xs">
                {visaAnalytics.topReturnReasons.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">لا توجد معاملات مرتجعة في هذه الفترة</p>
                ) : (
                  visaAnalytics.topReturnReasons.map(([reason, count], idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-medium text-amber-800 truncate">{reason}</span>
                      <Badge className="bg-amber-100 text-amber-900 font-mono tabular-nums text-[10px]">{count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 2. الجنسيات & 3. العمال الأجانب والوافدين */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 2: Nationalities */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-blue-600 pr-2.5">
              <Globe className="h-4 w-4 text-blue-600" />
              <span>2. إحصائية الجنسيات ({nationalityBreakdown.length} جنسية)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">الجنسية</th>
                    <th className="p-2.5 text-center">المسافرون</th>
                    <th className="p-2.5 text-center">الوافدون</th>
                    <th className="p-2.5 text-center">اللاجئون</th>
                    <th className="p-2.5 text-center">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nationalityBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد بيانات جنسيات لهذه الفترة</td>
                    </tr>
                  ) : (
                    nationalityBreakdown.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/80">
                        <td className="p-2.5 font-bold text-slate-800">{row.nationality}</td>
                        <td className="p-2.5 text-center font-mono tabular-nums">{row.travelers}</td>
                        <td className="p-2.5 text-center font-mono tabular-nums">{row.foreigners}</td>
                        <td className="p-2.5 text-center font-mono tabular-nums">{row.refugees + row.migrants}</td>
                        <td className="p-2.5 text-center font-mono tabular-nums font-black text-primary">{row.total}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Foreign Workers & Residents */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-teal-600 pr-2.5">
              <Briefcase className="h-4 w-4 text-teal-600" />
              <span>3. العمال الأجانب والوافدين ({monthData.foreigners.length} مقيم)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">الاسم</th>
                    <th className="p-2.5">الجنسية</th>
                    <th className="p-2.5">المهنة / العمل</th>
                    <th className="p-2.5">جهة العمل</th>
                    <th className="p-2.5">انتهاء الإقامة</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthData.foreigners.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">لا يوجد وافدون أو عمال أجانب مسجلون في هذه الفترة</td>
                    </tr>
                  ) : (
                    monthData.foreigners.map(f => (
                      <tr key={f.id} className="hover:bg-slate-50/80">
                        <td className="p-2.5 font-bold">{f.fullName}</td>
                        <td className="p-2.5">{f.nationality}</td>
                        <td className="p-2.5">{f.profession}</td>
                        <td className="p-2.5 truncate max-w-[140px]">{f.employer}</td>
                        <td className="p-2.5 font-mono tabular-nums">{f.residenceExpiryDate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 4. المنظمات والرحلات الدولية */}
        <section className="space-y-3">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-indigo-600 pr-2.5">
            <Plane className="h-4 w-4 text-indigo-600" />
            <span>4. المنظمات الدولية والرحلات ومانيفست الركاب ({monthData.mofa.length} معاملة • {orgsAndFlights.totalBeneficiaries} مستفيد)</span>
          </h3>
          <div className="md:hidden print:hidden space-y-2 max-h-72 overflow-y-auto adaptive-scroll-region">
            {monthData.mofa.length === 0 ? (
              <div className="text-center py-5 text-xs text-muted-foreground border rounded-xl">لا توجد مذكرات منظمات أو رحلات في هذه الفترة</div>
            ) : (
              monthData.mofa.map(m => (
                <div key={m.id} className="border rounded-xl p-3 bg-slate-50/70 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-primary">{m.memoNumber}</span>
                    <Badge variant="outline" className="text-[10px]">{m.requestType}</Badge>
                  </div>
                  <div className="font-bold text-slate-800">{m.organization}</div>
                  {m.flightDetails && (
                    <div className="text-[11px] text-indigo-700 font-medium">
                      الرحلة: {m.flightDetails.callSign} • المسار: {m.flightDetails.route}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">المستفيدون: {m.beneficiaries.length} • التاريخ: {m.memoDate}</div>
                </div>
              ))
            )}
          </div>
          <div className="hidden md:block print:block border rounded-xl overflow-auto max-h-72 print:max-h-none adaptive-scroll-region">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                <tr>
                  <th className="p-2.5">رقم المذكرة / الرحلة</th>
                  <th className="p-2.5">المنظمة / الجهة</th>
                  <th className="p-2.5">النوع والمسار</th>
                  <th className="p-2.5 text-center">المستفيدون</th>
                  <th className="p-2.5">الحالة الأمنية</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthData.mofa.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد مذكرات منظمات أو رحلات مسجلة</td>
                  </tr>
                ) : (
                  monthData.mofa.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className="p-2.5 font-mono font-bold">{m.memoNumber}</td>
                      <td className="p-2.5 font-semibold">{m.organization}</td>
                      <td className="p-2.5">
                        <div>{m.requestType}</div>
                        {m.flightDetails && <div className="text-[10px] text-indigo-700">{m.flightDetails.route}</div>}
                      </td>
                      <td className="p-2.5 text-center font-mono tabular-nums font-bold">{m.beneficiaries.length}</td>
                      <td className="p-2.5">
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{m.approvalStatus}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. طلبات الجنسية وطلبات الزواج & 6. الخطابات الصادرة والواردة وملخصاتها */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 5 */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-pink-600 pr-2.5">
              <HeartHandshake className="h-4 w-4 text-pink-600" />
              <span>
                5. طلبات الجنسية وطلبات الزواج (زواج: {citizenshipAndMarriage.marriageRequests.length} • جنسية: {citizenshipAndMarriage.nationalityAndPassportRequests.length})
              </span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region divide-y bg-white dark:bg-slate-900">
              {monthData.citizenship.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">لا توجد معاملات جنسية أو زواج في هذه الفترة</div>
              ) : (
                monthData.citizenship.map(c => (
                  <div key={c.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{c.applicantName}</span>
                      <Badge variant="outline" className="text-[10px]">{c.serviceType}</Badge>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      المستفيد/الطرف الآخر: <span className="font-semibold">{c.spouseOrBeneficiaryName || '-'}</span> ({c.spouseNationality || '-'})
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="font-mono tabular-nums text-slate-500">{c.caseNumber} • {c.submissionDate}</span>
                      <Badge className="bg-blue-50 text-blue-800 border-blue-200 text-[10px]">{c.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-amber-600 pr-2.5">
              <Mail className="h-4 w-4 text-amber-600" />
              <span>
                6. طلبات التأشيرات والخطابات الصادرة والواردة وملخصاتها (صادر: {correspondenceBreakdown.outgoing.length} • وارد: {correspondenceBreakdown.incoming.length})
              </span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region divide-y bg-white dark:bg-slate-900">
              {monthData.correspondence.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">لا توجد خطابات صادرة أو واردة في هذه الفترة</div>
              ) : (
                monthData.correspondence.map(letter => {
                  const isOut = correspondenceBreakdown.outgoing.includes(letter);
                  return (
                    <div key={letter.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-primary">{letter.incomingOutgoingNumber}</span>
                        <Badge className={`text-[10px] ${isOut ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}`}>
                          {isOut ? 'صادر' : 'وارد'} — {letter.letterType}
                        </Badge>
                      </div>
                      <div className="font-bold text-slate-800">{letter.subject}</div>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{letter.introClause || letter.actionRequired}</p>
                      <div className="text-[10px] text-slate-400">
                        من: {letter.senderEntity} → إلى: {letter.recipientEntity} ({letter.gregorianDate})
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* 7. الجوازات المضبوطة & 8. المباينة الأمنية على الجوازات */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-rose-600 pr-2.5">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <span>7. الجوازات المضبوطة والمحتجزة ({monthData.seizures.length} محضر)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">المحضر</th>
                    <th className="p-2.5">الاسم</th>
                    <th className="p-2.5">الجواز</th>
                    <th className="p-2.5">المنفذ والسبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthData.seizures.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">لا توجد جوازات مضبوطة في هذه الفترة</td>
                    </tr>
                  ) : (
                    monthData.seizures.map(s => (
                      <tr key={s.id}>
                        <td className="p-2.5 font-mono font-bold">{s.recordNumber}</td>
                        <td className="p-2.5 font-bold">{s.travelerName}</td>
                        <td className="p-2.5 font-mono">{s.passportNumber}</td>
                        <td className="p-2.5">
                          <div className="font-semibold">{s.seizurePort}</div>
                          <div className="text-[10px] text-rose-700">{s.reason}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-red-700 pr-2.5">
              <ShieldCheck className="h-4 w-4 text-red-700" />
              <span>8. المباينة الأمنية على الجوازات ({vettingRecords.length} حالة مرصودة)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">المسافر</th>
                    <th className="p-2.5">رقم الجواز</th>
                    <th className="p-2.5">نتيجة المباينة / القيد</th>
                    <th className="p-2.5">القرار</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vettingRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">لا توجد حالات مباينة سلبية أو إرتجاع في هذه الفترة</td>
                    </tr>
                  ) : (
                    vettingRecords.slice(0, 30).map(v => (
                      <tr key={v.id}>
                        <td className="p-2.5 font-bold">
                          {[v.firstName, v.secondName, v.lastName].filter(Boolean).join(' ') || v.passportName}
                        </td>
                        <td className="p-2.5 font-mono">{v.idNumber}</td>
                        <td className="p-2.5 text-[11px] text-rose-700 font-medium">
                          {v.returnReason || v.vettingResult || v.status || 'مراجعة أمنية'}
                        </td>
                        <td className="p-2.5">
                          <Badge variant={v.travelAllowed === 'لا' ? 'destructive' : 'outline'} className="text-[10px]">
                            {v.travelAllowed === 'لا' ? 'ممنوع من السفر' : v.status || 'مقيد للمباينة'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 9. الجوازات التي تم تسليمها & 10. تصاريح التنقل والأماكن */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-emerald-600 pr-2.5">
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              <span>9. الجوازات التي تم تسليمها ({deliveredPassports.totalCount} جواز)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                  <tr>
                    <th className="p-2.5">صاحب الجواز</th>
                    <th className="p-2.5">رقم الجواز</th>
                    <th className="p-2.5">جهة التسليم / الوكالة</th>
                    <th className="p-2.5">تاريخ التسليم</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deliveredPassports.fromSeizures.length === 0 && deliveredPassports.fromIssuedVisas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">لا توجد جوازات مسلمة مسجلة في هذه الفترة</td>
                    </tr>
                  ) : (
                    [...deliveredPassports.fromSeizures, ...deliveredPassports.fromIssuedVisas].slice(0, 25).map(item => (
                      <tr key={item.id}>
                        <td className="p-2.5 font-bold">{item.holderName}</td>
                        <td className="p-2.5 font-mono">{item.passportNumber}</td>
                        <td className="p-2.5 text-[11px]">{item.recipient}</td>
                        <td className="p-2.5 font-mono tabular-nums">{item.deliveryDate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-r-4 border-purple-600 pr-2.5">
              <MapPin className="h-4 w-4 text-purple-600" />
              <span>10. تصاريح التنقل والأماكن ({monthData.permits.length} تصريح)</span>
            </h3>
            <div className="border rounded-xl overflow-auto max-h-72 adaptive-scroll-region divide-y bg-white dark:bg-slate-900">
              {monthData.permits.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">لا توجد تصاريح تنقل مسجلة في هذه الفترة</div>
              ) : (
                monthData.permits.map(p => (
                  <div key={p.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{p.delegationName}</span>
                      <span className="font-mono text-[11px] font-bold text-primary">{p.permitCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <span className="font-semibold">خط السير:</span> {p.authorizedRoute}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      <span className="font-semibold">الأماكن والإقامة:</span> {p.accommodationPlace || 'غير محدد'} • ({p.passengersCount} مرافقين)
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>النقاط: {p.allowedCheckpoints.join('، ')}</span>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 ml-1" />
                        {p.approvalStatus}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Signatures Footer */}
        <div className="pt-6 border-t space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2 no-print">
            <span className="text-xs font-bold text-slate-500">الاعتمادات والتوقيعات الرسمية:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSignatoriesDialogOpen(true)}
              className="text-xs gap-1.5 h-9 text-primary font-bold"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>تعديل أسماء المسؤولين الموقعين</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 text-center text-xs text-slate-700 gap-4">
            <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
              <p className="font-bold mb-1 text-slate-800">مُعد التقرير</p>
              <p className="font-semibold text-slate-900 mt-5">{signatories.preparer}</p>
              <p className="text-[10px] text-slate-400 mt-2 border-t pt-1">التوقيع: ........................</p>
            </div>
            <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/50">
              <p className="font-bold mb-1 text-slate-800">مدير العمليات والسيطرة</p>
              <p className="font-semibold text-slate-900 mt-5">{signatories.operations}</p>
              <p className="text-[10px] text-slate-400 mt-2 border-t pt-1">التوقيع: ........................</p>
            </div>
            <div className="border-2 border-primary/20 p-3 rounded-xl bg-primary/5">
              <p className="font-bold mb-1 text-primary">اعتماد مدير عام المنافذ</p>
              <p className="font-extrabold text-primary text-sm mt-5">{signatories.director}</p>
              <p className="text-[10px] text-slate-400 mt-2 border-t pt-1">الختم والاعتماد: ................</p>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog to Edit Signatories */}
      <Dialog open={signatoriesDialogOpen} onOpenChange={setSignatoriesDialogOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>تحديد أسماء ورتب المسؤولين الموقعين</DialogTitle>
            <DialogDescription>
              أدخل أسماء ورتب الضباط والمسؤولين الحقيقيين المعنيين بإعداد واعتماد التقرير الشهري.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4 text-xs">
            <div>
              <label className="text-slate-700 font-bold block mb-1">مُعد التقرير:</label>
              <Input
                value={signatories.preparer}
                onChange={e => setSignatories({ ...signatories, preparer: e.target.value })}
                className="text-right font-medium"
              />
            </div>

            <div>
              <label className="text-slate-700 font-bold block mb-1">مدير العمليات والسيطرة:</label>
              <Input
                value={signatories.operations}
                onChange={e => setSignatories({ ...signatories, operations: e.target.value })}
                className="text-right font-medium"
              />
            </div>

            <div>
              <label className="text-slate-700 font-bold block mb-1">اعتماد مدير عام المنافذ والرقابة الحدودية:</label>
              <Input
                value={signatories.director}
                onChange={e => setSignatories({ ...signatories, director: e.target.value })}
                className="text-right font-medium"
              />
            </div>
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSignatoriesDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveSignatories} className="bg-primary hover:bg-primary/90 text-white font-bold">
              حفظ واعتماد الأسماء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MonthlyReportsHub;
