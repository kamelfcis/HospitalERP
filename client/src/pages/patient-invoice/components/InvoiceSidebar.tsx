import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ArrowLeftRight, Stethoscope, Plus, X,
  Receipt, Wallet, Percent,
} from "lucide-react";
import { formatCurrency, formatNumber, formatDateShort } from "@/lib/formatters";
import { paymentMethodLabels, patientInvoiceStatusLabels } from "@shared/schema";
import { useTreasuriesLookup } from "@/hooks/lookups/useTreasuriesLookup";
import { DoctorLookup } from "@/components/lookups";
import type { PaymentLocal } from "../types";
import type { DoctorTransfer } from "@shared/schema";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  headerDiscountPercent?: number;
  headerDiscountAmount?: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
  companyShareTotal?: number;
  patientShareTotal?: number;
  doctorCostTotal?: number;
}

interface InvoiceSidebarProps {
  invoiceId: string | null;
  invoiceNumber: string;
  patientName: string;
  patientCode: string;
  status: string;
  isDraft: boolean;
  patientType: string;
  totals: Totals;

  canDiscount?: boolean;
  onOpenDiscountDialog?: () => void;

  payments: PaymentLocal[];
  addPayment: () => void;
  updatePayment: (tempId: string, field: string, value: unknown) => void;
  removePayment: (tempId: string) => void;

  dtTransfers: DoctorTransfer[];
  dtAlreadyTransferred: number;
  dtRemaining: number;
  dtOpen: boolean;
  setDtOpen: (fn: (o: boolean) => boolean) => void;
  dtAmount: string;
  setDtAmount: (v: string) => void;
  dtDoctorName: string;
  setDtDoctorName: (v: string) => void;
  dtNotes: string;
  setDtNotes: (v: string) => void;
  openDtConfirm: () => void;

  finalizeMutation?: { mutate: () => void; isPending: boolean };
}

