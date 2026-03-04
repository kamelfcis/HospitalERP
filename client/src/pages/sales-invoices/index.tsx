import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Warehouse, SalesInvoiceWithDetails } from "@shared/schema";

import { genId } from "./utils";
import { useInvoiceForm } from "./hooks/useInvoiceForm";
import { useInvoiceLines } from "./hooks/useInvoiceLines";
import { useItemSearch } from "./hooks/useItemSearch";
import { useServiceSearch } from "./hooks/useServiceSearch";
import { useAutoSave } from "./hooks/useAutoSave";
import { useStatsDialog } from "./hooks/useStatsDialog";
import { useRegistry } from "./hooks/useRegistry";
import { useInvoiceMutations } from "./hooks/useInvoiceMutations";

import { InvoiceHeaderBar } from "./components/InvoiceHeaderBar";
import { InvoiceLineTable } from "./components/InvoiceLineTable";
import { InvoiceTotals } from "./components/InvoiceTotals";
import { ItemSearchDialog } from "./components/ItemSearchDialog";
import { ServiceSearchDialog } from "./components/ServiceSearchDialog";
import { StockStatsDialog } from "./components/StockStatsDialog";
import { InvoiceRegistry } from "./components/InvoiceRegistry";

export default function SalesInvoices() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const editId = params.get("id");
  const today = new Date().toISOString().split("T")[0];

  const isNew = editId === "new";

  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<SalesInvoiceWithDetails>({
    queryKey: ["/api/sales-invoices", editId],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices/${editId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!editId && editId !== "new",
  });

  const isDraft = isNew || invoiceDetail?.status === "draft";

  const form = useInvoiceForm(today);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const {
    lines, setLines, fefoLoading, linesRef, pendingQtyRef,
    updateLine, removeLine, addItemToLines, handleQtyConfirm,
  } = useInvoiceLines(form.warehouseId, form.invoiceDate, barcodeInputRef);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines]);
  const netTotal = useMemo(() => +(subtotal - form.discountValue).toFixed(2), [subtotal, form.discountValue]);

  const registry = useRegistry(today, !editId);
  const stats = useStatsDialog();
  const itemSearch = useItemSearch(form.warehouseId);
  const serviceSearch = useServiceSearch(form.warehouseId, form.invoiceDate, addItemToLines);

  const autoSave = useAutoSave({
    isDraft: !!isDraft,
    warehouseId: form.warehouseId,
    invoiceDate: form.invoiceDate,
    customerType: form.customerType,
    customerName: form.customerName,
    contractCompany: form.contractCompany,
    discountPct: form.discountPct,
    discountValue: form.discountValue,
    subtotal,
    netTotal,
    notes: form.notes,
    lines,
    editId,
    isNew,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [quickTestLoading, setQuickTestLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const mutations = useInvoiceMutations({
    editId,
    isNew,
    warehouseId: form.warehouseId,
    invoiceDate: form.invoiceDate,
    customerType: form.customerType,
    customerName: form.customerName,
    contractCompany: form.contractCompany,
    discountPct: form.discountPct,
    discountValue: form.discountValue,
    subtotal,
    netTotal,
    notes: form.notes,
    lines,
    onSaveSuccess: () => {},
    onFinalizeSuccess: () => {},
    lastAutoSaveDataRef: autoSave.lastAutoSaveDataRef,
    setAutoSaveStatus: autoSave.setAutoSaveStatus,
    navigate,
  });

  const loadedInvoiceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNew) {
      form.resetForm({ warehouseId: warehouses?.[0]?.id || "" });
      setLines([]);
      loadedInvoiceIdRef.current = null;
    }
  }, [isNew, warehouses]);

  useEffect(() => {
    if (invoiceDetail && !isNew) {
      if (loadedInvoiceIdRef.current === invoiceDetail.id) return;
      loadedInvoiceIdRef.current = invoiceDetail.id;
      form.resetForm({
        warehouseId: invoiceDetail.warehouseId,
        invoiceDate: invoiceDetail.invoiceDate,
        customerType: invoiceDetail.customerType,
        customerName: invoiceDetail.customerName || "",
        contractCompany: invoiceDetail.contractCompany || "",
        discountPct: parseFloat(String(invoiceDetail.discountPercent)) || 0,
        discountValue: parseFloat(String(invoiceDetail.discountValue)) || 0,
        notes: invoiceDetail.notes || "",
      });
      const mapped = (invoiceDetail.lines || []).map((ln: any) => ({
        tempId: ln.id || genId(),
        itemId: ln.itemId,
        item: ln.item || null,
        unitLevel: ln.unitLevel || "major",
        qty: parseFloat(String(ln.qty)) || 0,
        salePrice: parseFloat(String(ln.salePrice)) || 0,
        baseSalePrice: parseFloat(String(ln.salePrice)) || 0,
        lineTotal: parseFloat(String(ln.lineTotal)) || 0,
        expiryMonth: ln.expiryMonth ?? null,
        expiryYear: ln.expiryYear ?? null,
        lotId: ln.lotId ?? null,
        fefoLocked: !!(ln.expiryMonth && ln.expiryYear),
      }));
      setLines(mapped);

      if (invoiceDetail.status === "draft" && invoiceDetail.warehouseId) {
        const allItemIds = Array.from(new Set(mapped.map((l: any) => l.itemId)));
        const expiryItemIds = Array.from(new Set(mapped.filter((l: any) => l.item?.hasExpiry).map((l: any) => l.itemId)));

        if (allItemIds.length > 0) {
          Promise.all(
            (allItemIds as string[]).map(async (itemId) => {
              try {
                const availRes = await fetch(`/api/items/${itemId}/availability?warehouseId=${invoiceDetail.warehouseId}`);
                const availData = availRes.ok ? await availRes.json() : { availableQtyMinor: "0" };
                return { itemId, available: availData.availableQtyMinor || "0" };
              } catch { return { itemId, available: "0" }; }
            })
          ).then((availResults) => {
            const availMap = new Map(availResults.map((r) => [r.itemId, r.available]));
            setLines((prev) => prev.map((l) => ({
              ...l,
              availableQtyMinor: availMap.get(l.itemId) || l.availableQtyMinor || "0",
            })));
          });
        }

        if (expiryItemIds.length > 0) {
          Promise.all(
            (expiryItemIds as string[]).map(async (itemId) => {
              try {
                const p = new URLSearchParams({ itemId, warehouseId: invoiceDetail.warehouseId, requiredQtyInMinor: "999999", asOfDate: invoiceDetail.invoiceDate });
                const res = await fetch(`/api/transfer/fefo-preview?${p}`);
                if (!res.ok) return { itemId, options: [] };
                const preview = await res.json();
                const options = preview.allocations
                  .filter((a: any) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty) > 0)
                  .map((a: any) => ({ expiryMonth: a.expiryMonth, expiryYear: a.expiryYear, qtyAvailableMinor: a.availableQty, lotId: a.lotId, lotSalePrice: a.lotSalePrice || "0" }));
                return { itemId, options };
              } catch { return { itemId, options: [] }; }
            })
          ).then((results) => {
            const optionsMap = new Map(results.map((r) => [r.itemId, r.options]));
            setLines((prev) => prev.map((l) => {
              if (l.item?.hasExpiry && optionsMap.has(l.itemId)) {
                return { ...l, expiryOptions: optionsMap.get(l.itemId) };
              }
              return l;
            }));
          });
        }
      }
    }
  }, [invoiceDetail, isNew]);

  useEffect(() => {
    if (editId && isDraft) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [editId, isDraft]);

  useEffect(() => {
    if (!editId || !isDraft) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        if (!mutations.finalizeMutation.isPending) {
          mutations.finalizeMutation.mutate();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editId, isDraft, mutations.finalizeMutation]);

  const handleBarcodeScan = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.found && data.itemId) {
        const itemRes = await fetch(`/api/items/search?warehouseId=${form.warehouseId}&mode=CODE&q=${encodeURIComponent(data.itemCode)}&page=1&pageSize=1&includeZeroStock=true`);
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          const items = itemData.data || itemData.items || itemData;
          if (Array.isArray(items) && items.length > 0) {
            await addItemToLines(items[0]);
          }
        }
      } else {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في قراءة الباركود", variant: "destructive" });
    }
    setBarcodeInput("");
    setBarcodeLoading(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [barcodeInput, form.warehouseId, addItemToLines, toast]);

  const handleSeedDemo = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      const data = await res.json();
      toast({ title: "تم تحميل البيانات التجريبية", description: `${data.items.length} أصناف + مخزون تجريبي` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSeedLoading(false);
    }
  };

  const handleQuickTest = async () => {
    setQuickTestLoading(true);
    try {
      const seedRes = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!seedRes.ok) throw new Error("Seed failed");
      const seedData = await seedRes.json();
      const createRes = await apiRequest("POST", "/api/sales-invoices", {
        header: { invoiceDate: today, warehouseId: seedData.warehouseId, customerType: "cash", customerName: "عميل اختبار سريع" },
        lines: [{ itemId: seedData.items[0].id, unitLevel: "minor", qty: "7", salePrice: "0" }],
      });
      const invoice = await createRes.json();
      toast({ title: "تم إنشاء فاتورة اختبار", description: `فاتورة #${invoice.invoiceNumber} - تحقق من التقسيم FEFO` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      navigate(`/sales-invoices?id=${invoice.id}`);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setQuickTestLoading(false);
    }
  };

  if (editId) {
    if (editId !== "new" && detailLoading) {
      return (
        <div className="p-4 space-y-4" dir="rtl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    if (editId !== "new" && !invoiceDetail) {
      return (
        <div className="p-4 text-center" dir="rtl">
          <p className="text-muted-foreground">لم يتم العثور على الفاتورة</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/sales-invoices")} data-testid="button-back-not-found">
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full" dir="rtl">
        <InvoiceHeaderBar
          isNew={isNew}
          isDraft={!!isDraft}
          invoiceNumber={invoiceDetail?.invoiceNumber?.toString()}
          status={invoiceDetail?.status}
          fefoLoading={fefoLoading}
          autoSaveStatus={autoSave.autoSaveStatus}
          warehouseId={form.warehouseId}
          setWarehouseId={form.setWarehouseId}
          invoiceDate={form.invoiceDate}
          setInvoiceDate={form.setInvoiceDate}
          customerType={form.customerType}
          setCustomerType={form.setCustomerType}
          customerName={form.customerName}
          setCustomerName={form.setCustomerName}
          contractCompany={form.contractCompany}
          setContractCompany={form.setContractCompany}
          barcodeInput={barcodeInput}
          setBarcodeInput={setBarcodeInput}
          barcodeLoading={barcodeLoading}
          barcodeInputRef={barcodeInputRef}
          warehouses={warehouses}
          finalizePending={mutations.finalizeMutation.isPending}
          onBack={() => navigate("/sales-invoices")}
          onFinalize={() => mutations.finalizeMutation.mutate()}
          onBarcodeScan={handleBarcodeScan}
          onOpenSearch={itemSearch.openSearchModal}
          onOpenServiceSearch={serviceSearch.openServiceModal}
        />

        <InvoiceLineTable
          lines={lines}
          isDraft={!!isDraft}
          fefoLoading={fefoLoading}
          pendingQtyRef={pendingQtyRef}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          onQtyConfirm={handleQtyConfirm}
          onOpenStats={stats.openStats}
          barcodeInputRef={barcodeInputRef}
        />

        <InvoiceTotals
          subtotal={subtotal}
          discountPct={form.discountPct}
          discountValue={form.discountValue}
          netTotal={netTotal}
          isDraft={!!isDraft}
          onDiscountPctChange={(v) => form.handleDiscountPctChange(v, subtotal)}
          onDiscountValueChange={(v) => form.handleDiscountValueChange(v, subtotal)}
        />

        <ItemSearchDialog
          open={itemSearch.searchModalOpen}
          onClose={itemSearch.closeSearchModal}
          searchMode={itemSearch.searchMode}
          setSearchMode={itemSearch.setSearchMode}
          searchQuery={itemSearch.searchQuery}
          onSearchQueryChange={itemSearch.onSearchQueryChange}
          searchResults={itemSearch.searchResults}
          searchLoading={itemSearch.searchLoading}
          searchInputRef={itemSearch.searchInputRef}
          onAddItem={addItemToLines}
        />

        <ServiceSearchDialog
          open={serviceSearch.serviceModalOpen}
          onClose={() => serviceSearch.setServiceModalOpen(false)}
          serviceSearch={serviceSearch.serviceSearch}
          onServiceSearchChange={serviceSearch.onServiceSearchChange}
          serviceResults={serviceSearch.serviceResults}
          serviceSearchLoading={serviceSearch.serviceSearchLoading}
          addingServiceId={serviceSearch.addingServiceId}
          serviceSearchRef={serviceSearch.serviceSearchRef}
          onAddService={serviceSearch.addServiceConsumables}
        />

        <StockStatsDialog
          open={!!stats.statsItemId}
          onClose={stats.closeStats}
          statsData={stats.statsData}
          statsLoading={stats.statsLoading}
        />
      </div>
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
      filterSearch={registry.filterSearch}
      listLoading={registry.listLoading}
      deletePending={mutations.deleteMutation.isPending}
      deleteVariables={mutations.deleteMutation.variables as string | undefined}
      confirmDeleteId={confirmDeleteId}
      warehouses={warehouses}
      seedLoading={seedLoading}
      quickTestLoading={quickTestLoading}
      onSetPage={registry.setPage}
      onSetFilterDateFrom={registry.setFilterDateFrom}
      onSetFilterDateTo={registry.setFilterDateTo}
      onSetFilterStatus={registry.setFilterStatus}
      onSetFilterCustomerType={registry.setFilterCustomerType}
      onSetFilterSearch={registry.setFilterSearch}
      onNewInvoice={() => navigate("/sales-invoices?id=new")}
      onOpenInvoice={(id) => navigate(`/sales-invoices?id=${id}`)}
      onDeleteClick={(id) => setConfirmDeleteId(id)}
      onConfirmDelete={() => {
        if (confirmDeleteId) {
          mutations.deleteMutation.mutate(confirmDeleteId, { onSettled: () => setConfirmDeleteId(null) });
        }
      }}
      onCancelDelete={() => setConfirmDeleteId(null)}
      onSeedDemo={handleSeedDemo}
      onQuickTest={handleQuickTest}
    />
  );
}
