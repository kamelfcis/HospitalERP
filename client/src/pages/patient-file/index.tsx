import { useParams } from "wouter";
import { PatientFileWorkspace } from "./PatientFileWorkspace";

export default function PatientFilePage() {
  const params = useParams<{ id: string }>();
  if (!params.id) return null;
  return <PatientFileWorkspace patientId={params.id} />;
}
