/*
 * Cashier Handover — custom hooks
 * ─────────────────────────────────
 * useCashierNames   — distinct cashier name list for the dropdown
 * useHandoverData   — paginated shift summary with totals
 */

import { useQuery } from "@tanstack/react-query";
import type { HandoverFilters } from "./components/FilterBar";

/* ─── Cashier names dropdown ─────────────────────────────────── */
export function useCashierNames() {
  return useQuery<string[]>({
    queryKey: ["/api/cashier-shifts/cashier-names"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/* ─── Main report data ────────────────────────────────────────── */
function buildSummaryUrl(filters: HandoverFilters, page: number) {
  const p = new URLSearchParams();
  if (filters.from)                  p.set("from", filters.from);
  if (filters.to)                    p.set("to", filters.to);
  if (filters.cashierName)           p.set("cashierName", filters.cashierName);
  if (filters.status !== "all")      p.set("status", filters.status);
  p.set("page", String(page));
  p.set("pageSize", "100");
  return `/api/cashier-shifts/drawer-handover-summary?${p.toString()}`;
}

export function useHandoverData(filters: HandoverFilters, page: number) {
  return useQuery({
    queryKey: [
      "/api/cashier-shifts/drawer-handover-summary",
      filters.from,
      filters.to,
      filters.cashierName,
      filters.status,
      page,
    ],
    queryFn: async () => {
      const res = await fetch(buildSummaryUrl(filters, page), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
