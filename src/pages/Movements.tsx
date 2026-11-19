import { useState, useEffect, useMemo } from 'react';
import { Movement } from '@/lib/types';
import { getMovements, saveMovements, generateId } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Truck, LogOut, LogIn, Clock, User, Filter, Trash2, Download, FileJson, FileText, Save, Bike, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteConfirmation } from '@/components/DeleteConfirmation';
import { exportToExcel, exportToPDF, exportToWord, handlePrint } from '@/lib/exportUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { checkDuplicateEntry, clearFormDraft, loadFormDraft, saveFormDraft } from '@/lib/formIntelligence';
import {
  DraftRecoveryBanner,
  handleEnterAdvanceFocus,
  LiveFormAlertsBanner,
  SearchableCombobox
} from '@/components/SmartFormControls';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { MapsGroundingModal } from '@/components/MapsGroundingPanel';

const MOVEMENT_DRAFT_KEY = 'movement_new_v1';

const emptyMovement = (): Partial<Movement> => ({
  type: 'طقم',
  plateNumber: '',
  driverName: '',
  personnelCount: 1,
  mission: '',
  departureTime: new Date().toISOString().slice(0, 16),
  expectedReturnTime: '',
  status: 'خروج'
});

const Movements = () => {
  const [movements, setMovements] = useState(getMovements);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [form, setForm] = useState<Partial<Movement>>(emptyMovement());
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('الكل');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ data: Partial<Movement>; savedAt: string } | null>(null);
  const [mapsModalOpen, setMapsModalOpen] = useState(false);
  const { toast } = useToast();

  // Historical suggestions for quick counter data entry
  const plateOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; meta: string }>();
    movements.forEach((m) => {
      if (m.plateNumber && !map.has(m.plateNumber)) {
        map.set(m.plateNumber, {
          value: m.plateNumber,
          label: m.plateNumber,
          meta: `${m.type} — ${m.driverName}`
        });
      }
    });
    return Array.from(map.values());
  }, [movements]);

  const driverOptions = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      if (m.driverName) set.add(m.driverName);
    });
    return Array.from(set);
  }, [movements]);

  // Auto-save new movement draft
  useEffect(() => {
    if (!open || editing) return;
    if (form.plateNumber || form.driverName || form.mission) {
      saveFormDraft(MOVEMENT_DRAFT_KEY, form);
    }
  }, [open, editing, form]);

  // Live active vehicle duplicate check
  const activeVehicleCheck = useMemo(() => {
    if (!open || !form.plateNumber || form.status === 'عودة') return { isDuplicate: false };
    return checkDuplicateEntry('movement_active', form.plateNumber, editing?.id);
  }, [open, form.plateNumber, form.status, editing?.id]);

  const setExpectedReturnHours = (hours: number) => {
    const base = form.departureTime ? new Date(form.departureTime) : new Date();
    const target = new Date((isNaN(base.getTime()) ? Date.now() : base.getTime()) + hours * 3600000);
    // format YYYY-MM-DDTHH:mm in local timezone offset
    const offsetMs = target.getTimezoneOffset() * 60000;
    const localIso = new Date(target.getTime() - offsetMs).toISOString().slice(0, 16);
    setForm((prev) => ({ ...prev, expectedReturnTime: localIso }));
  };

  const filtered = movements
    .filter((m) => {
      const searchMatch = m.plateNumber.includes(search) || m.driverName.includes(search) || m.mission.includes(search);
      const typeMatch = filterType === 'الكل' || m.type === filterType;
      const statusMatch = filterStatus === 'الكل' || m.status === filterStatus;
      return searchMatch && typeMatch && statusMatch;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const save = () => {
    if (!form.plateNumber || !form.driverName) {
      toast({ title: 'خطأ', description: 'رقم اللوحة واسم السائق مطلوبان', variant: 'destructive' });
      return;
    }

    const now = new Date().toISOString();
    let updated: Movement[];

    if (editing) {
      updated = movements.map((m) => (m.id === editing.id ? ({ ...m, ...form, updatedAt: now } as Movement) : m));
    } else {
      updated = [...movements, { ...form, id: generateId(), createdAt: now, updatedAt: now } as Movement];
      clearFormDraft(MOVEMENT_DRAFT_KEY);
    }

    saveMovements(updated);
    setMovements(updated);
    setOpen(false);
    setForm(emptyMovement());
    setEditing(null);
    toast({ title: 'تم حفظ الحركة' });
  };

  const handleReturnAction = (m: Movement) => {
    const actualReturnTime = new Date().toISOString().slice(0, 16);
    const updated = movements.map((item) =>
      item.id === m.id ? { ...item, status: 'عودة' as const, actualReturnTime, updatedAt: new Date().toISOString() } : item
    );
    saveMovements(updated);
    setMovements(updated);
    toast({ title: 'تم تسجيل العودة', description: `تم تسجيل عودة ${m.type} رقم ${m.plateNumber}` });
  };

  const deleteMovement = (id: string) => {
    setMovementToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!movementToDelete) return;
    const updated = movements.filter((m) => m.id !== movementToDelete);
    saveMovements(updated);
    setMovements(updated);
    setDeleteConfirmOpen(false);
    setMovementToDelete(null);
    toast({ title: 'تم الحذف' });
  };

  const openNewModal = () => {
    setEditing(null);
    setForm(emptyMovement());
    setPendingDraft(loadFormDraft<Partial<Movement>>(MOVEMENT_DRAFT_KEY));
    setOpen(true);
  };

  const openEdit = (m: Movement) => {
    setEditing(m);
    setForm(m);
    setPendingDraft(null);
    setOpen(true);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-primary">حركة الأطقم والدراجات</h1>
          <p className="text-muted-foreground mt-1">تسجيل تحركات الأطقم والدراجات النارية والمهام الأمنية</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 whitespace-nowrap shrink-0">
                <Download className="h-4 w-4" /> تصدير
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" dir="rtl">
              <DropdownMenuItem onClick={() => exportToExcel(filtered, 'حركة_الأطقم')}>
                <FileJson className="h-4 w-4 ml-2 text-green-600" /> Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToPDF('movements-table', 'حركة_الأطقم')}>
                <FileText className="h-4 w-4 ml-2 text-red-600" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openNewModal} className="gap-2 whitespace-nowrap shrink-0">
            <Plus className="h-5 w-5" /> تسجيل حركة جديدة
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-muted/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-0 w-full sm:min-w-[260px]">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث برقم اللوحة، السائق، أو المهمة..."
                className="pr-10 text-right"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="text-right">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span>النوع: {filterType}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">كل الأنواع</SelectItem>
                  <SelectItem value="طقم">طقم</SelectItem>
                  <SelectItem value="دراجة نارية">دراجة نارية</SelectItem>
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="text-right">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>الحالة: {filterStatus}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="الكل">كل الحالات</SelectItem>
                  <SelectItem value="خروج">في المهمة (خروج)</SelectItem>
                  <SelectItem value="عودة">تمت العودة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Adaptive Vertical Cards */}
      <div className="md:hidden max-h-[65dvh] overflow-y-auto adaptive-scroll-region space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground text-xs">
            لا توجد سجلات حركة مطابقة
          </div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="bg-card rounded-xl border p-3.5 space-y-2 shadow-2xs text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  {m.type === 'طقم' ? (
                    <Truck className="h-4 w-4 text-blue-500" />
                  ) : m.type === 'دراجة نارية' ? (
                    <Bike className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Plus className="h-4 w-4 text-slate-500" />
                  )}
                  <span>{m.type}</span>
                  <span className="font-mono text-primary">({m.plateNumber})</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    m.status === 'خروج' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  {m.status === 'خروج' ? <LogOut className="h-3 w-3" /> : <LogIn className="h-3 w-3" />}
                  {m.status === 'خروج' ? 'في مهمة' : 'عاد'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-muted/40 p-2 rounded-lg text-[11px]">
                <div className="truncate">
                  السائق: <strong>{m.driverName}</strong>
                </div>
                <div>
                  القوة: <strong>{m.personnelCount} أفراد</strong>
                </div>
                <div className="col-span-2 truncate">المهمة: {m.mission}</div>
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1 border-t">
                {m.status === 'خروج' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReturnAction(m)}
                    className="h-8 border-green-200 text-green-600 hover:bg-green-50 flex-1 text-xs"
                  >
                    إثبات عودة
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-primary text-xs px-3" onClick={() => openEdit(m)}>
                  تعديل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive border-rose-200 px-2.5"
                  onClick={() => deleteMovement(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Bounded Sticky Table */}
      <div className="hidden md:block bg-card rounded-xl shadow-md border adaptive-table-container" id="movements-table">
        <Table className="min-w-[800px] w-full">
          <TableHeader className="bg-muted/95 backdrop-blur-xs sticky top-0 z-10 shadow-2xs">
            <TableRow>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">رقم اللوحة</TableHead>
              <TableHead className="text-right">السائق</TableHead>
              <TableHead className="text-right">القوة</TableHead>
              <TableHead className="text-right">المهمة</TableHead>
              <TableHead className="text-right">وقت الخروج</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right no-print">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-20 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Truck className="h-12 w-12 opacity-20" />
                    <p>لا توجد سجلات حركة مطابقة</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/30 transition-colors group">
                  <TableCell className="text-right font-medium">
                    <div className="flex items-center gap-2">
                      {m.type === 'طقم' ? (
                        <Truck className="h-4 w-4 text-blue-500" />
                      ) : m.type === 'دراجة نارية' ? (
                        <Bike className="h-4 w-4 text-orange-500" />
                      ) : (
                        <Plus className="h-4 w-4 text-slate-500" />
                      )}
                      {m.type}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{m.plateNumber}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.3 w-3.5 text-slate-400" />
                      <span>{m.driverName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{m.personnelCount} أفراد</TableCell>
                  <TableCell className="text-right max-w-[200px] truncate">{m.mission}</TableCell>
                  <TableCell className="text-right text-xs font-mono tabular-nums">
                    {new Date(m.departureTime).toLocaleString('ar-YE', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: '2-digit',
                      month: 'short'
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${
                        m.status === 'خروج' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {m.status === 'خروج' ? <LogOut className="h-3 w-3" /> : <LogIn className="h-3 w-3" />}
                      {m.status === 'خروج' ? 'في مهمة' : 'عاد'}
                    </span>
                  </TableCell>
                  <TableCell className="no-print">
                    <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {m.status === 'خروج' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReturnAction(m)}
                          className="h-8 border-green-200 text-green-600 hover:bg-green-50 px-2"
                        >
                          إثبات عودة
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => openEdit(m)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMovement(m.id)}>
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
        title="حذف سجل الحركة"
        description={`هل أنت متأكد من حذف سجل حركة ${movements.find((m) => m.id === movementToDelete)?.type} رقم ${movements.find((m) => m.id === movementToDelete)?.plateNumber}؟`}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl w-[95vw] max-h-[92dvh] p-0 flex flex-col overflow-hidden"
          dir="rtl"
          onKeyDown={handleEnterAdvanceFocus}
        >
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
            <DialogTitle className="text-right">{editing ? 'تعديل سجل الحركة' : 'تسجيل حركة جديدة'}</DialogTitle>
            <DialogDescription className="text-right">
              تحقق آلي من المركبات التي لا تزال في مهمة خروج مع اقتراحات السائقين والعودة السريعة.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-4 sm:p-5 space-y-4">
            {pendingDraft && !editing && (
              <DraftRecoveryBanner
                savedAt={pendingDraft.savedAt}
                onRestore={() => {
                  setForm(pendingDraft.data);
                  setPendingDraft(null);
                  toast({ title: 'تم استرجاع مسودة الحركة' });
                }}
                onDiscard={() => {
                  clearFormDraft(MOVEMENT_DRAFT_KEY);
                  setPendingDraft(null);
                }}
              />
            )}

            <LiveFormAlertsBanner
              duplicateCheck={activeVehicleCheck}
              onOpenExistingDuplicate={(existingId) => {
                const hit = movements.find((m) => m.id === existingId);
                if (hit) openEdit(hit);
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">النوع</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="طقم">طقم عسكري</SelectItem>
                    <SelectItem value="دراجة نارية">دراجة نارية</SelectItem>
                    <SelectItem value="أخرى">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">رقم اللوحة / المعرف *</label>
                <SearchableCombobox
                  value={form.plateNumber || ''}
                  onChange={(val) => {
                    const prevMove = movements.find((m) => m.plateNumber === val);
                    setForm((prev) => ({
                      ...prev,
                      plateNumber: val,
                      driverName: prev.driverName || prevMove?.driverName || '',
                      type: prevMove?.type || prev.type
                    }));
                  }}
                  options={plateOptions}
                  placeholder="أدخل أو اختر رقم اللوحة..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> اسم السائق *
                </label>
                <SearchableCombobox
                  value={form.driverName || ''}
                  onChange={(val) => setForm({ ...form, driverName: val })}
                  options={driverOptions}
                  placeholder="اختر سائق سابق أو أدخل اسماً جديداً..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">عدد الأفراد (القوة)</label>
                <Input
                  type="number"
                  value={form.personnelCount}
                  onChange={(e) => setForm({ ...form, personnelCount: parseInt(e.target.value, 10) || 1 })}
                  className="text-right font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5 col-span-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-700">المهمة / الوجهة</label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setMapsModalOpen(true)}
                      className="h-6 px-2 text-[11px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1 whitespace-nowrap shrink-0"
                    >
                      <Truck className="h-3 w-3" />
                      <span>تحقق المسار بالخرائط</span>
                    </Button>
                    <VoiceDictationButton
                      label="إملاء المهمة"
                      contextHint="مهمة وخط سير طقم أمني أو دراجة نارية"
                      onTranscript={(t) =>
                        setForm((prev) => ({
                          ...prev,
                          mission: prev.mission ? `${prev.mission} ${t}` : t,
                        }))
                      }
                    />
                  </div>
                </div>
                <Input
                  value={form.mission}
                  onChange={(e) => setForm({ ...form, mission: e.target.value })}
                  className="text-right"
                  placeholder="مثال: دورية تأمين / توصيل بريد / مأمورية منفذ..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> وقت الخروج
                </label>
                <Input
                  type="datetime-local"
                  value={form.departureTime}
                  onChange={(e) => setForm({ ...form, departureTime: e.target.value })}
                  className="text-right font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> العودة المتوقعة
                </label>
                <Input
                  type="datetime-local"
                  value={form.expectedReturnTime}
                  onChange={(e) => setForm({ ...form, expectedReturnTime: e.target.value })}
                  className="text-right font-mono"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[2, 6, 12, 24].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setExpectedReturnHours(hrs)}
                      className="px-2 py-1 text-[11px] rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium"
                    >
                      +{hrs} ساعة
                    </button>
                  ))}
                </div>
              </div>
              {editing && editing.status === 'عودة' && (
                <div className="space-y-1.5 col-span-full">
                  <label className="text-xs font-medium text-slate-700">نتائج العودة (المباينة)</label>
                  <Input
                    value={form.outcome}
                    onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                    placeholder="أدخل نتائج المهمة أو أي ملاحظات"
                    className="text-right"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 p-3.5 sm:p-4 border-t bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            {editing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 w-full sm:w-auto">
                    <Download className="h-4 w-4" /> تصدير
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent dir="rtl">
                  <DropdownMenuItem onClick={() => handlePrint()}>
                    <Printer className="h-4 w-4 ml-2" /> طباعة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToWord(`سجل حركة: ${editing.plateNumber}`, editing, `حركة_${editing.id}`)}>
                    <FileText className="h-4 w-4 ml-2 text-blue-600" /> Word
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button onClick={save} className="gap-2 w-full sm:w-auto">
              <Save className="h-4 w-4" /> حفظ الحركة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MapsGroundingModal
        isOpen={mapsModalOpen}
        onClose={() => setMapsModalOpen(false)}
        defaultQuery={form.mission || 'أقرب نقاط وخط سير دورية أمنية في صنعاء'}
        contextTitle="استعلام خط سير الأطقم والمهام الأمنية"
        onApplyRouteText={(txt) => setForm((prev) => ({ ...prev, mission: txt }))}
      />
    </div>
  );
};

export default Movements;
