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
 * مراحل التنبيه:
 *  • فور الكشف: بنر تحذيري مع عداد تنازلي بالدقائق — قابل للتحديث مباشرةً
 *  • بعد 5 دقائق: طبقة حجب كاملة (غير قابلة للرفض) + زر تحديث إجباري
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── constants ────────────────────────────────────────────────────────────────

/** مهلة صامتة قبل ظهور شاشة الحجب (5 دقائق بالميلي ثانية) */
const GRACE_MS = 5 * 60 * 1000;

/** كم مرة في الثانية يتحدث العداد التنازلي */
const COUNTDOWN_TICK_MS = 1_000;

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

/** تنسيق الثواني كـ "دق:ثا" */
function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DateChangeGuard() {
  const launchDate    = useRef<string>(todayISO());
  const graceStart    = useRef<number | null>(null);
  const graceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [warning, setWarning]   = useState<{ from: string; to: string } | null>(null);
  const [blocked, setBlocked]   = useState<{ from: string; to: string } | null>(null);
  const [remaining, setRemaining] = useState<number>(GRACE_MS);

  const reload = useCallback(() => window.location.reload(), []);

  /** يبدأ مؤقت الإنذار + مؤقت العداد التنازلي */
  function triggerGrace(from: string, to: string) {
    if (graceTimer.current) return; // يعمل بالفعل — تجاهل

    graceStart.current = Date.now();
    setWarning({ from, to });
    setRemaining(GRACE_MS);

    // ── مؤقت شاشة الحجب ────────────────────────────────────────────────
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setWarning(null);
      setBlocked({ from, to });
    }, GRACE_MS);

    // ── عداد تنازلي (يُحدَّث كل ثانية) ────────────────────────────────
    countdownRef.current = setInterval(() => {
      if (graceStart.current === null) return;
      const elapsed = Date.now() - graceStart.current;
      setRemaining(Math.max(0, GRACE_MS - elapsed));
    }, COUNTDOWN_TICK_MS);
  }

  useEffect(() => {
    function check() {
      const now = todayISO();
      if (now !== launchDate.current) {
        triggerGrace(launchDate.current, now);
      }
    }

    const pollTimer = setInterval(check, 60_000);

    function onVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(pollTimer);
      if (graceTimer.current)   clearTimeout(graceTimer.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── شاشة الحجب الكاملة (غير قابلة للإغلاق) ──────────────────────────────
  if (blocked) {
    const days = daysDiff(blocked.from, blocked.to);
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        dir="rtl"
        data-testid="date-change-guard"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-amber-100 rounded-full p-4">
              <Calendar className="h-10 w-10 text-amber-600" />
            </div>
          </div>

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

          <Button
            className="w-full h-11 text-base gap-2"
            onClick={reload}
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

  // ── بنر التحذير (قابل للتحديث الفوري) ────────────────────────────────────
  if (warning) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] w-full max-w-lg mx-auto px-4"
        dir="rtl"
        data-testid="date-change-warning-banner"
      >
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 shadow-xl px-4 py-3">
          <div className="bg-amber-100 rounded-full p-1.5 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 leading-tight">
              تغيّر تاريخ الجلسة — يُوصى بالتحديث
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              من{" "}
              <span className="font-medium">{fmtAr(warning.from)}</span>
              {" "}إلى{" "}
              <span className="font-medium">{fmtAr(warning.to)}</span>
              {" "}· سيتم التحديث الإجباري بعد{" "}
              <span className="font-bold tabular-nums">{fmtCountdown(remaining)}</span>
            </p>
          </div>

          <Button
            size="sm"
            className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={reload}
            data-testid="button-reload-page-warning"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث الآن
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
