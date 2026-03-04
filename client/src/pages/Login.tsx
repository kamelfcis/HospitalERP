import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogIn, Loader2 } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast({ title: "يرجى إدخال اسم المستخدم وكلمة المرور", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (error: any) {
      toast({ title: error.message || "فشل تسجيل الدخول", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a1929" />
            <stop offset="45%" stopColor="#0d2540" />
            <stop offset="100%" stopColor="#1a3a5c" />
          </linearGradient>
          <linearGradient id="floorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e4a7a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0a1929" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="glowGrad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#3b8fd4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b8fd4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ceilGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4eaf7" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#d4eaf7" stopOpacity="0" />
          </linearGradient>
          <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="softBlur">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        <rect width="1440" height="900" fill="url(#bgGrad)" />

        <ellipse cx="720" cy="380" rx="480" ry="320" fill="url(#glowGrad)" filter="url(#blur)" />
        <ellipse cx="720" cy="120" rx="600" ry="140" fill="url(#ceilGrad)" filter="url(#blur)" />

        <line x1="720" y1="0" x2="0" y2="900" stroke="#2a6096" strokeWidth="1.2" strokeOpacity="0.25" />
        <line x1="720" y1="0" x2="180" y2="900" stroke="#2a6096" strokeWidth="1" strokeOpacity="0.2" />
        <line x1="720" y1="0" x2="360" y2="900" stroke="#2a6096" strokeWidth="0.8" strokeOpacity="0.15" />
        <line x1="720" y1="0" x2="540" y2="900" stroke="#2a6096" strokeWidth="0.6" strokeOpacity="0.12" />
        <line x1="720" y1="0" x2="1440" y2="900" stroke="#2a6096" strokeWidth="1.2" strokeOpacity="0.25" />
        <line x1="720" y1="0" x2="1260" y2="900" stroke="#2a6096" strokeWidth="1" strokeOpacity="0.2" />
        <line x1="720" y1="0" x2="1080" y2="900" stroke="#2a6096" strokeWidth="0.8" strokeOpacity="0.15" />
        <line x1="720" y1="0" x2="900" y2="900" stroke="#2a6096" strokeWidth="0.6" strokeOpacity="0.12" />

        <rect x="0" y="0" width="1440" height="4" fill="#d4eaf7" fillOpacity="0.06" />
        <rect x="0" y="155" width="1440" height="2.5" fill="#d4eaf7" fillOpacity="0.04" />
        <rect x="0" y="300" width="1440" height="2" fill="#d4eaf7" fillOpacity="0.035" />
        <rect x="0" y="430" width="1440" height="1.5" fill="#d4eaf7" fillOpacity="0.025" />

        <rect x="80" y="160" width="260" height="480" rx="4" fill="#163352" fillOpacity="0.55" />
        <rect x="84" y="165" width="252" height="90" rx="2" fill="#1a4068" fillOpacity="0.6" />
        <rect x="94" y="175" width="80" height="60" rx="2" fill="#0d2540" fillOpacity="0.8" />
        <rect x="186" y="175" width="80" height="60" rx="2" fill="#0d2540" fillOpacity="0.8" />
        <rect x="94" y="215" width="80" height="8" rx="1" fill="#3b8fd4" fillOpacity="0.35" />
        <rect x="186" y="215" width="80" height="8" rx="1" fill="#3b8fd4" fillOpacity="0.35" />

        <rect x="80" y="305" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.12" />
        <rect x="80" y="325" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.08" />
        <rect x="80" y="345" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.06" />
        <rect x="80" y="365" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.05" />
        <rect x="80" y="385" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.04" />

        <rect x="80" y="430" width="260" height="70" rx="3" fill="#1a4068" fillOpacity="0.45" />
        <ellipse cx="140" cy="490" rx="28" ry="10" fill="#3b8fd4" fillOpacity="0.12" />
        <ellipse cx="260" cy="490" rx="28" ry="10" fill="#3b8fd4" fillOpacity="0.12" />

        <rect x="1100" y="160" width="260" height="480" rx="4" fill="#163352" fillOpacity="0.55" />
        <rect x="1100" y="165" width="252" height="90" rx="2" fill="#1a4068" fillOpacity="0.6" />
        <rect x="1106" y="175" width="80" height="60" rx="2" fill="#0d2540" fillOpacity="0.8" />
        <rect x="1200" y="175" width="80" height="60" rx="2" fill="#0d2540" fillOpacity="0.8" />
        <rect x="1106" y="215" width="80" height="8" rx="1" fill="#3b8fd4" fillOpacity="0.35" />
        <rect x="1200" y="215" width="80" height="8" rx="1" fill="#3b8fd4" fillOpacity="0.35" />
        <rect x="1100" y="305" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.12" />
        <rect x="1100" y="325" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.08" />
        <rect x="1100" y="345" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.06" />
        <rect x="1100" y="365" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.05" />
        <rect x="1100" y="385" width="260" height="14" rx="2" fill="#3b8fd4" fillOpacity="0.04" />
        <rect x="1100" y="430" width="260" height="70" rx="3" fill="#1a4068" fillOpacity="0.45" />
        <ellipse cx="1160" cy="490" rx="28" ry="10" fill="#3b8fd4" fillOpacity="0.12" />
        <ellipse cx="1280" cy="490" rx="28" ry="10" fill="#3b8fd4" fillOpacity="0.12" />

        <rect x="360" y="0" width="720" height="900" fill="url(#floorGrad)" fillOpacity="0.18" />

        <rect x="0" y="840" width="1440" height="60" fill="#071424" fillOpacity="0.7" />
        <rect x="0" y="840" width="1440" height="1.5" fill="#3b8fd4" fillOpacity="0.18" />

        <rect x="600" y="30" width="240" height="12" rx="6" fill="#d4eaf7" fillOpacity="0.09" />
        <rect x="540" y="52" width="360" height="8" rx="4" fill="#d4eaf7" fillOpacity="0.06" />
        <rect x="620" y="68" width="200" height="6" rx="3" fill="#d4eaf7" fillOpacity="0.04" />

        <circle cx="72" cy="72" r="28" fill="none" stroke="#3b8fd4" strokeWidth="1.5" strokeOpacity="0.18" />
        <circle cx="72" cy="72" r="18" fill="none" stroke="#3b8fd4" strokeWidth="1" strokeOpacity="0.12" />
        <line x1="58" y1="72" x2="86" y2="72" stroke="#3b8fd4" strokeWidth="2" strokeOpacity="0.2" />
        <line x1="72" y1="58" x2="72" y2="86" stroke="#3b8fd4" strokeWidth="2" strokeOpacity="0.2" />

        <circle cx="1368" cy="72" r="28" fill="none" stroke="#3b8fd4" strokeWidth="1.5" strokeOpacity="0.18" />
        <circle cx="1368" cy="72" r="18" fill="none" stroke="#3b8fd4" strokeWidth="1" strokeOpacity="0.12" />
        <line x1="1354" y1="72" x2="1382" y2="72" stroke="#3b8fd4" strokeWidth="2" strokeOpacity="0.2" />
        <line x1="1368" y1="58" x2="1368" y2="86" stroke="#3b8fd4" strokeWidth="2" strokeOpacity="0.2" />

        <rect x="0" y="895" width="1440" height="5" fill="#3b8fd4" fillOpacity="0.3" />
      </svg>

      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1929]/30 via-transparent to-[#0a1929]/50" />

      <Card className="w-full max-w-sm relative z-10 border border-white/10 shadow-[0_8px_60px_rgba(0,0,0,0.6)] bg-[#0d2033]/80 backdrop-blur-xl text-white">
        <CardHeader className="text-center pb-3 pt-8">
          <div className="flex justify-center mb-5">
            <div className="text-center select-none">
              <div className="flex items-center justify-center gap-4 mb-2">
                <svg width="58" height="58" viewBox="0 0 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="58" height="58" rx="11" fill="#1e5fa8" />
                  <path d="M29 11 L29 47 M11 29 L47 29" stroke="white" strokeWidth="10" strokeLinecap="round" />
                </svg>
                <svg width="180" height="62" viewBox="0 0 180 62" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text
                    x="2"
                    y="56"
                    fontFamily="'Bebas Neue', 'Arial Black', Impact, Arial, sans-serif"
                    fontSize="62"
                    fontWeight="400"
                    fill="white"
                    letterSpacing="6"
                  >AMS</text>
                </svg>
              </div>
              <p
                style={{
                  fontSize: "11px",
                  color: "rgba(180,215,255,0.75)",
                  letterSpacing: "0.26em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  marginTop: "4px",
                }}
              >
                Hospital Accounting System
              </p>
            </div>
          </div>
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent mx-auto mb-3" />
          <h1 className="text-base font-bold text-white/90" data-testid="text-login-title">
            نظام الحسابات العامة
          </h1>
          <p className="text-xs text-blue-200/60 mt-0.5">المستشفى · الدفتر العام</p>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-blue-100/80 text-sm">اسم المستخدم</Label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
                autoFocus
                className="bg-white/8 border-white/15 text-white placeholder:text-white/30 focus:border-blue-400/60 focus:bg-white/12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-blue-100/80 text-sm">كلمة المرور</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                className="bg-white/8 border-white/15 text-white placeholder:text-white/30 focus:border-blue-400/60 focus:bg-white/12"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#1e5fa8] hover:bg-[#1a52940] border-0 text-white font-semibold mt-2"
              style={{ background: "linear-gradient(135deg, #1e5fa8 0%, #2d7dd2 100%)" }}
              disabled={isSubmitting}
              data-testid="button-login"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 ml-2" />
                  تسجيل الدخول
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
