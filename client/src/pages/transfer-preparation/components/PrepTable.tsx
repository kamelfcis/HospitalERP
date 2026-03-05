import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ArrowUpDown, Trash2 } from "lucide-react";
import type { PrepLine } from "../types";
import { getMajorToMinor, toMajor, getUnitName } from "../types";

interface Props {
  visibleLines: PrepLine[];
  linesCount: number;
  sortSourceAsc: boolean | null;
  setSortSourceAsc: (v: boolean | null) => void;
  sortDestAsc: boolean | null;
  setSortDestAsc: (v: boolean | null) => void;
  onQtyChange: (itemId: string, val: string) => void;
  onExcludeItem: (itemId: string) => void;
}

export function PrepTable({
  visibleLines, linesCount,
  sortSourceAsc, setSortSourceAsc,
  sortDestAsc, setSortDestAsc,
  onQtyChange, onExcludeItem,
}: Props) {
  const toggleSourceSort = () => {
    setSortSourceAsc(sortSourceAsc === null ? true : sortSourceAsc ? false : null);
    setSortDestAsc(null);
  };

  const toggleDestSort = () => {
    setSortDestAsc(sortDestAsc === null ? true : sortDestAsc ? false : null);
    setSortSourceAsc(null);
  };

  return (
    <div className="overflow-x-auto border rounded-lg" data-testid="section-results">
      <table className="w-full text-[12px]" dir="rtl" data-testid="table-preparation">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="py-1 px-2 text-center w-8">#</th>
            <th className="py-1 px-2 text-right font-bold">اسم الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">كود الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
            <th className="py-1 px-2 text-center whitespace-nowrap">كمية البيع</th>
            <th
              className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none"
              onClick={toggleSourceSort}
              data-testid="th-source-stock-sort"
            >
              <span className="inline-flex items-center gap-0.5">
                رصيد المصدر
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </th>
            <th
              className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none"
              onClick={toggleDestSort}
              data-testid="th-dest-stock-sort"
            >
              <span className="inline-flex items-center gap-0.5">
                رصيد الوجهة
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </th>
            <th className="py-1 px-2 text-center whitespace-nowrap">أقرب صلاحية (مصدر)</th>
            <th className="py-1 px-2 text-center whitespace-nowrap">الكمية المحوّلة</th>
            <th className="py-1 px-2 text-center whitespace-nowrap">تنبيه</th>
            <th className="py-1 px-2 text-center w-8">حذف</th>
          </tr>
        </thead>
        <tbody>
          {visibleLines.length > 0 ? (
            visibleLines.map((line, idx) => (
              <PrepRow
                key={line.item_id}
                line={line}
                idx={idx}
                onQtyChange={onQtyChange}
                onExclude={onExcludeItem}
              />
            ))
          ) : (
            <tr>
              <td colSpan={11} className="py-8 text-center text-muted-foreground">
                {linesCount === 0
                  ? "لا توجد بيانات مبيعات في الفترة المختارة"
                  : "جميع الأصناف مستبعدة أو مغطاة"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PrepRow({
  line, idx, onQtyChange, onExclude,
}: {
  line: PrepLine;
  idx: number;
  onQtyChange: (itemId: string, val: string) => void;
  onExclude: (itemId: string) => void;
}) {
  const m2m = getMajorToMinor(line);
  const unitName = getUnitName(line);

  const totalSoldMinor = parseFloat(line.total_sold) || 0;
  const sourceStockMinor = parseFloat(line.source_stock) || 0;
  const destStockMinor = parseFloat(line.dest_stock) || 0;

  const totalSold = toMajor(totalSoldMinor, m2m);
  const sourceStock = toMajor(sourceStockMinor, m2m);
  const destStock = toMajor(destStockMinor, m2m);

  const transferQty = parseFloat(line._transferQty) || 0;

  const sourceInsufficient = sourceStockMinor <= 0;
  const transferExceedsSource = transferQty > sourceStock;
  const destCoversNeed = destStock >= totalSold;

  const fmtQty = (val: number) => {
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(2).replace(/\.?0+$/, "");
  };

  return (
    <tr
      className={`border-b hover:bg-muted/30 ${sourceInsufficient ? "opacity-50" : ""}`}
      data-testid={`row-prep-${idx}`}
    >
      <td className="py-0.5 px-2 text-center text-muted-foreground">{idx + 1}</td>
      <td className="py-0.5 px-2 font-medium" data-testid={`text-item-name-${idx}`}>{line.name_ar}</td>
      <td className="py-0.5 px-2 text-muted-foreground" data-testid={`text-item-code-${idx}`}>{line.item_code}</td>
      <td className="py-0.5 px-2 whitespace-nowrap">{unitName}</td>
      <td className="py-0.5 px-2 text-center font-semibold">{fmtQty(totalSold)}</td>
      <td className={`py-0.5 px-2 text-center ${sourceInsufficient ? "text-red-500 font-bold" : ""}`}>
        {sourceStock > 0 ? fmtQty(sourceStock) : "0"}
      </td>
      <td className={`py-0.5 px-2 text-center ${destCoversNeed ? "text-green-600" : "text-orange-500"}`}>
        {fmtQty(destStock)}
      </td>
      <td className="py-0.5 px-2 text-center text-muted-foreground whitespace-nowrap">
        {line.nearest_expiry
          ? new Date(line.nearest_expiry).toLocaleDateString("ar-EG", { year: "numeric", month: "short" })
          : "—"}
      </td>
      <td className="py-0.5 px-1 text-center">
        <Input
          type="number"
          min="0"
          step="1"
          value={line._transferQty}
          onChange={(e) => onQtyChange(line.item_id, e.target.value)}
          className={`h-7 w-[80px] text-xs text-center mx-auto ${transferExceedsSource ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
          disabled={sourceInsufficient}
          placeholder="0"
          data-testid={`input-transfer-qty-${idx}`}
        />
      </td>
      <td className="py-0.5 px-2 text-center" data-testid={`cell-warning-${idx}`}>
        <div className="flex gap-0.5 items-center justify-center">
          {sourceInsufficient && (
            <span title="لا يوجد رصيد في المخزن المصدر" className="text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
          {transferExceedsSource && !sourceInsufficient && (
            <span
              title={`الكمية المحوّلة (${transferQty}) أكبر من رصيد المصدر (${sourceStock})`}
              className="text-orange-500"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="py-0.5 px-2 text-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onExclude(line.item_id)}
          data-testid={`button-exclude-${idx}`}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
