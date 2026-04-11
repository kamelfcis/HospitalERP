import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Info, Pill, LayoutGrid } from "lucide-react";
import {
  transactionTypeLabels,
  type Warehouse,
  type Pharmacy,
  type Department,
} from "@shared/schema";
import { transactionTypes } from "../types";

interface MappingFiltersProps {
  selectedTxType:        string;
  onTxTypeChange:        (v: string) => void;
  selectedWarehouseId:   string;
  onWarehouseChange:     (v: string) => void;
  selectedPharmacyId:    string;
  onPharmacyChange:      (v: string) => void;
  selectedDepartmentId:  string;
  onDepartmentChange:    (v: string) => void;
  warehouses:            Warehouse[];
  pharmacies:            Pharmacy[];
  departments:           Department[];
  showWarehouseSelector: boolean;
  showPharmacySelector:  boolean;
  showDepartmentSelector: boolean;
}

export function MappingFilters({
  selectedTxType, onTxTypeChange,
  selectedWarehouseId, onWarehouseChange,
  selectedPharmacyId,  onPharmacyChange,
  selectedDepartmentId, onDepartmentChange,
  warehouses, pharmacies, departments,
  showWarehouseSelector, showPharmacySelector, showDepartmentSelector,
}: MappingFiltersProps) {

  const handleWarehouseChange = (v: string) => {
    onWarehouseChange(v);
    if (v !== "__generic__") onPharmacyChange("__generic__");
  };

  const handlePharmacyChange = (v: string) => {
    onPharmacyChange(v);
    if (v !== "__generic__") onWarehouseChange("__generic__");
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Select value={selectedTxType} onValueChange={onTxTypeChange}>
        <SelectTrigger className="w-[250px]" data-testid="select-transaction-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {transactionTypes.map(t => (
            <SelectItem key={t} value={t} data-testid={`option-tx-type-${t}`}>
              {transactionTypeLabels[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showWarehouseSelector && (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">المستودع / القسم</span>
          <Select value={selectedWarehouseId} onValueChange={handleWarehouseChange}>
            <SelectTrigger className="w-[220px]" data-testid="select-warehouse-filter">
              <SelectValue placeholder="عام (لجميع المستودعات)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__generic__" data-testid="option-warehouse-generic">
                عام (لجميع المستودعات)
              </SelectItem>
              {warehouses.map(w => (
                <SelectItem key={w.id} value={w.id} data-testid={`option-warehouse-${w.id}`}>
                  {w.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showPharmacySelector && (
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">الصيدلية</span>
          <Select value={selectedPharmacyId} onValueChange={handlePharmacyChange}>
            <SelectTrigger className="w-[220px]" data-testid="select-pharmacy-filter">
              <SelectValue placeholder="عام (لجميع الصيدليات)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__generic__" data-testid="option-pharmacy-generic">
                عام (لجميع الصيدليات)
              </SelectItem>
              {pharmacies.map(p => (
                <SelectItem key={p.id} value={p.id} data-testid={`option-pharmacy-${p.id}`}>
                  {p.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showDepartmentSelector && (
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">القسم</span>
          <Select value={selectedDepartmentId} onValueChange={onDepartmentChange}>
            <SelectTrigger className="w-[220px]" data-testid="select-department-filter">
              <SelectValue placeholder="عام (لجميع الأقسام)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__generic__" data-testid="option-department-generic">
                عام (لجميع الأقسام)
              </SelectItem>
              {departments.filter(d => d.isActive).map(d => (
                <SelectItem key={d.id} value={d.id} data-testid={`option-department-${d.id}`}>
                  {d.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!showWarehouseSelector && !showPharmacySelector && !showDepartmentSelector && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <Info className="h-4 w-4 shrink-0 text-blue-500" />
          <span>المخزن/الصيدلية أو الخزنة يُحدد تلقائياً من المستند — لا يتم اختياره هنا</span>
        </div>
      )}
    </div>
  );
}
