/**
 * SettlementDialog — Phase 5
 *
 * Per-line settlement with optional write-off, GL posting fields,
 * and auto-calculated total.
 */

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Coins } from "lucide-react";
import type { SettlementLineInput } from "../hooks/useClaimSettlement";

interface ClaimLine {
  id:                 string;
  serviceDescription: string;
  companyShareAmount:  string;
  approvedAmount?:    string | null;
  status:             string;
}

interface SettlementDialogProps {
  open:       boolean;
  onClose:    () => void;
  batchId:    string;
  batchNumber: string;
  lines:      ClaimLine[];
  onSettle:   (payload: {
    settlementDate:     string;
    settledAmount:      number;
    bankAccountId?:     string | null;
    companyArAccountId?: string | null;
    referenceNumber?:   string;
    notes?:             string;
    lines:              SettlementLineInput[];
  }) => void;
  isPending:  boolean;
}

function fmt(v: string | null | undefined) {
  if (!v) return "0.00";
  return parseFloat(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

function effectiveAmount(line: ClaimLine): number {
  return parseFloat(String(line.approvedAmount ?? line.companyShareAmount ?? "0"));
}

export function SettlementDialog({
  open, onClose, batchId, batchNumber, lines, onSettle, isPending,
}: SettlementDialogProps) {
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split("T")[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankAccountId,   setBankAccountId]   = useState("");
  const [arAccountId,     setArAccountId]     = useState("");
  const [notes,           setNotes]           = useState("");

  // Per-line settle amounts
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [writeoffs,   setWriteoffs]   = useState<Record<string, string>>({});
  const [reasons,     setReasons]     = useState<Record<string, string>>({});

  // Initialize from approved lines
  const settleableLines = lines.filter(l =>
    l.status === "approved" || l.status === "pending"
  );

  useEffect(() => {
    if (open) {
      const amounts: Record<string, string> = {};
      settleableLines.forEach(l => {
        amounts[l.id] = effectiveAmount(l).toFixed(2);
      });
      setLineAmounts(amounts);
      setWriteoffs({});
      setReasons({});
    }
  }, [open, lines]);

  const totalSettled = settleableLines.reduce((s, l) => {
    return s + parseFloat(lineAmounts[l.id] || "0");
  }, 0);

  const handleSubmit = () => {
    const settlementLines: SettlementLineInput[] = settleableLines
      .filter(l => parseFloat(lineAmounts[l.id] || "0") > 0)
      .map(l => ({
        claimLineId:      l.id,
        settledAmount:    parseFloat(lineAmounts[l.id] || "0"),
        writeOffAmount:   parseFloat(writeoffs[l.id] || "0") || undefined,
        adjustmentReason: reasons[l.id] || undefined,
      }));

    if (settlementLines.length === 0) return;

    onSettle({
      settlementDate,
      settledAmount:      totalSettled,
      bankAccountId:      bankAccountId || null,
      companyArAccountId: arAccountId || null,
      referenceNumber:    referenceNumber || undefined,
      notes:              notes || undefined,
      lines:              settlementLines,
    });
  };

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
          {/* General fields */}
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

          {/* Per-line settlement amounts */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground border-b pb-1">
              مبالغ التسوية لكل سطر
            </div>
            {settleableLines.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                لا توجد سطور قابلة للتسوية (يجب أن تكون مقبولة)
              </div>
            ) : (
              <div className="space-y-2">
                {settleableLines.map(line => {
                  const approved = effectiveAmount(line);
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
                            type="number"
                            min="0"
                            max={approved}
                            step="0.01"
                            value={lineAmounts[line.id] ?? approved.toFixed(2)}
                            onChange={e => setLineAmounts(p => ({ ...p, [line.id]: e.target.value }))}
                            className="h-8 text-sm"
                            data-testid={`input-settle-amount-${line.id}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-xs">شطب</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
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

          {/* Total */}
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
            disabled={isPending || totalSettled <= 0 || !settlementDate}
            data-testid="button-confirm-settlement"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Coins className="h-4 w-4 ml-1" />}
            تأكيد التسوية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
