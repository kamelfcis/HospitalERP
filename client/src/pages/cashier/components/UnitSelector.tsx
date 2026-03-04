import { Building2, FlaskConical, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UnitType } from "../hooks/useCashierShift";

interface UnitSelectorProps {
  unitsData: { pharmacies: any[]; departments: any[] } | undefined;
  onSelect: (type: UnitType, id: string) => void;
  openShiftUnitIds?: Set<string>;
  title?: string;
}

export function UnitSelector({ unitsData, onSelect, openShiftUnitIds, title }: UnitSelectorProps) {
  const pharmacies = unitsData?.pharmacies || [];
  const departments = unitsData?.departments || [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold">{title || "اختر الوحدة التي تعمل بها"}</h2>
        <p className="text-xs text-muted-foreground">
          {openShiftUnitIds && openShiftUnitIds.size > 0
            ? "الوحدات التي عليها وردية مفتوحة ستظهر مميزة — اضغط عليها للتبديل"
            : "ستظهر فقط الفواتير الخاصة بالوحدة المختارة"}
        </p>
      </div>

      {pharmacies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
            <span>الصيدليات</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {pharmacies.map((p) => {
              const hasShift = openShiftUnitIds?.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect("pharmacy", p.id)}
                  className={`
                    flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-center group relative
                    ${hasShift
                      ? "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10"
                      : "border-border hover:border-primary hover:bg-primary/5"
                    }
                  `}
                  data-testid={`btn-unit-pharmacy-${p.id}`}
                >
                  {hasShift && (
                    <span className="absolute top-1 left-1">
                      <RefreshCw className="h-3 w-3 text-primary" />
                    </span>
                  )}
                  <div className={`
                    w-9 h-9 rounded-full flex items-center justify-center transition-colors
                    ${hasShift ? "bg-primary/15" : "bg-blue-100 dark:bg-blue-900/40 group-hover:bg-primary/10"}
                  `}>
                    <FlaskConical className={`h-4 w-4 ${hasShift ? "text-primary" : "text-blue-600 dark:text-blue-400 group-hover:text-primary"}`} />
                  </div>
                  <span className="text-xs font-medium leading-tight">{p.nameAr}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">{p.code}</Badge>
                    {hasShift && (
                      <Badge className="text-[9px] px-1 py-0 bg-primary/80 text-primary-foreground no-default-hover-elevate no-default-active-elevate">
                        مفتوحة
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
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
            {departments.map((d) => {
              const hasShift = openShiftUnitIds?.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => onSelect("department", d.id)}
                  className={`
                    flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-center group relative
                    ${hasShift
                      ? "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10"
                      : "border-border hover:border-primary hover:bg-primary/5"
                    }
                  `}
                  data-testid={`btn-unit-dept-${d.id}`}
                >
                  {hasShift && (
                    <span className="absolute top-1 left-1">
                      <RefreshCw className="h-3 w-3 text-primary" />
                    </span>
                  )}
                  <div className={`
                    w-9 h-9 rounded-full flex items-center justify-center transition-colors
                    ${hasShift ? "bg-primary/15" : "bg-green-100 dark:bg-green-900/40 group-hover:bg-primary/10"}
                  `}>
                    <Building2 className={`h-4 w-4 ${hasShift ? "text-primary" : "text-green-600 dark:text-green-400 group-hover:text-primary"}`} />
                  </div>
                  <span className="text-xs font-medium leading-tight">{d.nameAr}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">{d.code}</Badge>
                    {hasShift && (
                      <Badge className="text-[9px] px-1 py-0 bg-primary/80 text-primary-foreground no-default-hover-elevate no-default-active-elevate">
                        مفتوحة
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
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
