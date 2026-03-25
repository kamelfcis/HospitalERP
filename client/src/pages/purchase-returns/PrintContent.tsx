import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { ReturnDetail } from "./types";

interface Props {
  ret: ReturnDetail;
}

export function PrintContent({ ret }: Props) {
  return (
    <div className="print-only font-[Arial] text-sm" dir="rtl">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">مرتجع مشتريات</h2>
        <p>رقم: RT-{String(ret.returnNumber).padStart(4, "0")}</p>
        <p>التاريخ: {formatDateShort(ret.returnDate)}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4 border p-2 rounded">
        <div><strong>المورد:</strong> {ret.supplierNameAr}</div>
        <div><strong>المخزن:</strong> {ret.warehouseNameAr}</div>
        <div>
          <strong>فاتورة الشراء:</strong> #{ret.invoiceNumber}
          {ret.supplierInvoiceNo && <span> — فاتورة المورد: {ret.supplierInvoiceNo}</span>}
        </div>
      </div>
      <table className="w-full border-collapse border text-xs mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1 text-right">الصنف</th>
            <th className="border p-1 text-center">اللوت</th>
            <th className="border p-1 text-center">الكمية</th>
            <th className="border p-1 text-center">هدية</th>
            <th className="border p-1 text-center">السعر</th>
            <th className="border p-1 text-center">الإجمالي</th>
            <th className="border p-1 text-center">الضريبة</th>
            <th className="border p-1 text-center">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {ret.lines.map(l => (
            <tr key={l.id}>
              <td className="border p-1">{l.itemNameAr} {l.isFreeItem && <span>(هدية)</span>}</td>
              <td className="border p-1 text-center">{l.lotExpiryDate ?? "—"}</td>
              <td className="border p-1 text-center">{parseFloat(l.qtyReturned).toFixed(2)}</td>
              <td className="border p-1 text-center">
                {parseFloat(l.bonusQtyReturned) > 0 ? parseFloat(l.bonusQtyReturned).toFixed(2) : "—"}
              </td>
              <td className="border p-1 text-center">{formatCurrency(l.unitCost)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.subtotal)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.vatAmount)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-gray-50">
            <td className="border p-1" colSpan={5} />
            <td className="border p-1 text-center">{formatCurrency(ret.subtotal)}</td>
            <td className="border p-1 text-center">{formatCurrency(ret.taxTotal)}</td>
            <td className="border p-1 text-center">{formatCurrency(ret.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
      {ret.notes && <p><strong>ملاحظات:</strong> {ret.notes}</p>}
    </div>
  );
}
