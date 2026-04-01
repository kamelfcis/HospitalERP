// ============================================================
//  useInvoiceTab — hook لإدارة حالة تاب واحد (مبيعات أو مرتجعات)
//
//  المسؤوليات:
//  1. حالة البحث النصي
//  2. حالة الاختيار (Set<id>)
//  3. تفاصيل الفاتورة المختارة (إن كانت واحدة)
//  4. إجمالي الاختيار المتعدد (aggregated)
//
//  📌 كل تاب له instance مستقل — لا يتشاركان state
// ============================================================
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PendingInvoice, InvoiceDetails, SelectionAggregated } from "../types";
import { getCollectibleAmount } from "../utils/collectibleAmount";

interface UseInvoiceTabProps {
  /** قائمة الفواتير المرفوعة من hook جلب البيانات */
  invoices: PendingInvoice[] | undefined;
  /** هل الوردية نشطة؟ (لتفعيل الجلب) */
  hasActiveShift: boolean;
  /** endpoint تفاصيل الفاتورة: /api/cashier/invoice/{id}/details */
  detailsEndpoint: (id: string) => string;
}

export function useInvoiceTab({ invoices, hasActiveShift, detailsEndpoint }: UseInvoiceTabProps) {
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  // ── تصفية بالبحث محلياً (بدون request للسيرفر) ───────────
  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(
      (inv) =>
        String(inv.invoiceNumber).includes(q) ||
        (inv.customerName || "").toLowerCase().includes(q) ||
        (inv.createdBy || "").toLowerCase().includes(q)
    );
  }, [invoices, search]);

  // ── toggle فاتورة واحدة ──────────────────────────────────
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── toggle الكل (من القائمة المفلترة) ────────────────────
  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((i) => i.id))
    );
  }, [filtered]);

  // ── تفاصيل فاتورة واحدة (عند اختيار فاتورة واحدة فقط) ─
  const singleId = selected.size === 1 ? Array.from(selected)[0] : null;

  const { data: details, isLoading: detailsLoading } = useQuery<InvoiceDetails>({
    queryKey: [detailsEndpoint(singleId || ""), singleId],
    queryFn: async () => {
      const res = await fetch(detailsEndpoint(singleId!), { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب تفاصيل الفاتورة");
      return res.json();
    },
    enabled: !!singleId && hasActiveShift,
  });

  // ── إجمالي اختيار متعدد (أكثر من فاتورة) ────────────────
  const aggregated = useMemo((): SelectionAggregated | null => {
    if (selected.size <= 1 || !invoices) return null;
    const items = invoices.filter((inv) => selected.has(inv.id));
    return {
      count:            items.length,
      subtotal:         items.reduce((s, i) => s + parseFloat(i.subtotal || "0"), 0),
      netTotal:         items.reduce((s, i) => s + parseFloat(i.netTotal || "0"), 0),
      // للفواتير التعاقدية: يُجمَع نصيب المريض فقط، لا الإجمالي الكامل
      collectibleTotal: items.reduce((s, i) => s + getCollectibleAmount(i), 0),
    };
  }, [selected, invoices]);

  // ── مسح الاختيار والبحث ────────────────────────────────
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const clearAll       = useCallback(() => { setSelected(new Set()); setSearch(""); }, []);

  return {
    // بحث
    search, setSearch,
    // قائمة مفلترة
    filtered,
    // اختيار
    selected, setSelected, toggleOne, toggleAll,
    // تفاصيل فاتورة واحدة
    singleId, details, detailsLoading,
    // تجميع متعدد
    aggregated,
    // أدوات
    clearSelection, clearAll,
  };
}
