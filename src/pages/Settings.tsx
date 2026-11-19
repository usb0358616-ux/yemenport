import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Save,
  ShieldCheck,
  MapPin,
  BadgeCheck,
  UserCheck,
  Plus,
  Trash2,
  Edit2,
  Star,
  CheckCircle2,
  Landmark,
  Layers,
  Users,
  KeyRound,
  Lock,
  Unlock,
  FileSearch,
  Download,
  Search,
  RefreshCw,
  Check,
  X
} from 'lucide-react';
import {
  getPortOfficers,
  addPortOfficer,
  updatePortOfficer,
  deletePortOfficer,
  setCurrentDutyOfficer,
  getCurrentUser,
  setCurrentUser,
  getAuditLogs,
  addAuditLog,
  generateId
} from '@/lib/storage';
import { PortOfficer, AuditLogEntity } from '@/lib/types';
import { SOVEREIGN_PORTS, SOVEREIGN_ROLES, SovereignUserRole } from '@/lib/constants';
import {
  getManagedUsers,
  saveManagedUserAccount,
  toggleManagedUserStatus,
  resetManagedUserPassword,
  deleteManagedUser,
  hasPermission,
  getRoleCategoryLabel,
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSIONS,
  ManagedUserAccount
} from '@/lib/rbac';
import { exportToExcel } from '@/lib/exportUtils';
import {
  kvGet,
  kvSet,
  getSovereignStorageStats,
  optimizeSovereignStorage,
  formatBytesArabic,
  SovereignStorageStats
} from '@/lib/sovereignStorageBackend';
import { HardDrive } from 'lucide-react';

type SettingsTab = 'general' | 'officers' | 'users' | 'audit' | 'security';

