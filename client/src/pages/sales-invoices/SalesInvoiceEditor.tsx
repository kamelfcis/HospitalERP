/**
 * SalesInvoiceEditor — المحرر المركّب لفاتورة المبيعات
 *
 * يجمع كل عناصر واجهة الفاتورة في مكون واحد قابل للقراءة.
 * الحالة (state) تأتي من الـ hooks في index.tsx — هذا المكوّن UI خالص.
 *
 * الهيكل:
 *   ┌─ InvoiceHeaderBar ──────────────────────────────────────────────┐
 *   │  رقم الفاتورة | مستودع | تاريخ | عميل | باركود | أزرار        │
 *   └─────────────────────────────────────────────────────────────────┘
 *   ┌─ InvoiceLineTable ──────────────────────────────────────────────┐
 *   │  جدول الأصناف مع FEFO + تعديل الكمية + الصلاحية              │
 *   └─────────────────────────────────────────────────────────────────┘
 *   ┌─ InvoiceTotals ─────────────────────────────────────────────────┐
 *   │  إجمالي | خصم | صافي                                           │
 *   └─────────────────────────────────────────────────────────────────┘
 *   ─ Dialogs (ItemFastSearch | ServiceSearchDialog | StockStatsDialog)
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Button }   from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

import { InvoiceHeaderBar }   from "./components/InvoiceHeaderBar";
import { InvoiceLineTable }   from "./components/InvoiceLineTable";
import { InvoiceTotals }      from "./components/InvoiceTotals";
import { ServiceSearchDialog } from "./components/ServiceSearchDialog";
import { StockStatsDialog }   from "@/components/StockStatsDialog";
import { ItemFastSearch }     from "@/components/ItemFastSearch";

import type { Warehouse, SalesInvoiceWithDetails } from "@shared/schema";
import type { SalesLineLocal } from "./types";
import type { InvoiceFormHandlers } from "./hooks/useInvoiceForm";
import type { useInvoiceLines }     from "./hooks/useInvoiceLines";
import type { useInvoiceMutations } from "./hooks/useInvoiceMutations";
import type { useAutoSave }         from "./hooks/useAutoSave";
import type { useItemSearch }       from "./hooks/useItemSearch";
import type { useServiceSearch }    from "./hooks/useServiceSearch";
import type { useStatsDialog }      from "./hooks/useStatsDialog";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
interface SalesInvoiceEditorProps {
  // تعريف الفاتورة
  editId:          string;
  isNew:           boolean;
  isDraft:         boolean;
  invoiceDetail?:  SalesInvoiceWithDetails;
  detailLoading:   boolean;

  // مرجع خارجي
  warehouses?:     Warehouse[];

  // حالة الفاتورة
  form:              InvoiceFormHandlers;
  lines:             SalesLineLocal[];
  subtotal:          number;
  netTotal:          number;

  // حقل الباركود (العالمي يعمل بدون هذا — هذا فقط للعرض في الـ header)
  barcodeDisplay:    string;
  setBarcodeDisplay: (v: string) => void;
  barcodeLoading:    boolean;
  barcodeInputRef:   React.RefObject<HTMLInputElement>;
  onBarcodeScan:     () => void;

  // hooks
  linesHook:       ReturnType<typeof useInvoiceLines>;
  mutationsHook:   ReturnType<typeof useInvoiceMutations>;
  autoSaveHook:    ReturnType<typeof useAutoSave>;
  itemSearchHook:  ReturnType<typeof useItemSearch>;
  serviceSearchHook: ReturnType<typeof useServiceSearch>;
  statsHook:       ReturnType<typeof useStatsDialog>;

  // تنقل
  onBack:          () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────
function EditorSkeleton() {
  return (
    <div className="p-4 space-y-4" dir="rtl">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Not found state
// ─────────────────────────────────────────────────────────────────────────────
function EditorNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-4 text-center" dir="rtl">
      <p className="text-muted-foreground">لم يتم العثور على الفاتورة</p>
      <Button
        variant="outline" size="sm" className="mt-4"
        onClick={onBack}
        data-testid="button-back-not-found"
      >
        <ArrowRight className="h-4 w-4 ml-1" />
        رجوع
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// المحرر الرئيسي
// ─────────────────────────────────────────────────────────────────────────────
export function SalesInvoiceEditor({
  editId, isNew, isDraft, invoiceDetail, detailLoading,
  warehouses, form, lines, subtotal, netTotal,
  barcodeDisplay, setBarcodeDisplay, barcodeLoading, barcodeInputRef, onBarcodeScan,
  linesHook, mutationsHook, autoSaveHook, itemSearchHook, serviceSearchHook,
  statsHook, onBack,
}: SalesInvoiceEditorProps) {

  // حالة التحميل
  if (editId !== "new" && detailLoading) return <EditorSkeleton />;

  // فاتورة غير موجودة
  if (editId !== "new" && !invoiceDetail) return <EditorNotFound onBack={onBack} />;

  const itemName = statsHook.statsItemId
    ? lines.find((l) => l.itemId === statsHook.statsItemId)?.item?.nameAr
    : undefined;

  return (
    <div className="flex flex-col h-full" dir="rtl">

      {/* ── رأس الفاتورة ──────────────────────────────────────────────────── */}
      <InvoiceHeaderBar
        isNew={isNew}
        isDraft={isDraft}
        invoiceNumber={invoiceDetail?.invoiceNumber?.toString()}
        status={invoiceDetail?.status}
        fefoLoading={linesHook.fefoLoading}
        autoSaveStatus={autoSaveHook.autoSaveStatus}
        warehouseId={form.warehouseId}
        setWarehouseId={form.setWarehouseId}
        invoiceDate={form.invoiceDate}
        setInvoiceDate={form.setInvoiceDate}
        customerType={form.customerType}
        setCustomerType={form.setCustomerType}
        customerName={form.customerName}
        setCustomerName={form.setCustomerName}
        contractCompany={form.contractCompany}
        setContractCompany={form.setContractCompany}
        barcodeDisplay={barcodeDisplay}
        setBarcodeDisplay={setBarcodeDisplay}
        barcodeLoading={barcodeLoading}
        barcodeInputRef={barcodeInputRef}
        warehouses={warehouses}
        finalizePending={mutationsHook.finalizeMutation.isPending}
        onBack={onBack}
        onFinalize={() => mutationsHook.finalizeMutation.mutate()}
        onBarcodeScan={onBarcodeScan}
        onOpenSearch={itemSearchHook.openSearchModal}
        onOpenServiceSearch={serviceSearchHook.openServiceModal}
      />

      {/* ── جدول الأصناف ──────────────────────────────────────────────────── */}
      <InvoiceLineTable
        lines={lines}
        isDraft={isDraft}
        fefoLoading={linesHook.fefoLoading}
        pendingQtyRef={linesHook.pendingQtyRef}
        onUpdateLine={linesHook.updateLine}
        onRemoveLine={linesHook.removeLine}
        onQtyConfirm={linesHook.handleQtyConfirm}
        onOpenStats={statsHook.openStats}
        barcodeInputRef={barcodeInputRef}
      />

      {/* ── الإجماليات ────────────────────────────────────────────────────── */}
      <InvoiceTotals
        subtotal={subtotal}
        discountPct={form.discountPct}
        discountValue={form.discountValue}
        netTotal={netTotal}
        isDraft={isDraft}
        onDiscountPctChange={(v) => form.handleDiscountPctChange(v, subtotal)}
        onDiscountValueChange={(v) => form.handleDiscountValueChange(v, subtotal)}
      />

      {/* ── نوافذ الحوار ──────────────────────────────────────────────────── */}
      <ItemFastSearch
        open={itemSearchHook.searchModalOpen}
        onClose={itemSearchHook.closeSearchModal}
        warehouseId={form.warehouseId}
        invoiceDate={form.invoiceDate}
        excludeServices={false}
        onItemSelected={({ item }) => linesHook.addItemToLines(item)}
      />

      <ServiceSearchDialog
        open={serviceSearchHook.serviceModalOpen}
        onClose={() => serviceSearchHook.setServiceModalOpen(false)}
        serviceSearch={serviceSearchHook.serviceSearch}
        onServiceSearchChange={serviceSearchHook.onServiceSearchChange}
        serviceResults={serviceSearchHook.serviceResults}
        serviceSearchLoading={serviceSearchHook.serviceSearchLoading}
        addingServiceId={serviceSearchHook.addingServiceId}
        serviceSearchRef={serviceSearchHook.serviceSearchRef}
        onAddService={serviceSearchHook.addServiceConsumables}
      />

      <StockStatsDialog
        open={!!statsHook.statsItemId}
        onClose={statsHook.closeStats}
        itemName={itemName}
        data={statsHook.statsData}
        isLoading={statsHook.statsLoading}
      />
    </div>
  );
}
