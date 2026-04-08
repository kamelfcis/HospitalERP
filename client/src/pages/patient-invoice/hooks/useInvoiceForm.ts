import { useState, useCallback } from "react";

export interface InvoiceFormState {
  invoiceId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  patientName: string;
  patientPhone: string;
  patientId: string;
  patientCode: string;
  departmentId: string;
  doctorName: string;
  patientType: "cash" | "contract";
  contractName: string;
  contractId: string;
  companyId: string;
  contractMemberId: string;
  companyCoveragePct: number;
  notes: string;
  status: string;
  admissionId: string;
  visitId: string;
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
  setPatientId: (v: string) => void;
  setPatientCode: (v: string) => void;
  setDepartmentId: (v: string) => void;
  setDoctorName: (v: string) => void;
  setPatientType: (v: "cash" | "contract") => void;
  setContractName: (v: string) => void;
  setContractId: (v: string) => void;
  setCompanyId: (v: string) => void;
  setContractMemberId: (v: string) => void;
  setCompanyCoveragePct: (v: number) => void;
  setNotes: (v: string) => void;
  setStatus: (v: string) => void;
  setAdmissionId: (v: string) => void;
  setVisitId: (v: string) => void;
  setWarehouseId: (v: string) => void;
  setHeaderDiscountPercent: (v: number) => void;
  setHeaderDiscountAmount: (v: number) => void;
  resetForm: (defaults?: {
    warehouseId?: string;
    departmentId?: string;
  }) => void;
}

export function useInvoiceForm(
  nextNumber: string | undefined,
  userDefaults?: { warehouseId?: string | null; departmentId?: string | null }
): InvoiceFormState & InvoiceFormSetters {
  const [invoiceId, setInvoiceId]         = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate]     = useState(new Date().toISOString().split("T")[0]);
  const [patientName, setPatientName]     = useState("");
  const [patientPhone, setPatientPhone]   = useState("");
  const [patientId, setPatientId]         = useState("");
  const [patientCode, setPatientCode]     = useState("");
  const [departmentId, setDepartmentId]   = useState("");
  const [doctorName, setDoctorName]       = useState("");
  const [patientType, setPatientType]     = useState<"cash" | "contract">("cash");
  const [contractName, setContractName]   = useState("");
  const [contractId, setContractId]       = useState("");
  const [companyId, setCompanyId]         = useState("");
  const [contractMemberId, setContractMemberId] = useState("");
  const [companyCoveragePct, setCompanyCoveragePct] = useState(100);
  const [notes, setNotes]                 = useState("");
  const [status, setStatus]               = useState("draft");
  const [admissionId, setAdmissionId]     = useState("");
  const [visitId, setVisitId]             = useState("");
  const [warehouseId, setWarehouseId]     = useState("");
  const [headerDiscountPercent, setHeaderDiscountPercent] = useState(0);
  const [headerDiscountAmount, setHeaderDiscountAmount]   = useState(0);

  const resetForm = useCallback((defaults?: { warehouseId?: string; departmentId?: string }) => {
    setInvoiceId(null);
    setInvoiceNumber(nextNumber || "");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setPatientName("");
    setPatientPhone("");
    setPatientId("");
    setPatientCode("");
    setDepartmentId(defaults?.departmentId ?? userDefaults?.departmentId ?? "");
    setWarehouseId(defaults?.warehouseId ?? userDefaults?.warehouseId ?? "");
    setDoctorName("");
    setPatientType("cash");
    setContractName("");
    setContractId("");
    setCompanyId("");
    setContractMemberId("");
    setCompanyCoveragePct(100);
    setNotes("");
    setAdmissionId("");
    setVisitId("");
    setStatus("draft");
    setHeaderDiscountPercent(0);
    setHeaderDiscountAmount(0);
  }, [nextNumber, userDefaults?.warehouseId, userDefaults?.departmentId]);

  return {
    invoiceId, setInvoiceId,
    invoiceNumber, setInvoiceNumber,
    invoiceDate, setInvoiceDate,
    patientName, setPatientName,
    patientPhone, setPatientPhone,
    patientId, setPatientId,
    patientCode, setPatientCode,
    departmentId, setDepartmentId,
    doctorName, setDoctorName,
    patientType, setPatientType,
    contractName, setContractName,
    contractId, setContractId,
    companyId, setCompanyId,
    contractMemberId, setContractMemberId,
    companyCoveragePct, setCompanyCoveragePct,
    notes, setNotes,
    status, setStatus,
    admissionId, setAdmissionId,
    visitId, setVisitId,
    warehouseId, setWarehouseId,
    headerDiscountPercent, setHeaderDiscountPercent,
    headerDiscountAmount, setHeaderDiscountAmount,
    isDraft: status === "draft",
    resetForm,
  };
}
