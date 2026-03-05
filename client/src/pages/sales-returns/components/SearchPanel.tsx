import { useState } from "react";
import { Search, FileText, Barcode, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import type { SearchMode } from "../hooks/useReturnSearch";
import type { ReturnSearchResult } from "../types";

interface Props {
  searchMode: SearchMode;
  setSearchMode: (m: SearchMode) => void;
  searchValue: string;
  setSearchValue: (v: string) => void;
  selectedItemId: string | null;
  selectedItemName: string;
  setSelectedItemId: (id: string | null) => void;
  setSelectedItemName: (name: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  results: ReturnSearchResult[];
  isLoading: boolean;
  canSearch: boolean;
  triggerSearch: () => void;
  onSelectInvoice: (id: string) => void;
}

export function SearchPanel({
  searchMode, setSearchMode,
  searchValue, setSearchValue,
  selectedItemId, selectedItemName, setSelectedItemId, setSelectedItemName,
  dateFrom, setDateFrom, dateTo, setDateTo,
  warehouseId, setWarehouseId,
  results, isLoading, canSearch, triggerSearch,
  onSelectInvoice,
}: Props) {
  const { data: warehouses = [] } = useQuery<any[]>({ queryKey: ["/api/warehouses"] });
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState("");

  const { data: itemResults = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: [`/api/items/search?q=${encodeURIComponent(itemSearchTerm)}`],
    enabled: itemSearchTerm.length >= 2,
  });

  const modes: { key: SearchMode; label: string; icon: any }[] = [
    { key: "invoiceNumber", label: "رقم الفاتورة", icon: FileText },
    { key: "receiptBarcode", label: "باركود الإيصال", icon: Barcode },
    { key: "item", label: "بحث بالصنف", icon: Package },
  ];

  return (
    <div className="space-y-3" data-testid="section-search">
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {modes.map((m) => (
          <Button
            key={m.key}
            variant={searchMode === m.key ? "default" : "outline"}
            size="sm"
            onClick={() => { setSearchMode(m.key); setSearchValue(""); setSelectedItemId(null); setSelectedItemName(""); }}
            data-testid={`button-mode-${m.key}`}
          >
            <m.icon className="h-4 w-4 ml-1" />
            {m.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-end" dir="rtl">
        {(searchMode === "invoiceNumber" || searchMode === "receiptBarcode") && (
          <div className="w-48">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">
              {searchMode === "invoiceNumber" ? "رقم الفاتورة" : "رقم الإيصال"}
            </label>
            <Input
              type="number"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && triggerSearch()}
              placeholder={searchMode === "invoiceNumber" ? "ادخل رقم الفاتورة" : "ادخل رقم الإيصال"}
              className="h-9"
              autoFocus
              data-testid="input-search-value"
            />
          </div>
        )}

        {searchMode === "item" && (
          <div className="w-64 relative">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">بحث عن صنف</label>
            {selectedItemId ? (
              <div className="flex items-center gap-2 h-9 border rounded px-2 bg-muted">
                <span className="text-sm font-semibold truncate flex-1">{selectedItemName}</span>
                <button
                  onClick={() => { setSelectedItemId(null); setSelectedItemName(""); setItemSearchTerm(""); }}
                  className="text-xs text-destructive hover:underline"
                  data-testid="button-clear-item"
                >
                  مسح
                </button>
              </div>
            ) : (
              <>
                <Input
                  value={itemSearchTerm}
                  onChange={(e) => { setItemSearchTerm(e.target.value); setItemSearchOpen(true); }}
                  onFocus={() => setItemSearchOpen(true)}
                  placeholder="اسم أو كود الصنف..."
                  className="h-9"
                  data-testid="input-item-search"
                />
                {itemSearchOpen && itemSearchTerm.length >= 2 && (
                  <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto bg-background border rounded-lg shadow-xl">
                    {itemsLoading ? (
                      <div className="p-3 text-center text-muted-foreground text-sm">جاري البحث...</div>
                    ) : itemResults.length === 0 ? (
                      <div className="p-3 text-center text-muted-foreground text-sm">لا توجد نتائج</div>
                    ) : (
                      itemResults.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setSelectedItemName(item.nameAr || item.name_ar);
                            setItemSearchOpen(false);
                            setItemSearchTerm("");
                          }}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0 flex items-center gap-2"
                          data-testid={`item-option-${item.id}`}
                        >
                          <span className="font-semibold">{item.nameAr || item.name_ar}</span>
                          <span className="text-muted-foreground text-xs">({item.itemCode || item.item_code})</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {searchMode === "item" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" data-testid="input-date-to" />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">المخزن</label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="h-9 text-sm border rounded px-2 bg-background text-foreground min-w-[140px]"
            data-testid="select-warehouse"
          >
            <option value="">الكل</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <Button onClick={triggerSearch} disabled={!canSearch || isLoading} size="sm" className="h-9" data-testid="button-search">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 ml-1" />}
          بحث
        </Button>
      </div>

      {results.length > 0 && (
        <div className="border rounded-lg overflow-hidden" data-testid="section-results">
          <table className="w-full text-[13px]" dir="rtl">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="py-1.5 px-3 text-right font-bold">رقم الفاتورة</th>
                <th className="py-1.5 px-3 text-right">التاريخ</th>
                <th className="py-1.5 px-3 text-right">المخزن</th>
                <th className="py-1.5 px-3 text-right">العميل</th>
                <th className="py-1.5 px-3 text-center">عدد الأصناف</th>
                <th className="py-1.5 px-3 text-left">الصافي</th>
                <th className="py-1.5 px-3 text-center">اختيار</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/30" data-testid={`row-result-${r.invoiceNumber}`}>
                  <td className="py-1.5 px-3 font-bold text-[14px]">{r.invoiceNumber}</td>
                  <td className="py-1.5 px-3">{new Date(r.invoiceDate).toLocaleDateString("ar-EG")}</td>
                  <td className="py-1.5 px-3">{r.warehouseName}</td>
                  <td className="py-1.5 px-3">{r.customerName || "نقدي"}</td>
                  <td className="py-1.5 px-3 text-center">{r.itemCount}</td>
                  <td className="py-1.5 px-3 text-left font-mono font-semibold">{parseFloat(r.netTotal).toFixed(2)}</td>
                  <td className="py-1.5 px-3 text-center">
                    <Button variant="outline" size="sm" onClick={() => onSelectInvoice(r.id)} data-testid={`button-select-${r.invoiceNumber}`}>
                      اختيار
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
