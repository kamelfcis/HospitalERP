/**
 * MappingFilters
 *
 * Transaction-type selector + Warehouse override selector.
 * Pure presentational — all state lives in useMappingRows.
 */

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import {
  transactionTypeLabels,
  type Warehouse,
} from "@shared/schema";
import { transactionTypes } from "../types";

interface MappingFiltersProps {
  selectedTxType:        string;
  onTxTypeChange:        (v: string) => void;
  selectedWarehouseId:   string;
  onWarehouseChange:     (v: string) => void;
  warehouses:            Warehouse[];
}

export function MappingFilters({
  selectedTxType, onTxTypeChange,
  selectedWarehouseId, onWarehouseChange,
  warehouses,
}: MappingFiltersProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Transaction type */}
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

      {/* Warehouse override */}
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">المستودع</span>
        <Select value={selectedWarehouseId} onValueChange={onWarehouseChange}>
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
    </div>
  );
}
