import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowUpDown, Trash2 } from "lucide-react";
import type { PrepLine } from "../types";
import { getMajorToMinor, toMajor, getUnitName, fmtQty } from "../types";
import { usePrep } from "../context";

export function PrepTable() {
  const {
    visibleLines, linesCount,
    sortSourceAsc, setSortSourceAsc,
    sortDestAsc, setSortDestAsc,
    handleQtyChange, handleExcludeItem,
  } = usePrep();

  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const focusRow = useCallback((idx: number) => {
    const el = inputRefs.current.get(idx);
    if (el) { el.focus(); el.select(); }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      let next = idx + 1;
      while (next < visibleLines.length && !inputRefs.current.has(next)) next++;
      if (next < visibleLines.length) focusRow(next);
    } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      let prev = idx - 1;
      while (prev >= 0 && !inputRefs.current.has(prev)) prev--;
      if (prev >= 0) focusRow(prev);
    }
  }, [visibleLines.length, focusRow]);

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
      <table className="w-full text-[13px]" dir="rtl" data-testid="table-preparation">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="py-1 px-2 text-center w-8">#</th>
            <th className="py-1 px-2 text-right font-bold">اسم الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">كود الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
            <th className="py-1 px-2 text-center whitespace-nowrap">كمية البيع</th>
            <th className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none" onClick={toggleSourceSort} data-testid="th-source-stock-sort">
              <span className="inline-flex items-center gap-0.5">رصيد المصدر<ArrowUpDown className="h-3 w-3" /></span>
            </th>
            <th className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none" onClick={toggleDestSort} data-testid="th-dest-stock-sort">
              <span className="inline-flex items-center gap-0.5">رصيد الوجهة<ArrowUpDown className="h-3 w-3" /></span>
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
                onQtyChange={handleQtyChange}
                onExclude={handleExcludeItem}
                onKeyDown={handleKeyDown}
                inputRef={(el) => { if (el) inputRefs.current.set(idx, el); else inputRefs.current.delete(idx); }}
              />
            ))
          ) : (
            <tr>
              <td colSpan={11} className="py-8 text-center text-muted-foreground">
                {linesCount === 0 ? "لا توجد بيانات مبيعات في الفترة المختارة" : "جميع الأصناف مستبعدة أو مغطاة"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PrepRow({ line, idx, onQtyChange, onExclude, onKeyDown, inputRef }: {
  line: PrepLine; idx: number;
  onQtyChange: (itemId: string, val: string) => void;
  onExclude: (itemId: string) => void;
  onKeyDown: (e: React.KeyboardEvent, idx: number) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const m2m = getMajorToMinor(line);
  const unitName = getUnitName(line);
  const totalSold = toMajor(parseFloat(line.total_sold) || 0, m2m);
  const sourceStock = toMajor(parseFloat(line.source_stock) || 0, m2m);
  const destStock = toMajor(parseFloat(line.dest_stock) || 0, m2m);
  const transferQty = parseFloat(line._transferQty) || 0;
  const sourceInsufficient = (parseFloat(line.source_stock) || 0) <= 0;
  const transferExceedsSource = transferQty > sourceStock;
  const destCoversNeed = destStock >= totalSold;

  return (
    <tr className={`border-b hover:bg-muted/30 ${sourceInsufficient ? "opacity-50" : ""}`} data-testid={`row-prep-${idx}`}>
      <td className="py-0.5 px-2 text-center text-muted-foreground">{idx + 1}</td>
      <td className="py-0.5 px-2 font-bold text-[14px]" data-testid={`text-item-name-${idx}`}>{line.name_ar}</td>
      <td className="py-0.5 px-2 text-muted-foreground font-mono" data-testid={`text-item-code-${idx}`}>{line.item_code}</td>
      <td className="py-0.5 px-2 whitespace-nowrap font-semibold">{unitName}</td>
      <td className="py-0.5 px-2 text-center font-bold text-[14px]">{fmtQty(totalSold)}</td>
      <td className={`py-0.5 px-2 text-center font-bold text-[14px] ${sourceInsufficient ? "text-red-500" : ""}`}>
        {sourceStock > 0 ? fmtQty(sourceStock) : "0"}
      </td>
      <td className={`py-0.5 px-2 text-center font-bold text-[14px] ${destCoversNeed ? "text-green-600" : "text-orange-500"}`}>
        {fmtQty(destStock)}
      </td>
      <td className="py-0.5 px-2 text-center text-muted-foreground whitespace-nowrap">
        {line.nearest_expiry ? new Date(line.nearest_expiry).toLocaleDateString("ar-EG", { year: "numeric", month: "short" }) : "—"}
      </td>
      <td className="py-0.5 px-1 text-center">
        <input
          ref={inputRef}
          type="number" min="0" step="1"
          value={line._transferQty}
          onChange={(e) => onQtyChange(line.item_id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, idx)}
          onFocus={(e) => e.target.select()}
          className={`h-7 w-[80px] text-[14px] font-bold text-center mx-auto border rounded px-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 ${transferExceedsSource ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border"} ${sourceInsufficient ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={sourceInsufficient}
          placeholder="0"
          data-testid={`input-transfer-qty-${idx}`}
        />
      </td>
      <td className="py-0.5 px-2 text-center" data-testid={`cell-warning-${idx}`}>
        <div className="flex gap-0.5 items-center justify-center">
          {sourceInsufficient && <span title="لا يوجد رصيد في المخزن المصدر" className="text-red-500"><AlertTriangle className="h-3.5 w-3.5" /></span>}
          {transferExceedsSource && !sourceInsufficient && (
            <span title={`الكمية المحوّلة (${transferQty}) أكبر من رصيد المصدر (${sourceStock})`} className="text-orange-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
          )}
        </div>
      </td>
      <td className="py-0.5 px-2 text-center">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onExclude(line.item_id)} data-testid={`button-exclude-${idx}`}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
