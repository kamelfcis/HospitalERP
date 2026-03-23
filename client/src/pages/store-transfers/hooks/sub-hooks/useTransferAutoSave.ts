import { useCallback, useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { TransferLineLocal } from "../../types";

interface UseTransferAutoSaveProps {
  formStatus: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  transferDate: string;
  formNotes: string;
  formLines: TransferLineLocal[];
  editingTransferId: string | null;
  setEditingTransferId: (id: string | null) => void;
  setFormTransferNumber: (num: number | null) => void;
}

export function useTransferAutoSave({
  formStatus,
  sourceWarehouseId,
  destWarehouseId,
  transferDate,
  formNotes,
  formLines,
  editingTransferId,
  setEditingTransferId,
  setFormTransferNumber,
}: UseTransferAutoSaveProps) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");

  const buildAutoSavePayload = useCallback(() => {
    return {
      header: {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes,
      },
      lines: formLines.map((l) => ({
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        qtyEntered: String(l.qtyEntered),
        qtyInMinor: String(l.qtyInMinor),
        selectedExpiryDate: l.selectedExpiryDate || undefined,
        expiryMonth: l.selectedExpiryMonth || undefined,
        expiryYear: l.selectedExpiryYear || undefined,
        availableAtSaveMinor: l.availableQtyMinor || undefined,
        notes: l.notes || undefined,
      })),
      existingId: editingTransferId || undefined,
    };
  }, [transferDate, sourceWarehouseId, destWarehouseId, formNotes, formLines, editingTransferId]);

  const performAutoSave = useCallback(async () => {
    if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
    // لا تحفظ إذن تحويل جديد فارغ — لا معنى لحفظ نموذج بدون أصناف
    if (!editingTransferId && formLines.length === 0) return;
    const payload = buildAutoSavePayload();
    const dataStr = JSON.stringify(payload);
    if (dataStr === lastAutoSaveDataRef.current) return;

    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/transfers/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dataStr,
      });
      if (!res.ok) throw new Error("Auto-save failed");
      const result = await res.json();
      lastAutoSaveDataRef.current = dataStr;
      setAutoSaveStatus("saved");
      if (!editingTransferId && result.id) {
        setEditingTransferId(result.id);
        if (result.transferNumber) setFormTransferNumber(result.transferNumber);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    } catch {
      setAutoSaveStatus("error");
    }
  }, [formStatus, sourceWarehouseId, destWarehouseId, formLines, buildAutoSavePayload, editingTransferId, setEditingTransferId, setFormTransferNumber]);

  useEffect(() => {
    if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
    // لا نبدأ العد التنازلي لإذن تحويل جديد بدون أصناف
    if (!editingTransferId && formLines.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { performAutoSave(); }, 15000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [formStatus, sourceWarehouseId, destWarehouseId, editingTransferId, transferDate, formNotes, formLines, performAutoSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
      if (!editingTransferId && formLines.length === 0) return;
      const payload = buildAutoSavePayload();
      const dataStr = JSON.stringify(payload);
      if (dataStr === lastAutoSaveDataRef.current) return;
      navigator.sendBeacon("/api/transfers/auto-save", new Blob([dataStr], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formStatus, sourceWarehouseId, destWarehouseId, buildAutoSavePayload]);

  return {
    autoSaveStatus,
    performAutoSave,
    lastAutoSaveDataRef,
    setAutoSaveStatus,
  };
}
