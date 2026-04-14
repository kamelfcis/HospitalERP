/**
 * ReceivingEditor — المحرر الكامل لإذن الاستلام (Compound Component)
 *
 * يجمع: بيانات الرأس + جدول السطور + شريط الأدوات + نوافذ الحوار.
 * لا يحمل حالة — كل شيء يأتي من الـ orchestrator (index.tsx).
 */
import { useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Send, RotateCcw, FileText, ScanBarcode, Loader2, Check, AlertTriangle, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import { StockStatsDialog } from "@/components/StockStatsDialog";
import { receivingStatusLabels } from "@shared/schema";
import type { Warehouse } from "@shared/schema";

import { ReceivingLineTable } from "./ReceivingLineTable";
import { QuickSupplierDialog } from "./QuickSupplierDialog";
import { SupplierCombobox } from "@/components/SupplierCombobox";
import type { ReceivingFormState } from "../hooks/useReceivingForm";
import type { UseReceivingLinesReturn } from "../hooks/useReceivingLines";
import type { AutoSaveStatus } from "../hooks/useAutoSave";
import type { ReceivingLineLocal } from "../types";

interface Props {
  // ── حالة النموذج ──
  form:           ReceivingFormState;
  lines:          UseReceivingLinesReturn;
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
  onSaveDraft:        () => void;
  onPost:             () => void;
  onNew:              () => void;
  onConvertForm:      () => void;
  onCorrectForm:      () => void;
  onStartEditPosted:  () => void;
  onCancelEditPosted: () => void;
  onSaveEditPosted:   () => void;

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
  form, lines, autoSaveStatus, grandTotal, isPending,
  confirmPostOpen, setConfirmPostOpen,
  itemSearchOpen, setItemSearchOpen,
  statsItemId, statsData, statsLoading, setStatsItemId, openStats,
  quickSupplierOpen, setQuickSupplierOpen,
  onSaveDraft, onPost, onNew, onConvertForm, onCorrectForm,
  onStartEditPosted, onCancelEditPosted, onSaveEditPosted,
  barcodeDisplay, setBarcodeDisplay, barcodeLoading, barcodeInputRef, onBarcodeSubmit,
  warehouses, canSaveDraft,
  onItemSelected,
}: Props) {
  const { isViewOnly, isEditingPosted, formStatus, formCorrectionStatus, formConvertedToInvoiceId,
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
      {isEditingPosted && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-md p-2 mb-2 flex items-center justify-center gap-2 text-sm text-blue-800 dark:text-blue-200" data-testid="banner-edit-posted">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          وضع تعديل إذن استلام مُرحَّل — يمكنك تعديل الكميات أو حذف أصناف. سيُعدَّل المخزون والقيد المحاسبي تلقائيًا عند الحفظ.
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
        warehouses={warehouses}
        onOpenQuickSupplier={() => setQuickSupplierOpen(true)}
        headerLocked={isEditingPosted}
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
          grandTotal={grandTotal}
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

      {/* ── شريط الأزرار (مسودة أو وضع تعديل مُرحَّل) ───────────────────── */}
      {!isViewOnly && (
        <div className="flex items-center gap-2 flex-wrap no-print mt-2">
          <Button variant="outline" size="sm" onClick={handleOpenItemSearch} data-testid="button-add-item">
            <Plus className="h-3 w-3 ml-1" /> إضافة صنف
          </Button>

          {/* أزرار المسودة العادية */}
          {!isEditingPosted && (
            <>
              <Button variant="outline" size="sm" disabled={!canSaveDraft || isPending} onClick={onSaveDraft} data-testid="button-save-draft">
                {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                حفظ مسودة
              </Button>
              <AutoSaveIndicator status={autoSaveStatus} />
              <Button variant="outline" size="sm" disabled={!canSaveDraft || isPending} onClick={() => setConfirmPostOpen(true)} data-testid="button-post-receiving">
                <Send className="h-3 w-3 ml-1" /> ترحيل
              </Button>
            </>
          )}

          {/* أزرار وضع تعديل المُرحَّل */}
          {isEditingPosted && (
            <>
              <Button variant="default" size="sm" disabled={!canSaveDraft || isPending} onClick={onSaveEditPosted} data-testid="button-save-edit-posted"
                className="bg-blue-600 hover:bg-blue-700 text-white">
                {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                حفظ التعديلات
              </Button>
              <Button variant="outline" size="sm" disabled={isPending} onClick={onCancelEditPosted} data-testid="button-cancel-edit-posted">
                <X className="h-3 w-3 ml-1" /> إلغاء التعديل
              </Button>
            </>
          )}

          {!isEditingPosted && (
            <Button variant="outline" size="sm" onClick={onNew} data-testid="button-new-receiving">
              <Plus className="h-3 w-3 ml-1" /> جديد
            </Button>
          )}
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
          {/* زر التعديل — يظهر فقط للمُرحَّل غير المحوَّل لفاتورة */}
          {formStatus === "posted_qty_only" && !formConvertedToInvoiceId && formCorrectionStatus !== "corrected" && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={onStartEditPosted} data-testid="button-start-edit-posted">
              <Pencil className="h-3 w-3 ml-1" /> تعديل الاستلام
            </Button>
          )}
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
        onSupplierCreated={(s) => form.setSupplierId(s.id)}
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
  form, warehouses, onOpenQuickSupplier, headerLocked = false,
}: {
  form: ReceivingFormState;
  warehouses: Warehouse[];
  onOpenQuickSupplier: () => void;
  headerLocked?: boolean;
}) {
  const {
    isViewOnly, formStatus, receiveDate, setReceiveDate,
    warehouseId, setWarehouseId, supplierInvoiceNo, setSupplierInvoiceNo,
    formNotes, setFormNotes, formReceivingNumber, invoiceDuplicateError,
    supplierId, setSupplierId,
  } = form;

  const headerDisabled = isViewOnly || headerLocked;

  return (
    <fieldset className="peachtree-grid p-2 sticky top-0 z-50 bg-card">
      <legend className="text-xs font-semibold px-1">بيانات إذن الاستلام</legend>
      <div className="flex flex-wrap items-end gap-2">

        {/* ملاحظات */}
        <div className="space-y-1 flex-1 min-w-[120px]">
          <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
          <Input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
            placeholder="اختياري" className="h-7 text-[11px] px-1"
            disabled={headerDisabled} data-testid="input-notes" />
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
            className="h-7 text-[11px] px-1" disabled={headerDisabled} data-testid="input-receive-date" />
        </div>

        {/* المستودع */}
        <div className="space-y-1 flex-1 min-w-[160px]">
          <Label className="text-[10px] text-muted-foreground">المستودع *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={headerDisabled}>
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
            disabled={headerDisabled} data-testid="input-supplier-invoice" />
          {invoiceDuplicateError && (
            <span className="text-[9px] text-destructive flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" /> {invoiceDuplicateError}
            </span>
          )}
        </div>

        {/* المورد — SupplierCombobox يعرض قائمة فورية عند الفتح دون الحاجة للكتابة */}
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            المورد *
            {!headerDisabled && (
              <Button variant="outline" size="sm" className="text-[9px] gap-0.5 px-1 h-4"
                onClick={onOpenQuickSupplier} data-testid="button-quick-add-supplier">
                <Plus className="h-2.5 w-2.5" /> إضافة مورد
              </Button>
            )}
          </Label>
          <SupplierCombobox
            value={supplierId}
            onChange={setSupplierId}
            placeholder="اختر المورد…"
            disabled={headerDisabled}
          />
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
