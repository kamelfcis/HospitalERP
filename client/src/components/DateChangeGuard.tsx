/**
 * DateChangeGuard
 *
 * كاشف تغيير اليوم — يراقب التاريخ ويُجبر المستخدم على تحديث الصفحة
 * لتجنّب أي خطأ في تاريخ المستند أو التحصيل أو الشيفت.
 *
 * آليات الكشف:
 *  1. `setInterval` كل 60 ثانية — يكشف منتصف الليل أثناء نشاط التبويب
 *  2. `visibilitychange` — يكشف العودة إلى التبويب بعد غياب طويل
 *
 * سلوك الإشعار (بعد اكتشاف التغيير):
 *  • مهلة صامتة 5 دقائق لإتاحة إنهاء العمل الحالي
 *  • بعد المهلة: طبقة حجب كاملة (غير قابلة للرفض) + زر تحديث
 */

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── constants ────────────────────────────────────────────────────────────────

/** مهلة صامتة قبل ظهور شاشة الحجب (5 دقائق بالميلي ثانية) */
const GRACE_MS = 5 * 60 * 1000;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** ISO date string لليوم الحالي بالتوقيت المحلي */
function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** تنسيق التاريخ بالعربي: "الأحد 03 مارس 2026" */
function fmtAr(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("ar-EG", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "2-digit",
  });
}

/** عدد الأيام بين تاريخين ISO */
function daysDiff(from: string, to: string): number {
  const ms = new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

// ─── component ────────────────────────────────────────────────────────────────

/**
 * DateChangeGuard
 * يُوضع داخل AuthenticatedApp فقط (بعد التحقق من تسجيل الدخول).
 * لا يُصيّر أي عناصر مرئية إلا بعد انتهاء مهلة الـ 5 دقائق.
 */
export default function DateChangeGuard() {
  const launchDate  = useRef<string>(todayISO());
  const graceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blocked, setBlocked] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    /**
     * يُستدعى عند اكتشاف تغيير التاريخ.
     * ينتظر GRACE_MS صامتاً ثم يُظهر شاشة الحجب.
     */
    function triggerGrace(from: string, to: string) {
      if (graceTimer.current) return; // مؤقت يعمل بالفعل — لا تعد التشغيل
      graceTimer.current = setTimeout(() => {
        graceTimer.current = null;
        setBlocked({ from, to });
      }, GRACE_MS);
    }

    /** يفحص إذا تغيّر التاريخ عن يوم إطلاق الجلسة */
    function check() {
      const now = todayISO();
      if (now !== launchDate.current) {
        triggerGrace(launchDate.current, now);
      }
    }

    const pollTimer = setInterval(check, 60_000); // كل دقيقة

    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(pollTimer);
      if (graceTimer.current) clearTimeout(graceTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!blocked) return null;

  const days = daysDiff(blocked.from, blocked.to);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      dir="rtl"
      data-testid="date-change-guard"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center space-y-6">

        {/* ── أيقونة ── */}
        <div className="flex justify-center">
          <div className="bg-amber-100 rounded-full p-4">
            <Calendar className="h-10 w-10 text-amber-600" />
          </div>
        </div>

        {/* ── العنوان ── */}
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
            لتجنّب أخطاء التاريخ في المستندات والتحصيل يجب تحديث الصفحة.
          </p>
        </div>

        {/* ── التواريخ ── */}
        <div className="bg-amber-50 rounded-xl p-4 text-sm space-y-1 text-right">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 shrink-0">تاريخ الفتح:</span>
            <span className="font-medium text-gray-700">{fmtAr(blocked.from)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 shrink-0">التاريخ الحالي:</span>
            <span className="font-semibold text-amber-700">{fmtAr(blocked.to)}</span>
          </div>
        </div>

        {/* ── زر التحديث ── */}
        <Button
          className="w-full h-11 text-base gap-2"
          onClick={() => window.location.reload()}
          data-testid="button-reload-page"
        >
          <RefreshCw className="h-5 w-5" />
          تحديث الآن
        </Button>

        <p className="text-xs text-gray-400">
          البيانات المحفوظة لن تُفقد — فقط المستندات غير المحفوظة ستحتاج إعادة إدخال
        </p>
      </div>
    </div>
  );
}
