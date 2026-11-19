import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  FileText,
  CheckCircle,
  Plane,
  ShieldCheck,
  Truck,
  Users,
  Sparkles,
  FileCheck,
  ArrowRight
} from 'lucide-react';
import { parseMofaDocument, MofaParsedResult } from '@/lib/mofaDocumentParser';
import {
  MofaVisaRequest,
  MofaBeneficiary,
  ForeignerResident,
  InternalMovementPermit
} from '@/lib/types';
import {
  addMofaRequest,
  getForeigners,
  saveForeigners,
  getMovementPermits,
  saveMovementPermits,
  generateId,
  getCurrentUser,
  addAuditLog
} from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { openUnifiedImport } from '@/lib/unifiedImportHub';

interface MofaDocumentProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (request: MofaVisaRequest) => void;
  initialSampleUrl?: string;
}

// Static sample PDFs removed to keep bundle lightweight (rely on direct file upload)
const PRELOADED_SAMPLES: Array<{
  name: string;
  filename: string;
  url: string;
  desc: string;
  tag: string;
}> = [];

export const MofaDocumentProcessorModal: React.FC<MofaDocumentProcessorModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [parsedResult, setParsedResult] = useState<MofaParsedResult | null>(null);

  // Auto-sync flags
  const [syncToForeigners, setSyncToForeigners] = useState(true);
  const [syncToPermits, setSyncToPermits] = useState(true);

  // Active step
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  // Trigger processing for a local File
  const handleProcessFile = async (file: File) => {
    setSelectedFileName(file.name);
    setLoading(true);
    setLoadingStep('جاري قراءة واستخراج النصوص والمرفقات من ملف PDF...');

    try {
      const result = await parseMofaDocument(file, file.name);
      setParsedResult(result);
      setStep('review');
      toast({
        title: 'تم استخراج وتحليل الملف بنجاح',
        description: `تم تصنيف الملف بنوع: ${result.request.requestType} (${result.docTypeLabel})`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'خطأ في معالجة الملف',
        description: 'تعذر استخراج بيانات الملف، يرجى المحاولة مجدداً',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Trigger processing for preloaded sample
  const handleSelectSample = async (sample: typeof PRELOADED_SAMPLES[0]) => {
    setSelectedFileName(sample.name);
    setLoading(true);
    setLoadingStep(`جاري جلب وتحليل ${sample.name}...`);

    try {
      const resp = await fetch(sample.url);
      const blob = await resp.blob();
      const file = new File([blob], sample.filename, { type: 'application/pdf' });
      const result = await parseMofaDocument(file, sample.filename);
      setParsedResult(result);
      setStep('review');
      toast({
        title: 'تم تحليل العينة بنجاح',
        description: `تم التعرف على: ${result.request.organization} - ${result.request.beneficiaries.length} مستفيد`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'خطأ في جلب النموذج',
        description: 'تعذر جلب ملف النموذج من المجلد المحلي',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Commit and save to system
  const handleSaveAndSync = () => {
    if (!parsedResult) return;

    const user = getCurrentUser();
    const req = parsedResult.request;

    // 1. Ensure Mofa Request is populated and valid
    const mofaReq: MofaVisaRequest = {
      ...req,
      id: req.id || generateId(),
      memoNumber: req.memoNumber || `MOFA-${Date.now().toString().slice(-6)}`,
      memoDate: req.memoDate || new Date().toISOString().split('T')[0],
      organization: req.organization || 'جهة غير محددة',
      requestType: req.requestType || 'طلب تأشيرة دخول',
      approvalStatus: 'معتمد رسمياً',
      securityClearanceStatus: 'معتمد',
      sourceFileName: selectedFileName || req.sourceFileName || 'وثيقة خارجية',
      createdAt: req.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    addMofaRequest(mofaReq);

    // 2. Auto-sync to Foreign Residents if requested
    let syncedForeignersCount = 0;
    if (syncToForeigners && mofaReq.beneficiaries.length > 0) {
      const currentForeigners = getForeigners();
      const newForeigners: ForeignerResident[] = [];

      mofaReq.beneficiaries.forEach((ben: MofaBeneficiary) => {
        const existing = currentForeigners.find(f => f.passportNumber.trim().toUpperCase() === ben.passportNumber.trim().toUpperCase());
        if (existing) {
          existing.notes = `${existing.notes || ''}\n[تحديث وزارة الخارجية - ${mofaReq.memoDate}]: مذكرة ${mofaReq.memoNumber} (${mofaReq.requestType}) لمنظمة ${mofaReq.organization}`;
          existing.reEntryVisaStatus = mofaReq.requestType.includes('تجديد') ? 'سارية' : existing.reEntryVisaStatus;
        } else {
          newForeigners.push({
            id: generateId(),
            fullName: ben.fullName || ben.fullNameEn || 'وافد أجنبي',
            passportNumber: ben.passportNumber,
            nationality: ben.nationality || 'أجنبي',
            employer: mofaReq.organization,
            residenceNumber: `إقامة-${ben.passportNumber.slice(-4)}`,
            entryPort: 'منفذ مطار عدن الدولي',
            entryDate: mofaReq.memoDate,
            residenceExpiryDate: ben.endDate || new Date(Date.now() + 365*24*3600*1000).toISOString().split('T')[0],
            profession: ben.profession || 'خبير إنساني',
            medicalExamResult: 'لائق طبياً',
            reEntryVisaStatus: 'سارية',
            securityClearanceStatus: 'معتمد',
            notes: `تمت الإضافة آلياً من مذكرة الخارجية رقم ${mofaReq.memoNumber} - المسمى: ${ben.profession || 'موظف بعثة'}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      });

      if (newForeigners.length > 0) {
        saveForeigners([...currentForeigners, ...newForeigners]);
        syncedForeignersCount = newForeigners.length;
      }
    }

    // 3. Auto-sync to Movement Permits if requested
    let syncedPermitCreated = false;
    if (syncToPermits && (mofaReq.requestType.includes('تنقل') || mofaReq.requestType.includes('تأشيرة') || mofaReq.flightDetails)) {
      const currentPermits = getMovementPermits();
      const firstBen = mofaReq.beneficiaries[0];
      const permitCode = `تصريح-خارجية-${Date.now().toString().slice(-4)}`;
      const newPermit: InternalMovementPermit = {
        id: generateId(),
        permitCode: permitCode,
        delegationName: firstBen ? `${firstBen.fullName} (وفريق ${mofaReq.organization})` : mofaReq.organization,
        organizationType: 'منظمة دولية (INGO)',
        authorizedRoute: mofaReq.flightDetails ? `${mofaReq.flightDetails.route || 'عدن -> صنعاء -> مأرب'}` : 'عدن -> مأرب -> صنعاء -> سيئون -> المخا',
        allowedCheckpoints: ['نقطة العلم', 'نقطة دوفس', 'نقطة يسلح'],
        vehicleDetails: [{ plate: mofaReq.dispatchDetails?.carPlate || 'أمم متحدة / منظمة', model: 'Toyota Land Cruiser', color: 'أبيض' }],
        delegationHead: firstBen ? firstBen.fullName : mofaReq.organization,
        passportNumber: firstBen ? firstBen.passportNumber : 'وفق المانيفست',
        passengersCount: mofaReq.beneficiaries.length || 1,
        securityEscortNeeded: false,
        validFrom: mofaReq.memoDate,
        validTo: firstBen?.endDate || new Date(Date.now() + 30*24*3600*1000).toISOString().split('T')[0],
        accommodationPlace: 'مقر المنظمة الرسمي / الفندق المعتمد',
        qrVerificationCode: `PERMIT:${permitCode}:${mofaReq.organization}`,
        approvalStatus: 'معتمد رسمياً',
        approvedBy: user?.name || 'مدير عام الرقابة والمنافذ',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      saveMovementPermits([...currentPermits, newPermit]);
      syncedPermitCreated = true;
    }

    // Audit log
    addAuditLog('إنشاء', 'تصاريح التنقل', `اعتماد مذكرة الخارجية ${mofaReq.memoNumber} (${mofaReq.organization}) بعدد مستفيدين: ${mofaReq.beneficiaries.length}`, mofaReq.id);

    toast({
      title: 'تم إيداع المذكرة وتوزيع بياناتها بنجاح',
      description: `تم الحفظ في سجل الخارجية ${syncedForeignersCount > 0 ? `+ إيداع ${syncedForeignersCount} وافد في سجل الأجانب` : ''} ${syncedPermitCreated ? '+ إصدار تصريح تنقل رسمي' : ''}`,
    });

    if (onSuccess) onSuccess(mofaReq);
    onClose();
    setStep('upload');
    setParsedResult(null);
  };

  const req = parsedResult?.request;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] p-0 flex flex-col overflow-hidden font-sans text-right" dir="rtl">
        <DialogHeader className="p-3.5 sm:p-5 border-b bg-muted/20 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pl-8 sm:pl-10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-primary/10 rounded-xl text-primary shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-xl font-bold text-slate-900 truncate">
                  المحلل الذكي لمذكرات الخارجية والمنظمات والرحلات (PDF AI Parser)
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-slate-500">
                  تحليل مذكرات التأشيرات والإقامات، كشوفات ركاب الطيران الإنساني، وإرساليات الجوازات بدقة سيادية
                </DialogDescription>
              </div>
            </div>
            {step === 'review' && (
              <Button variant="outline" size="sm" onClick={() => setStep('upload')} className="shrink-0 w-full sm:w-auto">
                <ArrowRight className="w-4 h-4 ml-1" />
                تحميل ملف آخر
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden adaptive-scroll-region p-3.5 sm:p-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Sparkles className="w-6 h-6 text-primary absolute inset-0 m-auto" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-slate-800">جاري التحليل الذكي للوثيقة</h3>
                <p className="text-sm text-slate-500">{loadingStep}</p>
              </div>
            </div>
          ) : step === 'upload' ? (
          <div className="space-y-6 py-2">
            {/* Drag & Drop Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                if (dropped.length > 1) {
                  openUnifiedImport({ category: 'visa', files: dropped, sourceTitle: 'مذكرات وتأشيرات الخارجية' });
                  onClose();
                } else if (dropped[0]) {
                  handleProcessFile(dropped[0]);
                }
              }}
              className="border-2 border-dashed border-slate-300 hover:border-primary/60 hover:bg-primary/5 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files ? Array.from(e.target.files) : [];
                  if (chosen.length > 1) {
                    openUnifiedImport({ category: 'visa', files: chosen, sourceTitle: 'مذكرات وتأشيرات الخارجية' });
                    e.target.value = '';
                    onClose();
                  } else if (chosen[0]) {
                    handleProcessFile(chosen[0]);
                  }
                }}
              />
              <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                اسحب وأفلت مذكرة الخارجية أو مانيفست الطيران (PDF) هنا
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                أو انقر لاختيار الملف من جهازك (يدعم ملفات PDF الممسوحة ضوئياً والمذكرات النصية)
              </p>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="secondary" className="text-xs">مذكرات الخارجية</Badge>
                <Badge variant="secondary" className="text-xs">تأشيرات وإقامات</Badge>
                <Badge variant="secondary" className="text-xs">مانيفست طيران</Badge>
                <Badge variant="secondary" className="text-xs">إرساليات نقل الجوازات</Badge>
              </div>
            </div>

            {/* Preloaded Samples Gallery */}
            {PRELOADED_SAMPLES.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  نماذج المذكرات والملفات المرفقة الجاهزة للتحليل الفوري ({PRELOADED_SAMPLES.length} نموذجاً):
                </h4>
                <span className="text-xs text-slate-500">انقر للتحليل الفوري بنقرة واحدة</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto p-1">
                {PRELOADED_SAMPLES.map((sample, idx) => (
                  <Card
                    key={idx}
                    onClick={() => handleSelectSample(sample)}
                    className="hover:border-primary/50 hover:shadow-sm cursor-pointer transition-all border-slate-200"
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-700 shrink-0 mt-0.5">
                        <FileCheck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h5 className="font-bold text-xs text-slate-900 truncate">{sample.name}</h5>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 bg-slate-50">
                            {sample.tag}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {sample.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            )}
          </div>
        ) : (
          /* Review and verification step */
          <div className="space-y-5 py-2">
            {/* Header Result Banner */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950 text-base">
                    تم استخراج وتحليل بيانات الوثيقة بدقة
                  </h4>
                  <p className="text-xs text-emerald-700">
                    نوع الوثيقة: <span className="font-semibold">{req?.requestType}</span> | المنظمة: <span className="font-semibold">{req?.organization}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {parsedResult?.docTypeLabel}
                </Badge>
                <Badge variant="outline" className="bg-white">
                  {req?.beneficiaries.length || 0} مستفيد / راكب
                </Badge>
              </div>
            </div>

            {/* Editable Form Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">رقم المذكرة / المرجع</label>
                <Input
                  value={req?.memoNumber || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setParsedResult(prev => prev ? { ...prev, request: { ...prev.request, memoNumber: val } } : null);
                  }}
                  className="bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">تاريخ المذكرة</label>
                <Input
                  value={req?.memoDate || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setParsedResult(prev => prev ? { ...prev, request: { ...prev.request, memoDate: val } } : null);
                  }}
                  className="bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">الجهة / المنظمة</label>
                <Input
                  value={req?.organization || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setParsedResult(prev => prev ? { ...prev, request: { ...prev.request, organization: val } } : null);
                  }}
                  className="bg-white"
                />
              </div>
            </div>

            {/* Beneficiaries Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  المستفيدون / الركاب / أصحاب الجوازات المستخرجون ({req?.beneficiaries.length || 0})
                </h5>
              </div>

              {/* Mobile Adaptive Vertical Cards */}
              <div className="md:hidden border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto adaptive-scroll-region divide-y divide-slate-100 bg-white">
                {req?.beneficiaries.map((b: MofaBeneficiary, idx: number) => (
                  <div key={idx} className="p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{b.fullName}</span>
                      <Badge variant="outline" className="text-[10px] py-0 shrink-0">{b.nationality}</Badge>
                    </div>
                    {b.fullNameEn && <div className="text-[10px] text-slate-500">{b.fullNameEn}</div>}
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-lg text-slate-600">
                      <div>الجواز: <strong className="font-mono text-primary">{b.passportNumber}</strong></div>
                      <div>المهنة: {b.profession || 'خبير / موظف'}</div>
                    </div>
                  </div>
                ))}
                {(!req?.beneficiaries || req.beneficiaries.length === 0) && (
                  <div className="text-center py-6 text-slate-400 text-xs">لا توجد أسماء مستخرجة في هذا القسم</div>
                )}
              </div>

              {/* Desktop Bounded Sticky Table */}
              <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-auto adaptive-scroll-region">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">الاسم الكامل</th>
                      <th className="p-2.5">رقم الجواز</th>
                      <th className="p-2.5">الجنسية</th>
                      <th className="p-2.5">المسمى الوظيفي / الدور</th>
                      <th className="p-2.5">فترة المهمة / الوجهة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {req?.beneficiaries.map((b: MofaBeneficiary, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">
                          {b.fullName}
                          {b.fullNameEn && (
                            <span className="block text-[10px] text-slate-500 font-normal">{b.fullNameEn}</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-semibold text-primary">{b.passportNumber}</td>
                        <td className="p-2.5">
                          <Badge variant="outline" className="text-[10px] py-0">
                            {b.nationality}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-slate-600">{b.profession || 'خبير / موظف'}</td>
                        <td className="p-2.5 text-slate-500">
                          {b.missionDuration || b.workLocation || 'اليمن'}
                        </td>
                      </tr>
                    ))}
                    {(!req?.beneficiaries || req.beneficiaries.length === 0) && (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-400">
                          لا توجد أسماء مستخرجة في هذا القسم
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Flight or Dispatch Details if applicable */}
            {req?.flightDetails && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                  <Plane className="w-4 h-4 text-blue-700" />
                  بيانات رحلة الطيران المكتشفة:
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-800">
                  <div><strong>نداء الرحلة:</strong> {req.flightDetails.callSign || 'MSF Flight'}</div>
                  <div><strong>المسار:</strong> {req.flightDetails.route || 'صنعاء - عدن'}</div>
                  <div><strong>تاريخ الرحلة:</strong> {req.flightDetails.flightDate || req.memoDate}</div>
                  <div><strong>طراز الطائرة:</strong> {req.flightDetails.aircraftType || 'Dash-8'}</div>
                </div>
              </div>
            )}

            {req?.dispatchDetails && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <Truck className="w-4 h-4 text-amber-700" />
                  بيانات إرسالية ونقل الجوازات المكتشفة:
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-amber-800">
                  <div><strong>شركة النقل:</strong> {req.dispatchDetails.companyName}</div>
                  <div><strong>رقم اللوحة / المركبة:</strong> {req.dispatchDetails.carPlate || 'حافلة نقل'}</div>
                  <div><strong>السائق / المندوب:</strong> {req.dispatchDetails.driverName || 'مندوب الشركة'}</div>
                  <div><strong>إجمالي الجوازات:</strong> {req.dispatchDetails.passportsCount || req.beneficiaries.length} جواز سفر</div>
                </div>
              </div>
            )}

            {/* MOFA Directive Text */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                التوجيه الوزاري الرسمي / نص القرار السيادي
              </label>
              <textarea
                value={req?.mofaDirective || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setParsedResult(prev => prev ? { ...prev, request: { ...prev.request, mofaDirective: val } } : null);
                }}
                rows={2}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
            </div>

            {/* Sovereign Auto-Sync Options */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <h6 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary" />
                خيارات التوزيع السيادي الذكي (Smart Cross-Module Routing):
              </h6>
              <div className="flex flex-col sm:flex-row gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToForeigners}
                    onChange={(e) => setSyncToForeigners(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span>إيداع الأسماء الأجنبية في <strong>سجل الوافدين الأجانب</strong> (Foreigners Registry)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToPermits}
                    onChange={(e) => setSyncToPermits(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span>إصدار <strong>تصريح تنقل وتحرك رسمي</strong> فوري مع باركود QR</span>
                </label>
              </div>
            </div>

            </div>
          )}
        </div>

        {/* Pinned Always-Visible Footer */}
        <div className="shrink-0 p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 z-10">
          {step === 'review' ? (
            <>
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
                إلغاء
              </Button>
              <Button onClick={handleSaveAndSync} className="gap-2 bg-primary hover:bg-primary/90 w-full sm:w-auto">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>اعتماد وحفظ في سجل مذكرات وتأشيرات الخارجية</span>
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              إغلاق
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
