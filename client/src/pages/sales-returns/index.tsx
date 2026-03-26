// ============================================================
//  صفحة مردودات المبيعات
//
//  البنية:
//  ┌─ SalesReturnsPage ────────────────────────────────────┐
//  │  useReturnSearch  → SearchView                        │
//  │  useReturnForm    → InvoiceHeader                     │
//  │                   → ReturnLineTable                   │
//  │                   → ReturnFooter                      │
//  └────────────────────────────────────────────────────────┘
// ============================================================
import { Undo2, Loader2, AlertCircle, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/permissions";

import { useReturnSearch } from "./hooks/useReturnSearch";
import { useReturnForm }   from "./hooks/useReturnForm";

import { SearchView }       from "./components/SearchView";
import { InvoiceHeader }    from "./components/InvoiceHeader";
import { ReturnLineTable }  from "./components/ReturnLineTable";
import { ReturnFooter }     from "./components/ReturnFooter";

// ============================================================
export default function SalesReturnsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.SALES_CREATE);
  const search = useReturnSearch();
  const form   = useReturnForm();

  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto" dir="rtl" data-testid="page-sales-returns">

      {/* ── شريط العنوان ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Undo2 className="h-5 w-5" />
          مردودات المبيعات
        </h1>
        {form.selectedInvoiceId && (
          <Button
            variant="outline"
            size="sm"
            onClick={form.clearInvoice}
            data-testid="button-back-search"
          >
            العودة للبحث
          </Button>
        )}
      </div>

      {/* ── الوضع الأول: البحث عن فاتورة ── */}
      {!form.selectedInvoiceId && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">بحث عن فاتورة البيع الأصلية</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <SearchView
              {...search}
              onSelectInvoice={form.selectInvoice}
            />
          </CardContent>
        </Card>
      )}

      {/* ── الوضع الثاني: تحميل الفاتورة ── */}
      {form.selectedInvoiceId && form.invoiceLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── الوضع الثالث: خطأ في تحميل الفاتورة ── */}
      {form.selectedInvoiceId && !form.invoiceLoading && !form.invoiceData && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">الفاتورة غير موجودة، أو لم تُحصَّل من الخزنة بعد، أو لم يكتمل قيدها المحاسبي</p>
          </CardContent>
        </Card>
      )}

      {/* ── الوضع الرابع: إدخال المرتجع ── */}
      {form.selectedInvoiceId && !form.invoiceLoading && form.invoiceData && (
        <>
          <InvoiceHeader invoice={form.invoiceData} />

          <ReturnLineTable
            lines={form.returnLines}
            onChangeQty={form.updateReturnQty}
            onChangeUnit={form.updateReturnUnit}
            onReturnAll={form.returnAllLines}
            onClearAll={form.clearAllQty}
          />

          <ReturnFooter
            subtotal={form.subtotal}
            computedDiscount={form.computedDiscount}
            netTotal={form.netTotal}
            discountType={form.discountType}
            setDiscountType={form.setDiscountType}
            discountPercent={form.discountPercent}
            setDiscountPercent={form.setDiscountPercent}
            discountValue={form.discountValue}
            setDiscountValue={form.setDiscountValue}
            discountAutoApplied={form.discountAutoApplied}
            notes={form.notes}
            setNotes={form.setNotes}
            onSubmit={form.submitReturn}
            isSubmitting={form.isSubmitting}
            canSubmit={form.hasReturnItems}
          />
        </>
      )}
    </div>
  );
}
