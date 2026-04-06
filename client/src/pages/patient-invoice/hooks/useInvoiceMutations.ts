import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LineLocal, PaymentLocal } from "../types";
import { useInvoiceValidation } from "./useInvoiceValidation";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

interface UseInvoiceMutationsParams {
  invoiceId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  patientName: string;
  patientPhone: string;
  patientType: "cash" | "contract";
  departmentId: string;
  warehouseId: string;
  doctorName: string;
  contractName: string;
  notes: string;
  admissionId: string;
  totals: Totals;
  lines: LineLocal[];
  payments: PaymentLocal[];
  setInvoiceId: (id: string) => void;
  setStatus: (s: string) => void;
  resetAll: () => void;
}

export function useInvoiceMutations({
  invoiceId, invoiceNumber, invoiceDate, patientName, patientPhone,
  patientType, departmentId, warehouseId, doctorName, contractName,
  notes, admissionId, totals, lines, payments,
  setInvoiceId, setStatus, resetAll,
}: UseInvoiceMutationsParams) {
  const { toast } = useToast();
  const { validateSave, validateFinalize } = useInvoiceValidation();

  const [zeroPriceOpen, setZeroPriceOpen] = useState(false);
  const zeroPriceOverrideRef = useRef<{ allow: boolean; reason: string }>({ allow: false, reason: "" });

  function buildPayload(allowZeroPrice: boolean, zeroPriceReason: string) {
    const header = {
      invoiceNumber, invoiceDate, patientName,
      patientPhone: patientPhone || null,
      patientType,
      departmentId: departmentId || null,
      warehouseId: warehouseId || null,
      doctorName: doctorName || null,
      contractName: patientType === "contract" ? contractName : null,
      notes: notes || null,
      admissionId: admissionId || null,
      status: "draft",
      totalAmount: String(totals.totalAmount),
      discountAmount: String(totals.discountAmount),
      netAmount: String(totals.netAmount),
      paidAmount: String(totals.paidAmount),
    };
    const lineData = lines.map((l, i) => {
      const isStayEngine = l.sourceType === "STAY_ENGINE";
      const qty = isStayEngine && (l.quantity === 0 || !l.quantity) ? null : String(l.quantity);
      return {
        lineType: l.lineType,
        serviceId: l.serviceId || null,
        itemId: l.itemId || null,
        description: l.description,
        quantity: qty,
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
        templateId:           (l as any).templateId           || null,
        templateNameSnapshot: (l as any).templateNameSnapshot || null,
      };
    });
    const payData = payments.map(p => ({
      paymentDate: p.paymentDate,
      amount: String(p.amount),
      paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber || null,
      notes: p.notes || null,
      treasuryId: p.treasuryId || null,
    }));
    return { header, lines: lineData, payments: payData, allowZeroPrice, zeroPriceReason };
  }

  async function callSaveApi(payload: ReturnType<typeof buildPayload>) {
    if (invoiceId) {
      const res = await apiRequest("PUT", `/api/patient-invoices/${invoiceId}`, payload);
      return res.json();
    } else {
      const res = await apiRequest("POST", "/api/patient-invoices", payload);
      return res.json();
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validateSave({ patientName })) throw new Error("validation");

      const { allow, reason } = zeroPriceOverrideRef.current;
      const payload = buildPayload(allow, reason);

      const hasZeroPrice = payload.lines.some(l => parseFloat(String(l.unitPrice)) <= 0);
      if (hasZeroPrice && !allow) {
        setZeroPriceOpen(true);
        throw new Error("zero-price-pending");
      }

      return callSaveApi(payload);
    },
    onSuccess: (data) => {
      zeroPriceOverrideRef.current = { allow: false, reason: "" };
      setInvoiceId(data.id);
      setStatus(data.status);
      toast({ title: "تم الحفظ", description: "تم حفظ فاتورة المريض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
    },
    onError: (error: Error) => {
      if (error.message !== "validation" && error.message !== "zero-price-pending") {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      }
    },
  });

  function confirmZeroPrice(reason: string) {
    zeroPriceOverrideRef.current = { allow: true, reason };
    setZeroPriceOpen(false);
    saveMutation.mutate();
  }

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const error = validateFinalize({ invoiceId, lines });
      if (error) throw new Error(error);
      const res = await apiRequest("POST", `/api/patient-invoices/${invoiceId}/finalize`);
      return res.json();
    },
    onSuccess: (data) => {
      setStatus(data.status || "finalized");
      toast({ title: "تم الاعتماد", description: "تم اعتماد فاتورة المريض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  return { saveMutation, finalizeMutation, zeroPriceOpen, setZeroPriceOpen, confirmZeroPrice };
}
