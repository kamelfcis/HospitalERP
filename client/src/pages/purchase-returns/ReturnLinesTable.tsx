import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { LotSelector } from "./LotSelector";
import type { ReturnLineEntry } from "./types";

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
          <tr className="bg-muted/50 border-b">
            <th className="text-right p-2 min-w-[160px]">الصنف</th>
            <th className="text-center p-2 w-[75px]">كمية الفاتورة</th>
            <th className="text-center p-2 w-[65px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help">
                      هدية <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                    كمية البونص المرتجع — تؤثر على وعاء الضريبة فقط، لا على المبلغ الأساسي
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-center p-2 w-[85px]">سعر الشراء</th>
            <th className="text-center p-2 w-[60px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center gap-1 cursor-help">
                      ض.ق.م% <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                    نسبة الضريبة مستوردة تلقائياً من الفاتورة الأصلية — يمكن تعديلها لتصحيح أخطاء الإدخال
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </th>
            <th className="text-right p-2 min-w-[210px]">اللوت</th>
            <th className="text-center p-2 w-[95px]">كمية المرتجع</th>
            <th className="text-center p-2 w-[85px]">قبل الضريبة</th>
            <th className="text-center p-2 w-[70px]">ض.ق.م</th>
            <th className="text-center p-2 w-[85px]">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const hasQty  = parseFloat(l.qtyReturned) > 0;
            const isValid = hasQty && !!l.lotId;
            return (
              <tr
                key={l.purchaseInvoiceLineId}
                className={cn("border-b", isValid ? "bg-green-50/30 dark:bg-green-950/10" : "")}
              >
                <td className="p-2">
                  <div className="font-medium">{l.itemNameAr}</div>
                  <div className="text-muted-foreground text-[10px]">{l.itemCode}</div>
                  {l.isFreeItem && (
                    <Badge variant="outline" className="text-[10px] mt-0.5">هدية</Badge>
                  )}
                </td>
                <td className="p-2 text-center">{parseFloat(l.invoiceQty).toFixed(2)}</td>

                {/* Bonus qty returned */}
                <td className="p-2 text-center">
                  {parseFloat(l.invoiceBonusQty) > 0 ? (
                    <Input
                      type="number"
                      min="0"
                      max={parseFloat(l.invoiceBonusQty)}
                      step="0.01"
                      value={l.bonusQtyReturned}
                      onChange={e => updateLine(idx, { bonusQtyReturned: e.target.value })}
                      onKeyDown={e => handleNavKey(e, idx, 0)}
                      className="h-7 text-xs text-center px-1 w-full"
                      placeholder="0"
                      data-testid={`bonus-qty-${l.purchaseInvoiceLineId}`}
                      data-nav-row={idx}
                      data-nav-col={0}
                    />
                  ) : (
                    <span className="text-muted-foreground text-[10px]">—</span>
                  )}
                </td>

                {/* Purchase price */}
                <td className="p-2 text-center">
                  {l.isFreeItem
                    ? <span className="text-muted-foreground">—</span>
                    : formatCurrency(l.purchasePrice)}
                </td>

                {/* VAT rate */}
                <td className="p-2 text-center">
                  {l.isFreeItem ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <div className="flex items-center justify-center gap-0.5">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={l.vatRate}
                        onChange={e => updateLine(idx, { vatRate: e.target.value })}
                        onKeyDown={e => handleNavKey(e, idx, 1)}
                        className="h-7 w-14 text-xs text-center px-1"
                        data-testid={`vat-rate-${l.purchaseInvoiceLineId}`}
                        data-nav-row={idx}
                        data-nav-col={1}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  )}
                </td>

                {/* Lot selector */}
                <td className="p-2">
                  <LotSelector
                    itemId={l.itemId}
                    warehouseId={warehouseId}
                    value={l.lotId}
                    onChange={v => updateLine(idx, { lotId: v })}
                  />
                </td>

                {/* Qty returned */}
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.qtyReturned}
                    onChange={e => updateLine(idx, { qtyReturned: e.target.value })}
                    onKeyDown={e => handleNavKey(e, idx, 2)}
                    className={cn(
                      "h-7 text-xs text-center",
                      hasQty && !l.lotId ? "border-destructive" : ""
                    )}
                    placeholder="0"
                    data-testid={`qty-input-${l.purchaseInvoiceLineId}`}
                    data-nav-row={idx}
                    data-nav-col={2}
                  />
                  {hasQty && !l.lotId && (
                    <div className="text-[10px] text-destructive mt-0.5">اختر اللوت</div>
                  )}
                </td>

                <td className="p-2 text-center font-mono">
                  {l.subtotal  > 0 ? formatCurrency(l.subtotal)  : "—"}
                </td>
                <td className="p-2 text-center font-mono">
                  {l.vatAmount > 0 ? formatCurrency(l.vatAmount) : "—"}
                </td>
                <td className="p-2 text-center font-mono font-medium">
                  {l.lineTotal > 0 ? formatCurrency(l.lineTotal) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
