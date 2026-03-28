import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogIn, Loader2 } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [pharmacyMode, setPharmacyMode] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/public/login-background")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.image) setBgImage(d.image); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.pharmacy_mode === "true") setPharmacyMode(true); })
      .catch(() => {});
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
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      toast({ title: _em || "فشل تسجيل الدخول", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      dir="rtl"
      style={
        bgImage
          ? { backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: "linear-gradient(135deg,#0a1929 0%,#0d2540 50%,#1a3a5c 100%)" }
      }
    >
      {/* overlay خفيف يحافظ على ظهور الخلفية */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(10,25,41,0.35) 0%, rgba(10,25,41,0.45) 100%)" }}
      />

      {/* كارت زجاجي */}
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl px-8 py-10"
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 8px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        {/* اللوجو */}
        <div className="flex flex-col items-center mb-7 select-none">
          <div className="flex items-center gap-3 mb-2">
            {/* أيقونة الصليب */}
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 11,
                background: "#1e5fa8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 16px rgba(30,95,168,0.55)",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4 L16 28 M4 16 L28 16" stroke="white" strokeWidth="7" strokeLinecap="round" />
              </svg>
            </div>

            {/* نص AMS بـ div بسيط لضمان الظهور دائماً */}
            <div
              style={{
                fontSize: "4rem",
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: "0.1em",
                lineHeight: 1,
                fontFamily: "Impact, 'Arial Black', Arial, sans-serif",
                textShadow: "0 2px 12px rgba(0,0,0,0.4)",
              }}
            >
              AMS
            </div>
          </div>

          <div
            style={{
              fontSize: "10px",
              color: "rgba(200,225,255,0.8)",
              letterSpacing: "0.28em",
              fontWeight: 600,
              textTransform: "uppercase",
              fontFamily: "Arial, sans-serif",
            }}
          >
            {pharmacyMode ? "Pharmacy Accounting System" : "Hospital Accounting System"}
          </div>

          <div
            style={{
              width: 60,
              height: 1,
              background: "linear-gradient(to right, transparent, rgba(100,180,255,0.5), transparent)",
              margin: "14px auto 0",
            }}
          />
        </div>

        <h1
          className="text-center text-white font-bold mb-1"
          style={{ fontSize: "1rem", textShadow: "0 1px 6px rgba(0,0,0,0.3)" }}
          data-testid="text-login-title"
        >
          {pharmacyMode ? "نظام الصيدلية" : "نظام الحسابات العامة"}
        </h1>
        <p className="text-center mb-7" style={{ fontSize: "12px", color: "rgba(180,215,255,0.65)" }}>
          {pharmacyMode ? "الصيدلية · نقطة البيع" : "المستشفى · الدفتر العام"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" style={{ color: "rgba(200,225,255,0.85)", fontSize: "13px" }}>
              اسم المستخدم
            </Label>
            <Input
              id="username"
              data-testid="input-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              autoComplete="username"
              autoFocus
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                backdropFilter: "blur(4px)",
              }}
              className="placeholder:text-white/30 focus:border-blue-400/70"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" style={{ color: "rgba(200,225,255,0.85)", fontSize: "13px" }}>
              كلمة المرور
            </Label>
            <Input
              id="password"
              data-testid="input-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور"
              autoComplete="current-password"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                backdropFilter: "blur(4px)",
              }}
              className="placeholder:text-white/30 focus:border-blue-400/70"
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2 font-semibold text-white border-0"
            style={{
              background: "linear-gradient(135deg, #1e5fa8 0%, #2d7dd2 100%)",
              boxShadow: "0 4px 18px rgba(30,95,168,0.5)",
            }}
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
      </div>
    </div>
  );
}
