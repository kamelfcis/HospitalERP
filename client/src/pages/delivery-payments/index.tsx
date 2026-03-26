/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة تحصيل فواتير التوصيل المنزلي
 *  Delivery Payment Collection
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation }               from "@tanstack/react-query";
import { useToast }                            from "@/hooks/use-toast";
import { apiRequestJson, queryClient }         from "@/lib/queryClient";
import { formatCurrency, formatDateShort }     from "@/lib/formatters";
import { Input }                               from "@/components/ui/input";
import { Button }                              from "@/components/ui/button";
import { Badge }                               from "@/components/ui/badge";
import { Checkbox }                            from "@/components/ui/checkbox";
import { Label }                               from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Truck, RefreshCw, Save, FileText, Hash, Loader2,
  AlertTriangle, CircleDollarSign, ChevronUp, ChevronDown,
} from "lucide-react";
import { useTreasurySelector }                 from "@/hooks/use-treasury-selector";
import { TreasurySelector }                    from "@/components/shared/TreasurySelector";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveryInvoiceRow {
  invoiceId:     string;
  invoiceNumber: number;
  invoiceDate:   string;
  netTotal:      string;
  totalPaid:     string;
  remaining:     string;
  status:        string;
  customerName:  string | null;
  pharmacyId:    string | null;
}

interface InvoicesResult {
  rows:             DeliveryInvoiceRow[];
  totalNetInvoiced: string;
  totalPaid:        string;
  totalRemaining:   string;
}

interface ReportRow {
  receiptId:     string;
  receiptNumber: number;
  receiptDate:   string;
  totalAmount:   string;
  paymentMethod: string;
  reference:     string | null;
  createdBy:     string | null;
  cashierName:   string | null;
  invoiceCount:  number;
}

type FilterStatus = "unpaid" | "paid" | "all";
type SortKey      = "invoiceNumber" | "invoiceDate" | "netTotal" | "totalPaid" | "remaining";
type SortDir      = "asc" | "desc";
type ActiveTab    = "payment" | "report";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

const PM_LABELS: Record<string, string> = {
  cash: "نقدي", bank: "بنك", card: "بطاقة", check: "شيك",
};

function SortHead({
  label, sortKey: sk, current, dir, onSort,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sk;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap text-right px-2"
      onClick={() => onSort(sk)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? dir === "asc"
            ? <ChevronUp   className="h-3 w-3 text-blue-600" />
            : <ChevronDown className="h-3 w-3 text-blue-600" />
          : <ChevronDown className="h-3 w-3 opacity-20" />
        }
      </span>
    </TableHead>
  );
}

