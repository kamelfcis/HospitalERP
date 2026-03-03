import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Copy, Settings2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/formatters";
import type { PriceList, PriceListItemWithService, Department } from "@shared/schema";
import { useDebounce } from "./hooks";
import PriceListModal, { type PriceListFormState, defaultPriceListForm } from "./PriceListModal";
import AddPricesModal from "./AddPricesModal";
import CopyFromModal from "./CopyFromModal";
import BulkAdjustModal from "./BulkAdjustModal";

// ─── PriceListsTab ─────────────────────────────────────────────────────────────
/**
 * PriceListsTab
 * تبويب قوائم الأسعار: لوحة مقسومة — قائمة قوائم الأسعار يساراً + بنود القائمة يميناً.
 * يشمل إضافة/تعديل قائمة، إضافة أسعار، نسخ، وتعديل جماعي.
 */
export default function PriceListsTab() {
  const { toast } = useToast();

  // ─── حالة القوائم ─────────────────────────────────────────────────────────
  const [selectedListId, setSelectedListId]     = useState<string | null>(null);
  const [listSearch, setListSearch]             = useState("");
  const [plModalOpen, setPlModalOpen]           = useState(false);
  const [editingPl, setEditingPl]               = useState<PriceList | null>(null);
  const [plForm, setPlForm]                     = useState<PriceListFormState>(defaultPriceListForm);

  // ─── حالة بنود القائمة ────────────────────────────────────────────────────
  const [itemSearch, setItemSearch]           = useState("");
  const debouncedItemSearch                   = useDebounce(itemSearch, 300);
  const [itemFilterDept, setItemFilterDept]   = useState("all");
  const [itemPage, setItemPage]               = useState(1);
  const itemPageSize                          = 50;

  // ─── حالة التعديل المضمّن للسعر ──────────────────────────────────────────
  const [editingPriceId, setEditingPriceId]       = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  // ─── حالة الـ modals الفرعية ──────────────────────────────────────────────
  const [addPricesOpen, setAddPricesOpen]     = useState(false);
  const [copyFromOpen, setCopyFromOpen]       = useState(false);
  const [bulkAdjustOpen, setBulkAdjustOpen]   = useState(false);

  useEffect(() => { setItemPage(1); }, [debouncedItemSearch, itemFilterDept, selectedListId]);

  // ─── استعلامات ────────────────────────────────────────────────────────────
  const { data: priceLists, isLoading: plLoading } = useQuery<PriceList[]>({ queryKey: ["/api/price-lists"] });
  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  const filteredLists = useMemo(() => {
    if (!priceLists) return [];
    if (!listSearch) return priceLists;
    const s = listSearch.toLowerCase();
    return priceLists.filter(pl => pl.name.toLowerCase().includes(s) || pl.code.toLowerCase().includes(s));
  }, [priceLists, listSearch]);

  const itemQp = new URLSearchParams();
  if (debouncedItemSearch)        itemQp.set("search",       debouncedItemSearch);
  if (itemFilterDept !== "all")   itemQp.set("departmentId", itemFilterDept);
  itemQp.set("page",     String(itemPage));
  itemQp.set("pageSize", String(itemPageSize));

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
  const itemTotalPages = Math.max(1, Math.ceil(itemTotal / itemPageSize));

  // ─── mutations ────────────────────────────────────────────────────────────
  const plCreateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/price-lists", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "تم إنشاء قائمة الأسعار" });
      setPlModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const plUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/price-lists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "تم تحديث قائمة الأسعار" });
      setPlModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ listId, serviceId, price }: { listId: string; serviceId: string; price: string }) =>
      apiRequest("POST", `/api/price-lists/${listId}/items`, { serviceId, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", selectedListId] });
      setEditingPriceId(null);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ─── معالجات قوائم الأسعار ────────────────────────────────────────────────
  function openPlCreate() {
    setEditingPl(null);
    setPlForm(defaultPriceListForm);
    setPlModalOpen(true);
  }

  function openPlEdit(pl: PriceList) {
    setEditingPl(pl);
    setPlForm({
      code: pl.code, name: pl.name, currency: pl.currency,
      validFrom: pl.validFrom || "", validTo: pl.validTo || "",
      isActive: pl.isActive, notes: pl.notes || "",
    });
    setPlModalOpen(true);
  }

  function savePl() {
    const payload = {
      ...plForm,
      validFrom: plForm.validFrom || null,
      validTo:   plForm.validTo   || null,
      notes:     plForm.notes     || null,
    };
    if (editingPl) {
      plUpdateMutation.mutate({ id: editingPl.id, data: payload });
    } else {
      plCreateMutation.mutate(payload);
    }
  }

  // ─── معالجات تعديل السعر المضمّن ──────────────────────────────────────────
  function startEditPrice(item: PriceListItemWithService) {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.price));
  }

  function savePrice(item: PriceListItemWithService) {
    if (!selectedListId || !item.serviceId) return;
    updatePriceMutation.mutate({ listId: selectedListId, serviceId: item.serviceId, price: editingPriceValue });
  }

  const plSaving      = plCreateMutation.isPending || plUpdateMutation.isPending;
  const selectedList  = priceLists?.find(pl => pl.id === selectedListId);

  return (
    <div className="flex gap-2" style={{ height: "calc(100vh - 8rem)" }} dir="rtl">

      {/* ─── الجانب الأيمن: قائمة القوائم ─────────────────────────────── */}
      <div className="flex flex-col gap-1" style={{ width: "320px", minWidth: "320px" }}>
        <div className="peachtree-toolbar flex items-center justify-between">
          <h3 className="text-sm font-semibold" data-testid="text-price-lists-title">قوائم الأسعار</h3>
          <Button size="sm" className="text-xs gap-1" onClick={openPlCreate} data-testid="button-add-price-list">
            <Plus className="h-3 w-3" />
            إضافة
          </Button>
        </div>
        <div className="peachtree-toolbar flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            data-testid="input-search-price-lists"
            placeholder="بحث..."
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            className="peachtree-input flex-1"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {plLoading ? (
            <div className="peachtree-grid overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-2 border-b"><Skeleton className="h-4 w-full" /></div>
              ))}
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="peachtree-grid overflow-hidden">
              <p className="text-muted-foreground text-xs text-center py-4"
                data-testid="text-empty-price-lists">لا توجد قوائم أسعار</p>
            </div>
          ) : (
            <div className="peachtree-grid overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>العملة</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLists.map(pl => (
                    <tr
                      key={pl.id}
                      className={`peachtree-grid-row cursor-pointer ${selectedListId === pl.id ? "!bg-blue-100" : ""}`}
                      onClick={() => setSelectedListId(pl.id)}
                      data-testid={`row-price-list-${pl.id}`}
                    >
                      <td className="font-mono text-xs">{pl.code}</td>
                      <td className="text-xs font-medium">{pl.name}</td>
                      <td className="text-xs text-center">{pl.currency}</td>
                      <td>
                        <Badge variant="outline"
                          className={`text-[10px] no-default-active-elevate ${
                            pl.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                          {pl.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </td>
                      <td>
                        <Button size="icon" variant="ghost"
                          onClick={e => { e.stopPropagation(); openPlEdit(pl); }}
                          data-testid={`button-edit-price-list-${pl.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── الجانب الأيسر: بنود القائمة المختارة ─────────────────────── */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {!selectedListId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs"
            data-testid="text-select-price-list-prompt">
            اختر قائمة أسعار من القائمة
          </div>
        ) : (
          <>
            <div className="peachtree-toolbar flex items-center justify-between">
              <h3 className="text-sm font-semibold" data-testid="text-selected-list-name">
                {selectedList?.name || ""}
              </h3>
              <div className="flex items-center gap-1">
                <Button size="sm" className="text-xs gap-1" onClick={() => setAddPricesOpen(true)}
                  data-testid="button-add-prices">
                  <Plus className="h-3 w-3" />
                  إضافة أسعار
                </Button>
                <Button size="sm" className="text-xs gap-1" variant="outline"
                  onClick={() => setCopyFromOpen(true)} data-testid="button-copy-from">
                  <Copy className="h-3 w-3" />
                  نسخ من قائمة أخرى
                </Button>
                <Button size="sm" className="text-xs gap-1" variant="outline"
                  onClick={() => setBulkAdjustOpen(true)} data-testid="button-bulk-adjust">
                  <Settings2 className="h-3 w-3" />
                  تعديل جماعي
                </Button>
              </div>
            </div>

            {/* ─── فلاتر البنود ──────────────────────────────────────── */}
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
                  {(departments || []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ─── جدول البنود ───────────────────────────────────────── */}
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

            {/* ─── ترقيم الصفحات ─────────────────────────────────────── */}
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
        )}
      </div>

      {/* ─── ديالوج قائمة الأسعار ──────────────────────────────────────── */}
      <PriceListModal
        open={plModalOpen}
        onClose={() => setPlModalOpen(false)}
        form={plForm}
        setForm={setPlForm}
        onSave={savePl}
        saving={plSaving}
        isEdit={!!editingPl}
      />

      {/* ─── الـ modals الفرعية ────────────────────────────────────────── */}
      {selectedListId && (
        <>
          <AddPricesModal
            open={addPricesOpen}
            onClose={() => setAddPricesOpen(false)}
            listId={selectedListId}
          />
          <CopyFromModal
            open={copyFromOpen}
            onClose={() => setCopyFromOpen(false)}
            listId={selectedListId}
            priceLists={(priceLists || []).filter(pl => pl.id !== selectedListId)}
          />
          <BulkAdjustModal
            open={bulkAdjustOpen}
            onClose={() => setBulkAdjustOpen(false)}
            listId={selectedListId}
          />
        </>
      )}
    </div>
  );
}
