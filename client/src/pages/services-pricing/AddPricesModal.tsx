import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import type { ServiceWithDepartment } from "@shared/schema";
import { useDebounce } from "./hooks";

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
  const debouncedSearch             = useDebounce(search, 300);
  const [selected, setSelected]     = useState<{ serviceId: string; code: string; nameAr: string; price: string }[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");

  const { data: servicesData } = useQuery<{ data: ServiceWithDepartment[]; total: number }>({
    queryKey: ["/api/services", "active=true&pageSize=200" + (debouncedSearch ? `&search=${debouncedSearch}` : "")],
    queryFn: async () => {
      const qs = "active=true&pageSize=200" + (debouncedSearch ? `&search=${debouncedSearch}` : "");
      const res = await fetch(`/api/services?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (items: { serviceId: string; price: string }[]) =>
      apiRequest("POST", `/api/price-lists/${listId}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم إضافة الأسعار" });
      onClose();
      setSelected([]);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function toggleService(s: ServiceWithDepartment) {
    setSelected(prev => {
      const exists = prev.find(x => x.serviceId === s.id);
      if (exists) return prev.filter(x => x.serviceId !== s.id);
      return [...prev, { serviceId: s.id, code: s.code, nameAr: s.nameAr, price: defaultPrice || String(s.basePrice) }];
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
              placeholder="بحث عن خدمة..."
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
                  {(servicesData?.data || []).map(s => {
                    const isSelected = selected.some(x => x.serviceId === s.id);
                    return (
                      <tr key={s.id} className="peachtree-grid-row cursor-pointer"
                        onClick={() => toggleService(s)} data-testid={`row-add-service-${s.id}`}>
                        <td>
                          <Checkbox checked={isSelected} data-testid={`checkbox-service-${s.id}`} />
                        </td>
                        <td className="font-mono text-xs">{s.code}</td>
                        <td className="text-xs">{s.nameAr}</td>
                        <td className="peachtree-amount text-xs">{formatNumber(s.basePrice)}</td>
                      </tr>
                    );
                  })}
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
