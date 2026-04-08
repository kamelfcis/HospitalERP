import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Copy, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PriceList } from "@shared/schema";
import PriceListModal, { type PriceListFormState, defaultPriceListForm, priceListTypeLabels } from "./PriceListModal";
import AddPricesModal from "./AddPricesModal";
import CopyFromModal from "./CopyFromModal";
import BulkAdjustModal from "./BulkAdjustModal";
import { PriceListItemsTable } from "./PriceListItemsTable";

// ─── PriceListsTab ─────────────────────────────────────────────────────────────
/**
 * PriceListsTab
 * تبويب قوائم الأسعار: لوحة مقسومة — قائمة قوائم الأسعار يساراً + بنود القائمة يميناً.
 * يشمل إضافة/تعديل قائمة، إضافة أسعار، نسخ، وتعديل جماعي.
 * بنود القائمة معالجتها في PriceListItemsTable (مفصولة لتخفيف الحجم).
 */
export default function PriceListsTab() {
  const { toast } = useToast();

  // ─── حالة القوائم ─────────────────────────────────────────────────────────
  const [selectedListId, setSelectedListId]     = useState<string | null>(null);
  const [listSearch, setListSearch]             = useState("");
  const [plModalOpen, setPlModalOpen]           = useState(false);
  const [editingPl, setEditingPl]               = useState<PriceList | null>(null);
  const [plForm, setPlForm]                     = useState<PriceListFormState>(defaultPriceListForm);

  // ─── حالة الـ modals الفرعية ──────────────────────────────────────────────
  const [addPricesOpen, setAddPricesOpen]     = useState(false);
  const [copyFromOpen, setCopyFromOpen]       = useState(false);
  const [bulkAdjustOpen, setBulkAdjustOpen]   = useState(false);

  // ─── استعلامات ────────────────────────────────────────────────────────────
  const { data: priceLists, isLoading: plLoading } = useQuery<PriceList[]>({ queryKey: ["/api/price-lists"] });

  const filteredLists = useMemo(() => {
    if (!priceLists) return [];
    if (!listSearch) return priceLists;
    const s = listSearch.toLowerCase();
    return priceLists.filter(pl => pl.name.toLowerCase().includes(s) || pl.code.toLowerCase().includes(s));
  }, [priceLists, listSearch]);

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
      priceListType: (pl as any).priceListType || "service",
      isDefault: (pl as any).isDefault ?? false,
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

  const plSaving     = plCreateMutation.isPending || plUpdateMutation.isPending;
  const selectedList = priceLists?.find(pl => pl.id === selectedListId);

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
                    <th>النوع</th>
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
                      <td>
                        {(() => {
                          const t = (pl as any).priceListType || "service";
                          const colors: Record<string, string> = {
                            service:  "bg-blue-50 text-blue-700 border-blue-200",
                            pharmacy: "bg-emerald-50 text-emerald-700 border-emerald-200",
                            mixed:    "bg-amber-50 text-amber-700 border-amber-200",
                          };
                          return (
                            <Badge variant="outline"
                              className={`text-[10px] no-default-active-elevate ${colors[t] ?? colors.service}`}>
                              {priceListTypeLabels[t] ?? t}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="flex items-center gap-1">
                        <Badge variant="outline"
                          className={`text-[10px] no-default-active-elevate ${
                            pl.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                          {pl.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                        {(pl as any).isDefault && (
                          <Badge variant="outline" className="text-[10px] no-default-active-elevate bg-amber-50 text-amber-700 border-amber-300 gap-0.5">
                            ★ افتراضية
                          </Badge>
                        )}
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

            <PriceListItemsTable selectedListId={selectedListId} />
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
