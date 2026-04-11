import { useState, useMemo, useCallback, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  ChevronsUpDown, Check, AlertTriangle, Loader2, Save,
  RefreshCw, Hash, ChevronUp, ChevronDown,
} from "lucide-react";
import { useTreasurySelector } from "@/hooks/use-treasury-selector";
import { TreasurySelector } from "@/components/shared/TreasurySelector";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

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

const today = () => new Date().toISOString().split("T")[0];

export function PaymentTab({ supplierId }: { supplierId: string }) {
  const { toast } = useToast();

  const { data: nextNumData } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/supplier-payments/next-number"],
    queryFn:  async () => {
      const r = await fetch("/api/supplier-payments/next-number", { credentials: "include" });
      return r.json();
    },
    staleTime: 0,
  });
  const paymentNumber = nextNumData?.nextNumber ?? 1;

  const [claimFilter, setClaimFilter] = useState("");

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

  const treasury = useTreasurySelector();

  const [inputs, setInputs]           = useState<Record<string, string>>({});
  const [paymentDate, setPaymentDate] = useState(today());
  const [payMethod,   setPayMethod]   = useState("bank");
  const [reference,   setReference]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [distAmt,     setDistAmt]     = useState("");

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

  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback((col: SortKey) => {
    setSortDir((d) => sortKey === col ? (d === "asc" ? "desc" : "asc") : "asc");
    setSortKey(col);
  }, [sortKey]);

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

  const selectedTotal = useMemo(
    () => sortedInvoices
      .filter((inv) => selected.has(inv.invoiceId))
      .reduce((s, inv) => s + parseFloat(inv.remaining), 0),
    [sortedInvoices, selected]
  );

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

      <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border bg-muted/20 shrink-0">

        <div className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary font-bold text-sm shrink-0">
          <Hash className="h-3.5 w-3.5" />
          <span data-testid="payment-number">{String(paymentNumber).padStart(4, "0")}</span>
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">التاريخ</Label>
          <Input
            type="date" value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="h-7 w-[130px] text-xs"
            data-testid="input-payment-date"
          />
        </div>

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

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">مرجع</Label>
          <Input
            placeholder="رقم الشيك / التحويل"
            value={reference} onChange={(e) => setReference(e.target.value)}
            className="h-7 w-[140px] text-xs"
            data-testid="input-reference"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground shrink-0">ملاحظة</Label>
          <Input
            placeholder="اختياري"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className="h-7 w-[140px] text-xs"
            data-testid="input-notes"
          />
        </div>

        <TreasurySelector {...treasury} label="الخزنة:" />

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

        <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

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
