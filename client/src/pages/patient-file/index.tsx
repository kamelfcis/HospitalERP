import { useParams, useLocation } from "wouter";
import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientFilePanel } from "@/pages/patients/components/PatientFilePanel";

export default function PatientFilePage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  if (!params.id) return null;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => navigate("/patients")}>
          <ArrowRight className="h-4 w-4" />
          العودة
        </Button>
        <h1 className="text-lg font-bold flex-1">ملف المريض</h1>
        <Button
          variant="outline" size="sm" className="gap-1 h-8"
          onClick={() => window.print()}
          data-testid="button-print-file"
        >
          <Printer className="h-4 w-4" />
          طباعة الملف
        </Button>
      </div>
      <PatientFilePanel patientId={params.id} showPrint={false} />
    </div>
  );
}
