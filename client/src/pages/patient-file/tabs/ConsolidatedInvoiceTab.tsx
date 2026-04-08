import { memo, useState, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { ConsolidatedSummaryCards } from "../consolidated/ConsolidatedSummaryCards";
import { ConsolidatedFilters } from "../consolidated/ConsolidatedFilters";
import { ByVisitView } from "../consolidated/views/ByVisitView";
import { ByDepartmentView } from "../consolidated/views/ByDepartmentView";
import { ByClassificationView } from "../consolidated/views/ByClassificationView";
import { DetailedLinesView } from "../consolidated/views/DetailedLinesView";
import { dispatchPrint } from "../consolidated/print/printPatientFile";
import type { AggregatedViewData, ConsolidatedFiltersState, ConsolidatedViewMode } from "../shared/types";

interface Props {
  data: AggregatedViewData | undefined;
  isLoading: boolean;
  patientId: string;
  patientName: string;
}

const DEFAULT_FILTERS: ConsolidatedFiltersState = {
  viewMode: "visit",
  visitKey: "",
  departmentId: "",
  lineType: "",
  showPaid: true,
  showOriginals: false,
};

export const ConsolidatedInvoiceTab = memo(function ConsolidatedInvoiceTab({
  data,
  isLoading,
  patientId,
  patientName,
}: Props) {
  const [filters, setFilters] = useState<ConsolidatedFiltersState>(DEFAULT_FILTERS);

  const handleFiltersChange = useCallback((partial: Partial<ConsolidatedFiltersState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const handlePrint = useCallback((mode: ConsolidatedViewMode) => {
    if (!data) return;
    dispatchPrint(mode, data, patientName, filters.showPaid);
  }, [data, patientName, filters.showPaid]);

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

  return (
    <div className="flex flex-col gap-5">
      <ConsolidatedSummaryCards totals={data.totals} />

      <ConsolidatedFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onPrint={handlePrint}
      />

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
