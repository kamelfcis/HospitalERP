import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export interface PendingInvoice {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  customerType: string;
  customerName: string | null;
  subtotal: string;
  discountValue: string;
  netTotal: string;
  createdBy: string | null;
  status: string;
  createdAt: string;
  warehouseName: string | null;
  warehousePharmacyId: string | null;
}

export interface InvoiceDetails extends PendingInvoice {
  lines: {
    id: string;
    lineNo: number;
    itemId: string;
    qty: string;
    salePrice: string;
    lineTotal: string;
    itemName: string;
    itemCode: string;
  }[];
}

export function usePendingInvoices(hasActiveShift: boolean, shiftUnitType: string, shiftUnitId: string, shiftId: string | undefined) {
  const [salesSearch, setSalesSearch] = useState("");
  const [salesSelected, setSalesSelected] = useState<Set<string>>(new Set());
  const [returnsSearch, setReturnsSearch] = useState("");
  const [returnsSelected, setReturnsSelected] = useState<Set<string>>(new Set());
  const sseRef = useRef<EventSource | null>(null);

  const { data: pendingSales, isLoading: salesLoading } = useQuery<PendingInvoice[]>({
    queryKey: ["/api/cashier/pending-sales", shiftUnitType, shiftUnitId, salesSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ unitType: shiftUnitType, unitId: shiftUnitId });
      if (salesSearch) params.set("search", salesSearch);
      const res = await fetch(`/api/cashier/pending-sales?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب الفواتير");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftUnitId,
  });

  const { data: pendingReturns, isLoading: returnsLoading } = useQuery<PendingInvoice[]>({
    queryKey: ["/api/cashier/pending-returns", shiftUnitType, shiftUnitId, returnsSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ unitType: shiftUnitType, unitId: shiftUnitId });
      if (returnsSearch) params.set("search", returnsSearch);
      const res = await fetch(`/api/cashier/pending-returns?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب المرتجعات");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftUnitId,
  });

  const singleSalesId = salesSelected.size === 1 ? Array.from(salesSelected)[0] : null;
  const singleReturnsId = returnsSelected.size === 1 ? Array.from(returnsSelected)[0] : null;

  const { data: salesDetails } = useQuery<InvoiceDetails>({
    queryKey: ["/api/cashier/invoice", singleSalesId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/invoice/${singleSalesId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب تفاصيل الفاتورة");
      return res.json();
    },
    enabled: !!singleSalesId,
  });

  const { data: returnsDetails } = useQuery<InvoiceDetails>({
    queryKey: ["/api/cashier/invoice", singleReturnsId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/invoice/${singleReturnsId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب تفاصيل الفاتورة");
      return res.json();
    },
    enabled: !!singleReturnsId,
  });

  useEffect(() => {
    if (!hasActiveShift || !shiftUnitId) {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      return;
    }
    const es = new EventSource(`/api/cashier/sse/${shiftUnitId}`);
    sseRef.current = es;

    const invalidateSales = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-sales", shiftUnitType, shiftUnitId] });
    const invalidateReturns = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-returns", shiftUnitType, shiftUnitId] });
    const invalidateTotals = () => queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift", shiftId, "totals"] });

    es.addEventListener("invoice_finalized", () => { invalidateSales(); invalidateReturns(); });
    es.addEventListener("invoice_collected", () => { invalidateSales(); invalidateTotals(); });
    es.addEventListener("invoice_refunded", () => { invalidateReturns(); invalidateTotals(); });
    es.onerror = () => {
      es.close();
      setTimeout(() => { if (hasActiveShift) { invalidateSales(); invalidateReturns(); } }, 3000);
    };

    return () => { es.close(); sseRef.current = null; };
  }, [hasActiveShift, shiftUnitId, shiftUnitType, shiftId]);

  const clearSelection = () => {
    setSalesSelected(new Set());
    setReturnsSelected(new Set());
  };

  return {
    salesSearch, setSalesSearch, salesSelected, setSalesSelected,
    returnsSearch, setReturnsSearch, returnsSelected, setReturnsSelected,
    pendingSales, salesLoading, pendingReturns, returnsLoading,
    salesDetails, returnsDetails, clearSelection,
  };
}
