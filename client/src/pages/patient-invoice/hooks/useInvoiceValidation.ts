import { useToast } from "@/hooks/use-toast";
import type { LineLocal } from "../types";

interface ValidateSaveParams {
  patientName: string;
}

interface ValidateDistributeParams {
  departmentId: string;
  warehouseId: string;
  doctorName: string;
  lines: LineLocal[];
}

interface ValidateFinalizeParams {
  invoiceId: string | null;
  lines: LineLocal[];
}

export function useInvoiceValidation() {
  const { toast } = useToast();

  function validateSave({ patientName }: ValidateSaveParams): boolean {
    if (!patientName.trim()) {
      toast({
        title: "بيانات ناقصة",
        description: "يجب إدخال اسم المريض قبل الحفظ",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  function validateDistribute({ departmentId, warehouseId, doctorName, lines }: ValidateDistributeParams): boolean {
    if (lines.length === 0) {
      toast({
        title: "لا توجد بنود",
        description: "لا توجد بنود للتوزيع",
        variant: "destructive",
      });
      return false;
    }
    const missing: string[] = [];
    if (!departmentId) missing.push("القسم");
    if (!warehouseId)  missing.push("المخزن");
    if (!doctorName.trim()) missing.push("اسم الطبيب");
    if (missing.length > 0) {
      toast({
        title: "بيانات مطلوبة للتوزيع",
        description: `يجب تحديد: ${missing.join("، ")} قبل التوزيع`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  function validateFinalize({ invoiceId, lines }: ValidateFinalizeParams): string | null {
    if (!invoiceId) return "يجب حفظ الفاتورة أولاً";
    const missingDoctor = lines.filter(l => l.lineType === "service" && l.requiresDoctor && !l.doctorName.trim());
    const missingNurse  = lines.filter(l => l.lineType === "service" && l.requiresNurse  && !l.nurseName.trim());
    if (missingDoctor.length > 0) return `يجب إدخال اسم الطبيب للخدمات: ${missingDoctor.map(l => l.description).join("، ")}`;
    if (missingNurse.length > 0)  return `يجب إدخال اسم الممرض للخدمات: ${missingNurse.map(l => l.description).join("، ")}`;
    return null;
  }

  return { validateSave, validateDistribute, validateFinalize };
}
