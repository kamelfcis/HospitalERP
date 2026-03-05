/**
 * StockStatsDialog — مربع حوار أرصدة المخازن (مشترك بين جميع الشاشات)
 *
 * يعرض الكميات المتاحة لصنف معين مع تفاصيل تواريخ الصلاحية لكل مخزن.
 */
import { Loader2, BarChart3, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/formatters";

interface WarehouseBreakdown {
  warehouseId:    string;
  warehouseCode?: string;
  warehouseName:  string;
  qtyMinor:       string | number;
  expiryBreakdown?: {
    expiryMonth?: number | null;
    expiryYear?:  number | null;
    qty:          string | number;
  }[];
}

interface StockStatsDialogProps {
  open:      boolean;
  onClose:   () => void;
  itemName?: string;
  data:      WarehouseBreakdown[] | null | undefined;
  isLoading: boolean;
}

export function StockStatsDialog({ open, onClose, itemName, data, isLoading }: StockStatsDialogProps) {
  const rows = data ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl" data-testid="dialog-stock-stats">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <BarChart3 className="h-4 w-4 text-primary" />
            {itemName ? `أرصدة المخازن — ${itemName}` : "أرصدة المخازن"}
          </DialogTitle>
          <DialogDescription className="text-right text-[12px]">
            كميات الصنف وتواريخ الصلاحية في جميع المخازن
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-[13px]">
              لا توجد أرصدة لهذا الصنف
            </div>
          ) : (
            rows.map((wh) => (
              <div key={wh.warehouseId} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                    {wh.warehouseCode ? `${wh.warehouseCode} — ` : ""}{wh.warehouseName}
                  </div>
                  <Badge variant="secondary" data-testid={`text-wh-total-${wh.warehouseId}`}>
                    {formatNumber(parseFloat(String(wh.qtyMinor)))}
                  </Badge>
                </div>

                {wh.expiryBreakdown && wh.expiryBreakdown.length > 0 ? (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-1 font-medium text-muted-foreground">الصلاحية</th>
                        <th className="text-center py-1 font-medium text-muted-foreground">الكمية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wh.expiryBreakdown.map((eb, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="text-right py-1">
                            {eb.expiryMonth && eb.expiryYear
                              ? `${String(eb.expiryMonth).padStart(2, "0")}/${eb.expiryYear}`
                              : "بدون صلاحية"}
                          </td>
                          <td className="text-center py-1 font-mono">
                            {formatNumber(parseFloat(String(eb.qty)))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[11px] text-muted-foreground">لا توجد تفاصيل صلاحية</p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
