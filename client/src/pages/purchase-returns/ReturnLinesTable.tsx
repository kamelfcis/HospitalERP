import { memo } from "react";
import type React from "react";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Info } from "lucide-react";
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
}

const ReturnLineRow = memo(function ReturnLineRow({
  line, idx, warehouseId, handleNavKey, updateLine,
}: RowProps) {
  const hasQty      = parseFloat(line.qtyReturned) > 0;
  const hasBonusQty = parseFloat(line.invoiceBonusQty) > 0;
  const isValid     = hasQty && !!line.lotId;

  return (
    <tr className={cn("border-b hover:bg-muted/20", isValid ? "bg-green-50/30 dark:bg-green-950/10" : "")}>

      {/* الصنف */}
      <td className="p-1.5">
        <div className="font-medium text-xs leading-tight">{line.itemNameAr}</div>
        <div className="text-muted-foreground text-[10px]">{line.itemCode}</div>
        {line.isFreeItem && (
          <Badge variant="outline" className="text-[10px] mt-0.5 h-4 px-1">هدية</Badge>
        )}
      </td>

      {/* كمية الفاتورة */}
      <td className="p-1.5 text-center text-xs">{parseFloat(line.invoiceQty).toFixed(2)}</td>

      {/* هدية الفاتورة — read-only info */}
      <td className="p-1.5 text-center text-xs">
        {hasBonusQty
          ? <span className="font-medium text-amber-600">{parseFloat(line.invoiceBonusQty).toFixed(2)}</span>
          : <span className="text-muted-foreground">—</span>
        }
      </td>

      {/* سعر الشراء */}
      <td className="p-1.5 text-center text-xs">
        {line.isFreeItem
          ? <span className="text-muted-foreground">—</span>
          : formatCurrency(line.purchasePrice)}
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
              data-testid={`vat-rate-${line.purchaseInvoiceLineId}`}
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
          data-testid={`qty-input-${line.purchaseInvoiceLineId}`}
          data-nav-row={idx}
          data-nav-col={2}
        />
        {hasQty && !line.lotId && (
          <div className="text-[10px] text-destructive mt-0.5">اختر اللوت</div>
        )}
      </td>

      {/* هدية المرتجع — editable, only if invoice has bonus qty */}
      <td className="p-1.5 text-center">
        {hasBonusQty ? (
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
            data-testid={`bonus-qty-${line.purchaseInvoiceLineId}`}
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
}

export function ReturnLinesTable({ lines, warehouseId, loadingLines, handleNavKey, updateLine }: Props) {
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
            <th className="text-center p-1.5 w-[80px]">سعر الشراء</th>
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
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <ReturnLineRow
              key={l.purchaseInvoiceLineId}
              line={l}
              idx={idx}
              warehouseId={warehouseId}
              handleNavKey={handleNavKey}
              updateLine={updateLine}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
