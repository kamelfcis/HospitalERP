import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, ChevronDown, ChevronUp, History, Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface PreviousConsultation {
  id: string;
  chief_complaint?: string;
  diagnosis?: string;
  notes?: string;
  consultation_fee?: string;
  discount_value?: string;
  final_amount?: string;
  payment_status?: string;
  appointment_date?: string;
  turn_number?: number;
  doctor_name?: string;
  clinic_name?: string;
  drugs?: Array<{
    drug_name: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    quantity?: number;
  }>;
}

interface Props {
  patientId: string | null | undefined;
  currentAppointmentId: string;
}

export function PatientHistoryPanel({ patientId, currentAppointmentId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: consultations = [], isLoading } = useQuery<PreviousConsultation[]>({
    queryKey: ["/api/patients", patientId, "previous-consultations"],
    queryFn: () =>
      apiRequest("GET", `/api/patients/${patientId}/previous-consultations?limit=5`).then((r) => r.json()),
    enabled: !!patientId,
  });

  if (!patientId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        تحميل تاريخ المريض...
      </div>
    );
  }

  if (consultations.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <History className="h-3 w-3" />
        لا توجد زيارات سابقة
      </div>
    );
  }

  return (
    <div className="space-y-1" dir="rtl">
      {consultations.map((c) => {
        const isExpanded = expandedId === c.id;
        const fmtDate = c.appointment_date
          ? new Date(c.appointment_date).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })
          : "";
        return (
          <div key={c.id} className="border rounded-lg overflow-hidden text-xs" data-testid={`history-item-${c.id}`}>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-right"
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
            >
              <History className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground" dir="ltr">{fmtDate}</span>
              {c.clinic_name && (
                <Badge variant="outline" className="text-xs h-4 px-1">{c.clinic_name}</Badge>
              )}
              {c.doctor_name && (
                <span className="text-muted-foreground">د. {c.doctor_name}</span>
              )}
              <div className="flex-1" />
              {(c.drugs?.length ?? 0) > 0 && (
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Pill className="h-3 w-3" />
                  {c.drugs!.length}
                </span>
              )}
              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="px-3 py-2 space-y-1.5 bg-background text-xs">
                {c.chief_complaint && (
                  <div>
                    <span className="text-muted-foreground ml-1">الشكوى:</span>
                    <span className="text-foreground">{c.chief_complaint}</span>
                  </div>
                )}
                {c.diagnosis && (
                  <div>
                    <span className="text-muted-foreground ml-1">التشخيص:</span>
                    <span className="font-medium text-foreground">{c.diagnosis}</span>
                  </div>
                )}
                {c.notes && (
                  <div>
                    <span className="text-muted-foreground ml-1">ملاحظات:</span>
                    <span className="text-foreground">{c.notes}</span>
                  </div>
                )}
                {(c.drugs?.length ?? 0) > 0 && (
                  <div className="border-t pt-1.5 mt-1">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1">
                      <Pill className="h-3 w-3" />
                      الأدوية المكتوبة:
                    </div>
                    <div className="space-y-0.5 pr-2">
                      {c.drugs!.map((d, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-foreground font-medium">{d.drug_name}</span>
                          {d.dose && <span className="text-muted-foreground">{d.dose}</span>}
                          {d.frequency && <span className="text-muted-foreground">{d.frequency}</span>}
                          {d.duration && <span className="text-muted-foreground">لمدة {d.duration}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {c.final_amount && parseFloat(c.final_amount) > 0 && (
                  <div className="border-t pt-1 mt-1 flex items-center gap-2 text-muted-foreground">
                    <span>رسم الكشف:</span>
                    <span className="font-medium text-foreground">
                      {parseFloat(c.final_amount).toLocaleString("ar-EG")} ج.م
                    </span>
                    {c.payment_status === "paid" && (
                      <Badge className="text-xs h-4 px-1 bg-green-50 text-green-700 border-green-200" variant="outline">مدفوع</Badge>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
