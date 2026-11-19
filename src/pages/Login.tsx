import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, User as UserIcon, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { authenticateManagedUser, getManagedUsers } from '@/lib/rbac';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Ensure seeded users exist on first visit
  const quickAccounts = getManagedUsers().filter(u => u.status === 'نشط').slice(0, 4);

  const performLogin = (u: string, p: string) => {
    setIsLoading(true);
    setTimeout(() => {
      const res = authenticateManagedUser(u, p);
      if (res.success) {
        toast({
          title: 'تم تسجيل الدخول بنجاح',
          description: `مرحباً ${res.user.name} (${res.user.role})`
        });
        navigate('/');
      } else {
        toast({
          title: 'تعذر تسجيل الدخول',
          description: res.error,
          variant: 'destructive'
        });
      }
      setIsLoading(false);
    }, 250);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-primary/10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto p-2 rounded-2xl w-fit bg-slate-50 border border-slate-200/80 shadow-xs">
            <img
              src="./assets/aistudio/ic_launcher_e65b28d6.png"
              alt="شعار الجمهورية اليمنية - الطير الجمهوري"
              className="h-20 w-auto max-w-[120px] object-contain drop-shadow-sm"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800">نظام المنافذ والجوازات الذكي</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              الجمهورية اليمنية · مصلحة الهجرة والجوازات والجنسية
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium pr-1 flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                اسم المستخدم
              </label>
              <Input
                autoFocus
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium pr-1 flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                كلمة المرور
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-right"
              />
            </div>
            <Button type="submit" className="w-full py-5 text-base font-bold" disabled={isLoading}>
              {isLoading ? 'جاري التحقق وتوثيق الجلسة...' : 'تسجيل الدخول'}
            </Button>
          </form>

          {quickAccounts.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>دخول سريع لاختبار الأدوار والصلاحيات (كلمة المرور: 123456)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickAccounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setUsername(acc.username);
                      setPassword('123456');
                    }}
                    className="text-right p-2 rounded-lg border border-slate-200 hover:border-primary/50 hover:bg-slate-50 transition-colors"
                  >
                    <p className="text-xs font-bold text-slate-900 truncate">{acc.role}</p>
                    <p className="text-[11px] font-mono text-slate-500 truncate">{acc.username}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t text-center text-xs text-muted-foreground">
            نظام ذكي للتحكم في المنافذ · مصادقة مشفرة وسجل تدقيق نشط
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
