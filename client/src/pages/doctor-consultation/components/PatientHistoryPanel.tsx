import { usePatientHistory } from "../hooks/usePatientHistory";
import { PatientVisitHistoryTable } from "./PatientVisitHistoryTable";

interface Props {
  patientId: string | null | undefined;
  currentAppointmentId: string;
}

export function PatientHistoryPanel({ patientId, currentAppointmentId }: Props) {
  const { visits, isLoading, isLoadingMore, hasMore, loadMore } = usePatientHistory(
    patientId,
    currentAppointmentId
  );

  if (!patientId) return null;

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
