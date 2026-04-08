/**
 * PriceListItemsTable.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * جدول بنود قائمة الأسعار المختارة — مفصول هنا عن PriceListsTab لتخفيف حجمه.
 * يشمل: فلاتر البحث/القسم، الجدول مع التعديل المضمّن للسعر، وترقيم الصفحات.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import type { PriceListItemWithService } from "@shared/schema";
import { useDepartmentsLookup } from "@/hooks/lookups/useDepartmentsLookup";
import { useDebounce } from "./hooks";

interface PriceListItemsTableProps {
  selectedListId: string;
}

const PAGE_SIZE = 50;

export function PriceListItemsTable({ selectedListId }: PriceListItemsTableProps) {
  const { toast } = useToast();
  const { items: departmentItems } = useDepartmentsLookup();

  // ─── حالة الفلاتر والترقيم ────────────────────────────────────────────────
  const [itemSearch, setItemSearch]           = useState("");
  const debouncedItemSearch                   = useDebounce(itemSearch, 300);
  const [itemFilterDept, setItemFilterDept]   = useState("all");
  const [itemPage, setItemPage]               = useState(1);

  // ─── حالة التعديل المضمّن ─────────────────────────────────────────────────
  const [editingPriceId, setEditingPriceId]       = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  // إعادة ضبط الصفحة عند تغيير الفلاتر أو القائمة
  useEffect(() => { setItemPage(1); }, [debouncedItemSearch, itemFilterDept, selectedListId]);
  // مسح التعديل عند تغيير القائمة
  useEffect(() => { setEditingPriceId(null); }, [selectedListId]);

  // ─── استعلام بنود القائمة ──────────────────────────────────────────────────
  const itemQp = new URLSearchParams();
  if (debouncedItemSearch)        itemQp.set("search",       debouncedItemSearch);
  if (itemFilterDept !== "all")   itemQp.set("departmentId", itemFilterDept);
  itemQp.set("page",     String(itemPage));
  itemQp.set("pageSize", String(PAGE_SIZE));

  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ data: PriceListItemWithService[]; total: number }>({
    queryKey: ["/api/price-lists", selectedListId, "items?" + itemQp.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/price-lists/${selectedListId}/items?${itemQp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedListId,
  });

  const items          = itemsData?.data  || [];
  const itemTotal      = itemsData?.total || 0;
  const itemTotalPages = Math.max(1, Math.ceil(itemTotal / PAGE_SIZE));

  // ─── mutation تحديث السعر ─────────────────────────────────────────────────
  const updatePriceMutation = useMutation({
    mutationFn: ({ serviceId, price }: { serviceId: string; price: string }) =>
      apiRequest("POST", `/api/price-lists/${selectedListId}/items`, { serviceId, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", selectedListId] });
      setEditingPriceId(null);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ─── معالجات التعديل ──────────────────────────────────────────────────────
  function startEditPrice(item: PriceListItemWithService) {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.price));
  }

  function savePrice(item: PriceListItemWithService) {
    if (!item.serviceId) return;
    updatePriceMutation.mutate({ serviceId: item.serviceId, price: editingPriceValue });
  }

  return (
    <>
      {/* ─── فلاتر البنود ──────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            data-testid="input-search-price-items"
            placeholder="بحث بالكود أو الاسم..."
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            className="peachtree-input w-52"
          />
        </div>
        <span className="text-xs font-medium">القسم:</span>
        <Select value={itemFilterDept} onValueChange={setItemFilterDept}>
          <SelectTrigger className="peachtree-select w-28" data-testid="select-trigger-item-filter-dept">
            <SelectValue placeholder="القسم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departmentItems.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── جدول البنود ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="peachtree-grid overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="peachtree-grid-header" data-testid="header-price-items-table">
                <th>كود الخدمة</th>
                <th>اسم الخدمة</th>
                <th>القسم</th>
                <th>الفئة</th>
                <th>السعر</th>
                <th>تحديث</th>
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="peachtree-grid-row">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground p-8 text-xs"
                    data-testid="text-empty-price-items">
                    لا توجد أسعار في هذه القائمة
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="peachtree-grid-row" data-testid={`row-price-item-${item.id}`}>
                    <td className="font-mono text-xs">{item.service?.code || "-"}</td>
                    <td className="text-xs">{item.service?.nameAr || "-"}</td>
                    <td className="text-xs">{item.service?.department?.nameAr || "-"}</td>
                    <td className="text-xs">{item.service?.category || "-"}</td>
                    <td className="peachtree-amount text-xs">
                      {editingPriceId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            data-testid={`input-price-${item.id}`}
                            type="number" min="0" step="0.01"
                            value={editingPriceValue}
                            onChange={e => setEditingPriceValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") savePrice(item);
                              if (e.key === "Escape") setEditingPriceId(null);
                            }}
                            className="peachtree-input w-28"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" onClick={() => savePrice(item)}
                            data-testid={`button-save-price-${item.id}`}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingPriceId(null)}
                            data-testid={`button-cancel-price-${item.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="cursor-pointer hover:underline"
                          onClick={() => startEditPrice(item)}
                          data-testid={`text-price-${item.id}`}>
                          {formatNumber(item.price)}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("ar-EG") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── ترقيم الصفحات ─────────────────────────────────────────────── */}
      {itemTotalPages > 1 && (
        <div className="peachtree-toolbar flex items-center justify-between">
          <span className="text-xs text-muted-foreground" data-testid="text-items-pagination">
            صفحة {itemPage} من {itemTotalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={itemPage <= 1}
              onClick={() => setItemPage(p => p - 1)} data-testid="button-prev-page-items">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" disabled={itemPage >= itemTotalPages}
              onClick={() => setItemPage(p => p + 1)} data-testid="button-next-page-items">
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
