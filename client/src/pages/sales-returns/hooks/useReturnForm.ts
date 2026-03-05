import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReturnInvoiceData, ReturnLine, OriginalLine } from "../types";
import { calcQtyMinor, availableToReturnMinor, calcLineTotal } from "../types";

export function useReturnForm() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [discountType, setDiscountType] = useState<"percent" | "value">("percent");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");

  const { data: invoiceData, isLoading: invoiceLoading } = useQuery<ReturnInvoiceData>({
    queryKey: [`/api/sales-returns/invoice/${selectedInvoiceId}`],
    enabled: !!selectedInvoiceId,
  });

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

  useMemo(() => {
    if (invoiceData?.lines && returnLines.length === 0 && invoiceData.lines.length > 0) {
      setReturnLines(
        invoiceData.lines.map((line: OriginalLine) => ({
          ...line,
          returnQty: "0",
          returnUnitLevel: line.unitLevel,
          returnQtyMinor: 0,
          returnLineTotal: 0,
        }))
      );
    }
  }, [invoiceData?.lines]);

  const updateReturnQty = useCallback((lineId: string, qty: string) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const numQty = parseFloat(qty) || 0;
        const qtyMinor = calcQtyMinor(numQty, line.returnUnitLevel, line);
        const availMinor = availableToReturnMinor(line);
        const clampedMinor = Math.min(qtyMinor, availMinor);
        const finalQty = clampedMinor === qtyMinor ? numQty : clampedMinor / (calcQtyMinor(1, line.returnUnitLevel, line) || 1);
        const lineTotal = calcLineTotal(clampedMinor, line.salePrice, line.qtyInMinor, line.lineTotal);
        return { ...line, returnQty: qty, returnQtyMinor: clampedMinor, returnLineTotal: lineTotal };
      })
    );
  }, []);

  const updateReturnUnit = useCallback((lineId: string, unit: string) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return { ...line, returnUnitLevel: unit, returnQty: "0", returnQtyMinor: 0, returnLineTotal: 0 };
      })
    );
  }, []);

  const subtotal = useMemo(() => {
    return returnLines.reduce((s, l) => s + l.returnLineTotal, 0);
  }, [returnLines]);

  const computedDiscount = useMemo(() => {
    if (discountType === "percent") {
      return subtotal * (parseFloat(discountPercent) || 0) / 100;
    }
    return parseFloat(discountValue) || 0;
  }, [discountType, discountPercent, discountValue, subtotal]);

  const netTotal = useMemo(() => Math.max(0, subtotal - computedDiscount), [subtotal, computedDiscount]);

  const hasReturnItems = returnLines.some((l) => l.returnQtyMinor > 0);

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
      toast({ title: "تم تسجيل المرتجع", description: `فاتورة مرتجع رقم ${data.invoiceNumber} — صافي ${data.netTotal} ج.م` });
      qc.invalidateQueries({ queryKey: ["/api/sales-returns"] });
      clearInvoice();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message || "حدث خطأ أثناء تسجيل المرتجع", variant: "destructive" });
    },
  });

  return {
    selectedInvoiceId, invoiceData, invoiceLoading,
    selectInvoice, clearInvoice,
    returnLines, updateReturnQty, updateReturnUnit,
    discountType, setDiscountType,
    discountPercent, setDiscountPercent,
    discountValue, setDiscountValue,
    notes, setNotes,
    subtotal, computedDiscount, netTotal,
    hasReturnItems,
    submitReturn: submitMutation.mutate,
    isSubmitting: submitMutation.isPending,
  };
}