const Settings = () => {
  const { toast } = useToast();
  const currentUser = getCurrentUser();

  const canManageSettings = hasPermission(currentUser, 'manage_settings');
  const canManageOfficers = hasPermission(currentUser, 'manage_officers');
  const canManageUsers = hasPermission(currentUser, 'manage_users_roles');
  const canViewAuditLogs = hasPermission(currentUser, 'view_audit_logs');
  const canExport = hasPermission(currentUser, 'export_data');

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // General configuration state
  const [config, setConfig] = useState({
    centerName: kvGet('config_centerName') || 'المركز الرئيسي - العاصمة صنعاء',
    agencyName: kvGet('config_agencyName') || 'رئاسة مصلحة الهجرة والجوازات والجنسية',
    region: kvGet('config_region') || 'العاصمة صنعاء',
    branchCode: kvGet('config_branchCode') || 'SNA-HQ-01',
    defaultOfficer: kvGet('config_default_officer') || 'ضابط المناوبة بالمنفذ',
    directorName: kvGet('config_director_name') || 'مدير عام المنافذ والرقابة الحدودية',
    vettingOfficerName: kvGet('config_vetting_officer') || 'ضابط المباينة والتحقيق الجنائي',
  });

  // Officers management state
  const [officers, setOfficers] = useState<PortOfficer[]>([]);
  const [officerDialogOpen, setOfficerDialogOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<PortOfficer | null>(null);
  const [officerForm, setOfficerForm] = useState<Partial<PortOfficer>>({
    name: '',
    rank: 'نقيب',
    portOrCenter: 'المركز الرئيسي - العاصمة صنعاء',
    role: 'ضابط منفذ',
    militaryNumber: '',
    phone: '',
    status: 'نشط',
    isCurrentDutyOfficer: false,
  });

  // RBAC Managed Users state
  const [managedUsers, setManagedUsers] = useState<ManagedUserAccount[]>([]);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingManagedUser, setEditingManagedUser] = useState<ManagedUserAccount | null>(null);
  const [userForm, setUserForm] = useState<{
    username: string;
    password: string;
    name: string;
    role: SovereignUserRole;
    portOrDepartment: string;
    militaryNumber: string;
    status: 'نشط' | 'موقوف';
  }>({
    username: '',
    password: '',
    name: '',
    role: 'محقق أول',
    portOrDepartment: 'المركز الرئيسي - العاصمة صنعاء',
    militaryNumber: '',
    status: 'نشط'
  });

  const [resetPwUser, setResetPwUser] = useState<ManagedUserAccount | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Audit Logs Console state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntity[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('الكل');
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>('الكل');

  const [storageStats, setStorageStats] = useState<SovereignStorageStats | null>(null);
  const [isOptimizingStorage, setIsOptimizingStorage] = useState(false);

  const refreshSecurityState = () => {
    setOfficers(getPortOfficers());
    setManagedUsers(getManagedUsers());
    setAuditLogs(getAuditLogs());
    void getSovereignStorageStats().then(setStorageStats);
  };

  useEffect(() => {
    refreshSecurityState();
  }, [activeTab]);

  const handleOptimizeStorage = async () => {
    setIsOptimizingStorage(true);
    try {
      const res = await optimizeSovereignStorage();
      const freshStats = await getSovereignStorageStats();
      setStorageStats(freshStats);
      toast({
        title: 'تم تحسين وضغط قاعدة التخزين بنجاح',
        description: `تم تحرير ${formatBytesArabic(res.freedLocalStorageBytes)} من الذاكرة المؤقتة وضغط ${res.compactedTravelers} سجل.`
      });
    } finally {
      setIsOptimizingStorage(false);
    }
  };

  const handleSaveGeneral = () => {
    if (!canManageSettings) {
      toast({ title: 'صلاحية مقيدة', description: 'تعديل الإعدادات مقتصر على الإدارة العليا.', variant: 'destructive' });
      return;
    }
    kvSet('config_centerName', config.centerName);
    kvSet('config_agencyName', config.agencyName);
    kvSet('config_region', config.region);
    kvSet('config_branchCode', config.branchCode);
    kvSet('config_default_officer', config.defaultOfficer);
    kvSet('config_director_name', config.directorName);
    kvSet('config_vetting_officer', config.vettingOfficerName);

    const user = getCurrentUser();
    if (user && config.defaultOfficer) {
      user.name = config.defaultOfficer;
      user.portOrDepartment = config.centerName;
      setCurrentUser(user);
    }

    addAuditLog('تعديل', 'الأمان والصلاحيات', `تحديث إعدادات المركز الرئيسي (${config.centerName} - ${config.branchCode})`);
    toast({
      title: 'تم حفظ إعدادات المركز الرئيسي',
      description: 'تم تحديث بيانات المقر السيادي بصنعاء والمسؤولين بنجاح.'
    });
  };

  const handleOpenAddOfficer = () => {
    if (!canManageOfficers) {
      toast({ title: 'صلاحية مقيدة', description: 'لا تملك صلاحية إضافة ضباط المنافذ.', variant: 'destructive' });
      return;
    }
    setEditingOfficer(null);
    setOfficerForm({
      name: '',
      rank: 'نقيب',
      portOrCenter: config.centerName || 'المركز الرئيسي - العاصمة صنعاء',
      role: 'ضابط منفذ',
      militaryNumber: '',
      phone: '',
      status: 'نشط',
      isCurrentDutyOfficer: false,
    });
    setOfficerDialogOpen(true);
  };

  const handleOpenEditOfficer = (officer: PortOfficer) => {
    if (!canManageOfficers) {
      toast({ title: 'صلاحية مقيدة', description: 'لا تملك صلاحية تعديل دليل الضباط.', variant: 'destructive' });
      return;
    }
    setEditingOfficer(officer);
    setOfficerForm({ ...officer });
    setOfficerDialogOpen(true);
  };

  const handleSaveOfficer = () => {
    if (!canManageOfficers) return;
    if (!officerForm.name?.trim()) {
      toast({ title: 'خطأ', description: 'يرجى إدخال اسم الضابط / المسؤول', variant: 'destructive' });
      return;
    }

    if (editingOfficer) {
      const updated = updatePortOfficer({
        ...editingOfficer,
        ...officerForm,
        name: officerForm.name.trim(),
      } as PortOfficer);
      setOfficers(updated);
      addAuditLog('تعديل', 'المنافذ السيادية', `تحديث بيانات الضابط (${officerForm.rank} ${officerForm.name})`, editingOfficer.id);
      toast({ title: 'تم تعديل بيانات الضابط بنجاح' });
    } else {
      const newOfficer: PortOfficer = {
        id: 'off-' + generateId(),
        name: officerForm.name.trim(),
        rank: officerForm.rank || 'ملازم',
        portOrCenter: officerForm.portOrCenter || config.centerName,
        role: officerForm.role || 'ضابط منفذ',
        militaryNumber: officerForm.militaryNumber || '',
        phone: officerForm.phone || '',
        status: (officerForm.status as any) || 'نشط',
        isCurrentDutyOfficer: officerForm.isCurrentDutyOfficer || false,
        createdAt: new Date().toISOString(),
      };
      const updated = addPortOfficer(newOfficer);
      setOfficers(updated);
      addAuditLog('إنشاء', 'المنافذ السيادية', `إدراج الضابط (${newOfficer.rank} ${newOfficer.name}) في ${newOfficer.portOrCenter}`, newOfficer.id);
      toast({ title: 'تم إدراج الضابط في قائمة المنافذ' });
    }

    setOfficerDialogOpen(false);
  };

  const handleDeleteOfficer = (id: string) => {
    if (!canManageOfficers) {
      toast({ title: 'صلاحية مقيدة', description: 'لا تملك صلاحية الحذف.', variant: 'destructive' });
      return;
    }
    const target = officers.find(o => o.id === id);
    const updated = deletePortOfficer(id);
    setOfficers(updated);
    addAuditLog('حذف', 'المنافذ السيادية', `حذف الضابط (${target?.name || id}) من دليل المنافذ`, id);
    toast({ title: 'تم حذف الضابط من القائمة' });
  };

  const handleSetDuty = (id: string) => {
    if (!canManageOfficers) {
      toast({ title: 'صلاحية مقيدة', description: 'لا تملك صلاحية تعيين الضابط المناوب.', variant: 'destructive' });
      return;
    }
    setCurrentDutyOfficer(id);
    const updated = getPortOfficers();
    setOfficers(updated);
    const duty = updated.find(o => o.id === id);
    if (duty) {
      const formatted = `${duty.rank ? duty.rank + '/ ' : ''}${duty.name}`;
      setConfig(prev => ({ ...prev, defaultOfficer: formatted }));
      kvSet('config_default_officer', formatted);
      const user = getCurrentUser();
      if (user) {
        user.name = formatted;
        setCurrentUser(user);
      }
      addAuditLog('تعديل', 'المنافذ السيادية', `تعيين الضابط المناوب الحالي: ${formatted}`, id);
      toast({
        title: 'تم تعيين الضابط المناوب الحالي',
        description: `الضابط المناوب الحالي: ${formatted}`
      });
    }
  };

  // RBAC User Accounts Handlers
  const handleOpenAddUser = () => {
    if (!canManageUsers) {
      toast({ title: 'صلاحية مقيدة', description: 'إدارة الحسابات مقتصرة على المشرفين والمدير العام.', variant: 'destructive' });
      return;
    }
    setEditingManagedUser(null);
    setUserForm({
      username: '',
      password: '',
      name: '',
      role: 'محقق أول',
      portOrDepartment: config.centerName || 'المركز الرئيسي - العاصمة صنعاء',
      militaryNumber: '',
      status: 'نشط'
    });
    setUserDialogOpen(true);
  };

  const handleOpenEditUser = (u: ManagedUserAccount) => {
    if (!canManageUsers) return;
    setEditingManagedUser(u);
    setUserForm({
      username: u.username,
      password: '',
      name: u.name,
      role: u.role,
      portOrDepartment: u.portOrDepartment,
      militaryNumber: u.militaryNumber || '',
      status: u.status
    });
    setUserDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!canManageUsers) return;
    const res = saveManagedUserAccount({
      id: editingManagedUser?.id,
      username: userForm.username,
      password: userForm.password,
      name: userForm.name,
      role: userForm.role,
      portOrDepartment: userForm.portOrDepartment,
      militaryNumber: userForm.militaryNumber,
      status: userForm.status
    });

    if (!res.ok) {
      toast({ title: 'تعذر الحفظ', description: res.error, variant: 'destructive' });
      return;
    }

    setManagedUsers(res.users);
    setAuditLogs(getAuditLogs());
    setUserDialogOpen(false);
    toast({
      title: editingManagedUser ? 'تم تحديث الحساب والصلاحيات' : 'تم إنشاء حساب المستخدم بنجاح',
      description: `${userForm.name} (${userForm.role})`
    });
  };

  const handleToggleUserStatus = (id: string) => {
    if (!canManageUsers) return;
    if (currentUser?.id === id) {
      toast({ title: 'غير مسموح', description: 'لا يمكنك إيقاف حسابك النشط حالياً.', variant: 'destructive' });
      return;
    }
    const next = toggleManagedUserStatus(id);
    setManagedUsers(next);
    setAuditLogs(getAuditLogs());
    toast({ title: 'تم تحديث حالة الحساب وتوثيق الإجراء' });
  };

  const handleConfirmResetPassword = () => {
    if (!resetPwUser || !canManageUsers) return;
    const res = resetManagedUserPassword(resetPwUser.id, newPasswordInput);
    if (!res.ok) {
      toast({ title: 'خطأ', description: res.error, variant: 'destructive' });
      return;
    }
    setAuditLogs(getAuditLogs());
    setResetPwUser(null);
    setNewPasswordInput('');
    toast({ title: 'تم تغيير كلمة المرور بنجاح وتوثيقه في سجل التدقيق' });
  };

  const handleDeleteManagedUser = (id: string) => {
    if (!canManageUsers) return;
    const res = deleteManagedUser(id);
    if (!res.ok) {
      toast({ title: 'تعذر الحذف', description: res.error, variant: 'destructive' });
      return;
    }
    setManagedUsers(res.users);
    setAuditLogs(getAuditLogs());
    toast({ title: 'تم حذف الحساب بنجاح' });
  };

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter(log => {
      const matchSearch =
        !q ||
        `${log.officerName} ${log.officerUsername} ${log.details} ${log.targetModule} ${log.portOrDepartment}`
          .toLowerCase()
          .includes(q);
      const matchAction = auditActionFilter === 'الكل' || log.action === auditActionFilter;
      const matchModule = auditModuleFilter === 'الكل' || log.targetModule === auditModuleFilter;
      return matchSearch && matchAction && matchModule;
    });
  }, [auditLogs, auditSearch, auditActionFilter, auditModuleFilter]);

  const auditActionsList = useMemo(() => {
    return Array.from(new Set(auditLogs.map(l => l.action)));
  }, [auditLogs]);

  const auditModulesList = useMemo(() => {
    return Array.from(new Set(auditLogs.map(l => l.targetModule)));
  }, [auditLogs]);

  const handleExportAuditCsv = () => {
    if (!canExport) return;
    const rows = filteredAuditLogs.map(l => ({
      'التاريخ والوقت': new Date(l.timestamp).toLocaleString('ar-YE'),
      'المستخدم': l.officerUsername,
      'الاسم': l.officerName,
      'الدور الوظيفي': l.officerRole,
      'المنفذ / القسم': l.portOrDepartment,
      'الإجراء': l.action,
      'الوحدة المستهدفة': l.targetModule,
      'التفاصيل': l.details,
      'العنوان / الجهاز': `${l.ipAddress} · ${l.deviceInfo}`
    }));
    exportToExcel(rows, `سجل_التدقيق_الرقابي_${new Date().toISOString().slice(0, 10)}`);
    addAuditLog('تصدير كشف', 'الأمان والصلاحيات', `تصدير سجل التدقيق (${rows.length} عملية) إلى Excel`);
  };

  const allAvailablePorts = [
    'المركز الرئيسي - العاصمة صنعاء',
    'غرفة العمليات المركزية والسيطرة - المركز الرئيسي (صنعاء)',
    ...SOVEREIGN_PORTS.map(p => p.name)
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Sovereign National Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-primary to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-white/10 relative overflow-hidden">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-3 rounded-2xl border border-white/20">
              <Landmark className="h-8 w-8 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1 text-xs text-slate-300">
                <span className="font-bold text-amber-300">المقر السيادي العام</span>
                <span>·</span>
                <span>الجمهورية اليمنية</span>
                <span>·</span>
                <span>{currentUser?.role || 'مدير عام'} ({getRoleCategoryLabel(currentUser?.role)})</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
                الإعدادات والأمان وإدارة الصلاحيات
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                إدارة المقر الرئيسي، دليل ضباط المنافذ، حسابات المستخدمين والأدوار، وسجلات التدقيق الرقابية غير القابلة للتلاعب.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-white/10 p-1.5 rounded-2xl border border-white/15 max-w-full">
            <Button
              variant={activeTab === 'general' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('general')}
              className={`whitespace-nowrap ${activeTab === 'general' ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300' : 'text-white hover:bg-white/10'}`}
            >
              <Building2 className="h-4 w-4 ml-1.5" />
              المركز والمقر
            </Button>
            <Button
              variant={activeTab === 'officers' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('officers')}
              className={`whitespace-nowrap ${activeTab === 'officers' ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300' : 'text-white hover:bg-white/10'}`}
            >
              <UserCheck className="h-4 w-4 ml-1.5" />
              ضباط المنافذ ({officers.length})
            </Button>
            <Button
              variant={activeTab === 'users' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('users')}
              className={`whitespace-nowrap ${activeTab === 'users' ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300' : 'text-white hover:bg-white/10'}`}
            >
              <Users className="h-4 w-4 ml-1.5" />
              المستخدمون والصلاحيات ({managedUsers.length})
            </Button>
            {canViewAuditLogs && (
              <Button
                variant={activeTab === 'audit' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('audit')}
                className={`whitespace-nowrap ${activeTab === 'audit' ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300' : 'text-white hover:bg-white/10'}`}
              >
                <FileSearch className="h-4 w-4 ml-1.5" />
                سجلات التدقيق ({auditLogs.length})
              </Button>
            )}
            <Button
              variant={activeTab === 'security' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('security')}
              className={`whitespace-nowrap ${activeTab === 'security' ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300' : 'text-white hover:bg-white/10'}`}
            >
              <ShieldCheck className="h-4 w-4 ml-1.5" />
              الأمان والتشفير
            </Button>
          </div>
        </div>
      </div>

      {/* TAB 1: General Headquarters & Authority Configuration */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">بيانات المقر الرئيسي للمنظومة</CardTitle>
                    <CardDescription>
                      تحدد هذه البيانات الترويسة الرسمية والجهة المشرفة على التقارير والمذكرات السيادية
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                {!canManageSettings && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-semibold">
                    وضع العرض فقط: تعديل بيانات المقر الرئيسي مقتصر على المشرفين والمدير العام.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">اسم المركز / المقر الرئيسي</label>
                    <Input
                      value={config.centerName}
                      disabled={!canManageSettings}
                      onChange={e => setConfig({ ...config, centerName: e.target.value })}
                      placeholder="المركز الرئيسي - العاصمة صنعاء"
                      className="text-right font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">الجهة / المصلحة العامة</label>
                    <Input
                      value={config.agencyName}
                      disabled={!canManageSettings}
                      onChange={e => setConfig({ ...config, agencyName: e.target.value })}
                      placeholder="رئاسة مصلحة الهجرة والجوازات والجنسية"
                      className="text-right font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> المحافظة / المقر الجغرافي
                    </label>
                    <Input
                      value={config.region}
                      disabled={!canManageSettings}
                      onChange={e => setConfig({ ...config, region: e.target.value })}
                      placeholder="العاصمة صنعاء"
                      className="text-right font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary" /> كود المركز الرئيسي السيادي
                    </label>
                    <Input
                      value={config.branchCode}
                      disabled={!canManageSettings}
                      onChange={e => setConfig({ ...config, branchCode: e.target.value })}
                      placeholder="SNA-HQ-01"
                      className="text-right font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="border-t pt-5 space-y-4">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <UserCheck className="h-4 w-4" />
                    <span>المسؤولون والضباط الافتراضيون للمباينة والتقارير</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">اسم ضابط المنفذ / المناوب الافتراضي</label>
                      <Input
                        value={config.defaultOfficer}
                        disabled={!canManageSettings}
                        onChange={e => setConfig({ ...config, defaultOfficer: e.target.value })}
                        className="text-right"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">مدير عام المنافذ / المعتمد</label>
                      <Input
                        value={config.directorName}
                        disabled={!canManageSettings}
                        onChange={e => setConfig({ ...config, directorName: e.target.value })}
                        className="text-right"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">ضابط المباينة الجنائية</label>
                      <Input
                        value={config.vettingOfficerName}
                        disabled={!canManageSettings}
                        onChange={e => setConfig({ ...config, vettingOfficerName: e.target.value })}
                        className="text-right"
                      />
                    </div>
                  </div>
                </div>

                {canManageSettings && (
                  <div className="border-t pt-5 flex justify-end">
                    <Button onClick={handleSaveGeneral} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 px-6">
                      <Save className="h-4 w-4" /> حفظ بيانات المقر والمسؤولين
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-slate-900 to-primary text-white rounded-2xl shadow-md border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>منظومة المنافذ بالجمهورية</span>
                  <span className="text-[11px] font-bold text-amber-300">الربط المركزي</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-white/10">
                  <span className="text-slate-300">المقر العام للتحكم</span>
                  <span className="font-bold text-amber-300">العاصمة صنعاء</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/10">
                  <span className="text-slate-300">المنافذ الجوية المربوطة</span>
                  <span className="font-mono tabular-nums font-bold">7 مطارات دولية</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/10">
                  <span className="text-slate-300">المنافذ البرية المربوطة</span>
                  <span className="font-mono tabular-nums font-bold">5 منافذ حدودية</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/10">
                  <span className="text-slate-300">الموانئ البحرية المربوطة</span>
                  <span className="font-mono tabular-nums font-bold">6 موانئ سيادية</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/10">
                  <span className="text-slate-300">المستخدمون النشطون</span>
                  <span className="font-mono tabular-nums font-bold">{managedUsers.filter(u => u.status === 'نشط').length} حسابات</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-300">الضابط المناوب المفعل</span>
                  <span className="font-bold text-emerald-300">{config.defaultOfficer}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Dedicated Port Officers & Duty Roster Management */}
      {activeTab === 'officers' && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/70 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    دليل وإدارة ضباط ومسؤولي المنافذ
                  </CardTitle>
                  <CardDescription>
                    إدراج أسماء الضباط، الرتب، المهام، والمنافذ المكلفين بها، مع تعيين الضابط المناوب الحالي
                  </CardDescription>
                </div>
                {canManageOfficers && (
                  <Button onClick={handleOpenAddOfficer} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 whitespace-nowrap">
                    <Plus className="h-4 w-4" />
                    إدراج ضابط / مسؤول جديد
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="adaptive-table-container">
                <Table>
                  <TableHeader className="bg-slate-100/95 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-right font-bold text-slate-800">الرتبة والاسم الكامل</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">المنفذ / الإدارة</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">المهمة / الاختصاص</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">الرقم العسكري</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">الهاتف</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">الحالة</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">الضابط المناوب</TableHead>
                      {canManageOfficers && <TableHead className="text-center font-bold text-slate-800">الإجراءات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {officers.map((officer) => (
                      <TableRow key={officer.id} className="hover:bg-slate-50">
                        <TableCell className="font-bold text-slate-900">
                          <span className="text-xs text-slate-500 ml-1">{officer.rank || 'ضابط'} ·</span>
                          <span>{officer.name}</span>
                        </TableCell>
                        <TableCell className="text-slate-700 text-xs font-medium">
                          {officer.portOrCenter || 'المركز الرئيسي - العاصمة صنعاء'}
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs">{officer.role || 'ضابط منفذ'}</TableCell>
                        <TableCell className="font-mono tabular-nums text-xs text-slate-600">{officer.militaryNumber || '-'}</TableCell>
                        <TableCell className="font-mono tabular-nums text-xs text-slate-600" dir="ltr">{officer.phone || '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={officer.status === 'نشط' ? 'default' : 'secondary'} className="text-[10px]">
                            {officer.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {officer.isCurrentDutyOfficer ? (
                            <Badge className="bg-emerald-600 text-white gap-1 text-[11px] font-bold">
                              <Star className="h-3 w-3 fill-current" />
                              مناوب حالياً
                            </Badge>
                          ) : canManageOfficers ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDuty(officer.id)}
                              className="text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 h-7 px-2 whitespace-nowrap"
                            >
                              تعيين كمناوب
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        {canManageOfficers && (
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => handleOpenEditOfficer(officer)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteOfficer(officer.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {officers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لم يتم إدراج أي ضباط بعد.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: Users, Roles & Permissions Matrix (RBAC) */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/70 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    إدارة حسابات المستخدمين وصلاحيات الوصول (RBAC)
                  </CardTitle>
                  <CardDescription>
                    التحكم في حسابات المشرفين وضباط المنافذ وموظفي الإدخال وتعيين المنافذ وحالات النشاط
                  </CardDescription>
                </div>
                {canManageUsers && (
                  <Button onClick={handleOpenAddUser} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 whitespace-nowrap">
                    <Plus className="h-4 w-4" />
                    إنشاء حساب مستخدم جديد
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!canManageUsers && (
                <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-semibold">
                  للعرض فقط: إدارة الحسابات وإيقافها وتغيير الصلاحيات مقتصرة على المشرفين والمدير العام.
                </div>
              )}
              <div className="adaptive-table-container">
                <Table>
                  <TableHeader className="bg-slate-100/95 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-right font-bold text-slate-800">الاسم الكامل</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">اسم المستخدم</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">الدور والفئة</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">المنفذ / الإدارة</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">آخر دخول</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">الحالة</TableHead>
                      {canManageUsers && <TableHead className="text-center font-bold text-slate-800">الإجراءات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {managedUsers.map(u => (
                      <TableRow key={u.id} className="hover:bg-slate-50">
                        <TableCell className="font-bold text-slate-900">
                          <div>
                            <p>{u.name}</p>
                            {u.militaryNumber && (
                              <p className="text-[11px] font-mono tabular-nums text-slate-500">عسكري: {u.militaryNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-primary">{u.username}</TableCell>
                        <TableCell className="text-xs">
                          <p className="font-bold text-slate-800">{u.role}</p>
                          <p className="text-[11px] text-slate-500">{getRoleCategoryLabel(u.role)}</p>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{u.portOrDepartment}</TableCell>
                        <TableCell className="font-mono tabular-nums text-xs text-slate-500">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-YE') : 'لم يسجل دخول'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-bold ${
                              u.status === 'نشط' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {u.status}
                          </span>
                        </TableCell>
                        {canManageUsers && (
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-600 hover:text-primary"
                                onClick={() => handleOpenEditUser(u)}
                                title="تعديل الحساب والدور"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                                onClick={() => {
                                  setResetPwUser(u);
                                  setNewPasswordInput('');
                                }}
                                title="تغيير كلمة المرور"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${u.status === 'نشط' ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                onClick={() => handleToggleUserStatus(u.id)}
                                title={u.status === 'نشط' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}
                              >
                                {u.status === 'نشط' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                              </Button>
                              {currentUser?.id !== u.id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-700 hover:bg-rose-50"
                                  onClick={() => handleDeleteManagedUser(u.id)}
                                  title="حذف الحساب"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Permissions Matrix */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/70 border-b">
              <CardTitle className="text-base">مصفوفة الصلاحيات المعتمدة حسب الدور الوظيفي</CardTitle>
              <CardDescription>
                مقارنة فورية لصلاحيات المشرفين، ضباط المنافذ، وموظفي إدخال البيانات في المنظومة
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="adaptive-table-container">
                <Table>
                  <TableHeader className="bg-slate-100/80">
                    <TableRow>
                      <TableHead className="text-right font-bold text-slate-800 min-w-[220px]">الصلاحية</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">مدير عام / مدير إدارة</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">رئيس قسم</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">محقق أول / ضابط منفذ</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">محقق ميداني</TableHead>
                      <TableHead className="text-center font-bold text-slate-800">موظف إدخال بيانات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PERMISSION_DEFINITIONS.map(perm => (
                      <TableRow key={perm.key} className="hover:bg-slate-50">
                        <TableCell>
                          <p className="text-xs font-bold text-slate-900">{perm.label}</p>
                          <p className="text-[11px] text-slate-500">{perm.description}</p>
                        </TableCell>
                        {(['مدير عام', 'رئيس قسم', 'محقق أول', 'محقق ميداني', 'موظف إدخال بيانات'] as SovereignUserRole[]).map(role => {
                          const allowed = (ROLE_PERMISSIONS[role] || []).includes(perm.key);
                          return (
                            <TableCell key={role} className="text-center">
                              {allowed ? (
                                <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                              ) : (
                                <X className="h-4 w-4 text-slate-300 mx-auto" />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: Sovereign Audit Logs Console */}
      {activeTab === 'audit' && canViewAuditLogs && (
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/70 border-b">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileSearch className="h-5 w-5 text-primary" />
                    سجلات التدقيق والرقابة الأمنية (Audit Logs)
                  </CardTitle>
                  <CardDescription>
                    توثيق آلي غير قابل للتعديل لعمليات الدخول، المحاولات الفاشلة، تعديلات المسافرين، وتنبيهات OCR الأمنية
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuditLogs(getAuditLogs())}
                    className="gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="h-4 w-4" />
                    تحديث
                  </Button>
                  {canExport && (
                    <Button
                      size="sm"
                      onClick={handleExportAuditCsv}
                      className="bg-primary text-white gap-1.5 whitespace-nowrap"
                    >
                      <Download className="h-4 w-4" />
                      تصدير Excel
                    </Button>
                  )}
                </div>
              </div>

              {/* Filter toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-3">
                <div className="sm:col-span-2 relative">
                  <Search className="h-4 w-4 text-slate-400 absolute right-3 top-2.5" />
                  <Input
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    placeholder="بحث باسم المستخدم، الضابط، المنفذ، أو التفاصيل..."
                    className="pr-9 bg-white text-right text-xs"
                  />
                </div>
                <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="نوع الإجراء" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="الكل">كل الإجراءات ({auditLogs.length})</SelectItem>
                    {auditActionsList.map(act => (
                      <SelectItem key={act} value={act}>{act}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={auditModuleFilter} onValueChange={setAuditModuleFilter}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="الوحدة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="الكل">كل الوحدات</SelectItem>
                    {auditModulesList.map(mod => (
                      <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="adaptive-table-container max-h-[60vh]">
                <Table>
                  <TableHeader className="bg-slate-100/95 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-right font-bold text-slate-800">التوقيت</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">المستخدم والدور</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">الإجراء</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">الوحدة</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">التفاصيل</TableHead>
                      <TableHead className="text-right font-bold text-slate-800">المنفذ / الجهاز</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditLogs.slice(0, 150).map(log => {
                      const isSecurityWarn =
                        log.action === 'محاولة دخول فاشلة' ||
                        log.action === 'تنبيه أمني OCR' ||
                        log.action === 'حذف';
                      return (
                        <TableRow key={log.id} className="hover:bg-slate-50">
                          <TableCell className="font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString('ar-YE')}
                          </TableCell>
                          <TableCell className="text-xs">
                            <p className="font-bold text-slate-900">{log.officerName}</p>
                            <p className="text-[11px] text-slate-500">
                              <span className="font-mono">{log.officerUsername}</span> · {log.officerRole}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <span
                              className={`font-bold ${
                                isSecurityWarn
                                  ? 'text-rose-700'
                                  : log.action === 'تسجيل دخول' || log.action === 'إدارة صلاحيات'
                                    ? 'text-indigo-700'
                                    : 'text-slate-800'
                              }`}
                            >
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 whitespace-nowrap">{log.targetModule}</TableCell>
                          <TableCell className="text-xs text-slate-800 max-w-md">{log.details}</TableCell>
                          <TableCell className="text-[11px] text-slate-500">
                            <p className="truncate max-w-[180px]">{log.portOrDepartment}</p>
                            <p className="font-mono truncate max-w-[180px]">{log.ipAddress}</p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredAuditLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                          لا توجد سجلات مطابقة لمعايير التصفية الحالية.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: Security & Offline Integrity */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-slate-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <CardTitle>التشفير والأمان السيادي</CardTitle>
              </div>
              <CardDescription>معايير حماية البيانات الجنائية والمعلومات المقيدة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 border rounded-xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-slate-900">التحقق بالصلاحيات والأدوار (RBAC)</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    فصل تام بين صلاحيات المشرفين والقيادة، وضباط المنافذ والتحقيق، وموظفي الإدخال مع منع العمليات غير المصرح بها وتوثيقها.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border rounded-xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-slate-900">العمل الذاتي بدون إنترنت (Offline-First)</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    تجزئة كلمات المرور محلياً وتشغيل محركات OCR (Tesseract + ICAO MRZ) ومطابقة المطلوبين أمنياً بدون الحاجة لاتصال دائم.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border rounded-xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-slate-900">سجل العمليات والرقابة غير القابل للتعديل</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    توثيق كافة عمليات الدخول والإضافة والتعديل والحذف وتنبيهات التطابق الأمني آلياً بهوية الضابط والتوقيت.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle>الهيكلية المركزية للنظام</CardTitle>
              </div>
              <CardDescription>ارتباط الفروع بالمقر الرئيسي بصنعاء</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs leading-relaxed text-slate-700">
              <p>
                <strong>المركز الرئيسي:</strong> العاصمة صنعاء - رئاسة مصلحة الهجرة والجوازات والجنسية.
              </p>
              <p>
                <strong>نطاق الصلاحية:</strong> السيطرة والرقابة على كافة المنافذ البرية (الوديعة، شحن، صرفيت، علب، الطوال) والجوية (صنعاء، عدن، الريان، سيئون، الغيضة، سقطرى، الحديدة) والبحرية (عدن، الحديدة، المكلا، نشطون، الصليف، المخا).
              </p>
              <p>
                <strong>سجل التدقيق النشط:</strong> يحتوي حالياً على{' '}
                <span className="font-mono tabular-nums font-bold">{auditLogs.length}</span> عملية موثقة.
              </p>
            </CardContent>
          </Card>

          {/* Sovereign High-Capacity IndexedDB Storage Diagnostics & Optimization */}
          <Card className="rounded-2xl border-slate-200 md:col-span-2">
            <CardHeader className="bg-slate-50/70 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-indigo-600" />
                  <div>
                    <CardTitle className="text-base">محرك التخزين السيادي عالي السعة (IndexedDB)</CardTitle>
                    <CardDescription>
                      قاعدة بيانات محلية عالية السعة تتجاوز قيد الـ 5 ميجابايت في المتصفح وتخزن آلاف المسافرين والمذكرات والصور دون امتلاء
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleOptimizeStorage}
                  disabled={isOptimizingStorage}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`h-4 w-4 ${isOptimizingStorage ? 'animate-spin' : ''}`} />
                  ضغط وتحسين قاعدة التخزين الآن
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {storageStats ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border bg-slate-50">
                      <p className="text-slate-500">حالة محرك التخزين</p>
                      <p className={`font-bold mt-1 ${storageStats.idbReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {storageStats.idbReady ? 'IndexedDB مفعل (سعة مفتوحة)' : 'الوضع المخبئي البديل'}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl border bg-slate-50">
                      <p className="text-slate-500">إجمالي حجم البيانات المخزنة</p>
                      <p className="font-mono tabular-nums font-bold text-slate-900 mt-1">
                        {formatBytesArabic(storageStats.totalBytes)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl border bg-slate-50">
                      <p className="text-slate-500">المساحة المحجوزة في localStorage</p>
                      <p className="font-mono tabular-nums font-bold text-emerald-700 mt-1">
                        {formatBytesArabic(storageStats.localStorageBytes)} (مفرغ للجلسة)
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl border bg-slate-50">
                      <p className="text-slate-500">الحصة المتاحة بالمتصفح</p>
                      <p className="font-mono tabular-nums font-bold text-slate-900 mt-1">
                        {storageStats.browserQuotaBytes ? formatBytesArabic(storageStats.browserQuotaBytes) : 'تلقائي (مئات الميجابايت)'}
                      </p>
                    </div>
                  </div>

                  {storageStats.breakdown.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-100/80">
                          <TableRow>
                            <TableHead className="text-right font-bold text-xs">قاعدة البيانات / الوحدة</TableHead>
                            <TableHead className="text-center font-bold text-xs">عدد السجلات</TableHead>
                            <TableHead className="text-left font-bold text-xs">الحجم المستخدم</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {storageStats.breakdown.map(item => (
                            <TableRow key={item.key}>
                              <TableCell className="text-xs font-semibold text-slate-800">{item.label}</TableCell>
                              <TableCell className="text-center font-mono tabular-nums text-xs text-slate-600">
                                {item.count !== undefined ? item.count.toLocaleString('en-US') : '-'}
                              </TableCell>
                              <TableCell className="text-left font-mono tabular-nums text-xs font-bold text-slate-900">
                                {formatBytesArabic(item.bytes)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">جاري قراءة إحصائيات التخزين السيادي...</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog: Add / Edit Officer */}
      <Dialog open={officerDialogOpen} onOpenChange={setOfficerDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>{editingOfficer ? 'تعديل بيانات الضابط / المسؤول' : 'إدراج ضابط منفذ جديد'}</DialogTitle>
            <DialogDescription>
              أدخل بيانات الضابط الحقيقية لحفظها في سجل المنافذ واستخدامها في التقارير ومحاضر الضبط.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-1">
                <label className="text-slate-700 font-bold block mb-1">الرتبة:</label>
                <Select value={officerForm.rank} onValueChange={v => setOfficerForm({ ...officerForm, rank: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="ملازم ثاني">ملازم ثاني</SelectItem>
                    <SelectItem value="ملازم أول">ملازم أول</SelectItem>
                    <SelectItem value="نقيب">نقيب</SelectItem>
                    <SelectItem value="رائد">رائد</SelectItem>
                    <SelectItem value="مقدم">مقدم</SelectItem>
                    <SelectItem value="عقيد">عقيد</SelectItem>
                    <SelectItem value="عميد">عميد</SelectItem>
                    <SelectItem value="لواء">لواء</SelectItem>
                    <SelectItem value="مساعد">مساعد</SelectItem>
                    <SelectItem value="صف ضابط">صف ضابط</SelectItem>
                    <SelectItem value="موظف مدني">موظف مدني</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-slate-700 font-bold block mb-1">الاسم الكامل للضابط:</label>
                <Input
                  value={officerForm.name}
                  onChange={e => setOfficerForm({ ...officerForm, name: e.target.value })}
                  placeholder="أدخل الاسم الرباعي واللقب..."
                  className="text-right font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-700 font-bold block mb-1">المنفذ / الإدارة التابع لها:</label>
              <Select value={officerForm.portOrCenter} onValueChange={v => setOfficerForm({ ...officerForm, portOrCenter: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {allAvailablePorts.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-slate-700 font-bold block mb-1">المهمة / المسمى:</label>
                <Select value={officerForm.role} onValueChange={v => setOfficerForm({ ...officerForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="ضابط منفذ">ضابط منفذ</SelectItem>
                    <SelectItem value="مشرف نوبة">مشرف نوبة</SelectItem>
                    <SelectItem value="محقق مباينة أمنية">محقق مباينة أمنية</SelectItem>
                    <SelectItem value="فاحص وثائق وجوازات">فاحص وثائق وجوازات</SelectItem>
                    <SelectItem value="مدير إدارة">مدير إدارة</SelectItem>
                    <SelectItem value="مدير عام">مدير عام</SelectItem>
                    <SelectItem value="ضابط إحصاء وتقارير">ضابط إحصاء وتقارير</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">الرقم العسكري (إن وجد):</label>
                <Input
                  value={officerForm.militaryNumber}
                  onChange={e => setOfficerForm({ ...officerForm, militaryNumber: e.target.value })}
                  placeholder="مثال: 10482"
                  className="text-right font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-slate-700 font-bold block mb-1">رقم الهاتف / اللاسلكي:</label>
                <Input
                  value={officerForm.phone}
                  onChange={e => setOfficerForm({ ...officerForm, phone: e.target.value })}
                  placeholder="77xxxxxxx"
                  className="text-right font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">حالة الضابط:</label>
                <Select value={officerForm.status} onValueChange={v => setOfficerForm({ ...officerForm, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="نشط">نشط وعلى رأس العمل</SelectItem>
                    <SelectItem value="في إجازة">في إجازة</SelectItem>
                    <SelectItem value="منقول">منقول لمنفذ آخر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <input
                type="checkbox"
                id="isDuty"
                checked={officerForm.isCurrentDutyOfficer}
                onChange={e => setOfficerForm({ ...officerForm, isCurrentDutyOfficer: e.target.checked })}
                className="rounded border-slate-300 h-4 w-4 text-primary"
              />
              <label htmlFor="isDuty" className="text-xs text-slate-800 font-semibold cursor-pointer">
                تعيين هذا الضابط كـ &quot;الضابط المناوب الحالي&quot; في النظام والتقارير المطبوعة
              </label>
            </div>
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setOfficerDialogOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
            <Button onClick={handleSaveOfficer} className="bg-primary hover:bg-primary/90 text-white font-bold w-full sm:w-auto">
              حفظ بيانات الضابط
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add / Edit Managed RBAC User */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle>{editingManagedUser ? 'تعديل حساب المستخدم والصلاحيات' : 'إنشاء حساب مستخدم جديد'}</DialogTitle>
            <DialogDescription>
              حدد الدور الوظيفي والمنفذ المخصص للمستخدم لضبط صلاحيات الوصول والتدقيق.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">الاسم الكامل *</label>
                <Input
                  value={userForm.name}
                  onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="الرتبة / الاسم الكامل"
                  className="text-right"
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">اسم المستخدم للدخول *</label>
                <Input
                  value={userForm.username}
                  onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="مثال: officer_wadiah"
                  className="text-left font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">
                  {editingManagedUser ? 'كلمة المرور (اتركها فارغة للإبقاء)' : 'كلمة المرور *'}
                </label>
                <Input
                  type="password"
                  value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="text-right"
                />
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">الرقم العسكري</label>
                <Input
                  value={userForm.militaryNumber}
                  onChange={e => setUserForm({ ...userForm, militaryNumber: e.target.value })}
                  placeholder="اختياري"
                  className="text-right font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-700 font-bold block mb-1">الدور والصلاحية</label>
                <Select value={userForm.role} onValueChange={v => setUserForm({ ...userForm, role: v as SovereignUserRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {SOVEREIGN_ROLES.map(r => (
                      <SelectItem key={r} value={r}>
                        {r} ({getRoleCategoryLabel(r)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-slate-700 font-bold block mb-1">حالة الحساب</label>
                <Select value={userForm.status} onValueChange={v => setUserForm({ ...userForm, status: v as 'نشط' | 'موقوف' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="نشط">نشط (مصرح بالدخول)</SelectItem>
                    <SelectItem value="موقوف">موقوف مؤقتاً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-slate-700 font-bold block mb-1">المنفذ / الإدارة المخصصة</label>
              <Select value={userForm.portOrDepartment} onValueChange={v => setUserForm({ ...userForm, portOrDepartment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {allAvailablePorts.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveUser} className="bg-primary text-white font-bold">حفظ الحساب</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Reset Password */}
      <Dialog open={!!resetPwUser} onOpenChange={open => !open && setResetPwUser(null)}>
        <DialogContent className="max-w-sm w-[94vw] text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              تعيين كلمة مرور جديدة للحساب: <strong>{resetPwUser?.name}</strong> ({resetPwUser?.username})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="password"
              value={newPasswordInput}
              onChange={e => setNewPasswordInput(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة (4 أحرف فأكثر)"
              className="text-right"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetPwUser(null)}>إلغاء</Button>
            <Button onClick={handleConfirmResetPassword} className="bg-primary text-white font-bold">تحديث كلمة المرور</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
