/**
 * ConsumablesGrid — مكون مشترك لإدارة المستهلكات
 * يُستخدم في: شاشة الخدمات والأسعار (ServiceDialog) + كارت الصنف (للأصناف من فئة خدمة)
 *
 * Props:
 *  consumables   — الصفوف الحالية (مُدارة خارجياً)
 *  onChange      — callback عند تغيير أي صف
 *  isEditing     — هل الحقول قابلة للتعديل
 *  filterCategory — تصفية نتائج البحث (اختياري، مثل "supply")
 */
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import type { Item } from "@shared/schema";

export type ConsumableRow = {
  itemId:    string;
  quantity:  string;
  unitLevel: string;
  notes:     string;
  item?:     Partial<Item>;
};

interface Props {
  consumables:     ConsumableRow[];
  onChange:        (rows: ConsumableRow[]) => void;
  isEditing?:      boolean;
  filterCategory?: string;
}

export default function ConsumablesGrid({ consumables, onChange, isEditing = true, filterCategory }: Props) {
  const [search, setSearch]   = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ search, limit: "10", page: "1" });
    if (filterCategory) params.set("category", filterCategory);
    fetch(`/api/items?${params}`, { signal: ctrl.signal, credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const existing = new Set(consumables.map(c => c.itemId));
        setResults((data.items || []).filter((i: Item) => !existing.has(i.id)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [search, consumables, filterCategory]);

  function addConsumable(item: Item) {
    onChange([...consumables, { itemId: item.id, quantity: "1", unitLevel: "minor", notes: "", item }]);
    setSearch("");
    setResults([]);
  }

  function removeConsumable(idx: number) {
    onChange(consumables.filter((_, i) => i !== idx));
  }

  function updateConsumable(idx: number, field: keyof ConsumableRow, value: string) {
    onChange(consumables.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  return (
    <div className="space-y-2">
      {isEditing && (
        <div className="relative">
          <Input
            data-testid="input-consumable-search"
            placeholder="ابحث عن صنف لإضافته كمستهلك..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="peachtree-input"
          />
          {loading && (
            <Loader2 className="h-3 w-3 animate-spin absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
          {results.length > 0 && (
            <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-background border rounded-md shadow-md max-h-40 overflow-auto">
              {results.map(item => (
                <div
                  key={item.id}
                  className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex items-center justify-between"
                  onClick={() => addConsumable(item)}
                  data-testid={`consumable-result-${item.id}`}
                >
                  <span>{item.nameAr} ({item.itemCode})</span>
                  <span className="text-muted-foreground">{item.minorUnitName || item.majorUnitName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {consumables.length > 0 ? (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-right p-1.5">الصنف</th>
                <th className="text-right p-1.5 w-20">الكمية</th>
                <th className="text-right p-1.5 w-28">الوحدة</th>
                <th className="text-right p-1.5 w-32">ملاحظات</th>
                {isEditing && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {consumables.map((c, idx) => (
                <tr key={c.itemId} className="border-t" data-testid={`consumable-row-${idx}`}>
                  <td className="p-1.5">
                    <span className="font-medium">{c.item?.nameAr || c.itemId}</span>
                    {c.item?.itemCode && (
                      <span className="text-muted-foreground mr-1">({c.item.itemCode})</span>
                    )}
                  </td>
                  <td className="p-1.5">
                    {isEditing ? (
                      <Input
                        data-testid={`input-consumable-qty-${idx}`}
                        type="number" min="0.01" step="0.01"
                        value={c.quantity}
                        onChange={e => updateConsumable(idx, "quantity", e.target.value)}
                        className="h-7 text-xs w-full"
                      />
                    ) : (
                      <span>{c.quantity}</span>
                    )}
                  </td>
                  <td className="p-1.5">
                    {isEditing ? (
                      <Select value={c.unitLevel} onValueChange={v => updateConsumable(idx, "unitLevel", v)}>
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-consumable-unit-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {c.item?.minorUnitName  && <SelectItem value="minor">{c.item.minorUnitName}</SelectItem>}
                          {c.item?.mediumUnitName && <SelectItem value="medium">{c.item.mediumUnitName}</SelectItem>}
                          {c.item?.majorUnitName  && <SelectItem value="major">{c.item.majorUnitName}</SelectItem>}
                          {!c.item?.minorUnitName && !c.item?.mediumUnitName && !c.item?.majorUnitName && (
                            <>
                              <SelectItem value="minor">صغرى</SelectItem>
                              <SelectItem value="medium">وسطى</SelectItem>
                              <SelectItem value="major">كبرى</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>
                        {c.unitLevel === "minor"  ? (c.item?.minorUnitName  || "صغرى")
                        : c.unitLevel === "medium" ? (c.item?.mediumUnitName || "وسطى")
                        :                            (c.item?.majorUnitName  || "كبرى")}
                      </span>
                    )}
                  </td>
                  <td className="p-1.5">
                    {isEditing ? (
                      <Input
                        data-testid={`input-consumable-notes-${idx}`}
                        value={c.notes}
                        onChange={e => updateConsumable(idx, "notes", e.target.value)}
                        className="h-7 text-xs w-full"
                        placeholder="اختياري"
                      />
                    ) : (
                      <span className="text-muted-foreground">{c.notes || "—"}</span>
                    )}
                  </td>
                  {isEditing && (
                    <td className="p-1.5">
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => removeConsumable(idx)}
                        data-testid={`button-remove-consumable-${idx}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-3 border rounded-md bg-muted/20">
          {isEditing
            ? "لا توجد مستهلكات — ابحث عن صنف لإضافته"
            : "لا توجد مستهلكات مرتبطة"}
        </div>
      )}
    </div>
  );
}
