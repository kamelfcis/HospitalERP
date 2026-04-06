import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatQty } from "@/lib/formatters";
import type { TransferLineLocal, ExpiryOption } from "../types";
import { getUnitName, getAvailableUnits, formatAvailability } from "../types";
import { computeUnitPriceFromBase } from "@/lib/invoice-lines";

interface Props {
  formLines: TransferLineLocal[];
  isViewOnly: boolean;
  fefoLoadingIndex: number | null;
  focusedLineIdx: number | null;
  lineExpiryOptions: Record<string, ExpiryOption[]>;
  qtyInputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  onDeleteLine: (index: number) => void;
  onQtyConfirm: (lineId: string) => void;
  onUnitChange: (lineId: string, newUnit: string) => void;
  onShowAvailability: (itemId: string, item: any, e: React.MouseEvent) => void;
  setFocusedLineIdx: (idx: number | null) => void;
}

export function TransferLineTable({
  formLines,
  isViewOnly,
  fefoLoadingIndex,
  focusedLineIdx,
  lineExpiryOptions,
  qtyInputRefs,
  pendingQtyRef,
  barcodeInputRef,
  onDeleteLine,
  onQtyConfirm,
  onUnitChange,
  onShowAvailability,
  setFocusedLineIdx,
}: Props) {
  const multiPriceItems = new Set<string>();
  formLines.forEach((ln) => {
    // كشف 1: نفس الصنف في سطور متعددة بأسعار مختلفة (بعد FEFO)
    const same = formLines.filter((l) => l.itemId === ln.itemId);
    if (same.length > 1) {
      const prices = new Set(same.map((l) => l.lotSalePrice || "0").filter((p) => p !== "0"));
      if (prices.size > 1) multiPriceItems.add(ln.itemId);
    }
    const opts = lineExpiryOptions[ln.id];
    if (opts && opts.length >= 1) {
      // كشف 2: أسعار مختلفة عبر تواريخ صلاحية مختلفة
      const optPrices = new Set(opts.map((o) => o.lotSalePrice || "0").filter((p) => p !== "0"));
      if (optPrices.size > 1) multiPriceItems.add(ln.itemId);
      // كشف 3: نفس تاريخ الصلاحية لكن دُفعات بأسعار مختلفة (hasPriceConflict)
      if (opts.some((o) => o.hasPriceConflict)) multiPriceItems.add(ln.itemId);
    }
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" dir="rtl" data-testid="table-transfer-lines">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="py-1 px-2 text-right font-bold text-[13px]">اسم الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">كود الصنف</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الكمية</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">الرصيد المتاح</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">سعر البيع</th>
            <th className="py-1 px-2 text-right whitespace-nowrap">ملاحظات</th>
            <th className="py-1 px-2 text-center whitespace-nowrap">تنبيه</th>
            {!isViewOnly && <th className="py-1 px-2 text-center whitespace-nowrap">حذف</th>}
          </tr>
        </thead>
        <tbody>
          {formLines.length > 0 ? (
            formLines.map((line, idx) => {
              const hasMultiPrice = multiPriceItems.has(line.itemId);
              return (
                <tr
                  key={line.id}
                  className={`peachtree-grid-row ${!line.fefoLocked ? "bg-yellow-50 dark:bg-yellow-900/20" : ""} ${focusedLineIdx === idx ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
                  data-testid={`row-line-${idx}`}
                >
                  <td className="py-1 px-2" title={`${line.item?.nameAr || ""} — ${line.item?.itemCode || ""}`}>
                    <div className="flex items-start gap-1">
                      <span
                        className="text-foreground leading-tight line-clamp-2"
                        style={{ fontSize: "14px", fontWeight: 700, wordBreak: "break-word" }}
                      >
                        {line.item?.nameAr || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => onShowAvailability(line.itemId, line.item, e)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] shrink-0 mt-0.5"
                        title="تواجد الصنف"
                        data-testid={`button-avail-${idx}`}
                      >
                        📊
                      </button>
                    </div>
                  </td>

                  <td className="py-0.5 px-2 font-mono whitespace-nowrap">{line.item?.itemCode || "—"}</td>

                  <td className="py-0.5 px-2 whitespace-nowrap">
                    {isViewOnly || !line.item ? (
                      <span>{line.item ? getUnitName(line.item, line.unitLevel) : "—"}</span>
                    ) : (() => {
                      const units = getAvailableUnits(line.item);
                      return units.length <= 1 ? (
                        <span>{getUnitName(line.item, line.unitLevel)}</span>
                      ) : (
                        <select
                          value={line.unitLevel}
                          onChange={(e) => onUnitChange(line.id, e.target.value)}
                          className="h-6 text-[12px] px-1 border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 border-border"
                          data-testid={`select-unit-${idx}`}
                        >
                          {units.map((u) => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>

                  <td
                    className={`py-0.5 px-2 whitespace-nowrap ${hasMultiPrice ? "bg-amber-100 dark:bg-amber-900/30" : ""}`}
                    title={hasMultiPrice ? "تنبيه: هذا الصنف له أكثر من سعر بيع" : ""}
                  >
                    {isViewOnly ? (
                      <span data-testid={`text-qty-${idx}`}>{formatQty(line.qtyEntered)}</span>
                    ) : (
                      <input
                        key={`qty-${line.id}-${line.qtyEntered}`}
                        ref={(el) => {
                          if (el) qtyInputRefs.current.set(line.id, el);
                          else qtyInputRefs.current.delete(line.id);
                        }}
                        type="number"
                        defaultValue={line.qtyEntered}
                        onChange={(e) => { pendingQtyRef.current.set(line.id, e.target.value); }}
                        onFocus={(e) => { setFocusedLineIdx(idx); e.target.select(); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onQtyConfirm(line.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            pendingQtyRef.current.delete(line.id);
                            const el = qtyInputRefs.current.get(line.id);
                            if (el) el.value = String(line.qtyEntered);
                            setFocusedLineIdx(null);
                            setTimeout(() => barcodeInputRef.current?.focus(), 50);
                          }
                        }}
                        onBlur={() => { onQtyConfirm(line.id); }}
                        className={`w-[70px] h-6 text-[12px] px-1 border rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500 ${focusedLineIdx === idx ? "border-2 border-blue-400 dark:border-blue-600" : "border-border"}`}
                        data-testid="input-qty-edit"
                        min="0"
                        step="any"
                      />
                    )}
                  </td>

                  <td className="py-0.5 px-2 whitespace-nowrap">
                    {fefoLoadingIndex === idx ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                    ) : line.selectedExpiryMonth && line.selectedExpiryYear ? (
                      <span className="font-mono text-[12px]" data-testid={`text-expiry-${idx}`}>
                        {`${String(line.selectedExpiryMonth).padStart(2, "0")}/${line.selectedExpiryYear}`}
                      </span>
                    ) : line.selectedExpiryDate ? (
                      <span className="font-mono text-[12px]">{formatDateShort(line.selectedExpiryDate)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="py-0.5 px-2 whitespace-nowrap">
                    {line.item ? formatAvailability(line.availableQtyMinor, line.unitLevel, line.item) : "—"}
                  </td>

                  <td
                    className={`py-0.5 px-2 whitespace-nowrap font-mono font-semibold ${hasMultiPrice ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" : "text-foreground"}`}
                    title={hasMultiPrice ? "تنبيه: هذا الصنف له أكثر من سعر بيع — تحقق من السعر" : `سعر بيع الدفعة / ${getUnitName(line.item, line.unitLevel)}`}
                    data-testid={`text-lot-price-${idx}`}
                  >
                    {line.lotSalePrice && parseFloat(line.lotSalePrice) > 0
                      ? computeUnitPriceFromBase(parseFloat(line.lotSalePrice), line.unitLevel, line.item).toFixed(2)
                      : "—"}
                  </td>

                  <td className="py-0.5 px-2 text-muted-foreground">{line.notes || "—"}</td>

                  <td className="py-0.5 px-2 text-center whitespace-nowrap" data-testid={`cell-warning-${idx}`}>
                    {hasMultiPrice && (
                      <span
                        title="تنبيه: هذا الصنف له دُفعات بأسعار بيع مختلفة — راجع تسعير المخزن الوجهة"
                        className="inline-flex items-center justify-center gap-0.5 bg-yellow-400 text-yellow-900 rounded px-1 py-0.5"
                        data-testid={`icon-multi-price-${idx}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold leading-none">سعرين</span>
                      </span>
                    )}
                  </td>

                  {!isViewOnly && (
                    <td className="py-0.5 px-2 text-center">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onDeleteLine(idx)}
                        data-testid={`button-delete-line-${idx}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={isViewOnly ? 9 : 10} className="py-4 text-center text-muted-foreground">
                لا توجد أصناف - اضغط "إضافة صنف" لإضافة أصناف
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
