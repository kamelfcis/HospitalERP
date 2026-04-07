/**
 * useAutoSave — حفظ تلقائي لفاتورة المريض
 *
 * يحفظ كل 15 ثانية إذا تغيّرت البيانات.
 * يُرسل beacon عند إغلاق التبويب.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import type { LineLocal, PaymentLocal } from "../types";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
}

interface UseAutoSaveParams {
  formStatus:       string;
  invoiceId:        string | null;
  invoiceNumber:    string;
  invoiceDate:      string;
  patientName:      string;
  patientPhone:     string;
  patientId:        string;
  patientType:      "cash" | "contract";
  departmentId:     string;
  warehouseId:      string;
  doctorName:       string;
  contractName:     string;
  contractId:       string;
  companyId:        string;
  contractMemberId: string;
  notes:            string;
  admissionId:      string;
  totals:           Totals;
  lines:            LineLocal[];
  payments:         PaymentLocal[];
  onIdAssigned:     (id: string) => void;
}

function buildAutoSavePayload(params: UseAutoSaveParams) {
  const {
    invoiceNumber, invoiceDate, patientName, patientPhone, patientId,
    patientType, departmentId, warehouseId, doctorName,
    contractName, contractId, companyId, contractMemberId,
    notes, admissionId, totals, lines, payments,
  } = params;

  const header = {
    invoiceNumber, invoiceDate, patientName,
    patientPhone: patientPhone || null,
    patientId: patientId || null,
    patientType,
    departmentId: departmentId || null,
    warehouseId: warehouseId || null,
    doctorName: doctorName || null,
    contractName: patientType === "contract" ? contractName : null,
    contractId: patientType === "contract" ? contractId || null : null,
    companyId: patientType === "contract" ? companyId || null : null,
    contractMemberId: patientType === "contract" ? contractMemberId || null : null,
    notes: notes || null,
    admissionId: admissionId || null,
    status: "draft",
    totalAmount: String(totals.totalAmount),
    discountAmount: String(totals.discountAmount),
    netAmount: String(totals.netAmount),
    paidAmount: String(totals.paidAmount),
  };

  const lineData = lines
    .filter(l => !(l.sourceType === "STAY_ENGINE" && (!l.quantity || l.quantity === 0)))
    .map((l, i) => ({
      lineType: l.lineType,
      serviceId: l.serviceId || null,
      itemId: l.itemId || null,
      description: l.description,
      quantity: String(l.quantity || 0),
      unitPrice: String(l.unitPrice),
      discountPercent: String(l.discountPercent),
      discountAmount: String(l.discountAmount),
      totalPrice: String(l.totalPrice),
      unitLevel: l.unitLevel || "minor",
      doctorName: l.doctorName || null,
      nurseName: l.nurseName || null,
      notes: l.notes || null,
      sortOrder: i,
      lotId: l.lotId || null,
      expiryMonth: l.expiryMonth || null,
      expiryYear: l.expiryYear || null,
      priceSource: l.priceSource || null,
      sourceType: l.sourceType || null,
      sourceId: l.sourceId || null,
      businessClassification: l.businessClassification || null,
      templateId: (l as any).templateId || null,
      templateNameSnapshot: (l as any).templateNameSnapshot || null,
      appliedAt: (l as any).appliedAt || null,
      appliedBy: (l as any).appliedBy || null,
    }));

  const payData = payments.map(p => ({
    paymentDate: p.paymentDate,
    amount: String(p.amount),
    paymentMethod: p.paymentMethod,
    referenceNumber: p.referenceNumber || null,
    notes: p.notes || null,
    treasuryId: p.treasuryId || null,
  }));

  return { header, lines: lineData, payments: payData, allowZeroPrice: true, zeroPriceReason: "auto-save" };
}

export function useAutoSave(params: UseAutoSaveParams) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const lastSavedDataRef = useRef<string>("");
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramsRef        = useRef(params);
  paramsRef.current      = params;

  const performAutoSave = useCallback(async () => {
    const p = paramsRef.current;
    if (p.formStatus !== "draft") return;
    // لا تحفظ فاتورة فارغة تماماً (بدون أسطر ولا ID) — نفس منطق التحويل المخزني
    if (!p.invoiceId && p.lines.length === 0) return;

    let payload: ReturnType<typeof buildAutoSavePayload>;
    try { payload = buildAutoSavePayload(p); } catch { return; }

    const dataKey = JSON.stringify(payload);
    if (dataKey === lastSavedDataRef.current) return;

    setAutoSaveStatus("saving");
    try {
      const url    = p.invoiceId ? `/api/patient-invoices/${p.invoiceId}` : "/api/patient-invoices";
      const method = p.invoiceId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        lastSavedDataRef.current = dataKey;
        if (!p.invoiceId && data.id) p.onIdAssigned(data.id);
        setAutoSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      } else {
        setAutoSaveStatus("error");
      }
    } catch {
      setAutoSaveStatus("error");
    }
  }, []);

  // حفظ كل 15 ثانية عند تغيّر البيانات
  useEffect(() => {
    const p = params;
    if (p.formStatus !== "draft") return;
    // لا نبدأ العد التنازلي لفاتورة فارغة تماماً — نفس منطق التحويل المخزني
    if (!p.invoiceId && p.lines.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performAutoSave, 15_000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.formStatus, params.invoiceId, params.invoiceNumber, params.invoiceDate,
    params.patientName, params.patientPhone, params.patientId, params.patientType,
    params.departmentId, params.warehouseId, params.doctorName,
    params.contractName, params.contractId, params.companyId, params.contractMemberId,
    params.notes, params.admissionId, params.lines, params.payments,
    params.totals, performAutoSave,
  ]);

  // beacon عند إغلاق التبويب
  useEffect(() => {
    const handleBeforeUnload = () => {
      const p = paramsRef.current;
      if (p.formStatus !== "draft") return;
      if (!p.invoiceId && p.lines.length === 0) return;
      let payload: ReturnType<typeof buildAutoSavePayload>;
      try { payload = buildAutoSavePayload(p); } catch { return; }
      const url = p.invoiceId ? `/api/patient-invoices/${p.invoiceId}` : "/api/patient-invoices";
      navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const resetAutoSave = useCallback(() => {
    lastSavedDataRef.current = "";
    setAutoSaveStatus("idle");
  }, []);

  return { autoSaveStatus, setAutoSaveStatus, performAutoSave, resetAutoSave };
}
