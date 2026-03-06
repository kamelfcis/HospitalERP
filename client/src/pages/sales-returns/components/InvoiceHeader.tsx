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
  const fields = [
    { label: "فاتورة رقم",   value: String(invoice.invoiceNumber), bold: true },
    { label: "التاريخ",      value: date },
    { label: "المخزن",       value: invoice.warehouseName },
    { label: "العميل",       value: invoice.customerName || "نقدي" },
    { label: "صافي الفاتورة", value: `${parseFloat(invoice.netTotal).toFixed(2)} ج.م`, bold: true },
  ];

  return (
    <Card data-testid="section-invoice-header">
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm" dir="rtl">
          {fields.map(({ label, value, bold }) => (
            <div key={label}>
              <span className="text-muted-foreground">{label}: </span>
              <span className={bold ? "font-bold text-base" : "font-semibold"}>{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
