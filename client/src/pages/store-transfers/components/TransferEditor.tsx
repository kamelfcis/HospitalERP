import { useCallback } from "react";
import { Loader2, ScanBarcode, Plus, Save, Send, FileText, Printer, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import { TransferLineTable } from "./TransferLineTable";
import type { TransferLineLocal, ExpiryOption } from "../types";
import type { Warehouse } from "@shared/schema";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";
import type { UseMutationResult } from "@tanstack/react-query";

interface Props {
  warehouses?: Warehouse[];
  editingTransferId: string | null;
  transferDate: string;
  setTransferDate: (v: string) => void;
  sourceWarehouseId: string;
  setSourceWarehouseId: (v: string) => void;
  destWarehouseId: string;
  setDestWarehouseId: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  formLines: TransferLineLocal[];
  formStatus: string;
  formTransferNumber: number | null;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  isViewOnly: boolean;
  canSaveDraft: boolean;
  fefoLoadingIndex: number | null;
  focusedLineIdx: number | null;
  setFocusedLineIdx: (idx: number | null) => void;
  lineExpiryOptions: Record<string, ExpiryOption[]>;
  qtyInputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  barcodeInput: string;
  setBarcodeInput: (v: string) => void;
  barcodeLoading: boolean;
  modalOpen: boolean;
  setModalOpen: (v: boolean) => void;
  isPending: boolean;
  onItemSelected: (payload: ItemSelectedPayload) => void;
  onDeleteLine: (index: number) => void;
  onQtyConfirm: (lineId: string) => void;
  onUnitChange: (lineId: string, newUnit: string) => void;
  onShowAvailability: (itemId: string, item: any, e: React.MouseEvent) => void;
  onBarcodeScan: (value: string) => void;
  onSaveDraft: () => void;
  onPostTransfer: () => void;
  onReset: () => void;
  saveDraftMutation: UseMutationResult<any, any, void>;
  postTransferMutation: UseMutationResult<any, any, void>;
}

export function TransferEditor({
  warehouses,
  editingTransferId,
  transferDate,
  setTransferDate,
  sourceWarehouseId,
  setSourceWarehouseId,
  destWarehouseId,
  setDestWarehouseId,
  formNotes,
  setFormNotes,
  formLines,
  formStatus,
  formTransferNumber,
  autoSaveStatus,
  isViewOnly,
  canSaveDraft,
  fefoLoadingIndex,
  focusedLineIdx,
  setFocusedLineIdx,
  lineExpiryOptions,
  qtyInputRefs,
  pendingQtyRef,
  barcodeInputRef,
  barcodeInput,
  setBarcodeInput,
  barcodeLoading,
  modalOpen,
  setModalOpen,
  isPending,
  onItemSelected,
  onDeleteLine,
  onQtyConfirm,
  onUnitChange,
  onShowAvailability,
  onBarcodeScan,
  onSaveDraft,
  onPostTransfer,
  onReset,
  saveDraftMutation,
  postTransferMutation,
}: Props) {
  const handleFormContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-testid='input-qty-edit']")) return;
      if (target.closest("button")) return;
      if (target.closest("input")) return;
      if (target.closest("select")) return;
      if (target.closest("[role='dialog']")) return;
      if (focusedLineIdx === null && !modalOpen) {
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
      }
    },
    [focusedLineIdx, modalOpen, barcodeInputRef]
  );

  return (
    <div className="space-y-2" onClick={handleFormContainerClick}>
      {/* Header fields */}
      <fieldset className="peachtree-grid p-2" dir="rtl">
        <legend className="text-xs font-semibold px-1">بيانات إذن التحويل</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 w-[100px]">
            <Label className="text-[10px] text-muted-foreground">رقم الإذن</Label>
            <Input
              type="text"
              value={formTransferNumber ? String(formTransferNumber) : "تلقائي"}
              readOnly
              className="h-7 text-[11px] px-1 bg-muted/30"
              data-testid="input-transfer-number"
            />
          </div>
          <div className="space-y-1 w-[135px]">
            <Label className="text-[10px] text-muted-foreground">تاريخ التحويل</Label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="peachtree-input w-full"
              disabled={isViewOnly}
              data-testid="input-transfer-date"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label className="text-[10px] text-muted-foreground">مخزن المصدر *</Label>
            <Select
              value={sourceWarehouseId}
              onValueChange={(val) => { setSourceWarehouseId(val); }}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-source-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label className="text-[10px] text-muted-foreground">مخزن الوجهة *</Label>
            <Select value={destWarehouseId} onValueChange={setDestWarehouseId} disabled={isViewOnly}>
              <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-dest-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.filter((w) => w.id !== sourceWarehouseId).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center h-7">
            {formStatus === "executed" ? (
              <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">مُنفّذ</Badge>
            ) : (
              <Badge variant="outline" className="text-[9px]">مسودة</Badge>
            )}
          </div>
          <div className="space-y-1 flex-1 min-w-[120px]">
            <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
            <Input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="اختياري"
              className="h-7 text-[11px] px-1"
              disabled={isViewOnly}
              data-testid="input-transfer-notes"
            />
          </div>
        </div>
      </fieldset>

      {/* Barcode scanner */}
      {!isViewOnly && sourceWarehouseId && destWarehouseId && (
        <div className="flex items-center gap-2 px-2">
          <ScanBarcode className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && barcodeInput.trim()) {
                e.preventDefault();
                onBarcodeScan(barcodeInput);
              }
            }}
            placeholder="امسح الباركود هنا..."
            className="h-7 text-[11px] px-2 max-w-[300px]"
            disabled={barcodeLoading}
            data-testid="input-barcode-scan"
          />
          {barcodeLoading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      )}

      {/* Lines table */}
      <fieldset className="peachtree-grid p-2">
        <legend className="text-xs font-semibold px-1">أصناف التحويل</legend>
        <TransferLineTable
          formLines={formLines}
          isViewOnly={isViewOnly}
          fefoLoadingIndex={fefoLoadingIndex}
          focusedLineIdx={focusedLineIdx}
          lineExpiryOptions={lineExpiryOptions}
          qtyInputRefs={qtyInputRefs}
          pendingQtyRef={pendingQtyRef}
          barcodeInputRef={barcodeInputRef}
          onDeleteLine={onDeleteLine}
          onQtyConfirm={onQtyConfirm}
          onUnitChange={onUnitChange}
          onShowAvailability={onShowAvailability}
          setFocusedLineIdx={setFocusedLineIdx}
        />
      </fieldset>

      {/* Action toolbar - draft mode */}
      {!isViewOnly && (
        <div className="flex items-center gap-2 flex-wrap no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalOpen(true)}
            disabled={!sourceWarehouseId}
            data-testid="button-add-item"
          >
            <Plus className="h-3 w-3 ml-1" />
            إضافة صنف
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSaveDraft || isPending}
            onClick={onSaveDraft}
            data-testid="button-save-draft"
          >
            {saveDraftMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin ml-1" />
            ) : (
              <Save className="h-3 w-3 ml-1" />
            )}
            حفظ كمسودة
          </Button>
          {autoSaveStatus === "saving" && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-auto-save-status">
              <Loader2 className="h-3 w-3 animate-spin" />
              جاري الحفظ التلقائي...
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-[10px] text-green-600 flex items-center gap-1" data-testid="text-auto-save-status">
              <Check className="h-3 w-3" />
              تم الحفظ التلقائي
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!canSaveDraft || isPending}
            onClick={onPostTransfer}
            data-testid="button-post-transfer"
          >
            {postTransferMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin ml-1" />
            ) : (
              <Send className="h-3 w-3 ml-1" />
            )}
            ترحيل التحويل
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            data-testid="button-new-transfer"
          >
            <FileText className="h-3 w-3 ml-1" />
            إذن جديد
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            data-testid="button-print-transfer"
          >
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
          {formLines.length > 0 && (
            <span className="text-[10px] text-muted-foreground mr-auto">{formLines.length} صنف مُضاف</span>
          )}
        </div>
      )}

      {/* Action toolbar - view-only mode */}
      {isViewOnly && (formLines.length > 0 || editingTransferId) && (
        <div className="flex items-center gap-2 flex-wrap no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            data-testid="button-print-transfer"
          >
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
        </div>
      )}

      {/* ItemFastSearch dialog — same as sales invoice */}
      <ItemFastSearch
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        warehouseId={sourceWarehouseId}
        invoiceDate={transferDate}
        onItemSelected={onItemSelected}
        title="بحث عن صنف للتحويل"
        hideStockWarning={false}
      />
    </div>
  );
}
