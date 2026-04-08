import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LayoutList, Building2, Tag, TableProperties, Printer } from "lucide-react";
import type { ConsolidatedFiltersState, ConsolidatedViewMode } from "../shared/types";

const VIEW_MODES: { mode: ConsolidatedViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: "visit",          label: "حسب الزيارة",     icon: <LayoutList className="h-3.5 w-3.5" />    },
  { mode: "department",     label: "حسب القسم",       icon: <Building2 className="h-3.5 w-3.5" />     },
  { mode: "classification", label: "حسب التصنيف",     icon: <Tag className="h-3.5 w-3.5" />           },
  { mode: "detailed",       label: "تفصيلي كامل",     icon: <TableProperties className="h-3.5 w-3.5" /> },
];

interface Props {
  filters: ConsolidatedFiltersState;
  onFiltersChange: (f: Partial<ConsolidatedFiltersState>) => void;
  onPrint: (mode: ConsolidatedViewMode) => void;
}

export const ConsolidatedFilters = memo(function ConsolidatedFilters({ filters, onFiltersChange, onPrint }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 flex-wrap">
        {VIEW_MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => onFiltersChange({ viewMode: mode })}
            data-testid={`btn-view-mode-${mode}`}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors border",
              filters.viewMode === mode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted",
            ].join(" ")}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`cursor-pointer select-none text-xs transition-colors ${filters.showPaid ? "bg-green-50 text-green-700 border-green-300" : ""}`}
          onClick={() => onFiltersChange({ showPaid: !filters.showPaid })}
          data-testid="badge-show-paid"
        >
          {filters.showPaid ? "▶ مع المدفوع" : "◁ بدون مدفوع"}
        </Badge>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs print:hidden"
          onClick={() => onPrint(filters.viewMode)}
          data-testid="btn-print-consolidated"
        >
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </Button>
      </div>
    </div>
  );
});
