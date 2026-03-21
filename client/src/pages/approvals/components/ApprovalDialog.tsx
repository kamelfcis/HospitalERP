/**
 * ApprovalDialog
 *
 * Handles both Approve (full/partial) and Reject dialogs.
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ApprovalItem } from "../hooks/useApprovals";

// ── Approve Dialog ─────────────────────────────────────────────────────────

interface ApproveDialogProps {
  approval:    ApprovalItem | null;
  open:        boolean;
  onClose:     () => void;
  onConfirm:   (id: string, approvedAmount?: string, notes?: string) => void;
  isPending:   boolean;
}

export function ApproveDialog({ approval, open, onClose, onConfirm, isPending }: ApproveDialogProps) {
  const [amount, setAmount] = useState("");
  const [notes,  setNotes]  = useState("");

  if (!approval) return null;

  const handleSubmit = () => {
    const finalAmount = amount.trim() || undefined;
    onConfirm(approval.id, finalAmount, notes.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            تأكيد الموافقة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div><span className="font-medium">الخدمة:</span> {approval.serviceDescription ?? "—"}</div>
            <div><span className="font-medium">المبلغ المطلوب:</span> {parseFloat(approval.requestedAmount).toLocaleString("ar-EG")} ج.م</div>
          </div>

          <div className="space-y-1">
            <Label>المبلغ الموافق عليه (اتركه فارغاً للموافقة الكاملة)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={approval.requestedAmount}
              data-testid="input-approved-amount"
            />
          </div>

          <div className="space-y-1">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="أي ملاحظات إضافية..."
              data-testid="textarea-approve-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-green-600 hover:bg-green-700" data-testid="button-confirm-approve">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="mr-1">موافقة</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reject Dialog ──────────────────────────────────────────────────────────

interface RejectDialogProps {
  approval:    ApprovalItem | null;
  open:        boolean;
  onClose:     () => void;
  onConfirm:   (id: string, reason: string, notes?: string) => void;
  isPending:   boolean;
}

export function RejectDialog({ approval, open, onClose, onConfirm, isPending }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const [notes,  setNotes]  = useState("");

  if (!approval) return null;

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onConfirm(approval.id, reason.trim(), notes.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <XCircle className="h-5 w-5" />
            تأكيد الرفض
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div><span className="font-medium">الخدمة:</span> {approval.serviceDescription ?? "—"}</div>
            <div><span className="font-medium">المبلغ المطلوب:</span> {parseFloat(approval.requestedAmount).toLocaleString("ar-EG")} ج.م</div>
          </div>

          <div className="space-y-1">
            <Label>سبب الرفض <span className="text-destructive">*</span></Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: خارج نطاق التغطية"
              data-testid="input-rejection-reason"
            />
          </div>

          <div className="space-y-1">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="أي ملاحظات إضافية..."
              data-testid="textarea-reject-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>إلغاء</Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !reason.trim()}
            data-testid="button-confirm-reject"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            <span className="mr-1">رفض</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
