import { Loader2, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/formatters";

interface StockStatsDialogProps {
  open: boolean;
  itemName: string;
  data: any[] | null;
  isLoading: boolean;
  onClose: () => void;
}

export function StockStatsDialog({ open, itemName, data, isLoading, onClose }: StockStatsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl" data-testid="dialog-stock-stats">
        <DialogHeader>
          <DialogTitle className="text-right flex flex-row-reverse items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>أرصدة المخازن - {itemName}</span>
          </DialogTitle>
          <DialogDescription className="text-right">
            كميات الصنف وتواريخ الصلاحية في جميع المخازن
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data && data.length > 0 ? (
            <div className="space-y-3">
              {data.map((wh: any) => (
                <div key={wh.warehouseId} className="border rounded-md p-3">
                  <div className="flex flex-row-reverse items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-sm">{wh.warehouseName}</span>
                    <Badge variant="secondary" data-testid={`text-wh-total-${wh.warehouseId}`}>
                      {formatNumber(parseFloat(wh.qtyMinor))}
                    </Badge>
                  </div>
                  {wh.expiryBreakdown?.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-right py-1 font-medium text-muted-foreground">الصلاحية</th>
                          <th className="text-center py-1 font-medium text-muted-foreground">الكمية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wh.expiryBreakdown.map((eb: any, idx: number) => (
                          <tr key={idx} className="border-b last:border-b-0">
                            <td className="text-right py-1">
                              {eb.expiryMonth && eb.expiryYear
                                ? `${String(eb.expiryMonth).padStart(2, "0")}/${eb.expiryYear}`
                                : "بدون صلاحية"}
                            </td>
                            <td className="text-center py-1">{formatNumber(parseFloat(eb.qty))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="text-xs text-muted-foreground">لا توجد تفاصيل صلاحية</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">لا توجد أرصدة لهذا الصنف</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
