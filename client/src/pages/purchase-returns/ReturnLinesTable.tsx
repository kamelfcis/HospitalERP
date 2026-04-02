import { memo } from "react";
import type React from "react";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Info, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LotSelector } from "./LotSelector";
import type { ReturnLineEntry } from "./types";

// ─── Memoized row ─────────────────────────────────────────────────────────────

interface RowProps {
  line: ReturnLineEntry;
  idx: number;
  warehouseId: string;
  handleNavKey: (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, col: number) => void;
  updateLine: (idx: number, patch: Partial<ReturnLineEntry>) => void;
  addSplitLine: (srcIdx: number) => void;
  removeSplitLine: (idx: number) => void;
}

const ReturnLineRow = memo(function ReturnLineRow({
  line, idx, warehouseId, handleNavKey, updateLine, addSplitLine, removeSplitLine,
}: RowProps) {
  const hasQty      = parseFloat(line.qtyReturned) > 0;
  const hasBonusQty = parseFloat(line.invoiceBonusQty) > 0;
  const isValid     = hasQty && !!line.lotId;

  // Display cost — effectiveUnitCost when available (post-discount), else purchasePrice
  const displayCost = parseFloat(line.effectiveUnitCost || line.purchasePrice) || 0;

  return (
    <tr className={cn(
      "border-b hover:bg-muted/20",
      isValid       ? "bg-green-50/30 dark:bg-green-950/10" : "",
      line.isSplitRow ? "bg-blue-50/20 dark:bg-blue-950/10" : "",
    )}>

      {/* الصنف */}
      <td className="p-1.5">
        {line.isSplitRow ? (
          <div className="flex items-center gap-1 pr-3">
            <span className="text-[10px] text-blue-500 border-r border-blue-200 pr-1 mr-0.5">↳</span>
            <div>
              <div className="font-medium text-xs leading-tight text-muted-foreground">{line.itemNameAr}</div>
              <Badge variant="outline" className="text-[9px] mt-0.5 h-4 px-1 text-blue-600 border-blue-300">لوت إضافي</Badge>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-medium text-xs leading-tight">{line.itemNameAr}</div>
            <div className="text-muted-foreground text-[10px]">{line.itemCode}</div>
            {line.isFreeItem && (
              <Badge variant="outline" className="text-[10px] mt-0.5 h-4 px-1">هدية</Badge>
            )}
          </div>
        )}
      </td>

      {/* كمية الفاتورة */}
      <td className="p-1.5 text-center text-xs">
        {line.isSplitRow ? <span className="text-muted-foreground">↳</span> : parseFloat(line.invoiceQty).toFixed(2)}
      </td>

      {/* هدية الفاتورة — read-only info */}
      <td className="p-1.5 text-center text-xs">
        {line.isSplitRow ? null : hasBonusQty
          ? <span className="font-medium text-amber-600">{parseFloat(line.invoiceBonusQty).toFixed(2)}</span>
          : <span className="text-muted-foreground">—</span>
        }
      </td>

      {/* سعر الشراء الفعلي (بعد الخصم) */}
      <td className="p-1.5 text-center text-xs">
        {line.isFreeItem
          ? <span className="text-muted-foreground">—</span>
          : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted">
                    {formatCurrency(displayCost)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px] text-center">
                  التكلفة الفعلية بعد توزيع الخصم — سعر الفاتورة: {formatCurrency(line.purchasePrice)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
      </td>

      {/* ض.ق.م% */}
      <td className="p-1.5 text-center">
        {line.isFreeItem ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
          <div className="flex items-center justify-center gap-0.5">
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={line.vatRate}
              onChange={e => updateLine(idx, { vatRate: e.target.value })}
              onKeyDown={e => handleNavKey(e, idx, 1)}
              className="h-7 w-16 text-xs text-center px-1"
              data-testid={`vat-rate-${line.splitKey}`}
              data-nav-row={idx}
              data-nav-col={1}
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        )}
      </td>

      {/* اللوت */}
      <td className="p-1.5">
        <LotSelector
          itemId={line.itemId}
          warehouseId={warehouseId}
          isFreeItem={line.isFreeItem}
          value={line.lotId}
          onChange={v => updateLine(idx, { lotId: v })}
        />
      </td>

      {/* كمية المرتجع */}
      <td className="p-1.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.qtyReturned}
          onChange={e => updateLine(idx, { qtyReturned: e.target.value })}
          onKeyDown={e => handleNavKey(e, idx, 2)}
          className={cn(
            "h-7 text-xs text-center",
            hasQty && !line.lotId ? "border-destructive" : ""
          )}
          placeholder="0"
          data-testid={`qty-input-${line.splitKey}`}
          data-nav-row={idx}
          data-nav-col={2}
        />
        {hasQty && !line.lotId && (
          <div className="text-[10px] text-destructive mt-0.5">اختر اللوت</div>
        )}
      </td>

      {/* هدية المرتجع — editable, only if invoice has bonus qty */}
      <td className="p-1.5 text-center">
        {hasBonusQty && !line.isSplitRow ? (
          <Input
            type="number"
            min="0"
            max={parseFloat(line.invoiceBonusQty)}
            step="0.01"
            value={line.bonusQtyReturned}
            onChange={e => updateLine(idx, { bonusQtyReturned: e.target.value })}
            onKeyDown={e => handleNavKey(e, idx, 0)}
            className="h-7 text-xs text-center px-1 w-full"
            placeholder="0"
            data-testid={`bonus-qty-${line.splitKey}`}
            data-nav-row={idx}
            data-nav-col={0}
          />
        ) : (
          <span className="text-muted-foreground text-[10px]">—</span>
        )}
      </td>

      {/* قبل الضريبة */}
      <td className="p-1.5 text-center font-mono text-xs">
        {line.subtotal  > 0 ? formatCurrency(line.subtotal)  : "—"}
      </td>
      {/* ض.ق.م */}
      <td className="p-1.5 text-center font-mono text-xs">
        {line.vatAmount > 0 ? formatCurrency(line.vatAmount) : "—"}
      </td>
      {/* الصافي */}
      <td className="p-1.5 text-center font-mono text-xs font-medium">
        {line.lineTotal > 0 ? formatCurrency(line.lineTotal) : "—"}
      </td>

      {/* إجراءات: تقسيم / حذف */}
      <td className="p-1.5 text-center">
        {line.isSplitRow ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => removeSplitLine(idx)}
            data-testid={`remove-split-${line.splitKey}`}
            title="حذف هذا التقسيم"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            onClick={() => addSplitLine(idx)}
            data-testid={`split-lot-${line.splitKey}`}
            title="تقسيم على لوت آخر"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </td>
    </tr>
  );
});

// ─── Table shell ─────────────────────────────────────────────────────────────

interface Props {
  lines: ReturnLineEntry[];
  warehouseId: string;
  loadingLines: boolean;
  handleNavKey: (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, col: number) => void;
  updateLine: (idx: number, patch: Partial<ReturnLineEntry>) => void;
  addSplitLine: (srcIdx: number) => void;
  removeSplitLine: (idx: number) => void;
}

export function ReturnLinesTable({ lines, warehouseId, loadingLines, handleNavKey, updateLine, addSplitLine, removeSplitLine }: Props) {
  if (loadingLines) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (lines.length === 0) {
    return <div className="text-center py-6 text-muted-foreground text-sm">لا توجد أصناف في هذه الفاتورة.</div>;
  }

  return (
    <div className="rounded-lg border overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b text-[11px]">
            <th className="text-right p-1.5 min-w-[150px]">الصنف</th>
            <th className="text-center p-1.5 w-[65px]">كمية الفات.</th>
            <th className="text-center p-1.5 w-[55px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help">
                      هدية <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                    كمية الهدية في فاتورة الشراء — للاستئناس فقط
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-center p-1.5 w-[90px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help">
                      سعر الشراء <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-center text-xs">
                    التكلفة الفعلية بعد توزيع الخصم على الفاتورة — مرر الفأرة لرؤية السعر الأصلي
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-center p-1.5 w-[58px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help">
                      ض.ق.م% <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                    نسبة الضريبة مستوردة من الفاتورة — يمكن تعديلها
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-right p-1.5 min-w-[160px]">اللوت</th>
            <th className="text-center p-1.5 w-[80px]">كمية المرتجع</th>
            <th className="text-center p-1.5 w-[70px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help text-amber-600">
                      هدية مرتجع <Info className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                    كمية الهدية المرتجعة — تُحسب عليها ضريبة فقط، بدون تكلفة شراء
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-center p-1.5 w-[80px]">قبل الضريبة</th>
            <th className="text-center p-1.5 w-[65px]">ض.ق.م</th>
            <th className="text-center p-1.5 w-[80px]">الصافي</th>
            <th className="text-center p-1.5 w-[40px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-blue-600"><Plus className="h-3 w-3 inline" /></span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    تقسيم الإرجاع على لوتين أو أكثر
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <ReturnLineRow
              key={l.splitKey}
              line={l}
              idx={idx}
              warehouseId={warehouseId}
              handleNavKey={handleNavKey}
              updateLine={updateLine}
              addSplitLine={addSplitLine}
              removeSplitLine={removeSplitLine}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
