import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Consultation } from "../types";

const SECTION_FIELDS: {
  key: keyof Pick<Consultation, "subjectiveSummary" | "objectiveSummary" | "assessmentSummary" | "planSummary" | "followUpPlan">;
  label: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "subjectiveSummary",
    label: "S — ذاتي (شكوى المريض)",
    placeholder: "ما يصفه المريض من أعراض وتاريخ مرضي...",
    rows: 2,
  },
  {
    key: "objectiveSummary",
    label: "O — موضوعي (الفحص السريري)",
    placeholder: "نتائج الفحص الجسدي والعلامات الحيوية...",
    rows: 2,
  },
  {
    key: "assessmentSummary",
    label: "A — التقييم",
    placeholder: "التشخيص والتقييم السريري...",
    rows: 2,
  },
  {
    key: "planSummary",
    label: "P — الخطة العلاجية",
    placeholder: "الأدوية، الإجراءات، التحويلات...",
    rows: 2,
  },
  {
    key: "followUpPlan",
    label: "المتابعة",
    placeholder: "موعد المتابعة وتعليمات المريض...",
    rows: 2,
  },
];

const FOLLOWUP_QUICK: { label: string; value: string }[] = [
  { label: "أسبوع",   value: "مراجعة بعد أسبوع." },
  { label: "أسبوعان", value: "مراجعة بعد أسبوعين." },
  { label: "شهر",     value: "مراجعة بعد شهر." },
  { label: "٣ أشهر",  value: "مراجعة بعد ثلاثة أشهر." },
  { label: "عند الحاجة", value: "مراجعة عند الحاجة." },
];

interface Props {
  form: Consultation;
  onChange: <K extends keyof Consultation>(key: K, value: Consultation[K]) => void;
}

/**
 * SOAP structured encounter panel.
 * All fields are optional — existing chiefComplaint/diagnosis/notes remain untouched.
 */
export function StructuredConsultationPanel({ form, onChange }: Props) {
  function handleQuickFollowUp(value: string) {
    const current = (form.followUpPlan ?? "").trim();
    onChange("followUpPlan", current ? `${current}\n${value}` : value);
  }

  return (
    <div className="space-y-3" dir="rtl">
      {SECTION_FIELDS.map(({ key, label, placeholder, rows }) => (
        <div key={key} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          {key === "followUpPlan" ? (
            <>
              {/* quick follow-up buttons */}
              <div className="flex flex-wrap gap-1 mb-1">
                {FOLLOWUP_QUICK.map((q) => (
                  <Button
                    key={q.label}
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    type="button"
                    onClick={() => handleQuickFollowUp(q.value)}
                    data-testid={`button-followup-${q.label}`}
                  >
                    {q.label}
                  </Button>
                ))}
              </div>
              <Textarea
                value={form[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className="text-sm resize-none"
                data-testid={`textarea-${key}`}
              />
            </>
          ) : (
            <Textarea
              value={form[key] ?? ""}
              onChange={(e) => onChange(key, e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className="text-sm resize-none"
              data-testid={`textarea-${key}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
