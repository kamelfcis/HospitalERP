import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Printer } from "lucide-react";
import { PrintContent } from "./PrintContent";
import type { ReturnDetail } from "./types";

interface Props {
  returnId: string;
  onClose: () => void;
}

export function DetailModal({ returnId, onClose }: Props) {
  const { data, isLoading } = useQuery<ReturnDetail>({
    queryKey: ["/api/purchase-returns", returnId],
    queryFn: () => fetch(`/api/purchase-returns/${returnId}`).then(r => r.json()),
  });

  const handlePrint = () => window.print();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            مرتجع مشتريات
            {data && ` — RT-${String(data.returnNumber).padStart(4, "0")}`}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4 bg-muted/30 p-3 rounded">
              <div><span className="text-muted-foreground">المورد: </span><strong>{data.supplierNameAr}</strong></div>
              <div><span className="text-muted-foreground">المخزن: </span><strong>{data.warehouseNameAr}</strong></div>
              <div>
                <span className="text-muted-foreground">فاتورة المشتريات: </span>
                <strong>#{data.invoiceNumber}</strong>
                {data.supplierInvoiceNo && (
                  <span className="text-muted-foreground"> — فاتورة المورد: </span>
                )}
                {data.supplierInvoiceNo && <strong>{data.supplierInvoiceNo}</strong>}
              </div>
              <div>
                <span className="text-muted-foreground">تاريخ المرتجع: </span>
                <strong>{formatDateShort(data.returnDate)}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">حالة القيد: </span>
                <Badge variant={data.journalStatus === "posted" ? "default" : "secondary"}>
                  {data.journalStatus === "posted" ? "مُرحَّل" : data.journalStatus ?? "—"}
                </Badge>
              </div>
              {data.notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">ملاحظات: </span>{data.notes}
                </div>
              )}
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-right p-2 border">الصنف</th>
                  <th className="text-center p-2 border">انتهاء اللوت</th>
                  <th className="text-center p-2 border">الكمية</th>
                  <th className="text-center p-2 border">هدية</th>
                  <th className="text-center p-2 border">سعر الوحدة</th>
                  <th className="text-center p-2 border">الإجمالي</th>
                  <th className="text-center p-2 border">ض.ق.م</th>
                  <th className="text-center p-2 border">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(l => (
                  <tr key={l.id} className="hover:bg-muted/20">
                    <td className="p-2 border">
                      {l.itemNameAr}
                      {l.isFreeItem && (
                        <Badge variant="outline" className="mr-1 text-[10px]">هدية</Badge>
                      )}
                    </td>
                    <td className="p-2 border text-center">{l.lotExpiryDate ?? "—"}</td>
                    <td className="p-2 border text-center">{parseFloat(l.qtyReturned).toFixed(2)}</td>
                    <td className="p-2 border text-center">
                      {parseFloat(l.bonusQtyReturned) > 0
                        ? parseFloat(l.bonusQtyReturned).toFixed(2)
                        : "—"}
                    </td>
                    <td className="p-2 border text-center">{formatCurrency(l.unitCost)}</td>
                    <td className="p-2 border text-center">{formatCurrency(l.subtotal)}</td>
                    <td className="p-2 border text-center">{formatCurrency(l.vatAmount)}</td>
                    <td className="p-2 border text-center font-medium">{formatCurrency(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td className="p-2 border" colSpan={5} />
                  <td className="p-2 border text-center">{formatCurrency(data.subtotal)}</td>
                  <td className="p-2 border text-center">{formatCurrency(data.taxTotal)}</td>
                  <td className="p-2 border text-center text-primary">{formatCurrency(data.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <PrintContent ret={data} />
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="btn-print-return">
            <Printer className="h-4 w-4 ml-2" /> طباعة
          </Button>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
