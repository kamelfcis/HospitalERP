/**
 * SecretaryDailySummary.tsx
 *
 * Compact operational summary for the secretary / front-desk workday.
 * Render-only — all data comes via props from useSecretaryDashboard hook.
 */

import { Users, Wallet } from "lucide-react";
import { ClinicRevenueTable } from "./ClinicRevenueTable";
import type { SecretaryDailySummaryData } from "../hooks/useOutpatientDashboard";

interface StatusBadgeProps {
  label: string;
  count: number;
  colorClass: string;
  testId: string;
}

function StatusBadge({ label, count, colorClass, testId }: StatusBadgeProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border p-3 ${colorClass}`}
      data-testid={testId}
    >
      <span className="text-2xl font-bold tabular-nums">{count}</span>
      <span className="text-xs mt-0.5 font-medium">{label}</span>
    </div>
  );
}

interface Props {
  data: SecretaryDailySummaryData;
}

export function SecretaryDailySummary({ data }: Props) {
  const { totalBookings, waiting, inConsultation, done, cancelled, noShow,
    grossTotal, paidTotal, paymentBreakdown } = data;

  return (
    <div className="space-y-5" data-testid="section-secretary-dashboard">

      {/* ── إحصائيات الحجوزات ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">حجوزات اليوم</h3>
          <span
            className="mr-auto text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full"
            data-testid="text-secretary-total-bookings"
          >
            الإجمالي: {totalBookings}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <StatusBadge
            label="انتظار"
            count={waiting}
            colorClass="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
            testId="badge-secretary-waiting"
          />
          <StatusBadge
            label="كشف"
            count={inConsultation}
            colorClass="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
            testId="badge-secretary-in-consultation"
          />
          <StatusBadge
            label="منتهي"
            count={done}
            colorClass="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            testId="badge-secretary-done"
          />
          <StatusBadge
            label="ملغي"
            count={cancelled}
            colorClass="border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
            testId="badge-secretary-cancelled"
          />
          <StatusBadge
            label="لم يحضر"
            count={noShow}
            colorClass="border-border bg-muted/40 text-muted-foreground"
            testId="badge-secretary-no-show"
          />
        </div>
      </div>

      {/* ── الإيرادات ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">إيرادات اليوم</h3>
        </div>
        <ClinicRevenueTable
          rows={paymentBreakdown}
          grossTotal={grossTotal}
          paidTotal={paidTotal}
        />
      </div>

    </div>
  );
}
