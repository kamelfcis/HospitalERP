/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة سداد الموردين — Supplier Payments
 *  Layout: header (title + tabs) → supplier row → controls bar → TABLE (hero)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation }           from "@tanstack/react-query";
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
  RefreshCw, CircleDollarSign, Hash, ChevronUp, ChevronDown,
} from "lucide-react";
import type { Supplier, SupplierInvoicePaymentRow } from "@shared/schema/purchasing";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BalanceResult {
  openingBalance: string;
  totalInvoiced:  string;
  totalPaid:      string;
  currentBalance: string;
}

interface ReportRow extends SupplierInvoicePaymentRow {
  paymentId:   string | null;
  paymentDate: string | null;
  paymentRef:  string | null;
}

interface ReportResult {
  rows:            ReportRow[];
  totalNetPayable: string;
  totalPaid:       string;
  totalRemaining:  string;
}

type ActiveTab = "payment" | "report";

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
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">
        ذمم: <strong>{formatCurrency(data.totalInvoiced)}</strong>
      </span>
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

  // Invoices
  const { data: invoices = [], isLoading } = useQuery<SupplierInvoicePaymentRow[]>({
    queryKey: ["/api/supplier-payments/invoices", supplierId],
    queryFn:  async () => {
      const r = await fetch(`/api/supplier-payments/invoices/${supplierId}?status=unpaid`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("فشل تحميل الفواتير");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 5_000,
  });

  // Payment state
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

  if (!invoices.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Check className="h-10 w-10 text-green-500" />
      <p className="text-sm">لا توجد فواتير غير مسددة لهذا المورد</p>
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
                <SortHead label="رقم المطالبة"    col="receivingNumber"  cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right w-[90px]" />
                <SortHead label="التاريخ"          col="invoiceDate"      cur={sortKey} dir={sortDir} onSort={handleSort} className="text-right w-[95px]" />
                <TableHead className="text-left text-xs">صافي الفاتورة</TableHead>
                <SortHead label="مسدد سابقاً"     col="totalPaid"        cur={sortKey} dir={sortDir} onSort={handleSort} className="text-left" />
                <SortHead label="الباقي"           col="remaining"        cur={sortKey} dir={sortDir} onSort={handleSort} className="text-left font-semibold text-orange-600" />
                <TableHead className="text-left text-xs font-semibold text-primary w-[130px]">
                  المدفوع الآن
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                    <TableCell className="text-left text-xs font-mono">
                      {formatCurrency(inv.netPayable)}
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

// ─── ReportTab ────────────────────────────────────────────────────────────────

function ReportTab({ supplierId }: { supplierId: string }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid">("all");

  const { data, isLoading, refetch } = useQuery<ReportResult>({
    queryKey: ["/api/supplier-payments/report", supplierId, statusFilter],
    queryFn:  async () => {
      const r = await fetch(
        `/api/supplier-payments/report/${supplierId}?status=${statusFilter}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error("فشل تحميل التقرير");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 5_000,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* Filter bar */}
      <div className="flex items-center gap-2 shrink-0">
        <Label className="text-xs text-muted-foreground shrink-0">عرض:</Label>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-7 w-[170px] text-xs" data-testid="report-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الفواتير</SelectItem>
            <SelectItem value="unpaid">الغير مسددة فقط</SelectItem>
            <SelectItem value="paid">المسددة فقط</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {/* Summary pills */}
        {data && (
          <div className="flex gap-2 text-xs ms-2">
            <span className="px-2 py-0.5 rounded bg-muted">
              إجمالي: <strong>{formatCurrency(data.totalNetPayable)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">
              مسدد: <strong>{formatCurrency(data.totalPaid)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700">
              متبقي: <strong>{formatCurrency(data.totalRemaining)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>جارٍ تحميل التقرير...</span>
        </div>
      ) : !rows.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <FileText className="h-8 w-8 opacity-40" />
          <p className="text-sm">لا توجد بيانات بهذا الفلتر</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="text-right text-xs w-[80px]">#</TableHead>
                  <TableHead className="text-right text-xs">رقم فاتورة المورد</TableHead>
                  <TableHead className="text-right text-xs w-[80px]">رقم المطالبة</TableHead>
                  <TableHead className="text-right text-xs w-[95px]">التاريخ</TableHead>
                  <TableHead className="text-left text-xs">صافي الفاتورة</TableHead>
                  <TableHead className="text-left text-xs">المسدد</TableHead>
                  <TableHead className="text-left text-xs">المتبقي</TableHead>
                  <TableHead className="text-right text-xs w-[80px]">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const remaining = parseFloat(row.remaining);
                  const isPaid    = remaining <= 0.005;
                  return (
                    <TableRow key={row.invoiceId} data-testid={`rpt-row-${row.invoiceId}`}>
                      <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                      <TableCell className="text-xs">{row.supplierInvoiceNo || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {row.receivingNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateShort(row.invoiceDate)}</TableCell>
                      <TableCell className="text-left text-xs font-mono">
                        {formatCurrency(row.netPayable)}
                      </TableCell>
                      <TableCell className="text-left text-xs font-mono text-green-600">
                        {parseFloat(row.totalPaid) > 0 ? formatCurrency(row.totalPaid) : "—"}
                      </TableCell>
                      <TableCell className={cx(
                        "text-left text-xs font-mono font-semibold",
                        isPaid ? "text-muted-foreground" : "text-orange-600"
                      )}>
                        {isPaid ? "—" : formatCurrency(row.remaining)}
                      </TableCell>
                      <TableCell>
                        <Badge className={cx(
                          "text-[10px] px-1.5",
                          isPaid
                            ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50"
                        )} variant="outline">
                          {isPaid ? "مسدد" : "متبقي"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-muted/80 backdrop-blur-sm">
                <TableRow className="font-bold">
                  <TableCell colSpan={4} className="text-right text-xs">الإجمالي</TableCell>
                  <TableCell className="text-left text-xs font-mono">
                    {formatCurrency(data?.totalNetPayable)}
                  </TableCell>
                  <TableCell className="text-left text-xs font-mono text-green-600">
                    {formatCurrency(data?.totalPaid)}
                  </TableCell>
                  <TableCell className="text-left text-xs font-mono text-orange-600">
                    {formatCurrency(data?.totalRemaining)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
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
              onClick={() => setActiveTab("report")}
              className={cx(
                "px-4 py-1.5 transition-colors font-medium border-r",
                activeTab === "report"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              data-testid="tab-report"
            >
              تقرير المدفوعات
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
          <ReportTab supplierId={supplierId} />
        )}
      </div>
    </div>
  );
}
