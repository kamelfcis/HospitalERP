import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, X, BarChart3, ShieldCheck, ShieldOff, Clock } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { Service, Item } from "@shared/schema";
import type { LineLocal } from "../types";
import {
  itemHasMajorUnit,
  itemHasMediumUnit,
  getUnitName,
} from "../utils/units";
import { SearchDropdown } from "./SearchDropdown";
import { ServiceLookup } from "@/components/lookups";

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
  itemSearchRef: React.RefObject<HTMLInputElement>;
  itemDropdownRef: React.RefObject<HTMLDivElement>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;
  addServiceLine: (svc: Service) => void;
  addItemLine: (item: Item, type: "drug" | "consumable" | "equipment") => void;
  updateLine: (tempId: string, field: string, value: unknown) => void;
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
  itemSearchRef,
  itemDropdownRef,
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
  const [selectedServiceId, setSelectedServiceId] = useState("");

  return (
    <div className="space-y-3">
      {type !== "service" ? (
        <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchDropdown
              inputRef={itemSearchRef}
              dropdownRef={itemDropdownRef}
              value={itemSearch}
              onChange={setItemSearch}
              onClear={() => {
                setItemSearch("");
                setItemResults([]);
              }}
              show={itemResults.length > 0}
              setShow={(v) => { if (!v) setItemResults([]); }}
              loading={false}
              items={itemResults.map((item) => ({
                id: item.id,
                primary: item.nameAr || (item as any).itemCode || "",
                raw: item,
              }))}
              onSelect={(si) => addItemLine(si.raw, type as "drug" | "consumable" | "equipment")}
              placeholder="بحث عن صنف... (استخدم % للبحث المتقدم)"
              disabled={!isDraft}
              showSearchIcon
              inputClassName="pr-8"
              inputTestId={`input-item-search-${type}`}
              itemTestIdPrefix={`result-item-${type}`}
              renderItem={(si) => {
                const item = si.raw as Item & { itemCode?: string; majorUnitName?: string; mediumUnitName?: string; minorUnitName?: string; salePriceCurrent?: number; purchasePriceLast?: number };
                return (
                  <div className="flex flex-row-reverse items-center justify-between gap-2 w-full">
                    <div className="flex flex-row-reverse items-center gap-2">
                      <span className="text-sm">{item.nameAr || (item as any).itemCode}</span>
                      {(item as any).itemCode && (
                        <span className="text-[10px] text-muted-foreground">({(item as any).itemCode})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {item.majorUnitName || item.mediumUnitName || item.minorUnitName || "وحدة"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber((item as any).salePriceCurrent || (item as any).purchasePriceLast || 0)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          </div>
          {searchingItems && <Loader2 className="h-4 w-4 animate-spin" />}
          {fefoLoading && <Badge variant="secondary" className="text-xs">جاري توزيع الصلاحية...</Badge>}
        </div>
      ) : (
        <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <ServiceLookup
              value={selectedServiceId}
              onChange={(item) => {
                if (item) {
                  addServiceLine(item.meta as Service);
                  setSelectedServiceId("");
                }
              }}
              placeholder="بحث عن خدمة..."
              disabled={!isDraft}
              data-testid="input-service-search"
            />
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
                      {line.coverageStatus && line.coverageStatus !== "not_required" && (
                        <TooltipProvider>
                          <div className="flex flex-row-reverse items-center gap-1 mt-0.5 flex-wrap" data-testid={`coverage-${type}-${i}`}>
                            {/* Coverage status badge */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  {line.coverageStatus === "covered" ? (
                                    <Badge className="text-[10px] bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-300 gap-0.5 cursor-help">
                                      <ShieldCheck className="h-2.5 w-2.5" />مشمول
                                    </Badge>
                                  ) : line.coverageStatus === "excluded" ? (
                                    <Badge className="text-[10px] bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-300 gap-0.5 cursor-help">
                                      <ShieldOff className="h-2.5 w-2.5" />مستثنى
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] gap-0.5 cursor-help">
                                      <ShieldCheck className="h-2.5 w-2.5" />{line.coverageStatus}
                                    </Badge>
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" dir="rtl" className="max-w-xs text-xs leading-relaxed">
                                {line.coverageStatus === "covered" && line.companyShareAmount && (
                                  <div className="mb-1">
                                    <span className="font-medium">نصيب الشركة: </span>{formatNumber(parseFloat(line.companyShareAmount || "0"))} ج.م
                                    {line.patientShareAmount && (
                                      <> | <span className="font-medium">نصيب المريض: </span>{formatNumber(parseFloat(line.patientShareAmount || "0"))} ج.م</>
                                    )}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                            {line.approvalStatus === "pending" && (
                              <Badge className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 gap-0.5">
                                <Clock className="h-2.5 w-2.5" />ينتظر موافقة
                              </Badge>
                            )}
                            {/* Share chips */}
                            {line.coverageStatus === "covered" && line.companyShareAmount && parseFloat(line.companyShareAmount) > 0 && (
                              <Badge variant="outline" className="text-[10px] text-blue-700 dark:text-blue-400 border-blue-300">
                                شركة: {formatNumber(parseFloat(line.companyShareAmount))}
                              </Badge>
                            )}
                            {line.coverageStatus === "covered" && line.patientShareAmount && parseFloat(line.patientShareAmount) > 0 && (
                              <Badge variant="outline" className="text-[10px] text-orange-700 dark:text-orange-400 border-orange-300">
                                مريض: {formatNumber(parseFloat(line.patientShareAmount))}
                              </Badge>
                            )}
                          </div>
                        </TooltipProvider>
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
