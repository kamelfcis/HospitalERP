import { useState } from "react";
import { Loader2, ChevronDown, ChevronUp, History, Pill, Stethoscope, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PreviousConsultation } from "../hooks/usePatientHistory";

interface Props {
  visits: PreviousConsultation[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

function formatVisitDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function PatientVisitHistoryTable({
  visits,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        تحميل تاريخ المريض...
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <History className="h-3 w-3" />
        لا توجد زيارات سابقة
      </div>
    );
  }

  return (
    <div className="space-y-1" dir="rtl">
      {visits.map((v) => {
        const isExpanded = expandedId === v.id;
        const fmtDate = formatVisitDate(v.visitDate);
        const drugCount = v.drugs?.length ?? 0;
        const svcCount = Number(v.serviceCount ?? 0);
        const rxCount = Number(v.pharmacyCount ?? 0);

        return (
          <div key={v.id} className="border rounded-lg overflow-hidden text-xs" data-testid={`history-item-${v.id}`}>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-right"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
            >
              <History className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground" dir="ltr">{fmtDate}</span>

              {v.clinicName && (
                <Badge variant="outline" className="text-xs h-4 px-1">{v.clinicName}</Badge>
              )}
              {v.doctorName && (
                <span className="text-muted-foreground">د. {v.doctorName}</span>
              )}

              <div className="flex-1" />

              {/* Order summary chips */}
              {rxCount > 0 && (
                <span className="text-muted-foreground flex items-center gap-0.5" title={`${rxCount} دواء`}>
                  <Pill className="h-3 w-3" />
                  {rxCount}
                </span>
              )}
              {svcCount > 0 && (
                <span className="text-muted-foreground flex items-center gap-0.5" title={`${svcCount} خدمة`}>
                  <Stethoscope className="h-3 w-3" />
                  {svcCount}
                </span>
              )}

              {isExpanded
                ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="px-3 py-2 space-y-1.5 bg-background text-xs">
                {v.chiefComplaint && (
                  <div>
                    <span className="text-muted-foreground ml-1">الشكوى:</span>
                    <span className="text-foreground">{v.chiefComplaint}</span>
                  </div>
                )}
                {v.diagnosis && (
                  <div>
                    <span className="text-muted-foreground ml-1">التشخيص:</span>
                    <span className="font-medium text-foreground">{v.diagnosis}</span>
                  </div>
                )}
                {v.notes && (
                  <div>
                    <span className="text-muted-foreground ml-1">ملاحظات:</span>
                    <span className="text-foreground">{v.notes}</span>
                  </div>
                )}
                {v.followUpPlan && (
                  <div>
                    <span className="text-muted-foreground ml-1">خطة المتابعة:</span>
                    <span className="text-foreground">{v.followUpPlan}</span>
                  </div>
                )}

                {/* Drugs written in this visit */}
                {drugCount > 0 && (
                  <div className="border-t pt-1.5 mt-1">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1">
                      <Pill className="h-3 w-3" />
                      الأدوية المكتوبة:
                    </div>
                    <div className="space-y-0.5 pr-2">
                      {v.drugs.map((d, i) => (
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

                {/* Suggested follow-up date from previous visit */}
                {v.suggestedFollowUpDate && (
                  <div className="flex items-center gap-1 text-muted-foreground border-t pt-1 mt-1">
                    <CalendarDays className="h-3 w-3" />
                    <span>موعد المتابعة المقترح:</span>
                    <span className="font-medium text-foreground" dir="ltr">
                      {formatVisitDate(v.suggestedFollowUpDate)}
                    </span>
                  </div>
                )}

                {/* Fee */}
                {v.finalAmount && parseFloat(v.finalAmount) > 0 && (
                  <div className="border-t pt-1 mt-1 flex items-center gap-2 text-muted-foreground">
                    <span>رسم الكشف:</span>
                    <span className="font-medium text-foreground">
                      {parseFloat(v.finalAmount).toLocaleString("ar-EG")} ج.م
                    </span>
                    {v.paymentStatus === "paid" && (
                      <Badge className="text-xs h-4 px-1 bg-green-50 text-green-700 border-green-200" variant="outline">
                        مدفوع
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            data-testid="button-history-load-more"
          >
            {isLoadingMore ? (
              <><Loader2 className="h-3 w-3 animate-spin ml-1" /> جاري التحميل...</>
            ) : (
              "عرض زيارات أقدم"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
