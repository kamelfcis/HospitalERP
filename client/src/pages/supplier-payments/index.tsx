/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة سداد الموردين — Supplier Payments
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation }          from "@tanstack/react-query";
import { useToast }                        from "@/hooks/use-toast";
import { apiRequest, queryClient }         from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Input }                           from "@/components/ui/input";
import { Button }                          from "@/components/ui/button";
import { Badge }                           from "@/components/ui/badge";
import { Label }                           from "@/components/ui/label";
import { Textarea }                        from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RefreshCw, CircleDollarSign,
} from "lucide-react";
import type { Supplier }                  from "@shared/schema/purchasing";
import type { SupplierInvoicePaymentRow } from "@shared/schema/purchasing";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BalanceResult {
  supplierId:     string;
  code:           string;
  nameAr:         string;
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

// ─── Helper ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── SupplierCombobox ─────────────────────────────────────────────────────────

function SupplierCombobox({
  value, onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", search],
    queryFn: async () => {
      const url = search
        ? `/api/suppliers?search=${encodeURIComponent(search)}&pageSize=30`
        : `/api/suppliers?pageSize=30`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });

  const suppliers = data?.suppliers ?? [];
  const selected  = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-right"
          data-testid="supplier-combobox"
        >
          {selected
            ? `${selected.nameAr} (${selected.code})`
            : "ابحث باسم المورد أو الكود..."}
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 mr-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="اسم المورد أو الكود..."
            value={search}
            onValueChange={setSearch}
            className="text-right"
          />
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup className="max-h-60 overflow-y-auto">
            {suppliers.map((s) => (
              <CommandItem
                key={s.id}
                value={s.id}
                onSelect={() => { onChange(s.id); setOpen(false); }}
                className="flex justify-between"
                data-testid={`supplier-option-${s.id}`}
              >
                <span className="text-muted-foreground text-xs">{s.code}</span>
                <span>{s.nameAr}</span>
                {value === s.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── BalanceCard ──────────────────────────────────────────────────────────────

function BalanceCard({ supplierId }: { supplierId: string }) {
  const { data, isLoading } = useQuery<BalanceResult>({
    queryKey: ["/api/supplier-payments/balance", supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/supplier-payments/balance/${supplierId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("فشل تحميل رصيد المورد");
      return res.json();
    },
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>جارٍ تحميل الرصيد...</span>
    </div>
  );
  if (!data) return null;

  const balance = parseFloat(data.currentBalance);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">رصيد افتتاحي</p>
        <p className="font-semibold text-sm" data-testid="balance-opening">
          {formatCurrency(data.openingBalance)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">إجمالي الفواتير</p>
        <p className="font-semibold text-sm text-orange-600" data-testid="balance-invoiced">
          {formatCurrency(data.totalInvoiced)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">إجمالي المدفوع</p>
        <p className="font-semibold text-sm text-green-600" data-testid="balance-paid">
          {formatCurrency(data.totalPaid)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
        <p
          className={cn(
            "font-bold text-base",
            balance > 0 ? "text-red-600" : balance < 0 ? "text-blue-600" : "text-green-600"
          )}
          data-testid="balance-current"
        >
          {formatCurrency(data.currentBalance)}
        </p>
      </div>
    </div>
  );
}

// ─── PaymentTab ───────────────────────────────────────────────────────────────

function PaymentTab({ supplierId }: { supplierId: string }) {
  const { toast } = useToast();

  // invoice list
  const { data: invoices = [], isLoading, refetch } = useQuery<SupplierInvoicePaymentRow[]>({
    queryKey: ["/api/supplier-payments/invoices", supplierId],
    queryFn: async () => {
      const res = await fetch(
        `/api/supplier-payments/invoices/${supplierId}?status=unpaid`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("فشل تحميل الفواتير");
      return res.json();
    },
    enabled: !!supplierId,
    staleTime: 5_000,
  });

  // payment inputs: invoiceId → amount string
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // payment header fields
  const [paymentDate,   setPaymentDate]   = useState(today());
  const [reference,     setReference]     = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [notes,         setNotes]         = useState("");
  const [distributeAmt, setDistributeAmt] = useState("");

  // computed totals
  const totalDistributed = useMemo(() =>
    Object.values(inputs).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [inputs]
  );

  const totalRemaining = useMemo(() =>
    invoices.reduce((s, r) => s + parseFloat(r.remaining), 0),
    [invoices]
  );

  const diff = (parseFloat(distributeAmt) || 0) - totalDistributed;

  const handleInput = useCallback((invoiceId: string, val: string) => {
    setInputs((prev) => ({ ...prev, [invoiceId]: val }));
  }, []);

  const handleAutoDistribute = () => {
    const amt = parseFloat(distributeAmt);
    if (!amt || amt <= 0) {
      toast({ title: "أدخل المبلغ الذي ستدفعه للمورد أولاً", variant: "destructive" });
      return;
    }
    let remaining = amt;
    const newInputs: Record<string, string> = {};
    for (const inv of invoices) {
      if (remaining <= 0) { newInputs[inv.invoiceId] = ""; continue; }
      const rem = parseFloat(inv.remaining);
      const pay = Math.min(rem, remaining);
      newInputs[inv.invoiceId] = pay > 0 ? pay.toFixed(2) : "";
      remaining -= pay;
    }
    setInputs(newInputs);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const lines = invoices
        .filter((inv) => (parseFloat(inputs[inv.invoiceId] ?? "0") || 0) > 0)
        .map((inv) => ({
          invoiceId:  inv.invoiceId,
          amountPaid: parseFloat(inputs[inv.invoiceId]),
        }));

      if (!lines.length) throw new Error("لم تُدخل أي مبالغ للسداد");

      return apiRequest("POST", "/api/supplier-payments", {
        supplierId,
        paymentDate,
        totalAmount:   totalDistributed,
        reference:     reference || null,
        notes:         notes || null,
        paymentMethod,
        lines,
      });
    },
    onSuccess: () => {
      toast({ title: "تم حفظ السداد بنجاح" });
      setInputs({});
      setDistributeAmt("");
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/invoices", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/balance", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/report", supplierId] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في حفظ السداد", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>جارٍ تحميل الفواتير...</span>
    </div>
  );

  if (!invoices.length) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
      <Check className="h-8 w-8 text-green-500" />
      <p>لا توجد فواتير غير مسددة لهذا المورد</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Payment header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/20">
        <div className="space-y-1">
          <Label className="text-xs">تاريخ السداد</Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            data-testid="input-payment-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">طريقة الدفع</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger data-testid="select-payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">تحويل بنكي</SelectItem>
              <SelectItem value="check">شيك</SelectItem>
              <SelectItem value="cash">نقداً</SelectItem>
              <SelectItem value="transfer">حوالة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">رقم المرجع / الشيك</Label>
          <Input
            placeholder="اختياري"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            data-testid="input-reference"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ملاحظات</Label>
          <Input
            placeholder="اختياري"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-notes"
          />
        </div>
      </div>

      {/* Auto-distribute bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
        <div className="space-y-1 flex-1 min-w-[160px]">
          <Label className="text-xs text-blue-700 dark:text-blue-300">
            المبلغ الذي ستدفعه للمورد
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={distributeAmt}
            onChange={(e) => setDistributeAmt(e.target.value)}
            className="text-left ltr"
            data-testid="input-distribute-amount"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleAutoDistribute}
          className="border-blue-400 text-blue-700 hover:bg-blue-100"
          data-testid="button-auto-distribute"
        >
          <RefreshCw className="h-4 w-4 me-1" />
          توزيع تلقائي
        </Button>

        {/* diff indicator */}
        {distributeAmt && (
          <div className={cn(
            "flex items-center gap-1 px-3 py-2 rounded-md text-sm font-semibold",
            Math.abs(diff) < 0.01
              ? "bg-green-100 text-green-700"
              : diff > 0
              ? "bg-orange-100 text-orange-700"
              : "bg-red-100 text-red-700"
          )} data-testid="distribution-diff">
            {Math.abs(diff) < 0.01 ? (
              <><Check className="h-4 w-4" /> مطابق تماماً</>
            ) : diff > 0 ? (
              <><AlertTriangle className="h-4 w-4" /> متبقى غير موزّع: {formatCurrency(diff)}</>
            ) : (
              <><AlertTriangle className="h-4 w-4" /> زيادة في التوزيع: {formatCurrency(Math.abs(diff))}</>
            )}
          </div>
        )}
      </div>

      {/* Invoice table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-right text-xs w-[90px]">كود الفاتورة</TableHead>
              <TableHead className="text-right text-xs">رقم فاتورة المورد</TableHead>
              <TableHead className="text-right text-xs w-[80px]">رقم المطالبة</TableHead>
              <TableHead className="text-right text-xs w-[100px]">التاريخ</TableHead>
              <TableHead className="text-left text-xs">صافي الفاتورة</TableHead>
              <TableHead className="text-left text-xs">المسدد سابقاً</TableHead>
              <TableHead className="text-left text-xs">الباقي</TableHead>
              <TableHead className="text-left text-xs w-[130px]">المدفوع الآن</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const remaining   = parseFloat(inv.remaining);
              const inputVal    = inputs[inv.invoiceId] ?? "";
              const inputAmount = parseFloat(inputVal) || 0;
              const isOver      = inputAmount > remaining + 0.005;

              return (
                <TableRow
                  key={inv.invoiceId}
                  className={isOver ? "bg-red-50 dark:bg-red-950/20" : ""}
                  data-testid={`invoice-row-${inv.invoiceId}`}
                >
                  <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-xs">{inv.supplierInvoiceNo || "—"}</TableCell>
                  <TableCell className="text-xs font-mono">
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
                    <Input
                      type="number"
                      min="0"
                      max={remaining}
                      step="0.01"
                      placeholder="0.00"
                      value={inputVal}
                      onChange={(e) => handleInput(inv.invoiceId, e.target.value)}
                      className={cn(
                        "h-7 text-left ltr text-xs w-[120px]",
                        isOver ? "border-red-400 focus-visible:ring-red-400" : ""
                      )}
                      data-testid={`input-payment-${inv.invoiceId}`}
                    />
                    {isOver && (
                      <p className="text-red-500 text-[10px] mt-0.5">يتجاوز المتبقي</p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="font-bold bg-muted/30">
              <TableCell colSpan={4} className="text-right text-xs">الإجمالي</TableCell>
              <TableCell className="text-left text-xs font-mono">
                {formatCurrency(invoices.reduce((s, r) => s + parseFloat(r.netPayable), 0))}
              </TableCell>
              <TableCell className="text-left text-xs font-mono">
                {formatCurrency(invoices.reduce((s, r) => s + parseFloat(r.totalPaid), 0))}
              </TableCell>
              <TableCell className="text-left text-xs font-mono text-orange-600">
                {formatCurrency(totalRemaining)}
              </TableCell>
              <TableCell className="text-left text-xs font-mono text-green-600" data-testid="total-distributed">
                {formatCurrency(totalDistributed)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Save button */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || totalDistributed <= 0}
          className="gap-2"
          data-testid="button-save-payment"
        >
          {mutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          حفظ سداد {totalDistributed > 0 ? `(${formatCurrency(totalDistributed)})` : ""}
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
    queryFn: async () => {
      const res = await fetch(
        `/api/supplier-payments/report/${supplierId}?status=${statusFilter}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("فشل تحميل التقرير");
      return res.json();
    },
    enabled: !!supplierId,
    staleTime: 5_000,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">عرض الفواتير:</Label>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as any)}
        >
          <SelectTrigger className="w-[180px]" data-testid="select-report-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الفواتير</SelectItem>
            <SelectItem value="unpaid">الغير مسددة فقط</SelectItem>
            <SelectItem value="paid">المسددة فقط</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-report-refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>جارٍ تحميل التقرير...</span>
        </div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>لا توجد بيانات بهذا الفلتر</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right text-xs w-[90px]">كود الفاتورة</TableHead>
                  <TableHead className="text-right text-xs">رقم فاتورة المورد</TableHead>
                  <TableHead className="text-right text-xs w-[80px]">رقم المطالبة</TableHead>
                  <TableHead className="text-right text-xs w-[100px]">التاريخ</TableHead>
                  <TableHead className="text-left text-xs">صافي الفاتورة</TableHead>
                  <TableHead className="text-left text-xs">المسدد</TableHead>
                  <TableHead className="text-left text-xs">المتبقي</TableHead>
                  <TableHead className="text-right text-xs">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const remaining = parseFloat(row.remaining);
                  const isPaid    = remaining <= 0.005;
                  return (
                    <TableRow key={row.invoiceId} data-testid={`report-row-${row.invoiceId}`}>
                      <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                      <TableCell className="text-xs">{row.supplierInvoiceNo || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.receivingNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateShort(row.invoiceDate)}</TableCell>
                      <TableCell className="text-left text-xs font-mono">
                        {formatCurrency(row.netPayable)}
                      </TableCell>
                      <TableCell className="text-left text-xs font-mono text-green-600">
                        {parseFloat(row.totalPaid) > 0 ? formatCurrency(row.totalPaid) : "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-left text-xs font-mono font-semibold",
                        isPaid ? "text-muted-foreground" : "text-orange-600"
                      )}>
                        {isPaid ? "مسدد" : formatCurrency(row.remaining)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isPaid ? "default" : "outline"}
                          className={cn(
                            "text-[10px]",
                            isPaid
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "border-orange-300 text-orange-600"
                          )}
                        >
                          {isPaid ? "مسدد" : "غير مسدد"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold bg-muted/30">
                  <TableCell colSpan={4} className="text-right text-xs">الإجمالي</TableCell>
                  <TableCell className="text-left text-xs font-mono" data-testid="report-total-net">
                    {formatCurrency(data?.totalNetPayable)}
                  </TableCell>
                  <TableCell className="text-left text-xs font-mono text-green-600" data-testid="report-total-paid">
                    {formatCurrency(data?.totalPaid)}
                  </TableCell>
                  <TableCell className="text-left text-xs font-mono text-orange-600" data-testid="report-total-remaining">
                    {formatCurrency(data?.totalRemaining)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-muted/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">إجمالي الفواتير</p>
              <p className="font-bold text-sm">{formatCurrency(data?.totalNetPayable)}</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 text-center">
              <p className="text-xs text-green-700 dark:text-green-300 mb-1">إجمالي المسدد</p>
              <p className="font-bold text-sm text-green-700 dark:text-green-300">
                {formatCurrency(data?.totalPaid)}
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20 text-center">
              <p className="text-xs text-orange-700 dark:text-orange-300 mb-1">إجمالي المتبقي</p>
              <p className="font-bold text-sm text-orange-700 dark:text-orange-300">
                {formatCurrency(data?.totalRemaining)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplierPaymentsPage() {
  const [supplierId, setSupplierId] = useState("");

  return (
    <div className="container mx-auto px-4 py-6 space-y-5 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <CircleDollarSign className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">سداد الموردين</h1>
          <p className="text-sm text-muted-foreground">إدارة وتسوية مستحقات الموردين</p>
        </div>
      </div>

      {/* Supplier selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">اختر المورد</Label>
        <div className="max-w-md">
          <SupplierCombobox value={supplierId} onChange={setSupplierId} />
        </div>
      </div>

      {!supplierId ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
          <Banknote className="h-10 w-10 opacity-40" />
          <p>اختر مورداً لعرض فواتيره وإجراء السداد</p>
        </div>
      ) : (
        <>
          {/* Balance */}
          <BalanceCard supplierId={supplierId} />

          {/* Tabs */}
          <Tabs defaultValue="payment" className="space-y-4">
            <TabsList className="grid grid-cols-2 w-[300px]">
              <TabsTrigger value="payment" data-testid="tab-payment">
                سداد الفواتير
              </TabsTrigger>
              <TabsTrigger value="report" data-testid="tab-report">
                تقرير المدفوعات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="payment" className="space-y-0">
              <PaymentTab supplierId={supplierId} />
            </TabsContent>

            <TabsContent value="report" className="space-y-0">
              <ReportTab supplierId={supplierId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
