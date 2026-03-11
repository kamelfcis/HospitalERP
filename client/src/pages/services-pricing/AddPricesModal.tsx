import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import { useServicesLookup } from "@/hooks/lookups/useServicesLookup";
import type { LookupItem } from "@/lib/lookupTypes";

interface Props {
  open: boolean;
  onClose: () => void;
  listId: string;
}

// ─── AddPricesModal ────────────────────────────────────────────────────────────
/**
 * AddPricesModal
 * ديالوج إضافة خدمات وأسعار لقائمة أسعار معينة.
 * يتيح البحث عن خدمات، اختيارها، وتحديد السعر لكل منها.
 */
export default function AddPricesModal({ open, onClose, listId }: Props) {
  const { toast } = useToast();
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<{ serviceId: string; code: string; nameAr: string; price: string }[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");

  const { items, isLoading } = useServicesLookup({ search, active: true, enabled: open });

  const addMutation = useMutation({
    mutationFn: (entries: { serviceId: string; price: string }[]) =>
      apiRequest("POST", `/api/price-lists/${listId}/items`, { items: entries }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم إضافة الأسعار" });
      onClose();
      setSelected([]);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function toggleService(item: LookupItem) {
    setSelected(prev => {
      const exists = prev.find(x => x.serviceId === item.id);
      if (exists) return prev.filter(x => x.serviceId !== item.id);
      return [...prev, {
        serviceId: item.id,
        code: item.code || "",
        nameAr: item.name,
        price: defaultPrice || String((item.meta as any)?.basePrice || 0),
      }];
    });
  }

  function handleSave() {
    if (selected.length === 0) return;
    addMutation.mutate(selected.map(s => ({ serviceId: s.serviceId, price: s.price })));
  }

  useEffect(() => { if (!open) { setSearch(""); setSelected([]); setDefaultPrice(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة أسعار</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-testid="input-search-add-services"
              placeholder="ابحث عن خدمة (أدخل حرفين على الأقل)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="peachtree-input flex-1"
            />
            <Input
              data-testid="input-default-price"
              type="number" min="0" step="0.01"
              placeholder="السعر الافتراضي"
              value={defaultPrice}
              onChange={e => setDefaultPrice(e.target.value)}
              className="peachtree-input w-36"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            <div className="peachtree-grid overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="peachtree-grid-header" data-testid="header-add-services-table">
                    <th className="w-10"></th>
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>السعر الأساسي</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-xs text-muted-foreground">
                        {search.length < 2 ? "ابحث بكتابة اسم الخدمة أو الكود..." : "لا توجد نتائج"}
                      </td>
                    </tr>
                  ) : (
                    items.map(item => {
                      const isSelected = selected.some(x => x.serviceId === item.id);
                      return (
                        <tr key={item.id} className="peachtree-grid-row cursor-pointer"
                          onClick={() => toggleService(item)} data-testid={`row-add-service-${item.id}`}>
                          <td>
                            <Checkbox checked={isSelected} data-testid={`checkbox-service-${item.id}`} />
                          </td>
                          <td className="font-mono text-xs">{item.code}</td>
                          <td className="text-xs">{item.name}</td>
                          <td className="peachtree-amount text-xs">
                            {formatNumber((item.meta as any)?.basePrice)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-selected-count">
              تم اختيار {selected.length} خدمة
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-add-prices">إلغاء</Button>
          <Button onClick={handleSave} disabled={addMutation.isPending || selected.length === 0}
            data-testid="button-save-add-prices">
            {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            إضافة ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
