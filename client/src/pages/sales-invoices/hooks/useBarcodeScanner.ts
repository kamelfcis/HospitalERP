/**
 * useBarcodeScanner — اسكنر باركود عالمي
 *
 * يعمل من أي مكان على الشاشة — لا حاجة للنقر على حقل معين.
 *
 * كيف يعمل:
 *  - يراقب keydown على مستوى window (capture phase)
 *  - الاسكنر يضغط < 50ms بين كل حرف → الإنسان > 100ms
 *  - عند Enter بعد تسلسل سريع من الأحرف → يعالج الباركود
 *
 * حالات خاصة:
 *  - إذا حقل الباركود الظاهر هو الفوكس → يستخدم المسار القديم (لا conflict)
 *  - لو كان حقل كمية مفوّكس → أول 2 حرف يدخلا إليه (لا يُلاحَظ بالعين)
 *    ثم المستمع العالمي يتولى الباقي؛ pendingQtyRef يُمسح بعد المسح للأمان
 *  - لا يشتغل لو مربع حوار مفتوح
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

// ─── ثوابت توقيت الاسكنر ───────────────────────────────────────────────────
const SCANNER_SPEED_MS  = 50;   // الحد الأقصى بين حرفين للاسكنر
const MIN_BARCODE_LEN   = 4;    // أقل طول باركود معقول
const BUFFER_RESET_MS   = 500;  // يُمسح الـ buffer بعد هذه المدة من السكون

interface UseBarcodeScannerParams {
  warehouseId:       string;
  isDraft:           boolean;
  addItemToLines:    (item: any) => Promise<void>;
  pendingQtyRef:     React.MutableRefObject<Map<string, string>>;
  barcodeInputRef:   React.RefObject<HTMLInputElement>;
  onScanComplete?:   () => void;
}

export function useBarcodeScanner({
  warehouseId, isDraft, addItemToLines,
  pendingQtyRef, barcodeInputRef, onScanComplete,
}: UseBarcodeScannerParams) {
  const { toast } = useToast();

  // حالة الواجهة
  const [barcodeDisplay, setBarcodeDisplay] = useState("");  // ما يظهر في حقل الباركود
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // مرجع لمنع المعالجة المزدوجة
  const processingRef = useRef(false);

  // ─── معالجة الباركود (مشتركة بين المسار العالمي والمسار القديم) ──────────
  const processBarcode = useCallback(async (code: string) => {
    if (processingRef.current || !warehouseId) return;
    processingRef.current = true;
    setBarcodeLoading(true);
    setBarcodeDisplay(code);

    // ─── أمان: امسح أي قيم كمية ربما دخلت بالخطأ من سرعة الاسكنر ───────────
    pendingQtyRef.current.clear();

    try {
      // 1. حلِّل الباركود
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("resolve_failed");
      const data = await res.json();

      if (!data.found || !data.itemCode) {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
        return;
      }

      // 2. ابحث عن الصنف
      const params = new URLSearchParams({
        warehouseId, mode: "CODE", q: data.itemCode,
        page: "1", pageSize: "1", includeZeroStock: "true",
      });
      const itemRes = await fetch(`/api/items/search?${params}`);
      if (!itemRes.ok) throw new Error("search_failed");

      const itemData = await itemRes.json();
      const items    = itemData.data || itemData.items || itemData;

      if (!Array.isArray(items) || items.length === 0) {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
        return;
      }

      // 3. أضف للفاتورة
      await addItemToLines(items[0]);
      onScanComplete?.();

    } catch (err: unknown) {
      if (!["resolve_failed", "search_failed"].includes((err as Error).message)) {
        toast({ title: "خطأ في قراءة الباركود", variant: "destructive" });
      }
    } finally {
      setBarcodeDisplay("");
      setBarcodeLoading(false);
      processingRef.current = false;
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [warehouseId, addItemToLines, pendingQtyRef, onScanComplete, toast, barcodeInputRef]);

  // ─── المستمع العالمي ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDraft) return;

    let buffer:     string   = "";
    let timestamps: number[] = [];
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // لا تشتغل لو نافذة حوار مفتوحة
      if (document.querySelector('[role="dialog"]')) return;

      // لو حقل الباركود الظاهر هو الفوكس → دعه يتعامل معه (onKeyDown الخاص به)
      if (document.activeElement === barcodeInputRef.current) return;

      // تجاهل مفاتيح التحكم (Shift, Ctrl, etc.) ما عدا Enter
      if (e.key !== "Enter" && e.key.length !== 1) return;

      const now = Date.now();

      // ── Enter: قيِّم هل هو باركود أم إنتر عادي ─────────────────────────
      if (e.key === "Enter") {
        if (clearTimer) clearTimeout(clearTimer);
        const code      = buffer.trim();
        const count     = timestamps.length;
        const allFast   = count >= 2 &&
          timestamps.every((t, i) => i === 0 || (t - timestamps[i - 1]) < SCANNER_SPEED_MS);
        const isBarcode = allFast && code.length >= MIN_BARCODE_LEN;

        buffer     = "";
        timestamps = [];

        if (isBarcode && !processingRef.current) {
          // امنع Enter من الوصول للعنصر المفوكس (مثل: إرسال نموذج)
          e.preventDefault();
          e.stopPropagation();
          processBarcode(code);
        }
        return;
      }

      // ── حرف قابل للطباعة ─────────────────────────────────────────────────
      const prevTime = timestamps[timestamps.length - 1] ?? 0;
      const elapsed  = prevTime ? now - prevTime : Infinity;

      // فجوة طويلة = الإنسان كان يكتب، ابدأ buffer جديد
      if (elapsed > 300) {
        buffer     = "";
        timestamps = [];
      }

      // من الحرف الثالث في وضع الاسكنر: امنع الحرف من الوصول للعنصر المفوكس
      const inScannerMode =
        timestamps.length >= 2 &&
        (now - timestamps[timestamps.length - 1]) < SCANNER_SPEED_MS;

      if (inScannerMode) {
        e.preventDefault();
        e.stopPropagation();
      }

      buffer += e.key;
      timestamps.push(now);

      // امسح الـ buffer تلقائياً بعد سكون طويل
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        buffer     = "";
        timestamps = [];
      }, BUFFER_RESET_MS);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [isDraft, processBarcode, barcodeInputRef]);

  // ─── المسار القديم: Enter في حقل الباركود الظاهر ─────────────────────────
  const handleBarcodeInputSubmit = useCallback(() => {
    const code = barcodeDisplay.trim();
    if (code && !processingRef.current) processBarcode(code);
  }, [barcodeDisplay, processBarcode]);

  return {
    barcodeDisplay,
    setBarcodeDisplay,
    barcodeLoading,
    handleBarcodeInputSubmit,
  };
}
