/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة سداد الموردين — Supplier Payments
 *  Layout: header (title + tabs) → supplier row → controls bar → TABLE (hero)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useToast }                         from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort }  from "@/lib/formatters";
import { Input }                            from "@/components/ui/input";
import { Button }                           from "@/components/ui/button";
import { Badge }                            from "@/components/ui/badge";
import { Checkbox }                         from "@/components/ui/checkbox";
import { Label }                            from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Command, CommandInput, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronsUpDown, Check, Banknote, AlertTriangle, FileText, Loader2, Save,
  RefreshCw, CircleDollarSign, Hash, ChevronUp, ChevronDown, Printer,
} from "lucide-react";
import { useTreasurySelector }              from "@/hooks/use-treasury-selector";
import { TreasurySelector }                 from "@/components/shared/TreasurySelector";
import type { Supplier, SupplierInvoicePaymentRow } from "@shared/schema/purchasing";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BalanceResult {
  openingBalance: string;
  totalInvoiced:  string;
  totalReturns:   string;
  totalPaid:      string;
  currentBalance: string;
}

interface StatementLine {
  txnDate:      string;
  sourceType:   string;
  sourceLabel:  string;
  sourceNumber: string;
  sourceRef:    string | null;
  description:  string;
  debit:        number;
  credit:       number;
  balance:      number;
}

interface SupplierStatementResult {
  supplierId:     string;
  nameAr:         string;
  code:           string;
  fromDate:       string;
  toDate:         string;
  openingBalance: number;
  lines:          StatementLine[];
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
}

type ActiveTab = "payment" | "statement";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

// ─── SupplierCombobox ─────────────────────────────────────────────────────────

