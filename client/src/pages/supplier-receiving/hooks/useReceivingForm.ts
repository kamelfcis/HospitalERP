/**
 * useReceivingForm — حالة رأس إذن الاستلام
 *
 * يحتوي على: بيانات الرأس، حالة النموذج، والمنطق المشتق.
 */
import { useState } from "react";
import { ReceivingLineLocal } from "../types";

const today = () => new Date().toISOString().split("T")[0];

export interface ReceivingFormState {
  editingReceivingId: string | null;
  setEditingReceivingId: (v: string | null) => void;
  receiveDate: string;
  setReceiveDate: (v: string) => void;
  supplierId: string;
  setSupplierId: (v: string) => void;
  supplierInvoiceNo: string;
  setSupplierInvoiceNo: (v: string) => void;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  formStatus: string;
  setFormStatus: (v: string) => void;
  formReceivingNumber: number | null;
  setFormReceivingNumber: (v: number | null) => void;
  formCorrectionStatus: string | null;
  setFormCorrectionStatus: (v: string | null) => void;
  formCorrectionOfId: string | null;
  setFormCorrectionOfId: (v: string | null) => void;
  formConvertedToInvoiceId: string | null;
  setFormConvertedToInvoiceId: (v: string | null) => void;
  invoiceDuplicateError: string;
  setInvoiceDuplicateError: (v: string) => void;
  isEditingPosted: boolean;
  setIsEditingPosted: (v: boolean) => void;
  isViewOnly: boolean;
  canSaveDraft: (lines: ReceivingLineLocal[]) => boolean;
  resetForm: (
    resetLines: () => void,
    resetAutoSave: () => void,
  ) => void;
}

export function useReceivingForm(): ReceivingFormState {
  const [editingReceivingId, setEditingReceivingId]       = useState<string | null>(null);
  const [receiveDate, setReceiveDate]                     = useState(today());
  const [supplierId, setSupplierId]                       = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo]         = useState("");
  const [warehouseId, setWarehouseId]                     = useState("");
  const [formNotes, setFormNotes]                         = useState("");
  const [formStatus, setFormStatus]                       = useState("draft");
  const [formReceivingNumber, setFormReceivingNumber]     = useState<number | null>(null);
  const [formCorrectionStatus, setFormCorrectionStatus]   = useState<string | null>(null);
  const [formCorrectionOfId, setFormCorrectionOfId]       = useState<string | null>(null);
  const [formConvertedToInvoiceId, setFormConvertedToInvoiceId] = useState<string | null>(null);
  const [invoiceDuplicateError, setInvoiceDuplicateError] = useState("");

  const [isEditingPosted, setIsEditingPosted] = useState(false);

  const isViewOnly = formStatus !== "draft" && !isEditingPosted;

  const canSaveDraft = (lines: ReceivingLineLocal[]) =>
    !!supplierId &&
    !!supplierInvoiceNo.trim() &&
    !!warehouseId &&
    !!receiveDate &&
    lines.length > 0 &&
    (formStatus === "draft" || isEditingPosted) &&
    !invoiceDuplicateError;

  const resetForm = (
    resetLines: () => void,
    resetAutoSave: () => void,
  ) => {
    setEditingReceivingId(null);
    setReceiveDate(today());
    setSupplierId("");
    setSupplierInvoiceNo("");
    setWarehouseId("");
    setFormNotes("");
    setFormStatus("draft");
    setFormReceivingNumber(null);
    setInvoiceDuplicateError("");
    setFormCorrectionStatus(null);
    setFormCorrectionOfId(null);
    setFormConvertedToInvoiceId(null);
    setIsEditingPosted(false);
    resetLines();
    resetAutoSave();
  };

  return {
    editingReceivingId, setEditingReceivingId,
    isEditingPosted, setIsEditingPosted,
    receiveDate, setReceiveDate,
    supplierId, setSupplierId,
    supplierInvoiceNo, setSupplierInvoiceNo,
    warehouseId, setWarehouseId,
    formNotes, setFormNotes,
    formStatus, setFormStatus,
    formReceivingNumber, setFormReceivingNumber,
    formCorrectionStatus, setFormCorrectionStatus,
    formCorrectionOfId, setFormCorrectionOfId,
    formConvertedToInvoiceId, setFormConvertedToInvoiceId,
    invoiceDuplicateError, setInvoiceDuplicateError,
    isViewOnly,
    canSaveDraft,
    resetForm,
  };
}
