import { Input } from "@/components/ui/input";
import type { ReturnLine } from "../types";
import { availableToReturnMinor, unitLabel, calcQtyMinor } from "../types";

interface Props {
  lines: ReturnLine[];
  onChangeQty: (lineId: string, qty: string) => void;
  onChangeUnit: (lineId: string, unit: string) => void;
}

export function ReturnLineTable({ lines, onChangeQty, onChangeUnit }: Props) {
  if (!lines.length) return null;

  return (
    <div className="border rounded-lg overflow-x-auto" data-testid="section-return-lines">
      <table className="w-full text-[13px]" dir="rtl">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="py-1.5 px-2 text-right font-bold w-8">#</th>
            <th className="py-1.5 px-2 text-right font-bold">الكود</th>
            <th className="py-1.5 px-2 text-right font-bold">الصنف</th>
            <th className="py-1.5 px-2 text-center font-bold">الوحدة الأصلية</th>
            <th className="py-1.5 px-2 text-center font-bold">الكمية المباعة</th>
            <th className="py-1.5 px-2 text-center font-bold">مرتجع سابق</th>
            <th className="py-1.5 px-2 text-center font-bold">المتاح للإرجاع</th>
            <th className="py-1.5 px-2 text-center font-bold w-24">وحدة الإرجاع</th>
            <th className="py-1.5 px-2 text-center font-bold w-28">كمية الإرجاع</th>
            <th className="py-1.5 px-2 text-left font-bold">السعر</th>
            <th className="py-1.5 px-2 text-left font-bold">الإجمالي</th>
            <th className="py-1.5 px-2 text-center font-bold">الصلاحية</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const availMinor = availableToReturnMinor(line);
            const perUnit = calcQtyMinor(1, line.returnUnitLevel, line);
            const availInUnit = perUnit > 0 ? Math.floor(availMinor / perUnit) : 0;
            const prevReturnedDisplay = formatMinorToOrigUnit(line);

            const unitOptions = getUnitOptions(line);

            return (
              <tr
                key={line.id}
                className={`border-b ${line.returnQtyMinor > 0 ? "bg-green-50 dark:bg-green-900/10" : "hover:bg-muted/30"}`}
                data-testid={`row-line-${idx}`}
              >
                <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>
                <td className="py-1.5 px-2 font-mono text-xs">{line.itemCode}</td>
                <td className="py-1.5 px-2 font-semibold">{line.itemNameAr}</td>
                <td className="py-1.5 px-2 text-center">{unitLabel(line.unitLevel, line)}</td>
                <td className="py-1.5 px-2 text-center font-semibold">{line.qty}</td>
                <td className="py-1.5 px-2 text-center text-orange-600 font-semibold">{prevReturnedDisplay}</td>
                <td className="py-1.5 px-2 text-center font-bold text-blue-700 dark:text-blue-400">{availInUnit}</td>
                <td className="py-1.5 px-2 text-center">
                  <select
                    value={line.returnUnitLevel}
                    onChange={(e) => onChangeUnit(line.id, e.target.value)}
                    className="h-7 text-xs border rounded px-1 bg-background text-foreground w-full"
                    disabled={availMinor <= 0}
                    data-testid={`select-unit-${idx}`}
                  >
                    {unitOptions.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 px-2 text-center">
                  <Input
                    type="number"
                    min="0"
                    max={availInUnit}
                    step="1"
                    value={line.returnQty}
                    onChange={(e) => onChangeQty(line.id, e.target.value)}
                    className="h-7 text-center text-[13px] font-bold w-full"
                    disabled={availMinor <= 0}
                    data-testid={`input-return-qty-${idx}`}
                  />
                </td>
                <td className="py-1.5 px-2 text-left font-mono">{parseFloat(line.salePrice).toFixed(2)}</td>
                <td className="py-1.5 px-2 text-left font-mono font-bold">
                  {line.returnLineTotal > 0 ? line.returnLineTotal.toFixed(2) : "—"}
                </td>
                <td className="py-1.5 px-2 text-center text-xs text-muted-foreground">
                  {line.expiryMonth && line.expiryYear ? `${line.expiryMonth}/${line.expiryYear}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatMinorToOrigUnit(line: ReturnLine): string {
  const prev = parseFloat(String(line.previouslyReturnedMinor)) || 0;
  if (prev <= 0) return "0";
  const perUnit = calcQtyMinor(1, line.unitLevel, line);
  if (perUnit > 0) {
    const inOrigUnit = prev / perUnit;
    return Number.isInteger(inOrigUnit) ? String(inOrigUnit) : inOrigUnit.toFixed(2);
  }
  return String(prev);
}

function getUnitOptions(line: ReturnLine): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  if (line.minorUnitName) opts.push({ value: "minor", label: line.minorUnitName });
  if (line.mediumUnitName && parseFloat(line.mediumToMinor || "0") > 0)
    opts.push({ value: "medium", label: line.mediumUnitName });
  if (line.majorUnitName && parseFloat(line.majorToMinor || "0") > 0)
    opts.push({ value: "major", label: line.majorUnitName });
  if (opts.length === 0) opts.push({ value: "minor", label: "وحدة" });
  return opts;
}
