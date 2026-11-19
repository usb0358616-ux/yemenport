import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, FileText, CheckCircle2, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface WatchlistAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelerName: string;
  idNumber: string;
  matchedReportTitle: string;
  onCreateReport?: () => void;
}

export const WatchlistAlertModal: React.FC<WatchlistAlertModalProps> = ({
  isOpen,
  onClose,
  travelerName,
  idNumber,
  matchedReportTitle,
  onCreateReport
}) => {
  const navigate = useNavigate();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[92dvh] overflow-y-auto adaptive-scroll-region text-right border-2 border-rose-600 shadow-2xl bg-white" dir="rtl">
        <DialogHeader className="space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center border-2 border-rose-500 animate-bounce">
            <ShieldAlert className="h-9 w-9 text-rose-600" />
          </div>
          <div className="text-center space-y-1">
            <span className="text-xs font-black bg-rose-600 text-white px-3 py-1 rounded-full uppercase tracking-wider">
              تنبيه أمني عالي الخطورة 🚨
            </span>
            <DialogTitle className="text-xl font-extrabold text-slate-900 mt-2">
              تطابق مع قاعدة بيانات المطلوبين أمنياً!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              تم رصد تطابق في اسم ورقم وثيقة المسافر مع قوائم الترقب وبلاغات الضبط السارية.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-xs py-2">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-slate-800">
            <div className="flex justify-between items-center border-b border-rose-200 pb-1.5">
              <span className="text-muted-foreground">اسم المسافر:</span>
              <span className="font-bold text-slate-900 text-sm">{travelerName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-rose-200 pb-1.5">
              <span className="text-muted-foreground">رقم الوثيقة / الجواز:</span>
              <span className="font-mono font-bold text-rose-700">{idNumber || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">البلاغ المطابق:</span>
              <span className="font-bold text-rose-900 truncate max-w-[200px]">{matchedReportTitle}</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-[11px] leading-relaxed">
            <strong>الإجراء الفوري المطلوب:</strong> يتم التحفظ على الوثيقة، عدم السماح بالسفر، وإبلاغ غرفة العمليات المركزية وفتح محضر ضبط وتحري فوري.
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button
              onClick={() => {
                onClose();
                if (onCreateReport) onCreateReport();
                navigate('/reports');
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 py-5 text-sm"
            >
              <FileText className="h-4 w-4" />
              الانتقال إلى واجهة بلاغات الضبط والتحري
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="text-xs text-slate-600"
            >
              إغلاق وتحويل للمحقق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
