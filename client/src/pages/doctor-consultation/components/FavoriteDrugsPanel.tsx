import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Star, Trash2, Plus } from "lucide-react";
import type { FavoriteDrug, ConsultationDrug } from "../types";

interface Props {
  favorites: FavoriteDrug[];
  onAdd: (drug: Omit<ConsultationDrug, "lineNo">) => void;
  onRemove: (id: string) => void;
}

export function FavoriteDrugsPanel({ favorites, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);

  const handleAdd = (fav: FavoriteDrug) => {
    onAdd({
      itemId: fav.itemId,
      drugName: fav.drugName,
      dose: fav.defaultDose,
      frequency: fav.defaultFrequency,
      duration: fav.defaultDuration,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 h-7 text-xs"
          data-testid="button-favorites-panel"
        >
          <Star className="h-3 w-3 text-yellow-500" />
          المفضلة ({favorites.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start" dir="rtl">
        <p className="text-sm font-semibold mb-2 text-right">الأدوية المفضلة</p>
        {favorites.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا توجد أدوية مفضلة بعد</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center justify-between rounded border p-2 hover:bg-muted/50 group"
              >
                <div className="flex-1 text-right min-w-0 ml-2">
                  <p className="text-sm font-medium truncate">{fav.drugName}</p>
                  {(fav.defaultDose || fav.defaultFrequency) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[fav.defaultDose, fav.defaultFrequency, fav.defaultDuration].filter(Boolean).join(" — ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-primary"
                    onClick={() => handleAdd(fav)}
                    data-testid={`button-add-favorite-${fav.id}`}
                    title="أضف للروشتة"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onRemove(fav.id)}
                    data-testid={`button-remove-favorite-${fav.id}`}
                    title="حذف من المفضلة"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
