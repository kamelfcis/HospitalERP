import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, X } from "lucide-react";

const QUICK_DAYS: { label: string; days: number }[] = [
  { label: "٣ أيام",   days: 3  },
  { label: "أسبوع",    days: 7  },
  { label: "أسبوعان",  days: 14 },
  { label: "شهر",      days: 30 },
  { label: "٣ أشهر",   days: 90 },
];

/**
 * Calculate ISO date string (YYYY-MM-DD) by adding days to a base date.
 * Uses UTC arithmetic to avoid timezone edge cases.
 */
function addDaysISO(baseDateStr: string | undefined, days: number): string {
  const base = baseDateStr ? new Date(baseDateStr + "T00:00:00Z") : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

interface Props {
  appointmentDate?: string;
  followUpAfterDays: number | null | undefined;
  followUpReason: string | null | undefined;
  suggestedFollowUpDate: string | null | undefined;
  onChange: (patch: {
    followUpAfterDays?: number | null;
    followUpReason?: string | null;
    suggestedFollowUpDate?: string | null;
  }) => void;
}

export function FollowUpActions({
  appointmentDate,
  followUpAfterDays,
  followUpReason,
  suggestedFollowUpDate,
  onChange,
}: Props) {
  function selectDays(days: number) {
    const dateStr = addDaysISO(appointmentDate, days);
    onChange({ followUpAfterDays: days, suggestedFollowUpDate: dateStr });
  }

  function handleCustomDays(raw: string) {
    const n = parseInt(raw);
    if (!raw) {
      onChange({ followUpAfterDays: null, suggestedFollowUpDate: null });
      return;
    }
    if (isNaN(n) || n < 1) return;
    const dateStr = addDaysISO(appointmentDate, n);
    onChange({ followUpAfterDays: n, suggestedFollowUpDate: dateStr });
  }

  function handleDateOverride(raw: string) {
    onChange({ suggestedFollowUpDate: raw || null });
  }

  function handleClear() {
    onChange({ followUpAfterDays: null, followUpReason: null, suggestedFollowUpDate: null });
  }

  const hasValue = followUpAfterDays != null || suggestedFollowUpDate;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">المتابعة المقررة</span>
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5"
            data-testid="button-followup-clear"
          >
            <X className="h-3 w-3" />
            مسح
          </button>
        )}
      </div>

      {/* Quick day buttons */}
      <div className="flex flex-wrap gap-1">
        {QUICK_DAYS.map((q) => (
          <Button
            key={q.days}
            type="button"
            size="sm"
            variant={followUpAfterDays === q.days ? "default" : "outline"}
            className="h-6 text-xs px-2"
            onClick={() => selectDays(q.days)}
            data-testid={`button-followup-days-${q.days}`}
          >
            {q.label}
          </Button>
        ))}
        {/* Custom days input */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={followUpAfterDays ?? ""}
            onChange={(e) => handleCustomDays(e.target.value)}
            placeholder="أيام"
            className="h-6 w-16 text-xs text-center px-1"
            data-testid="input-followup-custom-days"
          />
        </div>
      </div>

      {/* Suggested date display + override */}
      {(hasValue) && (
        <div className="flex items-center gap-2 bg-muted/30 rounded px-2 py-1">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">الموعد المقترح:</span>
          <Input
            type="date"
            value={suggestedFollowUpDate ?? ""}
            onChange={(e) => handleDateOverride(e.target.value)}
            className="h-6 text-xs px-1 w-36 border-0 bg-transparent focus-visible:ring-0"
            data-testid="input-followup-date"
            dir="ltr"
          />
        </div>
      )}

      {/* Follow-up reason */}
      <Textarea
        value={followUpReason ?? ""}
        onChange={(e) => onChange({ followUpReason: e.target.value || null })}
        placeholder="سبب المتابعة أو تعليمات للمريض (اختياري)"
        rows={2}
        className="text-sm resize-none"
        data-testid="textarea-followup-reason"
      />
    </div>
  );
}
