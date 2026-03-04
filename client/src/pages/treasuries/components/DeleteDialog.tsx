import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import type { TreasurySummary } from "../types";

interface Props {
  treasury: TreasurySummary | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  isDeleting: boolean;
}

export function DeleteDialog({ treasury, onClose, onConfirm, isDeleting }: Props) {
  return (
    <Dialog open={!!treasury} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">حذف الخزنة</DialogTitle>
          <DialogDescription className="text-right">
            هل أنت متأكد من حذف الخزنة «{treasury?.name}»؟
            {" "}سيُحذف كل تاريخ المعاملات المرتبط بها ولا يمكن التراجع عن هذه العملية.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button
            variant="destructive"
            onClick={() => treasury && onConfirm(treasury.id)}
            disabled={isDeleting}
            data-testid="button-confirm-delete"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />}
            حذف
          </Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
