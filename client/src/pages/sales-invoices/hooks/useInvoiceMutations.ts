import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getUnitOptions } from "@/lib/invoice-lines";
import type { SalesLineLocal } from "../types";

interface MutationParams {
  editId: string | null;
  isNew: boolean;
  warehouseId: string;
  invoiceDate: string;
  customerType: string;
  customerName: string;
  customerId: string;
  contractCompany: string;
  discountPct: number;
  discountValue: number;
  subtotal: number;
  netTotal: number;
  notes: string;
  clinicOrderId?: string | null;
  clinicOrderIds?: string[];
  lines: SalesLineLocal[];
  onSaveSuccess: (id?: string) => void;
  onFinalizeSuccess: () => void;
  navigate: (path: string) => void;
}

export function useInvoiceMutations(p: MutationParams) {
  const { toast } = useToast();

  const buildHeader = () => ({
    warehouseId: p.warehouseId,
    invoiceDate: p.invoiceDate,
    customerType: p.customerType,
    customerName: p.customerName || null,
    customerId: p.customerType === "credit" ? (p.customerId || null) : null,
    contractCompany: p.customerType === "contract" ? p.contractCompany : null,
    discountPercent: p.discountPct,
    discountValue: p.discountValue,
    subtotal: +p.subtotal.toFixed(2),
    netTotal: +p.netTotal.toFixed(2),
    notes: p.notes || null,
    clinicOrderId: (p.clinicOrderIds && p.clinicOrderIds.length > 0) ? p.clinicOrderIds.join(",") : (p.clinicOrderId || null),
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
      // ── فحص أمامي: منع الاعتماد إذا كانت أي وحدة غير قابلة للتسعير ──
      for (const ln of p.lines) {
        const opts = getUnitOptions(ln.item);
        const chosen = opts.find((o) => o.value === ln.unitLevel);
        if (chosen && !chosen.priceable) {
          const unitName = chosen.label;
          const itemName = ln.item?.nameAr || ln.itemId;
          throw new Error(
            `الصنف "${itemName}" بوحدة "${unitName}": معامل التحويل غير معرّف — يجب إعداد الصنف قبل الاعتماد`
          );
        }
      }

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
      toast({ title: "✓ تم الاعتماد — جاري فتح فاتورة جديدة" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      if (p.editId) queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", p.editId] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-doctor-statement"] });
      p.onFinalizeSuccess();
      p.navigate("/sales-invoices?id=new");
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
