import { memo, useState, useMemo } from "react";
import {
  Loader2, Stethoscope, Banknote, Clock, CircleDot,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtDate, fmtMoney, fmtQty, PAYMENT_METHOD_LABELS, LINE_TYPE_LABELS } from "../../../shared/formatters";
import { usePaymentsList } from "../../../hooks/useInvoiceLines";
import {
  ENCOUNTER_TYPE_LABELS, ENCOUNTER_TYPE_COLORS, ENCOUNTER_STATUS_LABELS,
  LINE_CLASS, PAY_METHOD_CLASS,
} from "../constants";
import { FinRow } from "./FinancialSidebar";
import { FinalizationPanel } from "./SidebarPanels";
import type { EncounterLineSummary, EncounterSummary, VisitInvoiceSummary } from "../types";

export const EncounterTimeline = memo(function EncounterTimeline({ encounters }: { encounters: EncounterSummary[] }) {
  if (encounters.length === 0) return null;
  return (
    <div className="flex flex-col gap-0 relative pr-4" data-testid="encounter-timeline">
      <div className="absolute right-[7px] top-3 bottom-3 w-0.5 bg-slate-200" />
      {encounters.map((enc, idx) => {
        const StatusIcon = ENCOUNTER_STATUS_LABELS[enc.status]?.icon ?? CircleDot;
        const colorClass = ENCOUNTER_TYPE_COLORS[enc.encounterType] ?? "bg-slate-50 text-slate-700 border-slate-200";
        return (
          <div key={enc.id} className="flex items-start gap-3 relative" data-testid={`timeline-enc-${enc.id}`}>
            <div className={`z-10 w-4 h-4 rounded-full border-2 shrink-0 mt-1 ${
              enc.status === "completed" ? "bg-green-500 border-green-500" :
              enc.status === "cancelled" ? "bg-red-400 border-red-400" :
              "bg-blue-500 border-blue-500"
            }`} />
            <div className={`flex-1 rounded-lg border p-3 mb-2 ${
              enc.status === "cancelled" ? "opacity-50" : ""
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass}`}>
                  {ENCOUNTER_TYPE_LABELS[enc.encounterType] ?? enc.encounterType}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <StatusIcon className="h-2.5 w-2.5" />
                  {ENCOUNTER_STATUS_LABELS[enc.status]?.label ?? enc.status}
                </Badge>
                {enc.departmentName && (
                  <span className="text-[10px] text-muted-foreground">{enc.departmentName}</span>
                )}
                {enc.doctorName && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Stethoscope className="h-2.5 w-2.5" />{enc.doctorName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {fmtDate(enc.startedAt, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                </span>
                {enc.endedAt && (
                  <span>← {fmtDate(enc.endedAt, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                )}
                <span className="font-mono">{enc.totals.lineCount} بند • {fmtMoney(enc.totals.net)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const EncounterLinesTable = memo(function EncounterLinesTable({ lines }: { lines: EncounterLineSummary[] }) {
  if (lines.length === 0) return (
    <div className="text-center py-6 text-muted-foreground text-sm">لا توجد بنود</div>
  );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
            <th className="p-2 text-right w-6">#</th>
            <th className="p-2 text-right">النوع</th>
            <th className="p-2 text-right">البيان</th>
            <th className="p-2 text-center">الكمية</th>
            <th className="p-2 text-center">السعر</th>
            <th className="p-2 text-center">الخصم</th>
            <th className="p-2 text-center font-semibold">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-enc-line-${line.id}`}>
              <td className="p-2 text-xs text-muted-foreground text-center">{idx + 1}</td>
              <td className="p-2">
                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${LINE_CLASS[line.lineType] ?? ""}`}>
                  {LINE_TYPE_LABELS[line.lineType] ?? line.lineType}
                </Badge>
              </td>
              <td className="p-2 text-sm max-w-[200px] truncate" title={line.description}>{line.description}</td>
              <td className="p-2 text-center font-mono text-sm">{fmtQty(line.quantity)}</td>
              <td className="p-2 text-center font-mono text-sm">{fmtMoney(line.unitPrice)}</td>
              <td className="p-2 text-center font-mono text-sm text-purple-600">
                {parseFloat(line.discountAmount) > 0 ? `(${fmtMoney(line.discountAmount)})` : "—"}
              </td>
              <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(line.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 border-t-2 text-sm font-semibold">
            <td className="p-2" colSpan={3}>الإجمالي</td>
            <td className="p-2" colSpan={2}></td>
            <td className="p-2 text-center font-mono text-purple-600">
              ({fmtMoney(lines.reduce((s, l) => s + parseFloat(l.discountAmount || "0"), 0))})
            </td>
            <td className="p-2 text-center font-mono">
              {fmtMoney(lines.reduce((s, l) => s + parseFloat(l.totalPrice || "0"), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
});

export const EncounterPaymentsView = memo(function EncounterPaymentsView({
  payments,
}: {
  payments: VisitInvoiceSummary["payments"];
}) {
  if (payments.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">لا توجد مدفوعات</div>
  );
  const total = payments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-1.5">
        <Banknote className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">إجمالي المدفوعات: {fmtMoney(total)}</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <th className="p-2.5 text-right">التاريخ</th>
              <th className="p-2.5 text-center">المبلغ</th>
              <th className="p-2.5 text-right">طريقة الدفع</th>
              <th className="p-2.5 text-right">الخزنة</th>
              <th className="p-2.5 text-right">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-enc-pay-${p.id}`}>
                <td className="p-2.5 text-xs text-muted-foreground">{fmtDate(p.paymentDate)}</td>
                <td className="p-2.5 text-center font-mono font-semibold text-green-600">{fmtMoney(p.amount)}</td>
                <td className="p-2.5">
                  <Badge variant="outline" className={`text-xs ${PAY_METHOD_CLASS[p.paymentMethod] ?? ""}`}>
                    {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                  </Badge>
                </td>
                <td className="p-2.5 text-sm">{p.treasuryName ?? "—"}</td>
                <td className="p-2.5 text-xs text-muted-foreground">{p.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export const EncounterBreakdownView = memo(function EncounterBreakdownView({
  summary, visitId, patientId, admissionId, onFinalize, isFinalizePending,
}: {
  summary: VisitInvoiceSummary;
  visitId: string;
  patientId: string;
  admissionId?: string;
  onFinalize: () => void;
  isFinalizePending: boolean;
}) {
  const [activeEnc, setActiveEnc] = useState<string>("__all__");

  const outpatientVisitId = !admissionId ? visitId : undefined;
  const { data: livePayments, isLoading: paymentsLoading } = usePaymentsList({
    patientId,
    admissionId,
    visitId: outpatientVisitId,
    refetchInterval: summary.invoice?.isFinalClosed ? false : 30_000,
  });

  const normalizedPayments: VisitInvoiceSummary["payments"] = (livePayments ?? summary.payments).map((p: any) => ({
    id:            p.id,
    amount:        String(p.amount ?? "0"),
    paymentMethod: p.payment_method ?? p.paymentMethod ?? "",
    treasuryId:    p.treasury_id   ?? p.treasuryId   ?? null,
    treasuryName:  p.treasury_name ?? p.treasuryName  ?? null,
    notes:         p.notes         ?? null,
    paymentDate:   p.payment_date  ?? p.paymentDate   ?? "",
    createdAt:     String(p.created_at ?? p.createdAt ?? ""),
  }));

  const paymentsCount = livePayments ? livePayments.length : summary.payments.length;

  const encounterTabs = useMemo(() => {
    const tabs: Array<{ value: string; label: string; count: number; net: number }> = [
      { value: "__all__", label: "الكل", count: summary.totals.lineCount, net: summary.totals.net },
    ];
    for (const enc of summary.encounters) {
      tabs.push({
        value: enc.id,
        label: `${ENCOUNTER_TYPE_LABELS[enc.encounterType] ?? enc.encounterType}${enc.departmentName ? ` — ${enc.departmentName}` : ""}`,
        count: enc.totals.lineCount,
        net: enc.totals.net,
      });
    }
    if (summary.unlinkedLines.length > 0) {
      tabs.push({
        value: "__unlinked__",
        label: "بدون مقابلة",
        count: summary.unlinkedLines.length,
        net: summary.unlinkedLines.reduce((s, l) => s + parseFloat(l.totalPrice || "0"), 0),
      });
    }
    return tabs;
  }, [summary]);

  const activeLines = useMemo(() => {
    if (activeEnc === "__all__") {
      return summary.encounters.flatMap(e => e.lines).concat(summary.unlinkedLines);
    }
    if (activeEnc === "__unlinked__") return summary.unlinkedLines;
    const enc = summary.encounters.find(e => e.id === activeEnc);
    return enc?.lines ?? [];
  }, [activeEnc, summary]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:w-48 shrink-0 flex flex-col gap-3">
          <div className="bg-slate-50 border rounded-xl p-4 flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">ملخص الزيارة</p>
            <FinRow label="إجمالي" value={summary.totals.gross} />
            <FinRow label="الخصم" value={summary.totals.discount} muted />
            <FinRow label="الصافي" value={summary.totals.net} highlight border />
            <div className="my-2 border-t border-slate-200" />
            <FinRow label="المدفوع" value={summary.totals.paid} />
            <FinRow label="الباقي" value={summary.totals.remaining} />
            <div className="mt-2 text-[10px] text-muted-foreground">
              {summary.totals.encounterCount} مقابلة • {summary.totals.lineCount} بند
            </div>
          </div>

          {summary.departmentBreakdown.length > 1 && (
            <div className="bg-slate-50 border rounded-xl p-3 flex flex-col gap-1">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">حسب القسم</p>
              {summary.departmentBreakdown.map((dept, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground truncate max-w-[80px]">{dept.departmentName ?? "—"}</span>
                  <span className="font-mono">{fmtMoney(dept.net)}</span>
                </div>
              ))}
            </div>
          )}

          <FinalizationPanel
            readiness={summary.readiness}
            invoiceStatus={summary.invoice?.status}
            isFinalClosed={summary.invoice?.isFinalClosed ?? false}
            onFinalize={onFinalize}
            isPending={isFinalizePending}
            totals={summary.totals}
          />
        </div>

        <div className="flex-1 min-w-0">
          <Tabs defaultValue="encounters" dir="rtl">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="encounters" className="text-xs px-3" data-testid="tab-encounters">
                المقابلات
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs px-3" data-testid="tab-timeline">
                الجدول الزمني
              </TabsTrigger>
              <TabsTrigger value="enc-payments" className="text-xs px-3" data-testid="tab-enc-payments">
                المدفوعات ({paymentsCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="encounters" className="mt-0">
              <div className="flex flex-col gap-3">
                {encounterTabs.length > 2 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {encounterTabs.map(tab => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveEnc(tab.value)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          activeEnc === tab.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border"
                        }`}
                        data-testid={`btn-enc-filter-${tab.value}`}
                      >
                        {tab.label}
                        <span className="mr-1 opacity-70">({tab.count})</span>
                      </button>
                    ))}
                  </div>
                )}

                <EncounterLinesTable lines={activeLines} />
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <EncounterTimeline encounters={summary.encounters} />
            </TabsContent>

            <TabsContent value="enc-payments" className="mt-0">
              {paymentsLoading && !livePayments ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <EncounterPaymentsView payments={normalizedPayments} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
});
