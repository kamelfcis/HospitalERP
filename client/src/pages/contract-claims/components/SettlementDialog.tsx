/**
 * SettlementDialog — Phase 5
 *
 * Per-line settlement entry with optional write-off amounts.
 *
 * FILTER RULE: only lines with status === 'approved' are shown.
 * Pending/rejected lines are excluded from the UI entirely.
 * Backend enforces the same rule, but the UI prevents confusing errors.
 */

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Coins } from "lucide-react";
import type { SettlementLineInput } from "../hooks/useClaimSettlement";

// ─── Types ────────────────────────────────────────────────────────────────

interface ClaimLine {
  id:                 string;
  serviceDescription: string;
  companyShareAmount:  string;
  approvedAmount?:    string | null;
  /** Only 'approved' lines appear in the dialog */
  status:             string;
}

export interface SettlePayload {
  settlementDate:     string;
  settledAmount:      number;
  bankAccountId?:     string | null;
  companyArAccountId?: string | null;
  referenceNumber?:   string;
  notes?:             string;
  lines:              SettlementLineInput[];
}

interface SettlementDialogProps {
  open:        boolean;
  onClose:     () => void;
  batchNumber: string;
  /** All lines on the batch — dialog will filter to approved only */
  lines:       ClaimLine[];
  onSettle:    (payload: SettlePayload) => void;
  isPending:   boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: string | null | undefined) {
  if (!v) return "0.00";
  return parseFloat(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

/** Returns the effective amount the company must pay (approved > claimed fallback) */
function approvedAmount(line: ClaimLine): number {
  return parseFloat(String(line.approvedAmount ?? line.companyShareAmount ?? "0"));
}

// ─── Component ────────────────────────────────────────────────────────────

export function SettlementDialog({
  open, onClose, batchNumber, lines, onSettle, isPending,
}: SettlementDialogProps) {
  const [settlementDate,  setSettlementDate]  = useState(new Date().toISOString().split("T")[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankAccountId,   setBankAccountId]   = useState("");
  const [arAccountId,     setArAccountId]     = useState("");
  const [notes,           setNotes]           = useState("");

  // Per-line amounts (keyed by line.id)
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [writeoffs,   setWriteoffs]   = useState<Record<string, string>>({});

  // ── Only approved lines can be settled (business rule) ─────────────────
  const approvedLines = lines.filter(l => l.status === "approved");

  // Reset line amounts when dialog opens with fresh data
  useEffect(() => {
    if (!open) return;
    const amounts: Record<string, string> = {};
    approvedLines.forEach(l => { amounts[l.id] = approvedAmount(l).toFixed(2); });
    setLineAmounts(amounts);
    setWriteoffs({});
  }, [open]);   // intentionally omit approvedLines to avoid re-init on every render

  const totalSettled = approvedLines.reduce(
    (sum, l) => sum + parseFloat(lineAmounts[l.id] || "0"), 0
  );

  function handleSubmit() {
    const settlementLines: SettlementLineInput[] = approvedLines
      .filter(l => parseFloat(lineAmounts[l.id] || "0") > 0)
      .map(l => ({
        claimLineId:   l.id,
        settledAmount: parseFloat(lineAmounts[l.id] || "0"),
        writeOffAmount: parseFloat(writeoffs[l.id] || "0") || undefined,
      }));

    if (settlementLines.length === 0) return;

    onSettle({
      settlementDate,
      settledAmount:      totalSettled,
      bankAccountId:      bankAccountId || null,
      companyArAccountId: arAccountId  || null,
      referenceNumber:    referenceNumber || undefined,
      notes:              notes          || undefined,
      lines:              settlementLines,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            تسوية مالية — {batchNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Header fields ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>تاريخ التسوية <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={settlementDate}
                onChange={e => setSettlementDate(e.target.value)}
                data-testid="input-settlement-date"
              />
            </div>
            <div className="space-y-1">
              <Label>رقم المرجع</Label>
              <Input
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="REF-001"
                data-testid="input-settlement-ref"
              />
            </div>
            <div className="space-y-1">
              <Label>حساب البنك / الصندوق</Label>
              <Input
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
                placeholder="معرّف الحساب (اختياري للقيد)"
                data-testid="input-bank-account"
              />
            </div>
            <div className="space-y-1">
              <Label>حساب الذمم المدينة للشركة</Label>
              <Input
                value={arAccountId}
                onChange={e => setArAccountId(e.target.value)}
                placeholder="معرّف حساب AR (اختياري)"
                data-testid="input-ar-account"
              />
            </div>
          </div>

          {/* ── Per-line settlement amounts ───────────────────────────────── */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground border-b pb-1">
              مبالغ التسوية — السطور المقبولة فقط
              {approvedLines.length === 0 && (
                <span className="text-destructive mr-2 text-xs">(لا توجد سطور مقبولة)</span>
              )}
            </div>

            {approvedLines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                يجب قبول سطور المطالبة أولاً قبل التسوية.
              </p>
            ) : (
              <div className="space-y-2">
                {approvedLines.map(line => {
                  const approved = approvedAmount(line);
                  return (
                    <div key={line.id} className="border rounded-lg p-3 bg-muted/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate max-w-[60%]" title={line.serviceDescription}>
                          {line.serviceDescription}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          المعتمد: {fmt(String(approved))} ج.م
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-0.5">
                          <Label className="text-xs">مبلغ التسوية</Label>
                          <Input
                            type="number" min="0" max={approved} step="0.01"
                            value={lineAmounts[line.id] ?? approved.toFixed(2)}
                            onChange={e => setLineAmounts(p => ({ ...p, [line.id]: e.target.value }))}
                            className="h-8 text-sm"
                            data-testid={`input-settle-amount-${line.id}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-xs">شطب</Label>
                          <Input
                            type="number" min="0" step="0.01"
                            value={writeoffs[line.id] ?? ""}
                            onChange={e => setWriteoffs(p => ({ ...p, [line.id]: e.target.value }))}
                            placeholder="0.00"
                            className="h-8 text-sm"
                            data-testid={`input-writeoff-${line.id}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Total ────────────────────────────────────────────────────── */}
          <div className="bg-primary/5 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium">إجمالي التسوية</span>
            <span className="text-lg font-bold text-primary">
              {totalSettled.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </span>
          </div>

          <div className="space-y-1">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="أي ملاحظات..."
              data-testid="textarea-settlement-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>إلغاء</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || totalSettled <= 0 || !settlementDate || approvedLines.length === 0}
            data-testid="button-confirm-settlement"
          >
            {isPending
              ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
              : <Coins   className="h-4 w-4 ml-1" />}
            تأكيد التسوية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
