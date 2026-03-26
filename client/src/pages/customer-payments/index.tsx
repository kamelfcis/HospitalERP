/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة تحصيل الآجل — Customer Credit Payments
 *  نفس مفهوم سداد الموردين: Combobox → BalanceStrip → Table → حفظ
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation }                   from "@tanstack/react-query";
import { useToast }                                from "@/hooks/use-toast";
import { apiRequestJson, queryClient }             from "@/lib/queryClient";
import { formatCurrency, formatDateShort }         from "@/lib/formatters";
import { Input }                                   from "@/components/ui/input";
import { Button }                                  from "@/components/ui/button";
import { Badge }                                   from "@/components/ui/badge";
import { Checkbox }                                from "@/components/ui/checkbox";
import { Label }                                   from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  CreditCard, AlertTriangle, FileText, Loader2, Save,
  RefreshCw, CircleDollarSign, Hash, ChevronUp, ChevronDown, User,
} from "lucide-react";
import {
  CreditCustomerCombobox,
  type CreditCustomer,
} from "@/components/shared/CreditCustomerCombobox";
import { useTreasurySelector }                     from "@/hooks/use-treasury-selector";
import { TreasurySelector }                        from "@/components/shared/TreasurySelector";
import type { CustomerCreditInvoiceRow }           from "@shared/schema/invoicing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BalanceResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  totalInvoiced:  string;
  totalReturns:   string;
  totalPaid:      string;
  currentBalance: string;
}

interface ReportRow extends CustomerCreditInvoiceRow {
  receiptId:   string | null;
  receiptDate: string | null;
  receiptRef:  string | null;
}

interface ReportResult {
  rows:             ReportRow[];
  totalNetInvoiced: string;
  totalPaid:        string;
  totalRemaining:   string;
}

type SortKey  = "invoiceNumber" | "invoiceDate" | "netTotal" | "totalPaid" | "remaining";
type SortDir  = "asc" | "desc";
type ActiveTab = "payment" | "report";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

// ─── SortHead (مشترك بالمفهوم مع supplier-payments) ─────────────────────────
function SortHead({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap text-right px-2"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? (dir === "asc"
            ? <ChevronUp   className="h-3 w-3 text-blue-600" />
            : <ChevronDown className="h-3 w-3 text-blue-600" />)
          : <ChevronDown className="h-3 w-3 opacity-20" />
        }
      </span>
    </TableHead>
  );
}

