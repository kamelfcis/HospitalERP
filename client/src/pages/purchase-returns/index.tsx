/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchase Returns Page — مرتجعات المشتريات
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation }    from "@tanstack/react-query";
import { useToast }                 from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button }                   from "@/components/ui/button";
import { Input }                    from "@/components/ui/input";
import { Label }                    from "@/components/ui/label";
import { Textarea }                 from "@/components/ui/textarea";
import { Badge }                    from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckIcon, ChevronsUpDown, Plus, Trash2, RotateCcw,
  FileText, Printer, AlertTriangle, CheckCircle, Loader2, Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierItem {
  id: string;
  code: string;
  nameAr: string;
  supplierType: string;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  netPayable: string;
  warehouseId: string;
  warehouseNameAr: string;
  supplierInvoiceNo: string;
  totalReturns: string;
}

interface InvoiceLine {
  id: string;
  itemId: string;
  itemNameAr: string;
  itemCode: string;
  unitLevel: string;
  qty: string;
  bonusQty: string;
  purchasePrice: string;
  vatRate: string;
  vatAmount: string;
  valueBeforeVat: string;
  isFreeItem: boolean;
}

interface AvailableLot {
  id: string;
  warehouseId: string;
  expiryDate: string | null;
  purchasePrice: string;
  qtyInMinor: string;
}

interface ReturnLineEntry {
  purchaseInvoiceLineId: string;
  itemId:     string;
  itemNameAr: string;
  itemCode:   string;
  invoiceQty:      string;
  invoiceBonusQty: string;   // bonus qty from original invoice (for display/reference)
  purchasePrice:   string;
  vatRate:         string;
  isFreeItem:      boolean;
  lotId:           string;
  qtyReturned:     string;
  bonusQtyReturned: string;  // user-entered: how many bonus units are being returned
  // computed
  subtotal:  number;
  vatAmount: number;
  lineTotal: number;
}

interface ReturnRecord {
  id: string;
  returnNumber: number;
  returnDate: string;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  journalStatus: string | null;
  supplierNameAr: string;
  warehouseNameAr: string;
  invoiceNumber: number;
  supplierInvoiceNo: string;
}

