/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useDeliveryPaymentsData
 *  جلب بيانات شاشة تحصيل فواتير التوصيل المنزلي
 *
 *  يُصدِّر:
 *    - الأنواع الأساسية (DeliveryInvoiceRow, InvoicesResult, ReportRow)
 *    - الـ hook الذي يحمل الـ queries + SSE
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect }        from "react";
import { useQuery }         from "@tanstack/react-query";
import { queryClient }      from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterStatus = "unpaid" | "paid" | "all";
export type ActiveTab    = "payment" | "report";

export interface DeliveryInvoiceRow {
  invoiceId:     string;
  invoiceNumber: number;
  invoiceDate:   string;
  netTotal:      string;
  totalPaid:     string;
  remaining:     string;
  status:        string;
  customerName:  string | null;
  pharmacyId:    string | null;
}

export interface InvoicesResult {
  rows:             DeliveryInvoiceRow[];
  totalNetInvoiced: string;
  totalPaid:        string;
  totalRemaining:   string;
}

export interface ReportRow {
  receiptId:     string;
  receiptNumber: number;
  receiptDate:   string;
  totalAmount:   string;
  paymentMethod: string;
  reference:     string | null;
  createdBy:     string | null;
  cashierName:   string | null;
  invoiceCount:  number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeliveryPaymentsData(filterStatus: FilterStatus, activeTab: ActiveTab) {
  const {
    data:   invoicesData,
    isLoading,
    refetch: refetchInvoices,
  } = useQuery<InvoicesResult>({
    queryKey: ["/api/delivery-payments/invoices", filterStatus],
    queryFn:  async () => {
      const r = await fetch(`/api/delivery-payments/invoices?filter=${filterStatus}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب الفواتير");
      return r.json();
    },
  });

  const {
    data:     reportData,
    isLoading: reportLoading,
    refetch:  refetchReport,
  } = useQuery<ReportRow[]>({
    queryKey: ["/api/delivery-payments/report"],
    queryFn:  async () => {
      const r = await fetch("/api/delivery-payments/report", { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب التقرير");
      return r.json();
    },
    enabled: activeTab === "report",
  });

  // SSE — تحديث تلقائي عند وصول تحصيل جديد
  useEffect(() => {
    const es = new EventSource("/api/delivery-payments/sse", { withCredentials: true });
    es.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/report"] });
    };
    return () => es.close();
  }, []);

  return { invoicesData, isLoading, refetchInvoices, reportData, reportLoading, refetchReport };
}
