// ============================================================
//  hook إدارة نموذج المرتجع
//  يحتوي على كل state الخاصة بعملية الإرجاع
// ============================================================
import { useState, useMemo, useCallback } from "react";
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

  return {
    // navigation
    selectedInvoiceId, invoiceData, invoiceLoading,
    selectInvoice, clearInvoice,
    // lines
    returnLines, updateReturnQty, updateReturnUnit,
    // discount & notes
    discountType, setDiscountType,
    discountPercent, setDiscountPercent,
    discountValue, setDiscountValue,
    notes, setNotes,
    // totals
    subtotal, computedDiscount, netTotal,
    // submit
    hasReturnItems,
    submitReturn: submitMutation.mutate,
    isSubmitting: submitMutation.isPending,
  };
}
