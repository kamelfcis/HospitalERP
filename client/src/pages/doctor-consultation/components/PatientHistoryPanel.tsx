import { AlertCircle } from "lucide-react";
import { usePatientHistory } from "../hooks/usePatientHistory";
import { PatientVisitHistoryTable } from "./PatientVisitHistoryTable";

interface Props {
  patientId: string | null | undefined;
  currentAppointmentId: string;
  patientName?: string | null;
}

export function PatientHistoryPanel({ patientId, currentAppointmentId, patientName }: Props) {
  const { visits, isLoading, isLoadingMore, hasMore, loadMore, matchType } = usePatientHistory(
    patientId,
    currentAppointmentId,
    patientName
  );

  return (
    <div className="space-y-2">
      {matchType === "name" && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            هذه الزيارات مطابِقة بالاسم فقط — المريض غير مسجّل في النظام، ولا يمكن ضمان وحدة الهوية بشكل قاطع.
          </span>
        </div>
      )}
      <PatientVisitHistoryTable
        visits={visits}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
