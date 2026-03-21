import { usePatientHistory } from "../hooks/usePatientHistory";
import { PatientVisitHistoryTable } from "./PatientVisitHistoryTable";

interface Props {
  patientId: string | null | undefined;
  currentAppointmentId: string;
  patientName?: string | null;
}

export function PatientHistoryPanel({ patientId, currentAppointmentId, patientName }: Props) {
  const { visits, isLoading, isLoadingMore, hasMore, loadMore } = usePatientHistory(
    patientId,
    currentAppointmentId,
    patientName
  );

  return (
    <PatientVisitHistoryTable
      visits={visits}
      isLoading={isLoading}
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
    />
  );
}
