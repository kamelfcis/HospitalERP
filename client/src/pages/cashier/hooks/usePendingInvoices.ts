// ============================================================
//  usePendingInvoices — جلب البيانات وإدارة SSE
//
//  المسؤوليات الوحيدة:
//  1. جلب قائمة الفواتير المعلّقة (مبيعات + مرتجعات)
//  2. إنشاء اتصال SSE لتحديثات الفواتير لحظياً
//
//  ❌ لا يحتوي على search/selection state — تلك في useInvoiceTab
// ============================================================
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { PendingInvoice } from "../types";

interface UsePendingInvoicesParams {
  hasActiveShift: boolean;
  shiftUnitType: string;
  shiftUnitId: string;
  shiftId: string | undefined;
}

export function usePendingInvoices({
  hasActiveShift,
  shiftUnitType,
  shiftUnitId,
  shiftId,
}: UsePendingInvoicesParams) {
  const sseRef = useRef<EventSource | null>(null);

  // ── مفاتيح الـ cache (يستخدمها SSE أيضاً لإبطال الـ cache) ─
  const salesKey   = ["/api/cashier/pending-sales",   shiftUnitType, shiftUnitId] as const;
  const returnsKey = ["/api/cashier/pending-returns",  shiftUnitType, shiftUnitId] as const;
  const totalsKey  = ["/api/cashier/shift", shiftId, "totals"] as const;

  // ── جلب الفواتير المعلّقة ─────────────────────────────────
  const { data: pendingSales, isLoading: salesLoading } = useQuery<PendingInvoice[]>({
    queryKey: salesKey,
    queryFn: async () => {
      const params = new URLSearchParams({ unitType: shiftUnitType, unitId: shiftUnitId });
      const res = await fetch(`/api/cashier/pending-sales?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب الفواتير المعلّقة");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftUnitId,
  });

  // ── جلب المرتجعات المعلّقة ────────────────────────────────
  const { data: pendingReturns, isLoading: returnsLoading } = useQuery<PendingInvoice[]>({
    queryKey: returnsKey,
    queryFn: async () => {
      const params = new URLSearchParams({ unitType: shiftUnitType, unitId: shiftUnitId });
      const res = await fetch(`/api/cashier/pending-returns?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب المرتجعات المعلّقة");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftUnitId,
  });

  // ── اتصال SSE — تحديث فوري عند تغير الفواتير ─────────────
  useEffect(() => {
    if (!hasActiveShift || !shiftUnitId) {
      sseRef.current?.close();
      sseRef.current = null;
      return;
    }

    const es = new EventSource(`/api/cashier/sse/${shiftUnitId}`);
    sseRef.current = es;

    const invalidateSales   = () => queryClient.invalidateQueries({ queryKey: salesKey });
    const invalidateReturns = () => queryClient.invalidateQueries({ queryKey: returnsKey });
    const invalidateTotals  = () => queryClient.invalidateQueries({ queryKey: totalsKey });

    // أحداث SSE المدعومة
    es.addEventListener("invoice_finalized", () => { invalidateSales(); invalidateReturns(); });
    es.addEventListener("invoice_collected", () => { invalidateSales();  invalidateTotals(); });
    es.addEventListener("invoice_refunded",  () => { invalidateReturns(); invalidateTotals(); });

    // عند انقطاع الاتصال: إعادة جلب بعد 3 ثوان
    es.onerror = () => {
      es.close();
      setTimeout(() => {
        if (hasActiveShift) { invalidateSales(); invalidateReturns(); }
      }, 3000);
    };

    return () => { es.close(); sseRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveShift, shiftUnitId, shiftUnitType, shiftId]);

  return {
    pendingSales,  salesLoading,
    pendingReturns, returnsLoading,
  };
}
