/**
 * DoctorDailySummary.tsx
 *
 * Compact operational summary for the doctor's workday.
 * Render-only — all data comes via props from useDoctorDashboard hook.
 */

import { Stethoscope, Pill, Users, Clock, CheckCircle, XCircle } from "lucide-react";
import type { DoctorDailySummaryData } from "../hooks/useOutpatientDashboard";

function fmt(n: number) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface MetricRowProps {
  label: string;
  value: number | string;
  testId: string;
  className?: string;
}

function MetricRow({ label, value, testId, className = "" }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

interface Props {
  data: DoctorDailySummaryData;
}

export function DoctorDailySummary({ data }: Props) {
  if (data.noDoctorLinked) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-doctor-not-linked">
        لم يتم ربط حسابك بطبيب بعد. تواصل مع مدير النظام.
      </div>
    );
  }

  const { totalPatients, waiting, inConsultation, done, cancelled, noShow,
    serviceOrdersTotal, serviceOrdersPending, serviceOrdersExecuted,
    pharmacyOrdersTotal, pharmacyOrdersPending, pharmacyOrdersExecuted,
    grossConsultationFee, doctorDeductionTotal } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="section-doctor-dashboard">

      {/* ── مرضى اليوم ── */}
      <Section title="مرضى اليوم" icon={<Users className="h-4 w-4" />}>
        <MetricRow label="إجمالي المرضى"   value={totalPatients}  testId="text-doctor-total-patients"  className="text-foreground" />
        <MetricRow label="في الانتظار"      value={waiting}        testId="text-doctor-waiting"          className="text-amber-600 dark:text-amber-400" />
        <MetricRow label="في الكشف"         value={inConsultation} testId="text-doctor-in-consultation"  className="text-blue-600 dark:text-blue-400" />
        <MetricRow label="منتهي"            value={done}           testId="text-doctor-done"             className="text-emerald-600 dark:text-emerald-400" />
        <MetricRow label="ملغي"             value={cancelled}      testId="text-doctor-cancelled"        className="text-red-600 dark:text-red-400" />
        <MetricRow label="لم يحضر"          value={noShow}         testId="text-doctor-no-show"          className="text-muted-foreground" />
      </Section>

      {/* ── الطلبات الطبية ── */}
      <Section title="الطلبات الطبية" icon={<Stethoscope className="h-4 w-4" />}>
        <div className="mb-2">
          <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> خدمات (مختبر / أشعة)
          </p>
          <MetricRow label="الإجمالي"   value={serviceOrdersTotal}    testId="text-doctor-service-total"    />
          <MetricRow label="منفذ"       value={serviceOrdersExecuted} testId="text-doctor-service-executed" className="text-emerald-600 dark:text-emerald-400" />
          <MetricRow label="معلق"       value={serviceOrdersPending}  testId="text-doctor-service-pending"  className="text-amber-600 dark:text-amber-400" />
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
            <Pill className="h-3 w-3" /> وصفات دوائية
          </p>
          <MetricRow label="الإجمالي"   value={pharmacyOrdersTotal}    testId="text-doctor-pharmacy-total"    />
          <MetricRow label="منفذ"       value={pharmacyOrdersExecuted} testId="text-doctor-pharmacy-executed" className="text-emerald-600 dark:text-emerald-400" />
          <MetricRow label="معلق"       value={pharmacyOrdersPending}  testId="text-doctor-pharmacy-pending"  className="text-amber-600 dark:text-amber-400" />
        </div>
      </Section>

      {/* ── ملخص مالي ── */}
      <Section title="ملخص مالي" icon={<Clock className="h-4 w-4" />}>
        <MetricRow
          label="إجمالي رسوم الكشف"
          value={`${fmt(grossConsultationFee)} ج`}
          testId="text-doctor-gross-fee"
          className="text-foreground"
        />
        <MetricRow
          label="خصم الطبيب"
          value={`${fmt(doctorDeductionTotal)} ج`}
          testId="text-doctor-deduction"
          className="text-red-600 dark:text-red-400"
        />
        <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
          <span className="text-sm font-semibold text-foreground">الصافي المتوقع</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums" data-testid="text-doctor-net-fee">
            {fmt(grossConsultationFee - doctorDeductionTotal)} ج
          </span>
        </div>
      </Section>

      {/* ── ملاحظة ── */}
      <div className="md:col-span-1 flex items-end">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 w-full">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">مؤجل (غير متاح حالياً)</p>
              <p>تمييز جديد / متابعة · تصنيف مختبر مقابل أشعة</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
