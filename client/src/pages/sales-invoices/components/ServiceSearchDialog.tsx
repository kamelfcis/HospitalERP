import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Search, X } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
  serviceSearch: string;
  onServiceSearchChange: (v: string) => void;
  serviceResults: any[];
  serviceSearchLoading: boolean;
  addingServiceId: string | null;
  serviceSearchRef: React.RefObject<HTMLInputElement>;
  onAddService: (id: string, name: string) => void;
}

export function ServiceSearchDialog({
  open, onClose, serviceSearch, onServiceSearchChange, serviceResults,
  serviceSearchLoading, addingServiceId, serviceSearchRef, onAddService,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة خدمة مع مستهلكات</DialogTitle>
          <DialogDescription>اختر خدمة لإضافة مستهلكاتها تلقائياً للفاتورة</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={serviceSearchRef}
            type="text"
            value={serviceSearch}
            onChange={(e) => onServiceSearchChange(e.target.value)}
            placeholder="ابحث عن خدمة بالكود أو الاسم..."
            className="peachtree-input flex-1"
            data-testid="input-service-search-invoice"
          />
          {serviceSearchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <ScrollArea className="max-h-[50vh]">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-service-results">
            <thead>
              <tr className="peachtree-grid-header">
                <th>الكود</th>
                <th>اسم الخدمة</th>
                <th>القسم</th>
                <th>السعر</th>
                <th>إضافة</th>
              </tr>
            </thead>
            <tbody>
              {serviceResults.map((svc: any) => (
                <tr key={svc.id} className="peachtree-grid-row" data-testid={`row-service-${svc.id}`}>
                  <td className="text-center font-mono">{svc.code}</td>
                  <td className="font-semibold">{svc.nameAr}</td>
                  <td className="text-center">{svc.department?.nameAr || "-"}</td>
                  <td className="text-center peachtree-amount">{formatNumber(svc.basePrice)}</td>
                  <td className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={addingServiceId === svc.id}
                      onClick={() => onAddService(svc.id, svc.nameAr)}
                      data-testid={`button-add-service-${svc.id}`}
                    >
                      {addingServiceId === svc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </td>
                </tr>
              ))}
              {serviceResults.length === 0 && serviceSearch && !serviceSearchLoading && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-4">لا توجد نتائج</td></tr>
              )}
              {!serviceSearch && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-4">ابحث عن خدمة لإضافة مستهلكاتها</td></tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-service-search">
            <X className="h-3 w-3 ml-1" />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
