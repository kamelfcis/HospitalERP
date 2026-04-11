/**
 * MappingRowEditor
 *
 * Renders a single account-mapping row:
 *   [status cell] [line-type cell] [debit account] [credit account] [delete]
 *
 * Dynamic sides (system-resolved accounts) show an informational badge
 * instead of an account picker, so admins are not confused into thinking
 * they must manually fill a value the engine already resolves automatically.
 */

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2, AlertCircle, AlertTriangle, Info, Trash2, Zap, TriangleAlert,
} from "lucide-react";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import { mappingLineTypeLabels } from "@shared/schema";
import {
  type MappingRow,
  type LineTypeSpec,
  type DynamicSideInfo,
  DYNAMIC_LINE_SPECS,
  suggestedLineTypes,
  isRowComplete,
  allLineTypeOptions,
  getAccountFilter,
} from "../types";

interface MappingRowEditorProps {
  row:             MappingRow;
  spec:            LineTypeSpec | undefined;
  txType:          string;
  usedLineTypes:   Set<string>;
  isWarehouseView: boolean;
  isPharmacyView:  boolean;
  onUpdateRow:     (key: string, field: keyof MappingRow, value: string) => void;
  onRemoveRow:     (key: string) => void;
}

/** Renders an informational cell for a system-resolved (dynamic) account side */
function DynamicAccountBadge({ info, testId }: { info: DynamicSideInfo; testId: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 h-9 w-full rounded-md border border-dashed border-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/20 px-2 py-1 text-xs text-indigo-700 dark:text-indigo-300 cursor-help select-none"
            data-testid={testId}
          >
            <Zap className="h-3 w-3 shrink-0 text-indigo-500" />
            <span className="truncate leading-tight">{info.label}</span>
            {info.hasFallback && (
              <span className="text-[9px] text-indigo-400 shrink-0">(احتياطي)</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed" dir="rtl">
          {info.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MappingRowEditor({
  row, spec, txType, usedLineTypes, isWarehouseView, isPharmacyView,
  onUpdateRow, onRemoveRow,
}: MappingRowEditorProps) {
  const dynSpec = DYNAMIC_LINE_SPECS[txType]?.[row.lineType];
  const complete  = isRowComplete(row, spec, txType);
  const required  = spec?.required === true;
  const cond      = spec?.required === "cond";
  const unknown   = !spec;

  const debitFilter  = !unknown ? getAccountFilter(row.lineType, "debit")  : undefined;
  const creditFilter = !unknown ? getAccountFilter(row.lineType, "credit") : undefined;

  const useDebit  = spec ? spec.debitSide  : true;
  const useCredit = spec ? spec.creditSide : true;

  const suggested = suggestedLineTypes[txType] ?? [];
  const isUnsuggestedLine = row.lineType && !suggested.includes(row.lineType);

  const showGenericFallback = (isWarehouseView || isPharmacyView) && row.source === "generic";
  const showWarehousePin    = isWarehouseView && row.source === "warehouse";
  const showPharmacyPin     = isPharmacyView  && row.source === "pharmacy";

  const rowBg = isUnsuggestedLine    ? "bg-orange-50/50 dark:bg-orange-950/20 border-orange-200"
              : !complete && required ? "bg-red-50/60 border-red-100"
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
        {showPharmacyPin && (
          <span className="text-[9px] text-emerald-600 leading-tight">↳ صيدلية محددة</span>
        )}
        {isUnsuggestedLine && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 text-[9px] text-orange-600 leading-tight cursor-help">
                  <TriangleAlert className="h-2.5 w-2.5" />غير مستخدم
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed" dir="rtl">
                هذا البند غير مستخدم في محرك القيود لنوع المعاملة الحالي — لن يؤثر على القيد المحاسبي
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
              {allLineTypeOptions.map(([k, label]) => {
                const alreadyUsed = usedLineTypes.has(k) && k !== row.lineType;
                return (
                  <SelectItem key={k} value={k} disabled={alreadyUsed}>
                    {label}{alreadyUsed ? " ✓" : ""}
                  </SelectItem>
                );
              })}
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
      ) : dynSpec?.debit ? (
        <DynamicAccountBadge
          info={dynSpec.debit}
          testId={`select-debit-${row.lineType || row.key}`}
        />
      ) : (
        <AccountLookup
          value={row.debitAccountId}
          onChange={item => onUpdateRow(row.key, "debitAccountId", item?.id ?? "")}
          placeholder="اختر حساب المدين"
          filter={debitFilter}
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
      ) : dynSpec?.credit ? (
        <DynamicAccountBadge
          info={dynSpec.credit}
          testId={`select-credit-${row.lineType || row.key}`}
        />
      ) : (
        <AccountLookup
          value={row.creditAccountId}
          onChange={item => onUpdateRow(row.key, "creditAccountId", item?.id ?? "")}
          placeholder="اختر حساب الدائن"
          filter={creditFilter}
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
