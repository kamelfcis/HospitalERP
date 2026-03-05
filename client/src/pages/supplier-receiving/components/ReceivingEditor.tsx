/**
 * ReceivingEditor — المحرر الكامل لإذن الاستلام (Compound Component)
 *
 * يجمع: بيانات الرأس + جدول السطور + شريط الأدوات + نوافذ الحوار.
 * لا يحمل حالة — كل شيء يأتي من الـ orchestrator (index.tsx).
 */
import { useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Send, RotateCcw, FileText, ScanBarcode, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import { StockStatsDialog } from "@/components/StockStatsDialog";
import { receivingStatusLabels } from "@shared/schema";
import type { Warehouse, Supplier } from "@shared/schema";

import { ReceivingLineTable } from "./ReceivingLineTable";
import { QuickSupplierDialog } from "./QuickSupplierDialog";
import type { ReceivingFormState } from "../hooks/useReceivingForm";
import type { UseReceivingLinesReturn } from "../hooks/useReceivingLines";
import type { AutoSaveStatus } from "../hooks/useAutoSave";
import type { UseSupplierSearchReturn } from "../hooks/useSupplierSearch";
import type { ReceivingLineLocal } from "../types";

interface Props {
  // ── حالة النموذج ──
  form:           ReceivingFormState;
  lines:          UseReceivingLinesReturn;
  supplierSearch: UseSupplierSearchReturn;
  autoSaveStatus: AutoSaveStatus;
  grandTotal:     number;
  isPending:      boolean;

  // ── نافذة تأكيد الترحيل ──
  confirmPostOpen: boolean;
  setConfirmPostOpen: (v: boolean) => void;

  // ── نافذة البحث عن صنف ──
  itemSearchOpen: boolean;
  setItemSearchOpen: (v: boolean) => void;

  // ── نافذة إحصاء المخزون ──
  statsItemId:    string | null;
  statsData:      any[];
  statsLoading:   boolean;
  setStatsItemId: (id: string | null) => void;
  openStats:      (itemId: string) => void;

  // ── نافذة إضافة مورد سريع ──
  quickSupplierOpen: boolean;
  setQuickSupplierOpen: (v: boolean) => void;

  // ── mutations ──
  onSaveDraft:  () => void;
  onPost:       () => void;
  onNew:        () => void;
  onConvertForm: () => void;
  onCorrectForm: () => void;

  // ── scanner ──
  barcodeDisplay:    string;
  setBarcodeDisplay: (v: string) => void;
  barcodeLoading:    boolean;
  barcodeInputRef:   React.RefObject<HTMLInputElement>;
  onBarcodeSubmit:   () => void;

  // ── data ──
  warehouses: Warehouse[];
  canSaveDraft: boolean;

  // ── inline add item ──
  onItemSelected: (item: any) => void;
}

export function ReceivingEditor({
  form, lines, supplierSearch, autoSaveStatus, grandTotal, isPending,
  confirmPostOpen, setConfirmPostOpen,
  itemSearchOpen, setItemSearchOpen,
  statsItemId, statsData, statsLoading, setStatsItemId, openStats,
  quickSupplierOpen, setQuickSupplierOpen,
  onSaveDraft, onPost, onNew, onConvertForm, onCorrectForm,
  barcodeDisplay, setBarcodeDisplay, barcodeLoading, barcodeInputRef, onBarcodeSubmit,
  warehouses, canSaveDraft,
  onItemSelected,
}: Props) {
  const { isViewOnly, formStatus, formCorrectionStatus, formConvertedToInvoiceId,
    formReceivingNumber, invoiceDuplicateError } = form;

  // شرط إضافة الأصناف: لازم المستودع والمورد ورقم فاتورة المورد مكملين
  const canAddItems = !isViewOnly
    && !!form.warehouseId
    && !!form.supplierId
    && !!form.supplierInvoiceNo.trim();

  const { toast: addToast } = useToast();
  const handleOpenItemSearch = useCallback(() => {
    if (!form.warehouseId) {
      addToast({ title: "اختر المستودع أولاً", variant: "destructive" });
      return;
    }
    if (!form.supplierId) {
      addToast({ title: "اختر المورد أولاً", variant: "destructive" });
      return;
    }
    if (!form.supplierInvoiceNo.trim()) {
      addToast({ title: "أدخل رقم فاتورة المورد أولاً", variant: "destructive" });
      return;
    }
    setItemSearchOpen(true);
  }, [form.warehouseId, form.supplierId, form.supplierInvoiceNo, setItemSearchOpen, addToast]);

  const lineFieldFocusedRef = lines.lineFieldFocusedRef;
  const safeFocusBarcode = useCallback((delay = 50) => {
    setTimeout(() => { if (!lineFieldFocusedRef.current) barcodeInputRef.current?.focus(); }, delay);
  }, [lineFieldFocusedRef, barcodeInputRef]);

  // ── F2 → تركيز على الباركود ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); safeFocusBarcode(0); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [safeFocusBarcode]);

  // ── تركيز تلقائي على الباركود عند فتح التبويب ────────────────────────────
  useEffect(() => {
    if (!itemSearchOpen) {
      const t = setTimeout(() => { if (!lineFieldFocusedRef.current) safeFocusBarcode(0); }, 100);
      return () => clearTimeout(t);
    }
  }, [itemSearchOpen, safeFocusBarcode, lineFieldFocusedRef]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-testid^='input-qty-']")) return;
    if (t.closest("button") || t.closest("input") || t.closest("select")) return;
    if (t.closest("[role='dialog']") || t.closest("[role='listbox']")) return;
    if (t.closest("[data-expiry-input]")) return;
    if (!itemSearchOpen && !lineFieldFocusedRef.current) safeFocusBarcode();
  }, [itemSearchOpen, safeFocusBarcode, lineFieldFocusedRef]);

  return (
    <div onClick={handleContainerClick}>
      {/* ── بانرات الحالة ─────────────────────────────────────────────────── */}
      {isViewOnly && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-2 mb-2 text-center text-sm text-amber-800 dark:text-amber-200" data-testid="banner-read-only">
          {receivingStatusLabels[formStatus as keyof typeof receivingStatusLabels] || formStatus} — للعرض فقط
        </div>
      )}
      {formCorrectionStatus === "correction" && (
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md p-2 mb-2 text-center text-sm text-purple-800 dark:text-purple-200" data-testid="banner-correction">
          مستند تصحيح — يمكنك تعديل الأصناف ثم الترحيل لتطبيق التصحيح
        </div>
      )}
      {formCorrectionStatus === "corrected" && isViewOnly && (
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-md p-2 mb-2 text-center text-sm text-orange-800 dark:text-orange-200" data-testid="banner-corrected">
          تم تصحيح هذا المستند
        </div>
      )}

      {/* ── رأس الإذن (sticky) ────────────────────────────────────────────── */}
      <ReceivingHeaderBar
        form={form}
        supplierSearch={supplierSearch}
        warehouses={warehouses}
        onOpenQuickSupplier={() => setQuickSupplierOpen(true)}
      />

      {/* ── شريط الباركود ────────────────────────────────────────────────── */}
      {!isViewOnly && (
        <div className="flex items-center gap-2 px-2 mt-2">
          <ScanBarcode className={`h-4 w-4 shrink-0 ${canAddItems ? "text-muted-foreground" : "text-muted-foreground/40"}`} />
          <Input
            ref={barcodeInputRef}
            type="text"
            value={barcodeDisplay}
            onChange={(e) => canAddItems && setBarcodeDisplay(e.target.value)}
            onKeyDown={(e) => {
              if (!canAddItems) { e.preventDefault(); return; }
              if (e.key === "Enter" && barcodeDisplay.trim()) {
                e.preventDefault();
                onBarcodeSubmit();
              }
            }}
            placeholder={
              !form.warehouseId            ? "اختر المستودع أولاً..." :
              !form.supplierId             ? "اختر المورد أولاً..." :
              !form.supplierInvoiceNo.trim() ? "أدخل رقم فاتورة المورد أولاً..." :
              "امسح الباركود هنا... (F2)"
            }
            className={`h-7 text-[11px] px-2 max-w-[300px] ${!canAddItems ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={barcodeLoading || !canAddItems}
            data-testid="input-barcode-scan"
          />
          {barcodeLoading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      )}

      {/* ── بانر أخطاء التحقق ────────────────────────────────────────────── */}
      {lines.lineErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-2 my-2 text-center text-sm text-red-800 dark:text-red-200" data-testid="banner-validation-errors">
          تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة
        </div>
      )}

      {/* ── جدول السطور ──────────────────────────────────────────────────── */}
      <div className="mt-2">
        <ReceivingLineTable
          lines={lines.formLines}
          lineErrors={lines.lineErrors}
          isViewOnly={isViewOnly}
          onUpdateLine={lines.updateLine}
          onDeleteLine={lines.handleDeleteLine}
          onOpenStats={openStats}
          qtyInputRefs={lines.qtyInputRefs}
          salePriceInputRefs={lines.salePriceInputRefs}
          expiryInputRefs={lines.expiryInputRefs}
          lineFieldFocusedRef={lines.lineFieldFocusedRef}
          focusedLineIdx={lines.focusedLineIdx}
          setFocusedLineIdx={lines.setFocusedLineIdx}
        />
      </div>

      {/* ── شريط الأزرار (مسودة) ─────────────────────────────────────────── */}
      {!isViewOnly && (
        <div className="flex items-center gap-2 flex-wrap no-print mt-2">
          <Button variant="outline" size="sm" onClick={handleOpenItemSearch} data-testid="button-add-item">
            <Plus className="h-3 w-3 ml-1" /> إضافة صنف
          </Button>
          <Button variant="outline" size="sm" disabled={!canSaveDraft || isPending} onClick={onSaveDraft} data-testid="button-save-draft">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
            حفظ مسودة
          </Button>
          <AutoSaveIndicator status={autoSaveStatus} />
          <Button variant="outline" size="sm" disabled={!canSaveDraft || isPending} onClick={() => setConfirmPostOpen(true)} data-testid="button-post-receiving">
            <Send className="h-3 w-3 ml-1" /> ترحيل
          </Button>
          <Button variant="outline" size="sm" onClick={onNew} data-testid="button-new-receiving">
            <Plus className="h-3 w-3 ml-1" /> جديد
          </Button>
          {lines.formLines.length > 0 && (
            <span className="text-[10px] text-muted-foreground mr-auto">{lines.formLines.length} صنف</span>
          )}
        </div>
      )}

      {/* ── شريط الأزرار (للعرض فقط) ─────────────────────────────────────── */}
      {isViewOnly && (
        <div className="flex items-center gap-2 flex-wrap no-print mt-2">
          <Button variant="outline" size="sm" onClick={onNew} data-testid="button-new-receiving">
            <Plus className="h-3 w-3 ml-1" /> إذن جديد
          </Button>
          {formStatus === "posted_qty_only" && !formConvertedToInvoiceId && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={onConvertForm} data-testid="button-form-convert-to-invoice">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <FileText className="h-3 w-3 ml-1" />}
              تحويل إلى فاتورة شراء
            </Button>
          )}
          {formStatus === "posted_qty_only" && formCorrectionStatus !== "corrected" && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={onCorrectForm} data-testid="button-form-correct">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <RotateCcw className="h-3 w-3 ml-1" />}
              تصحيح
            </Button>
          )}
          {formConvertedToInvoiceId && (
            <Badge variant="default" className="text-[9px] bg-blue-600 no-default-hover-elevate no-default-active-elevate">
              تم التحويل إلى فاتورة شراء
            </Badge>
          )}
          {lines.formLines.length > 0 && (
            <span className="text-[10px] text-muted-foreground mr-auto">{lines.formLines.length} صنف</span>
          )}
        </div>
      )}

      {/* ── نوافذ الحوار ─────────────────────────────────────────────────── */}

      {/* البحث عن صنف — ItemFastSearch مع hideStockWarning لأن هذا استلام */}
      <ItemFastSearch
        open={itemSearchOpen}
        onClose={() => setItemSearchOpen(false)}
        warehouseId={form.warehouseId}
        invoiceDate={form.receiveDate}
        excludeServices
        hideStockWarning
        title="بحث عن صنف للاستلام — اضغط Esc للإغلاق"
        onItemSelected={({ item }) => {
          onItemSelected(item);
        }}
      />

      {/* تأكيد الترحيل */}
      <Dialog open={confirmPostOpen} onOpenChange={setConfirmPostOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">تأكيد الترحيل</DialogTitle>
            <DialogDescription className="text-[11px]">
              هل أنت متأكد من ترحيل إذن الاستلام؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmPostOpen(false)} data-testid="button-cancel-post">إلغاء</Button>
            <Button size="sm" disabled={isPending} onClick={onPost} data-testid="button-confirm-post">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Send className="h-3 w-3 ml-1" />}
              تأكيد الترحيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إحصاء المخزون */}
      <StockStatsDialog
        open={!!statsItemId}
        onClose={() => setStatsItemId(null)}
        data={statsData}
        isLoading={statsLoading}
      />

      {/* إضافة مورد سريع */}
      <QuickSupplierDialog
        open={quickSupplierOpen}
        onClose={() => setQuickSupplierOpen(false)}
        onSupplierCreated={supplierSearch.selectSupplier}
        supplierCacheRef={supplierSearch.supplierCacheRef}
      />
    </div>
  );
}

// ── مؤشر الحفظ التلقائي ────────────────────────────────────────────────────
function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === "saving") return (
    <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-auto-save-status">
      <Loader2 className="h-3 w-3 animate-spin" /> جاري الحفظ التلقائي...
    </span>
  );
  if (status === "saved") return (
    <span className="text-[10px] text-green-600 flex items-center gap-1" data-testid="text-auto-save-status">
      <Check className="h-3 w-3" /> تم الحفظ التلقائي
    </span>
  );
  return null;
}

// ── رأس إذن الاستلام ────────────────────────────────────────────────────────
function ReceivingHeaderBar({
  form, supplierSearch, warehouses, onOpenQuickSupplier,
}: {
  form: ReceivingFormState;
  supplierSearch: UseSupplierSearchReturn;
  warehouses: Warehouse[];
  onOpenQuickSupplier: () => void;
}) {
  const {
    isViewOnly, formStatus, receiveDate, setReceiveDate,
    warehouseId, setWarehouseId, supplierInvoiceNo, setSupplierInvoiceNo,
    formNotes, setFormNotes, formReceivingNumber, invoiceDuplicateError,
    setSupplierId,
  } = form;

  const {
    supplierSearchText, supplierResults, supplierDropdownOpen,
    supplierHighlightIdx, supplierSearchLoading, supplierSearchRef,
    handleSupplierSearchChange, handleSupplierKeyDown, selectSupplier,
    setSupplierDropdownOpen,
  } = supplierSearch;

  return (
    <fieldset className="peachtree-grid p-2 sticky top-0 z-50 bg-card">
      <legend className="text-xs font-semibold px-1">بيانات إذن الاستلام</legend>
      <div className="flex flex-wrap items-end gap-2">

        {/* ملاحظات */}
        <div className="space-y-1 flex-1 min-w-[120px]">
          <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
          <Input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
            placeholder="اختياري" className="h-7 text-[11px] px-1"
            disabled={isViewOnly} data-testid="input-notes" />
        </div>

        {/* شارة الحالة */}
        <div className="flex items-center h-7">
          <Badge
            variant={formStatus === "draft" ? "outline" : "default"}
            className={`text-[9px] ${formStatus !== "draft" ? "bg-green-600 no-default-hover-elevate no-default-active-elevate" : ""}`}
          >
            {receivingStatusLabels[formStatus as keyof typeof receivingStatusLabels] || formStatus}
          </Badge>
        </div>

        {/* تاريخ الاستلام */}
        <div className="space-y-1 w-[120px]">
          <Label className="text-[10px] text-muted-foreground">تاريخ الاستلام</Label>
          <Input type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)}
            className="h-7 text-[11px] px-1" disabled={isViewOnly} data-testid="input-receive-date" />
        </div>

        {/* المستودع */}
        <div className="space-y-1 flex-1 min-w-[160px]">
          <Label className="text-[10px] text-muted-foreground">المستودع *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isViewOnly}>
            <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-receiving-warehouse">
              <SelectValue placeholder="اختر المستودع" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* رقم فاتورة المورد */}
        <div className="space-y-1 w-[160px]">
          <Label className="text-[10px] text-muted-foreground">رقم فاتورة المورد *</Label>
          <Input type="text" value={supplierInvoiceNo}
            onChange={(e) => setSupplierInvoiceNo(e.target.value)}
            placeholder="رقم الفاتورة"
            className={`h-7 text-[11px] px-1 ${invoiceDuplicateError ? "border-destructive" : ""}`}
            disabled={isViewOnly} data-testid="input-supplier-invoice" />
          {invoiceDuplicateError && (
            <span className="text-[9px] text-destructive flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" /> {invoiceDuplicateError}
            </span>
          )}
        </div>

        {/* المورد */}
        <div className="space-y-1 flex-1 min-w-[200px] relative">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            المورد *
            {!isViewOnly && (
              <Button variant="outline" size="sm" className="text-[9px] gap-0.5 px-1 h-4"
                onClick={onOpenQuickSupplier} data-testid="button-quick-add-supplier">
                <Plus className="h-2.5 w-2.5" /> إضافة مورد
              </Button>
            )}
          </Label>
          <div className="relative">
            <Input
              ref={supplierSearchRef}
              type="text"
              value={supplierSearchText}
              onChange={(e) => {
                handleSupplierSearchChange(e.target.value);
                if (form.supplierId) setSupplierId("");
              }}
              onKeyDown={(e) => handleSupplierKeyDown(e, selectSupplier)}
              onFocus={() => { if (supplierResults.length > 0) setSupplierDropdownOpen(true); }}
              onBlur={() => { setTimeout(() => setSupplierDropdownOpen(false), 400); }}
              placeholder="ابحث بالكود أو الاسم..."
              className="h-7 text-[11px] px-1" disabled={isViewOnly}
              data-testid="select-supplier" />
            {supplierSearchLoading && (
              <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          {supplierDropdownOpen && supplierResults.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-50 bg-card border rounded-md shadow-lg max-h-[200px] overflow-auto mt-1">
              {supplierResults.map((s, idx) => (
                <div key={s.id}
                  className={`px-2 py-1.5 text-[11px] cursor-pointer hover:bg-muted/50 ${idx === supplierHighlightIdx ? "bg-muted" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSupplier(s)}
                  data-testid={`supplier-option-${s.id}`}>
                  <span className="font-mono text-muted-foreground">{s.code}</span> - {s.nameAr}
                  {s.nameEn ? ` (${s.nameEn})` : ""}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* رقم الإذن */}
        <div className="space-y-1 w-[100px]">
          <Label className="text-[10px] text-muted-foreground">رقم الإذن</Label>
          <Input type="text" value={formReceivingNumber ? String(formReceivingNumber) : "تلقائي"}
            readOnly className="h-7 text-[11px] px-1 bg-muted/30" data-testid="input-receiving-number" />
        </div>
      </div>
    </fieldset>
  );
}
