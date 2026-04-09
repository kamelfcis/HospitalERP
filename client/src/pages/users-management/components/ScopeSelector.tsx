import { Stethoscope } from "lucide-react";
import { Badge }      from "@/components/ui/badge";
import { Label }      from "@/components/ui/label";
import { Checkbox }   from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScopeItem { id: string; nameAr: string; }

interface ScopeSelectorProps {
  pharmacies:           ScopeItem[];
  departments:          ScopeItem[];
  clinics:              ScopeItem[];
  allowedPharmacyIds:   string[];
  allowedDepartmentIds: string[];
  allowedClinicIds:     string[];
  onPharmaciesChange:   (ids: string[]) => void;
  onDepartmentsChange:  (ids: string[]) => void;
  onClinicsChange:      (ids: string[]) => void;
  variant?:             "cashier" | "general";
}

export function ScopeSelector({
  pharmacies, departments, clinics,
  allowedPharmacyIds, allowedDepartmentIds, allowedClinicIds,
  onPharmaciesChange, onDepartmentsChange, onClinicsChange,
  variant = "cashier",
}: ScopeSelectorProps) {
  function toggleItem(list: string[], id: string, onChange: (ids: string[]) => void) {
    if (list.includes(id)) onChange(list.filter(x => x !== id));
    else onChange([...list, id]);
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <Label className="font-semibold text-sm">
        {variant === "cashier" ? "نطاق الكاشير — الوحدات المسموحة" : "نطاق الأقسام المسموحة"}
      </Label>
      <p className="text-xs text-muted-foreground">
        {variant === "cashier"
          ? "اختر الصيدليات والأقسام التي يعمل فيها هذا الكاشير. اتركها فارغة لقصره على قسمه الافتراضي."
          : "اختر الأقسام التي يستطيع هذا الموظف الوصول إليها (مثلاً لوحة الأسرّة). اتركها فارغة لقصره على قسمه الافتراضي."}
      </p>

      {pharmacies.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">الصيدليات</p>
          <ScrollArea className="max-h-28">
            <div className="space-y-1.5 pr-1">
              {pharmacies.map(p => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-0.5">
                  <Checkbox
                    checked={allowedPharmacyIds.includes(p.id)}
                    onCheckedChange={() => toggleItem(allowedPharmacyIds, p.id, onPharmaciesChange)}
                    data-testid={`checkbox-pharm-${p.id}`}
                  />
                  <span className="text-sm">{p.nameAr}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {departments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">الأقسام</p>
          <ScrollArea className="max-h-28">
            <div className="space-y-1.5 pr-1">
              {departments.map(d => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-0.5">
                  <Checkbox
                    checked={allowedDepartmentIds.includes(d.id)}
                    onCheckedChange={() => toggleItem(allowedDepartmentIds, d.id, onDepartmentsChange)}
                    data-testid={`checkbox-dept-${d.id}`}
                  />
                  <span className="text-sm">{d.nameAr}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {pharmacies.length === 0 && departments.length === 0 && (
        <p className="text-xs text-muted-foreground italic">لا توجد صيدليات أو أقسام بعد</p>
      )}

      {clinics.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-blue-600" />
            <p className="text-xs font-medium text-blue-700">عيادات محددة للموظف</p>
          </div>
          <p className="text-xs text-muted-foreground">
            إذا حددت عيادة، سيرى الموظف مرضى هذه العيادة فقط. اتركها فارغة لرؤية كل عيادات قسمه.
          </p>
          <ScrollArea className="max-h-36">
            <div className="space-y-1.5 pr-1">
              {clinics.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-blue-50 rounded p-0.5">
                  <Checkbox
                    checked={allowedClinicIds.includes(c.id)}
                    onCheckedChange={() => toggleItem(allowedClinicIds, c.id, onClinicsChange)}
                    data-testid={`checkbox-clinic-${c.id}`}
                    className="border-blue-300"
                  />
                  <span className="text-sm">{c.nameAr}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
          {allowedClinicIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {allowedClinicIds.map(id => {
                const c = clinics.find(x => x.id === id);
                return c ? (
                  <Badge key={id} variant="outline" className="text-[10px] border-blue-300 text-blue-700 gap-1">
                    <Stethoscope className="h-2.5 w-2.5" />
                    {c.nameAr}
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
