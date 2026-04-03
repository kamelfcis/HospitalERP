/**
 * SettlementDialog — Phase 6
 *
 * Per-line settlement entry with write-off type + coverage display.
 *
 * FILTER RULE: only lines with status === 'approved' are shown.
 *
 * GL RULE:
 *   All journal entries are driven by Account Mappings (contract_settlement type).
 *   The admin configures accounts ONCE in Account Mappings — NOT per settlement.
 *   Fields bankAccountId / companyArAccountId are fallback overrides only.
 *
 * WRITE-OFF TYPES (separate GL lines per type):
 *   rejection         → Dr خسارة مطالبات / Cr ذمم شركة
 *   contract_discount → Dr خصم تعاقد    / Cr ذمم شركة
 *   price_difference  → Dr فرق سعر      / Cr ذمم شركة
 *   rounding          → Dr تقريب         / Cr ذمم شركة
 */

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Coins, HelpCircle, Info } from "lucide-react";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import type { SettlementLineInput, WriteOffType } from "../hooks/useClaimSettlement";

// ─── Types ────────────────────────────────────────────────────────────────

interface ClaimLine {
  id:                 string;
  serviceDescription: string;
  companyShareAmount:  string;
  listPrice?:         string | null;
  contractPrice?:     string | null;
  approvedAmount?:    string | null;
  /** Only 'approved' lines appear in the dialog */
  status:             string;
}

export interface SettlePayload {
  settlementDate:      string;
  settledAmount:       number;
  bankAccountId?:      string | null;
  companyArAccountId?: string | null;
  referenceNumber?:    string;
  notes?:              string;
  lines:               SettlementLineInput[];
}

