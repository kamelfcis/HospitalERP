import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Loader2, CheckCircle2, XCircle, Shield } from "lucide-react";
import type { EvalInput } from "../hooks/useCoverageRules";

interface Props {
  evalInput: EvalInput;
  setEvalInput: (fn: (prev: EvalInput) => EvalInput) => void;
  evalResult: any;
  evalLoading: boolean;
  onRun: () => void;
}

export function CoverageRuleTestPanel({ evalInput, setEvalInput, evalResult, evalLoading, onRun }: Props) {
  return (
    <div className="border-t bg-muted/20 px-3 py-2 shrink-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
        اختبار القواعد
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">معرّف الخدمة</Label>
          <Input
            className="h-6 text-[11px]"
            placeholder="UUID"
            value={evalInput.serviceId}
            onChange={e => setEvalInput(p => ({ ...p, serviceId: e.target.value }))}
            data-testid="input-eval-service-id"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">معرّف القسم</Label>
          <Input
            className="h-6 text-[11px]"
            placeholder="UUID"
            value={evalInput.departmentId}
            onChange={e => setEvalInput(p => ({ ...p, departmentId: e.target.value }))}
            data-testid="input-eval-dept-id"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">الفئة</Label>
          <Input
            className="h-6 text-[11px]"
            placeholder="RADIOLOGY"
            value={evalInput.serviceCategory}
            onChange={e => setEvalInput(p => ({ ...p, serviceCategory: e.target.value }))}
            data-testid="input-eval-category"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">السعر المعلن</Label>
          <Input
            className="h-6 text-[11px]"
            type="number"
            placeholder="100"
            value={evalInput.listPrice}
            onChange={e => setEvalInput(p => ({ ...p, listPrice: e.target.value }))}
            data-testid="input-eval-list-price"
          />
        </div>
      </div>

      <Button
        size="sm" variant="outline" className="h-6 text-xs gap-1"
        onClick={onRun} disabled={evalLoading}
        data-testid="button-run-evaluate"
      >
        {evalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
        تشغيل الاختبار
      </Button>

      {evalResult && (
        <div className={`mt-2 rounded-md border p-2 text-[11px] space-y-1 ${
          evalResult.coverageStatus === "covered"  ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" :
          evalResult.coverageStatus === "excluded" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" :
          "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
        }`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {evalResult.coverageStatus === "covered"
              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              : evalResult.coverageStatus === "excluded"
              ? <XCircle className="h-3.5 w-3.5 text-red-600" />
              : <Shield className="h-3.5 w-3.5 text-amber-600" />}
            {evalResult.coverageStatus === "covered"  ? "مشمول بالتغطية" :
             evalResult.coverageStatus === "excluded" ? "مستثنى من التغطية" : "غير محدد"}
            {evalResult.approvalStatus === "pending" && (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400 ml-2">يحتاج موافقة</Badge>
            )}
          </div>
          {evalResult.contractPrice !== undefined && (
            <div className="flex items-center gap-3 text-[11px]">
              <span>السعر التعاقدي: <strong>{evalResult.contractPrice} ج.م</strong></span>
              <span>نصيب الشركة: <strong className="text-blue-700">{evalResult.companyShareAmount} ج.م</strong></span>
              <span>نصيب المريض: <strong className="text-orange-700">{evalResult.patientShareAmount} ج.م</strong></span>
            </div>
          )}
          <div className="text-muted-foreground leading-relaxed">{evalResult.explanation}</div>
        </div>
      )}
    </div>
  );
}
