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
  contractId: string;
  contractMemberId: string;
  companyId: string;
  companyCoveragePct: number;
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
    // ── حقول التعاقد (Phase 2) ──────────────────────────────────────────────
    contractId:       p.customerType === "contract" ? (p.contractId || null) : null,
    contractMemberId: p.customerType === "contract" ? (p.contractMemberId || null) : null,
    companyId:        p.customerType === "contract" ? (p.companyId || null) : null,
    // مجاميع الحصص — تُحسَب من السطور أدناه
    patientShareTotal: p.customerType === "contract" ? computePatientShareTotal(p.lines, p.companyCoveragePct, p.netTotal) : null,
    companyShareTotal: p.customerType === "contract" ? computeCompanyShareTotal(p.lines, p.companyCoveragePct, p.netTotal) : null,
    discountPercent: p.discountPct,
    discountValue: p.discountValue,
    subtotal: +p.subtotal.toFixed(2),
    netTotal: +p.netTotal.toFixed(2),
    notes: p.notes || null,
    clinicOrderId: (p.clinicOrderIds && p.clinicOrderIds.length > 0) ? p.clinicOrderIds.join(",") : (p.clinicOrderId || null),
  });

  const buildLines = () =>
    p.lines.map((ln, i) => {
      const companyShareAmount = p.customerType === "contract"
        ? +(ln.lineTotal * (p.companyCoveragePct / 100)).toFixed(2)
        : undefined;
      const patientShareAmount = p.customerType === "contract"
        ? +(ln.lineTotal - (companyShareAmount ?? 0)).toFixed(2)
        : undefined;

      return {
        itemId: ln.itemId,
        unitLevel: ln.unitLevel,
        qty: ln.qty,
        salePrice: ln.salePrice,
        lineTotal: ln.lineTotal,
        expiryMonth: ln.expiryMonth,
        expiryYear: ln.expiryYear,
        lotId: ln.lotId,
        lineNo: i + 1,
        ...(p.customerType === "contract" ? { companyShareAmount, patientShareAmount } : {}),
      };
    });

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

      // ── فحص فواتير التعاقد: يجب أن يكون المنتسب محدداً ─────────────────
      if (p.customerType === "contract" && !p.contractMemberId) {
        throw new Error("فاتورة التعاقد تتطلب تحديد المنتسب — يرجى البحث ببطاقة المنتسب");
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

// ── Helpers: company/patient share totals ──────────────────────────────────
function computeCompanyShareTotal(lines: SalesLineLocal[], pct: number, netTotal: number): string {
  const perLine = lines.reduce((sum, ln) => sum + +(ln.lineTotal * (pct / 100)).toFixed(2), 0);
  return Math.min(perLine, netTotal).toFixed(2);
}

function computePatientShareTotal(lines: SalesLineLocal[], pct: number, netTotal: number): string {
  const companyTotal = parseFloat(computeCompanyShareTotal(lines, pct, netTotal));
  return Math.max(0, netTotal - companyTotal).toFixed(2);
}