interface SettlementDialogProps {
  open:        boolean;
  onClose:     () => void;
  batchNumber: string;
  batchId:     string;
  lines:       ClaimLine[];
  onSettle:    (payload: SettlePayload) => void;
  isPending:   boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: string | null | undefined) {
  if (!v) return "0.00";
  return parseFloat(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

function approvedAmount(line: ClaimLine): number {
  return parseFloat(String(line.approvedAmount ?? line.companyShareAmount ?? "0"));
}

function coveragePct(line: ClaimLine): number | null {
  const list = parseFloat(line.listPrice ?? "0");
  if (list <= 0) return null;
  const share = parseFloat(String(line.companyShareAmount ?? "0"));
  return Math.round((share / list) * 100);
}

const WRITE_OFF_TYPE_LABELS: Record<WriteOffType, string> = {
  rejection:         "رفض شركة — خسارة ديون",
  contract_discount: "خصم تعاقد",
  price_difference:  "فرق سعر",
  rounding:          "تقريب حسابي",
};

// ─── Component ────────────────────────────────────────────────────────────

export function SettlementDialog({
  open, onClose, batchNumber, lines, onSettle, isPending,
}: SettlementDialogProps) {
  const [settlementDate,  setSettlementDate]  = useState(new Date().toISOString().split("T")[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankAccountId,   setBankAccountId]   = useState("");
  const [arAccountId,     setArAccountId]     = useState("");
  const [notes,           setNotes]           = useState("");

  const [lineAmounts,    setLineAmounts]    = useState<Record<string, string>>({});
  const [writeoffs,      setWriteoffs]      = useState<Record<string, string>>({});
  const [writeOffTypes,  setWriteOffTypes]  = useState<Record<string, WriteOffType>>({});

  const approvedLines = lines.filter(l => l.status === "approved");

  useEffect(() => {
    if (!open) return;
    const amounts: Record<string, string> = {};
    approvedLines.forEach(l => { amounts[l.id] = approvedAmount(l).toFixed(2); });
    setLineAmounts(amounts);
    setWriteoffs({});
    setWriteOffTypes({});
  }, [open]);

  const totalSettled = approvedLines.reduce(
    (sum, l) => sum + parseFloat(lineAmounts[l.id] || "0"), 0
  );
  const totalWriteoff = approvedLines.reduce(
    (sum, l) => sum + parseFloat(writeoffs[l.id] || "0"), 0
  );

  function handleSubmit() {
    const settlementLines: SettlementLineInput[] = approvedLines
      .filter(l => parseFloat(lineAmounts[l.id] || "0") > 0 || parseFloat(writeoffs[l.id] || "0") > 0)
      .map(l => ({
        claimLineId:    l.id,
        settledAmount:  parseFloat(lineAmounts[l.id] || "0"),
        writeOffAmount: parseFloat(writeoffs[l.id] || "0") || undefined,
        writeOffType:   parseFloat(writeoffs[l.id] || "0") > 0 ? (writeOffTypes[l.id] ?? undefined) : undefined,
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

          {/* ── GL Info Banner ────────────────────────────────────────────── */}
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">القيود تُنشأ أوتوماتيك</span> من إعدادات{" "}
              <span className="font-semibold">ربط الحسابات → تسوية مطالبات تأمين</span>.
              {" "}حدّد حسابات البنك والذمم والشطب هناك مرة واحدة، ويُطبَّق على كل تسوية.
            </div>
          </div>

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

            {/* حساب البنك — fallback if not in account mappings */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                حساب البنك / الصندوق
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" dir="rtl" className="max-w-xs text-right text-xs">
                      احتياطي فقط — إن ضُبط حساب البنك في ربط الحسابات يُستخدم تلقائياً بدلاً من هذا
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <AccountLookup
                value={bankAccountId}
                onChange={v => setBankAccountId(v?.id ?? "")}
                placeholder="احتياطي — الأولوية لربط الحسابات"
                data-testid="input-bank-account"
              />
            </div>

            {/* حساب الذمم — fallback */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                حساب ذمم الشركة
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" dir="rtl" className="max-w-xs text-right text-xs">
                      احتياطي فقط — إن ضُبط حساب ar_insurance في ربط الحسابات يُستخدم تلقائياً
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <AccountLookup
                value={arAccountId}
                onChange={v => setArAccountId(v?.id ?? "")}
                placeholder="احتياطي — الأولوية لربط الحسابات"
                data-testid="input-ar-account"
              />
            </div>
          </div>

          {/* ── Per-line settlement ───────────────────────────────────────── */}
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
              <div className="space-y-3">
                {approvedLines.map(line => {
                  const approved = approvedAmount(line);
                  const pct      = coveragePct(line);
                  const woAmt    = parseFloat(writeoffs[line.id] || "0");
                  const woType   = writeOffTypes[line.id];

                  return (
                    <div key={line.id} className="border rounded-lg p-3 bg-muted/20 space-y-2">

                      {/* ── Line header ── */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate max-w-[55%]" title={line.serviceDescription}>
                          {line.serviceDescription}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                          {pct !== null && (
                            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              تغطية {pct}%
                            </span>
                          )}
                          <span>المعتمد: {fmt(String(approved))} ج.م</span>
                        </div>
                      </div>

                      {/* ── Amounts row ── */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-xs">مبلغ التسوية (تحصيل)</Label>
                          <Input
                            type="number" min="0" max={approved} step="0.01"
                            value={lineAmounts[line.id] ?? approved.toFixed(2)}
                            onChange={e => setLineAmounts(p => ({ ...p, [line.id]: e.target.value }))}
                            className="h-8 text-sm"
                            data-testid={`input-settle-amount-${line.id}`}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-xs flex items-center gap-1">
                            شطب
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top" dir="rtl" className="max-w-xs text-right text-xs">
                                  المبلغ الذي ترفض الشركة دفعه — يُسجَّل كخسارة أو خصم حسب النوع المحدد.
                                  مثال: معتمد 100 ج.م — دفعت 94 — شطب 6 ج.م
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
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

                      {/* ── Write-off type (shown only when write-off > 0) ── */}
                      {woAmt > 0 && (
                        <div className="space-y-0.5">
                          <Label className="text-xs text-orange-600 dark:text-orange-400">
                            نوع الشطب <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={woType ?? "__none__"}
                            onValueChange={v =>
                              v !== "__none__"
                                ? setWriteOffTypes(p => ({ ...p, [line.id]: v as WriteOffType }))
                                : setWriteOffTypes(p => { const n = { ...p }; delete n[line.id]; return n; })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-writeoff-type-${line.id}`}>
                              <SelectValue placeholder="حدّد نوع الشطب..." />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              <SelectItem value="__none__" disabled>حدّد نوع الشطب...</SelectItem>
                              {(Object.entries(WRITE_OFF_TYPE_LABELS) as [WriteOffType, string][]).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {woType && (
                            <p className="text-[10px] text-muted-foreground">
                              {woType === "rejection"         && "سيُنشأ قيد: Dr خسارة مطالبات مرفوضة / Cr ذمم الشركة"}
                              {woType === "contract_discount" && "سيُنشأ قيد: Dr خصم تعاقد مسموح / Cr ذمم الشركة"}
                              {woType === "price_difference"  && "سيُنشأ قيد: Dr فرق سعر / Cr ذمم الشركة"}
                              {woType === "rounding"          && "سيُنشأ قيد: Dr تسوية تقريب / Cr ذمم الشركة"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Totals ───────────────────────────────────────────────────── */}
          <div className="bg-primary/5 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">إجمالي التسوية (تحصيل)</span>
              <span className="text-lg font-bold text-primary">
                {totalSettled.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
              </span>
            </div>
            {totalWriteoff > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-orange-600 dark:text-orange-400">إجمالي الشطب</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  {totalWriteoff.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </span>
              </div>
            )}
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
            disabled={
              isPending ||
              (totalSettled <= 0 && totalWriteoff <= 0) ||
              !settlementDate ||
              approvedLines.length === 0 ||
              // Require write-off type when write-off > 0
              approvedLines.some(l => parseFloat(writeoffs[l.id] || "0") > 0 && !writeOffTypes[l.id])
            }
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
