import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, BarChart3 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { formatAvailability, getUnitOptions, computeUnitPriceFromBase, convertMinorToDisplayQty, calculateQtyInMinor } from "../utils";
import type { SalesLineLocal } from "../types";

interface Props {
  lines: SalesLineLocal[];
  isDraft: boolean;
  fefoLoading: boolean;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;
  onUpdateLine: (index: number, patch: Partial<SalesLineLocal>) => void;
  onRemoveLine: (index: number) => void;
  onQtyConfirm: (tempId: string) => void;
  onOpenStats: (itemId: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
}

export function InvoiceLineTable({
  lines, isDraft, fefoLoading, pendingQtyRef,
  onUpdateLine, onRemoveLine, onQtyConfirm, onOpenStats, barcodeInputRef,
}: Props) {
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const multiPriceItems = new Set<string>();
  lines.forEach((ln) => {
    if (ln.expiryOptions && ln.expiryOptions.length > 1) {
      const prices = new Set(ln.expiryOptions.map((o) => parseFloat(o.lotSalePrice || "0")));
      if (prices.size > 1) multiPriceItems.add(ln.itemId);
    }
    const sameLinesForItem = lines.filter((l) => l.itemId === ln.itemId);
    if (sameLinesForItem.length > 1) {
      const linePrices = new Set(sameLinesForItem.map((l) => l.baseSalePrice));
      if (linePrices.size > 1) multiPriceItems.add(ln.itemId);
    }
  });

  return (
    <div className="flex-1 overflow-auto p-2">
      <table className="peachtree-grid w-full text-[12px]" data-testid="table-lines">
        <thead>
          <tr className="peachtree-grid-header">
            <th className="w-8">#</th>
            <th>الصنف</th>
            <th className="w-24">الوحدة</th>
            <th className="w-20">الكمية</th>
            <th className="w-24">سعر البيع</th>
            <th className="w-24">إجمالي السطر</th>
            <th className="w-28">الصلاحية</th>
            <th className="w-24">الرصيد المتاح</th>
            <th className="w-10">إحصاء</th>
            {isDraft && <th className="w-10">حذف</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln, i) => {
            const needsExpiry = ln.item?.hasExpiry && !ln.expiryMonth;
            return (
              <tr
                key={ln.tempId}
                className={`peachtree-grid-row ${needsExpiry ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                data-testid={`row-line-${i}`}
              >
                <td className="text-center">{i + 1}</td>
                <td className="max-w-[200px]" title={`${ln.item?.nameAr || ""} — ${ln.item?.itemCode || ""}`}>
                  <span className="text-foreground leading-tight line-clamp-2" style={{ fontSize: "14px", fontWeight: 700, wordBreak: "break-word" }}>
                    {ln.item?.nameAr || ln.itemId}
                  </span>
                  {ln.item?.itemCode && (
                    <span className="block text-[10px] text-muted-foreground font-mono">{ln.item.itemCode}</span>
                  )}
                </td>
                <td className="text-center">
                  {isDraft && !ln.fefoLocked ? (
                    <select
                      value={ln.unitLevel}
                      onChange={(e) => onUpdateLine(i, { unitLevel: e.target.value })}
                      className="peachtree-select w-full"
                      data-testid={`select-unit-${i}`}
                    >
                      {getUnitOptions(ln.item).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : isDraft && ln.fefoLocked ? (
                    <select
                      value={ln.unitLevel}
                      onChange={(e) => onUpdateLine(i, { unitLevel: e.target.value })}
                      className="peachtree-select w-full"
                      data-testid={`select-unit-${i}`}
                    >
                      {getUnitOptions(ln.item).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span data-testid={`text-unit-${i}`}>
                      {ln.unitLevel === "major" ? ln.item?.majorUnitName
                        : ln.unitLevel === "medium" ? ln.item?.mediumUnitName
                        : ln.item?.minorUnitName}
                    </span>
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <input
                      ref={(el) => { if (el) qtyRefs.current.set(i, el); else qtyRefs.current.delete(i); }}
                      type="number"
                      step="0.001"
                      min="0.001"
                      defaultValue={ln.qty}
                      onChange={(e) => pendingQtyRef.current.set(ln.tempId, e.target.value)}
                      onBlur={() => {
                        if (ln.item?.hasExpiry) {
                          onQtyConfirm(ln.tempId);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          if (ln.item?.hasExpiry) {
                            onQtyConfirm(ln.tempId);
                          }
                          setTimeout(() => barcodeInputRef.current?.focus(), 50);
                        }
                      }}
                      className="peachtree-input w-[60px] text-center"
                      disabled={fefoLoading}
                      data-testid={`input-qty-${i}`}
                    />
                  ) : (
                    <span className="peachtree-amount">{formatNumber(ln.qty)}</span>
                  )}
                </td>
                <td className="text-center">
                  <span className="peachtree-amount" data-testid={`text-sale-price-${i}`}>{formatNumber(ln.salePrice)}</span>
                </td>
                <td className="text-center peachtree-amount font-semibold">{formatNumber(ln.lineTotal)}</td>
                <td className="text-center text-[11px]">
                  {ln.item?.hasExpiry ? (
                    isDraft && ln.fefoLocked && ln.expiryOptions && ln.expiryOptions.length > 0 ? (
                      <select
                        value={ln.lotId || ""}
                        onChange={(e) => {
                          const selectedLotId = e.target.value;
                          const opt = ln.expiryOptions?.find((o) => o.lotId === selectedLotId);
                          if (opt) {
                            const updates: Partial<SalesLineLocal> = {
                              expiryMonth: opt.expiryMonth,
                              expiryYear: opt.expiryYear,
                              lotId: opt.lotId || null,
                            };
                            if (opt.lotSalePrice && parseFloat(opt.lotSalePrice) > 0 && ln.priceSource !== "department") {
                              const newBase = parseFloat(opt.lotSalePrice);
                              const newPrice = computeUnitPriceFromBase(newBase, ln.unitLevel, ln.item);
                              updates.baseSalePrice = newBase;
                              updates.salePrice = newPrice;
                              updates.lineTotal = +(ln.qty * newPrice).toFixed(2);
                            }
                            onUpdateLine(i, updates);
                          }
                        }}
                        className={`peachtree-select w-full text-[11px] ${needsExpiry ? "border-yellow-400" : ""}`}
                        data-testid={`select-expiry-${i}`}
                      >
                        {ln.expiryOptions.map((opt) => (
                          <option key={opt.lotId} value={opt.lotId}>
                            {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear} ({formatNumber(opt.qtyAvailableMinor)})
                          </option>
                        ))}
                      </select>
                    ) : !isDraft && ln.expiryMonth && ln.expiryYear ? (
                      <span data-testid={`text-expiry-${i}`}>{String(ln.expiryMonth).padStart(2, "0")}/{ln.expiryYear}</span>
                    ) : isDraft && ln.expiryOptions && ln.expiryOptions.length > 0 ? (
                      <select
                        value={ln.expiryMonth && ln.expiryYear ? `${ln.expiryMonth}-${ln.expiryYear}` : ""}
                        onChange={(e) => {
                          const [m, y] = e.target.value.split("-").map(Number);
                          onUpdateLine(i, { expiryMonth: m || null, expiryYear: y || null });
                        }}
                        className={`peachtree-select w-full text-[11px] ${needsExpiry ? "border-yellow-400" : ""}`}
                        data-testid={`select-expiry-${i}`}
                      >
                        <option value="">اختر الصلاحية</option>
                        {ln.expiryOptions.map((opt) => (
                          <option key={`${opt.expiryMonth}-${opt.expiryYear}`} value={`${opt.expiryMonth}-${opt.expiryYear}`}>
                            {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear} ({formatNumber(opt.qtyAvailableMinor)})
                          </option>
                        ))}
                      </select>
                    ) : ln.expiryMonth && ln.expiryYear ? (
                      <span data-testid={`text-expiry-${i}`}>{String(ln.expiryMonth).padStart(2, "0")}/{ln.expiryYear}</span>
                    ) : (
                      <span className="text-yellow-600">مطلوب</span>
                    )
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-center whitespace-nowrap text-[11px]" data-testid={`text-available-${i}`}>
                  {ln.item ? formatAvailability(ln.availableQtyMinor || "0", ln.unitLevel, ln.item) : "—"}
                </td>
                <td className="text-center">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onOpenStats(ln.itemId); }}
                    data-testid={`button-stats-${i}`}
                  >
                    <BarChart3 className="h-3 w-3" />
                  </Button>
                </td>
                {isDraft && (
                  <td className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => onRemoveLine(i)} data-testid={`button-delete-line-${i}`}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={isDraft ? 10 : 9} className="text-center text-muted-foreground py-6">
                لا توجد أصناف - امسح الباركود أو استخدم البحث لإضافة أصناف
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
