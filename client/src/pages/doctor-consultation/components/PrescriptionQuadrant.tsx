import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";
import { QuadrantCard } from "./QuadrantCard";
import { FavoriteDrugsPanel } from "./FavoriteDrugsPanel";
import type { ConsultationDrug, FavoriteDrug, FrequentDrug } from "../types";
import { useToast } from "@/hooks/use-toast";

function computeUnitPrice(baseSalePrice: number, unitLevel: string, item: any): number {
  if (!baseSalePrice || !item) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;
  const majorToMedium = parseFloat(item?.majorToMedium || "0") || 0;
  const majorToMinor = parseFloat(item?.majorToMinor || "0") || 0;
  const mediumToMinor = parseFloat(item?.mediumToMinor || "0") || 0;
  if (unitLevel === "medium") {
    if (majorToMedium > 0) return baseSalePrice / majorToMedium;
    if (majorToMinor > 0 && mediumToMinor > 0) return baseSalePrice / (majorToMinor / mediumToMinor);
    return baseSalePrice;
  }
  if (unitLevel === "minor") {
    if (majorToMinor > 0) return baseSalePrice / majorToMinor;
    if (majorToMedium > 0 && mediumToMinor > 0) return baseSalePrice / (majorToMedium * mediumToMinor);
    return baseSalePrice;
  }
  return baseSalePrice;
}

function getUnitName(unitLevel: string, drug: ConsultationDrug): string {
  if (unitLevel === "major") return drug.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return drug.mediumUnitName || "وحدة وسطى";
  return drug.minorUnitName || "وحدة صغرى";
}

function hasMultipleUnits(drug: ConsultationDrug): boolean {
  const m2m = parseFloat(drug.majorToMinor || "0");
  return m2m > 1;
}

interface Props {
  drugs: ConsultationDrug[];
  onAdd: (drug: Omit<ConsultationDrug, "lineNo">) => void;
  onUpdate: (lineNo: number, updates: Partial<ConsultationDrug>) => void;
  onRemove: (lineNo: number) => void;
  favorites: FavoriteDrug[];
  frequentDrugs: FrequentDrug[];
  isFavorite: (itemId: string | null | undefined) => boolean;
  isFrequent: (itemId: string | null | undefined) => boolean;
  onAddFavorite: (data: { itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }) => void;
  onRemoveFavorite: (id: string) => void;
  defaultPharmacyId?: string | null;
}

