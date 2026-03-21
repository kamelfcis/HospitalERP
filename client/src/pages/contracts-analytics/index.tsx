/**
 * صفحة تحليلات العقود — Contracts Analytics (Phase 6)
 *
 * READ-ONLY operational + financial visibility dashboard.
 * All data comes from /api/contracts-analytics/* endpoints.
 *
 * Sections:
 *   1. Control Alerts       — anomaly flags (always shown first)
 *   2. AR Aging             — outstanding by age bucket
 *   3. Company Performance  — per-company summary
 *   4. Claim Variance       — claimed vs approved per batch
 */

import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

import { ARAgingTable }            from "./components/ARAgingTable";
import { CompanyPerformanceTable } from "./components/CompanyPerformanceTable";
import { VarianceTable }           from "./components/VarianceTable";
import { ControlAlerts }           from "./components/ControlAlerts";
import {
  useARAging,
  useCompanyPerformance,
  useClaimVariance,
  useControlFlags,
} from "./hooks/useContractsAnalytics";

// ─── Section wrapper for consistent visual rhythm ─────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground border-b pb-1">{title}</h2>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function ContractsAnalyticsPage() {
  const qc = useQueryClient();

  const aging       = useARAging();
  const performance = useCompanyPerformance();
  const variance    = useClaimVariance();
  const flags       = useControlFlags();

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["/api/contracts-analytics/ar-aging"] });
    qc.invalidateQueries({ queryKey: ["/api/contracts-analytics/company-performance"] });
    qc.invalidateQueries({ queryKey: ["/api/contracts-analytics/variance"] });
    qc.invalidateQueries({ queryKey: ["/api/contracts-analytics/control-flags"] });
  }

  return (
    <div className="p-4 space-y-6" dir="rtl">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            تحليلات العقود والذمم المدينة
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-analytics">
          <RefreshCw className="h-4 w-4 ml-1" />
          تحديث
        </Button>
      </div>

      {/* ── 1. Control Alerts ─────────────────────────────────────────── */}
      <Section title="تنبيهات التحكم">
        <ControlAlerts data={flags.data ?? []} isLoading={flags.isLoading} />
      </Section>

      {/* ── 2. AR Aging ───────────────────────────────────────────────── */}
      <Section title="تقادم الذمم المدينة — الذمم غير المحصّلة">
        <ARAgingTable data={aging.data ?? []} isLoading={aging.isLoading} />
      </Section>

      {/* ── 3. Company Performance ────────────────────────────────────── */}
      <Section title="أداء شركات التأمين">
        <CompanyPerformanceTable data={performance.data ?? []} isLoading={performance.isLoading} />
      </Section>

      {/* ── 4. Claim Variance ─────────────────────────────────────────── */}
      <Section title="فروق المطالبات — مطالَب به مقابل معتمد">
        <VarianceTable data={variance.data ?? []} isLoading={variance.isLoading} />
      </Section>

    </div>
  );
}
