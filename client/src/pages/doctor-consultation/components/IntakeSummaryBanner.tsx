import { useState } from "react";
import { ChevronDown, ChevronUp, Activity, Lock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIntake } from "../hooks/useIntake";

const VISIT_TYPE_LABELS: Record<string, string> = {
  new:            "مراجعة جديدة",
  follow_up:      "متابعة",
  review_results: "مراجعة نتائج",
  procedure:      "إجراء طبي",
  urgent:         "حالة طارئة",
};

interface VitalChipProps {
  label: string;
  value: string | null | undefined;
  unit?: string;
}
function VitalChip({ label, value, unit }: VitalChipProps) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}{unit}</span>
    </span>
  );
}

interface Props {
  appointmentId: string | undefined;
}

/**
 * Compact read-only intake summary shown at the top of the doctor consultation screen.
 * Collapses/expands to keep the consultation area uncluttered.
 */
export function IntakeSummaryBanner({ appointmentId }: Props) {
  const { data: intake, isLoading } = useIntake(appointmentId);
  const [expanded, setExpanded] = useState(true);

  if (isLoading || !intake) {
    return (
      <div className="border rounded-lg px-3 py-2 bg-muted/30 text-xs text-muted-foreground flex items-center gap-2">
        <Activity className="h-3 w-3 shrink-0" />
        {isLoading ? "جار تحميل بيانات الاستقبال..." : "لم يتم تسجيل الاستقبال بعد"}
      </div>
    );
  }

  const hasVitals = intake.bloodPressure || intake.pulse || intake.temperature ||
                    intake.weight || intake.height || intake.spo2 || intake.randomBloodSugar;

  return (
    <div className="border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-right"
        onClick={() => setExpanded((v) => !v)}
        data-testid="button-toggle-intake-banner"
      >
        <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
        <span className="font-semibold text-blue-700 dark:text-blue-400">بيانات الاستقبال</span>

        {intake.visitType && (
          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
            {VISIT_TYPE_LABELS[intake.visitType] ?? intake.visitType}
          </Badge>
        )}

        {intake.completedAt && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" />مكتمل
          </span>
        )}
        {intake.isLocked && (
          <span className="flex items-center gap-1 text-amber-600">
            <Lock className="h-3 w-3" />مقفل
          </span>
        )}

        {/* Quick vitals preview in collapsed state */}
        {!expanded && hasVitals && (
          <span className="text-muted-foreground truncate flex-1">
            {[
              intake.bloodPressure && `ضغط: ${intake.bloodPressure}`,
              intake.pulse && `نبض: ${intake.pulse}`,
              intake.temperature && `حرارة: ${intake.temperature}°`,
            ].filter(Boolean).join(" · ")}
          </span>
        )}

        <span className="mr-auto text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-blue-200/60">
          {/* Reason */}
          {intake.reasonForVisit && (
            <div className="pt-2">
              <span className="text-xs text-muted-foreground">سبب المراجعة: </span>
              <span className="text-sm font-medium">{intake.reasonForVisit}</span>
            </div>
          )}

          {/* Vitals grid */}
          {hasVitals && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <VitalChip label="ضغط" value={intake.bloodPressure} />
              <VitalChip label="نبض" value={intake.pulse} unit=" ن/د" />
              <VitalChip label="حرارة" value={intake.temperature} unit="°م" />
              <VitalChip label="وزن" value={intake.weight} unit=" كجم" />
              <VitalChip label="طول" value={intake.height} unit=" سم" />
              <VitalChip label="SpO₂" value={intake.spo2} unit="%" />
              <VitalChip label="سكر" value={intake.randomBloodSugar} unit=" مج/دل" />
            </div>
          )}

          {/* Notes */}
          {intake.intakeNotes && (
            <p className="text-xs text-muted-foreground border-t pt-1">
              <span className="font-medium">ملاحظات الاستقبال: </span>
              {intake.intakeNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
