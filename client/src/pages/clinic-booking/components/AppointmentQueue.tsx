import { useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  onCancelRefund: (id: string) => Promise<any>;
  isCancelRefunding: boolean;
}

export function AppointmentQueue({ appointments, isLoading, onStatusChange, isChanging, onStartConsultation, onCancelRefund, isCancelRefunding }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [refundTarget, setRefundTarget] = useState<ClinicAppointment | null>(null);

  async function handleConfirmRefund() {
    if (!refundTarget) return;
    try {
      const res = await onCancelRefund(refundTarget.id);
      toast({
        title: "تم رد المبلغ",
        description: `تم إلغاء الموعد وإعادة ${res?.refundedAmount ?? ""} جنيه للمريض ${res?.patientName ?? refundTarget.patientName}`,
      });
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "حدث خطأ أثناء رد المبلغ", variant: "destructive" });
    } finally {
      setRefundTarget(null);
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

  return (
    <>
      <AlertDialog open={!!refundTarget} onOpenChange={(open) => { if (!open) setRefundTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إلغاء الموعد ورد المبلغ</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء موعد <strong>{refundTarget?.patientName}</strong> وإعادة مبلغ رسم الكشف نقداً.
              هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleConfirmRefund}
              data-testid="button-confirm-refund"
            >
              <RotateCcw className="h-4 w-4 ml-1" />
              نعم، إلغاء ورد المبلغ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right w-16">الدور</TableHead>
              <TableHead className="text-right">اسم المريض</TableHead>
              <TableHead className="text-right">الطبيب</TableHead>
              <TableHead className="text-right w-28">الوقت</TableHead>
              <TableHead className="text-right w-40">الحالة</TableHead>
              <TableHead className="text-right w-40">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((apt) => {
              const isCashPaid = apt.paymentType === 'CASH' && apt.invoiceStatus === 'finalized';
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
                    <div className="flex gap-1">
                      {(apt.status === "waiting" || apt.status === "in_consultation") && (
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
                      {apt.status === "waiting" && isCashPaid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          onClick={() => setRefundTarget(apt)}
                          disabled={isCancelRefunding}
                          data-testid={`button-refund-${apt.id}`}
                          title="إلغاء ورد المبلغ"
                        >
                          <RotateCcw className="h-3 w-3" />
                          رد المبلغ
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
