import { Globe, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScopeItem { id: string; nameAr: string; }

interface ScopeSelectorProps {
  pharmacies:          ScopeItem[];
  departments:         ScopeItem[];
  allowedPharmacyIds:  string[];
  allowedDepartmentIds: string[];
  onPharmaciesChange:  (ids: string[]) => void;
  onDepartmentsChange: (ids: string[]) => void;
  hasAllUnits:         boolean;
  onAllUnitsChange:    (v: boolean) => void;
}

export function ScopeSelector({
  pharmacies, departments,
  allowedPharmacyIds, allowedDepartmentIds,
  onPharmaciesChange, onDepartmentsChange,
  hasAllUnits, onAllUnitsChange,
}: ScopeSelectorProps) {
  function toggleItem(list: string[], id: string, onChange: (ids: string[]) => void) {
    if (list.includes(id)) onChange(list.filter(x => x !== id));
    else onChange([...list, id]);
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="font-semibold text-sm">نطاق الكاشير</Label>
        {hasAllUnits ? (
          <Badge variant="secondary" className="gap-1 text-[10px]"><Globe className="h-3 w-3 text-green-600" />كل الوحدات</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Lock className="h-3 w-3 text-amber-600" />
            {allowedPharmacyIds.length + allowedDepartmentIds.length} وحدة
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="all-units-toggle"
          checked={hasAllUnits}
          onCheckedChange={onAllUnitsChange}
          data-testid="switch-all-units"
        />
        <Label htmlFor="all-units-toggle" className="text-sm cursor-pointer">
          صلاحية كل الوحدات (بدون قيود)
        </Label>
      </div>

      {!hasAllUnits && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">اختر الصيدليات والأقسام المسموحة لهذا الكاشير:</p>

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
        </div>
      )}
    </div>
  );
}
