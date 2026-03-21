/**
 * MappingFilters
 *
 * Transaction-type selector + Warehouse override selector + Pharmacy override selector.
 * The warehouse selector is hidden for transaction types whose warehouse/treasury
 * account is resolved automatically from the source document (sales_invoice,
 * cashier_collection, cashier_refund, warehouse_transfer).
 * For sales_invoice a pharmacy selector is shown instead so admins can configure
 * per-pharmacy revenue accounts.
 * Pure presentational — all state lives in useMappingRows.
 */

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Info, Pill } from "lucide-react";
import {
  transactionTypeLabels,
  type Warehouse,
  type Pharmacy,
} from "@shared/schema";
import { transactionTypes } from "../types";

interface MappingFiltersProps {
  selectedTxType:        string;
  onTxTypeChange:        (v: string) => void;
  selectedWarehouseId:   string;
  onWarehouseChange:     (v: string) => void;
  selectedPharmacyId:    string;
  onPharmacyChange:      (v: string) => void;
  warehouses:            Warehouse[];
  pharmacies:            Pharmacy[];
  showWarehouseSelector: boolean;
  showPharmacySelector:  boolean;
}

export function MappingFilters({
  selectedTxType, onTxTypeChange,
  selectedWarehouseId, onWarehouseChange,
  selectedPharmacyId,  onPharmacyChange,
  warehouses, pharmacies,
  showWarehouseSelector, showPharmacySelector,
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

      {/* Warehouse selector — only for transaction types with configurable warehouse */}
      {showWarehouseSelector ? (
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
      ) : showPharmacySelector ? (
        /* Pharmacy selector — for sales_invoice only */
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">الصيدلية</span>
          <Select value={selectedPharmacyId} onValueChange={onPharmacyChange}>
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
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <Info className="h-4 w-4 shrink-0 text-blue-500" />
          <span>المخزن/الصيدلية أو الخزنة يُحدد تلقائياً من المستند — لا يتم اختياره هنا</span>
        </div>
      )}
    </div>
  );
}
