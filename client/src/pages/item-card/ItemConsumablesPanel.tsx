/**
 * ItemConsumablesPanel — لوحة المستهلكات في كارت الصنف
 * تظهر فقط للأصناف من فئة (خدمة / service)
 * تستخدم ConsumablesGrid المشترك لعرض وتعديل المستهلكات المرتبطة بالصنف
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import ConsumablesGrid from "@/components/ConsumablesGrid";
import type { ConsumableRow } from "@/components/ConsumablesGrid";

interface Props {
  itemId: string;
  isEditing: boolean;
}

export default function ItemConsumablesPanel({ itemId, isEditing }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConsumableRow[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data: savedRows, isLoading } = useQuery<any[]>({
    queryKey: ["/api/items", itemId, "consumables"],
    enabled: !!itemId,
  });

  useEffect(() => {
    if (!savedRows) return;
    setRows(
      savedRows.map((r: any) => ({
        itemId: r.consumableItemId,
        quantity: r.quantity,
        unitLevel: r.unitLevel,
        notes: r.notes || "",
        item: r.item,
      }))
    );
    setDirty(false);
  }, [savedRows]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/items/${itemId}/consumables`, 
        rows.map(r => ({
          consumableItemId: r.itemId,
          quantity: r.quantity,
          unitLevel: r.unitLevel,
          notes: r.notes || null,
        }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "consumables"] });
      setDirty(false);
      toast({ title: "تم حفظ المستهلكات" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  function handleChange(updated: ConsumableRow[]) {
    setRows(updated);
    setDirty(true);
  }

  return (
    <div className="peachtree-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">المستهلكات الافتراضية</span>
        {isEditing && dirty && (
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 px-2"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-consumables"
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            حفظ المستهلكات
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground text-center py-3">جاري التحميل...</div>
      ) : (
        <ConsumablesGrid
          consumables={rows}
          onChange={handleChange}
          isEditing={isEditing}
        />
      )}
    </div>
  );
}
