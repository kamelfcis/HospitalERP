import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RotateCcw, FileText, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { SupplierCombobox } from "./SupplierCombobox";
import { InvoiceCombobox } from "./InvoiceCombobox";
import { ReturnLinesTable } from "./ReturnLinesTable";
import { DetailModal } from "./DetailModal";
import { computeLine } from "./utils";
import type { InvoiceItem, InvoiceLine, ReturnLineEntry, ReturnTotals } from "./types";

export function CreateReturnTab() {
  const { toast } = useToast();

  const [supplierId,    setSupplierId]    = useState("");
  const [invoiceId,     setInvoiceId]     = useState("");
  const [warehouseId,   setWarehouseId]   = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [returnDate,    setReturnDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,         setNotes]         = useState("");
  const [lines,         setLines]         = useState<ReturnLineEntry[]>([]);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [successId,     setSuccessId]     = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: invoices = [] } = useQuery<InvoiceItem[]>({
    queryKey: ["/api/purchase-returns/invoices", supplierId],
    queryFn: () =>
      fetch(`/api/purchase-returns/invoices/${supplierId}`).then(r => r.json()),
    enabled: !!supplierId,
  });

  const { data: invoiceLines = [], isFetching: loadingLines } = useQuery<InvoiceLine[]>({
    queryKey: ["/api/purchase-returns/invoice-lines", invoiceId],
    queryFn: () =>
      fetch(`/api/purchase-returns/invoice-lines/${invoiceId}`).then(r => r.json()),
    enabled: !!invoiceId,
  });

  // ── Effects ──────────────────────────────────────────────────────────────────
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
      vatRate:               parseFloat(l.vatRate || "0").toFixed(2),
      isFreeItem:            l.isFreeItem,
      lotId:                 "",
      qtyReturned:           "",
      bonusQtyReturned:      parseFloat(l.bonusQty || "0") > 0
        ? parseFloat(l.bonusQty).toFixed(2)
        : "",
      subtotal:   0,
      vatAmount:  0,
      lineTotal:  0,
    })));
  }, [invoiceLines]);

  // ── Computed ──────────────────────────────────────────────────────────────────
  const totals: ReturnTotals = useMemo(() => {
    let subtotal = 0, taxTotal = 0, grandTotal = 0;
    for (const l of lines) {
      subtotal   += l.subtotal;
      taxTotal   += l.vatAmount;
      grandTotal += l.lineTotal;
    }
    return { subtotal, taxTotal, grandTotal };
  }, [lines]);

  // Arrow-key navigation: cols 0=bonus, 1=vat, 2=qty
  const NAV_COLS = 3;
  const handleNavKey = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    col: number
  ) => {
    let targetRow = rowIdx;
    let targetCol = col;
    if      (e.key === "ArrowDown")  { targetRow = rowIdx + 1; }
    else if (e.key === "ArrowUp")    { targetRow = rowIdx - 1; }
    else if (e.key === "ArrowRight") { targetCol = (col + 1) % NAV_COLS; }
    else if (e.key === "ArrowLeft")  { targetCol = (col - 1 + NAV_COLS) % NAV_COLS; }
    else return;
    e.preventDefault();
    const el = document.querySelector<HTMLInputElement>(
      `[data-nav-row="${targetRow}"][data-nav-col="${targetCol}"]`
    );
    el?.focus();
  }, []);

  const updateLine = useCallback((idx: number, patch: Partial<ReturnLineEntry>) => {
    setLines(prev => {
      const next  = [...prev];
      const l     = { ...next[idx], ...patch };
      const qty   = parseFloat(l.qtyReturned)     || 0;
      const bonus = parseFloat(l.bonusQtyReturned) || 0;
      const cost  = parseFloat(l.purchasePrice)    || 0;
      const rate  = (() => { const v = parseFloat(String(l.vatRate)); return isNaN(v) ? 0 : v; })();
      const computed = computeLine(qty, cost, rate, l.isFreeItem, bonus);
      next[idx] = { ...l, ...computed };
      return next;
    });
  }, []);

  // ── Mutation ─────────────────────────────────────────────────────────────────
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
      setInvoiceId("");
      setLines([]);
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  const activeLines = lines.filter(l => l.lotId && parseFloat(l.qtyReturned) > 0);

  const handleSave = () => {
    if (!supplierId)              return toast({ title: "يرجى اختيار المورد",          variant: "destructive" });
    if (!invoiceId)               return toast({ title: "يرجى اختيار فاتورة الشراء",   variant: "destructive" });
    if (!returnDate)              return toast({ title: "يرجى تحديد تاريخ المرتجع",    variant: "destructive" });
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
              <Button size="sm" onClick={() => {}}>
                <FileText className="h-4 w-4 ml-1" /> عرض
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Header ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">١. بيانات المرتجع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            <div className="space-y-1">
              <Label>المورد <span className="text-destructive">*</span></Label>
              <SupplierCombobox
                value={supplierId}
                onChange={v => { setSupplierId(v); setInvoiceId(""); setLines([]); }}
              />
            </div>

            <div className="space-y-1">
              <Label>فاتورة الشراء <span className="text-destructive">*</span></Label>
              <InvoiceCombobox
                invoices={invoices}
                value={invoiceId}
                onChange={v => { setInvoiceId(v); }}
                disabled={!supplierId}
                noSupplier={!supplierId}
              />
            </div>

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

            {warehouseName && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">المخزن (مسحوب من الفاتورة)</Label>
                <div className="h-9 px-3 py-2 text-sm border rounded-md bg-muted/30">{warehouseName}</div>
              </div>
            )}

            {selectedInvoice && (
              <div className="md:col-span-2 bg-muted/30 rounded-md p-3 text-sm space-y-1">
                <div className="flex gap-4 flex-wrap">
                  <span><strong>رقم الفاتورة:</strong> {selectedInvoice.supplierInvoiceNo || "—"}</span>
                  <span><strong>صافي الفاتورة:</strong> {formatCurrency(selectedInvoice.netPayable)}</span>
                  {parseFloat(selectedInvoice.totalReturns) > 0 && (
                    <span className="text-amber-600">
                      <strong>مرتجع سابق:</strong> {formatCurrency(selectedInvoice.totalReturns)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

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
            <ReturnLinesTable
              lines={lines}
              warehouseId={warehouseId}
              loadingLines={loadingLines}
              handleNavKey={handleNavKey}
              updateLine={updateLine}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Totals + Save ── */}
      {activeLines.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
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
