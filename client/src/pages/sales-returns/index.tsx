import { Undo2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReturnSearch } from "./hooks/useReturnSearch";
import { useReturnForm } from "./hooks/useReturnForm";
import { SearchPanel } from "./components/SearchPanel";
import { ReturnLineTable } from "./components/ReturnLineTable";
import { ReturnTotals } from "./components/ReturnTotals";

export default function SalesReturnsPage() {
  const search = useReturnSearch();
  const form = useReturnForm();

  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto" dir="rtl" data-testid="page-sales-returns">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Undo2 className="h-5 w-5" />
          مردودات المبيعات
        </h1>
        {form.selectedInvoiceId && (
          <Button variant="outline" size="sm" onClick={form.clearInvoice} data-testid="button-back-search">
            العودة للبحث
          </Button>
        )}
      </div>

      {!form.selectedInvoiceId ? (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">بحث عن فاتورة البيع الأصلية</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <SearchPanel
              {...search}
              onSelectInvoice={form.selectInvoice}
            />
          </CardContent>
        </Card>
      ) : form.invoiceLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !form.invoiceData ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">الفاتورة غير موجودة أو غير مرحّلة</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm" dir="rtl">
                <div><span className="text-muted-foreground">فاتورة رقم: </span><span className="font-bold text-base">{form.invoiceData.invoiceNumber}</span></div>
                <div><span className="text-muted-foreground">التاريخ: </span><span className="font-semibold">{new Date(form.invoiceData.invoiceDate).toLocaleDateString("ar-EG")}</span></div>
                <div><span className="text-muted-foreground">المخزن: </span><span className="font-semibold">{form.invoiceData.warehouseName}</span></div>
                <div><span className="text-muted-foreground">العميل: </span><span className="font-semibold">{form.invoiceData.customerName || "نقدي"}</span></div>
                <div><span className="text-muted-foreground">صافي الفاتورة: </span><span className="font-bold">{parseFloat(form.invoiceData.netTotal).toFixed(2)} ج.م</span></div>
              </div>
            </CardContent>
          </Card>

          <ReturnLineTable
            lines={form.returnLines}
            onChangeQty={form.updateReturnQty}
            onChangeUnit={form.updateReturnUnit}
          />

          {form.hasReturnItems && (
            <>
              <ReturnTotals
                subtotal={form.subtotal}
                discountType={form.discountType}
                setDiscountType={form.setDiscountType}
                discountPercent={form.discountPercent}
                setDiscountPercent={form.setDiscountPercent}
                discountValue={form.discountValue}
                setDiscountValue={form.setDiscountValue}
                computedDiscount={form.computedDiscount}
                netTotal={form.netTotal}
                notes={form.notes}
                setNotes={form.setNotes}
              />

              <div className="flex justify-end">
                <Button
                  onClick={() => form.submitReturn()}
                  disabled={form.isSubmitting || !form.hasReturnItems}
                  className="min-w-[180px]"
                  data-testid="button-submit-return"
                >
                  {form.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Undo2 className="h-4 w-4 ml-2" />}
                  تسجيل المرتجع
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
