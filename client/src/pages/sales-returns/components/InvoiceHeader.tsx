// ============================================================
//  InvoiceHeader — شريط معلومات الفاتورة الأصلية (للعرض فقط)
// ============================================================
import { Card, CardContent } from "@/components/ui/card";
import type { ReturnInvoiceData } from "../types";

interface Props {
  invoice: ReturnInvoiceData;
}

export function InvoiceHeader({ invoice }: Props) {
  const date = new Date(invoice.invoiceDate).toLocaleDateString("ar-EG");
  const isCredit = invoice.customerType === "credit";

  const fields = [
    { label: "فاتورة رقم",   value: String(invoice.invoiceNumber), bold: true },
    { label: "التاريخ",      value: date },
    { label: "المخزن",       value: invoice.warehouseName },
    { label: "العميل",       value: invoice.customerName || "نقدي" },
    { label: "صافي الفاتورة", value: `${parseFloat(invoice.netTotal).toFixed(2)} ج.م`, bold: true },
  ];

  return (
    <Card
      className={isCredit ? "border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20" : ""}
      data-testid="section-invoice-header"
    >
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm items-center" dir="rtl">
          {fields.map(({ label, value, bold }) => (
            <div key={label}>
              <span className="text-muted-foreground">{label}: </span>
              <span className={bold ? "font-bold text-base" : "font-semibold"}>{value}</span>
            </div>
          ))}

          {/* شارة الآجل — تُعلم الصيدلي بأن مرتجع هذه الفاتورة لن يمر على الكاشير */}
          {isCredit && (
            <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-600 leading-none">
              فاتورة آجل — المرتجع يُخصَم من ذمة العميل مباشرة
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
