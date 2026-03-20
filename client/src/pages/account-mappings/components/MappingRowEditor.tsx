/**
 * MappingRowEditor
 *
 * Renders a single account-mapping row:
 *   [status cell] [line-type cell] [debit account] [credit account] [delete]
 *
 * Uses AccountLookup with unscoped=1 so that users who have SETTINGS_ACCOUNT_MAPPINGS
 * permission always see ALL accounts, regardless of their personal account scope.
 */

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertCircle, AlertTriangle, Info, Trash2,
} from "lucide-react";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import { mappingLineTypeLabels } from "@shared/schema";
import {
  type MappingRow,
  type LineTypeSpec,
  isRowComplete,
  allLineTypeOptions,
} from "../types";

interface MappingRowEditorProps {
  row:            MappingRow;
  spec:           LineTypeSpec | undefined;
  usedLineTypes:  Set<string>;
  isWarehouseView: boolean;
  onUpdateRow:    (key: string, field: keyof MappingRow, value: string) => void;
  onRemoveRow:    (key: string) => void;
}

export function MappingRowEditor({
  row, spec, usedLineTypes, isWarehouseView,
  onUpdateRow, onRemoveRow,
}: MappingRowEditorProps) {
  const complete  = isRowComplete(row, spec);
  const required  = spec?.required === true;
  const cond      = spec?.required === "cond";
  const unknown   = !spec;

  const useDebit  = spec ? spec.debitSide  : true;
  const useCredit = spec ? spec.creditSide : true;

  const showGenericFallback = isWarehouseView && row.source === "generic";
  const showWarehousePin    = isWarehouseView && row.source === "warehouse";

  const rowBg = !complete && required ? "bg-red-50/60 border-red-100"
              : !complete && cond     ? "bg-amber-50/40"
              : "";

  return (
    <div
      className={`grid grid-cols-[auto_1fr_2fr_2fr_auto] gap-2 px-2 py-2 border-b last:border-b-0 items-center rounded-sm ${rowBg}`}
      data-testid={`mapping-row-${row.lineType || row.key}`}
    >
      {/* ── Status cell ── */}
      <div className="w-20 flex flex-col gap-0.5">
        {complete ? (
          <span className="flex items-center gap-0.5 text-[10px] text-green-600">
            <CheckCircle2 className="h-3 w-3" />مكتمل
          </span>
        ) : required ? (
          <span className="flex items-center gap-0.5 text-[10px] text-red-600">
            <AlertCircle className="h-3 w-3" />إلزامي
          </span>
        ) : cond ? (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />شرطي
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />اختياري
          </span>
        )}
        {cond && spec?.condition && (
          <span className="text-[9px] text-muted-foreground leading-tight">{spec.condition}</span>
        )}
        {showGenericFallback && (
          <span className="text-[9px] text-blue-500 leading-tight">↳ من الإعداد العام</span>
        )}
        {showWarehousePin && (
          <span className="text-[9px] text-indigo-500 leading-tight">↳ مستودع محدد</span>
        )}
      </div>

      {/* ── Line type cell ── */}
      <div>
        {unknown ? (
          <Select value={row.lineType} onValueChange={v => onUpdateRow(row.key, "lineType", v)}>
            <SelectTrigger className="h-9 text-xs" data-testid={`select-linetype-${row.key}`}>
              <SelectValue placeholder="اختر نوع البند" />
            </SelectTrigger>
            <SelectContent>
              {allLineTypeOptions.map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}{usedLineTypes.has(k) && k !== row.lineType ? " (مستخدم)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-xs font-medium py-2">
            {mappingLineTypeLabels[row.lineType] ?? row.lineType}
            <span className="text-[10px] font-mono text-muted-foreground mr-1">({row.lineType})</span>
          </div>
        )}
      </div>

      {/* ── Debit account ── */}
      {!useDebit ? (
        <div
          className="flex items-center h-9 w-full rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1 text-xs text-muted-foreground/50 select-none"
          data-testid={`select-debit-${row.lineType || row.key}`}
        >
          غير مستخدم في هذا النوع
        </div>
      ) : (
        <AccountLookup
          value={row.debitAccountId}
          onChange={item => onUpdateRow(row.key, "debitAccountId", item?.id ?? "")}
          placeholder="اختر حساب المدين"
          data-testid={`select-debit-${row.lineType || row.key}`}
        />
      )}

      {/* ── Credit account ── */}
      {!useCredit ? (
        <div
          className="flex items-center h-9 w-full rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1 text-xs text-muted-foreground/50 select-none"
          data-testid={`select-credit-${row.lineType || row.key}`}
        >
          غير مستخدم في هذا النوع
        </div>
      ) : (
        <AccountLookup
          value={row.creditAccountId}
          onChange={item => onUpdateRow(row.key, "creditAccountId", item?.id ?? "")}
          placeholder="اختر حساب الدائن"
          data-testid={`select-credit-${row.lineType || row.key}`}
        />
      )}

      {/* ── Remove button ── */}
      <Button
        size="icon" variant="ghost"
        onClick={() => onRemoveRow(row.key)}
        data-testid={`button-remove-${row.key}`}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
