import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical, Loader2, CheckCircle2, XCircle, Shield,
  Building2, Pill,
} from "lucide-react";
import { itemCategoryLabels } from "@shared/schema";
import type { EvalInput, EvalDomain } from "../hooks/useCoverageRules";

// ─── فئات الخدمات الطبية (ثابتة) ─────────────────────────────────────────
export const SERVICE_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "RADIOLOGY",  label: "الأشعة"              },
  { value: "LAB",        label: "المعمل / التحاليل"   },
  { value: "CLINIC",     label: "عيادة"                },
  { value: "OR",         label: "غرفة العمليات"        },
  { value: "ICU",        label: "العناية المركزة"      },
  { value: "INPATIENT",  label: "داخلي / تنويم"        },
  { value: "OUTPATIENT", label: "خارجي"                },
  { value: "NURSING",    label: "تمريض"                },
  { value: "PHARMACY",   label: "صيدلية"               },
  { value: "EMERGENCY",  label: "طوارئ"                },
];

interface Department { id: string; nameAr: string; }

interface Props {
  evalInput:    EvalInput;
  setEvalInput: (fn: (prev: EvalInput) => EvalInput) => void;
  evalResult:   any;
  evalLoading:  boolean;
  onRun:        () => void;
}

// ─── مكوّن اختيار النطاق ─────────────────────────────────────────────────
function DomainToggle({
  value, onChange,
}: { value: EvalDomain; onChange: (d: EvalDomain) => void }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-md bg-muted border text-[11px] mb-2">
      <button
        type="button"
        onClick={() => onChange("service")}
        data-testid="btn-domain-service"
        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded transition-all ${
          value === "service"
            ? "bg-white dark:bg-zinc-800 shadow font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Building2 className="h-3 w-3" />
        خدمات المستشفى
      </button>
      <button
        type="button"
        onClick={() => onChange("pharmacy")}
        data-testid="btn-domain-pharmacy"
        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded transition-all ${
          value === "pharmacy"
            ? "bg-white dark:bg-zinc-800 shadow font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Pill className="h-3 w-3" />
        الصيدلية / الأصناف
      </button>
    </div>
  );
}

// ─── الحقول الديناميكية لنطاق الخدمات ───────────────────────────────────
function ServiceFields({
  evalInput, setEvalInput, departments,
}: {
  evalInput:    EvalInput;
  setEvalInput: (fn: (prev: EvalInput) => EvalInput) => void;
  departments:  Department[];
}) {
  return (
    <>
      {/* القسم / الوحدة */}
      <div>
        <Label className="text-[10px] text-muted-foreground">القسم / الوحدة</Label>
        <Select
          value={evalInput.departmentId || "__all__"}
          onValueChange={v => setEvalInput(p => ({ ...p, departmentId: v === "__all__" ? "" : v }))}
        >
          <SelectTrigger className="h-6 text-[11px]" data-testid="select-eval-dept">
            <SelectValue placeholder="— كل الأقسام —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">— كل الأقسام —</SelectItem>
            {departments.length === 0 && (
              <SelectItem value="__empty__" disabled>لا توجد أقسام</SelectItem>
            )}
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* فئة الخدمة */}
      <div>
        <Label className="text-[10px] text-muted-foreground">فئة الخدمة</Label>
        <Select
          value={evalInput.serviceCategory || "__all__"}
          onValueChange={v => setEvalInput(p => ({ ...p, serviceCategory: v === "__all__" ? "" : v }))}
        >
          <SelectTrigger className="h-6 text-[11px]" data-testid="select-eval-service-cat">
            <SelectValue placeholder="— أي فئة —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">— أي فئة —</SelectItem>
            {SERVICE_CATEGORY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ─── الحقول الديناميكية لنطاق الصيدلية ──────────────────────────────────
function PharmacyFields({
  evalInput, setEvalInput,
}: {
  evalInput:    EvalInput;
  setEvalInput: (fn: (prev: EvalInput) => EvalInput) => void;
}) {
  return (
    <>
      {/* فئة الصنف */}
      <div className="col-span-2">
        <Label className="text-[10px] text-muted-foreground">فئة الصنف</Label>
        <Select
          value={evalInput.itemCategory || "__all__"}
          onValueChange={v => setEvalInput(p => ({ ...p, itemCategory: v === "__all__" ? "" : v }))}
        >
          <SelectTrigger className="h-6 text-[11px]" data-testid="select-eval-item-cat">
            <SelectValue placeholder="— أي فئة —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">— أي فئة —</SelectItem>
            {Object.entries(itemCategoryLabels).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ─── اللوحة الرئيسية ─────────────────────────────────────────────────────
export function CoverageRuleTestPanel({
  evalInput, setEvalInput, evalResult, evalLoading, onRun,
}: Props) {
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  function changeDomain(d: EvalDomain) {
    setEvalInput(p => ({
      ...p,
      domain:          d,
      // إعادة تعيين الحقول الخاصة بالـ domain المُغلق
      serviceId:       "",
      departmentId:    "",
      serviceCategory: "",
      itemId:          "",
      itemCategory:    "",
    }));
  }

  return (
    <div className="border-t bg-muted/20 px-3 py-2 shrink-0" dir="rtl">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
        اختبار القواعد
      </div>

      {/* ── اختيار النطاق ── */}
      <DomainToggle value={evalInput.domain} onChange={changeDomain} />

      {/* ── الحقول الديناميكية ── */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {evalInput.domain === "service" ? (
          <ServiceFields
            evalInput={evalInput}
            setEvalInput={setEvalInput}
            departments={departments}
          />
        ) : (
          <PharmacyFields
            evalInput={evalInput}
            setEvalInput={setEvalInput}
          />
        )}

        {/* السعر المعلن — دائماً يظهر */}
        <div>
          <Label className="text-[10px] text-muted-foreground">السعر المعلن (ج.م)</Label>
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
        {evalLoading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <FlaskConical className="h-3 w-3" />}
        تشغيل الاختبار
      </Button>

      {/* ── نتيجة التقييم ── */}
      {evalResult && (
        <div className={`mt-2 rounded-md border p-2 text-[11px] space-y-1 ${
          evalResult.coverageStatus === "covered"
            ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
            : evalResult.coverageStatus === "excluded" || evalResult.coverageStatus === "not_covered"
            ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
            : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
        }`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {evalResult.coverageStatus === "covered"
              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              : evalResult.coverageStatus === "not_covered"
              ? <XCircle className="h-3.5 w-3.5 text-red-600" />
              : <Shield className="h-3.5 w-3.5 text-amber-600" />}
            {evalResult.coverageStatus === "covered"
              ? "مشمول بالتغطية"
              : evalResult.coverageStatus === "not_covered"
              ? "غير مشمول بالتغطية"
              : "يحتاج موافقة"}
            {evalResult.approvalStatus === "pending" && (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400 ml-2">
                يحتاج موافقة
              </Badge>
            )}
          </div>
          {evalResult.contractPrice !== undefined && (
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span>السعر التعاقدي: <strong>{evalResult.contractPrice} ج.م</strong></span>
              <span>نصيب الشركة: <strong className="text-blue-700">{evalResult.companyShareAmount} ج.م</strong></span>
              <span>نصيب المريض: <strong className="text-orange-700">{evalResult.patientShareAmount} ج.م</strong></span>
            </div>
          )}
          {evalResult.matchedRuleName && (
            <div className="text-[10px] text-muted-foreground">
              القاعدة المطابقة: <span className="font-medium text-foreground">{evalResult.matchedRuleName}</span>
            </div>
          )}
          <div className="text-muted-foreground leading-relaxed">{evalResult.explanation}</div>
        </div>
      )}
    </div>
  );
}
