import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LineLocal, PaymentLocal } from "../types";

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
  resetForm: () => void;
}

export function useInvoiceMutations({
  invoiceId,
  invoiceNumber,
  invoiceDate,
  patientName,
  patientPhone,
  patientType,
  departmentId,
  warehouseId,
  doctorName,
  contractName,
  notes,
  admissionId,
  totals,
  lines,
  payments,
  setInvoiceId,
  setStatus,
  resetForm,
}: UseInvoiceMutationsParams) {
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const header = {
        invoiceNumber,
        invoiceDate,
        patientName,
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
      const lineData = lines.map((l, i) => ({
        lineType: l.lineType,
        serviceId: l.serviceId || null,
        itemId: l.itemId || null,
        description: l.description,
        quantity: String(l.quantity),
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
      }));
      const payData = payments.map((p) => ({
        paymentDate: p.paymentDate,
        amount: String(p.amount),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || null,
        notes: p.notes || null,
      }));

      if (invoiceId) {
        const res = await apiRequest("PUT", `/api/patient-invoices/${invoiceId}`, { header, lines: lineData, payments: payData });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/patient-invoices", { header, lines: lineData, payments: payData });
        return res.json();
      }
    },
    onSuccess: (data) => {
      setInvoiceId(data.id);
      setStatus(data.status);
      toast({ title: "تم الحفظ", description: "تم حفظ فاتورة المريض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceId) throw new Error("يجب حفظ الفاتورة أولاً");
      const missingDoctor = lines.filter(l => l.lineType === "service" && l.requiresDoctor && !l.doctorName.trim());
      const missingNurse = lines.filter(l => l.lineType === "service" && l.requiresNurse && !l.nurseName.trim());
      if (missingDoctor.length > 0) {
        throw new Error(`يجب إدخال اسم الطبيب للخدمات: ${missingDoctor.map(l => l.description).join("، ")}`);
      }
      if (missingNurse.length > 0) {
        throw new Error(`يجب إدخال اسم الممرض للخدمات: ${missingNurse.map(l => l.description).join("، ")}`);
      }
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patient-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف فاتورة المريض" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  return { saveMutation, finalizeMutation, deleteMutation };
}
