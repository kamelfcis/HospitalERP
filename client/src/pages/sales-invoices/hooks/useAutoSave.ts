import { useState, useEffect, useCallback, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import type { SalesLineLocal } from "../types";

interface AutoSaveParams {
  isDraft: boolean;
  warehouseId: string;
  invoiceDate: string;
  customerType: string;
  customerName: string;
  contractCompany: string;
  discountPct: number;
  discountValue: number;
  subtotal: number;
  netTotal: number;
  notes: string;
  lines: SalesLineLocal[];
  editId: string | null;
  isNew: boolean;
  /**
   * يُستدعى عند أول حفظ تلقائي لفاتورة جديدة، ويمرر الـ ID الحقيقي.
   * يُستخدم لتحديث loadedIdRef حتى لا تُعيد useLoadInvoice ضبط الحالة.
   */
  onNewInvoiceSaved?: (id: string) => void;
}

export function useAutoSave(params: AutoSaveParams) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");
  const autoSaveIdRef = useRef<string | null>(null);

  const {
    isDraft, warehouseId, invoiceDate, customerType, customerName, contractCompany,
    discountPct, discountValue, subtotal, netTotal, notes, lines, editId, isNew,
    onNewInvoiceSaved,
  } = params;
  const onNewInvoiceSavedRef = useRef(onNewInvoiceSaved);
  onNewInvoiceSavedRef.current = onNewInvoiceSaved;

  useEffect(() => {
    if (isNew) {
      autoSaveIdRef.current = null;
      lastAutoSaveDataRef.current = "";
      setAutoSaveStatus("idle");
    } else if (editId && editId !== "new") {
      autoSaveIdRef.current = editId;
    }
  }, [isNew, editId]);

  const buildPayload = useCallback(() => {
    const header = {
      warehouseId,
      invoiceDate,
      customerType,
      customerName: customerName || null,
      contractCompany: customerType === "contract" ? contractCompany : null,
      discountPercent: discountPct,
      discountValue,
      subtotal: +subtotal.toFixed(2),
      netTotal: +netTotal.toFixed(2),
      notes: notes || null,
    };
    const linesPayload = lines.map((ln, i) => ({
      itemId: ln.itemId,
      unitLevel: ln.unitLevel,
      qty: ln.qty,
      salePrice: ln.salePrice,
      lineTotal: ln.lineTotal,
      expiryMonth: ln.expiryMonth,
      expiryYear: ln.expiryYear,
      lotId: ln.lotId,
      lineNo: i + 1,
    }));
    const existingId = autoSaveIdRef.current || (editId !== "new" ? editId : undefined);
    return { header, lines: linesPayload, existingId };
  }, [warehouseId, invoiceDate, customerType, customerName, contractCompany, discountPct, discountValue, subtotal, netTotal, notes, lines, editId]);

  const performAutoSave = useCallback(async () => {
    if (!isDraft || !warehouseId) return;
    // لا تحفظ فاتورة جديدة فارغة — لا معنى لحفظها ولا لإنشاء قيد فارغ
    if (isNew && lines.length === 0) return;
    const payload = buildPayload();
    const dataStr = JSON.stringify(payload);
    if (dataStr === lastAutoSaveDataRef.current) return;
    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/sales-invoices/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dataStr,
      });
      if (!res.ok) throw new Error("Auto-save failed");
      const data = await res.json();
      lastAutoSaveDataRef.current = dataStr;
      setAutoSaveStatus("saved");
      if (isNew && !autoSaveIdRef.current && data?.id) {
        autoSaveIdRef.current = data.id;
        // أبلغ useLoadInvoice بالـ ID الجديد قبل تغيير الـ URL
        // حتى تتجاهل الـ detail query المقبلة ولا تُعيد ضبط الحالة
        onNewInvoiceSavedRef.current?.(data.id);
        window.history.replaceState(null, "", `/sales-invoices?id=${data.id}`);
      }
      // لا نُبطل detail query الفاتورة الحالية — الـ auto-save حفظها للتو
      // نُبطل القائمة فقط إذا لم يكن المستخدم في وضع التحرير
      // (القائمة تعرض فقط عندما editId غير موجود، لذا الإبطال آمن)
      queryClient.invalidateQueries({
        queryKey: ["/api/sales-invoices"],
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          // أبطل القائمة (مفاتيح تحتوي على أرقام/فلاتر) لكن ليس الـ detail (مفتاح ثانٍ = UUID)
          // تمييز detail: المفتاح الثاني هو string يشبه UUID أو "new"
          const second = key[1];
          if (typeof second === "string" && second.length > 10) return false;
          return true;
        },
      });
    } catch {
      setAutoSaveStatus("error");
    }
  }, [isDraft, warehouseId, buildPayload, isNew, lines]);

  useEffect(() => {
    if (!isDraft || !warehouseId) return;
    // لا نبدأ العد التنازلي إذا كانت الفاتورة جديدة وفارغة
    if (isNew && lines.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { performAutoSave(); }, 15000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [isDraft, warehouseId, isNew, lines, invoiceDate, customerType, customerName, contractCompany, discountPct, discountValue, notes, performAutoSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isDraft || !warehouseId) return;
      if (isNew && lines.length === 0) return;
      const payload = buildPayload();
      const dataStr = JSON.stringify(payload);
      if (dataStr === lastAutoSaveDataRef.current) return;
      navigator.sendBeacon("/api/sales-invoices/auto-save", new Blob([dataStr], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraft, warehouseId, buildPayload]);

  return { autoSaveStatus, setAutoSaveStatus, autoSaveIdRef, lastAutoSaveDataRef, performAutoSave };
}
