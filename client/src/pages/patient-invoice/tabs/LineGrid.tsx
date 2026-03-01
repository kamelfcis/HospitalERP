import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, X, BarChart3 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { Service, Item } from "@shared/schema";
import type { LineLocal } from "../types";
import {
  itemHasMajorUnit,
  itemHasMediumUnit,
  getUnitName,
} from "../utils/units";

interface LineGridProps {
  type: string;
  typeLines: LineLocal[];
  isDraft: boolean;
  itemSearch: string;
  setItemSearch: (v: string) => void;
  setItemResults: (v: Item[]) => void;
  itemResults: Item[];
  searchingItems: boolean;
  fefoLoading: boolean;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  setServiceResults: (v: Service[]) => void;
  serviceResults: Service[];
  searchingServices: boolean;
  itemSearchRef: React.RefObject<HTMLInputElement>;
  itemDropdownRef: React.RefObject<HTMLDivElement>;
  serviceSearchRef: React.RefObject<HTMLInputElement>;
  serviceDropdownRef: React.RefObject<HTMLDivElement>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;
  addServiceLine: (svc: any) => void;
  addItemLine: (item: any, type: "drug" | "consumable" | "equipment") => void;
  updateLine: (tempId: string, field: string, value: any) => void;
  removeLine: (tempId: string) => void;
  handleQtyConfirm: (tempId: string) => void;
  handleUnitLevelChange: (tempId: string, level: "major" | "medium" | "minor") => void;
  openStatsPopup: (itemId: string, name: string) => void;
  getServiceRowClass: (serviceType: string) => string;
}