function SummaryStrip({ data }: { data: InvoicesResult }) {
  return (
    <div className="flex items-center gap-6 bg-muted/40 border rounded-md px-4 py-2 text-[12px] flex-wrap">
      <span className="flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5 text-emerald-600" />
        <span className="font-semibold text-emerald-700">فواتير التوصيل المنزلي</span>
      </span>
      <span className="flex items-center gap-1">
        <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
        إجمالي الفواتير:
        <strong>{formatCurrency(data.totalNetInvoiced)}</strong>
      </span>
      <span className="flex items-center gap-1 text-green-700">
        <CircleDollarSign className="h-3.5 w-3.5" />
        محصّل:
        <strong>{formatCurrency(data.totalPaid)}</strong>
      </span>
      <span className="flex items-center gap-1 font-bold text-red-600">
        {parseFloat(data.totalRemaining) > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
        متبقّي:
        <span className="text-base">{formatCurrency(data.totalRemaining)}</span>
      </span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DeliveryPayments() {
  const { toast } = useToast();

  const treasury = useTreasurySelector();

  const [receiptDate,   setReceiptDate]   = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference,     setReference]     = useState("");
  const [notes,         setNotes]         = useState("");
  const [totalAmount,   setTotalAmount]   = useState("");

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("unpaid");
  const [sortKey,      setSortKey]      = useState<SortKey>("invoiceDate");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [amounts,      setAmounts]      = useState<Record<string, string>>({});
  const [activeTab,    setActiveTab]    = useState<ActiveTab>("payment");

  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowIds     = useRef<string[]>([]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: invoicesData,
    isLoading,
    refetch: refetchInvoices,
  } = useQuery<InvoicesResult>({
    queryKey: ["/api/delivery-payments/invoices", filterStatus],
    queryFn:  async () => {
      const r = await fetch(`/api/delivery-payments/invoices?filter=${filterStatus}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب الفواتير");
      return r.json();
    },
  });

  const {
    data: reportData,
    refetch: refetchReport,
    isLoading: reportLoading,
  } = useQuery<ReportRow[]>({
    queryKey: ["/api/delivery-payments/report"],
    queryFn:  async () => {
      const r = await fetch("/api/delivery-payments/report", { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب التقرير");
      return r.json();
    },
    enabled: activeTab === "report",
  });

  // ── ترتيب الفواتير ────────────────────────────────────────────────────────
  const invoices = useMemo(() => {
    const raw = invoicesData?.rows ?? [];
    return [...raw].sort((a, b) => {
      let va: string | number = a[sortKey as keyof typeof a] as string;
      let vb: string | number = b[sortKey as keyof typeof b] as string;
      if (sortKey !== "invoiceDate") { va = parseFloat(va as string); vb = parseFloat(vb as string); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoicesData, sortKey, sortDir]);

  // ── مجموع المحدد ─────────────────────────────────────────────────────────
  const selectedRemaining = useMemo(() => {
    if (selected.size === 0) return null;
    return invoices
      .filter((inv) => selected.has(inv.invoiceId))
      .reduce((s, inv) => s + parseFloat(inv.remaining), 0);
  }, [invoices, selected]);

  // ── توزيع تلقائي ─────────────────────────────────────────────────────────
  const autoDistribute = useCallback(() => {
    const total = parseFloat(totalAmount);
    if (!total || !invoices.length) return;
    let rem = total;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      if (rem <= 0) { next[inv.invoiceId] = "0"; continue; }
      const needed = parseFloat(inv.remaining);
      const give   = Math.min(needed, rem);
      next[inv.invoiceId] = give > 0 ? give.toFixed(2) : "0";
      rem -= give;
    }
    setAmounts(next);
  }, [totalAmount, invoices]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const next = rowIds.current[idx + 1];
      if (next) amountRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = rowIds.current[idx - 1];
      if (prev) amountRefs.current[prev]?.focus();
    }
  };

  // ── مجموع التوزيع ─────────────────────────────────────────────────────────
  const distributedTotal = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [amounts]
  );

  // ── حفظ ───────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(amounts)
        .map(([invoiceId, v]) => ({ invoiceId, amountPaid: parseFloat(v) || 0 }))
        .filter((l) => l.amountPaid > 0);

      return apiRequestJson<{ receiptId: string; receiptNumber: number }>(
        "POST", "/api/delivery-payments/receipts",
        {
          receiptDate,
          totalAmount: parseFloat(totalAmount),
          paymentMethod,
          reference:   reference.trim() || null,
          notes:       notes.trim() || null,
          glAccountId: treasury.selectedGlAccountId,
          shiftId:     null,
          lines,
        }
      );
    },
    onSuccess: (data) => {
      toast({ title: `تم حفظ إيصال التوصيل #${data.receiptNumber} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-payments/report"] });
      setAmounts({}); setTotalAmount(""); setReference(""); setSelected(new Set());
    },
    onError: (e: any) => toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" }),
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const canSave =
    parseFloat(totalAmount) > 0 &&
    distributedTotal > 0 &&
    Math.abs(distributedTotal - parseFloat(totalAmount)) < 0.02 &&
    !!treasury.selectedGlAccountId &&
    !saveMutation.isPending;

  rowIds.current = invoices.map((inv) => inv.invoiceId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-4 max-w-6xl mx-auto" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-emerald-600" />
          <h1 className="text-lg font-bold">تحصيل فواتير التوصيل المنزلي</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "payment" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("payment")}
            className="text-xs"
          >
            تحصيل
          </Button>
          <Button
            variant={activeTab === "report" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("report")}
            className="text-xs"
          >
            <FileText className="h-3 w-3 ml-1" />
            تقرير
          </Button>
        </div>
      </div>

      {/* ── ملخص الفواتير ───────────────────────────────────────────────── */}
      {invoicesData && <SummaryStrip data={invoicesData} />}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "payment" && (
        <>
          {/* ── Controls Bar ─────────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap text-[12px] border rounded-md bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1">
              <Label className="text-xs">التاريخ:</Label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="peachtree-input w-[130px] h-7"
                data-testid="input-receipt-date"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">طريقة الدفع:</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-7 w-[110px] text-xs" data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="check">شيك</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* اختيار الوردية (الخزنة) */}
            <TreasurySelector {...treasury} />

            <div className="flex items-center gap-1">
              <Label className="text-xs">المرجع:</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم التسليم"
                className="h-7 w-[140px] text-xs"
                data-testid="input-reference"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs">الإجمالي:</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="المبلغ"
                className="h-7 w-[100px] text-xs text-left ltr"
                data-testid="input-total-amount"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={autoDistribute}
              disabled={!totalAmount || !invoices.length}
            >
              توزيع تلقائي
            </Button>
            <div className="flex items-center gap-1">
              <Label className="text-xs">عرض:</Label>
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as FilterStatus)}
              >
                <SelectTrigger className="h-7 w-[100px] text-xs" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">غير محصّل</SelectItem>
                  <SelectItem value="paid">محصّل</SelectItem>
                  <SelectItem value="all">الكل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => refetchInvoices()}
            >
              <RefreshCw className="h-3 w-3 ml-1" />
              تحديث
            </Button>
          </div>

          {/* ── Table ───────────────────────────────────────────────────── */}
          <div className="border rounded-md overflow-auto">
            <Table className="text-[12px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 px-2">
                    <Checkbox
                      checked={selected.size === invoices.length && invoices.length > 0}
                      onCheckedChange={(v) => {
                        setSelected(v ? new Set(invoices.map((i) => i.invoiceId)) : new Set());
                      }}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <SortHead label="#"          sortKey="invoiceNumber" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="التاريخ"   sortKey="invoiceDate"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right px-2">العميل</TableHead>
                  <SortHead label="المبلغ"    sortKey="netTotal"      current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="محصّل"     sortKey="totalPaid"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="متبقّي"    sortKey="remaining"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right px-2">مبلغ التحصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      لا توجد فواتير توصيل
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv, idx) => {
                  const rem      = parseFloat(inv.remaining);
                  const paid     = parseFloat(inv.totalPaid);
                  const isSel    = selected.has(inv.invoiceId);
                  const amtVal   = amounts[inv.invoiceId] ?? "";
                  return (
                    <TableRow
                      key={inv.invoiceId}
                      className={isSel ? "bg-emerald-50 dark:bg-emerald-950/20" : undefined}
                      data-testid={`row-delivery-invoice-${inv.invoiceId}`}
                    >
                      <TableCell className="px-2">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={(v) => {
                            setSelected((s) => {
                              const n = new Set(s);
                              v ? n.add(inv.invoiceId) : n.delete(inv.invoiceId);
                              return n;
                            });
                          }}
                          data-testid={`checkbox-inv-${inv.invoiceId}`}
                        />
                      </TableCell>
                      <TableCell className="px-2 font-mono">
                        <span className="flex items-center gap-1">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          {inv.invoiceNumber}
                        </span>
                      </TableCell>
                      <TableCell className="px-2">{formatDateShort(inv.invoiceDate)}</TableCell>
                      <TableCell className="px-2 text-muted-foreground">
                        {inv.customerName ?? "—"}
                      </TableCell>
                      <TableCell className="px-2 text-right font-medium">
                        {formatCurrency(inv.netTotal)}
                      </TableCell>
                      <TableCell className="px-2 text-right text-green-700">
                        {paid > 0 ? formatCurrency(inv.totalPaid) : "—"}
                      </TableCell>
                      <TableCell className="px-2 text-right">
                        {rem > 0
                          ? <span className="text-red-600 font-semibold">{formatCurrency(inv.remaining)}</span>
                          : <Badge variant="outline" className="text-[9px] text-green-700">مكتمل</Badge>
                        }
                      </TableCell>
                      <TableCell className="px-2 w-[110px]">
                        <Input
                          ref={(el) => { amountRefs.current[inv.invoiceId] = el; }}
                          type="number"
                          min={0}
                          step={0.01}
                          value={amtVal}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.invoiceId]: e.target.value }))}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0.00"
                          className="h-7 text-xs text-left ltr w-[100px]"
                          data-testid={`input-amount-${inv.invoiceId}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {invoices.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold text-[11px] px-2">
                      الإجمالي ({invoices.length} فاتورة)
                    </TableCell>
                    <TableCell className="text-right font-bold text-[11px] px-2">
                      {formatCurrency(invoicesData?.totalNetInvoiced ?? "0")}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-700 text-[11px] px-2">
                      {formatCurrency(invoicesData?.totalPaid ?? "0")}
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 text-[11px] px-2">
                      {formatCurrency(invoicesData?.totalRemaining ?? "0")}
                    </TableCell>
                    <TableCell className="text-right font-bold text-[11px] px-2">
                      {distributedTotal > 0 && (
                        <span className={
                          Math.abs(distributedTotal - parseFloat(totalAmount || "0")) < 0.02
                            ? "text-green-700"
                            : "text-orange-600"
                        }>
                          {distributedTotal.toFixed(2)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>

          {/* ── ملخص السطر السفلي + حفظ ─────────────────────────────────── */}
          {selectedRemaining !== null && (
            <div className="text-[11px] text-muted-foreground bg-muted/30 border rounded px-3 py-1.5 flex gap-4">
              <span>محدد: <strong>{selected.size}</strong> فاتورة</span>
              <span>مجموع المتبقي: <strong className="text-red-600">{formatCurrency(String(selectedRemaining.toFixed(2)))}</strong></span>
            </div>
          )}

          {parseFloat(totalAmount || "0") > 0 && (
            <div className="text-[11px] text-muted-foreground bg-muted/30 border rounded px-3 py-1.5 flex gap-4 items-center">
              <span>الإجمالي المُدخَل: <strong>{formatCurrency(totalAmount)}</strong></span>
              <span>الموزّع: <strong className={
                Math.abs(distributedTotal - parseFloat(totalAmount)) < 0.02
                  ? "text-green-700"
                  : "text-orange-600"
              }>{distributedTotal.toFixed(2)}</strong></span>
              {Math.abs(distributedTotal - parseFloat(totalAmount)) > 0.02 && (
                <span className="text-orange-600">
                  <AlertTriangle className="h-3 w-3 inline ml-0.5" />
                  الفرق: {(parseFloat(totalAmount) - distributedTotal).toFixed(2)}
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
              className="text-xs"
              data-testid="button-save-receipt"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
                : <Save className="h-3 w-3 ml-1" />
              }
              حفظ إيصال التحصيل
            </Button>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "report" && (
        <div className="border rounded-md overflow-auto">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
            <span className="text-[12px] font-semibold">إيصالات التوصيل</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetchReport()}>
              <RefreshCw className="h-3 w-3 ml-1" />
              تحديث
            </Button>
          </div>
          <Table className="text-[12px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-right px-2">#</TableHead>
                <TableHead className="text-right px-2">التاريخ</TableHead>
                <TableHead className="text-right px-2">المبلغ</TableHead>
                <TableHead className="text-right px-2">طريقة الدفع</TableHead>
                <TableHead className="text-right px-2">المرجع</TableHead>
                <TableHead className="text-right px-2">الكاشير</TableHead>
                <TableHead className="text-right px-2">عدد الفواتير</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </TableCell>
                </TableRow>
              )}
              {!reportLoading && (!reportData || reportData.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    لا توجد إيصالات
                  </TableCell>
                </TableRow>
              )}
              {reportData?.map((r) => (
                <TableRow key={r.receiptId} data-testid={`row-receipt-${r.receiptId}`}>
                  <TableCell className="px-2 font-mono">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      {r.receiptNumber}
                    </span>
                  </TableCell>
                  <TableCell className="px-2">{formatDateShort(r.receiptDate)}</TableCell>
                  <TableCell className="px-2 text-right font-semibold">
                    {formatCurrency(r.totalAmount)}
                  </TableCell>
                  <TableCell className="px-2">
                    <Badge variant="outline" className="text-[9px]">
                      {PM_LABELS[r.paymentMethod] ?? r.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 text-muted-foreground">
                    {r.reference ?? "—"}
                  </TableCell>
                  <TableCell className="px-2">{r.cashierName ?? "—"}</TableCell>
                  <TableCell className="px-2 text-center">
                    <Badge variant="secondary" className="text-[9px]">{r.invoiceCount}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
