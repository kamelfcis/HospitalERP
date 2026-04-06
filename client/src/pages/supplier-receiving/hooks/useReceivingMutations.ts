/**
 * useReceivingMutations — كل mutations إذن الاستلام
 *
 * - حفظ مسودة
 * - ترحيل
 * - حذف مسودة
 * - تحويل إلى فاتورة شراء
 * - تصحيح مستند
 */
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LineError, buildLinePayload } from "../types";
import type { UseReceivingLinesReturn } from "./useReceivingLines";

interface UseReceivingMutationsParams {
  // header fields
  supplierId:         string;
  supplierInvoiceNo:  string;
  warehouseId:        string;
  receiveDate:        string;
  formNotes:          string;
  editingReceivingId: string | null;
  // lines ref
  lines:              UseReceivingLinesReturn;
  // callbacks
  onSaveDraftSuccess:    (id: string | null, number: number | null) => void;
  onPostSuccess:         () => void;
  onCorrectSuccess:      (newId: string) => void;
  onConvertSuccess:      (invoiceId: string) => void;
  onDismissConfirm:      () => void;
  onEditPostedSuccess:   () => void;
  resetAutoSave:         () => void;
}

function buildHeaderPayload(p: Omit<UseReceivingMutationsParams,
  "lines" | "onSaveDraftSuccess" | "onPostSuccess" | "onCorrectSuccess" |
  "onConvertSuccess" | "onDismissConfirm" | "resetAutoSave" | "onEditPostedSuccess" | "editingReceivingId"
>) {
  return {
    supplierId:       p.supplierId,
    supplierInvoiceNo: p.supplierInvoiceNo,
    warehouseId:      p.warehouseId,
    receiveDate:      p.receiveDate,
    notes:            p.formNotes || undefined,
  };
}

export function useReceivingMutations({
  supplierId, supplierInvoiceNo, warehouseId, receiveDate, formNotes,
  editingReceivingId, lines,
  onSaveDraftSuccess, onPostSuccess, onCorrectSuccess, onConvertSuccess,
  onDismissConfirm, onEditPostedSuccess, resetAutoSave,
}: UseReceivingMutationsParams) {
  const { toast } = useToast();

  const buildPayload = () => ({
    header: buildHeaderPayload({ supplierId, supplierInvoiceNo, warehouseId, receiveDate, formNotes }),
    lines:  lines.buildLinesPayload(),
  });

  const runValidation = (): boolean => {
    const errors = lines.validateLines();
    if (errors.length === 0) { lines.setLineErrors([]); return true; }
    lines.setLineErrors(errors);
    focusFirstError(errors, lines);
    return false;
  };

  // ── حفظ مسودة ──────────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!runValidation()) throw new Error("لا يمكن الحفظ: راجع الأخطاء في السطور");
      const payload = buildPayload();
      if (editingReceivingId) {
        return apiRequest("PATCH", `/api/receivings/${editingReceivingId}`, payload);
      }
      return apiRequest("POST", "/api/receivings", payload);
    },
    onSuccess: async (res) => {
      toast({ title: "تم حفظ المسودة بنجاح" });
      resetAutoSave();
      let id: string | null = editingReceivingId;
      let num: number | null = null;
      if (!editingReceivingId) {
        try { const d = await res.json(); id = d.id ?? null; num = d.receivingNumber ?? null; } catch {}
      }
      onSaveDraftSuccess(id, num);
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في حفظ المسودة", description: err.message, variant: "destructive" });
    },
  });

  // ── ترحيل ───────────────────────────────────────────────────────────────
  const postReceivingMutation = useMutation({
    mutationFn: async () => {
      if (!runValidation()) throw new Error("لا يمكن الترحيل: راجع الأخطاء في السطور");
      const payload = buildPayload();
      if (editingReceivingId) {
        await apiRequest("PATCH", `/api/receivings/${editingReceivingId}`, payload);
        await apiRequest("POST", `/api/receivings/${editingReceivingId}/post`);
      } else {
        const createRes = await apiRequest("POST", "/api/receivings", payload);
        const created   = await createRes.json();
        await apiRequest("POST", `/api/receivings/${created.id}/post`);
      }
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل إذن الاستلام بنجاح" });
      onPostSuccess();
      onDismissConfirm();
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في ترحيل إذن الاستلام", description: err.message, variant: "destructive" });
      onDismissConfirm();
    },
  });

  // ── حذف مسودة ──────────────────────────────────────────────────────────
  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/receivings/${id}`),
    onSuccess: () => {
      toast({ title: "تم حذف إذن الاستلام" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في حذف إذن الاستلام", description: err.message, variant: "destructive" });
    },
  });

  // ── تحويل إلى فاتورة شراء ───────────────────────────────────────────────
  const convertToInvoiceMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/receivings/${id}/convert-to-invoice`),
    onSuccess: async (res) => {
      const invoice = await res.json();
      toast({ title: "تم التحويل إلى فاتورة شراء بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      onConvertSuccess(invoice.id);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في التحويل", description: err.message, variant: "destructive" });
    },
  });

  // ── تصحيح مستند ─────────────────────────────────────────────────────────
  const correctReceivingMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/receivings/${id}/correct`),
    onSuccess: async (res) => {
      const newReceiving = await res.json();
      toast({ title: "تم إنشاء مستند التصحيح بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      onCorrectSuccess(newReceiving.id);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في إنشاء التصحيح", description: err.message, variant: "destructive" });
    },
  });

  // ── تعديل استلام مُرحَّل (posted_qty_only) ──────────────────────────────
  const editPostedMutation = useMutation({
    mutationFn: async () => {
      if (!editingReceivingId) throw new Error("لا يوجد إذن استلام محدد");
      if (!runValidation()) throw new Error("راجع الأخطاء في السطور");
      const linesPayload = lines.buildLinesPayload();
      return apiRequest("PATCH", `/api/receivings/${editingReceivingId}/edit-posted`, { lines: linesPayload });
    },
    onSuccess: () => {
      toast({ title: "تم حفظ التعديلات بنجاح", description: "تم تحديث المخزون والقيد المحاسبي تلقائيًا" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      onEditPostedSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في حفظ التعديلات", description: err.message, variant: "destructive" });
    },
  });

  const isPending =
    saveDraftMutation.isPending ||
    postReceivingMutation.isPending ||
    correctReceivingMutation.isPending ||
    convertToInvoiceMutation.isPending ||
    editPostedMutation.isPending;

  return {
    saveDraftMutation,
    postReceivingMutation,
    deleteDraftMutation,
    convertToInvoiceMutation,
    correctReceivingMutation,
    editPostedMutation,
    isPending,
  };
}

// ── مساعد: التركيز على أول خطأ ─────────────────────────────────────────
function focusFirstError(
  errors: LineError[],
  lines: UseReceivingLinesReturn,
) {
  const first = errors[0];
  if (!first) return;
  if (first.field === "salePrice") {
    lines.salePriceInputRefs.current.get(first.lineIndex)?.focus();
  } else if (first.field === "expiry") {
    const el = lines.expiryInputRefs.current.get(first.lineIndex);
    (el?.querySelector("input") as HTMLInputElement | null)?.focus();
  }
}
