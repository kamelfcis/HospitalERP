import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Star } from "lucide-react";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";
import { QuadrantCard } from "./QuadrantCard";
import { FavoriteDrugsPanel } from "./FavoriteDrugsPanel";
import type { ConsultationDrug, FavoriteDrug, FrequentDrug } from "../types";
import { useToast } from "@/hooks/use-toast";

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
    onAdd({ itemId: item.id, drugName: item.nameAr });
    setSearchOpen(false);

    // الاقتراح الذكي: هل الدواء مستخدم كثيراً ولكن غير مفضل؟
    if (item.id && isFrequent(item.id) && !isFavorite(item.id)) {
      setSuggestFav({ itemId: item.id, drugName: item.nameAr });
    }
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
        <div className="space-y-1">
          {drugs.map((drug) => (
            <div key={drug.lineNo} className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground w-5 shrink-0 text-left">{drug.lineNo}.</span>
                <Input
                  className="h-7 text-sm border-muted"
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
          ))}
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
