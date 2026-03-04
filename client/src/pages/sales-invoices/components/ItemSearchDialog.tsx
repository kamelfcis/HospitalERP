import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, X } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
  searchMode: string;
  setSearchMode: (v: string) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  searchResults: any[];
  searchLoading: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onAddItem: (item: any) => void;
}

export function ItemSearchDialog({
  open, onClose, searchMode, setSearchMode, searchQuery, onSearchQueryChange,
  searchResults, searchLoading, searchInputRef, onAddItem,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>بحث عن صنف</DialogTitle>
          <DialogDescription>ابحث عن الأصناف وأضفها للفاتورة</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value)}
            className="peachtree-select"
            data-testid="select-search-mode"
          >
            <option value="AR">اسم عربي</option>
            <option value="EN">اسم انجليزي</option>
            <option value="CODE">كود</option>
            <option value="BARCODE">باركود</option>
          </select>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="ابحث..."
            className="peachtree-input flex-1"
            data-testid="input-search-query"
          />
          {searchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <ScrollArea className="max-h-[50vh]">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-search-results">
            <thead>
              <tr className="peachtree-grid-header">
                <th>الكود</th>
                <th>الاسم</th>
                <th>الوحدة</th>
                <th>السعر</th>
                <th>إضافة</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((item: any) => (
                <tr key={item.id} className="peachtree-grid-row" data-testid={`row-search-${item.id}`}>
                  <td className="text-center font-mono">{item.itemCode}</td>
                  <td className="font-semibold">{item.nameAr}</td>
                  <td className="text-center">{item.majorUnitName || item.minorUnitName || "-"}</td>
                  <td className="text-center peachtree-amount">{formatNumber(item.salePriceCurrent)}</td>
                  <td className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => onAddItem(item)} data-testid={`button-add-item-${item.id}`}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {searchResults.length === 0 && searchQuery && !searchLoading && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-4">لا توجد نتائج</td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-search">
            <X className="h-3 w-3 ml-1" />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
