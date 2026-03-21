import { useState } from "react";
import { ChevronDown, ChevronUp, User, CreditCard, AlertCircle, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIntake } from "../hooks/useIntake";
import type { Consultation } from "../types";

const VISIT_TYPE_LABELS: Record<string, string> = {
  new:            "مراجعة جديدة",
  follow_up:      "متابعة",
  review_results: "مراجعة نتائج",
  procedure:      "إجراء طبي",
  urgent:         "حالة طارئة",
};

const GENDER_LABELS: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CASH: "نقدي",
  INSURANCE: "تأمين",
  CONTRACT: "عقد",
};

interface VitalChipProps { label: string; value: string | null | undefined; unit?: string }
function VitalChip({ label, value, unit }: VitalChipProps) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}{unit}</span>
    </span>
  );
}

interface ChronicFlagsProps { flags: Record<string, boolean> | null | undefined }
function ChronicFlags({ flags }: ChronicFlagsProps) {
  if (!flags) return null;
  const LABELS: Record<string, string> = {
    is_diabetic:     "سكري",
    is_hypertensive: "ضغط",
    is_cardiac:      "قلب",
    is_asthmatic:    "ربو",
    is_smoker:       "مدخن",
  };
  const active = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => LABELS[k] ?? k);
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((label) => (
        <Badge key={label} variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
          {label}
        </Badge>
      ))}
    </div>
  );
}

interface Props {
  appointmentId: string | undefined;
  form: Consultation;
}

/**
 * Compact read-only patient header shown above the doctor consultation screen.
 * Collapsible to keep the workspace uncluttered.
 */
export function PatientSnapshot({ appointmentId, form }: Props) {
  const { data: intake } = useIntake(appointmentId);
  const [expanded, setExpanded] = useState(false);

  const gender = form.patientGender ?? null;
  const age    = form.patientAge ?? null;
  const hasVitals = intake && (
    intake.bloodPressure || intake.pulse || intake.temperature ||
    intake.weight || intake.height || intake.spo2 || intake.randomBloodSugar
  );
  const hasChronicFlags = intake?.structuredFlags && Object.values(intake.structuredFlags).some(Boolean);
  const payerLabel = form.paymentType ? (PAYMENT_TYPE_LABELS[form.paymentType] ?? form.paymentType) : null;

  return (
    <div className="border rounded-lg bg-slate-50/60 dark:bg-slate-900/30 border-slate-200/60">
      {/* ── compact header row ── */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-right"
        onClick={() => setExpanded((v) => !v)}
        data-testid="button-toggle-patient-snapshot"
      >
        <User className="h-3.5 w-3.5 text-slate-500 shrink-0" />

        {/* name + demographics */}
        <span className="font-semibold text-foreground truncate max-w-[18ch]">
          {form.patientName || "—"}
        </span>
        {(age !== null || gender) && (
          <span className="text-muted-foreground shrink-0">
            {[age != null ? `${age} سنة` : null, gender ? GENDER_LABELS[gender] ?? gender : null]
              .filter(Boolean).join(" · ")}
          </span>
        )}

        {/* visit type */}
        {intake?.visitType && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {VISIT_TYPE_LABELS[intake.visitType] ?? intake.visitType}
          </Badge>
        )}

        {/* chronic flags chip */}
        {hasChronicFlags && (
          <span className="flex items-center gap-1 text-orange-600 shrink-0">
            <AlertCircle className="h-3 w-3" />
            <span>أمراض مزمنة</span>
          </span>
        )}

        {/* payer */}
        {payerLabel && (
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <CreditCard className="h-3 w-3" />
            {payerLabel}
            {form.insuranceCompany && ` — ${form.insuranceCompany}`}
          </span>
        )}

        {/* vitals quick peek */}
        {!expanded && hasVitals && (
          <span className="text-muted-foreground truncate flex-1 text-right">
            {[
              intake.bloodPressure && `ضغط: ${intake.bloodPressure}`,
              intake.pulse && `نبض: ${intake.pulse}`,
            ].filter(Boolean).join(" · ")}
          </span>
        )}

        <span className="mr-auto text-muted-foreground shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* ── expanded details ── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-200/60">
          {/* reason for visit */}
          {intake?.reasonForVisit && (
            <div className="pt-2 text-xs">
              <span className="text-muted-foreground">سبب الزيارة: </span>
              <span className="font-medium">{intake.reasonForVisit}</span>
            </div>
          )}

          {/* latest diagnosis */}
          {form.latestDiagnosis && (
            <div className="text-xs flex items-start gap-1">
              <Stethoscope className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">آخر تشخيص: </span>
              <span className="font-medium text-foreground">{form.latestDiagnosis}</span>
            </div>
          )}

          {/* chronic flags */}
          {hasChronicFlags && (
            <div className="pt-0.5">
              <ChronicFlags flags={intake?.structuredFlags} />
            </div>
          )}

          {/* allergies placeholder */}
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            الحساسية: غير مسجلة
          </div>

          {/* vitals */}
          {hasVitals && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <VitalChip label="ضغط" value={intake?.bloodPressure} />
              <VitalChip label="نبض" value={intake?.pulse} unit=" ن/د" />
              <VitalChip label="حرارة" value={intake?.temperature} unit="°م" />
              <VitalChip label="وزن" value={intake?.weight} unit=" كجم" />
              <VitalChip label="طول" value={intake?.height} unit=" سم" />
              <VitalChip label="SpO₂" value={intake?.spo2} unit="%" />
              <VitalChip label="سكر" value={intake?.randomBloodSugar} unit=" مج/دل" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