interface ReturnDetail {
  id: string;
  returnNumber: number;
  returnDate: string;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  journalStatus: string | null;
  journalEntryId: string | null;
  supplierNameAr: string;
  warehouseNameAr: string;
  invoiceNumber: number;
  supplierInvoiceNo: string;
  lines: {
    id: string;
    itemNameAr: string;
    itemCode: string;
    lotId: string;
    lotExpiryDate: string | null;
    qtyReturned:      string;
    bonusQtyReturned: string;
    unitCost:  string;
    isFreeItem: boolean;
    vatRate:    string;
    vatAmount:  string;
    subtotal:   string;
    lineTotal:  string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// VAT base = (qty + bonusQty) × cost  [mirrors purchase invoice formula]
// subtotal  =  qty             × cost  [only paid units]
function computeLine(
  qty: number, unitCost: number, vatRate: number,
  isFreeItem: boolean, bonusQty: number = 0
) {
  const cost     = isFreeItem ? 0 : unitCost;
  const subtotal = Math.round(qty * cost * 100) / 100;
  const vatBase  = (qty + bonusQty) * cost;
  const vatAmt   = Math.round(vatBase * vatRate / 100 * 100) / 100;
  return { subtotal, vatAmount: vatAmt, lineTotal: subtotal + vatAmt };
}

// ─── SupplierCombobox ─────────────────────────────────────────────────────────

function SupplierCombobox({
  value, onChange
}: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");

  const { data: suppliers = [], isLoading } = useQuery<SupplierItem[]>({
    queryKey: ["/api/suppliers/search", search],
    queryFn: () =>
      fetch(`/api/suppliers/search?q=${encodeURIComponent(search)}&limit=40`).then(r => r.json()),
  });

  const { data: selectedSupplier } = useQuery<SupplierItem>({
    queryKey: ["/api/suppliers", value],
    queryFn: () => fetch(`/api/suppliers/${value}`).then(r => r.json()),
    enabled: !!value && !suppliers.find(s => s.id === value),
  });

  const filtered  = suppliers;
  const selected  = suppliers.find(s => s.id === value) ?? selectedSupplier;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid="supplier-combobox"
        >
          {selected ? `${selected.code} — ${selected.nameAr}` : "اختر المورد…"}
          <ChevronsUpDown className="mr-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="بحث بالاسم أو الكود…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading && <CommandEmpty>جارٍ التحميل…</CommandEmpty>}
            {!isLoading && filtered.length === 0 && <CommandEmpty>لا توجد نتائج.</CommandEmpty>}
            <CommandGroup>
              {filtered.map(s => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                >
                  <CheckIcon className={cn("ml-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  <span>{s.code}</span>
                  <span className="mx-2 text-muted-foreground">—</span>
                  <span>{s.nameAr}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── LotSelector ─────────────────────────────────────────────────────────────

function LotSelector({
  itemId, warehouseId, value, onChange
}: { itemId: string; warehouseId: string; value: string; onChange: (v: string) => void }) {
  const { data: lots = [], isLoading } = useQuery<AvailableLot[]>({
    queryKey: ["/api/purchase-returns/lots", itemId, warehouseId],
    queryFn: () => fetch(`/api/purchase-returns/lots?itemId=${itemId}&warehouseId=${warehouseId}`)
      .then(r => r.json()),
    enabled: !!(itemId && warehouseId),
  });

  const selected = lots.find(l => l.id === value);

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || lots.length === 0}>
      <SelectTrigger className="h-8 text-xs" data-testid={`lot-select-${itemId}`}>
        <SelectValue placeholder={isLoading ? "جارٍ التحميل…" : lots.length === 0 ? "لا توجد كميات" : "اختر اللوت"} />
      </SelectTrigger>
      <SelectContent>
        {lots.map(l => (
          <SelectItem key={l.id} value={l.id}>
            {l.expiryDate
              ? `ت.انتهاء: ${l.expiryDate} | متاح: ${parseFloat(l.qtyInMinor).toFixed(2)}`
              : `بدون تاريخ | متاح: ${parseFloat(l.qtyInMinor).toFixed(2)}`
            }
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── PrintView (مرتجع واحد) ────────────────────────────────────────────────

function PrintContent({ ret }: { ret: ReturnDetail }) {
  return (
    <div className="print-only font-[Arial] text-sm" dir="rtl">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">مرتجع مشتريات</h2>
        <p>رقم: RT-{String(ret.returnNumber).padStart(4, "0")}</p>
        <p>التاريخ: {formatDateShort(ret.returnDate)}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4 border p-2 rounded">
        <div><strong>المورد:</strong> {ret.supplierNameAr}</div>
        <div><strong>المخزن:</strong> {ret.warehouseNameAr}</div>
        <div><strong>فاتورة الشراء:</strong> #{ret.invoiceNumber}</div>
        <div><strong>رقم الفاتورة:</strong> {ret.supplierInvoiceNo}</div>
      </div>
      <table className="w-full border-collapse border text-xs mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1 text-right">الصنف</th>
            <th className="border p-1 text-center">اللوت</th>
            <th className="border p-1 text-center">الكمية</th>
            <th className="border p-1 text-center">هدية</th>
            <th className="border p-1 text-center">السعر</th>
            <th className="border p-1 text-center">الإجمالي</th>
            <th className="border p-1 text-center">الضريبة</th>
            <th className="border p-1 text-center">الصافي</th>
          </tr>
        </thead>
        <tbody>
          {ret.lines.map(l => (
            <tr key={l.id}>
              <td className="border p-1">{l.itemNameAr} {l.isFreeItem && <span>(هدية)</span>}</td>
              <td className="border p-1 text-center">{l.lotExpiryDate ?? "—"}</td>
              <td className="border p-1 text-center">{parseFloat(l.qtyReturned).toFixed(2)}</td>
              <td className="border p-1 text-center">
                {parseFloat(l.bonusQtyReturned) > 0 ? parseFloat(l.bonusQtyReturned).toFixed(2) : "—"}
              </td>
              <td className="border p-1 text-center">{formatCurrency(l.unitCost)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.subtotal)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.vatAmount)}</td>
              <td className="border p-1 text-center">{formatCurrency(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-gray-50">
            <td className="border p-1" colSpan={5} />
            <td className="border p-1 text-center">{formatCurrency(ret.subtotal)}</td>
            <td className="border p-1 text-center">{formatCurrency(ret.taxTotal)}</td>
            <td className="border p-1 text-center">{formatCurrency(ret.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
      {ret.notes && <p><strong>ملاحظات:</strong> {ret.notes}</p>}
    </div>
  );
}

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<ReturnDetail>({
    queryKey: ["/api/purchase-returns", returnId],
    queryFn: () => fetch(`/api/purchase-returns/${returnId}`).then(r => r.json()),
  });

  const handlePrint = () => window.print();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            مرتجع مشتريات
            {data && ` — RT-${String(data.returnNumber).padStart(4, "0")}`}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4 bg-muted/30 p-3 rounded">
              <div><span className="text-muted-foreground">المورد: </span><strong>{data.supplierNameAr}</strong></div>
              <div><span className="text-muted-foreground">المخزن: </span><strong>{data.warehouseNameAr}</strong></div>
              <div><span className="text-muted-foreground">فاتورة المشتريات: </span><strong>#{data.invoiceNumber} ({data.supplierInvoiceNo})</strong></div>
              <div><span className="text-muted-foreground">تاريخ المرتجع: </span><strong>{formatDateShort(data.returnDate)}</strong></div>
              <div>
                <span className="text-muted-foreground">حالة القيد: </span>
                <Badge variant={data.journalStatus === "posted" ? "default" : "secondary"}>
                  {data.journalStatus === "posted" ? "مُرحَّل" : data.journalStatus ?? "—"}
                </Badge>
              </div>
              {data.notes && <div className="col-span-2"><span className="text-muted-foreground">ملاحظات: </span>{data.notes}</div>}
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-right p-2 border">الصنف</th>
                  <th className="text-center p-2 border">انتهاء اللوت</th>
                  <th className="text-center p-2 border">الكمية</th>
                  <th className="text-center p-2 border">هدية</th>
                  <th className="text-center p-2 border">سعر الوحدة</th>
                  <th className="text-center p-2 border">الإجمالي</th>
                  <th className="text-center p-2 border">ض.ق.م</th>
                  <th className="text-center p-2 border">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(l => (
                  <tr key={l.id} className="hover:bg-muted/20">
                    <td className="p-2 border">
                      {l.itemNameAr}
                      {l.isFreeItem && <Badge variant="outline" className="mr-1 text-[10px]">هدية</Badge>}
                    </td>
                    <td className="p-2 border text-center">{l.lotExpiryDate ?? "—"}</td>
                    <td className="p-2 border text-center">{parseFloat(l.qtyReturned).toFixed(2)}</td>
                    <td className="p-2 border text-center">
                      {parseFloat(l.bonusQtyReturned) > 0 ? parseFloat(l.bonusQtyReturned).toFixed(2) : "—"}
                    </td>
                    <td className="p-2 border text-center">{formatCurrency(l.unitCost)}</td>
                    <td className="p-2 border text-center">{formatCurrency(l.subtotal)}</td>
                    <td className="p-2 border text-center">{formatCurrency(l.vatAmount)}</td>
                    <td className="p-2 border text-center font-medium">{formatCurrency(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td className="p-2 border" colSpan={5} />
                  <td className="p-2 border text-center">{formatCurrency(data.subtotal)}</td>
                  <td className="p-2 border text-center">{formatCurrency(data.taxTotal)}</td>
                  <td className="p-2 border text-center text-primary">{formatCurrency(data.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <PrintContent ret={data} />
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="btn-print-return">
            <Printer className="h-4 w-4 ml-2" /> طباعة
          </Button>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");
  const [viewId, setViewId]       = useState<string | null>(null);
  const [page, setPage]           = useState(1);

  const { data, isLoading } = useQuery<{ returns: ReturnRecord[]; total: number }>({
    queryKey: ["/api/purchase-returns", { fromDate, toDate, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate)   params.set("toDate",   toDate);
      return fetch(`/api/purchase-returns?${params}`).then(r => r.json());
    },
  });

  const returns = data?.returns ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 p-3 rounded-lg">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">من تاريخ</Label>
          <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm" data-testid="filter-from-date" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
          <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm" data-testid="filter-to-date" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); setPage(1); }}>
          <RotateCcw className="h-4 w-4 ml-1" /> مسح
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : returns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا توجد مرتجعات مشتريات بعد.</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-right p-3">رقم المرتجع</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3">المورد</th>
                <th className="text-right p-3">فاتورة الشراء</th>
                <th className="text-right p-3">المخزن</th>
                <th className="text-center p-3">الإجمالي قبل الضريبة</th>
                <th className="text-center p-3">ض.ق.م</th>
                <th className="text-center p-3">الإجمالي</th>
                <th className="text-center p-3">القيد</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/20 cursor-pointer"
                  onClick={() => setViewId(r.id)} data-testid={`row-return-${r.id}`}>
                  <td className="p-3 font-mono">RT-{String(r.returnNumber).padStart(4, "0")}</td>
                  <td className="p-3">{formatDateShort(r.returnDate)}</td>
                  <td className="p-3">{r.supplierNameAr}</td>
                  <td className="p-3 font-mono">#{r.invoiceNumber}</td>
                  <td className="p-3">{r.warehouseNameAr}</td>
                  <td className="p-3 text-center">{formatCurrency(r.subtotal)}</td>
                  <td className="p-3 text-center">{formatCurrency(r.taxTotal)}</td>
                  <td className="p-3 text-center font-medium text-primary">{formatCurrency(r.grandTotal)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={r.journalStatus === "posted" ? "default" : "secondary"} className="text-[10px]">
                      {r.journalStatus === "posted" ? "مُرحَّل" : r.journalStatus ?? "—"}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="sm" data-testid={`btn-view-return-${r.id}`}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(data?.total ?? 0) > 50 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            السابق
          </Button>
          <span className="text-sm text-muted-foreground py-1 px-2">
            صفحة {page} من {Math.ceil((data?.total ?? 0) / 50)}
          </span>
          <Button size="sm" variant="outline"
            disabled={page >= Math.ceil((data?.total ?? 0) / 50)}
            onClick={() => setPage(p => p + 1)}>
            التالي
          </Button>
        </div>
      )}

      {viewId && <DetailModal returnId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

// ─── CreateReturnTab ──────────────────────────────────────────────────────────

function CreateReturnTab() {
  const { toast } = useToast();

  // Form state
  const [supplierId,   setSupplierId]   = useState("");
  const [invoiceId,    setInvoiceId]    = useState("");
  const [warehouseId,  setWarehouseId]  = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [returnDate,   setReturnDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState("");
  const [lines,        setLines]        = useState<ReturnLineEntry[]>([]);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [successId,    setSuccessId]    = useState<string | null>(null);

  // Queries
  const { data: invoices = [] } = useQuery<InvoiceItem[]>({
    queryKey: ["/api/purchase-returns/invoices", supplierId],
    queryFn: () => fetch(`/api/purchase-returns/invoices/${supplierId}`).then(r => r.json()),
    enabled: !!supplierId,
  });

  const { data: invoiceLines = [], isFetching: loadingLines } = useQuery<InvoiceLine[]>({
    queryKey: ["/api/purchase-returns/invoice-lines", invoiceId],
    queryFn: () => fetch(`/api/purchase-returns/invoice-lines/${invoiceId}`).then(r => r.json()),
    enabled: !!invoiceId,
  });

  // When invoice is selected → auto-fill warehouse + reset lines
  useEffect(() => {
    if (!invoiceId) {
      setLines([]);
      setWarehouseId("");
      setWarehouseName("");
      return;
    }
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) {
      setWarehouseId(inv.warehouseId);
      setWarehouseName(inv.warehouseNameAr);
    }
    setLines([]);
  }, [invoiceId]);

  // When invoice lines load → populate line entries (all lines, qty=0 initially)
  useEffect(() => {
    if (!invoiceLines.length) return;
    setLines(invoiceLines.map(l => ({
      purchaseInvoiceLineId: l.id,
      itemId:                l.itemId,
      itemNameAr:            l.itemNameAr,
      itemCode:              l.itemCode,
      invoiceQty:            l.qty,
      invoiceBonusQty:       l.bonusQty,
      purchasePrice:         l.purchasePrice,
      vatRate:               l.vatRate,
      isFreeItem:            l.isFreeItem,
      lotId:                 "",
      qtyReturned:           "",
      bonusQtyReturned:      "",
      subtotal:              0,
      vatAmount:             0,
      lineTotal:             0,
    })));
  }, [invoiceLines]);

  // Computed totals
  const totals = useMemo(() => {
    let subtotal = 0, taxTotal = 0, grandTotal = 0;
    for (const l of lines) {
      subtotal  += l.subtotal;
      taxTotal  += l.vatAmount;
      grandTotal += l.lineTotal;
    }
    return { subtotal, taxTotal, grandTotal };
  }, [lines]);

  // Recompute a single line when qty / bonus / vatRate / lot changes
  const updateLine = useCallback((idx: number, patch: Partial<ReturnLineEntry>) => {
    setLines(prev => {
      const next  = [...prev];
      const l     = { ...next[idx], ...patch };
      const qty   = parseFloat(l.qtyReturned)     || 0;
      const bonus = parseFloat(l.bonusQtyReturned) || 0;
      const cost  = parseFloat(l.purchasePrice)    || 0;
      const rate  = (() => { const v = parseFloat(String(l.vatRate)); return isNaN(v) ? 0 : v; })();
      const { subtotal, vatAmount, lineTotal } = computeLine(qty, cost, rate, l.isFreeItem, bonus);
      next[idx] = { ...l, subtotal, vatAmount, lineTotal };
      return next;
    });
  }, []);

  // Mutation
  const mutation = useMutation({
    mutationFn: (payload: object) =>
      apiRequestJson<{ id: string; returnNumber: number; journalStatus: string | null }>(
        "POST", "/api/purchase-returns", payload
      ),
    onSuccess: (result) => {
      toast({ title: `تم حفظ المرتجع RT-${String(result.returnNumber).padStart(4, "0")} بنجاح ✓` });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/balance", supplierId] });
      setSuccessId(result.id);
      // Reset form
      setInvoiceId("");
      setLines([]);
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  // Active lines (those with lotId + qty > 0)
  const activeLines = lines.filter(l => l.lotId && parseFloat(l.qtyReturned) > 0);

  const handleSave = () => {
    if (!supplierId)           return toast({ title: "يرجى اختيار المورد", variant: "destructive" });
    if (!invoiceId)            return toast({ title: "يرجى اختيار فاتورة الشراء", variant: "destructive" });
    if (!returnDate)           return toast({ title: "يرجى تحديد تاريخ المرتجع", variant: "destructive" });
    if (activeLines.length === 0) return toast({ title: "يرجى إضافة كمية مرتجعة مع اختيار لوت لأصناف واحد على الأقل", variant: "destructive" });
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    mutation.mutate({
      purchaseInvoiceId: invoiceId,
      supplierId,
      warehouseId,
      returnDate,
      notes: notes || null,
      lines: activeLines.map(l => ({
        purchaseInvoiceLineId: l.purchaseInvoiceLineId,
        lotId:                 l.lotId,
        qtyReturned:           parseFloat(l.qtyReturned),
        bonusQtyReturned:      parseFloat(l.bonusQtyReturned) || 0,
        vatRateOverride:       parseFloat(l.vatRate) || 0,
      })),
    });
  };

  const selectedInvoice = invoices.find(i => i.id === invoiceId);

  return (
    <div className="space-y-5" dir="rtl">

      {/* Success banner */}
      {successId && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              تم حفظ المرتجع بنجاح وتم ترحيل القيد المحاسبي.
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSuccessId(null)}>
                مرتجع جديد
              </Button>
              <Button size="sm" onClick={() => { /* handled by detail modal */ }}>
                <FileText className="h-4 w-4 ml-1" />
                عرض
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Supplier ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">١. بيانات المرتجع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Supplier */}
            <div className="space-y-1">
              <Label>المورد <span className="text-destructive">*</span></Label>
              <SupplierCombobox
                value={supplierId}
                onChange={v => { setSupplierId(v); setInvoiceId(""); setLines([]); }}
              />
            </div>

            {/* Invoice */}
            <div className="space-y-1">
              <Label>فاتورة الشراء <span className="text-destructive">*</span></Label>
              <Select
                value={invoiceId}
                onValueChange={setInvoiceId}
                disabled={!supplierId || invoices.length === 0}
              >
                <SelectTrigger data-testid="invoice-select">
                  <SelectValue placeholder={
                    !supplierId ? "اختر المورد أولاً" :
                    invoices.length === 0 ? "لا توجد فواتير معتمدة" :
                    "اختر فاتورة الشراء…"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      #{inv.invoiceNumber} — {formatDateShort(inv.invoiceDate)}
                      {inv.totalReturns && parseFloat(inv.totalReturns) > 0
                        ? ` (مرتجع: ${formatCurrency(inv.totalReturns)})`
                        : ""}
                      — {inv.warehouseNameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label>تاريخ المرتجع <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
                className="h-9"
                data-testid="return-date"
              />
            </div>

            {/* Warehouse (read-only from invoice) */}
            {warehouseName && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">المخزن (مسحوب من الفاتورة)</Label>
                <div className="h-9 px-3 py-2 text-sm border rounded-md bg-muted/30">{warehouseName}</div>
              </div>
            )}

            {/* Invoice summary */}
            {selectedInvoice && (
              <div className="md:col-span-2 bg-muted/30 rounded-md p-3 text-sm space-y-1">
                <div className="flex gap-4 flex-wrap">
                  <span><strong>رقم الفاتورة:</strong> {selectedInvoice.supplierInvoiceNo || "—"}</span>
                  <span><strong>صافي الفاتورة:</strong> {formatCurrency(selectedInvoice.netPayable)}</span>
                  {parseFloat(selectedInvoice.totalReturns) > 0 && (
                    <span className="text-amber-600"><strong>مرتجع سابق:</strong> {formatCurrency(selectedInvoice.totalReturns)}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {invoiceId && (
            <div className="mt-4 space-y-1">
              <Label>ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية…"
                rows={2}
                data-testid="notes-input"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Lines ── */}
      {invoiceId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">٢. أصناف المرتجع</CardTitle>
              <div className="text-xs text-muted-foreground">
                أدخل الكمية المرتجعة واختر اللوت لكل صنف تريد إرجاعه
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLines ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : lines.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">لا توجد أصناف في هذه الفاتورة.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-right p-2 min-w-[160px]">الصنف</th>
                      <th className="text-center p-2 w-[75px]">كمية الفاتورة</th>
                      <th className="text-center p-2 w-[65px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center gap-1 cursor-help">
                                هدية <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                              كمية البونص المرتجع — تؤثر على وعاء الضريبة فقط، لا على المبلغ الأساسي
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-center p-2 w-[85px]">سعر الشراء</th>
                      <th className="text-center p-2 w-[60px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center gap-1 cursor-help">
                                ض.ق.م% <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                              نسبة الضريبة مستوردة تلقائياً من الفاتورة الأصلية — يمكن تعديلها لتصحيح أخطاء الإدخال
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-right p-2 min-w-[210px]">اللوت</th>
                      <th className="text-center p-2 w-[95px]">كمية المرتجع</th>
                      <th className="text-center p-2 w-[85px]">قبل الضريبة</th>
                      <th className="text-center p-2 w-[70px]">ض.ق.م</th>
                      <th className="text-center p-2 w-[85px]">الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const hasQty = parseFloat(l.qtyReturned) > 0;
                      const isValid = hasQty && !!l.lotId;
                      return (
                        <tr key={l.purchaseInvoiceLineId}
                          className={cn("border-b", isValid ? "bg-green-50/30 dark:bg-green-950/10" : "")}>
                          <td className="p-2">
                            <div className="font-medium">{l.itemNameAr}</div>
                            <div className="text-muted-foreground text-[10px]">{l.itemCode}</div>
                            {l.isFreeItem && (
                              <Badge variant="outline" className="text-[10px] mt-0.5">هدية</Badge>
                            )}
                          </td>
                          <td className="p-2 text-center">{parseFloat(l.invoiceQty).toFixed(2)}</td>
                          {/* Bonus qty returned */}
                          <td className="p-2 text-center">
                            {parseFloat(l.invoiceBonusQty) > 0 ? (
                              <Input
                                type="number"
                                min="0"
                                max={parseFloat(l.invoiceBonusQty)}
                                step="0.01"
                                value={l.bonusQtyReturned}
                                onChange={e => updateLine(idx, { bonusQtyReturned: e.target.value })}
                                className="h-7 text-xs text-center px-1 w-full"
                                placeholder="0"
                                data-testid={`bonus-qty-${l.purchaseInvoiceLineId}`}
                              />
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {l.isFreeItem ? <span className="text-muted-foreground">—</span> : formatCurrency(l.purchasePrice)}
                          </td>
                          <td className="p-2 text-center">
                            {l.isFreeItem ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={l.vatRate}
                                  onChange={e => updateLine(idx, { vatRate: e.target.value })}
                                  className="h-7 w-14 text-xs text-center px-1"
                                  data-testid={`vat-rate-${l.purchaseInvoiceLineId}`}
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <LotSelector
                              itemId={l.itemId}
                              warehouseId={warehouseId}
                              value={l.lotId}
                              onChange={v => updateLine(idx, { lotId: v })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.qtyReturned}
                              onChange={e => updateLine(idx, { qtyReturned: e.target.value })}
                              className={cn(
                                "h-7 text-xs text-center",
                                hasQty && !l.lotId ? "border-destructive" : ""
                              )}
                              placeholder="0"
                              data-testid={`qty-input-${l.purchaseInvoiceLineId}`}
                            />
                            {hasQty && !l.lotId && (
                              <div className="text-[10px] text-destructive mt-0.5">اختر اللوت</div>
                            )}
                          </td>
                          <td className="p-2 text-center font-mono">
                            {l.subtotal > 0 ? formatCurrency(l.subtotal) : "—"}
                          </td>
                          <td className="p-2 text-center font-mono">
                            {l.vatAmount > 0 ? formatCurrency(l.vatAmount) : "—"}
                          </td>
                          <td className="p-2 text-center font-mono font-medium">
                            {l.lineTotal > 0 ? formatCurrency(l.lineTotal) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Totals + Save ── */}
      {activeLines.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Totals */}
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">قبل الضريبة</div>
                  <div className="font-semibold text-lg">{formatCurrency(totals.subtotal)}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">ضريبة القيمة المضافة</div>
                  <div className="font-semibold text-lg">{formatCurrency(totals.taxTotal)}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">الإجمالي</div>
                  <div className="font-bold text-xl text-primary">{formatCurrency(totals.grandTotal)}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">عدد الأصناف</div>
                  <div className="font-semibold text-lg">{activeLines.length}</div>
                </div>
              </div>

              {/* Save button */}
              <Button
                size="lg"
                onClick={handleSave}
                disabled={mutation.isPending}
                data-testid="btn-save-return"
              >
                {mutation.isPending
                  ? <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جارٍ الحفظ…</>
                  : <><RotateCcw className="h-4 w-4 ml-2" /> حفظ المرتجع نهائياً</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm Dialog ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              تأكيد حفظ المرتجع
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>سيتم إنشاء مرتجع مشتريات بشكل نهائي غير قابل للتعديل.</p>
                <div className="bg-muted/50 rounded-md p-3 space-y-1 text-right">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">عدد الأصناف:</span>
                    <strong>{activeLines.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">قبل الضريبة:</span>
                    <strong>{formatCurrency(totals.subtotal)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ض.ق.م:</span>
                    <strong>{formatCurrency(totals.taxTotal)}</strong>
                  </div>
                  <div className="flex justify-between text-primary font-bold">
                    <span>الإجمالي الكلي:</span>
                    <strong>{formatCurrency(totals.grandTotal)}</strong>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  سيتم خصم الكميات من المخزن وإنشاء قيد محاسبي تلقائياً.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} data-testid="btn-confirm-save">
              تأكيد الحفظ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail after save */}
      {successId && (
        <DetailModal returnId={successId} onClose={() => setSuccessId(null)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PurchaseReturnsPage() {
  return (
    <div className="p-6 space-y-4 min-h-screen" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">مرتجعات المشتريات</h1>
        <p className="text-muted-foreground text-sm">إرجاع أصناف للموردين مع خصم المخزون وتسوية الذمم</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create" data-testid="tab-create">إنشاء مرتجع</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">سجل المرتجعات</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateReturnTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
