import { useMutation } from "@tanstack/react-query";
import { Button }   from "@/components/ui/button";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileCheck, Loader2, Save } from "lucide-react";
import { useToast }    from "@/hooks/use-toast";
import { apiRequest }  from "@/lib/queryClient";

interface DiagnosisTabContentProps {
  invoiceId:    string;
  diagnosis:    string;
  setDiagnosis: (v: string) => void;
  notes:        string;
  setNotes:     (v: string) => void;
}

export function DiagnosisTabContent({
  invoiceId,
  diagnosis,
  setDiagnosis,
  notes,
  setNotes,
}: DiagnosisTabContentProps) {
  const { toast } = useToast();

  const saveDiagnosisMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/patient-invoices/${invoiceId}/clinical-info`, { diagnosis, notes }),
    onSuccess:  () => toast({ title: "تم الحفظ", description: "تم حفظ التشخيص والتقرير الطبي" }),
    onError:    (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold">التشخيص والتقرير الطبي</h3>
        </div>
        <Button
          size="sm"
          className="gap-1"
          onClick={() => saveDiagnosisMutation.mutate()}
          disabled={saveDiagnosisMutation.isPending}
          data-testid="button-save-diagnosis"
        >
          {saveDiagnosisMutation.isPending
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Save className="h-3 w-3" />}
          حفظ
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">التشخيص</Label>
          <Textarea
            value={diagnosis}
            onChange={e => setDiagnosis(e.target.value)}
            placeholder="أدخل التشخيص..."
            rows={5}
            className="text-sm resize-y w-full text-right"
            dir="rtl"
            data-testid="textarea-diagnosis"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium">ملاحظات / تقرير طبي</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="أدخل الملاحظات أو التقرير الطبي..."
            rows={5}
            className="text-sm resize-y w-full text-right"
            dir="rtl"
            data-testid="textarea-medical-notes"
          />
        </div>
      </div>
    </div>
  );
}
