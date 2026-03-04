import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  statsData: any[];
  statsLoading: boolean;
}

export function StockStatsDialog({ open, onClose, statsData, statsLoading }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إحصاء المخزون</DialogTitle>
          <DialogDescription>الكميات المتاحة في جميع المستودعات</DialogDescription>
        </DialogHeader>
        {statsLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : statsData.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">لا يوجد مخزون</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {statsData.map((wh: any, idx: number) => (
              <div key={idx} className="border rounded p-2 text-[12px]">
                <div className="font-bold">{wh.warehouseCode} - {wh.warehouseName}</div>
                <div>الكمية: <span className="font-mono">{parseFloat(wh.qtyMinor).toFixed(2)}</span></div>
                {wh.expiryBreakdown && wh.expiryBreakdown.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {wh.expiryBreakdown.map((eb: any, j: number) => (
                      <div key={j}>
                        {eb.expiryMonth && eb.expiryYear
                          ? `${String(eb.expiryMonth).padStart(2, "0")}/${eb.expiryYear}`
                          : "بدون صلاحية"}: {parseFloat(eb.qty).toFixed(2)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