// ─── BalanceStrip ──────────────────────────────────────────────────────────────
function BalanceStrip({ balance }: { balance: BalanceResult }) {
  const bal = parseFloat(balance.currentBalance);
  return (
    <div className="flex items-center gap-6 bg-muted/40 border rounded-md px-4 py-2 text-[12px] flex-wrap">
      <span className="flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold">{balance.name}</span>
        {balance.phone && (
          <span className="text-muted-foreground">• {balance.phone}</span>
        )}
      </span>
      <span className="flex items-center gap-1">
        <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
        إجمالي الفواتير:
        <strong>{formatCurrency(balance.totalInvoiced)}</strong>
      </span>
      {parseFloat(balance.totalReturns) > 0 && (
        <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
          <CircleDollarSign className="h-3.5 w-3.5" />
          مرتجع:
          <strong>{formatCurrency(balance.totalReturns)}</strong>
        </span>
      )}
      <span className="flex items-center gap-1">
        <CircleDollarSign className="h-3.5 w-3.5 text-green-600" />
        محصّل:
        <strong className="text-green-700">{formatCurrency(balance.totalPaid)}</strong>
      </span>
      <span className={cx(
        "flex items-center gap-1 font-bold",
        bal > 0 ? "text-red-600" : "text-green-600"
      )}>
        {bal > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
        الرصيد المستحق:
        <span className="text-base">{formatCurrency(balance.currentBalance)}</span>
      </span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CustomerPayments() {
  const { toast } = useToast();

  // ── اختيار العميل ─────────────────────────────────────────────────────────
  const [customerId,   setCustomerId]   = useState("");
  const [customerName, setCustomerName] = useState("");

  // ── hook الخزنة / الوردية ─────────────────────────────────────────────────
  const treasury = useTreasurySelector();

  // ── بيانات الإيصال ────────────────────────────────────────────────────────
  const [receiptDate,    setReceiptDate]    = useState(today());
  const [paymentMethod,  setPaymentMethod]  = useState("cash");
  const [reference,      setReference]      = useState("");
  const [notes,          setNotes]          = useState("");
  const [totalAmount,    setTotalAmount]    = useState("");

  // ── حالة الجدول ──────────────────────────────────────────────────────────
  const [filterStatus,   setFilterStatus]   = useState<"unpaid" | "paid" | "all">("unpaid");
  const [sortKey,        setSortKey]        = useState<SortKey>("invoiceDate");
  const [sortDir,        setSortDir]        = useState<SortDir>("asc");
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [amounts,        setAmounts]        = useState<Record<string, string>>({});
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("payment");

  // refs للملاحة بلوحة المفاتيح
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowIds     = useRef<string[]>([]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: balanceData, refetch: refetchBalance } = useQuery<BalanceResult>({
    queryKey: ["/api/customer-payments/balance", customerId],
    queryFn:  async () => {
      const r = await fetch(`/api/customer-payments/balance/${customerId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب الرصيد");
      return r.json();
    },
    enabled: !!customerId,
  });

  const { data: nextNumData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/customer-payments/next-number"],
    queryFn:  async () => {
      const r = await fetch("/api/customer-payments/next-number", { credentials: "include" });
      return r.json();
    },
    enabled: !!customerId,
  });

  const { data: invoicesData, refetch: refetchInvoices } = useQuery<{ invoices: CustomerCreditInvoiceRow[] }>({
    queryKey: ["/api/customer-payments/invoices", customerId, filterStatus],
    queryFn:  async () => {
      const r = await fetch(`/api/customer-payments/invoices/${customerId}?status=${filterStatus}`, { credentials: "include" });
      return r.json();
    },
    enabled: !!customerId,
  });

  const { data: reportData, refetch: refetchReport } = useQuery<ReportResult>({
    queryKey: ["/api/customer-payments/report", customerId, filterStatus],
    queryFn:  async () => {
      const r = await fetch(`/api/customer-payments/report/${customerId}?status=${filterStatus}`, { credentials: "include" });
      return r.json();
    },
    enabled: !!customerId && activeTab === "report",
  });


  // ── ترتيب الفواتير ────────────────────────────────────────────────────────
  const invoices = useMemo(() => {
    const raw = invoicesData?.invoices ?? [];
    return [...raw].sort((a, b) => {
      let va: string | number = a[sortKey as keyof typeof a] as string;
      let vb: string | number = b[sortKey as keyof typeof b] as string;
      if (sortKey !== "invoiceDate") { va = parseFloat(va as string); vb = parseFloat(vb as string); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [invoicesData, sortKey, sortDir]);

  // ── رصيد المحدد (استرشادي فقط) ───────────────────────────────────────────
  const selectedRemaining = useMemo(() => {
    if (selected.size === 0) return null;
    return invoices
      .filter((inv) => selected.has(inv.invoiceId))
      .reduce((s, inv) => s + parseFloat(inv.remaining), 0);
  }, [invoices, selected]);

  // ── توزيع تلقائي للمبلغ ───────────────────────────────────────────────────
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

  // ── ترتيب الأعمدة ─────────────────────────────────────────────────────────
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  // ── ملاحة لوحة المفاتيح ───────────────────────────────────────────────────
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

  // ── حفظ الإيصال ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(amounts)
        .map(([invoiceId, v]) => ({ invoiceId, amountPaid: parseFloat(v) || 0 }))
        .filter((l) => l.amountPaid > 0);

      const effectiveShiftId = treasury.selectedShiftId === "none" ? null : treasury.selectedShiftId;

      return apiRequestJson<{ receiptId: string; receiptNumber: number }>(
        "POST", "/api/customer-payments",
        {
          customerId,
          receiptDate,
          totalAmount: parseFloat(totalAmount),
          paymentMethod,
          reference:    reference.trim() || null,
          notes:        notes.trim() || null,
          glAccountId:  treasury.selectedGlAccountId,
          shiftId:      effectiveShiftId,
          lines,
        }
      );
    },
    onSuccess: (data) => {
      toast({ title: `تم حفظ إيصال التحصيل #${data.receiptNumber} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/balance", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/invoices", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/report",  customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/next-number"] });
      setAmounts({}); setTotalAmount(""); setReference(""); setSelected(new Set());
    },
    onError: (e: any) => toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" }),
  });

  // ── خيار العميل ────────────────────────────────────────────────────────────
  const handleCustomerChange = (id: string, c: CreditCustomer) => {
    setCustomerId(id);
    setCustomerName(c.name);
    setAmounts({});
    setSelected(new Set());
    setTotalAmount("");
  };

  // ── مبلغ التوزيع الكلي ───────────────────────────────────────────────────
  const distributedTotal = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [amounts]
  );

  rowIds.current = invoices.map((inv) => inv.invoiceId);

  // ── الواجهة ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-4 max-w-6xl mx-auto" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-bold">تحصيل الآجل</h1>
          {nextNumData && customerId && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Hash className="h-3 w-3" />
              إيصال #{nextNumData.nextNumber}
            </Badge>
          )}
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

      {/* ── اختيار العميل ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-xs font-semibold">العميل:</Label>
        <CreditCustomerCombobox
          value={customerId}
          onChange={handleCustomerChange}
        />
        {customerId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { refetchBalance(); refetchInvoices(); }}
          >
            <RefreshCw className="h-3 w-3 ml-1" />
            تحديث
          </Button>
        )}
      </div>

      {/* ── BalanceStrip ───────────────────────────────────────────────── */}
      {balanceData && <BalanceStrip balance={balanceData} />}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "payment" && customerId && (
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
                placeholder="رقم الشيك / تحويل"
                className="h-7 w-[150px] text-xs"
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
                onValueChange={(v) => setFilterStatus(v as "unpaid" | "paid" | "all")}
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
                  <SortHead label="#"         sortKey="invoiceNumber" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="التاريخ"  sortKey="invoiceDate"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="المبلغ"   sortKey="netTotal"      current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="محصّل"    sortKey="totalPaid"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="متبقّي"   sortKey="remaining"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right px-2">مبلغ التحصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      لا توجد فواتير
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv, idx) => {
                  const isSelected = selected.has(inv.invoiceId);
                  const remaining  = parseFloat(inv.remaining);
                  const isPaid     = remaining <= 0.005;
                  return (
                    <TableRow
                      key={inv.invoiceId}
                      className={cx(
                        isSelected && "bg-blue-50/50 dark:bg-blue-900/10",
                        isPaid     && "opacity-60"
                      )}
                      data-testid={`row-invoice-${inv.invoiceId}`}
                    >
                      <TableCell className="px-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              v ? next.add(inv.invoiceId) : next.delete(inv.invoiceId);
                              return next;
                            });
                          }}
                          data-testid={`checkbox-invoice-${inv.invoiceId}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums px-2">{inv.invoiceNumber}</TableCell>
                      <TableCell className="tabular-nums px-2">{formatDateShort(inv.invoiceDate)}</TableCell>
                      <TableCell className="tabular-nums text-left px-2">{formatCurrency(inv.netTotal)}</TableCell>
                      <TableCell className="tabular-nums text-left text-green-700 px-2">{formatCurrency(inv.totalPaid)}</TableCell>
                      <TableCell className={cx(
                        "tabular-nums text-left px-2 font-semibold",
                        remaining > 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {formatCurrency(inv.remaining)}
                      </TableCell>
                      <TableCell className="px-2">
                        <Input
                          ref={(el) => { amountRefs.current[inv.invoiceId] = el; }}
                          type="number"
                          min={0}
                          max={remaining}
                          step={0.01}
                          value={amounts[inv.invoiceId] ?? ""}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.invoiceId]: e.target.value }))}
                          onKeyDown={(e) => handleKeyDown(e as any, idx)}
                          placeholder="0.00"
                          className="h-6 w-[90px] text-xs text-left ltr px-1"
                          disabled={isPaid}
                          data-testid={`input-amount-${inv.invoiceId}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {invoices.length > 0 && (
                <TableFooter>
                  {selected.size > 0 && selectedRemaining !== null && (
                    <TableRow className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                      <TableCell colSpan={5} className="px-2 text-xs">
                        المحدد ({selected.size} فاتورة) — إجمالي المتبقي:
                      </TableCell>
                      <TableCell className="tabular-nums text-left font-bold px-2" colSpan={2}>
                        {formatCurrency(selectedRemaining.toFixed(2))}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={6} className="px-2 text-left text-xs">
                      إجمالي الموزَّع:
                      <span className={cx(
                        "mr-2 text-sm",
                        totalAmount && Math.abs(distributedTotal - parseFloat(totalAmount)) > 0.01
                          ? "text-red-600"
                          : "text-green-600"
                      )}>
                        {formatCurrency(distributedTotal.toFixed(2))}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 text-left">
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || distributedTotal === 0}
                        className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                        data-testid="button-save-receipt"
                      >
                        {saveMutation.isPending
                          ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
                          : <Save className="h-3 w-3 ml-1" />}
                        حفظ الإيصال
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </>
      )}

      {/* ═════════════════════════ تاب التقرير ═════════════════════════ */}
      {activeTab === "report" && customerId && (
        <>
          <div className="flex items-center gap-3">
            <Label className="text-xs">فلتر:</Label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "unpaid" | "paid" | "all")}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">غير محصّل</SelectItem>
                <SelectItem value="paid">محصّل</SelectItem>
                <SelectItem value="all">الكل</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetchReport()}>
              <RefreshCw className="h-3 w-3 ml-1" />
              تحديث
            </Button>
          </div>

          {reportData && (
            <div className="border rounded-md overflow-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right px-2">#فاتورة</TableHead>
                    <TableHead className="text-right px-2">التاريخ</TableHead>
                    <TableHead className="text-right px-2">المبلغ</TableHead>
                    <TableHead className="text-right px-2">محصّل</TableHead>
                    <TableHead className="text-right px-2">متبقّي</TableHead>
                    <TableHead className="text-right px-2">تاريخ الإيصال</TableHead>
                    <TableHead className="text-right px-2">مرجع</TableHead>
                    <TableHead className="text-right px-2">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        لا توجد بيانات
                      </TableCell>
                    </TableRow>
                  )}
                  {reportData.rows.map((r) => {
                    const rem = parseFloat(r.remaining);
                    return (
                      <TableRow key={r.invoiceId} data-testid={`report-row-${r.invoiceId}`}>
                        <TableCell className="tabular-nums px-2">{r.invoiceNumber}</TableCell>
                        <TableCell className="tabular-nums px-2">{formatDateShort(r.invoiceDate)}</TableCell>
                        <TableCell className="tabular-nums text-left px-2">{formatCurrency(r.netTotal)}</TableCell>
                        <TableCell className="tabular-nums text-left text-green-700 px-2">{formatCurrency(r.totalPaid)}</TableCell>
                        <TableCell className={cx(
                          "tabular-nums text-left px-2",
                          rem > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"
                        )}>
                          {formatCurrency(r.remaining)}
                        </TableCell>
                        <TableCell className="tabular-nums px-2">
                          {r.receiptDate ? formatDateShort(r.receiptDate) : "-"}
                        </TableCell>
                        <TableCell className="px-2">{r.receiptRef ?? "-"}</TableCell>
                        <TableCell className="px-2">
                          {rem <= 0.005
                            ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px]">محصّل</Badge>
                            : <Badge variant="outline" className="text-[10px] text-orange-600">جزئي / معلق</Badge>
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={2} className="px-2">الإجمالي</TableCell>
                    <TableCell className="tabular-nums text-left px-2">{formatCurrency(reportData.totalNetInvoiced)}</TableCell>
                    <TableCell className="tabular-nums text-left text-green-700 px-2">{formatCurrency(reportData.totalPaid)}</TableCell>
                    <TableCell className="tabular-nums text-left text-red-600 px-2">{formatCurrency(reportData.totalRemaining)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </>
      )}

      {!customerId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-sm">اختر عميلاً من القائمة أعلاه لعرض فواتيره وتحصيلها</p>
        </div>
      )}
    </div>
  );
}
