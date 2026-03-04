import { useState, useCallback } from "react";

export interface InvoiceFormState {
  invoiceId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  patientName: string;
  patientPhone: string;
  departmentId: string;
  doctorName: string;
  patientType: "cash" | "contract";
  contractName: string;
  notes: string;
  status: string;
  admissionId: string;
  warehouseId: string;
  headerDiscountPercent: number;
  headerDiscountAmount: number;
  isDraft: boolean;
}

export interface InvoiceFormSetters {
  setInvoiceId: (v: string | null) => void;
  setInvoiceNumber: (v: string) => void;
  setInvoiceDate: (v: string) => void;
  setPatientName: (v: string) => void;
  setPatientPhone: (v: string) => void;
  setDepartmentId: (v: string) => void;
  setDoctorName: (v: string) => void;
  setPatientType: (v: "cash" | "contract") => void;
  setContractName: (v: string) => void;
  setNotes: (v: string) => void;
  setStatus: (v: string) => void;
  setAdmissionId: (v: string) => void;
  setWarehouseId: (v: string) => void;
  setHeaderDiscountPercent: (v: number) => void;
  setHeaderDiscountAmount: (v: number) => void;
  resetForm: () => void;
}

export function useInvoiceForm(nextNumber: string | undefined): InvoiceFormState & InvoiceFormSetters {
  const [invoiceId, setInvoiceId]         = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate]     = useState(new Date().toISOString().split("T")[0]);
  const [patientName, setPatientName]     = useState("");
  const [patientPhone, setPatientPhone]   = useState("");
  const [departmentId, setDepartmentId]   = useState("");
  const [doctorName, setDoctorName]       = useState("");
  const [patientType, setPatientType]     = useState<"cash" | "contract">("cash");
  const [contractName, setContractName]   = useState("");
  const [notes, setNotes]                 = useState("");
  const [status, setStatus]               = useState("draft");
  const [admissionId, setAdmissionId]     = useState("");
  const [warehouseId, setWarehouseId]     = useState("");
  const [headerDiscountPercent, setHeaderDiscountPercent] = useState(0);
  const [headerDiscountAmount, setHeaderDiscountAmount]   = useState(0);

  const resetForm = useCallback(() => {
    setInvoiceId(null);
    setInvoiceNumber(nextNumber || "");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setPatientName("");
    setPatientPhone("");
    setDepartmentId("");
    setWarehouseId("");
    setDoctorName("");
    setPatientType("cash");
    setContractName("");
    setNotes("");
    setAdmissionId("");
    setStatus("draft");
    setHeaderDiscountPercent(0);
    setHeaderDiscountAmount(0);
  }, [nextNumber]);

  return {
    invoiceId, setInvoiceId,
    invoiceNumber, setInvoiceNumber,
    invoiceDate, setInvoiceDate,
    patientName, setPatientName,
    patientPhone, setPatientPhone,
    departmentId, setDepartmentId,
    doctorName, setDoctorName,
    patientType, setPatientType,
    contractName, setContractName,
    notes, setNotes,
    status, setStatus,
    admissionId, setAdmissionId,
    warehouseId, setWarehouseId,
    headerDiscountPercent, setHeaderDiscountPercent,
    headerDiscountAmount, setHeaderDiscountAmount,
    isDraft: status === "draft",
    resetForm,
  };
}
