/**
 * PurchaseInvoices — نقطة دخول صفحة فواتير الشراء
 *
 * Orchestrator نظيف: يوجّه بين عرضين:
 *   بدون ?id  → InvoiceRegistry  (قائمة الفواتير)
 *   مع ?id    → InvoiceEditor    (محرر فاتورة بعينها)
 *
 * كل المنطق في hooks مستقلة — هذا الملف يجمع فقط.
 */
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery }  from "@tanstack/react-query";
import type { PurchaseInvoiceWithDetails } from "@shared/schema";

import { useInvoiceLines }    from "./hooks/useInvoiceLines";
import { useInvoiceDiscount } from "./hooks/useInvoiceDiscount";
import { useInvoiceMutations } from "./hooks/useInvoiceMutations";

import { InvoiceRegistry } from "./components/InvoiceRegistry";
import { InvoiceEditor }   from "./components/InvoiceEditor";

export default function PurchaseInvoices() {
  const searchString = useSearch();
  const editId       = new URLSearchParams(searchString).get("id");

  // ── بيانات الفاتورة الحالية ───────────────────────────────────────────
  const { data: invoiceDetail, isLoading: detailLoading } =
    useQuery<PurchaseInvoiceWithDetails>({
      queryKey: [`/api/purchase-invoices/${editId}`],
      enabled:  !!editId,
    });


  // ── Hooks الحالة ─────────────────────────────────────────────────────
  const invoiceLines = useInvoiceLines();
  const discount     = useInvoiceDiscount(invoiceLines.lines);

  const [invoiceDate,  setInvoiceDate]  = useState("");
  const [notes,        setNotes]        = useState("");
  const [claimNumber,  setClaimNumber]  = useState("");

  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  // ── تحميل البيانات من السيرفر عند فتح الفاتورة ───────────────────────
  useEffect(() => {
    if (!invoiceDetail) return;
    setInvoiceDate(invoiceDetail.invoiceDate);
    setNotes(invoiceDetail.notes || "");
    setClaimNumber(invoiceDetail.claimNumber || "");
    invoiceLines.setLines(invoiceLines.mapServerLines(invoiceDetail.lines || []));
    discount.loadDiscount(
      invoiceDetail.discountType || "value",
      parseFloat(String(invoiceDetail.discountValue)) || 0,
      invoiceDetail.lines || [],
    );
  }, [invoiceDetail]);

  const isDraft = invoiceDetail?.status === "draft";

  // ── Mutations ─────────────────────────────────────────────────────────
  const mutations = useInvoiceMutations({
    editId,
    lines:         invoiceLines.lines,
    invoiceDate, notes, claimNumber,
    discountType:  discount.discountType,
    discountValue: discount.discountValue,
    onApproveSuccess: () => setConfirmApproveOpen(false),
  });

  // ── التوجيه ───────────────────────────────────────────────────────────
  if (!editId) {
    return <InvoiceRegistry />;
  }

  return (
    <InvoiceEditor
      invoiceDetail={invoiceDetail}
      isLoading={detailLoading}
      invoiceLines={invoiceLines}
      discount={discount}
      isPending={mutations.isPending}
      invoiceDate={invoiceDate}
      notes={notes}
      claimNumber={claimNumber}
      onInvoiceDateChange={setInvoiceDate}
      onClaimNumberChange={setClaimNumber}
      onSave={() => mutations.saveMutation.mutate()}
      onApprove={() => mutations.approveMutation.mutate()}
      confirmApproveOpen={confirmApproveOpen}
      setConfirmApproveOpen={setConfirmApproveOpen}
    />
  );
}
