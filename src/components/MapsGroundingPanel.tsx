import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, Loader2, LocateFixed, WifiOff, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryMapsGroundingWithGemini, MapsGroundingSource } from '@/services/geminiService';

interface MapsGroundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultQuery?: string;
  contextTitle?: string;
  presetQueries?: { label: string; query: string }[];
  onApplyRouteText?: (routeSummary: string) => void;
}

const DEFAULT_PRESETS = [
  { label: 'خط سير صنعاء ← عدن', query: 'خط السير والمسافة والمدن بين صنعاء وعدن عبر ذمار وإب والضالع' },
  { label: 'خط سير صنعاء ← تعز', query: 'الطريق الرئيسي والمسافة بين صنعاء وذمار وإب وتعز' },
  { label: 'منفذ شحن البري', query: 'موقع منفذ شحن البري الحدودي في محافظة المهرة اليمن وأقرب المدن' },
  { label: 'ساحل ذباب وباب المندب', query: 'موقع ساحل ذباب وباب المندب وأقرب المرافق والإيواء في تعز والحديدة' },
];

export const MapsGroundingModal: React.FC<MapsGroundingModalProps> = ({
  isOpen,
  onClose,
  defaultQuery = '',
  contextTitle = 'الاستعلام الجغرافي والتحقق من المسارات (خرائط Google)',
  presetQueries = DEFAULT_PRESETS,
  onApplyRouteText,
}) => {
  const { toast } = useToast();
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [resultText, setResultText] = useState('');
  const [sources, setSources] = useState<MapsGroundingSource[]>([]);
  const [offlineError, setOfflineError] = useState('');

  React.useEffect(() => {
    if (isOpen && defaultQuery) {
      setQuery(defaultQuery);
    }
  }, [isOpen, defaultQuery]);

  const getBrowserCoords = (): Promise<{ latitude: number; longitude: number } | undefined> =>
    new Promise((resolve) => {
      if (!useMyLocation || !navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(undefined),
        { timeout: 4000 }
      );
    });

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال اسم المنفذ أو المسار أو الموقع', variant: 'destructive' });
      return;
    }

    if (!navigator.onLine) {
      setOfflineError('أنت تعمل حالياً في الوضع المحلي (بدون إنترنت). الخرائط الحية تتطلب الاتصال بالإنترنت؛ بقية وحدات النظام تعمل كالمعتاد.');
      return;
    }

    setOfflineError('');
    setLoading(true);
    try {
      const coords = await getBrowserCoords();
      const res = await queryMapsGroundingWithGemini(q, coords);
      if (res.success) {
        setResultText(res.text);
        setSources(res.sources);
      } else {
        setOfflineError(res.error || 'تعذر جلب بيانات الخرائط من الخادم');
      }
    } catch {
      setOfflineError('تعذر الاتصال بخادم الاستعلام الجغرافي');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] p-0 flex flex-col overflow-hidden text-right" dir="rtl">
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 pl-10">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MapPin className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{contextTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            تحقق ميداني من المسافات وخطوط السير والمنافذ السيادية ومراكز الإيواء مع روابط خرائط Google الموثقة (يعمل عند الاتصال ولا يؤثر على وضع أوفلاين).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto adaptive-scroll-region p-4 sm:p-5 space-y-4 text-xs">
          {/* Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 block">استعلامات سريعة شائعة:</span>
            <div className="flex flex-wrap gap-1.5">
              {presetQueries.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setQuery(p.query);
                    handleSearch(p.query);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 text-[11px] font-medium transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Navigation className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="مثال: المسافة والطريق بين صنعاء ومطار سيئون أو أقرب مركز إيواء..."
                className="pr-9 text-right"
              />
            </div>
            <Button
              type="button"
              variant={useMyLocation ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseMyLocation((v) => !v)}
              className="h-9 px-3 gap-1.5 shrink-0"
              title="إرفاق إحداثيات موقعك الحالي لتحسين النتائج القريبة"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              <span>{useMyLocation ? 'موقعي مفعّل' : 'موقعي الحالي'}</span>
            </Button>
            <Button type="submit" disabled={loading} className="h-9 px-4 gap-1.5 shrink-0 font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              <span>تحقق من المسار</span>
            </Button>
          </form>

          {offlineError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 flex items-start gap-2">
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
              <p className="leading-relaxed">{offlineError}</p>
            </div>
          )}

          {resultText && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                  بيانات خرائط موثقة (Google Maps Grounding)
                </Badge>
                {onApplyRouteText && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      onApplyRouteText(query.trim());
                      toast({ title: 'تم اعتماد المسار في الحقل' });
                      onClose();
                    }}
                    className="h-7 text-[11px] font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  >
                    إدراج خط السير في النموذج
                  </Button>
                )}
              </div>
              <div className="text-slate-800 leading-relaxed whitespace-pre-line text-xs sm:text-sm">
                {resultText}
              </div>
            </div>
          )}

          {/* Grounded Google Maps Links (Mandatory per Google Maps Grounding guidelines) */}
          {sources.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                <span>المواقع والروابط الموثقة على خرائط Google ({sources.length}):</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sources.map((src, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{src.title}</p>
                      {src.reviewSnippets && src.reviewSnippets.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {src.reviewSnippets[0].snippet || src.reviewSnippets[0].title}
                        </p>
                      )}
                    </div>
                    {src.uri && (
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline w-fit"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>فتح الموقع في خرائط Google</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 p-3.5 border-t bg-slate-50 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
