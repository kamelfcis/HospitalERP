import { memo, useState, useCallback, useMemo } from "react";
import { Loader2, Lock, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ConsolidatedSummaryCards } from "../consolidated/ConsolidatedSummaryCards";
import { ConsolidatedFilters } from "../consolidated/ConsolidatedFilters";
import { ByVisitView } from "../consolidated/views/ByVisitView";
import { ByDepartmentView } from "../consolidated/views/ByDepartmentView";
import { ByClassificationView } from "../consolidated/views/ByClassificationView";
import { DetailedLinesView } from "../consolidated/views/DetailedLinesView";
import { dispatchPrint } from "../consolidated/print/printPatientFile";
import type { AggregatedInvoice, AggregatedViewData, ConsolidatedFiltersState, ConsolidatedViewMode } from "../shared/types";

// ─── PatientVisit type (from GET /api/patients/:id/visits) ───────────────────
interface PatientVisit {
  id: string;
  visit_number: string;
  visit_type: "inpatient" | "outpatient";
  admission_id: string | null;
  department_name: string | null;
  status: string;
  created_at: string;
}

interface Props {
  data: AggregatedViewData | undefined;
  isLoading: boolean;
  patientId: string;
  patientName: string;
  patientCode: string;
}

const DEFAULT_FILTERS: ConsolidatedFiltersState = {
  viewMode: "visit",
  visitKey: "",
  departmentId: "",
  lineType: "",
  showPaid: true,
  showOriginals: false,
};

function findPrimaryInvoice(invoices: AggregatedInvoice[]): AggregatedInvoice | undefined {
  return (
    invoices.find(i => i.isConsolidated && i.status === "finalized") ??
    invoices.find(i => i.status === "finalized" && !i.isConsolidated && invoices.length === 1) ??
    undefined
  );
}

/** Map a patient_visit to the visitKey used in byVisit grouping */
function pvToVisitKey(pv: PatientVisit): string {
  if (pv.visit_type === "inpatient" && pv.admission_id) {
    return `admission:${pv.admission_id}`;
  }
  return `visit:${pv.id}`;
}

export const ConsolidatedInvoiceTab = memo(function ConsolidatedInvoiceTab({
  data,
  isLoading,
  patientId,
  patientName,
  patientCode,
}: Props) {
  const [filters, setFilters] = useState<ConsolidatedFiltersState>(DEFAULT_FILTERS);
  const { toast } = useToast();

  // ── Fetch all patient visits for the visit selector ─────────────────────────
  const { data: patientVisits = [] } = useQuery<PatientVisit[]>({
    queryKey: ["/api/patients", patientId, "visits"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/visits`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!patientId,
  });

  const handleFiltersChange = useCallback((partial: Partial<ConsolidatedFiltersState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const handlePrint = useCallback((mode: ConsolidatedViewMode) => {
    if (!data) return;
    dispatchPrint(mode, data, patientName, patientCode, filters.showPaid);
  }, [data, patientName, patientCode, filters.showPaid]);

  const visibleVisits = useMemo(() => {
    if (!data) return [];
    if (!filters.visitKey) return data.byVisit;
    return data.byVisit.filter(v => v.visitKey === filters.visitKey);
  }, [data, filters.visitKey]);

  const visibleDepts = useMemo(() => {
    if (!data) return [];
    if (!filters.departmentId) return data.byDepartment;
    return data.byDepartment.filter(d => d.departmentId === filters.departmentId);
  }, [data, filters.departmentId]);

  const visibleClass = useMemo(() => {
    if (!data) return [];
    if (!filters.lineType) return data.byClassification;
    return data.byClassification.filter(c => c.lineType === filters.lineType);
  }, [data, filters.lineType]);

  const primaryInvoice = useMemo(() => data ? findPrimaryInvoice(data.invoices) : undefined, [data]);

  const finalCloseMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return apiRequest("POST", `/api/patient-invoices/${invoiceId}/final-close`);
    },
    onSuccess: () => {
      toast({ title: "تم الإغلاق النهائي", description: "تم إغلاق الفاتورة نهائياً بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.totals.invoiceCount === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير طبية لهذا المريض</div>;
  }

  const canFinalClose = primaryInvoice && !primaryInvoice.isFinalClosed && primaryInvoice.status === "finalized";
  const isFinalClosed = primaryInvoice?.isFinalClosed ?? false;

  return (
    <div className="flex flex-col gap-5">
      {isFinalClosed && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm" data-testid="banner-final-closed">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">مغلق نهائياً</span>
          {primaryInvoice?.finalClosedAt && (
            <span className="text-green-600 text-xs">
              — {new Date(primaryInvoice.finalClosedAt).toLocaleDateString("ar-EG")}
            </span>
          )}
        </div>
      )}

      {/* ── Visit Selector ──────────────────────────────────────────────────── */}
      {patientVisits.length > 0 && (
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select
            value={filters.visitKey || "__all__"}
            onValueChange={(val) => handleFiltersChange({ visitKey: val === "__all__" ? "" : val })}
          >
            <SelectTrigger className="h-8 text-xs w-[260px]" data-testid="select-visit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الزيارات ({patientVisits.length})</SelectItem>
              {patientVisits.map(pv => (
                <SelectItem key={pv.id} value={pvToVisitKey(pv)}>
                  <span className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1 py-0 ${pv.visit_type === "inpatient" ? "border-indigo-400 text-indigo-700" : "border-teal-400 text-teal-700"}`}
                    >
                      {pv.visit_type === "inpatient" ? "داخلي" : "خارجي"}
                    </Badge>
                    {pv.visit_number}
                    {pv.department_name && <span className="text-muted-foreground text-[10px]">— {pv.department_name}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.visitKey && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => handleFiltersChange({ visitKey: "" })}
              data-testid="button-clear-visit-filter"
            >
              مسح
            </button>
          )}
        </div>
      )}

      <ConsolidatedSummaryCards totals={data.totals} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ConsolidatedFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onPrint={handlePrint}
        />

        {canFinalClose && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
                data-testid="button-final-close"
                disabled={finalCloseMutation.isPending}
              >
                {finalCloseMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Lock className="h-4 w-4" />}
                إغلاق نهائي
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  تأكيد الإغلاق النهائي
                </AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم إغلاق الفاتورة <strong>{primaryInvoice.invoiceNumber}</strong> نهائياً.
                  بعد الإغلاق لن يمكن إجراء أي تعديلات عليها إلا بصلاحية خاصة.
                  <br /><br />
                  <strong>الشروط:</strong> الرصيد المتبقي = صفر، لا فواتير مسودة في الإقامة.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => finalCloseMutation.mutate(primaryInvoice.id)}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-confirm-final-close"
                >
                  تأكيد الإغلاق النهائي
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {isFinalClosed && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs" data-testid="badge-final-closed">
            <CheckCircle2 className="h-3 w-3" />
            مغلق نهائياً
          </Badge>
        )}
      </div>

      <div>
        {filters.viewMode === "visit" && (
          <ByVisitView visits={visibleVisits} showPaid={filters.showPaid} />
        )}
        {filters.viewMode === "department" && (
          <ByDepartmentView departments={visibleDepts} showPaid={filters.showPaid} />
        )}
        {filters.viewMode === "classification" && (
          <ByClassificationView classifications={visibleClass} showPaid={filters.showPaid} />
        )}
        {filters.viewMode === "detailed" && (
          <DetailedLinesView
            patientId={patientId}
            lineTypeFilter={filters.lineType || undefined}
            departmentFilter={filters.departmentId || undefined}
          />
        )}
      </div>
    </div>
  );
});