function SupplierCombobox({
  value, onChange,
}: { value: string; onChange: (id: string) => void }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", search],
    queryFn:  async () => {
      const qs = search ? `search=${encodeURIComponent(search)}&` : "";
      const r = await fetch(`/api/suppliers?${qs}pageSize=30`, { credentials: "include" });
      return r.json();
    },
    staleTime: 30_000,
  });

  const suppliers = data?.suppliers ?? [];
  const selected  = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" role="combobox" aria-expanded={open}
          className="w-[280px] justify-between text-right gap-2"
          data-testid="supplier-combobox"
        >
          <span className="truncate text-sm">
            {selected ? `${selected.nameAr} (${selected.code})` : "ابحث باسم المورد أو الكود..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="اسم أو كود..."
            value={search} onValueChange={setSearch}
            className="text-right"
          />
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup className="max-h-56 overflow-y-auto">
            {suppliers.map((s) => (
              <CommandItem
                key={s.id} value={s.id}
                onSelect={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                className="flex justify-between gap-2"
                data-testid={`supplier-opt-${s.id}`}
              >
                <span className="text-muted-foreground text-xs">{s.code}</span>
                <span className="flex-1 text-right">{s.nameAr}</span>
                {value === s.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── BalanceStrip (compact inline) ───────────────────────────────────────────

function BalanceStrip({ supplierId }: { supplierId: string }) {
  const { data, isLoading } = useQuery<BalanceResult>({
    queryKey: ["/api/supplier-payments/balance", supplierId],
    queryFn:  async () => {
      const r = await fetch(`/api/supplier-payments/balance/${supplierId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل الرصيد");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  if (isLoading) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> جارٍ تحميل الرصيد...
    </span>
  );
  if (!data) return null;

  const bal = parseFloat(data.currentBalance);

  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      <span className="text-muted-foreground">
        ذمم: <strong>{formatCurrency(data.totalInvoiced)}</strong>
      </span>
      {parseFloat(data.totalReturns) > 0 && (
        <span className="text-orange-600 dark:text-orange-400">
          مرتجع: <strong>{formatCurrency(data.totalReturns)}</strong>
        </span>
      )}
      <span className="text-green-600 dark:text-green-400">
        مسدد: <strong>{formatCurrency(data.totalPaid)}</strong>
      </span>
      <span className={cx(
        "font-bold",
        bal > 0 ? "text-red-600" : bal < 0 ? "text-blue-600" : "text-green-600"
      )} data-testid="balance-current">
        رصيد: {formatCurrency(data.currentBalance)}
      </span>
    </div>
  );
}

// ─── SortHead ─────────────────────────────────────────────────────────────────

type SortKey = "invoiceNumber" | "supplierInvoiceNo" | "receivingNumber" | "invoiceDate" | "totalPaid" | "remaining";
type SortDir = "asc" | "desc";

function SortHead({
  label, col, cur, dir, onSort,
  className = "",
}: {
  label: string;
  col: SortKey;
  cur: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = cur === col;
  return (
    <TableHead className={cx("cursor-pointer select-none", className)}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cx(
          "flex items-center gap-0.5 text-xs font-medium",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
        <span className="flex flex-col ms-0.5">
          {active && dir === "asc"
            ? <ChevronUp className="h-3 w-3" />
            : active && dir === "desc"
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
        </span>
      </button>
    </TableHead>
  );
}

// ─── PaymentTab ───────────────────────────────────────────────────────────────

function PaymentTab({ supplierId }: { supplierId: string }) {
  const { toast } = useToast();

  // Next payment number
  const { data: nextNumData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/supplier-payments/next-number"],
    queryFn:  async () => {
      const r = await fetch("/api/supplier-payments/next-number", { credentials: "include" });
      return r.json();
    },
    staleTime: 0,
  });
  const paymentNumber = nextNumData?.nextNumber ?? 1;

  // Claim filter state
  const [claimFilter, setClaimFilter] = useState("");

  // Invoices
  const { data: invoices = [], isLoading, isFetching } = useQuery<SupplierInvoicePaymentRow[]>({
    queryKey: ["/api/supplier-payments/invoices", supplierId, claimFilter],
    queryFn:  async () => {
      const qs = claimFilter ? `&claimNumber=${encodeURIComponent(claimFilter)}` : "";
      const r = await fetch(`/api/supplier-payments/invoices/${supplierId}?status=unpaid${qs}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("فشل تحميل الفواتير");
      return r.json();
    },
    enabled:          !!supplierId,
    staleTime:        5_000,
    placeholderData:  keepPreviousData,
  });

  // Payment state
  const treasury = useTreasurySelector();

  const [inputs, setInputs]           = useState<Record<string, string>>({});
  const [paymentDate, setPaymentDate] = useState(today());
  const [payMethod,   setPayMethod]   = useState("bank");
  const [reference,   setReference]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [distAmt,     setDistAmt]     = useState("");

  // Selection state (for reference total)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allChecked = ids.every((id) => prev.has(id));
      if (allChecked) return new Set();
      return new Set(ids);
    });
  }, []);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback((col: SortKey) => {
    setSortDir((d) => sortKey === col ? (d === "asc" ? "desc" : "asc") : "asc");
    setSortKey(col);
  }, [sortKey]);

  // Sorted invoices
  const sortedInvoices = useMemo(() => {
    const arr = [...invoices];
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "invoiceNumber":
          return sign * (parseInt(String(a.invoiceNumber)) - parseInt(String(b.invoiceNumber)));
        case "supplierInvoiceNo":
          return sign * (a.supplierInvoiceNo ?? "").localeCompare(b.supplierInvoiceNo ?? "", "ar");
        case "receivingNumber":
          return sign * ((a.receivingNumber ?? 0) - (b.receivingNumber ?? 0));
        case "invoiceDate":
          return sign * a.invoiceDate.localeCompare(b.invoiceDate);
        case "totalPaid":
          return sign * (parseFloat(a.totalPaid) - parseFloat(b.totalPaid));
        case "remaining":
          return sign * (parseFloat(a.remaining) - parseFloat(b.remaining));
        default: return 0;
      }
    });
    return arr;
  }, [invoices, sortKey, sortDir]);

  // Selection totals (reference only)
  const selectedTotal = useMemo(
    () => sortedInvoices
      .filter((inv) => selected.has(inv.invoiceId))
      .reduce((s, inv) => s + parseFloat(inv.remaining), 0),
    [sortedInvoices, selected]
  );

  // Computed
  const totalDistributed = useMemo(
    () => Object.values(inputs).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [inputs]
  );
  const totalRemaining = useMemo(
    () => invoices.reduce((s, r) => s + parseFloat(r.remaining), 0),
    [invoices]
  );
  const diff = (parseFloat(distAmt) || 0) - totalDistributed;

  const handleInput = useCallback((id: string, val: string) => {
    setInputs((p) => ({ ...p, [id]: val }));
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  // Each payment input has data-row-index attr; ArrowUp/Down moves focus
  const tableRef = useRef<HTMLDivElement>(null);

  const handleCellKeyDown = useCallback((
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    if (!tableRef.current) return;
    const inputs = Array.from(
      tableRef.current.querySelectorAll<HTMLInputElement>("[data-payment-input]")
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      inputs[rowIndex + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      inputs[rowIndex - 1]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      inputs[rowIndex + 1]?.focus();
    }
  }, []);

  // ── Auto-distribute ────────────────────────────────────────────────────────
  const handleAutoDistribute = () => {
    const amt = parseFloat(distAmt);
    if (!amt || amt <= 0) {
      toast({ title: "أدخل المبلغ أولاً", variant: "destructive" });
      return;
    }
    let rem = amt;
    const n: Record<string, string> = {};
    for (const inv of sortedInvoices) {
      if (rem <= 0) { n[inv.invoiceId] = ""; continue; }
      const pay = Math.min(parseFloat(inv.remaining), rem);
      n[inv.invoiceId] = pay > 0 ? pay.toFixed(2) : "";
      rem -= pay;
    }
    setInputs(n);
  };

  // ── Save payment ───────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const lines = invoices
        .filter((inv) => (parseFloat(inputs[inv.invoiceId] ?? "0") || 0) > 0)
        .map((inv) => ({ invoiceId: inv.invoiceId, amountPaid: parseFloat(inputs[inv.invoiceId]) }));
      if (!lines.length) throw new Error("لم تُدخل أي مبالغ للسداد");
      return apiRequestJson<{ paymentId: string; paymentNumber: number }>(
        "POST", "/api/supplier-payments", {
          supplierId,
          paymentDate,
          totalAmount:   totalDistributed,
          reference:     reference || null,
          notes:         notes || null,
          paymentMethod: payMethod,
          glAccountId:   treasury.selectedGlAccountId,
          shiftId:       null,
          lines,
        }
      );
    },
    onSuccess: (body) => {
      toast({ title: `تم حفظ السداد رقم #${String(body.paymentNumber).padStart(4, "0")} بنجاح` });
      setInputs({}); setDistAmt("");
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/invoices", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/balance", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/report", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/next-number"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>جارٍ تحميل الفواتير...</span>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border bg-muted/20 shrink-0">

        {/* Payment number badge */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary font-bold text-sm shrink-0">
          <Hash className="h-3.5 w-3.5" />
          <span data-testid="payment-number">{String(paymentNumber).padStart(4, "0")}</span>
        </div>

        {/* Date */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">التاريخ</Label>
          <Input
            type="date" value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="h-7 w-[130px] text-xs"
            data-testid="input-payment-date"
          />
        </div>

        {/* Method */}
        <Select value={payMethod} onValueChange={setPayMethod}>
          <SelectTrigger className="h-7 w-[110px] text-xs" data-testid="select-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bank">تحويل بنكي</SelectItem>
            <SelectItem value="check">شيك</SelectItem>
            <SelectItem value="cash">نقداً</SelectItem>
            <SelectItem value="transfer">حوالة</SelectItem>
          </SelectContent>
        </Select>

        {/* Reference */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">مرجع</Label>
          <Input
            placeholder="رقم الشيك / التحويل"
            value={reference} onChange={(e) => setReference(e.target.value)}
            className="h-7 w-[140px] text-xs"
            data-testid="input-reference"
          />
        </div>

        {/* Notes */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">ملاحظة</Label>
          <Input
            placeholder="اختياري"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className="h-7 w-[140px] text-xs"
            data-testid="input-notes"
          />
        </div>

        {/* Treasury / shift selector */}
        <TreasurySelector {...treasury} label="الخزنة:" />

        {/* Claim filter */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">رقم المطالبة</Label>
          <Input
            placeholder="مثال: 2/2026"
            value={claimFilter}
            onChange={(e) => setClaimFilter(e.target.value)}
            className="h-7 w-[110px] text-xs font-mono"
            data-testid="input-claim-filter"
          />
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

        {/* Distribute amount */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-blue-600 dark:text-blue-400 shrink-0">سيُدفع</Label>
          <Input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={distAmt} onChange={(e) => setDistAmt(e.target.value)}
            className="h-7 w-[110px] text-xs text-left ltr"
            data-testid="input-distribute"
          />
        </div>

        <Button
          variant="outline" size="sm"
          onClick={handleAutoDistribute}
          className="h-7 text-xs border-blue-400 text-blue-700 hover:bg-blue-50"
          data-testid="button-auto-distribute"
        >
          <RefreshCw className="h-3 w-3 me-1" />
          توزيع تلقائي
        </Button>

        {/* Diff indicator */}
        {distAmt && (
          <div className={cx(
            "flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold shrink-0",
            Math.abs(diff) < 0.01
              ? "bg-green-100 text-green-700"
              : diff > 0
              ? "bg-orange-100 text-orange-700"
              : "bg-red-100 text-red-700"
          )} data-testid="diff-indicator">
            {Math.abs(diff) < 0.01
              ? <><Check className="h-3.5 w-3.5" /> مطابق</>
              : diff > 0
              ? <><AlertTriangle className="h-3.5 w-3.5" /> غير موزّع: {formatCurrency(diff)}</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> زيادة: {formatCurrency(Math.abs(diff))}</>}
          </div>
        )}
      </div>

      {/* ── Invoice table (hero) ──────────────────────────────────────────── */}
      <div ref={tableRef} className="flex-1 min-h-0 border rounded-lg overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-8 px-2">
                  <Checkbox
                    checked={
                      sortedInvoices.length > 0 &&
                      sortedInvoices.every((i) => selected.has(i.invoiceId))
                    }
                    onCheckedChange={() => handleToggleAll(sortedInvoices.map((i) => i.invoiceId))}
                    aria-label="تحديد الكل"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <SortHead label="#"               col="invoiceNumber"    cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right w-[80px]" />
                <SortHead label="كود فاتورة المورد" col="supplierInvoiceNo" cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                <SortHead label="أذن استلام"       col="receivingNumber"  cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right w-[90px]" />
                <TableHead className="text-right text-xs w-[95px]">رقم المطالبة</TableHead>
                <SortHead label="التاريخ"          col="invoiceDate"      cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right w-[95px]" />
                <TableHead className="text-left text-xs">صافي الفاتورة</TableHead>
                <TableHead className="text-left text-xs text-red-600">مرتجع</TableHead>
                <SortHead label="مسدد سابقاً"     col="totalPaid"        cur={sortKey} dir={sortDir} onSort={handleSort} className="text-left" />
                <SortHead label="الباقي"           col="remaining"        cur={sortKey} dir={sortDir} onSort={handleSort} className="text-left font-semibold text-orange-600" />
                <TableHead className="text-left text-xs font-semibold text-primary w-[130px]">
                  المدفوع الآن
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isFetching && sortedInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-6 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>جارٍ البحث...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isFetching && sortedInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Check className="h-8 w-8 text-green-500 opacity-70" />
                      <span className="text-sm">
                        {claimFilter ? `لا توجد فواتير بهذا الرقم "${claimFilter}"` : "لا توجد فواتير غير مسددة"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {sortedInvoices.map((inv, idx) => {
                const remaining   = parseFloat(inv.remaining);
                const inputVal    = inputs[inv.invoiceId] ?? "";
                const inputAmount = parseFloat(inputVal) || 0;
                const isOver      = inputAmount > remaining + 0.005;
                const hasPaid     = inputAmount > 0;

                const isSelected = selected.has(inv.invoiceId);
                return (
                  <TableRow
                    key={inv.invoiceId}
                    className={cx(
                      isOver ? "bg-red-50 dark:bg-red-950/20" : "",
                      hasPaid && !isSelected ? "bg-green-50/40 dark:bg-green-950/10" : "",
                      isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : ""
                    )}
                    data-testid={`row-invoice-${inv.invoiceId}`}
                  >
                    <TableCell className="w-8 px-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(inv.invoiceId)}
                        aria-label={`تحديد فاتورة ${inv.invoiceNumber}`}
                        data-testid={`checkbox-row-${inv.invoiceId}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{inv.supplierInvoiceNo || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {inv.receivingNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-primary font-semibold">
                      {inv.claimNumber || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                    <TableCell className="text-left text-xs font-mono">
                      {formatCurrency(inv.netPayable)}
                    </TableCell>
                    <TableCell className="text-left text-xs font-mono text-red-500">
                      {parseFloat(inv.invoiceReturns) > 0 ? formatCurrency(inv.invoiceReturns) : "—"}
                    </TableCell>
                    <TableCell className="text-left text-xs font-mono text-muted-foreground">
                      {parseFloat(inv.totalPaid) > 0 ? formatCurrency(inv.totalPaid) : "—"}
                    </TableCell>
                    <TableCell className="text-left text-xs font-mono font-semibold text-orange-600">
                      {formatCurrency(inv.remaining)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Input
                          type="number" min="0" max={remaining} step="0.01"
                          placeholder="0.00"
                          value={inputVal}
                          onChange={(e) => handleInput(inv.invoiceId, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, idx)}
                          className={cx(
                            "h-7 w-[118px] text-left ltr text-xs font-mono",
                            isOver ? "border-red-400 focus-visible:ring-red-400" : "focus-visible:ring-primary"
                          )}
                          data-payment-input
                          data-row-index={idx}
                          data-testid={`input-pay-${inv.invoiceId}`}
                        />
                        {isOver && (
                          <span className="text-red-500 text-[10px]">يتجاوز المتبقي</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter className="sticky bottom-0 bg-muted/80 backdrop-blur-sm">
              {selected.size > 0 && (
                <TableRow className="bg-blue-100/70 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                  <TableCell colSpan={5} className="text-right text-xs font-medium py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-3 w-3" />
                      محدد: {selected.size} {selected.size === 1 ? "فاتورة" : "فواتير"}
                    </span>
                  </TableCell>
                  <TableCell className="text-left text-xs font-mono text-muted-foreground py-1.5">—</TableCell>
                  <TableCell className="text-left text-xs font-mono text-muted-foreground py-1.5">—</TableCell>
                  <TableCell className="text-left text-xs font-mono text-muted-foreground py-1.5">—</TableCell>
                  <TableCell className="text-left text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 py-1.5" data-testid="selected-remaining-total">
                    {formatCurrency(selectedTotal)}
                  </TableCell>
                  <TableCell className="py-1.5" />
                </TableRow>
              )}
              <TableRow className="font-bold">
                <TableCell colSpan={5} className="text-right text-xs">الإجمالي</TableCell>
                <TableCell className="text-left text-xs font-mono">
                  {formatCurrency(invoices.reduce((s, r) => s + parseFloat(r.netPayable), 0))}
                </TableCell>
                <TableCell className="text-left text-xs font-mono text-red-500">
                  {formatCurrency(invoices.reduce((s, r) => s + parseFloat(r.invoiceReturns), 0))}
                </TableCell>
                <TableCell className="text-left text-xs font-mono text-muted-foreground">
                  {formatCurrency(invoices.reduce((s, r) => s + parseFloat(r.totalPaid), 0))}
                </TableCell>
                <TableCell className="text-left text-xs font-mono text-orange-600">
                  {formatCurrency(totalRemaining)}
                </TableCell>
                <TableCell className="text-left text-xs font-mono text-green-700" data-testid="total-distributed">
                  {formatCurrency(totalDistributed)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="text-sm text-muted-foreground">
          {invoices.length} فاتورة غير مسددة
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || totalDistributed <= 0}
          className="gap-2"
          data-testid="button-save"
        >
          {mutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          {totalDistributed > 0
            ? `حفظ سداد ${formatCurrency(totalDistributed)}`
            : "لم يُدخل مبالغ"}
        </Button>
      </div>
    </div>
  );
}

// ─── StatementTab — كشف حساب مورد ────────────────────────────────────────────

const thisYear = new Date().getFullYear();
const firstOfYear = () => `${thisYear}-01-01`;

function balanceClass(val: number) {
  if (val > 0.005)  return "text-red-600 dark:text-red-400";
  if (val < -0.005) return "text-blue-600 dark:text-blue-400";
  return "text-green-600 dark:text-green-400";
}

function StatementTab({ supplierId }: { supplierId: string }) {
  const [fromDate, setFromDate] = useState(firstOfYear());
  const [toDate,   setToDate]   = useState(today());

  const { data, isLoading, refetch } = useQuery<SupplierStatementResult>({
    queryKey: ["/api/supplier-payments/statement", supplierId, fromDate, toDate],
    queryFn:  async () => {
      const r = await fetch(
        `/api/supplier-payments/statement/${supplierId}?from=${fromDate}&to=${toDate}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error("فشل تحميل كشف الحساب");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  const printDate = new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });

  const sourceTypeLabel: Record<string, string> = {
    purchase_invoice: "فاتورة شراء",
    purchase_return:  "مرتجع مشتريات",
    supplier_payment: "سداد",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">

      {/* ── Controls bar (hidden when printing) ─────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 no-print">
        <Label className="text-xs text-muted-foreground shrink-0">من:</Label>
        <Input
          type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="h-7 w-[130px] text-xs"
          data-testid="stmt-from"
        />
        <Label className="text-xs text-muted-foreground shrink-0">إلى:</Label>
        <Input
          type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="h-7 w-[130px] text-xs"
          data-testid="stmt-to"
        />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </Button>

        {data && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <span className="text-xs text-muted-foreground">
              رصيد افتتاحي: <strong>{formatCurrency(String(data.openingBalance))}</strong>
            </span>
            <span className={cx("text-xs font-bold", balanceClass(data.closingBalance))}>
              الرصيد الختامي: {formatCurrency(String(data.closingBalance))}
              {data.closingBalance > 0.005 ? " (لصالح المورد)" : data.closingBalance < -0.005 ? " (لصالحنا)" : " (متوازن)"}
            </span>
            <div className="h-5 w-px bg-border mx-1" />
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs gap-1 border-primary text-primary hover:bg-primary/10"
              onClick={() => window.print()}
              data-testid="button-print-statement"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة كشف الحساب
            </Button>
          </>
        )}
      </div>

      {/* ── Statement body ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground no-print">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>جارٍ تحميل كشف الحساب...</span>
        </div>
      ) : !data ? null : (
        <div className="flex-1 min-h-0 overflow-auto" id="stmt-print-area">

          {/* ── Print header (shown only when printing) ─────────────────── */}
          <div className="hidden print:block mb-4 text-center">
            <h2 className="text-lg font-bold">كشف حساب مورد</h2>
            <p className="text-sm font-semibold mt-1">
              {data.nameAr} &mdash; كود: {data.code}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              الفترة من {formatDateShort(data.fromDate)} إلى {formatDateShort(data.toDate)}
              &nbsp;|&nbsp; تاريخ الطباعة: {printDate}
            </p>
            <div className="border-b border-gray-400 my-2" />
          </div>

          {/* ── Summary strip (visible on screen only) ──────────────────── */}
          <div className="no-print flex gap-3 text-xs mb-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-muted">
              عدد السطور: <strong>{data.lines.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              إجمالي المدين: <strong>{formatCurrency(String(data.totalDebit))}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              إجمالي الدائن: <strong>{formatCurrency(String(data.totalCredit))}</strong>
            </span>
          </div>

          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow>
                <TableHead className="text-right w-[90px] print:text-[11px]">التاريخ</TableHead>
                <TableHead className="text-right w-[110px] print:text-[11px]">نوع العملية</TableHead>
                <TableHead className="text-right w-[80px] print:text-[11px]">رقم المستند</TableHead>
                <TableHead className="text-right print:text-[11px]">رقم / مرجع</TableHead>
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
                <TableCell />
                <TableCell />
                <TableCell className="print:text-[11px]">
                  رصيد ما قبل {formatDateShort(fromDate)}
                </TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className={cx(
                  "text-left font-mono font-bold print:text-[11px]",
                  balanceClass(data.openingBalance)
                )}>
                  {formatCurrency(String(data.openingBalance))}
                </TableCell>
              </TableRow>

              {/* Transaction lines */}
              {data.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد حركات في هذه الفترة
                  </TableCell>
                </TableRow>
              ) : (
                data.lines.map((line, idx) => (
                  <TableRow
                    key={idx}
                    className={cx(
                      "hover:bg-muted/30",
                      line.sourceType === "supplier_payment" ? "bg-green-50/50 dark:bg-green-950/20" :
                      line.sourceType === "purchase_return"  ? "bg-orange-50/50 dark:bg-orange-950/20" : ""
                    )}
                    data-testid={`stmt-row-${idx}`}
                  >
                    <TableCell className="font-mono print:text-[11px]">
                      {formatDateShort(line.txnDate)}
                    </TableCell>
                    <TableCell className="print:text-[11px]">
                      <Badge variant="outline" className={cx(
                        "text-[10px] px-1.5 font-normal print:border-0 print:p-0",
                        line.sourceType === "purchase_invoice" ? "border-blue-300 text-blue-700 bg-blue-50" :
                        line.sourceType === "purchase_return"  ? "border-orange-300 text-orange-700 bg-orange-50" :
                                                                  "border-green-300 text-green-700 bg-green-50"
                      )}>
                        {sourceTypeLabel[line.sourceType] ?? line.sourceLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono print:text-[11px]">
                      {line.sourceNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground print:text-[11px]">
                      {line.sourceRef ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate print:text-[11px]" title={line.description}>
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
                    <TableCell className={cx(
                      "text-left font-mono font-bold print:text-[11px]",
                      balanceClass(line.balance)
                    )}>
                      {formatCurrency(String(Math.abs(line.balance)))}
                      {" "}
                      <span className="text-[10px] font-normal opacity-70">
                        {line.balance > 0.005 ? "د" : line.balance < -0.005 ? "م" : ""}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter className="sticky bottom-0 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow className="font-bold">
                <TableCell colSpan={5} className="text-right print:text-[11px]">
                  الإجمالي
                </TableCell>
                <TableCell className="text-left font-mono text-red-700 print:text-[11px]">
                  {formatCurrency(String(data.totalDebit))}
                </TableCell>
                <TableCell className="text-left font-mono text-green-700 print:text-[11px]">
                  {formatCurrency(String(data.totalCredit))}
                </TableCell>
                <TableCell className={cx(
                  "text-left font-mono font-bold print:text-[11px]",
                  balanceClass(data.closingBalance)
                )}>
                  {formatCurrency(String(Math.abs(data.closingBalance)))}
                  {" "}
                  <span className="text-[10px] font-normal opacity-70">
                    {data.closingBalance > 0.005 ? "دائن" : data.closingBalance < -0.005 ? "مدين" : "متوازن"}
                  </span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* ── Print footer ────────────────────────────────────────────── */}
          <div className="hidden print:flex mt-8 justify-between text-xs text-gray-600 px-4">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع المدير المالي</div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع المورد / ختمه</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplierPaymentsPage() {
  const [supplierId, setSupplierId] = useState("");
  const [activeTab,  setActiveTab]  = useState<ActiveTab>("payment");

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <CircleDollarSign className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-base font-bold">سداد الموردين</h1>
        </div>

        {/* Inline tabs — only visible when supplier is selected */}
        {supplierId && (
          <div className="flex items-center border rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => setActiveTab("payment")}
              className={cx(
                "px-4 py-1.5 transition-colors font-medium",
                activeTab === "payment"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              data-testid="tab-payment"
            >
              سداد الفواتير
            </button>
            <button
              onClick={() => setActiveTab("statement")}
              className={cx(
                "px-4 py-1.5 transition-colors font-medium border-r",
                activeTab === "statement"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              data-testid="tab-statement"
            >
              كشف الحساب
            </button>
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 px-4 py-2 gap-2">

        {/* Supplier row + balance */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <SupplierCombobox value={supplierId} onChange={(id) => { setSupplierId(id); }} />
          {supplierId && <BalanceStrip supplierId={supplierId} />}
        </div>

        {/* Tab content */}
        {!supplierId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
            <Banknote className="h-12 w-12 opacity-30" />
            <p className="text-sm">اختر مورداً لعرض فواتيره وإجراء السداد</p>
          </div>
        ) : activeTab === "payment" ? (
          <PaymentTab supplierId={supplierId} />
        ) : (
          <StatementTab supplierId={supplierId} />
        )}
      </div>
    </div>
  );
}
