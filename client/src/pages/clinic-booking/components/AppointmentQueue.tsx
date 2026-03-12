import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Stethoscope, Loader2, Trash2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClinicAppointment } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";

interface Props {
  appointments: ClinicAppointment[];
  isLoading: boolean;
  onStatusChange: (id: string, status: string) => void;
  isChanging: boolean;
  onStartConsultation: (apt: ClinicAppointment) => void;
  onCancelRefund: (id: string, refundAmount?: number, cancelAppointment?: boolean) => Promise<any>;
  isCancelRefunding: boolean;
}

interface RefundState {
  apt: ClinicAppointment;
  paidAmount: number;
  refundAmount: string;
  cancelAppointment: boolean;
}

export function AppointmentQueue({ appointments, isLoading, onStatusChange, isChanging, onStartConsultation, onCancelRefund, isCancelRefunding }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [refund, setRefund] = useState<RefundState | null>(null);

  function openRefundDialog(apt: ClinicAppointment) {
    const paid = parseFloat(String(apt.invoicePaidAmount || 0));
    setRefund({ apt, paidAmount: paid, refundAmount: String(paid), cancelAppointment: true });
  }

  async function handleConfirmRefund() {
    if (!refund) return;
    // القاعدة: إذا كان إلغاء الموعد → المبلغ كاملاً تلقائياً (لا يُرسل refundAmount)
    const isCancel = refund.cancelAppointment;
    const amount = isCancel ? refund.paidAmount : parseFloat(refund.refundAmount);
    if (!isCancel && (isNaN(amount) || amount <= 0)) {
      toast({ title: "خطأ", description: "المبلغ يجب أن يكون أكبر من صفر", variant: "destructive" });
      return;
    }
    try {
      const res = await onCancelRefund(
        refund.apt.id,
        isCancel ? undefined : amount, // عند الإلغاء لا نرسل مبلغاً — الباك-إند يحسبه كاملاً
        refund.cancelAppointment
      );
      toast({
        title: res?.isFullCancel ? "تم إلغاء الموعد وإعادة المبلغ" : (amount < refund.paidAmount ? "تم الاسترداد الجزئي" : "تم رد المبلغ"),
        description: `تم استرداد ${res?.refundedAmount ?? amount.toFixed(2)} ج.م للمريض ${res?.patientName ?? refund.apt.patientName}`,
      });
      setRefund(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "حدث خطأ أثناء الاسترداد", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16 border rounded-lg">
        لا توجد حجوزات لهذا اليوم
      </div>
    );
  }

  const isActive = (s: string) => s === "waiting" || s === "in_consultation";

  return (
    <>
      <Dialog open={!!refund} onOpenChange={(open) => { if (!open) setRefund(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>رد مبلغ — {refund?.apt.patientName}</DialogTitle>
          </DialogHeader>
          {refund && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 px-4 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">المبلغ المحصّل:</span>
                <span className="font-semibold">{refund.paidAmount.toFixed(2)} ج.م</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Checkbox
                  id="cancel-apt"
                  checked={refund.cancelAppointment}
                  onCheckedChange={(v) => setRefund({ ...refund, cancelAppointment: !!v })}
                  data-testid="checkbox-cancel-appointment"
                />
                <Label htmlFor="cancel-apt" className="text-sm cursor-pointer leading-snug">
                  إلغاء الموعد بالكامل
                  <span className="block text-xs text-muted-foreground font-normal">
                    الإلغاء يُعيد المبلغ كاملاً تلقائياً
                  </span>
                </Label>
              </div>
              {!refund.cancelAppointment && (
                <div className="space-y-1">
                  <Label className="text-sm">المبلغ المراد رده جزئياً (ج.م) *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    max={refund.paidAmount}
                    step="0.01"
                    value={refund.refundAmount}
                    onChange={(e) => setRefund({ ...refund, refundAmount: e.target.value })}
                    className="text-lg font-semibold"
                    autoFocus
                    data-testid="input-refund-amount"
                  />
                  {parseFloat(refund.refundAmount) < refund.paidAmount && parseFloat(refund.refundAmount) > 0 && (
                    <p className="text-xs text-amber-600">
                      استرداد جزئي — الموعد يبقى نشطاً، المتبقي: {(refund.paidAmount - parseFloat(refund.refundAmount)).toFixed(2)} ج.م
                    </p>
                  )}
                </div>
              )}
              {refund.cancelAppointment && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm flex justify-between">
                  <span className="text-muted-foreground">المبلغ الذي سيُعاد:</span>
                  <span className="font-bold text-destructive">{refund.paidAmount.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-row-reverse gap-2">
            <Button variant="outline" onClick={() => setRefund(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRefund}
              disabled={isCancelRefunding}
              data-testid="button-confirm-refund"
            >
              {isCancelRefunding ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RotateCcw className="h-4 w-4 ml-1" />}
              تأكيد الاسترداد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right w-16">الدور</TableHead>
              <TableHead className="text-right">اسم المريض</TableHead>
              <TableHead className="text-right">الطبيب</TableHead>
              <TableHead className="text-right w-28">الوقت</TableHead>
              <TableHead className="text-right w-40">الحالة</TableHead>
              <TableHead className="text-right w-52">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((apt) => {
              const isCashPaid = apt.paymentType === 'CASH' && apt.invoiceStatus === 'finalized';
              const active = isActive(apt.status);
              return (
                <TableRow
                  key={apt.id}
                  data-testid={`appointment-row-${apt.id}`}
                  className={apt.status === "done" ? "opacity-50" : apt.status === "cancelled" ? "opacity-40" : ""}
                >
                  <TableCell className="font-bold text-center text-lg">{apt.turnNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium">{apt.patientName}</div>
                    {apt.patientPhone && (
                      <div className="text-xs text-muted-foreground" dir="ltr">{apt.patientPhone}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{apt.doctorName}</div>
                    {apt.doctorSpecialty && (
                      <div className="text-xs text-muted-foreground">{apt.doctorSpecialty}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm" dir="ltr">{apt.appointmentTime || "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={apt.status}
                      onValueChange={(v) => onStatusChange(apt.id, v)}
                      disabled={isChanging || apt.status === "done" || apt.status === "cancelled"}
                    >
                      <SelectTrigger className={`h-8 text-xs border ${STATUS_COLORS[apt.status]}`} data-testid={`status-${apt.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waiting">في الانتظار</SelectItem>
                        <SelectItem value="in_consultation">داخل الكشف</SelectItem>
                        <SelectItem value="done">انتهى</SelectItem>
                        <SelectItem value="cancelled">ملغي</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {active && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => onStartConsultation(apt)}
                          data-testid={`button-consult-${apt.id}`}
                        >
                          <Stethoscope className="h-3 w-3" />
                          بدء الكشف
                        </Button>
                      )}
                      {active && isCashPaid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          onClick={() => openRefundDialog(apt)}
                          disabled={isCancelRefunding}
                          data-testid={`button-refund-${apt.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          رد مبلغ
                        </Button>
                      )}
                      {apt.status === "waiting" && !isCashPaid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onStatusChange(apt.id, "cancelled")}
                          disabled={isChanging}
                          data-testid={`button-cancel-${apt.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
