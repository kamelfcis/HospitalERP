/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة تحصيل الآجل — Customer Credit Payments
 *  نفس مفهوم سداد الموردين: Combobox → BalanceStrip → Table → حفظ
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useMutation }                             from "@tanstack/react-query";
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
  RefreshCw, CircleDollarSign, Hash, ChevronUp, ChevronDown, User, Printer,
} from "lucide-react";
import {
  CreditCustomerCombobox,
  type CreditCustomer,
} from "@/components/shared/CreditCustomerCombobox";
import { useTreasurySelector }                     from "@/hooks/use-treasury-selector";
import { TreasurySelector }                        from "@/components/shared/TreasurySelector";
import {
  useCustomerPaymentsData,
  type BalanceResult,
  type CustomerStatementResult,
}                                                  from "./useCustomerPaymentsData";

type SortKey  = "invoiceNumber" | "invoiceDate" | "netTotal" | "totalPaid" | "remaining";
type SortDir  = "asc" | "desc";
type ActiveTab = "payment" | "statement";

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

  // ── كشف الحساب — dates ────────────────────────────────────────────────────
  const thisYear = new Date().getFullYear();
  const [stmtFrom, setStmtFrom] = useState(`${thisYear}-01-01`);
  const [stmtTo,   setStmtTo]   = useState(today());

  // ── API data (queries) ────────────────────────────────────────────────────
  const {
    balanceData, refetchBalance,
    nextNumData,
    rawInvoices, refetchInvoices,
    statementData, stmtLoading, refetchStatement,
  } = useCustomerPaymentsData({ customerId, filterStatus, activeTab, stmtFrom, stmtTo });

  // ── ترتيب الفواتير ────────────────────────────────────────────────────────
  const invoices = useMemo(() => {
    const raw = rawInvoices;
    return [...raw].sort((a, b) => {
      let va: string | number = a[sortKey as keyof typeof a] as string;
      let vb: string | number = b[sortKey as keyof typeof b] as string;
      if (sortKey !== "invoiceDate") { va = parseFloat(va as string); vb = parseFloat(vb as string); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rawInvoices, sortKey, sortDir]);

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
          shiftId:      null,
          lines,
        }
      );
    },
    onSuccess: (data) => {
      toast({ title: `تم حفظ إيصال التحصيل #${data.receiptNumber} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/balance", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/invoices", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-payments/statement", customerId] });
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
            variant={activeTab === "statement" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("statement")}
            className="text-xs"
            data-testid="tab-statement"
          >
            <FileText className="h-3 w-3 ml-1" />
            كشف الحساب
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

      {/* ═════════════════════════ تاب كشف الحساب ═════════════════════════ */}
      {activeTab === "statement" && customerId && (() => {
        const printDate = new Date().toLocaleDateString("ar-EG", {
          year: "numeric", month: "long", day: "numeric",
        });
        const balCls = (v: number) =>
          v > 0.005 ? "text-red-600 dark:text-red-400"
          : v < -0.005 ? "text-blue-600 dark:text-blue-400"
          : "text-green-600 dark:text-green-400";
        const srcLabel: Record<string, string> = {
          sales_invoice:    "فاتورة بيع",
          customer_receipt: "تحصيل",
        };
        return (
          <div className="flex flex-col gap-2">
            {/* Controls bar */}
            <div className="flex items-center gap-2 flex-wrap no-print">
              <Label className="text-xs text-muted-foreground">من:</Label>
              <Input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)}
                className="h-7 w-[130px] text-xs" data-testid="stmt-from" />
              <Label className="text-xs text-muted-foreground">إلى:</Label>
              <Input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)}
                className="h-7 w-[130px] text-xs" data-testid="stmt-to" />
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => refetchStatement()}>
                <RefreshCw className="h-3.5 w-3.5" /> تحديث
              </Button>
              {statementData && (
                <>
                  <div className="h-5 w-px bg-border mx-1" />
                  <span className="text-xs text-muted-foreground">
                    رصيد افتتاحي: <strong>{formatCurrency(String(statementData.openingBalance))}</strong>
                  </span>
                  <span className={cx("text-xs font-bold", balCls(statementData.closingBalance))}>
                    الرصيد الختامي: {formatCurrency(String(Math.abs(statementData.closingBalance)))}
                    {statementData.closingBalance > 0.005 ? " (على العميل)" : statementData.closingBalance < -0.005 ? " (لصالح العميل)" : " (متوازن)"}
                  </span>
                  <div className="h-5 w-px bg-border mx-1" />
                  <Button
                    variant="outline" size="sm"
                    className="h-7 px-2 text-xs gap-1 border-primary text-primary hover:bg-primary/10"
                    onClick={() => window.print()}
                    data-testid="button-print-statement"
                  >
                    <Printer className="h-3.5 w-3.5" /> طباعة كشف الحساب
                  </Button>
                </>
              )}
            </div>

            {stmtLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground no-print">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>جارٍ تحميل كشف الحساب...</span>
              </div>
            ) : statementData ? (
              <div className="overflow-auto" id="stmt-print-area">
                {/* Print header */}
                <div className="hidden print:block mb-4 text-center">
                  <h2 className="text-lg font-bold">كشف حساب عميل</h2>
                  <p className="text-sm font-semibold mt-1">
                    {statementData.name}
                    {statementData.phone ? ` — هاتف: ${statementData.phone}` : ""}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    الفترة من {formatDateShort(statementData.fromDate)} إلى {formatDateShort(statementData.toDate)}
                    &nbsp;|&nbsp; تاريخ الطباعة: {printDate}
                  </p>
                  <div className="border-b border-gray-400 my-2" />
                </div>

                {/* Summary chips */}
                <div className="no-print flex gap-3 text-xs mb-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-muted">
                    عدد السطور: <strong>{statementData.lines.length}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    إجمالي المدين (فواتير): <strong>{formatCurrency(String(statementData.totalDebit))}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    إجمالي الدائن (تحصيل): <strong>{formatCurrency(String(statementData.totalCredit))}</strong>
                  </span>
                </div>

                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
                    <TableRow>
                      <TableHead className="text-right w-[90px] print:text-[11px]">التاريخ</TableHead>
                      <TableHead className="text-right w-[110px] print:text-[11px]">نوع العملية</TableHead>
                      <TableHead className="text-right w-[80px] print:text-[11px]">رقم المستند</TableHead>
                      <TableHead className="text-right print:text-[11px]">مرجع</TableHead>
                      <TableHead className="text-right print:text-[11px]">البيان</TableHead>
                      <TableHead className="text-left w-[110px] print:text-[11px] text-red-700">مدين</TableHead>
                      <TableHead className="text-left w-[110px] print:text-[11px] text-green-700">دائن</TableHead>
                      <TableHead className="text-left w-[120px] print:text-[11px]">الرصيد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Opening balance row */}
                    <TableRow className="bg-muted/30 font-semibold print:bg-gray-50">
                      <TableCell className="print:text-[11px]">—</TableCell>
                      <TableCell className="print:text-[11px]">رصيد افتتاحي</TableCell>
                      <TableCell /><TableCell />
                      <TableCell className="print:text-[11px]">رصيد ما قبل {formatDateShort(stmtFrom)}</TableCell>
                      <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                      <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                      <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(statementData.openingBalance))}>
                        {formatCurrency(String(statementData.openingBalance))}
                      </TableCell>
                    </TableRow>

                    {statementData.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد حركات في هذه الفترة
                        </TableCell>
                      </TableRow>
                    ) : statementData.lines.map((line, idx) => (
                      <TableRow
                        key={idx}
                        className={cx(
                          "hover:bg-muted/30",
                          line.sourceType === "customer_receipt" ? "bg-green-50/50 dark:bg-green-950/20" : ""
                        )}
                        data-testid={`stmt-row-${idx}`}
                      >
                        <TableCell className="font-mono print:text-[11px]">{formatDateShort(line.txnDate)}</TableCell>
                        <TableCell className="print:text-[11px]">
                          <Badge variant="outline" className={cx(
                            "text-[10px] px-1.5 font-normal print:border-0 print:p-0",
                            line.sourceType === "sales_invoice"
                              ? "border-blue-300 text-blue-700 bg-blue-50"
                              : "border-green-300 text-green-700 bg-green-50"
                          )}>
                            {srcLabel[line.sourceType] ?? line.sourceLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono print:text-[11px]">{line.sourceNumber}</TableCell>
                        <TableCell className="text-muted-foreground print:text-[11px]">{line.sourceRef ?? "—"}</TableCell>
                        <TableCell className="max-w-[180px] truncate print:text-[11px]" title={line.description}>
                          {line.description}
                        </TableCell>
                        <TableCell className={cx(
                          "text-left font-mono print:text-[11px]",
                          line.debit > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"
                        )}>
                          {line.debit > 0 ? formatCurrency(String(line.debit)) : "—"}
                        </TableCell>
                        <TableCell className={cx(
                          "text-left font-mono print:text-[11px]",
                          line.credit > 0 ? "text-green-700 font-semibold" : "text-muted-foreground"
                        )}>
                          {line.credit > 0 ? formatCurrency(String(line.credit)) : "—"}
                        </TableCell>
                        <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(line.balance))}>
                          {formatCurrency(String(Math.abs(line.balance)))}
                          {" "}
                          <span className="text-[10px] font-normal opacity-70">
                            {line.balance > 0.005 ? "ع" : line.balance < -0.005 ? "م" : ""}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
                    <TableRow className="font-bold">
                      <TableCell colSpan={5} className="text-right print:text-[11px]">الإجمالي</TableCell>
                      <TableCell className="text-left font-mono text-red-700 print:text-[11px]">
                        {formatCurrency(String(statementData.totalDebit))}
                      </TableCell>
                      <TableCell className="text-left font-mono text-green-700 print:text-[11px]">
                        {formatCurrency(String(statementData.totalCredit))}
                      </TableCell>
                      <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(statementData.closingBalance))}>
                        {formatCurrency(String(Math.abs(statementData.closingBalance)))}
                        {" "}
                        <span className="text-[10px] font-normal opacity-70">
                          {statementData.closingBalance > 0.005 ? "على العميل" : statementData.closingBalance < -0.005 ? "لصالح العميل" : "متوازن"}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>

                {/* Print footer */}
                <div className="hidden print:flex mt-8 justify-between text-xs text-gray-600 px-4">
                  <div className="text-center">
                    <div className="border-t border-gray-400 pt-1 w-40">توقيع المدير المالي</div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-gray-400 pt-1 w-40">توقيع العميل</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}

      {!customerId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-sm">اختر عميلاً من القائمة أعلاه لعرض فواتيره وتحصيلها</p>
        </div>
      )}
    </div>
  );
}