export function PrescriptionQuadrant({
  drugs, onAdd, onUpdate, onRemove,
  favorites, frequentDrugs, isFavorite, isFrequent,
  onAddFavorite, onRemoveFavorite,
  defaultPharmacyId,
}: Props) {
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestFav, setSuggestFav] = useState<{ itemId: string; drugName: string } | null>(null);

  const handleItemSelected = (payload: ItemSelectedPayload) => {
    const { item } = payload;
    const basePrice = parseFloat(item.salePriceCurrent || "0");
    const unitPrice = computeUnitPrice(basePrice, "major", item);
    onAdd({
      itemId: item.id,
      drugName: item.nameAr,
      unitLevel: "major",
      quantity: 1,
      unitPrice,
      majorUnitName: item.majorUnitName,
      mediumUnitName: item.mediumUnitName,
      minorUnitName: item.minorUnitName,
      majorToMinor: item.majorToMinor,
      mediumToMinor: item.mediumToMinor,
      majorToMedium: item.majorToMedium,
      salePriceCurrent: item.salePriceCurrent,
    });
    setSearchOpen(false);

    if (item.id && isFrequent(item.id) && !isFavorite(item.id)) {
      setSuggestFav({ itemId: item.id, drugName: item.nameAr });
    }
  };

  const handleUnitChange = (drug: ConsultationDrug, newUnit: string) => {
    const basePrice = parseFloat(drug.salePriceCurrent || "0");
    const newPrice = computeUnitPrice(basePrice, newUnit, drug);
    onUpdate(drug.lineNo, {
      unitLevel: newUnit,
      unitPrice: newPrice,
    });
  };

  const handleQtyChange = (drug: ConsultationDrug, newQty: number) => {
    onUpdate(drug.lineNo, { quantity: newQty });
  };

  const handleConfirmFavorite = () => {
    if (!suggestFav) return;
    onAddFavorite({ itemId: suggestFav.itemId, drugName: suggestFav.drugName });
    toast({ title: "تم إضافة الدواء للمفضلة" });
    setSuggestFav(null);
  };

  const warehouseId = defaultPharmacyId || "";

  return (
    <QuadrantCard
      label="الروشتة"
      action={
        <div className="flex gap-1">
          <FavoriteDrugsPanel
            favorites={favorites}
            onAdd={onAdd}
            onRemove={onRemoveFavorite}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-7 text-xs"
            onClick={() => setSearchOpen(true)}
            data-testid="button-add-drug"
          >
            <Plus className="h-3 w-3" />
            إضافة دواء
          </Button>
        </div>
      }
    >
      {drugs.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-4">
          اضغط "إضافة دواء" للبدء
        </div>
      ) : (
        <div className="space-y-2">
          {drugs.map((drug) => {
            const lineTotal = (drug.quantity || 1) * (drug.unitPrice || 0);
            const multiUnit = hasMultipleUnits(drug);
            return (
              <div key={drug.lineNo} className="space-y-1 border-b border-muted pb-1.5 last:border-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-left">{drug.lineNo}.</span>
                  <Input
                    className="h-7 text-sm border-muted flex-1"
                    value={drug.drugName}
                    onChange={(e) => onUpdate(drug.lineNo, { drugName: e.target.value })}
                    placeholder="اسم الدواء"
                    data-testid={`input-drug-name-${drug.lineNo}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => onRemove(drug.lineNo)}
                    data-testid={`button-remove-drug-${drug.lineNo}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {drug.itemId && (
                  <div className="flex items-center gap-1 pr-5">
                    <Input
                      type="number"
                      min={1}
                      className="h-6 text-xs border-muted w-16 text-center"
                      value={drug.quantity || 1}
                      onChange={(e) => handleQtyChange(drug, parseFloat(e.target.value) || 1)}
                      data-testid={`input-drug-qty-${drug.lineNo}`}
                    />
                    {multiUnit ? (
                      <Select
                        value={drug.unitLevel || "major"}
                        onValueChange={(v) => handleUnitChange(drug, v)}
                      >
                        <SelectTrigger className="h-6 text-xs w-24" data-testid={`select-drug-unit-${drug.lineNo}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {drug.majorUnitName && <SelectItem value="major">{drug.majorUnitName}</SelectItem>}
                          {drug.mediumUnitName && <SelectItem value="medium">{drug.mediumUnitName}</SelectItem>}
                          {drug.minorUnitName && <SelectItem value="minor">{drug.minorUnitName}</SelectItem>}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground px-1">
                        {getUnitName(drug.unitLevel || "major", drug)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground mx-1">×</span>
                    <span className="text-xs font-medium" data-testid={`text-drug-price-${drug.lineNo}`}>
                      {(drug.unitPrice || 0).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground mx-1">=</span>
                    <span className="text-xs font-bold text-green-700" data-testid={`text-drug-total-${drug.lineNo}`}>
                      {lineTotal.toFixed(2)} ج.م
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1 pr-5">
                  <Input
                    className="h-6 text-xs border-muted"
                    value={drug.dose || ""}
                    onChange={(e) => onUpdate(drug.lineNo, { dose: e.target.value })}
                    placeholder="الجرعة"
                    data-testid={`input-drug-dose-${drug.lineNo}`}
                  />
                  <Input
                    className="h-6 text-xs border-muted"
                    value={drug.frequency || ""}
                    onChange={(e) => onUpdate(drug.lineNo, { frequency: e.target.value })}
                    placeholder="التكرار"
                    data-testid={`input-drug-freq-${drug.lineNo}`}
                  />
                  <Input
                    className="h-6 text-xs border-muted"
                    value={drug.duration || ""}
                    onChange={(e) => onUpdate(drug.lineNo, { duration: e.target.value })}
                    placeholder="المدة"
                    data-testid={`input-drug-duration-${drug.lineNo}`}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end pt-1 border-t">
            <span className="text-xs font-bold text-foreground" data-testid="text-prescription-total">
              الإجمالي: {drugs.reduce((s, d) => s + (d.quantity || 1) * (d.unitPrice || 0), 0).toFixed(2)} ج.م
            </span>
          </div>
        </div>
      )}

      {suggestFav && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs flex items-center gap-2 justify-between">
          <span className="text-yellow-800">
            ⭐ تستخدم "{suggestFav.drugName}" كثيراً — أضفه لمفضلتك؟
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-yellow-300" onClick={handleConfirmFavorite} data-testid="button-confirm-favorite">
              نعم
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setSuggestFav(null)} data-testid="button-dismiss-favorite">
              تجاهل
            </Button>
          </div>
        </div>
      )}

      <ItemFastSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        warehouseId={warehouseId}
        drugsOnly={true}
        hideStockWarning={!warehouseId}
        onItemSelected={handleItemSelected}
        title="بحث عن دواء"
      />
    </QuadrantCard>
  );
}
