import { useState, useEffect } from "react";

// ─── useDebounce ───────────────────────────────────────────────────────────────
/**
 * يُعيد قيمة مؤجلة تنتظر توقف الكتابة قبل التحديث.
 * @param value القيمة الحالية
 * @param delay وقت الانتظار بالميلي ثانية
 */
export function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
