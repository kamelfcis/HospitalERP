/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة تحصيل الآجل — Customer Credit Payments
 *  نفس مفهوم سداد الموردين: Combobox → BalanceStrip → Table → حفظ
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback }          from "react";
import { useCustomerPaymentsMutations }             from "./useCustomerPaymentsMutations";
import { CustomerStatementPanel }                   from "./CustomerStatementPanel";
import { CustomerInvoicesTable }                    from "./CustomerInvoicesTable";
import { formatCurrency }                           from "@/lib/formatters";
import { Input }                                    from "@/components/ui/input";
import { Button }                                   from "@/components/ui/button";
import { Badge }                                    from "@/components/ui/badge";
import { Label }                                    from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, AlertTriangle, FileText, RefreshCw, CircleDollarSign, Hash, User,
} from "lucide-react";
import {
  CreditCustomerCombobox,
  type CreditCustomer,
} from "@/components/shared/CreditCustomerCombobox";
import { useTreasurySelector }                      from "@/hooks/use-treasury-selector";
import { TreasurySelector }                         from "@/components/shared/TreasurySelector";
import {
  useCustomerPaymentsData,
  type BalanceResult,
} from "./useCustomerPaymentsData";

type ActiveTab = "payment" | "statement";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
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

  // ── حالة التصفية والتبويب ─────────────────────────────────────────────────
  const [filterStatus,   setFilterStatus]   = useState<"unpaid" | "paid" | "all">("unpaid");
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [amounts,        setAmounts]        = useState<Record<string, string>>({});
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("payment");

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

  // ── رصيد المحدد (استرشادي — يُمرَّر للجدول) ──────────────────────────────
  const selectedRemaining = useMemo(() => {
    if (selected.size === 0) return null;
    return rawInvoices
      .filter((inv) => selected.has(inv.invoiceId))
      .reduce((s, inv) => s + parseFloat(inv.remaining), 0);
  }, [rawInvoices, selected]);

  // ── توزيع تلقائي للمبلغ ───────────────────────────────────────────────────
  const autoDistribute = useCallback(() => {
    const total = parseFloat(totalAmount);
    if (!total || !rawInvoices.length) return;
    let rem = total;
    const next: Record<string, string> = {};
    for (const inv of rawInvoices) {
      if (rem <= 0) { next[inv.invoiceId] = "0"; continue; }
      const needed = parseFloat(inv.remaining);
      const give   = Math.min(needed, rem);
      next[inv.invoiceId] = give > 0 ? give.toFixed(2) : "0";
      rem -= give;
    }
    setAmounts(next);
  }, [totalAmount, rawInvoices]);

  // ── حفظ الإيصال (mutation) ────────────────────────────────────────────────
  const { saveMutation } = useCustomerPaymentsMutations({
    customerId, receiptDate, totalAmount, paymentMethod, reference, notes,
    glAccountId: treasury.selectedGlAccountId,
    amounts,
    onSuccess: () => { setAmounts({}); setTotalAmount(""); setReference(""); setSelected(new Set()); },
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

  // ── table callbacks ────────────────────────────────────────────────────────
  const handleSelectAll = useCallback((all: boolean) => {
    setSelected(all ? new Set(rawInvoices.map((i) => i.invoiceId)) : new Set());
  }, [rawInvoices]);

  const handleSelectToggle = useCallback((id: string, checked: boolean | string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const handleAmountChange = useCallback((id: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [id]: value }));
  }, []);

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
              disabled={!totalAmount || !rawInvoices.length}
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

          {/* ── Invoices Table ───────────────────────────────────────────── */}
          <CustomerInvoicesTable
            rawInvoices={rawInvoices}
            selected={selected}
            onSelectAll={handleSelectAll}
            onSelectToggle={handleSelectToggle}
            amounts={amounts}
            onAmountChange={handleAmountChange}
            distributedTotal={distributedTotal}
            totalAmount={totalAmount}
            selectedRemaining={selectedRemaining}
            saveMutation={saveMutation}
          />
        </>
      )}

      {/* ═════════════════════════ تاب كشف الحساب ═════════════════════════ */}
      {activeTab === "statement" && customerId && (
        <CustomerStatementPanel
          stmtFrom={stmtFrom}   setStmtFrom={setStmtFrom}
          stmtTo={stmtTo}       setStmtTo={setStmtTo}
          statementData={statementData}
          stmtLoading={stmtLoading}
          refetchStatement={refetchStatement}
        />
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
