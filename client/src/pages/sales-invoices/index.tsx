/**
 * SalesInvoices — نقطة دخول صفحة فواتير المبيعات
 *
 * المسؤولية هنا: التوجيه فقط (Registry ↔ Editor).
 * كل منطق الحالة في hooks. كل UI في المكوّنات.
 *
 * التدفق:
 *   URL بدون ?id  → InvoiceRegistry (قائمة الفواتير)
 *   URL ?id=new   → SalesInvoiceEditor (فاتورة جديدة)
 *   URL ?id=UUID  → SalesInvoiceEditor (تحرير فاتورة موجودة)
 */
import { useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Warehouse, SalesInvoiceWithDetails } from "@shared/schema";

import { useInvoiceForm }     from "./hooks/useInvoiceForm";
import { useInvoiceLines }    from "./hooks/useInvoiceLines";
import { useInvoiceMutations } from "./hooks/useInvoiceMutations";
import { useAutoSave }        from "./hooks/useAutoSave";
import { useItemSearch }      from "./hooks/useItemSearch";
import { useServiceSearch }   from "./hooks/useServiceSearch";
import { useStatsDialog }     from "./hooks/useStatsDialog";
import { useRegistry }        from "./hooks/useRegistry";
import { useLoadInvoice }     from "./hooks/useLoadInvoice";
import { useBarcodeScanner }  from "./hooks/useBarcodeScanner";

import { SalesInvoiceEditor } from "./SalesInvoiceEditor";
import { InvoiceRegistry }    from "./components/InvoiceRegistry";

import { useState } from "react";

