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

      <Card className="w-full max-w-sm relative z-10 shadow-2xl border-0 bg-white/90 backdrop-blur-md">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="bg-[#1a3a5c] text-white rounded-md px-2 py-0.5 text-xs font-bold">+</div>
                <span className="text-2xl font-extrabold text-[#1a3a5c] tracking-widest">AMS</span>
              </div>
              <p className="text-[10px] text-[#1a3a5c]/70 font-medium tracking-wider uppercase">Hospital Accounting System</p>
            </div>
          </div>
          <h1 className="text-lg font-bold text-foreground" data-testid="text-login-title">
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
