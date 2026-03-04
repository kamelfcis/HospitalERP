import { Building2, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UnitType } from "../hooks/useCashierShift";

interface UnitSelectorProps {
  unitsData: { pharmacies: any[]; departments: any[] } | undefined;
  onSelect: (type: UnitType, id: string) => void;
}

export function UnitSelector({ unitsData, onSelect }: UnitSelectorProps) {
  const pharmacies = unitsData?.pharmacies || [];
  const departments = unitsData?.departments || [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold">اختر الوحدة التي تعمل بها</h2>
        <p className="text-xs text-muted-foreground">ستظهر فقط الفواتير الخاصة بالوحدة المختارة</p>
      </div>

      {pharmacies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
            <span>الصيدليات</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pharmacies.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect("pharmacy", p.id)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-center group"
                data-testid={`btn-unit-pharmacy-${p.id}`}
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <FlaskConical className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:text-primary" />
                </div>
                <span className="text-xs font-medium leading-tight">{p.nameAr}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">{p.code}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {departments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>الأقسام</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => onSelect("department", d.id)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-center group"
                data-testid={`btn-unit-dept-${d.id}`}
              >
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Building2 className="h-4 w-4 text-green-600 dark:text-green-400 group-hover:text-primary" />
                </div>
                <span className="text-xs font-medium leading-tight">{d.nameAr}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">{d.code}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {!unitsData && (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">جاري التحميل...</div>
        </div>
      )}
    </div>
  );
}
