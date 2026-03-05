import { useState, useCallback } from "react";

export interface InvoiceFormState {
  warehouseId:      string;
  invoiceDate:      string;
  customerType:     string;
  customerName:     string;
  contractCompany:  string;
  discountPct:      number;
  discountValue:    number;
  notes:            string;
}

export function useInvoiceForm(today: string) {
  const [warehouseId,      setWarehouseId]      = useState("");
  const [invoiceDate,      setInvoiceDate]      = useState(today);
  const [customerType,     setCustomerType]     = useState("cash");
  const [customerName,     setCustomerName]     = useState("");
  const [contractCompany,  setContractCompany]  = useState("");
  const [discountPct,      setDiscountPct]      = useState(0);
  const [discountValue,    setDiscountValue]    = useState(0);
  const [notes,            setNotes]            = useState("");

  const resetForm = useCallback((defaults?: Partial<InvoiceFormState>) => {
    setWarehouseId(defaults?.warehouseId      ?? "");
    setInvoiceDate(defaults?.invoiceDate      ?? today);
    setCustomerType(defaults?.customerType    ?? "cash");
    setCustomerName(defaults?.customerName    ?? "");
    setContractCompany(defaults?.contractCompany ?? "");
    setDiscountPct(defaults?.discountPct      ?? 0);
    setDiscountValue(defaults?.discountValue  ?? 0);
    setNotes(defaults?.notes                  ?? "");
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
    warehouseId,     setWarehouseId,
    invoiceDate,     setInvoiceDate,
    customerType,    setCustomerType,
    customerName,    setCustomerName,
    contractCompany, setContractCompany,
    discountPct,     setDiscountPct,
    discountValue,   setDiscountValue,
    notes,           setNotes,
    resetForm,
    handleDiscountPctChange,
    handleDiscountValueChange,
  };
}

/** النوع الكامل لـ useInvoiceForm — لاستخدامه في hooks المستخرجة */
export type InvoiceFormHandlers = ReturnType<typeof useInvoiceForm>;
