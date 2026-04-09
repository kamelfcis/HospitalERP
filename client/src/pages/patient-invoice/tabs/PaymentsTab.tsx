import { useEffect } from "react";
import { useTreasuriesLookup } from "@/hooks/lookups/useTreasuriesLookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { paymentMethodLabels } from "@shared/schema";
import type { PaymentLocal } from "../types";

interface PaymentsTabProps {
  isDraft: boolean;
  payments: PaymentLocal[];
  addPayment: () => void;
  updatePayment: (tempId: string, field: string, value: any) => void;
  removePayment: (tempId: string) => void;
}

export function PaymentsTab({ isDraft, payments, addPayment, updatePayment, removePayment }: PaymentsTabProps) {
  const { items: allTreasuries } = useTreasuriesLookup();
  const activeTreasuries = allTreasuries.filter(t => t.isActive !== false);
  const singleTreasury = activeTreasuries.length === 1 ? activeTreasuries[0] : null;

  useEffect(() => {
    if (!singleTreasury) return;
    payments.forEach(p => {
      if (!p.treasuryId) {
        updatePayment(p.tempId, "treasuryId", singleTreasury.id);
      }
    });
  }, [singleTreasury, payments, updatePayment]);

  return (
    <div className="space-y-3">
      {isDraft && (
        <Button variant="outline" size="sm" onClick={addPayment} data-testid="button-add-payment">
          <Plus className="h-3 w-3 ml-1" />
          اضافة دفعة
        </Button>
      )}
      <div className="overflow-x-auto border rounded-md">
        <table className="peachtree-grid w-full text-sm">
          <thead>
            <tr className="peachtree-grid-header">
              <th className="text-center" style={{ width: 40 }}>#</th>
              <th className="text-center" style={{ width: 130 }}>التاريخ</th>
              <th className="text-center" style={{ width: 120 }}>المبلغ</th>
              <th className="text-center" style={{ width: 140 }}>طريقة الدفع</th>
              <th className="text-center" style={{ width: 150 }}>الخزنة</th>
              <th>المرجع</th>
              <th>ملاحظات</th>
              {isDraft && <th className="text-center" style={{ width: 50 }}></th>}
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={p.tempId} className="peachtree-grid-row" data-testid={`row-payment-${i}`}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center">
                  {isDraft ? (
                    <Input
                      type="date"
                      value={p.paymentDate}
                      onChange={(e) => updatePayment(p.tempId, "paymentDate", e.target.value)}
                      className="h-7 text-xs"
                      data-testid={`input-pay-date-${i}`}
                    />
                  ) : (
                    formatDateShort(p.paymentDate)
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <Input
                      type="number"
                      value={p.amount}
                      min={0}
                      onChange={(e) => updatePayment(p.tempId, "amount", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-center"
                      data-testid={`input-pay-amount-${i}`}
                    />
                  ) : (
                    formatNumber(p.amount)
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    <Select
                      value={p.paymentMethod}
                      onValueChange={(v) => updatePayment(p.tempId, "paymentMethod", v)}
                    >
                      <SelectTrigger className="h-7 text-xs" data-testid={`select-pay-method-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(paymentMethodLabels).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    paymentMethodLabels[p.paymentMethod] || p.paymentMethod
                  )}
                </td>
                <td className="text-center">
                  {isDraft ? (
                    singleTreasury ? (
                      <span className="text-xs text-muted-foreground" data-testid={`text-pay-treasury-${i}`}>
                        {singleTreasury.name}
                      </span>
                    ) : (
                      <Select
                        value={p.treasuryId ?? "none"}
                        onValueChange={(v) => updatePayment(p.tempId, "treasuryId", v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-pay-treasury-${i}`}>
                          <SelectValue placeholder="بدون خزنة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون خزنة</SelectItem>
                          {activeTreasuries.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    activeTreasuries.find(t => t.id === p.treasuryId)?.name ?? allTreasuries.find(t => t.id === p.treasuryId)?.name ?? "—"
                  )}
                </td>
                <td>
                  {isDraft ? (
                    <Input
                      value={p.referenceNumber}
                      onChange={(e) => updatePayment(p.tempId, "referenceNumber", e.target.value)}
                      className="h-7 text-xs"
                      data-testid={`input-pay-ref-${i}`}
                    />
                  ) : (
                    p.referenceNumber
                  )}
                </td>
                <td>
                  {isDraft ? (
                    <Input
                      value={p.notes}
                      onChange={(e) => updatePayment(p.tempId, "notes", e.target.value)}
                      className="h-7 text-xs"
                      data-testid={`input-pay-notes-${i}`}
                    />
                  ) : (
                    p.notes
                  )}
                </td>
                {isDraft && (
                  <td className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePayment(p.tempId)}
                      data-testid={`button-remove-payment-${i}`}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 8 : 7} className="text-center text-muted-foreground py-4">
                  لا توجد دفعات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
