import { useState, useCallback } from "react";

export interface InvoiceFormState {
  warehouseId:        string;
  invoiceDate:        string;
  customerType:       string;
  customerId:         string;
  customerName:       string;
  contractCompany:    string;
  contractId:         string;
  contractMemberId:   string;
  companyId:          string;
  companyCoveragePct: number;
  discountPct:        number;
  discountValue:      number;
  notes:              string;
  // ── حقول المريض (للتعاقدات) ───────────────────────────────────────────
  patientId:          string;
  patientName:        string;
}

export function useInvoiceForm(today: string) {
  const [warehouseId,        setWarehouseId]        = useState("");
  const [invoiceDate,        setInvoiceDate]        = useState(today);
  const [customerType,       setCustomerType]       = useState("cash");
  const [customerId,         setCustomerId]         = useState("");
  const [customerName,       setCustomerName]       = useState("");
  const [contractCompany,    setContractCompany]    = useState("");
  const [contractId,         setContractId]         = useState("");
  const [contractMemberId,   setContractMemberId]   = useState("");
  const [companyId,          setCompanyId]          = useState("");
  const [companyCoveragePct, setCompanyCoveragePct] = useState(100);
  const [discountPct,        setDiscountPct]        = useState(0);
  const [discountValue,      setDiscountValue]      = useState(0);
  const [notes,              setNotes]              = useState("");
  const [patientId,          setPatientId]          = useState("");
  const [patientName,        setPatientName]        = useState("");

  const resetForm = useCallback((defaults?: Partial<InvoiceFormState>) => {
    setWarehouseId(defaults?.warehouseId         ?? "");
    setInvoiceDate(defaults?.invoiceDate         ?? today);
    setCustomerType(defaults?.customerType       ?? "cash");
    setCustomerId(defaults?.customerId           ?? "");
    setCustomerName(defaults?.customerName       ?? "");
    setContractCompany(defaults?.contractCompany ?? "");
    setContractId(defaults?.contractId           ?? "");
    setContractMemberId(defaults?.contractMemberId ?? "");
    setCompanyId(defaults?.companyId             ?? "");
    setCompanyCoveragePct(defaults?.companyCoveragePct ?? 100);
    setDiscountPct(defaults?.discountPct         ?? 0);
    setDiscountValue(defaults?.discountValue     ?? 0);
    setNotes(defaults?.notes                     ?? "");
    setPatientId(defaults?.patientId             ?? "");
    setPatientName(defaults?.patientName         ?? "");
  }, [today]);

  const handleDiscountPctChange = useCallback((val: string, subtotal: number) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setDiscountPct(+pct.toFixed(4));
    setDiscountValue(+(subtotal * (pct / 100)).toFixed(2));
  }, []);

  const handleDiscountValueChange = useCallback((val: string, subtotal: number) => {
    const dv = Math.min(subtotal, Math.max(0, parseFloat(val) || 0));
    setDiscountValue(+dv.toFixed(2));
    setDiscountPct(subtotal > 0 ? +((dv / subtotal) * 100).toFixed(4) : 0);
  }, []);

  return {
    warehouseId,        setWarehouseId,
    invoiceDate,        setInvoiceDate,
    customerType,       setCustomerType,
    customerId,         setCustomerId,
    customerName,       setCustomerName,
    contractCompany,    setContractCompany,
    contractId,         setContractId,
    contractMemberId,   setContractMemberId,
    companyId,          setCompanyId,
    companyCoveragePct, setCompanyCoveragePct,
    discountPct,        setDiscountPct,
    discountValue,      setDiscountValue,
    notes,              setNotes,
    patientId,          setPatientId,
    patientName,        setPatientName,
    resetForm,
    handleDiscountPctChange,
    handleDiscountValueChange,
  };
}

/** النوع الكامل لـ useInvoiceForm — لاستخدامه في hooks المستخرجة */
export type InvoiceFormHandlers = ReturnType<typeof useInvoiceForm>;