export function InvoiceSidebar({
  invoiceId, invoiceNumber, patientName, patientCode, status, isDraft, patientType, totals,
  canDiscount, onOpenDiscountDialog,
  payments, addPayment, updatePayment, removePayment,
  dtTransfers, dtAlreadyTransferred, dtRemaining,
  dtOpen, setDtOpen, dtAmount, setDtAmount, dtDoctorName, setDtDoctorName, dtNotes, setDtNotes, openDtConfirm,
  finalizeMutation,
}: InvoiceSidebarProps) {
  const [localDtDoctorId, setLocalDtDoctorId] = useState("");

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

  const hda = totals.headerDiscountAmount ?? 0;
  const hdp = totals.headerDiscountPercent ?? 0;
  const isContract = patientType === "contract" || patientType === "insurance";
  const companyShare = totals.companyShareTotal ?? 0;
  const patientShare = totals.patientShareTotal ?? 0;
  const doctorCost = totals.doctorCostTotal ?? 0;

  return (
    <div className="space-y-3" data-testid="invoice-sidebar">

      {invoiceId && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="sidebar-patient-header">
          <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
            {patientInvoiceStatusLabels[status] || status}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">PI-{invoiceNumber}</span>
          {patientCode && (
            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded" data-testid="sidebar-patient-code">
              {patientCode}
            </span>
          )}
        </div>
      )}

      {patientName && (
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate" data-testid="sidebar-patient-name">
            {patientName}
          </span>
        </div>
      )}

      <div className="border-t pt-3">
        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Receipt className="h-3.5 w-3.5" />
          الملخص المالي
        </h4>
        <div className="space-y-1.5">
          <SummaryRow label="إجمالي الخدمات" value={totals.totalAmount} testId="text-sidebar-total" />
          <SummaryRow label="الخصم" value={totals.discountAmount} testId="text-sidebar-discount" />
          {hda > 0 && (
            <SummaryRow
              label={`خصم الفاتورة${hdp > 0 ? ` (${hdp}%)` : ""}`}
              value={hda}
              className="text-orange-600 dark:text-orange-400"
              testId="text-sidebar-header-discount"
            />
          )}
          <div className="border-t my-1" />
          <SummaryRow label="الصافي" value={totals.netAmount} bold testId="text-sidebar-net" />
          {isContract && companyShare > 0 && (
            <>
              <SummaryRow label="حصة الشركة" value={companyShare} className="text-blue-600 dark:text-blue-400" testId="text-sidebar-company" />
              <SummaryRow label="على المريض" value={patientShare} className="text-amber-600 dark:text-amber-400" testId="text-sidebar-patient" />
            </>
          )}
          {doctorCost > 0 && (
            <SummaryRow label="أجر أطباء" value={doctorCost} className="text-rose-600 dark:text-rose-400" testId="text-sidebar-doctor-cost" />
          )}
          <div className="border-t my-1" />
          <SummaryRow label="المدفوع" value={totals.paidAmount} testId="text-sidebar-paid" />
          <SummaryRow
            label="الباقي"
            value={totals.remaining}
            bold
            className={totals.remaining > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}
            testId="text-sidebar-remaining"
          />
        </div>
      </div>

      {isDraft && canDiscount && invoiceId && (
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Percent className="h-3.5 w-3.5" />
            خصم الإجمالي
          </h4>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-orange-400 text-orange-600 hover:bg-orange-50 dark:border-orange-500 dark:text-orange-400"
            onClick={onOpenDiscountDialog}
            data-testid="button-sidebar-discount"
          >
            <Percent className="h-3 w-3 ml-1" />
            {hda > 0 ? `تعديل الخصم (${formatCurrency(hda)})` : "إضافة خصم"}
          </Button>
        </div>
      )}

      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />
            المدفوعات
          </h4>
          {isDraft && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={addPayment} data-testid="button-sidebar-add-payment">
              <Plus className="h-3 w-3 ml-0.5" />
              إضافة
            </Button>
          )}
        </div>

        {payments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">لا توجد دفعات</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={p.tempId} className="border rounded-md p-2 text-xs space-y-1.5 bg-muted/20" data-testid={`sidebar-payment-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  {isDraft && (
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removePayment(p.tempId)} data-testid={`button-sidebar-remove-payment-${i}`}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                {isDraft ? (
                  <>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">المبلغ</Label>
                        <Input
                          type="number"
                          value={p.amount}
                          min={0}
                          onChange={(e) => updatePayment(p.tempId, "amount", parseFloat(e.target.value) || 0)}
                          className="h-6 text-xs"
                          data-testid={`input-sidebar-pay-amount-${i}`}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">الطريقة</Label>
                        <Select value={p.paymentMethod} onValueChange={(v) => updatePayment(p.tempId, "paymentMethod", v)}>
                          <SelectTrigger className="h-6 text-[10px]" data-testid={`select-sidebar-pay-method-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(paymentMethodLabels).map(([val, label]) => (
                              <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">التاريخ</Label>
                        <Input
                          type="date"
                          value={p.paymentDate}
                          onChange={(e) => updatePayment(p.tempId, "paymentDate", e.target.value)}
                          className="h-6 text-xs"
                          data-testid={`input-sidebar-pay-date-${i}`}
                        />
                      </div>
                      {!singleTreasury ? (
                        <div>
                          <Label className="text-[10px] text-muted-foreground">الخزنة</Label>
                          <Select value={p.treasuryId ?? "none"} onValueChange={(v) => updatePayment(p.tempId, "treasuryId", v === "none" ? null : v)}>
                            <SelectTrigger className="h-6 text-[10px]" data-testid={`select-sidebar-pay-treasury-${i}`}>
                              <SelectValue placeholder="اختر خزنة" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">بدون خزنة</SelectItem>
                              {activeTreasuries.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-end">
                          <span className="text-[10px] text-muted-foreground pb-1">{singleTreasury.name}</span>
                        </div>
                      )}
                    </div>
                    <Input
                      value={p.referenceNumber}
                      onChange={(e) => updatePayment(p.tempId, "referenceNumber", e.target.value)}
                      placeholder="مرجع (اختياري)"
                      className="h-6 text-xs"
                      data-testid={`input-sidebar-pay-ref-${i}`}
                    />
                    <Input
                      value={p.notes}
                      onChange={(e) => updatePayment(p.tempId, "notes", e.target.value)}
                      placeholder="ملاحظات (اختياري)"
                      className="h-6 text-xs"
                      data-testid={`input-sidebar-pay-notes-${i}`}
                    />
                  </>
                ) : (
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{paymentMethodLabels[p.paymentMethod] || p.paymentMethod}</span>
                      <span className="font-semibold">{formatNumber(p.amount)}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{formatDateShort(p.paymentDate)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {status === "finalized" && invoiceId && (
        <div className="border-t pt-3" data-testid="sidebar-doctor-transfer">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Stethoscope className="h-3.5 w-3.5" />
              تحويل مستحقات الطبيب
            </h4>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-1.5 text-blue-600 dark:text-blue-400"
              onClick={() => { setDtOpen(o => !o); if (!dtOpen) setDtAmount(dtRemaining.toFixed(2)); }}
              data-testid="button-sidebar-dt-open"
            >
              <ArrowLeftRight className="h-3 w-3 ml-0.5" />
              {dtOpen ? "إلغاء" : "تحويل"}
            </Button>
          </div>

          {dtTransfers.length > 0 && (
            <div className="space-y-1 mb-2">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>محوّل: {formatCurrency(dtAlreadyTransferred)}</span>
                <span>متبقي: {formatCurrency(dtRemaining)}</span>
              </div>
              {dtTransfers.map(t => (
                <div key={t.id} className="flex justify-between text-xs border-b border-border/30 pb-1" data-testid={`sidebar-dt-${t.id}`}>
                  <span className="truncate">{t.doctorName}</span>
                  <span className="font-medium shrink-0">{formatCurrency(parseFloat(t.amount))}</span>
                </div>
              ))}
            </div>
          )}

          {dtOpen && (
            <div className="space-y-2 border rounded-md p-2 bg-blue-50/40 dark:bg-blue-950/20">
              <div>
                <Label className="text-[10px] text-muted-foreground">الطبيب *</Label>
                <DoctorLookup
                  value={localDtDoctorId}
                  displayValue={dtDoctorName}
                  onChange={(item) => {
                    setLocalDtDoctorId(item?.id || "");
                    setDtDoctorName(item?.name || "");
                  }}
                  data-testid="sidebar-lookup-dt-doctor"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground">المبلغ *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={dtAmount}
                    onChange={e => setDtAmount(e.target.value)}
                    className="h-6 text-xs"
                    data-testid="input-sidebar-dt-amount"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                  <Input
                    value={dtNotes}
                    onChange={e => setDtNotes(e.target.value)}
                    placeholder="اختياري"
                    className="h-6 text-xs"
                    data-testid="input-sidebar-dt-notes"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full bg-blue-600 text-white hover:bg-blue-700 h-7 text-xs"
                onClick={openDtConfirm}
                data-testid="button-sidebar-dt-confirm"
              >
                <ArrowLeftRight className="h-3 w-3 ml-1" />
                تأكيد التحويل
              </Button>
            </div>
          )}
        </div>
      )}

      {isDraft && invoiceId && finalizeMutation && (
        <div className="border-t pt-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-9"
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
            data-testid="button-sidebar-finalize"
          >
            {finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            اعتماد الفاتورة
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold, className, testId }: {
  label: string;
  value: number;
  bold?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-xs ${bold ? "font-bold" : "font-medium"} ${className || ""}`}
        data-testid={testId}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
