import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { ClinicOrder } from "../types";

interface Props {
  order: ClinicOrder | null;
  onClose: () => void;
  onConfirm: (orderId: string) => void;
  isPending: boolean;
}

export function ExecuteConfirmDialog({ order, onClose, onConfirm, isPending }: Props) {
  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>تأكيد تنفيذ الأمر</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">المريض</span>
              <span className="text-sm font-medium">{order.patientName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">الخدمة</span>
              <span className="text-sm">{order.serviceNameManual || order.serviceId || "—"}</span>
            </div>
            {order.targetName && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">الجهة</span>
                <span className="text-sm">{order.targetName}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            سيتم إنشاء فاتورة مريض تلقائياً عند التنفيذ
          </p>
        </div>
        <DialogFooter className="gap-2 flex-row-reverse">
          <Button
            onClick={() => onConfirm(order.id)}
            disabled={isPending}
            className="gap-2"
            data-testid="button-confirm-execute"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تنفيذ الأمر
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-execute">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
