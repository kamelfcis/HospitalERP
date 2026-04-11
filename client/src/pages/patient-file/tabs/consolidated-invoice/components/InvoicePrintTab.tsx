import { memo } from "react";
import {
  Lock, Printer, Banknote, Building2, FileText, CreditCard,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoney, PAYMENT_METHOD_LABELS } from "../../../shared/formatters";
import { FinRow } from "./FinancialSidebar";

export const InvoicePrintTab = memo(function InvoicePrintTab({
  patientName, patientCode, invoiceNumber, invoiceDate,
  totals, payments, byDepartment, byClassification, isFinalClosed,
}: {
  patientName: string;
  patientCode: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totals: { totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; remaining: number };
  payments: any[];
  byDepartment: Array<{ departmentName: string; netAmount: number; totalAmount: number; discountAmount: number }>;
  byClassification: Array<{ lineTypeLabel: string; netAmount: number; lineCount: number }>;
  isFinalClosed: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">معاينة الطباعة</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => window.print()}
          data-testid="button-print-invoice"
        >
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </Button>
      </div>

      <div className="print-area border rounded-xl p-6 bg-white flex flex-col gap-4" dir="rtl">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold">فاتورة مريض</h2>
            {invoiceNumber && <p className="font-mono text-sm text-muted-foreground">رقم: {invoiceNumber}</p>}
            {invoiceDate && <p className="text-sm text-muted-foreground">التاريخ: {fmtDate(invoiceDate)}</p>}
          </div>
          <div className="text-left">
            <p className="font-bold text-lg">{patientName}</p>
            {patientCode && <p className="font-mono text-xs text-muted-foreground">{patientCode}</p>}
            {isFinalClosed && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs mt-1">
                <Lock className="h-3 w-3" />مغلق نهائياً
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Banknote className="h-4 w-4" />
            الإجماليات المالية
          </h3>
          <div className="bg-slate-50 rounded-lg p-3 flex flex-col gap-1">
            <FinRow label="إجمالي الخدمات" value={totals.totalAmount} />
            <FinRow label="الخصم" value={totals.discountAmount} muted />
            <FinRow label="الصافي" value={totals.netAmount} highlight border />
            <FinRow label="المدفوع" value={totals.paidAmount} />
            <FinRow label="المتبقي" value={totals.remaining} />
          </div>
        </div>

        {byDepartment.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              إجماليات الأقسام
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">القسم</th>
                    <th className="p-2 text-center">الإجمالي</th>
                    <th className="p-2 text-center">الخصم</th>
                    <th className="p-2 text-center font-semibold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {byDepartment.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-sm">{d.departmentName || "—"}</td>
                      <td className="p-2 text-center font-mono text-sm">{fmtMoney(d.totalAmount)}</td>
                      <td className="p-2 text-center font-mono text-sm text-purple-600">
                        {d.discountAmount > 0 ? `(${fmtMoney(d.discountAmount)})` : "—"}
                      </td>
                      <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(d.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {byClassification.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              إجماليات التصنيف
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">التصنيف</th>
                    <th className="p-2 text-center">عدد البنود</th>
                    <th className="p-2 text-center font-semibold">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {byClassification.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-sm">{c.lineTypeLabel}</td>
                      <td className="p-2 text-center text-sm">{c.lineCount}</td>
                      <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(c.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" />
              المدفوعات
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-center">المبلغ</th>
                    <th className="p-2 text-right">طريقة الدفع</th>
                    <th className="p-2 text-right">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any, i: number) => (
                    <tr key={p.id || i} className="border-b last:border-0">
                      <td className="p-2 text-xs">{fmtDate(p.payment_date)}</td>
                      <td className="p-2 text-center font-mono text-green-700">{fmtMoney(p.amount)}</td>
                      <td className="p-2 text-xs">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                      <td className="p-2 text-xs text-muted-foreground">{p.reference_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
