/**
 * useInvoiceMutations — mutations فاتورة الشراء
 *
 * ثلاثة mutations:
 *  - save     : حفظ مسودة (PATCH)
 *  - approve  : اعتماد وتسعير (PATCH + POST approve)
 *  - delete   : حذف فاتورة (DELETE)
 */
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatLineErrors, buildLinePayload } from "../types";
import type { InvoiceLineLocal } from "../types";

interface Params {
  editId:        string | null;
  lines:         InvoiceLineLocal[];
  invoiceDate:   string;
  notes:         string;
  discountType:  string;
  discountValue: number;
  onSaveSuccess?:    () => void;
  onApproveSuccess?: () => void;
  onDeleteSuccess?:  () => void;
}

export function useInvoiceMutations({
  editId, lines, invoiceDate, notes, discountType, discountValue,
  onSaveSuccess, onApproveSuccess, onDeleteSuccess,
}: Params) {
  const { toast } = useToast();

  // بناء body مشترك للحفظ والاعتماد
  const buildBody = () => ({
    lines: lines.map(buildLinePayload),
    discountType, discountValue, invoiceDate, notes,
  });

  // ── حفظ ─────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const errorText = formatLineErrors(lines);
      if (errorText) throw new Error(`لا يمكن الحفظ بسبب أخطاء في بيانات الأصناف:\n${errorText}`);
      await apiRequest("PATCH", `/api/purchase-invoices/${editId}`, buildBody());
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-invoices/${editId}`] });
      onSaveSuccess?.();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  // ── اعتماد وتسعير ────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async () => {
      const errorText = formatLineErrors(lines);
      if (errorText) throw new Error(`لا يمكن الاعتماد بسبب أخطاء في بيانات الأصناف:\n${errorText}`);
      await apiRequest("PATCH", `/api/purchase-invoices/${editId}`, buildBody());
      await apiRequest("POST",  `/api/purchase-invoices/${editId}/approve`);
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ والاعتماد والتسعير بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-invoices/${editId}`] });
      onApproveSuccess?.();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الاعتماد", description: err.message, variant: "destructive" });
    },
  });

  // ── حذف ──────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      onDeleteSuccess?.();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  const isPending = saveMutation.isPending || approveMutation.isPending;

  return { saveMutation, approveMutation, deleteMutation, isPending };
}
