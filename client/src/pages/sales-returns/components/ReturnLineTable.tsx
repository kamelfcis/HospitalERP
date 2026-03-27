// ============================================================
//  ReturnLineTable — جدول أصناف المرتجع
//  لكل سطر: الكمية المتاحة + وحدة الإرجاع + الكمية المرتجعة + السعر + الإجمالي
// ============================================================
import { memo } from "react";
import { RotateCcw, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatQty } from "@/lib/formatters";
import type { ReturnLine } from "../types";
import {
  getUnitName,
  getReturnUnitOptions,
  toMinorQty,
  availableMinor,
  availableInUnit,
  prevReturnedInOrigUnit,
  pricePerReturnUnit,
} from "../types";

interface Props {
  lines: ReturnLine[];
  onChangeQty:  (lineId: string, qty: string)  => void;
  onChangeUnit: (lineId: string, unit: string) => void;
  /** تعبئة كل الأصناف بالكمية القصوى المتاحة */
  onReturnAll: () => void;
  /** تصفير جميع الكميات */
  onClearAll:  () => void;
}

// ── الهيدر: ثابت (لا يتكرر التعريف في كل صف) ──────────────
const COLUMNS = [
  { label: "#",             className: "text-right w-8" },
  { label: "الكود",         className: "text-right" },
  { label: "الصنف",         className: "text-right" },
  { label: "الوحدة الأصلية",className: "text-center" },
  { label: "الكمية المباعة",className: "text-center" },
  { label: "مرتجع سابق",   className: "text-center" },
  { label: "المتاح للإرجاع",className: "text-center" },
  { label: "وحدة الإرجاع", className: "text-center w-24" },
  { label: "كمية الإرجاع", className: "text-center w-28" },
  { label: "السعر",         className: "text-left" },
  { label: "الإجمالي",      className: "text-left" },
  { label: "الصلاحية",      className: "text-center" },
] as const;

// ============================================================
export function ReturnLineTable({ lines, onChangeQty, onChangeUnit, onReturnAll, onClearAll }: Props) {
  if (!lines.length) return null;

  const hasAnyAvailable = lines.some((l) => availableMinor(l) > 0);
  const hasAnySelected  = lines.some((l) => l.returnQtyMinor > 0);

  return (
    <div className="space-y-2">
      {/* ── شريط الأزرار السريعة ── */}
      <div className="flex items-center gap-2" dir="rtl">
        <Button
          variant="default"
          size="sm"
          onClick={onReturnAll}
          disabled={!hasAnyAvailable}
          className="gap-1.5"
          data-testid="button-return-all"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          إرجاع الفاتورة بالكامل
        </Button>

        {hasAnySelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            className="gap-1.5 text-muted-foreground"
            data-testid="button-clear-all"
          >
            <Eraser className="h-3.5 w-3.5" />
            مسح الكميات
          </Button>
        )}
      </div>

      {/* ── جدول الأصناف ── */}
      <div className="border rounded-lg overflow-x-auto" data-testid="section-return-lines">
        <table className="w-full text-[13px]" dir="rtl">
          <thead>
            <tr className="peachtree-grid-header">
              {COLUMNS.map((col) => (
                <th key={col.label} className={`py-1.5 px-2 font-bold ${col.className}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <ReturnLineRow
                key={line.id}
                line={line}
                idx={idx}
                onChangeQty={onChangeQty}
                onChangeUnit={onChangeUnit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//  Sub-component: صف واحد في الجدول
// ============================================================
interface RowProps {
  line: ReturnLine;
  idx: number;
  onChangeQty:  (lineId: string, qty: string)  => void;
  onChangeUnit: (lineId: string, unit: string) => void;
}

const ReturnLineRow = memo(function ReturnLineRow({ line, idx, onChangeQty, onChangeUnit }: RowProps) {
  const canReturn     = availableMinor(line) > 0;
  const maxInUnit     = availableInUnit(line, line.returnUnitLevel);
  const availOrigUnit = availableInUnit(line, line.unitLevel);
  const prevReturned  = prevReturnedInOrigUnit(line);
  const displayPrice  = pricePerReturnUnit(line, line.returnUnitLevel);
  const unitOptions   = getReturnUnitOptions(line);

  // تمييز الصفوف التي تم إدخال كمية لها
  const rowClass = line.returnQtyMinor > 0
    ? "border-b bg-green-50 dark:bg-green-900/10"
    : "border-b hover:bg-muted/30";

  return (
    <tr className={rowClass} data-testid={`row-line-${idx}`}>
      {/* # */}
      <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>

      {/* الكود */}
      <td className="py-1.5 px-2 font-mono text-xs">{line.itemCode}</td>

      {/* اسم الصنف */}
      <td className="py-1.5 px-2 font-semibold">{line.itemNameAr}</td>

      {/* الوحدة الأصلية */}
      <td className="py-1.5 px-2 text-center text-muted-foreground">
        {getUnitName(line, line.unitLevel)}
      </td>

      {/* الكمية المباعة */}
      <td className="py-1.5 px-2 text-center font-semibold">{formatQty(line.qty)}</td>

      {/* مرتجع سابق — يُعرض باللون البرتقالي تحذيراً */}
      <td className="py-1.5 px-2 text-center text-orange-600 font-semibold">
        {prevReturned}
      </td>

      {/* المتاح للإرجاع — بالوحدة الأصلية */}
      <td className="py-1.5 px-2 text-center font-bold text-blue-700 dark:text-blue-400">
        {availOrigUnit} {getUnitName(line, line.unitLevel)}
      </td>

      {/* اختيار وحدة الإرجاع */}
      <td className="py-1.5 px-2 text-center">
        <select
          value={line.returnUnitLevel}
          onChange={(e) => onChangeUnit(line.id, e.target.value)}
          disabled={!canReturn}
          className="h-7 text-xs border rounded px-1 bg-background text-foreground w-full"
          data-testid={`select-unit-${idx}`}
        >
          {unitOptions.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </td>

      {/* إدخال كمية الإرجاع */}
      <td className="py-1.5 px-2 text-center">
        <Input
          type="number"
          min="0"
          max={maxInUnit}
          step="1"
          value={line.returnQty}
          onChange={(e) => onChangeQty(line.id, e.target.value)}
          disabled={!canReturn}
          className="h-7 text-center text-[13px] font-bold w-full"
          data-testid={`input-return-qty-${idx}`}
        />
      </td>

      {/* سعر الوحدة المختارة */}
      <td className="py-1.5 px-2 text-left font-mono">
        {displayPrice.toFixed(2)}
      </td>

      {/* إجمالي السطر */}
      <td className="py-1.5 px-2 text-left font-mono font-bold">
        {line.returnLineTotal > 0 ? line.returnLineTotal.toFixed(2) : "—"}
      </td>

      {/* تاريخ الصلاحية */}
      <td className="py-1.5 px-2 text-center text-xs text-muted-foreground">
        {line.expiryMonth && line.expiryYear
          ? `${line.expiryMonth}/${line.expiryYear}`
          : "—"}
      </td>
    </tr>
  );
});
