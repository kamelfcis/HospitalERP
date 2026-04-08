import { memo } from "react";
import { PatientFilePanel } from "@/pages/patients/components/PatientFilePanel";

interface Props {
  patientId: string;
}

export const HistoryTab = memo(function HistoryTab({ patientId }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <PatientFilePanel patientId={patientId} showPrint={false} />
    </div>
  );
});
