import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/formatters";
import { lineTypeLabels, paymentMethodLabels } from "@shared/schema";
import type { LineLocal, PaymentLocal } from "../types";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

interface ConsolidatedTabProps {
  lines: LineLocal[];
  payments: PaymentLocal[];
  totals: Totals;
  getServiceRowClass: (serviceType: string) => string;
}

export function ConsolidatedTab({ lines, payments, totals, getServiceRowClass }: ConsolidatedTabProps) {
  const grouped: Record<string, LineLocal[]> = {};
  lines.forEach((l) => {
    if (!grouped[l.lineType]) grouped[l.lineType] = [];
    grouped[l.lineType].push(l);
  });
  const typeOrder = ["service", "drug", "consumable", "equipment"];
  let counter = 0;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-md">
        <table className="peachtree-grid w-full text-sm">
          <thead>
            <tr className="peachtree-grid-header">
              <th className="text-center" style={{ width: 40 }}>#</th>
              <th>النوع</th>
              <th>الوصف</th>
              <th className="text-center" style={{ width: 80 }}>الكمية</th>
              <th className="text-center" style={{ width: 100 }}>سعر الوحدة</th>
              <th className="text-center" style={{ width: 80 }}>خصم %</th>
              <th className="text-center" style={{ width: 100 }}>قيمة الخصم</th>
              <th className="text-center" style={{ width: 110 }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {typeOrder.map((type) => {
              const group = grouped[type];
              if (!group || group.length === 0) return null;
              return group.map((line) => {
                counter++;
                return (
                  <tr
                    key={line.tempId}
                    className={`peachtree-grid-row ${line.lineType === "service" ? getServiceRowClass(line.serviceType) : ""}`}
                    data-testid={`row-consolidated-${counter}`}
                  >
                    <td className="text-center">{counter}</td>
                    <td>
                      <Badge variant="secondary" className="text-xs">
                        {lineTypeLabels[line.lineType] || line.lineType}
                      </Badge>
                    </td>
                    <td>
                      <span>{line.description}</span>
                      {(line.lineType === "drug" || line.lineType === "consumable") && line.expiryMonth && line.expiryYear && (
                        <span className="mr-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                          </Badge>
                        </span>
                      )}
                      {(line as any).stockIssueStatus === "pending_cost" && (
                        <span className="mr-1">
                          <Badge variant="destructive" className="text-[10px]">⏳ معلق</Badge>
                        </span>
                      )}
                      {(line as any).stockIssueStatus === "cost_resolved" && (
                        <span className="mr-1">
                          <Badge className="text-[10px] bg-green-100 text-green-700">✓ مسوّى</Badge>
                        </span>
                      )}
                    </td>
                    <td className="text-center">{formatNumber(line.quantity)}</td>
                    <td className="text-center">{formatNumber(line.unitPrice)}</td>
                    <td className="text-center">{formatNumber(line.discountPercent)}</td>
                    <td className="text-center">{formatNumber(line.discountAmount)}</td>
                    <td className="text-center font-bold">{formatNumber(line.totalPrice)}</td>
                  </tr>
                );
              });
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-4">
                  لا توجد بنود
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-bold" data-testid="text-consolidated-total">{formatCurrency(totals.totalAmount)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground">الخصم</span>
              <span className="font-bold" data-testid="text-consolidated-discount">{formatCurrency(totals.discountAmount)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground">الصافي</span>
              <span className="font-bold" data-testid="text-consolidated-net">{formatCurrency(totals.netAmount)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground">المدفوع</span>
              <span className="font-bold" data-testid="text-consolidated-paid">{formatCurrency(totals.paidAmount)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground">المتبقي</span>
              <span className="font-bold" data-testid="text-consolidated-remaining">{formatCurrency(totals.remaining)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">سجل الدفعات</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="overflow-x-auto border rounded-md">
              <table className="peachtree-grid w-full text-sm">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="text-center">#</th>
                    <th className="text-center">التاريخ</th>
                    <th className="text-center">المبلغ</th>
                    <th className="text-center">طريقة الدفع</th>
                    <th>المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.tempId} className="peachtree-grid-row">
                      <td className="text-center">{i + 1}</td>
                      <td className="text-center">{formatDateShort(p.paymentDate)}</td>
                      <td className="text-center font-bold">{formatNumber(p.amount)}</td>
                      <td className="text-center">{paymentMethodLabels[p.paymentMethod]}</td>
                      <td>{p.referenceNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
