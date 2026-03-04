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
  const [bgImage, setBgImage] = useState<string | null>(null);
  const { login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/public/login-background")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.image) setBgImage(data.image); })
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
    } catch (error: any) {
      toast({ title: error.message || "فشل تسجيل الدخول", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir="rtl"
      style={
        bgImage
          ? {
              backgroundImage: `url(${bgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : { background: "hsl(var(--background))" }
      }
    >
      {bgImage && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      )}

      <Card className="w-full max-w-sm relative z-10 shadow-2xl border-0 bg-white/92 backdrop-blur-md">
        <CardHeader className="text-center pb-2 pt-7">
          <div className="flex justify-center mb-4">
            <div className="text-center select-none">
              <div className="flex items-center justify-center gap-3 mb-1.5">
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="52" height="52" rx="9" fill="#1a3a5c"/>
                  <path d="M26 10 L26 42 M10 26 L42 26" stroke="white" strokeWidth="9" strokeLinecap="round"/>
                </svg>
                <span
                  className="font-black text-[#1a3a5c] tracking-[0.18em] leading-none"
                  style={{ fontSize: "3.2rem", fontFamily: "'Arial Black', Arial, sans-serif", letterSpacing: "0.12em" }}
                >
                  AMS
                </span>
              </div>
              <p className="text-[11px] text-[#1a3a5c]/65 font-semibold tracking-[0.22em] uppercase mt-0.5">
                Hospital Accounting System
              </p>
            </div>
          </div>
          <h1 className="text-base font-bold text-foreground" data-testid="text-login-title">
            نظام الحسابات العامة
          </h1>
          <p className="text-xs text-muted-foreground">المستشفى · الدفتر العام</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
                autoFocus
                className="bg-white/80"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                className="bg-white/80"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#1a3a5c] hover:bg-[#15304d]"
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
