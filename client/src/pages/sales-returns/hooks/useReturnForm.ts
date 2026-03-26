// ============================================================
//  hook إدارة نموذج المرتجع
//  يحتوي على كل state الخاصة بعملية الإرجاع
// ============================================================
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReturnInvoiceData, ReturnLine, OriginalLine } from "../types";
import { toMinorQty, availableMinor, calcReturnLineTotal } from "../types";

export function useReturnForm() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── State ─────────────────────────────────────────────────
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [discountType, setDiscountType] = useState<"percent" | "value">("percent");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  // هل الخصم تم تعبئته تلقائياً من الفاتورة الأصلية؟
  const [discountAutoApplied, setDiscountAutoApplied] = useState(false);

  // ── جلب بيانات الفاتورة (بدون cache لضمان بيانات حديثة) ──
  const { data: invoiceData, isLoading: invoiceLoading } = useQuery<ReturnInvoiceData>({
    queryKey: [`/api/sales-returns/invoice/${selectedInvoiceId}`],
    enabled: !!selectedInvoiceId,
    staleTime: 0,
    gcTime: 0,
  });

  // ── اختيار فاتورة وتهيئة سطور الإرجاع ───────────────────
  const selectInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setReturnLines([]);
    setDiscountPercent("0");
    setDiscountValue("0");
    setNotes("");
  }, []);

  const clearInvoice = useCallback(() => {
    setSelectedInvoiceId(null);
    setReturnLines([]);
    setDiscountPercent("0");
    setDiscountValue("0");
    setDiscountAutoApplied(false);
  }, []);

  // بناء سطور الإرجاع عند تحميل بيانات الفاتورة
  useMemo(() => {
    if (invoiceData?.lines && returnLines.length === 0 && invoiceData.lines.length > 0) {
      setReturnLines(
        invoiceData.lines.map((line: OriginalLine): ReturnLine => ({
          ...line,
          returnQty: "0",
          returnUnitLevel: line.unitLevel, // نفس وحدة البيع الأصلية كافتراضي
          returnQtyMinor: 0,
          returnLineTotal: 0,
        }))
      );
    }
  }, [invoiceData?.lines]);

  // ── تطبيق خصم الفاتورة الأصلية تلقائياً ─────────────────
  // عندما تُحمَّل بيانات الفاتورة، نحسب نسبة الخصم الفعلية
  // ونعبّئها في حقل الخصم حتى يأخذ كل صنف مرتجع نصيبه التلقائي
  useEffect(() => {
    if (!invoiceData) return;
    const origSubtotal = parseFloat(invoiceData.subtotal) || 0;
    const origDiscountValue = parseFloat(invoiceData.discountValue) || 0;
    if (origSubtotal <= 0 || origDiscountValue <= 0) {
      // لا يوجد خصم في الفاتورة الأصلية
      setDiscountType("percent");
      setDiscountPercent("0");
      setDiscountValue("0");
      setDiscountAutoApplied(false);
      return;
    }
    // نسبة الخصم الفعلية = قيمة الخصم ÷ الإجمالي قبل الخصم × 100
    const effectiveRate = (origDiscountValue / origSubtotal) * 100;
    setDiscountType("percent");
    setDiscountPercent(effectiveRate % 1 === 0 ? String(effectiveRate) : effectiveRate.toFixed(4).replace(/\.?0+$/, ""));
    setDiscountAutoApplied(true);
  }, [invoiceData?.id]);

  // ── تحديث الكمية المرتجعة لسطر ───────────────────────────
  const updateReturnQty = useCallback((lineId: string, qty: string) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const numQty = parseFloat(qty) || 0;
        const qtyMinor = toMinorQty(numQty, line.returnUnitLevel, line);
        const maxMinor = availableMinor(line);
        const clampedMinor = Math.min(qtyMinor, maxMinor);
        const lineTotal = calcReturnLineTotal(clampedMinor, line);
        return { ...line, returnQty: qty, returnQtyMinor: clampedMinor, returnLineTotal: lineTotal };
      })
    );
  }, []);

  // ── إرجاع الفاتورة بالكامل (يعبّئ كل الأصناف بالكمية القصوى) ─
  const returnAllLines = useCallback(() => {
    setReturnLines((prev) =>
      prev.map((line) => {
        const maxMinor = availableMinor(line);
        if (maxMinor <= 0) return line; // لا يوجد متاح للإرجاع
        // الكمية المتاحة بوحدة البيع الأصلية (تقريب للأسفل)
        const perUnit = toMinorQty(1, line.unitLevel, line);
        const qtyInOrigUnit = perUnit > 0 ? Math.floor(maxMinor / perUnit) : 0;
        const clampedMinor = qtyInOrigUnit * (perUnit > 0 ? perUnit : 1);
        const lineTotal = calcReturnLineTotal(clampedMinor, line);
        return {
          ...line,
          returnQty: String(qtyInOrigUnit),
          returnUnitLevel: line.unitLevel,
          returnQtyMinor: clampedMinor,
          returnLineTotal: lineTotal,
        };
      })
    );
  }, []);

  // ── تغيير وحدة الإرجاع (يصفّر الكمية) ────────────────────
  const updateReturnUnit = useCallback((lineId: string, unit: string) => {
    setReturnLines((prev) =>
      prev.map((line) =>
        line.id !== lineId ? line
          : { ...line, returnUnitLevel: unit, returnQty: "0", returnQtyMinor: 0, returnLineTotal: 0 }
      )
    );
  }, []);

  // ── حسابات الإجماليات ─────────────────────────────────────
  const subtotal = useMemo(
    () => returnLines.reduce((sum, l) => sum + l.returnLineTotal, 0),
    [returnLines]
  );

  const computedDiscount = useMemo(() => {
    if (discountType === "percent")
      return subtotal * (parseFloat(discountPercent) || 0) / 100;
    return parseFloat(discountValue) || 0;
  }, [discountType, discountPercent, discountValue, subtotal]);

  const netTotal = useMemo(
    () => Math.max(0, subtotal - computedDiscount),
    [subtotal, computedDiscount]
  );

  const hasReturnItems = returnLines.some((l) => l.returnQtyMinor > 0);

  // ── إرسال المرتجع للسيرفر ─────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      const lines = returnLines
        .filter((l) => l.returnQtyMinor > 0)
        .map((l) => ({
          originalLineId: l.id,
          itemId: l.itemId,
          unitLevel: l.returnUnitLevel,
          qty: l.returnQty,
          qtyInMinor: String(l.returnQtyMinor),
          salePrice: l.salePrice,
          lineTotal: l.returnLineTotal.toFixed(2),
          expiryMonth: l.expiryMonth,
          expiryYear: l.expiryYear,
          lotId: l.lotId,
        }));

      const res = await apiRequest("POST", "/api/sales-returns", {
        originalInvoiceId: selectedInvoiceId,
        warehouseId: invoiceData?.warehouseId,
        returnLines: lines,
        discountType,
        discountPercent,
        discountValue: computedDiscount.toFixed(2),
        notes,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "تم تسجيل المرتجع",
        description: `فاتورة مرتجع رقم ${data.invoiceNumber} — صافي ${data.netTotal} ج.م`,
      });
      qc.invalidateQueries({ queryKey: ["/api/sales-returns"] });
      clearInvoice();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message || "حدث خطأ أثناء التسجيل", variant: "destructive" });
    },
  });

  // ── تصفير جميع الكميات ────────────────────────────────────
  const clearAllQty = useCallback(() => {
    setReturnLines((prev) =>
      prev.map((line) => ({ ...line, returnQty: "0", returnQtyMinor: 0, returnLineTotal: 0 }))
    );
  }, []);

  return {
    // navigation
    selectedInvoiceId, invoiceData, invoiceLoading,
    selectInvoice, clearInvoice,
    // lines
    returnLines, updateReturnQty, updateReturnUnit,
    returnAllLines, clearAllQty,
    // discount & notes
    discountType, setDiscountType,
    discountPercent, setDiscountPercent,
    discountValue, setDiscountValue,
    discountAutoApplied,
    notes, setNotes,
    // totals
    subtotal, computedDiscount, netTotal,
    // submit
    hasReturnItems,
    submitReturn: submitMutation.mutate,
    isSubmitting: submitMutation.isPending,
  };
}
