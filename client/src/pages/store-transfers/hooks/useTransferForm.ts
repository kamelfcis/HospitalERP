import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { StoreTransferWithDetails } from "@shared/schema";
import type { TransferLineLocal, ExpiryOption } from "../types";
import {
  calculateQtyInMinor,
  getDefaultUnitLevel,
} from "../types";
import { getSmartDefaultUnitLevel } from "@/lib/invoice-lines";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";
import { useTransferLines } from "./sub-hooks/useTransferLines";
import { useTransferAutoSave } from "./sub-hooks/useTransferAutoSave";

interface RawTransferLine {
  itemId: string;
  item: TransferLineLocal["item"];
  unitLevel: string;
  qtyEntered: string | number;
  qtyInMinor: string | number;
  selectedExpiryDate?: string | null;
  selectedExpiryMonth?: number | null;
  selectedExpiryYear?: number | null;
  availableAtSaveMinor?: string | null;
  notes?: string | null;
}

export function useTransferForm() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<TransferLineLocal[]>([]);
  const [formStatus, setFormStatus] = useState<string>("draft");
  const [formTransferNumber, setFormTransferNumber] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const {
    handleDeleteLine,
    handleQtyConfirm,
    fetchExpiryOptions,
    loadExpiryOptionsForLine,
    handleExpiryChange,
    handleUnitChange,
    fefoLoadingIndex,
    focusedLineIdx,
    setFocusedLineIdx,
    lineExpiryOptions,
    setLineExpiryOptions,
    expiryDropdownLoading,
    qtyInputRefs,
    pendingQtyRef,
    formLinesRef,
  } = useTransferLines({
    formLines,
    setFormLines,
    sourceWarehouseId,
    transferDate,
    barcodeInputRef,
  });

  const {
    autoSaveStatus,
    performAutoSave,
    lastAutoSaveDataRef,
    setAutoSaveStatus,
  } = useTransferAutoSave({
    formStatus,
    sourceWarehouseId,
    destWarehouseId,
    transferDate,
    formNotes,
    formLines,
    editingTransferId,
    setEditingTransferId,
    setFormTransferNumber,
  });

  const isViewOnly = formStatus === "executed";

  const canSaveDraft =
    !!transferDate &&
    !!sourceWarehouseId &&
    !!destWarehouseId &&
    sourceWarehouseId !== destWarehouseId &&
    formLines.length > 0 &&
    formStatus === "draft";

  const resetForm = useCallback(() => {
    setEditingTransferId(null);
    setTransferDate(today);
    setSourceWarehouseId("");
    setDestWarehouseId("");
    setFormNotes("");
    setFormLines([]);
    setFormStatus("draft");
    setFormTransferNumber(null);
    setFocusedLineIdx(null);
    pendingQtyRef.current.clear();
    lastAutoSaveDataRef.current = "";
    setAutoSaveStatus("idle");
  }, [today, setFocusedLineIdx, pendingQtyRef, lastAutoSaveDataRef, setAutoSaveStatus]);

  const loadTransferForEditing = useCallback(
    async (transferId: string, onLoaded?: () => void) => {
      try {
        const res = await fetch(`/api/transfers/${transferId}`);
        if (!res.ok) throw new Error("Failed to load transfer");
        const transfer: StoreTransferWithDetails = await res.json();

        setEditingTransferId(transfer.id);
        setTransferDate(transfer.transferDate);
        setSourceWarehouseId(transfer.sourceWarehouseId);
        setDestWarehouseId(transfer.destinationWarehouseId);
        setFormNotes(transfer.notes || "");
        setFormStatus(transfer.status);
        setFormTransferNumber(transfer.transferNumber);

        const loadedLines: TransferLineLocal[] = ((transfer.lines ?? []) as RawTransferLine[]).map((line) => ({
          id: crypto.randomUUID(),
          itemId: line.itemId,
          item: line.item || null,
          unitLevel: line.unitLevel,
          qtyEntered: parseFloat(line.qtyEntered as string),
          qtyInMinor: parseFloat(line.qtyInMinor as string),
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.selectedExpiryMonth || null,
          selectedExpiryYear: line.selectedExpiryYear || null,
          availableQtyMinor: (line.availableAtSaveMinor as string) || "0",
          notes: line.notes || "",
          fefoLocked: true,
        }));
        setFormLines(loadedLines);

        if (transfer.status === "draft") {
          const itemIds = Array.from(new Set(loadedLines.map((l) => l.itemId)));
          const asOfDate = transfer.transferDate || new Date().toISOString().split("T")[0];
          const expiryPromises = itemIds.map(async (itemId) => {
            try {
              const eres = await fetch(
                `/api/items/${itemId}/expiry-options?warehouseId=${transfer.sourceWarehouseId}&asOfDate=${asOfDate}`,
                { credentials: "include" }
              );
              if (!eres.ok) return { itemId, options: [] as ExpiryOption[] };
              const options: ExpiryOption[] = await eres.json();
              return { itemId, options };
            } catch {
              return { itemId, options: [] as ExpiryOption[] };
            }
          });
          const expiryResults = await Promise.all(expiryPromises);
          const optsByItem: Record<string, ExpiryOption[]> = {};
          for (const r of expiryResults) optsByItem[r.itemId] = r.options;

          setFormLines((prev) =>
            prev.map((ln) => {
              const opts = optsByItem[ln.itemId] || [];
              // مجموع الرصيد الكلي من كل الدفعات المتاحة في مخزن المصدر
              const totalAvailMinor = opts.reduce(
                (sum, o) => sum + (parseFloat(o.qtyAvailableMinor) || 0),
                0,
              );
              let updated = { ...ln };
              // تحديث الرصيد المتاح بالرصيد الفعلي الحالي (للمسودة التي لم تُنفَّذ)
              if (totalAvailMinor > 0) {
                updated.availableQtyMinor = String(totalAvailMinor);
              }
              if (ln.selectedExpiryMonth && ln.selectedExpiryYear) {
                const match = opts.find(
                  (o) => o.expiryMonth === ln.selectedExpiryMonth && o.expiryYear === ln.selectedExpiryYear
                );
                if (match?.lotSalePrice) updated = { ...updated, lotSalePrice: match.lotSalePrice };
              }
              return updated;
            })
          );

          const newExpiryOpts: Record<string, ExpiryOption[]> = {};
          loadedLines.forEach((ln) => {
            if (optsByItem[ln.itemId]) newExpiryOpts[ln.id] = optsByItem[ln.itemId];
          });
          setLineExpiryOptions((prev) => ({ ...prev, ...newExpiryOpts }));
        }

        onLoaded?.();
      } catch (err: unknown) {
        toast({ title: "خطأ في تحميل التحويل", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      }
    },
    [toast, setLineExpiryOptions]
  );

  const handleItemSelected = useCallback(
    ({ item, batch }: ItemSelectedPayload) => {
      // لو اختار دفعة محددة: استخدم كمية الدفعة لتحديد الوحدة (لا الإجمالي)
      const itemForUnit = batch?.qtyAvailableMinor
        ? { ...item, availableQtyMinor: batch.qtyAvailableMinor }
        : item;
      const unitLevel = getSmartDefaultUnitLevel(itemForUnit);
      const qtyEntered = 1;
      const qtyInMinor = calculateQtyInMinor(qtyEntered, unitLevel, item);

      const newLineId = crypto.randomUUID();
      const newLine: TransferLineLocal = {
        id: newLineId,
        itemId: item.id,
        item,
        unitLevel,
        qtyEntered,
        qtyInMinor,
        selectedExpiryDate: batch?.expiryDate || null,
        selectedExpiryMonth: batch?.expiryMonth ?? null,
        selectedExpiryYear: batch?.expiryYear ?? null,
        availableQtyMinor: item.availableQtyMinor || "0",
        notes: "",
        fefoLocked: !!batch || !item.hasExpiry,
        lotSalePrice: batch?.lotSalePrice,
      };

      setFormLines((prev) => [...prev, newLine]);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);

      // جلب خيارات الصلاحية في الخلفية فوراً (للإنذار الفوري + ملء القائمة مسبقاً)
      if (item.hasExpiry && sourceWarehouseId) {
        fetchExpiryOptions(item.id).then((opts) => {
          if (opts.length > 0) {
            setLineExpiryOptions((prev) => ({ ...prev, [newLineId]: opts }));
          }
        }).catch(() => {});
      }
    },
    [fetchExpiryOptions, setLineExpiryOptions, sourceWarehouseId]
  );

  const executeMutation = async () => {
    if (!editingTransferId) return;
    try {
      const res = await fetch(`/api/transfers/${editingTransferId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Execution failed");
      }
      toast({ title: "تم تنفيذ التحويل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      resetForm();
    } catch (err: unknown) {
      toast({ title: "فشل في تنفيذ التحويل", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const deleteMutation = async () => {
    if (!editingTransferId) return;
    try {
      const res = await fetch(`/api/transfers/${editingTransferId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "تم حذف التحويل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      resetForm();
    } catch (err: unknown) {
      toast({ title: "فشل في حذف التحويل", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return {
    transferDate,
    setTransferDate,
    sourceWarehouseId,
    setSourceWarehouseId,
    destWarehouseId,
    setDestWarehouseId,
    formNotes,
    setFormNotes,
    formLines,
    setFormLines,
    formStatus,
    formTransferNumber,
    editingTransferId,
    autoSaveStatus,
    isViewOnly,
    canSaveDraft,
    modalOpen,
    setModalOpen,
    fefoLoadingIndex,
    focusedLineIdx,
    setFocusedLineIdx,
    lineExpiryOptions,
    expiryDropdownLoading,
    barcodeInputRef,
    qtyInputRefs,
    pendingQtyRef,
    formLinesRef,
    resetForm,
    loadTransferForEditing,
    handleItemSelected,
    handleDeleteLine,
    handleQtyConfirm,
    handleExpiryChange,
    handleUnitChange,
    loadExpiryOptionsForLine,
    performAutoSave,
    executeMutation,
    deleteMutation,
  };
}
