import { Plus, Building2, FlaskConical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CashierShift } from "../hooks/useCashierShift";

interface ShiftSwitchBarProps {
  allOpenShifts: CashierShift[];
  selectedShiftId: string | undefined;
  unitsData: { pharmacies: any[]; departments: any[] } | undefined;
  onSelectShift: (shift: CashierShift) => void;
  onAddNew: () => void;
  isAddingNew?: boolean;
}

function resolveUnitName(
  unitType: string,
  pharmacyId: string | null,
  departmentId: string | null,
  unitsData: { pharmacies: any[]; departments: any[] } | undefined
) {
  if (!unitsData) return pharmacyId || departmentId || "";
  if (unitType === "pharmacy") return unitsData.pharmacies.find(p => p.id === pharmacyId)?.nameAr || pharmacyId;
  return unitsData.departments.find(d => d.id === departmentId)?.nameAr || departmentId;
}

export function ShiftSwitchBar({
  allOpenShifts, selectedShiftId, unitsData, onSelectShift, onAddNew, isAddingNew,
}: ShiftSwitchBarProps) {
  return (
    <div className="flex flex-row-reverse items-center gap-2 flex-wrap" dir="rtl" data-testid="shift-switch-bar">
      <span className="text-xs text-muted-foreground font-medium">الورديات المفتوحة:</span>

      {allOpenShifts.map((shift) => {
        const isSelected = shift.id === selectedShiftId && !isAddingNew;
        const unitName = resolveUnitName(shift.unitType, shift.pharmacyId, shift.departmentId, unitsData);
        const Icon = shift.unitType === "department" ? Building2 : FlaskConical;
        return (
          <button
            key={shift.id}
            onClick={() => onSelectShift(shift)}
            data-testid={`btn-switch-shift-${shift.id}`}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all
              ${isSelected
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background border-border hover:border-primary/60 hover:bg-primary/5 text-foreground"
              }
            `}
          >
            {isSelected && <Check className="h-3 w-3" />}
            <Icon className="h-3 w-3" />
            <span>{unitName}</span>
          </button>
        );
      })}

      <Button
        variant={isAddingNew ? "secondary" : "outline"}
        size="sm"
        onClick={onAddNew}
        className="h-7 px-2 text-xs gap-1"
        data-testid="button-add-new-shift"
      >
        <Plus className="h-3.5 w-3.5" />
        وردية جديدة
      </Button>
    </div>
  );
}
