import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  History, 
  Search, 
  ArrowRight, 
  Calendar, 
  User, 
  FileCheck, 
  ShieldCheck, 
  Clock, 
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { getTravelers } from '../lib/storage';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { exportToExcel } from '../lib/exportUtils';

export const SmartMergeReport: React.FC = () => {
  const travelers = getTravelers();
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all merge history entries from all travelers
  const mergeHistory = useMemo(() => {
    const history: any[] = [];
    travelers.forEach(t => {
      if (t.mergeHistory && t.mergeHistory.length > 0) {
        t.mergeHistory.forEach((h, idx) => {
          history.push({
            ...h,
            travelerId: t.id,
            travelerName: `${t.firstName} ${t.lastName}`,
            passportNumber: t.idNumber,
            historyIndex: idx
          });
        });
      }
    });
    // Sort by timestamp descending
    return history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [travelers]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return mergeHistory;
    const q = searchQuery.toLowerCase();
    return mergeHistory.filter(h => 
      h.travelerName.toLowerCase().includes(q) || 
      h.passportNumber.toLowerCase().includes(q) ||
      h.source.toLowerCase().includes(q)
    );
  }, [mergeHistory, searchQuery]);

  const handleExportHistory = () => {
    const exportData = filteredHistory.map(h => ({
      'تاريخ التحديث': new Date(h.timestamp).toLocaleString('ar-YE'),
      'المسافر': h.travelerName,
      'رقم الجواز': h.passportNumber,
      'المصدر': h.source,
      'عدد التغييرات': h.changes.length,
      'تفاصيل التغييرات': h.changes.map((c: any) => `${c.label}: [${c.oldValue}] -> [${c.newValue}]`).join(' | ')
    }));
    exportToExcel(exportData, `تقرير_الدمج_الذكي_SmartMerge_${Date.now()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600 animate-spin-slow" />
            سجل التدقيق والتحديث الذكي (SmartMerge Log)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            استعراض كافة السجلات التي تم دمج بياناتها أو تحديث حقولها تلقائياً لتفادي التكرار.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="بحث في الأسماء أو الجوازات..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 rounded-xl h-9 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportHistory} className="h-9 gap-1.5 text-xs font-semibold rounded-xl">
            <Download className="h-3.5 w-3.5" /> تصدير
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
            <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-bold">لا يوجد سجلات دمج مطابقة للبحث حالياً</p>
          </div>
        ) : (
          filteredHistory.map((item, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={`${item.travelerId}-${item.historyIndex}`}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all group"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{item.travelerName}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[9px] py-0 font-mono">{item.passportNumber}</Badge>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {new Date(item.timestamp).toLocaleString('ar-YE')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-1 px-2">
                    <CheckCircle2 className="h-3 w-3" /> تم التحديث عبر {item.source}
                  </Badge>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {item.changes.map((change: any, cIdx: number) => (
                    <div key={cIdx} className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500">{change.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-rose-600 line-through truncate max-w-[80px]" title={String(change.oldValue)}>
                          {String(change.oldValue)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="text-[11px] text-emerald-700 font-bold truncate flex-1" title={String(change.newValue)}>
                          {String(change.newValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
