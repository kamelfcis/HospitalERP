/**
 * DateChangeGuard
 *
 * كاشف تغيير اليوم — يراقب التاريخ ويُجبر المستخدم على تحديث الصفحة
 * لتجنّب أي خطأ في تاريخ المستند أو التحصيل أو الشيفت عند ترك الشاشة مفتوحة
 * طوال الليل أو لأكثر من يوم.
 *
 * آليات الكشف:
 *  1. `setInterval` كل 60 ثانية — يكشف منتصف الليل أثناء نشاط التبويب
 *  2. `visibilitychange` — يكشف العودة إلى التبويب بعد غياب طويل
 *
 * السلوك عند تغيير التاريخ:
 *  - طبقة حجب كاملة (لا يمكن رفضها) مع زر "تحديث الآن"
 *  - يُحسب الوقت المُضاف (عدد الأيام) ويُعرض للمستخدم
 */

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** إرجاع ISO date string لليوم الحالي بالتوقيت المحلي */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** إرجاع اليوم بالعربي مثل "الأحد 03 مارس 2026" */
function formatArabicDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

/** حساب عدد الأيام بين تاريخين ISO */
function daysBetween(from: string, to: string): number {
  const ms = new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime();
  return Math.round(ms / 86_400_000);
}

// ─── component ────────────────────────────────────────────────────────────────

/**
 * DateChangeGuard — يُوضع داخل AuthenticatedApp فقط (بعد التحقق من تسجيل الدخول).
 * لا يُصيّر أي عناصر مرئية إلا عند اكتشاف تغيير اليوم.
 */
export default function DateChangeGuard() {
  const launchDate = useRef<string>(todayISO());
  const [staleInfo, setStaleInfo] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    /** فحص: هل تغيّر اليوم عن يوم الإطلاق؟ */
    function check() {
      const now = todayISO();
      if (now !== launchDate.current) {
        setStaleInfo({ from: launchDate.current, to: now });
      }
    }

    // فحص دوري كل 60 ثانية
    const timer = setInterval(check, 60_000);

    // فحص فوري عند عودة المستخدم للتبويب
    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!staleInfo) return null;

  const days = daysBetween(staleInfo.from, staleInfo.to);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      dir="rtl"
      data-testid="date-change-guard"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center space-y-6">

        {/* أيقونة */}
        <div className="flex justify-center">
          <div className="bg-amber-100 rounded-full p-4">
            <Calendar className="h-10 w-10 text-amber-600" />
          </div>
        </div>

        {/* العنوان */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-gray-900">
            تغيّر التاريخ — يرجى تحديث الصفحة
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            الصفحة مفتوحة منذ{" "}
            <span className="font-semibold text-gray-700">
              {days === 1 ? "يوم" : `${days} أيام`}
            </span>
            .<br />
            لتجنّب أخطاء التاريخ في المستندات والتحصيل، يجب تحديث الصفحة.
          </p>
        </div>

        {/* التواريخ */}
        <div className="bg-amber-50 rounded-xl p-4 text-sm space-y-1 text-right">
          <div className="flex justify-between">
            <span className="text-gray-500">تاريخ الفتح:</span>
            <span className="font-medium text-gray-700">{formatArabicDate(staleInfo.from)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">التاريخ الحالي:</span>
            <span className="font-semibold text-amber-700">{formatArabicDate(staleInfo.to)}</span>
          </div>
        </div>

        {/* زر التحديث */}
        <Button
          className="w-full h-11 text-base gap-2"
          onClick={() => window.location.reload()}
          data-testid="button-reload-page"
        >
          <RefreshCw className="h-5 w-5" />
          تحديث الآن
        </Button>

        <p className="text-xs text-gray-400">
          لن تُفقد بياناتك المحفوظة — فقط المستندات غير المحفوظة ستُفقد
        </p>
      </div>
    </div>
  );
}
