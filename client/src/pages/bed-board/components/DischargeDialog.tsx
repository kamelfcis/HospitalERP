import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { BedData } from "../types";

interface Props {
  open: boolean;
  bed: BedData | null;
  onClose: () => void;
}

export function DischargeDialog({ open, bed, onClose }: Props) {
  const { toast } = useToast();
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);

  const dischargeMutation = useMutation({
    mutationFn: async (force?: boolean) => {
      const res = await fetch(`/api/beds/${bed!.id}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw { ...data, _httpError: true };
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم تسجيل الخروج", description: "تم خروج المريض وتحديث حالة السرير" });
      handleClose();
    },
    onError: (err: any) => {
      const code = err?.code;
      const msg = err?.message || "فشل تسجيل الخروج";
      if (code === "NO_INVOICE" || code === "INVOICE_NOT_FINALIZED") {
        setBlockReason(msg);
        setCanForce(true);
      } else {
        toast({ variant: "destructive", title: "خطأ", description: msg });
      }
    },
  });

  const handleClose = useCallback(() => {
    setBlockReason(null);
    setCanForce(false);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تأكيد خروج المريض</DialogTitle>
          <DialogDescription>
            {bed?.patientName
              ? `هل تريد تسجيل خروج ${bed.patientName} من سرير ${bed.bedNumber}؟`
              : "تأكيد خروج المريض"}
          </DialogDescription>
        </DialogHeader>

        {blockReason && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
            <p>{blockReason}</p>
            {canForce && (
              <p className="text-xs text-amber-600">
                يمكنك تجاوز هذا الشرط بصلاحية المسؤول بالضغط على "تجاوز وخروج"
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-discharge-cancel"
          >
            إلغاء
          </Button>
          {canForce && blockReason ? (
            <Button
              variant="destructive"
              data-testid="button-discharge-force"
              disabled={dischargeMutation.isPending}
              onClick={() => dischargeMutation.mutate(true)}
            >
              {dischargeMutation.isPending ? "جارٍ التسجيل..." : "تجاوز وخروج"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              data-testid="button-discharge-confirm"
              disabled={dischargeMutation.isPending}
              onClick={() => dischargeMutation.mutate(false)}
            >
              {dischargeMutation.isPending ? "جارٍ التسجيل..." : "تأكيد الخروج"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
