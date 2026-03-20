/**
 * MappingTable
 *
 * Renders the table header and a MappingRowEditor for each row.
 * Also renders the empty-state prompt when no rows exist.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { MappingRowEditor } from "./MappingRowEditor";
import {
  type MappingRow,
  type LineTypeSpec,
} from "../types";

interface MappingTableProps {
  rows:            MappingRow[];
  txSpecs:         Record<string, LineTypeSpec>;
  txType:          string;
  usedLineTypes:   Set<string>;
  isWarehouseView: boolean;
  isLoading:       boolean;
  onUpdateRow:     (key: string, field: keyof MappingRow, value: string) => void;
  onRemoveRow:     (key: string) => void;
  onAddRow:        () => void;
}

export function MappingTable({
  rows, txSpecs, txType, usedLineTypes, isWarehouseView,
  isLoading, onUpdateRow, onRemoveRow, onAddRow,
}: MappingTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_2fr_2fr_auto] gap-2 px-2 py-2 bg-muted/50 rounded-md text-xs font-medium text-muted-foreground">
        <div className="w-20">الحالة</div>
        <div>نوع البند</div>
        <div className="flex items-center gap-1">
          <span className="text-blue-600 font-bold text-[10px]">مد</span> حساب المدين
        </div>
        <div className="flex items-center gap-1">
          <span className="text-purple-600 font-bold text-[10px]">دا</span> حساب الدائن
        </div>
        <div className="w-9" />
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm space-y-3">
          <p>لا توجد إعدادات لهذا النوع</p>
          <Button variant="outline" size="sm" onClick={onAddRow} data-testid="button-add-row-empty">
            <Plus className="h-4 w-4 ml-1" />
            إضافة سطر
          </Button>
        </div>
      ) : (
        rows.map(row => (
          <MappingRowEditor
            key={row.key}
            row={row}
            spec={txSpecs[row.lineType]}
            txType={txType}
            usedLineTypes={usedLineTypes}
            isWarehouseView={isWarehouseView}
            onUpdateRow={onUpdateRow}
            onRemoveRow={onRemoveRow}
          />
        ))
      )}
    </div>
  );
}
