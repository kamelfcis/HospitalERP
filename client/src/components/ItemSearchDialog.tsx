import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, X } from "lucide-react";

export interface ItemSearchDialogColumn {
  header: string;
  render: (item: any) => React.ReactNode;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  searchMode: string;
  setSearchMode: (v: string) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  searchResults: any[];
  searchLoading: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onAddItem: (item: any) => void;
  extraColumn?: ItemSearchDialogColumn;
  extraFilters?: React.ReactNode;
}

export function ItemSearchDialog({
  open,
  onClose,
  title = "بحث عن صنف",
  description = "ابحث عن الأصناف وأضفها",
  searchMode,
  setSearchMode,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchLoading,
  searchInputRef,
  onAddItem,
  extraColumn,
  extraFilters,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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

        {extraFilters && (
          <div className="flex items-center gap-4 text-[10px] mb-2">{extraFilters}</div>
        )}

        <ScrollArea className="max-h-[50vh]">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-search-results">
            <thead>
              <tr className="peachtree-grid-header">
                <th>الكود</th>
                <th>الاسم</th>
                <th>الوحدة</th>
                {extraColumn && <th>{extraColumn.header}</th>}
                <th>إضافة</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((item: any) => (
                <tr key={item.id} className="peachtree-grid-row" data-testid={`row-search-${item.id}`}>
                  <td className="text-center font-mono">{item.itemCode}</td>
                  <td className="font-semibold">{item.nameAr}</td>
                  <td className="text-center">{item.majorUnitName || item.minorUnitName || "-"}</td>
                  {extraColumn && (
                    <td className="text-center peachtree-amount">{extraColumn.render(item)}</td>
                  )}
                  <td className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAddItem(item)}
                      data-testid={`button-add-item-${item.id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {searchResults.length === 0 && searchQuery && !searchLoading && (
                <tr>
                  <td colSpan={extraColumn ? 5 : 4} className="text-center text-muted-foreground py-4">
                    لا توجد نتائج
                  </td>
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
