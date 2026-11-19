import React, { useState, useMemo, useEffect } from 'react';
import {
  getTravelers,
  getReports,
  getMovements,
  getSeizures,
  getForeigners,
  getMofaRequests,
  getMovementPermits,
  getCitizenshipCases,
  getCorrespondence,
  normalizeArabic,
  cleanArabicText
} from '@/lib/storage';
import { SOVEREIGN_DATA_UPDATED_EVENT } from '@/lib/unifiedImportHub';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  FileText,
  AlertTriangle,
  Download,
  Printer,
  FileJson,
  FileText as FileTextIcon,
  Image as ImageIcon,
  Clock,
  BarChart3,
  Globe,
  Building2,
  Stamp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToExcel, exportToPDF, exportToImage, handlePrint } from '@/lib/exportUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SlaPerformanceDashboard } from '@/components/SlaPerformanceDashboard';

const Statistics = () => {
  const [dataTick, setDataTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'general' | 'sla'>('general');

  useEffect(() => {
    const refresh = () => setDataTick(t => t + 1);
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, refresh);
  }, []);

  const {
    travelers,
    reports,
    movements,
    seizures,
    foreigners,
    mofaRequests,
    permits,
    citizenshipCases,
    correspondence
  } = useMemo(
    () => ({
      travelers: getTravelers(),
      reports: getReports(),
      movements: getMovements(),
      seizures: getSeizures(),
      foreigners: getForeigners(),
      mofaRequests: getMofaRequests(),
      permits: getMovementPermits(),
      citizenshipCases: getCitizenshipCases(),
      correspondence: getCorrespondence()
    }),
    [dataTick]
  );

  const visaAndAgencySummary = useMemo(() => {
    let issued = 0;
    let returned = 0;
    const natMap = new Map<string, number>();
    const agencyMap = new Map<string, number>();

    travelers.forEach(t => {
      const s = normalizeArabic(t.status || '');
      if (s.includes('مؤشر') || s.includes('صادر')) issued++;
      else if (s.includes('مرتجع')) returned++;

      const nat = cleanArabicText(t.country || 'اليمن') || 'اليمن';
      natMap.set(nat, (natMap.get(nat) || 0) + 1);

      const ag = cleanArabicText(t.agency || '');
      if (ag && ag !== '-') {
        agencyMap.set(ag, (agencyMap.get(ag) || 0) + 1);
      }
    });

    const topNationalities = Array.from(natMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const topAgencies = Array.from(agencyMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { issued, returned, topNationalities, topAgencies };
  }, [travelers]);

  const stats = [
    { title: 'إجمالي المسافرين والتأشيرات', value: travelers.length, icon: Users, color: 'text-blue-600' },
    { title: 'التأشيرات المؤشرة / المرتجعة', value: `${visaAndAgencySummary.issued} / ${visaAndAgencySummary.returned}`, icon: Stamp, color: 'text-emerald-600' },
    { title: 'الوافدون والجوازات المضبوطة', value: `${foreigners.length} / ${seizures.length}`, icon: FileText, color: 'text-amber-600' },
    { title: 'الممنوعون وبلاغات التعميم', value: `${travelers.filter(t => t.travelAllowed === 'لا').length} / ${reports.length}`, icon: AlertTriangle, color: 'text-red-600' }
  ];

  // Data for Bar Chart (Travelers per day - last 7 days)
  const last7Days = [...Array(7)]
    .map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = travelers.filter(
        t => (t.exitDate && t.exitDate.startsWith(dateStr)) || (t.createdAt && t.createdAt.startsWith(dateStr))
      ).length;
      return { name: d.toLocaleDateString('ar-YE', { weekday: 'short' }), count };
    })
    .reverse();

  // Data for Pie Chart (Travel Allowed vs Denied)
  const pieData = [
    { name: 'مسموح', value: travelers.filter(t => t.travelAllowed === 'نعم').length, color: '#10b981' },
    { name: 'ممنوع', value: travelers.filter(t => t.travelAllowed === 'لا').length, color: '#ef4444' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
            مركز الإحصائيات والأداء التشغيلي
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            متابعة حقيقية لحركة المنافذ، التأشيرات، الجنسيات، وكالات السفر، وتقارير مستوى الخدمة (SLA).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border">
            <Button
              variant={activeTab === 'general' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('general')}
              className="h-9 text-xs gap-1.5 font-bold"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>الإحصائيات العامة</span>
            </Button>
            <Button
              variant={activeTab === 'sla' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('sla')}
              className="h-9 text-xs gap-1.5 font-bold"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>تقارير أداء الـ SLA</span>
            </Button>
          </div>

          {activeTab === 'general' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-9 text-xs font-semibold">
                    <Download className="h-3.5 w-3.5" /> تصدير
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" dir="rtl">
                  <DropdownMenuItem onClick={() => exportToExcel(stats.map(s => ({ 'البند': s.title, 'القيمة': s.value })), 'إحصائيات_نظام_المنافذ')}>
                    <FileJson className="h-4 w-4 ml-2 text-green-600" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToPDF('stats-content', 'إحصائيات_نظام_المنافذ')}>
                    <FileTextIcon className="h-4 w-4 ml-2 text-red-600" /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToImage('stats-content', 'إحصائيات_نظام_المنافذ')}>
                    <ImageIcon className="h-4 w-4 ml-2 text-purple-600" /> صورة PNG
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 h-9 text-xs font-bold">
                <Printer className="h-3.5 w-3.5" /> طباعة
              </Button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'general' ? (
        <div id="stats-content" className="space-y-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <Card key={i} className="shadow-xs border rounded-2xl bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold text-muted-foreground">{s.title}</CardTitle>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 font-mono tabular-nums">
                    {s.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 shadow-xs rounded-2xl min-h-[340px]">
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
                حركة المسافرين والتأشيرات (آخر 7 أيام)
              </CardTitle>
              <div className="h-[260px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7Days}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1e3a5f" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5 shadow-xs rounded-2xl min-h-[340px]">
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
                موقف المباينة الأمنية والسماح بالسفر
              </CardTitle>
              <div className="h-[260px] w-full flex flex-col sm:flex-row items-center justify-center gap-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex sm:flex-col gap-3 shrink-0">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                        {d.name}: {d.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Realistic Live Breakdown: Nationalities + Travel Agencies + Sovereign Units Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 shadow-xs rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span>توزيع الجنسيات الأعلى بالنظام</span>
                </CardTitle>
                <Badge variant="outline" className="text-[11px] font-mono tabular-nums">
                  {visaAndAgencySummary.topNationalities.length} جنسيات
                </Badge>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto adaptive-scroll-region">
                {visaAndAgencySummary.topNationalities.map((nat, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{nat.name}</span>
                    <Badge variant="outline" className="font-mono tabular-nums">{nat.count.toLocaleString()}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 shadow-xs rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>وكالات السفر والقطاعات السيادية النشطة</span>
                </CardTitle>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">مذكرات ورحلات</div>
                  <div className="text-lg font-black font-mono tabular-nums">{mofaRequests.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">تصاريح التنقل</div>
                  <div className="text-lg font-black font-mono tabular-nums">{permits.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">الجنسية والزواج</div>
                  <div className="text-lg font-black font-mono tabular-nums">{citizenshipCases.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">الخطابات المسجلة</div>
                  <div className="text-lg font-black font-mono tabular-nums">{correspondence.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">حركة الأطقم</div>
                  <div className="text-lg font-black font-mono tabular-nums">{movements.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border">
                  <div className="text-[10px] text-slate-500">الوكالات المرتبطة</div>
                  <div className="text-lg font-black font-mono tabular-nums">{visaAndAgencySummary.topAgencies.length}</div>
                </div>
              </div>
              {visaAndAgencySummary.topAgencies.length > 0 && (
                <div className="space-y-1.5 pt-1 max-h-36 overflow-y-auto adaptive-scroll-region">
                  {visaAndAgencySummary.topAgencies.map((ag, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1 last:border-0">
                      <span className="font-semibold truncate">{ag.name}</span>
                      <span className="font-mono tabular-nums font-bold text-primary">{ag.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <SlaPerformanceDashboard travelers={travelers} />
      )}
    </div>
  );
};

export default Statistics;
