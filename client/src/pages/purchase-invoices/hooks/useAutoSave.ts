/**
 * useAutoSave — الحفظ التلقائي لفاتورة الشراء
 *
 * يحفظ تلقائياً كل 15 ثانية إذا تغيرت البيانات.
 * يحفظ أيضاً قبل إغلاق الصفحة (beforeunload) باستخدام sendBeacon.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InvoiceLineLocal } from "../types";
import { buildLinePayload } from "../types";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

interface Params {
  editId:        string | null;
  isDraft:       boolean;
  lines:         InvoiceLineLocal[];
  invoiceDate:   string;
  notes:         string;
  discountType:  string;
  discountValue: number;
  claimNumber:   string;
}

export function useAutoSave({
  editId, isDraft, lines, invoiceDate, notes, discountType, discountValue, claimNumber,
}: Params) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const lastSavedRef = useRef<string>("");
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPayload = useCallback(() => ({
    lines:        lines.map(buildLinePayload),
    discountType, discountValue, invoiceDate, notes, claimNumber,
  }), [lines, discountType, discountValue, invoiceDate, notes, claimNumber]);

  // ── الحفظ الفعلي ────────────────────────────────────────────────────────
  const performAutoSave = useCallback(async () => {
    if (!isDraft || !editId) return;
    const payload = buildPayload();
    const dataStr = JSON.stringify(payload);
    if (dataStr === lastSavedRef.current) return;
    try {
      setAutoSaveStatus("saving");
      await apiRequest("POST", `/api/purchase-invoices/${editId}/auto-save`, payload);
      lastSavedRef.current = dataStr;
      setAutoSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
    } catch {
      setAutoSaveStatus("error");
    }
  }, [isDraft, editId, buildPayload]);

  // ── تشغيل التايمر عند تغيير البيانات ──────────────────────────────────
  useEffect(() => {
    if (!isDraft || !editId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performAutoSave, 15000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isDraft, editId, lines, invoiceDate, notes, discountType, discountValue, claimNumber, performAutoSave]);

  // ── الحفظ قبل إغلاق الصفحة ────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isDraft || !editId) return;
      navigator.sendBeacon(
        `/api/purchase-invoices/${editId}/auto-save`,
        new Blob([JSON.stringify(buildPayload())], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraft, editId, buildPayload]);

  // ── إعادة ضبط عند الحفظ اليدوي ─────────────────────────────────────────
  const resetAutoSave = useCallback(() => {
    lastSavedRef.current = "";
    setAutoSaveStatus("idle");
  }, []);

  return { autoSaveStatus, performAutoSave, resetAutoSave };
}
