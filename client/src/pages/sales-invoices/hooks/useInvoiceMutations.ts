import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SalesLineLocal } from "../types";

interface MutationParams {
  editId: string | null;
  isNew: boolean;
  warehouseId: string;
  invoiceDate: string;
  customerType: string;
  customerName: string;
  contractCompany: string;
  discountPct: number;
  discountValue: number;
  subtotal: number;
  netTotal: number;
  notes: string;
  lines: SalesLineLocal[];
  onSaveSuccess: (id?: string) => void;
  onFinalizeSuccess: () => void;
  lastAutoSaveDataRef: React.MutableRefObject<string>;
  setAutoSaveStatus: (s: "idle" | "saving" | "saved" | "error") => void;
  navigate: (path: string) => void;
}

export function useInvoiceMutations(p: MutationParams) {
  const { toast } = useToast();

  const buildHeader = () => ({
    warehouseId: p.warehouseId,
    invoiceDate: p.invoiceDate,
    customerType: p.customerType,
    customerName: p.customerName || null,
    contractCompany: p.customerType === "contract" ? p.contractCompany : null,
    discountPercent: p.discountPct,
    discountValue: p.discountValue,
    subtotal: +p.subtotal.toFixed(2),
    netTotal: +p.netTotal.toFixed(2),
    notes: p.notes || null,
  });

  const buildLines = () =>
    p.lines.map((ln, i) => ({
      itemId: ln.itemId,
      unitLevel: ln.unitLevel,
      qty: ln.qty,
      salePrice: ln.salePrice,
      lineTotal: ln.lineTotal,
      expiryMonth: ln.expiryMonth,
      expiryYear: ln.expiryYear,
      lotId: ln.lotId,
      lineNo: i + 1,
    }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!p.warehouseId) throw new Error("يجب اختيار المخزن");
      if (p.lines.length === 0) throw new Error("يجب إضافة صنف واحد على الأقل");
      const header = buildHeader();
      const linesPayload = buildLines();
      if (p.isNew) {
        const res = await apiRequest("POST", "/api/sales-invoices", { header, lines: linesPayload });
        return await res.json();
      } else {
        await apiRequest("PATCH", `/api/sales-invoices/${p.editId}`, { header, lines: linesPayload });
        return null;
      }
    },
    onSuccess: (data) => {
      toast({ title: "تم الحفظ بنجاح" });
      p.lastAutoSaveDataRef.current = "";
      p.setAutoSaveStatus("idle");
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      if (p.isNew && data?.id) {
        p.navigate(`/sales-invoices?id=${data.id}`);
      } else if (p.editId) {
        queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", p.editId] });
      }
      p.onSaveSuccess(data?.id);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (p.isNew) {
        const saveRes = await saveMutation.mutateAsync();
        const id = saveRes?.id || p.editId;
        if (id) await apiRequest("POST", `/api/sales-invoices/${id}/finalize`);
      } else {
        await saveMutation.mutateAsync();
        await apiRequest("POST", `/api/sales-invoices/${p.editId}/finalize`);
      }
    },
    onSuccess: () => {
      toast({ title: "تم الاعتماد النهائي بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      if (p.editId) queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", p.editId] });
      p.onFinalizeSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الاعتماد", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sales-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  return { saveMutation, finalizeMutation, deleteMutation };
}