export function LineGrid({
  type,
  typeLines,
  isDraft,
  itemSearch,
  setItemSearch,
  setItemResults,
  itemResults,
  searchingItems,
  fefoLoading,
  serviceSearch,
  setServiceSearch,
  setServiceResults,
  serviceResults,
  searchingServices,
  itemSearchRef,
  itemDropdownRef,
  serviceSearchRef,
  serviceDropdownRef,
  pendingQtyRef,
  addServiceLine,
  addItemLine,
  updateLine,
  removeLine,
  handleQtyConfirm,
  handleUnitLevelChange,
  openStatsPopup,
  getServiceRowClass,
}: LineGridProps) {
  return (
    <div className="space-y-3">
      {type !== "service" ? (
        <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={itemSearchRef}
              placeholder="بحث عن صنف... (استخدم % للبحث المتقدم)"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setItemSearch("");
                  setItemResults([]);
                }
              }}
              className="pr-8"
              disabled={!isDraft}
              data-testid={`input-item-search-${type}`}
            />
          </div>
          {searchingItems && <Loader2 className="h-4 w-4 animate-spin" />}
          {fefoLoading && <Badge variant="secondary" className="text-xs">جاري توزيع الصلاحية...</Badge>}
        </div>
      ) : (
        <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={serviceSearchRef}
              placeholder="بحث عن خدمة..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setServiceSearch("");
                  setServiceResults([]);
                }
              }}
              className="pr-8"
              disabled={!isDraft}
              data-testid="input-service-search"
            />
          </div>
          {searchingServices && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}

      {type === "service" && serviceResults.length > 0 && (
        <div className="relative" style={{ zIndex: 50 }}>
          <div ref={serviceDropdownRef} className="absolute top-0 right-0 left-0 border rounded-md max-h-48 overflow-y-auto bg-popover shadow-lg">
            {serviceResults.map((svc: any) => (
              <div
                key={svc.id}
                className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer border-b last:border-b-0"
                onClick={() => addServiceLine(svc)}
                data-testid={`result-service-${svc.id}`}
              >
                <span className="text-sm">{svc.nameAr || svc.code}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(svc.basePrice)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {type !== "service" && itemResults.length > 0 && (
        <div className="relative" style={{ zIndex: 50 }}>
          <div ref={itemDropdownRef} className="absolute top-0 right-0 left-0 border rounded-md max-h-48 overflow-y-auto bg-popover shadow-lg">
            {itemResults.map((item: any) => (
              <div
                key={item.id}
                className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer border-b last:border-b-0"
                onClick={() => addItemLine(item, type as "drug" | "consumable" | "equipment")}
                data-testid={`result-item-${type}-${item.id}`}
              >
                <div className="flex flex-row-reverse items-center gap-2">
                  <span className="text-sm">{item.nameAr || item.itemCode}</span>
                  {item.itemCode && <span className="text-[10px] text-muted-foreground">({item.itemCode})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{item.majorUnitName || item.mediumUnitName || item.minorUnitName || "وحدة"}</span>
                  <span className="text-xs text-muted-foreground">{formatNumber(item.salePriceCurrent || item.purchasePriceLast || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border rounded-md">
        <table className="peachtree-grid w-full text-sm">
          <thead>
            <tr className="peachtree-grid-header">
              <th className="text-center" style={{ width: 40 }}>#</th>
              <th>الوصف</th>
              {type === "service" && <th className="text-center" style={{ width: 120 }}>الطبيب</th>}
              {type === "service" && <th className="text-center" style={{ width: 120 }}>الممرض</th>}
              {type !== "service" && <th className="text-center" style={{ width: 80 }}>الوحدة</th>}
              <th className="text-center" style={{ width: 80 }}>الكمية</th>
              <th className="text-center" style={{ width: 100 }}>سعر الوحدة</th>
              <th className="text-center" style={{ width: 80 }}>خصم %</th>
              <th className="text-center" style={{ width: 100 }}>قيمة الخصم</th>
              <th className="text-center" style={{ width: 110 }}>الإجمالي</th>
              {isDraft && <th className="text-center" style={{ width: 50 }}></th>}
            </tr>
          </thead>
          <tbody>
            {typeLines.map((line, i) => (
              <tr
                key={line.tempId}
                className={`peachtree-grid-row ${type === "service" ? getServiceRowClass(line.serviceType) : ""}`}
                data-testid={`row-line-${type}-${i}`}
              >
                <td className="text-center">{i + 1}</td>
                <td>
                  {isDraft ? (
                    <div className="space-y-0.5">
                      <div className="flex flex-row-reverse items-center gap-1">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.tempId, "description", e.target.value)}
                          className="h-7 text-xs flex-1"
                          data-testid={`input-desc-${type}-${i}`}
                        />
                        {(type === "drug" || type === "consumable") && line.itemId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => openStatsPopup(line.itemId!, line.description)}
                            data-testid={`button-stock-stats-${type}-${i}`}
                          >
                            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                      {(type === "drug" || type === "consumable") && line.expiryMonth && line.expiryYear && (
                        <div className="flex flex-row-reverse items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                          </Badge>
                          {line.priceSource === "department" && (
                            <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400">سعر القسم</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-row-reverse items-center gap-1">
                        <span>{line.description}</span>
                        {(type === "drug" || type === "consumable") && line.itemId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => openStatsPopup(line.itemId!, line.description)}
                            data-testid={`button-stock-stats-${type}-${i}`}
                          >
                            <BarChart3 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                      {(type === "drug" || type === "consumable") && line.expiryMonth && line.expiryYear && (
                        <div className="flex flex-row-reverse items-center gap-1 mt-0.5">
                          <Badge variant="secondary" className="text-[10px]">
                            {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                          </Badge>
                          {line.priceSource === "department" && (
                            <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400">سعر القسم</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                {type === "service" && (
                  <td className={`text-center ${line.requiresDoctor ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                    {line.requiresDoctor ? (
                      isDraft ? (
                        <Input
                          value={line.doctorName}
                          onChange={(e) => updateLine(line.tempId, "doctorName", e.target.value)}
                          placeholder="اسم الطبيب *"
                          className={`h-7 text-xs ${!line.doctorName ? "border-blue-400 dark:border-blue-600" : ""}`}
                          data-testid={`input-doctor-${i}`}
                        />
                      ) : (
                        <span className="text-xs">{line.doctorName || "-"}</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                )}
                {type === "service" && (
                  <td className={`text-center ${line.requiresNurse ? "bg-purple-50 dark:bg-purple-950/40" : ""}`}>
                    {line.requiresNurse ? (
                      isDraft ? (
                        <Input
                          value={line.nurseName}
                          onChange={(e) => updateLine(line.tempId, "nurseName", e.target.value)}
                          placeholder="اسم الممرض *"
                          className={`h-7 text-xs ${!line.nurseName ? "border-purple-400 dark:border-purple-600" : ""}`}
                          data-testid={`input-nurse-${i}`}
                        />
                      ) : (
                        <span className="text-xs">{line.nurseName || "-"}</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                )}
                {type !== "service" && (
                  <td className="text-center">
                    {isDraft && line.itemId && line.item ? (
                      <select
                        value={line.unitLevel}
                        onChange={(e) => handleUnitLevelChange(line.tempId, e.target.value as "major" | "medium" | "minor")}
                        className="h-7 text-xs text-center bg-transparent border rounded px-1 w-full"
                        data-testid={`select-unit-${type}-${i}`}
                      >
                        {itemHasMajorUnit(line.item) && (
                          <option value="major">{line.item?.majorUnitName || "كبرى"}</option>
                        )}
                        {itemHasMediumUnit(line.item) && (
                          <option value="medium">{line.item?.mediumUnitName || "متوسطة"}</option>
                        )}
                        {(line.item?.minorUnitName || (!itemHasMajorUnit(line.item) && !itemHasMediumUnit(line.item))) && (
                          <option value="minor">{line.item?.minorUnitName || "وحدة"}</option>
                        )}
                      </select>
                    ) : (
                      <span className="text-xs">{line.item ? getUnitName(line.item, line.unitLevel) : "-"}</span>
                    )}
                  </td>
                )}
                <td className="text-center">
                  {isDraft ? (
                    (type === "drug" || type === "consumable") && line.lotId ? (
                      <Input
                        type="number"
                        defaultValue={line.quantity}
                        min={0}
                        step="any"
                        onChange={(e) => {
                          pendingQtyRef.current.set(line.tempId, e.target.value);
                        }}
                        onBlur={() => handleQtyConfirm(line.tempId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleQtyConfirm(line.tempId);
                          }
                        }}
                        className="h-7 text-xs text-center"
                        data-testid={`input-qty-${type}-${i}`}
                      />
                    ) : (
                      <Input
                        type="number"
                        value={line.quantity}
                        min={0}
                        step="any"
                        onChange={(e) => updateLine(line.tempId, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-qty-${type}-${i}`}
                      />
                    )
                  ) : (
                    formatNumber(line.quantity)
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <Input
                      type="number"
                      value={line.unitPrice}
                      min={0}
                      onChange={(e) => updateLine(line.tempId, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-center"
                      data-testid={`input-price-${type}-${i}`}
                    />
                  ) : (
                    formatNumber(line.unitPrice)
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <Input
                      type="number"
                      value={line.discountPercent}
                      min={0}
                      max={100}
                      onChange={(e) => updateLine(line.tempId, "discountPercent", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-center"
                      data-testid={`input-disc-pct-${type}-${i}`}
                    />
                  ) : (
                    formatNumber(line.discountPercent)
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <Input
                      type="number"
                      value={line.discountAmount}
                      min={0}
                      onChange={(e) => updateLine(line.tempId, "discountAmount", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-center"
                      data-testid={`input-disc-amt-${type}-${i}`}
                    />
                  ) : (
                    formatNumber(line.discountAmount)
                  )}
                </td>
                <td className="text-center font-bold">{formatNumber(line.totalPrice)}</td>
                {isDraft && (
                  <td className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.tempId)}
                      data-testid={`button-remove-line-${type}-${i}`}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {typeLines.length === 0 && (
              <tr>
                <td colSpan={type === "service" ? (isDraft ? 10 : 9) : (isDraft ? 8 : 7)} className="text-center text-muted-foreground py-4">
                  لا توجد بنود
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
