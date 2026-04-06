import { useState, useEffect, useCallback } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTransferLog } from "./hooks/useTransferLog";
import { useTransferForm } from "./hooks/useTransferForm";
import { useTransferMutations } from "./hooks/useTransferMutations";
import { useBarcodeScanner } from "./hooks/useBarcodeScanner";
import { useAvailabilityPopup } from "./hooks/useAvailabilityPopup";
import { TransferLog } from "./components/TransferLog";
import { TransferEditor } from "./components/TransferEditor";
import { TransferSuggestion } from "./components/TransferSuggestion";
import { AvailabilityPopup } from "./components/AvailabilityPopup";

export default function StoreTransfers() {
  const [activeTab, setActiveTab] = useState<string>("log");

  const log = useTransferLog();
  const form = useTransferForm();
  const { showAvailabilityPopup, closeAvailPopup, ...availPopup } = useAvailabilityPopup();

  const mutations = useTransferMutations(
    {
      transferDate: form.transferDate,
      sourceWarehouseId: form.sourceWarehouseId,
      destWarehouseId: form.destWarehouseId,
      formNotes: form.formNotes,
      formLines: form.formLines,
      editingTransferId: form.editingTransferId,
    },
    form.resetForm
  );

  const barcode = useBarcodeScanner({
    sourceWarehouseId: form.sourceWarehouseId,
    setFormLines: form.setFormLines,
    qtyInputRefs: form.qtyInputRefs,
  });

  const isPending = mutations.saveDraftMutation.isPending || mutations.postTransferMutation.isPending;

  const handleOpenTransfer = useCallback(
    async (id: string) => {
      await form.loadTransferForEditing(id, () => setActiveTab("form"));
    },
    [form]
  );

  useEffect(() => {
    if (activeTab === "form" && !form.modalOpen && form.focusedLineIdx === null) {
      const timer = setTimeout(() => form.barcodeInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, form.modalOpen, form.focusedLineIdx, form.barcodeInputRef]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        form.setFocusedLineIdx(null);
        form.barcodeInputRef.current?.focus();
      }
      if (e.key === "Escape" && form.focusedLineIdx !== null) {
        e.preventDefault();
        const line = form.formLinesRef.current[form.focusedLineIdx];
        if (line) form.pendingQtyRef.current.delete(line.id);
        form.setFocusedLineIdx(null);
        setTimeout(() => form.barcodeInputRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [form.focusedLineIdx]);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold text-foreground">التحويلات المخزنية</h1>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">حركة مخزنية فقط - بدون تسعير</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2 no-print">
          <TabsTrigger value="log" data-testid="tab-log">سجل التحويلات</TabsTrigger>
          <TabsTrigger value="form" data-testid="tab-form">إذن تحويل</TabsTrigger>
          <TabsTrigger value="suggest" data-testid="tab-suggest">اقتراح ذكي</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-2">
          <TransferLog
            warehouses={log.warehouses}
            transfers={log.transfers}
            transfersLoading={log.transfersLoading}
            totalPages={log.totalPages}
            logPage={log.logPage}
            setLogPage={log.setLogPage}
            filterFromDate={log.filterFromDate}
            setFilterFromDate={log.setFilterFromDate}
            filterToDate={log.filterToDate}
            setFilterToDate={log.setFilterToDate}
            filterSourceWarehouse={log.filterSourceWarehouse}
            setFilterSourceWarehouse={log.setFilterSourceWarehouse}
            filterDestWarehouse={log.filterDestWarehouse}
            setFilterDestWarehouse={log.setFilterDestWarehouse}
            filterStatus={log.filterStatus}
            setFilterStatus={log.setFilterStatus}
            filterSearch={log.filterSearch}
            setFilterSearch={log.setFilterSearch}
            onOpenTransfer={handleOpenTransfer}
            postDraftMutation={mutations.postDraftMutation}
            deleteDraftMutation={mutations.deleteDraftMutation}
          />
        </TabsContent>

        <TabsContent value="form" className="space-y-2">
          <TransferEditor
            warehouses={log.warehouses}
            editingTransferId={form.editingTransferId}
            transferDate={form.transferDate}
            setTransferDate={form.setTransferDate}
            sourceWarehouseId={form.sourceWarehouseId}
            setSourceWarehouseId={(val) => { form.setSourceWarehouseId(val); form.setFormLines([]); }}
            destWarehouseId={form.destWarehouseId}
            setDestWarehouseId={form.setDestWarehouseId}
            formNotes={form.formNotes}
            setFormNotes={form.setFormNotes}
            formLines={form.formLines}
            formStatus={form.formStatus}
            formTransferNumber={form.formTransferNumber}
            autoSaveStatus={form.autoSaveStatus}
            isViewOnly={form.isViewOnly}
            canSaveDraft={form.canSaveDraft}
            fefoLoadingIndex={form.fefoLoadingIndex}
            focusedLineIdx={form.focusedLineIdx}
            setFocusedLineIdx={form.setFocusedLineIdx}
            lineExpiryOptions={form.lineExpiryOptions}
            qtyInputRefs={form.qtyInputRefs}
            pendingQtyRef={form.pendingQtyRef}
            barcodeInputRef={form.barcodeInputRef}
            barcodeInput={barcode.barcodeInput}
            setBarcodeInput={barcode.setBarcodeInput}
            barcodeLoading={barcode.barcodeLoading}
            modalOpen={form.modalOpen}
            setModalOpen={form.setModalOpen}
            isPending={isPending}
            onItemSelected={form.handleItemSelected}
            onDeleteLine={form.handleDeleteLine}
            onQtyConfirm={form.handleQtyConfirm}
            onUnitChange={form.handleUnitChange}
            onShowAvailability={showAvailabilityPopup}
            onBarcodeScan={barcode.handleBarcodeScan}
            onSaveDraft={() => mutations.saveDraftMutation.mutate()}
            onPostTransfer={() => mutations.postTransferMutation.mutate()}
            onReset={form.resetForm}
            saveDraftMutation={mutations.saveDraftMutation}
            postTransferMutation={mutations.postTransferMutation}
          />
        </TabsContent>

        <TabsContent value="suggest" className="space-y-2">
          <TransferSuggestion
            warehouses={log.warehouses}
            sourceWarehouseId={form.sourceWarehouseId}
            destWarehouseId={form.destWarehouseId}
            onFillLines={(lines) => {
              form.setFormLines(lines);
              setActiveTab("form");
            }}
          />
        </TabsContent>
      </Tabs>

      <AvailabilityPopup
        availPopupItemId={availPopup.availPopupItemId}
        availPopupPosition={availPopup.availPopupPosition}
        availPopupLoading={availPopup.availPopupLoading}
        availPopupData={availPopup.availPopupData}
        onClose={closeAvailPopup}
      />
    </div>
  );
}
