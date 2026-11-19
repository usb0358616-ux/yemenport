import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  MapPin,
  CreditCard,
  Users,
  ShieldAlert,
  AlertTriangle,
  Compass,
  Building2,
  FileText,
  Filter,
  CheckCircle2,
  PieChart as PieChartIcon,
  Search,
  Sparkles,
  ArrowRightLeft,
  ChevronDown,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { InsightFileItem } from './InsightSuggestionView';
import { normalizeArabic } from '../lib/storage';

interface ImportAnalyticsPatternsViewProps {
  files: InsightFileItem[];
  onSelectFile?: (fileId: string) => void;
  onFilterByPassport?: (passport: string) => void;
}

export const ImportAnalyticsPatternsView: React.FC<ImportAnalyticsPatternsViewProps> = ({
  files,
  onSelectFile,
  onFilterByPassport
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(45);

  // Aggregate all extracted records across files efficiently
  const aggregatedData = useMemo(() => {
    let totalRecordsCount = 0;
    const passportMap = new Map<string, { count: number; names: Set<string>; files: Set<string> }>();
    const governorateCount: Record<string, number> = {};
    const nationalityCount: Record<string, number> = {};
    const centerCount: Record<string, number> = {};
    const visaTypeCount: Record<string, number> = {};
    let travelAllowedCount = 0;
    let travelBannedCount = 0;
    let totalThreatsCount = 0;

    files.forEach(file => {
      const records = file.records || [];
      totalRecordsCount += records.length;
      if (file.securityScan?.threats?.length) {
        totalThreatsCount += file.securityScan.totalThreatsDetected || file.securityScan.threats.length;
      }

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];

        // 1. Passport Recurrence Analysis
        const rawId = String(rec.idNumber || rec.passportNumber || '').trim();
        const normId = rawId.replace(/[\s\-_]/g, '').toUpperCase();
        if (normId && normId.length >= 5 && !normId.startsWith('AUTO-') && !normId.startsWith('PDF-')) {
          const rawName =
            rec.fullName ||
            [rec.firstName, rec.secondName, rec.thirdName, rec.lastName].filter(Boolean).join(' ') ||
            'غير محدد';
          let item = passportMap.get(normId);
          if (!item) {
            item = { count: 0, names: new Set(), files: new Set() };
            passportMap.set(normId, item);
          }
          item.count++;
          if (rawName) item.names.add(rawName);
          item.files.add(file.name);
        }

        // 2. Governorate Distribution
        const gov = (rec.governorate || rec.destination || 'غير محدد').trim();
        if (gov) {
          governorateCount[gov] = (governorateCount[gov] || 0) + 1;
        }

        // 3. Nationality Distribution
        const nat = (rec.country || rec.nationality || 'اليمن').trim();
        if (nat) {
          nationalityCount[nat] = (nationalityCount[nat] || 0) + 1;
        }

        // 4. Center / Port Distribution
        const center = (rec.center || rec.agency || 'المنفذ المركزي').trim();
        if (center) {
          centerCount[center] = (centerCount[center] || 0) + 1;
        }

        // 5. Visa / Purpose
        const visa = (rec.visaType || rec.visitReason || 'عبور عادي').trim();
        if (visa) {
          visaTypeCount[visa] = (visaTypeCount[visa] || 0) + 1;
        }

        // 6. Security Decision
        if (rec.travelAllowed === 'لا' || /ممنوع|مرفوض|حظر/i.test(rec.status || '')) {
          travelBannedCount++;
        } else {
          travelAllowedCount++;
        }
      }
    });

    // Sort duplicated passports (count > 1 first)
    const duplicatePassports = Array.from(passportMap.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([passport, data]) => ({
        passport,
        count: data.count,
        names: Array.from(data.names),
        files: Array.from(data.files),
        hasNameConflict: data.names.size > 1
      }))
      .sort((a, b) => b.count - a.count);

    // Sorted governorates
    const sortedGovs = Object.entries(governorateCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Sorted nationalities
    const sortedNationalities = Object.entries(nationalityCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Sorted ports
    const sortedCenters = Object.entries(centerCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Sorted visas
    const sortedVisas = Object.entries(visaTypeCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return {
      totalRecords: totalRecordsCount,
      uniquePassportsCount: passportMap.size,
      duplicatePassports,
      sortedGovs,
      sortedNationalities,
      sortedCenters,
      sortedVisas,
      travelAllowedCount,
      travelBannedCount,
      totalThreatsCount
    };
  }, [files]);

  // Filter duplicated passports by search
  const filteredDuplicates = useMemo(() => {
    if (!searchTerm.trim()) return aggregatedData.duplicatePassports;
    const term = normalizeArabic(searchTerm).toLowerCase();
    return aggregatedData.duplicatePassports.filter(
      d =>
        d.passport.toLowerCase().includes(term) ||
        d.names.some(n => normalizeArabic(n).toLowerCase().includes(term)) ||
        d.files.some(f => f.toLowerCase().includes(term))
    );
  }, [aggregatedData.duplicatePassports, searchTerm]);

  const displayedDuplicates = filteredDuplicates.slice(0, visibleCount);
  const maxGovCount = aggregatedData.sortedGovs[0]?.count || 1;
  const maxNatCount = aggregatedData.sortedNationalities[0]?.count || 1;

  if (files.length === 0 || aggregatedData.totalRecords === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full bg-slate-50/50" dir="rtl">
        <div className="p-4 bg-slate-100 rounded-3xl mb-4 text-slate-400">
          <BarChart3 className="h-12 w-12" />
        </div>
        <h4 className="text-base font-bold text-slate-700 mb-1">لا توجد بيانات مستخرجة لعرض التحليلات</h4>
        <p className="text-xs text-slate-400 max-w-sm">
          يرجى رفع ملفات إكسل أو PDF أو صور وثائق؛ فور انتهاء التحليل ستظهر هنا الرسوم البيانية وأنماط تكرار الجوازات والمناطق.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6 space-y-5 bg-slate-50/40 dark:bg-slate-900/40" dir="rtl">
      {/* 1. Header Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Total Records */}
        <Card className="p-4 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold">إجمالي السجلات</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-slate-100 font-mono">
            {aggregatedData.totalRecords.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">عبر {files.length} ملفات محللة</span>
        </Card>

        {/* Duplicate Passports */}
        <Card className={`p-4 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800 ${
          aggregatedData.duplicatePassports.length > 0 ? 'ring-2 ring-amber-400/30' : ''
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold">جوازات متكررة عبر الملفات</span>
            <CreditCard className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {aggregatedData.duplicatePassports.length}
          </div>
          <span className="text-[10px] text-amber-700/80 dark:text-amber-300 font-medium">
            {aggregatedData.duplicatePassports.filter(p => p.hasNameConflict).length} حالة اشتباه تعارض أسماء
          </span>
        </Card>

        {/* Governorates Covered */}
        <Card className="p-4 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold">المناطق والمحافظات</span>
            <MapPin className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {aggregatedData.sortedGovs.length}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">توزيع جغرافي مستخرج</span>
        </Card>

        {/* Security / Clearance Rate */}
        <Card className="p-4 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold">المباينة والتدقيق</span>
            <ShieldAlert className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {Math.round((aggregatedData.travelAllowedCount / (aggregatedData.totalRecords || 1)) * 100)}%
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {aggregatedData.travelBannedCount} قيود ومنع سفر
          </span>
        </Card>
      </div>

      {/* 2. Passport Recurrence & Duplicate Detection Section (High Priority Pattern) */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden bg-white dark:bg-slate-800">
        <CardHeader className="p-5 pb-3 border-b bg-slate-50/70 dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>كاشف تكرار أرقام جوازات السفر والازدواجية (Passport Recurrence & Duplicates)</span>
                <Badge className="bg-amber-500 text-white border-none text-[10px] px-2">
                  {aggregatedData.duplicatePassports.length} رقم مكرر
                </Badge>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                رصد تلقائي لأرقام الجوازات والوثائق التي تكررت في أكثر من ملف أو أكثر من سجل، مع كشف تعارض الأسماء فوراً.
              </p>
            </div>
          </div>

          {/* Search bar inside duplicates */}
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الجواز أو الاسم..."
              className="w-full pl-3 pr-8 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-primary font-medium"
            />
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {aggregatedData.duplicatePassports.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-bold text-slate-700">لم يتم رصد أي تكرار أو ازدواجية في أرقام الجوازات</p>
              <p className="text-slate-400 text-[11px]">جميع وثائق السفر المستخرجة من الكشوفات فريدة ومتميزة بنسبة 100%.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {displayedDuplicates.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all text-xs space-y-2 relative ${
                      item.hasNameConflict
                        ? 'bg-rose-50/40 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800'
                        : 'bg-slate-50/60 border-slate-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-primary" />
                        {item.passport}
                      </span>
                      <Badge
                        className={`${
                          item.hasNameConflict
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        } text-[10px] font-bold`}
                      >
                        تكرر {item.count} مرات
                      </Badge>
                    </div>

                    {item.hasNameConflict && (
                      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-100/70 text-rose-800 text-[11px] font-bold">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                        <span>اشتباه انتحال شخصية: الجواز مسجل بأسماء مختلفة!</span>
                      </div>
                    )}

                    <div className="space-y-1 text-[11px]">
                      <div className="text-slate-500 font-medium">الأسماء المرتبطة بهذا الرقم:</div>
                      <div className="space-y-0.5 pr-2 border-r-2 border-slate-300 dark:border-slate-700">
                        {item.names.map((name, i) => (
                          <div key={i} className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            • {name}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-[10px] text-slate-400">
                      <span>ورد في: {item.files.length} ملفات</span>
                      {onFilterByPassport && (
                        <button
                          onClick={() => onFilterByPassport(item.passport)}
                          className="text-primary font-bold hover:underline flex items-center gap-0.5"
                        >
                          <span>تصفية السجلات</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {filteredDuplicates.length > visibleCount && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount(c => c + 45)}
                    className="rounded-xl text-xs font-bold gap-1.5"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>عرض المزيد ({filteredDuplicates.length - visibleCount} متبقية)</span>
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Geographical & Governorate Distribution (Visual Horizontal Bars) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Governorates */}
        <Card className="p-5 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-black text-slate-800 dark:text-slate-100">
                التوزيع الجغرافي للمحافظات ومناطق الوصول
              </CardTitle>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {aggregatedData.sortedGovs.length} مناطق مسجلة
            </span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {aggregatedData.sortedGovs.slice(0, 10).map((item, idx) => {
              const percent = Math.round((item.count / (maxGovCount || 1)) * 100);
              const sharePercent = Math.round((item.count / (aggregatedData.totalRecords || 1)) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                      <span>{item.count} سجل</span>
                      <span className="text-emerald-600 font-bold">({sharePercent}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.4, delay: idx * 0.05 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Nationalities */}
        <Card className="p-5 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-black text-slate-800 dark:text-slate-100">
                توزيع الجنسيات والبلدان للمسافرين
              </CardTitle>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {aggregatedData.sortedNationalities.length} جنسيات
            </span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {aggregatedData.sortedNationalities.slice(0, 10).map((item, idx) => {
              const percent = Math.round((item.count / (maxNatCount || 1)) * 100);
              const sharePercent = Math.round((item.count / (aggregatedData.totalRecords || 1)) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                      <span>{item.count} مسافر</span>
                      <span className="text-blue-600 font-bold">({sharePercent}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.4, delay: idx * 0.05 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 4. Ports & Visa Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Ports / Centers */}
        <Card className="p-5 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm font-black text-slate-800 dark:text-slate-100">
              المنافذ ومراكز الوصول الأكثر كثافة
            </CardTitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {aggregatedData.sortedCenters.slice(0, 6).map((c, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {c.count} حركة
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Visa Types */}
        <Card className="p-5 rounded-2xl border-slate-200/80 shadow-xs bg-white dark:bg-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm font-black text-slate-800 dark:text-slate-100">
              تصنيف التأشيرات وأغراض الحركة
            </CardTitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {aggregatedData.sortedVisas.slice(0, 6).map((v, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{v.name}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {v.count}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
