/**
 * useAutoSave — حفظ تلقائي لإذن الاستلام
 *
 * يحفظ كل 15 ثانية إذا تغيّرت البيانات.
 * يُرسل beacon عند إغلاق التبويب.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { ReceivingLineLocal, buildLinePayload } from "../types";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveParams {
  formStatus:           string;
  supplierId:           string;
  warehouseId:          string;
  supplierInvoiceNo:    string;
  receiveDate:          string;
  formNotes:            string;
  formLines:            ReceivingLineLocal[];
  editingReceivingId:   string | null;
  onIdAssigned:         (id: string, number: number | null) => void;
}

export function useAutoSave({
  formStatus, supplierId, warehouseId, supplierInvoiceNo,
  receiveDate, formNotes, formLines, editingReceivingId, onIdAssigned,
}: UseAutoSaveParams) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const lastAutoSaveDataRef = useRef<string>("");
  const autoSaveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPayload = useCallback(() => ({
    header: {
      supplierId,
      supplierInvoiceNo,
      warehouseId,
      receiveDate,
      notes: formNotes || undefined,
    },
    lines: formLines.map(buildLinePayload),
    existingId: editingReceivingId || undefined,
  }), [supplierId, supplierInvoiceNo, warehouseId, receiveDate, formNotes, formLines, editingReceivingId]);

  const performAutoSave = useCallback(async () => {
    if (formStatus !== "draft" || !supplierId || !warehouseId) return;

    const payload = buildPayload();
    const dataKey = JSON.stringify(payload);
    if (dataKey === lastAutoSaveDataRef.current) return;

    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/receivings/auto-save", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        lastAutoSaveDataRef.current = dataKey;
        if (!editingReceivingId && data.id) {
          onIdAssigned(data.id, data.receivingNumber ?? null);
        }
        setAutoSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      } else {
        setAutoSaveStatus("error");
      }
    } catch {
      setAutoSaveStatus("error");
    }
  }, [formStatus, supplierId, warehouseId, editingReceivingId, buildPayload, onIdAssigned]);

  // حفظ كل 15 ثانية
  useEffect(() => {
    if (formStatus !== "draft" || !supplierId || !warehouseId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(performAutoSave, 15000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [supplierId, warehouseId, supplierInvoiceNo, receiveDate, formNotes, formLines, performAutoSave, formStatus]);

  // beacon عند إغلاق التبويب
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (formStatus !== "draft" || !supplierId || !warehouseId) return;
      const payload = buildPayload();
      navigator.sendBeacon(
        "/api/receivings/auto-save",
        new Blob([JSON.stringify(payload)], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formStatus, supplierId, warehouseId, buildPayload]);

  const resetAutoSave = useCallback(() => {
    lastAutoSaveDataRef.current = "";
    setAutoSaveStatus("idle");
  }, []);

  return { autoSaveStatus, setAutoSaveStatus, performAutoSave, resetAutoSave, lastAutoSaveDataRef };
}
