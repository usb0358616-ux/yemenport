import React, { useEffect, useState, useMemo, Component } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Users, FileText, BarChart3, ShieldCheck, LogOut, Truck, Settings as SettingsIcon, Menu, X, Bell, User as UserIcon, LogIn, ChevronRight, Home, Search as SearchIcon, Globe, Calendar, Stamp, Building2, Cpu, Plus, Compass, Briefcase, FileCheck, BrainCircuit, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Travelers from './pages/Travelers';
import Reports from './pages/Reports';
import Statistics from './pages/Statistics';
import Movements from './pages/Movements';
import Settings from './pages/Settings';
import Login from './pages/Login';
import MofaVisasHub from './pages/MofaVisasHub';
import MonthlyReportsHub from './pages/MonthlyReportsHub';
import { SovereignModulesHub } from './components/SovereignModulesHub';
import { CentralImportCenter } from './components/CentralImportCenter';
import { DocumentRegistry } from './components/DocumentRegistry';
import { Toaster } from './components/ui/sonner';
import { getCurrentUser, setCurrentUser, getTravelers, getReports } from './lib/storage';
import { Button } from './components/ui/button';
import { toast } from 'sonner';
import { getRoleCategoryLabel } from './lib/rbac';
import {
  getLiveOcrWatchlistAlerts,
  acknowledgeOcrWatchlistAlert,
  acknowledgeAllOcrWatchlistAlerts,
  OCR_WATCHLIST_ALERT_EVENT,
  OcrWatchlistAlert
} from './lib/ocrWatchlistGuard';
import {
  UNIFIED_IMPORT_EVENT,
  SOVEREIGN_DATA_UPDATED_EVENT,
  UnifiedImportCategory,
  OpenUnifiedImportPayload
} from './lib/unifiedImportHub';

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'خطأ غير متوقع في واجهة النظام' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-right" dir="rtl">
          <div className="max-w-md w-full bg-white border border-rose-200 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-7 w-7 shrink-0" />
              <h2 className="text-lg font-black">تعذر تحميل الواجهة</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              حدث عطل مؤقت أثناء تشغيل وحدة النظام محلياً: <span className="font-mono text-rose-700">{this.state.errorMessage}</span>
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="w-full gap-2 font-bold"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة تحميل النظام
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [importModalState, setImportModalState] = useState<{
    isOpen: boolean;
    initialFiles?: File[];
    defaultCategory?: UnifiedImportCategory;
    sourceTitle?: string;
    autoStartAnalysis?: boolean;
  }>({ isOpen: false });
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [globalSearch, setGlobalSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [ocrWatchlistAlerts, setOcrWatchlistAlerts] = useState<OcrWatchlistAlert[]>(() =>
    getLiveOcrWatchlistAlerts()
  );

  useEffect(() => {
    const handleOpenUnified = (e: Event) => {
      const detail = ((e as CustomEvent<OpenUnifiedImportPayload>).detail) || {};
      setImportModalState({
        isOpen: true,
        initialFiles: detail.files && detail.files.length > 0 ? detail.files : undefined,
        defaultCategory: detail.category,
        sourceTitle: detail.sourceTitle,
        autoStartAnalysis: detail.autoStartAnalysis
      });
    };
    const handleDataUpdated = () => {
      setDataRefreshTick(t => t + 1);
      setOcrWatchlistAlerts(getLiveOcrWatchlistAlerts());
    };
    const handleOcrAlert = (e: Event) => {
      const alertItem = (e as CustomEvent<{ alert?: OcrWatchlistAlert }>).detail?.alert;
      setOcrWatchlistAlerts(getLiveOcrWatchlistAlerts());
      setDataRefreshTick(t => t + 1);
      if (alertItem) {
        toast.error(
          `تنبيه أمني فوري (OCR): تطابق "${alertItem.travelerName}" (${alertItem.passportNumber}) مع ${alertItem.matchedRecordTitle}`,
          { duration: 9000 }
        );
      }
    };
    window.addEventListener(UNIFIED_IMPORT_EVENT, handleOpenUnified);
    window.addEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleDataUpdated);
    window.addEventListener(OCR_WATCHLIST_ALERT_EVENT, handleOcrAlert);
    return () => {
      window.removeEventListener(UNIFIED_IMPORT_EVENT, handleOpenUnified);
      window.removeEventListener(SOVEREIGN_DATA_UPDATED_EVENT, handleDataUpdated);
      window.removeEventListener(OCR_WATCHLIST_ALERT_EVENT, handleOcrAlert);
    };
  }, []);

  const unackedOcrAlerts = useMemo(
    () => ocrWatchlistAlerts.filter(a => !a.acknowledged),
    [ocrWatchlistAlerts]
  );

  const liveAlerts = useMemo(() => {
    const travelers = getTravelers();
    const reports = getReports();
    const now = new Date();

    const expiringDocs = travelers.filter(t => {
      if (!t.expiryDate) return false;
      const exp = new Date(t.expiryDate);
      const diffMonths = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return diffMonths <= 6;
    });

    const restrictedTravelers = travelers.filter(t => t.travelAllowed === 'لا');
    const pendingReports = reports.filter(r => r.status === 'جديد' || r.status === 'قيد التحقيق');

    return {
      ocrHitsCount: unackedOcrAlerts.length,
      expiringCount: expiringDocs.length,
      restrictedCount: restrictedTravelers.length,
      reportsCount: pendingReports.length,
      total: unackedOcrAlerts.length + expiringDocs.length + restrictedTravelers.length + pendingReports.length
    };
  }, [location.pathname, dataRefreshTick, unackedOcrAlerts.length]);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`/?search=${encodeURIComponent(globalSearch)}`);
      setGlobalSearch('');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  const navItems = [
    { path: '/', label: 'المسافرين', icon: Users },
    { path: '/documents', label: 'سجل الوثائق والجوازات', icon: FileCheck },
    { path: '/mofa-visas', label: 'مذكرات وتأشيرات الخارجية', icon: Building2 },
    { path: '/permits', label: 'تصاريح التنقل للأفراد والمنظمات', icon: Compass },
    { path: '/travel-agencies', label: 'مكاتب ووكالات السفر', icon: Briefcase },
    { path: '/sovereign', label: 'الوحدات السيادية الـ 14', icon: Stamp },
    { path: '/movements', label: 'حركة الأطقم', icon: Truck },
    { path: '/reports', label: 'بلاغات الضبط', icon: FileText },
    { path: '/statistics', label: 'الإحصائيات', icon: BarChart3 },
    { path: '/monthly-reports', label: 'التقارير الشهرية السيادية', icon: Calendar },
    { path: '/settings', label: 'الإعدادات', icon: SettingsIcon },
  ];

  const handleLogout = () => {
    setCurrentUser(null);
    navigate('/login');
  };

  const currentLabel = navItems.find(item => item.path === location.pathname)?.label || 'الرئيسية';

  return (
    <div className="flex h-[100dvh] bg-[#F8FAFC] overflow-hidden text-[#1E293B]" dir="rtl">
      <CentralImportCenter
        isOpen={importModalState.isOpen}
        onClose={() => setImportModalState(prev => ({ ...prev, isOpen: false, initialFiles: undefined, autoStartAnalysis: undefined }))}
        initialFiles={importModalState.initialFiles}
        defaultCategory={importModalState.defaultCategory}
        sourceTitle={importModalState.sourceTitle}
        autoStartAnalysis={importModalState.autoStartAnalysis}
        onConsumeInitialFiles={() => setImportModalState(prev => ({ ...prev, initialFiles: undefined, autoStartAnalysis: undefined }))}
      />
      
      {/* Mobile Backdrop for Sidebar Drawer */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-45 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-primary text-white flex flex-col z-50 fixed lg:relative inset-y-0 right-0 shadow-2xl overflow-hidden max-w-[85vw]"
          >
            <div className="p-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="bg-white/10 p-1.5 rounded-xl shadow-md border border-white/20 shrink-0">
                  <img
                    src="./assets/aistudio/ic_launcher_e65b28d6.png"
                    alt="الشعار الرسمي"
                    className="h-9 w-auto max-w-[42px] object-contain drop-shadow-xs"
                  />
                </div>
                <div className="font-bold leading-tight">
                  <p className="text-base tracking-wide">نظام المنافذ والجوازات</p>
                  <p className="text-[10px] uppercase opacity-90 tracking-widest text-amber-300">المركز الرئيسي - العاصمة صنعاء</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 p-4 space-y-1 mt-2 overflow-y-auto">
              <button
                onClick={() => setImportModalState({ isOpen: true })}
                className="flex items-center justify-between w-full px-4 py-4 mb-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-primary font-black transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3">
                  <BrainCircuit className="h-6 w-6 animate-pulse" />
                  <span className="text-sm">الاستيراد الموحد (متعدد الملفات)</span>
                </div>
                <Plus className="h-4 w-4" />
              </button>

              <div className="h-px bg-white/10 my-2" />

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path === '/' && location.pathname.startsWith('/travelers'));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group ${
                      isActive 
                        ? 'bg-accent text-accent-foreground shadow-lg font-bold translate-x-1' 
                        : 'hover:bg-white/5 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="h-4 w-4" />}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 mt-auto">
              <div className="bg-white/5 rounded-2xl p-4 mb-3 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-accent/20 h-10 w-10 rounded-full flex items-center justify-center shrink-0">
                    <UserIcon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold truncate">{user?.name || 'مستخدم النظام'}</p>
                    <p className="text-[10px] opacity-75 truncate">
                      {user?.role || 'ضابط منفذ'} · {getRoleCategoryLabel(user?.role)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-destructive/10 text-destructive-foreground hover:bg-destructive/20 transition-colors text-xs font-bold"
                >
                  <LogOut className="h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
              <div className="text-center">
                <p className="text-[10px] opacity-40 font-mono">v1.2.0 · MOBILE & OFFLINE READY</p>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Navbar */}
        <header className="h-16 lg:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 lg:px-8 z-30 sticky top-0 shadow-xs shrink-0">
          <div className="flex items-center gap-3 sm:gap-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hover:bg-slate-100"
              title="القائمة"
            >
              <Menu className="h-5 w-5 text-slate-700" />
            </Button>
            
            <div className="flex items-center gap-2.5">
              <img
                src="./assets/aistudio/ic_launcher_e65b28d6.png"
                alt="الطير الجمهوري"
                className="h-10 w-auto max-w-[46px] object-contain drop-shadow-xs"
              />
              <div className="flex flex-col">
                <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-500 mb-0.5">
                  <span className="text-primary font-black">الجمهورية اليمنية</span>
                  <span>·</span>
                  <span>رئاسة مصلحة الجوازات</span>
                  <span>·</span>
                  <span className="text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-300">
                    المركز الرئيسي - العاصمة صنعاء
                  </span>
                </div>
                <h2 className="text-base sm:text-xl font-bold text-slate-900 leading-tight">{currentLabel}</h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <form onSubmit={handleGlobalSearch} className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-full text-slate-500 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <SearchIcon className="h-4 w-4" />
              <input 
                type="text" 
                placeholder="بحث عن مسافر، وثيقة، بلاغ..." 
                className="bg-transparent border-none outline-none text-xs w-44 lg:w-64 text-right font-medium" 
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
            </form>

            <div className="hidden lg:flex items-center gap-4 border-l pl-4 ml-2">
              <div className="flex flex-col items-end">
                <p className="text-sm font-bold text-slate-700 font-mono">
                  {currentTime.toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                  <Calendar className="h-3 w-3" />
                  <span>{currentTime.toLocaleDateString('ar-YE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-slate-500 hover:bg-slate-100 rounded-full h-9 w-9" title="التنبيهات الأمنية">
                    <Bell className="h-4.5 w-4.5" />
                    {liveAlerts.total > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                        {liveAlerts.total > 99 ? '99+' : liveAlerts.total}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80" dir="rtl">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>مركز التنبيهات الفورية</span>
                    <span className="text-[10px] font-mono tabular-nums text-rose-600">{liveAlerts.total} تنبيه</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {unackedOcrAlerts.length > 0 && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/reports')} className="cursor-pointer py-2.5 bg-rose-50/70">
                        <ShieldAlert className="ml-2 h-4 w-4 text-rose-600 shrink-0" />
                        <div className="text-xs min-w-0">
                          <p className="font-bold text-rose-900">تطابق OCR مع المطلوبين ({unackedOcrAlerts.length})</p>
                          <p className="text-[10px] text-rose-700 truncate">
                            {unackedOcrAlerts[0].travelerName} ({unackedOcrAlerts[0].passportNumber})
                          </p>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => navigate('/reports')} className="cursor-pointer py-2.5">
                    <ShieldAlert className="ml-2 h-4 w-4 text-rose-600 shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold">بلاغات الضبط النشطة ({liveAlerts.reportsCount})</p>
                      <p className="text-[10px] text-muted-foreground">عرض ومتابعة بلاغات التحري المفتوحة</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/documents')} className="cursor-pointer py-2.5">
                    <AlertTriangle className="ml-2 h-4 w-4 text-amber-600 shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold">جوازات منتهية / قريبة الانتهاء ({liveAlerts.expiringCount})</p>
                      <p className="text-[10px] text-muted-foreground">مراجعة صلاحية الوثائق في السجل</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer py-2.5">
                    <ShieldCheck className="ml-2 h-4 w-4 text-primary shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold">ممنوعون من السفر ({liveAlerts.restrictedCount})</p>
                      <p className="text-[10px] text-muted-foreground">مراجعة قوائم المنع في سجل المسافرين</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-1 pr-2 sm:pr-3 hover:bg-slate-100 rounded-full flex items-center gap-2">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{user?.name || 'الضابط'}</p>
                      <p className="text-[10px] text-slate-400 uppercase">{user?.role || 'أمن المنافذ'}</p>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center overflow-hidden">
                      <UserIcon className="h-4.5 w-4.5" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" dir="rtl">
                  <DropdownMenuLabel>حسابي</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <SettingsIcon className="ml-2 h-4 w-4" />
                    <span>الإعدادات</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Globe className="ml-2 h-4 w-4" />
                    <span>اللغة: العربية (اليمن)</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <LogOut className="ml-2 h-4 w-4" />
                    <span>تسجيل الخروج</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Content Scroll Area - Vertical Scroll with Contained Data Regions */}
        <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto adaptive-scroll-region bg-[#F8FAFC] pb-24 md:pb-8 w-full min-w-0">
          <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] w-full min-w-0 mx-auto">
            {unackedOcrAlerts.length > 0 && (
              <section
                aria-label="تنبيه أمني فوري لتطابق الجواز مع المطلوبين"
                className="mb-5 rounded-2xl border border-rose-300 bg-rose-50/95 p-4 text-rose-950 shadow-xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-extrabold text-rose-900 text-sm">
                          تنبيه أمني فوري — تطابق بيانات جواز عبر OCR ({unackedOcrAlerts.length})
                        </span>
                        <span className="text-rose-400">·</span>
                        <span className="font-semibold text-rose-800">{unackedOcrAlerts[0].alertSource}</span>
                        <span className="text-rose-400">·</span>
                        <span className="font-mono tabular-nums text-[11px] text-rose-700">
                          {new Date(unackedOcrAlerts[0].detectedAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-rose-900 leading-relaxed">
                        <strong>{unackedOcrAlerts[0].travelerName}</strong> · رقم الجواز:{' '}
                        <span className="font-mono tabular-nums font-bold">{unackedOcrAlerts[0].passportNumber}</span> ·{' '}
                        {unackedOcrAlerts[0].details}
                      </p>
                      {unackedOcrAlerts.length > 1 && (
                        <p className="text-[11px] text-rose-700 font-medium">
                          يوجد {unackedOcrAlerts.length - 1} تنبيهات إضافية غير مقررة في مركز التنبيهات.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => navigate('/reports')}
                      className="font-bold whitespace-nowrap"
                    >
                      عرض بلاغات الضبط
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/?search=${encodeURIComponent(unackedOcrAlerts[0].passportNumber || unackedOcrAlerts[0].travelerName)}`)}
                      className="border-rose-300 text-rose-900 hover:bg-rose-100 whitespace-nowrap"
                    >
                      فحص السجل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const updated = unackedOcrAlerts.length > 1
                          ? acknowledgeAllOcrWatchlistAlerts(user?.name)
                          : acknowledgeOcrWatchlistAlert(unackedOcrAlerts[0].id, user?.name);
                        setOcrWatchlistAlerts(updated);
                      }}
                      className="text-rose-800 hover:bg-rose-100 whitespace-nowrap"
                    >
                      {unackedOcrAlerts.length > 1 ? 'إقرار الكل وإخفاء' : 'إقرار ومراجعة'}
                    </Button>
                  </div>
                </div>
              </section>
            )}
            {children}
          </div>
        </main>

        {/* Mobile Smartphone Bottom Navigation Bar - Smooth Scrollable Strip */}
        <nav className="mobile-bottom-bar fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex justify-start sm:justify-around items-center gap-1 overflow-x-auto adaptive-scroll-region shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path === '/' && location.pathname.startsWith('/travelers'));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all shrink-0 min-w-[68px] ${
                  isActive
                    ? 'text-primary font-bold'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-primary/10 scale-105' : ''}`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
                </div>
                <span className="text-[10px] mt-0.5 leading-tight whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AppErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Travelers /></PrivateRoute>} />
          <Route path="/travelers/:id" element={<PrivateRoute><Travelers /></PrivateRoute>} />
          <Route path="/documents" element={<PrivateRoute><DocumentRegistry /></PrivateRoute>} />
          <Route path="/sovereign" element={<PrivateRoute><SovereignModulesHub /></PrivateRoute>} />
          <Route path="/permits" element={<PrivateRoute><SovereignModulesHub initialModule="permits" /></PrivateRoute>} />
          <Route path="/travel-agencies" element={<PrivateRoute><SovereignModulesHub initialModule="companies" /></PrivateRoute>} />
          <Route path="/mofa-visas" element={<PrivateRoute><MofaVisasHub /></PrivateRoute>} />
          <Route path="/movements" element={<PrivateRoute><Movements /></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
          <Route path="/statistics" element={<PrivateRoute><Statistics /></PrivateRoute>} />
          <Route path="/monthly-reports" element={<PrivateRoute><MonthlyReportsHub /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" />
      </Router>
    </AppErrorBoundary>
  );
}
