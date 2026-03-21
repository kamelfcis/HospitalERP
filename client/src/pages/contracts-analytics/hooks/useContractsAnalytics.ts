/**
 * useContractsAnalytics — Phase 6
 *
 * Data-fetching hooks for all analytics endpoints.
 * All queries are read-only. Results are cached for 2 minutes.
 */

import { useQuery } from "@tanstack/react-query";
import type {
  ARAging,
  CompanyPerformance,
  ClaimVariance,
  ControlFlag,
} from "@/pages/contracts-analytics/types";

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `فشل تحميل البيانات من ${url}`);
  }
  return res.json();
}

export function useARAging() {
  return useQuery<ARAging[]>({
    queryKey: ["/api/contracts-analytics/ar-aging"],
    queryFn:  () => fetchJson<ARAging[]>("/api/contracts-analytics/ar-aging"),
    staleTime: STALE_TIME,
  });
}

export function useCompanyPerformance() {
  return useQuery<CompanyPerformance[]>({
    queryKey: ["/api/contracts-analytics/company-performance"],
    queryFn:  () => fetchJson<CompanyPerformance[]>("/api/contracts-analytics/company-performance"),
    staleTime: STALE_TIME,
  });
}

export function useClaimVariance() {
  return useQuery<ClaimVariance[]>({
    queryKey: ["/api/contracts-analytics/variance"],
    queryFn:  () => fetchJson<ClaimVariance[]>("/api/contracts-analytics/variance"),
    staleTime: STALE_TIME,
  });
}

export function useControlFlags() {
  return useQuery<ControlFlag[]>({
    queryKey: ["/api/contracts-analytics/control-flags"],
    queryFn:  () => fetchJson<ControlFlag[]>("/api/contracts-analytics/control-flags"),
    staleTime: STALE_TIME,
  });
}