export default function SalesInvoices() {
  const { toast }           = useToast();
  const [, navigate]        = useLocation();
  const searchString        = useSearch();
  const params              = new URLSearchParams(searchString);
  const editId              = params.get("id");
  const today               = new Date().toISOString().split("T")[0];
  const isNew               = editId === "new";

  // ── بيانات عامة ───────────────────────────────────────────────────────────
  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<SalesInvoiceWithDetails>({
    queryKey: ["/api/sales-invoices", editId],
    queryFn:  async () => {
      const r = await fetch(`/api/sales-invoices/${editId}`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: !!editId && editId !== "new",
  });

  const isDraft = isNew || invoiceDetail?.status === "draft";

  // ── hooks الحالة ──────────────────────────────────────────────────────────
  const form           = useInvoiceForm(today);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const linesHook = useInvoiceLines(form.warehouseId, form.invoiceDate, barcodeInputRef);
  const { lines, setLines } = linesHook;

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines]);
  const netTotal = useMemo(() => +(subtotal - form.discountValue).toFixed(2), [subtotal, form.discountValue]);

  // ── تحميل الفاتورة الموجودة ───────────────────────────────────────────────
  useLoadInvoice({ invoiceDetail, isNew, warehouses, form, setLines });

  // ── hooks الميزات ────────────────────────────────────────────────────────
  const registry       = useRegistry(today, !editId);
  const statsHook      = useStatsDialog();
  const itemSearchHook = useItemSearch(form.warehouseId);
  const serviceSearchHook = useServiceSearch(
    form.warehouseId, form.invoiceDate, linesHook.addItemToLines,
  );

  const autoSaveHook = useAutoSave({
    isDraft:         !!isDraft,
    warehouseId:     form.warehouseId,
    invoiceDate:     form.invoiceDate,
    customerType:    form.customerType,
    customerName:    form.customerName,
    contractCompany: form.contractCompany,
    discountPct:     form.discountPct,
    discountValue:   form.discountValue,
    subtotal, netTotal,
    notes:           form.notes,
    lines, editId, isNew,
  });

  const mutationsHook = useInvoiceMutations({
    editId, isNew,
    warehouseId:     form.warehouseId,
    invoiceDate:     form.invoiceDate,
    customerType:    form.customerType,
    customerName:    form.customerName,
    contractCompany: form.contractCompany,
    discountPct:     form.discountPct,
    discountValue:   form.discountValue,
    subtotal, netTotal,
    notes:           form.notes,
    lines,
    onSaveSuccess:   () => {},
    onFinalizeSuccess: () => {},
    lastAutoSaveDataRef: autoSaveHook.lastAutoSaveDataRef,
    setAutoSaveStatus:   autoSaveHook.setAutoSaveStatus,
    navigate,
  });

  const barcode = useBarcodeScanner({
    warehouseId:    form.warehouseId,
    isDraft:        !!isDraft,
    addItemToLines: linesHook.addItemToLines,
    pendingQtyRef:  linesHook.pendingQtyRef,
    barcodeInputRef,
  });

  // ── تركيز تلقائي ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (editId && isDraft) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [editId, isDraft]);

  // ── F9 للإنهاء ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editId || !isDraft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        if (!mutationsHook.finalizeMutation.isPending) {
          mutationsHook.finalizeMutation.mutate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editId, isDraft, mutationsHook.finalizeMutation]);

  // ── بيانات تجريبية (dev/demo) ─────────────────────────────────────────────
  const [seedLoading,      setSeedLoading]      = useState(false);
  const [quickTestLoading, setQuickTestLoading] = useState(false);
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<string | null>(null);

  const handleSeedDemo = async () => {
    setSeedLoading(true);
    try {
      const res  = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      const data = await res.json();
      toast({ title: "تم تحميل البيانات التجريبية", description: `${data.items.length} أصناف + مخزون تجريبي` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSeedLoading(false); }
  };

  const handleQuickTest = async () => {
    setQuickTestLoading(true);
    try {
      const seedRes  = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!seedRes.ok) throw new Error("Seed failed");
      const seedData = await seedRes.json();
      const res      = await apiRequest("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: today, warehouseId: seedData.warehouseId,
          customerType: "cash", customerName: "عميل اختبار سريع",
        },
        lines: [{ itemId: seedData.items[0].id, unitLevel: "minor", qty: "7", salePrice: "0" }],
      });
      const invoice = await res.json();
      toast({ title: "تم إنشاء فاتورة اختبار", description: `فاتورة #${invoice.invoiceNumber}` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      navigate(`/sales-invoices?id=${invoice.id}`);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setQuickTestLoading(false); }
  };

  // ── التوجيه: Editor أو Registry ──────────────────────────────────────────
  if (editId) {
    return (
      <SalesInvoiceEditor
        editId={editId}
        isNew={isNew}
        isDraft={!!isDraft}
        invoiceDetail={invoiceDetail}
        detailLoading={detailLoading}
        warehouses={warehouses}
        form={form}
        lines={lines}
        subtotal={subtotal}
        netTotal={netTotal}
        barcodeDisplay={barcode.barcodeDisplay}
        setBarcodeDisplay={barcode.setBarcodeDisplay}
        barcodeLoading={barcode.barcodeLoading}
        barcodeInputRef={barcodeInputRef}
        onBarcodeScan={barcode.handleBarcodeInputSubmit}
        linesHook={linesHook}
        mutationsHook={mutationsHook}
        autoSaveHook={autoSaveHook}
        itemSearchHook={itemSearchHook}
        serviceSearchHook={serviceSearchHook}
        statsHook={statsHook}
        onBack={() => navigate("/sales-invoices")}
      />
    );
  }

  return (
    <InvoiceRegistry
      invoices={registry.invoices}
      totalInvoices={registry.totalInvoices}
      totalPages={registry.totalPages}
      page={registry.page}
      pageSize={registry.pageSize}
      filterDateFrom={registry.filterDateFrom}
      filterDateTo={registry.filterDateTo}
      filterStatus={registry.filterStatus}
      filterCustomerType={registry.filterCustomerType}
      filterPharmacistId={registry.filterPharmacistId}
      filterSearch={registry.filterSearch}
      listLoading={registry.listLoading}
      deletePending={mutationsHook.deleteMutation.isPending}
      deleteVariables={mutationsHook.deleteMutation.variables as string | undefined}
      confirmDeleteId={confirmDeleteId}
      warehouses={warehouses}
      pharmacistUsers={registry.pharmacistUsers}
      totals={registry.totals}
      seedLoading={seedLoading}
      quickTestLoading={quickTestLoading}
      onSetPage={registry.setPage}
      onSetFilterDateFrom={registry.setFilterDateFrom}
      onSetFilterDateTo={registry.setFilterDateTo}
      onSetFilterStatus={registry.setFilterStatus}
      onSetFilterCustomerType={registry.setFilterCustomerType}
      onSetFilterPharmacistId={registry.setFilterPharmacistId}
      onSetFilterSearch={registry.setFilterSearch}
      onNewInvoice={() => navigate("/sales-invoices?id=new")}
      onOpenInvoice={(id) => navigate(`/sales-invoices?id=${id}`)}
      onDeleteClick={(id) => setConfirmDeleteId(id)}
      onConfirmDelete={() => {
        if (confirmDeleteId) {
          mutationsHook.deleteMutation.mutate(confirmDeleteId, {
            onSettled: () => setConfirmDeleteId(null),
          });
        }
      }}
      onCancelDelete={() => setConfirmDeleteId(null)}
      onSeedDemo={handleSeedDemo}
      onQuickTest={handleQuickTest}
    />
  );
}
