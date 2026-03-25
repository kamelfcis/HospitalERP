/**
 * SupplierReceiving — نقطة دخول صفحة استلام الموردين
 *
 * Orchestrator نظيف: يجمع الـ hooks ويوزعها على المكوّنات.
 * لا يحتوي على منطق تشغيلي — كل منطق في hooks مستقلة.
 *
 * التدفق:
 *   tab="log"  → ReceivingRegistry (السجل)
 *   tab="form" → ReceivingEditor   (النموذج)
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth }  from "@/hooks/use-auth";
import type { Warehouse, Supplier } from "@shared/schema";

import { useReceivingForm }      from "./hooks/useReceivingForm";
import { useReceivingLines }     from "./hooks/useReceivingLines";
import { useAutoSave }           from "./hooks/useAutoSave";
import { useSupplierSearch }     from "./hooks/useSupplierSearch";
import { useReceivingMutations } from "./hooks/useReceivingMutations";
import { useLoadReceiving }      from "./hooks/useLoadReceiving";
import { useStockStats }         from "./hooks/useStockStats";
import { useBarcodeScanner }     from "./hooks/useBarcodeScanner";

import { ReceivingRegistry } from "./components/ReceivingRegistry";
import { ReceivingEditor }   from "./components/ReceivingEditor";

export default function SupplierReceiving() {
  const { toast }    = useToast();
  const { user }     = useAuth();
  const [, navigate] = useLocation();

  const [activeTab,         setActiveTab]         = useState("log");
  const [confirmPostOpen,   setConfirmPostOpen]   = useState(false);
  const [itemSearchOpen,    setItemSearchOpen]    = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);

  // ── Hooks الحالة ─────────────────────────────────────────────────────────
  const form          = useReceivingForm();
  const lines         = useReceivingLines();
  const supplierSearch = useSupplierSearch(form.setSupplierId);
  const stats          = useStockStats();

  const autoSave = useAutoSave({
    formStatus:         form.formStatus,
    supplierId:         form.supplierId,
    warehouseId:        form.warehouseId,
    supplierInvoiceNo:  form.supplierInvoiceNo,
    receiveDate:        form.receiveDate,
    formNotes:          form.formNotes,
    formLines:          lines.formLines,
    editingReceivingId: form.editingReceivingId,
    onIdAssigned: (id, num) => {
      form.setEditingReceivingId(id);
      if (num !== null) form.setFormReceivingNumber(num);
    },
  });

  // ── تحميل إذن للتعديل ────────────────────────────────────────────────────
  const { loadReceivingForEditing } = useLoadReceiving({
    form, lines, supplierSearch,
    resetAutoSave: autoSave.resetAutoSave,
    setActiveTab,
  });

  // ── تهيئة المخزن الافتراضي للشراء عند فتح نموذج جديد ───────────────────
  useEffect(() => {
    const defaultPurchaseWhId = user?.defaultPurchaseWarehouseId;
    if (!form.editingReceivingId && !form.warehouseId && defaultPurchaseWhId) {
      form.setWarehouseId(defaultPurchaseWhId);
    }
  }, [user?.defaultPurchaseWarehouseId]);

  // ── فحص ازدواجية فاتورة المورد ──────────────────────────────────────────
  const invoiceCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (invoiceCheckRef.current) clearTimeout(invoiceCheckRef.current);
    invoiceCheckRef.current = setTimeout(async () => {
      const { supplierId, supplierInvoiceNo, editingReceivingId } = form;
      if (!supplierId || !supplierInvoiceNo.trim()) {
        form.setInvoiceDuplicateError("");
        return;
      }
      const params = new URLSearchParams({ supplierId, supplierInvoiceNo });
      if (editingReceivingId) params.set("excludeId", editingReceivingId);
      try {
        const res  = await fetch(`/api/receivings/check-invoice?${params}`);
        const data = res.ok ? await res.json() : null;
        form.setInvoiceDuplicateError(data?.isUnique ? "" : "رقم الفاتورة مكرر لنفس المورد");
      } catch { form.setInvoiceDuplicateError(""); }
    }, 500);
    return () => { if (invoiceCheckRef.current) clearTimeout(invoiceCheckRef.current); };
  }, [form.supplierId, form.supplierInvoiceNo]);

  // ── إضافة صنف (تأكد من وجود كود + ركّز على آخر سطر) ────────────────────
  const addItemToLines = async (item: any) => {
    if (!item?.itemCode) {
      toast({ title: "هذا الصنف ليس له كود — لا يمكن إضافته", variant: "destructive" });
      return;
    }
    const newLine = await lines.addItemLine(item, form.supplierId, form.warehouseId);
    if (newLine) {
      setTimeout(() => {
        const keys   = Array.from(lines.qtyInputRefs.current.keys());
        const lastIdx = keys.length > 0 ? Math.max(...keys) : -1;
        if (lastIdx >= 0) lines.qtyInputRefs.current.get(lastIdx)?.focus();
      }, 80);
    }
  };

  // ── باركود ───────────────────────────────────────────────────────────────
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const pendingQtyRef   = useRef<Map<string, string>>(new Map());
  const canAddItems     = form.formStatus === "draft"
    && !itemSearchOpen
    && !!form.warehouseId
    && !!form.supplierId
    && !!form.supplierInvoiceNo.trim();

  const { barcodeDisplay, setBarcodeDisplay, barcodeLoading, handleBarcodeInputSubmit } =
    useBarcodeScanner({
      warehouseId:    form.warehouseId,
      isDraft:        canAddItems,
      addItemToLines,
      pendingQtyRef,
      barcodeInputRef,
    });

  // ── Reset + Mutations ─────────────────────────────────────────────────────
  const handleNew = () => {
    form.resetForm(lines.resetLines, autoSave.resetAutoSave, supplierSearch.resetSupplier);
    if (user?.defaultPurchaseWarehouseId) {
      form.setWarehouseId(user.defaultPurchaseWarehouseId);
    }
  };

  const mutations = useReceivingMutations({
    supplierId:         form.supplierId,
    supplierInvoiceNo:  form.supplierInvoiceNo,
    warehouseId:        form.warehouseId,
    receiveDate:        form.receiveDate,
    formNotes:          form.formNotes,
    editingReceivingId: form.editingReceivingId,
    lines,
    onSaveDraftSuccess: (id, num) => {
      if (id && !form.editingReceivingId) form.setEditingReceivingId(id);
      if (num !== null) form.setFormReceivingNumber(num);
    },
    onPostSuccess:    () => handleNew(),
    onCorrectSuccess: (newId) => loadReceivingForEditing(newId),
    onConvertSuccess: (invoiceId) => navigate(`/purchase-invoices?id=${invoiceId}`),
    onDismissConfirm: () => setConfirmPostOpen(false),
    resetAutoSave:    autoSave.resetAutoSave,
  });

  // ── بيانات مرجعية ────────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: suppliersData }   = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", "all"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers?page=1&pageSize=500");
      if (!res.ok) throw new Error("فشل جلب الموردين");
      return res.json();
    },
  });

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">استلام الموردين</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">إدارة أذونات الاستلام من الموردين</span>
          <TabsList className="no-print mr-auto">
            <TabsTrigger value="form" data-testid="tab-form">إذن استلام</TabsTrigger>
            <TabsTrigger value="log"  data-testid="tab-log">السجل</TabsTrigger>
          </TabsList>
          <Button size="sm" variant="outline" className="no-print"
            onClick={() => { handleNew(); setActiveTab("form"); }}
            data-testid="button-new-receiving">
            <Plus className="h-3 w-3 ml-1" /> جديد
          </Button>
        </div>

        {/* ── السجل ───────────────────────────────────────────────────────── */}
        <TabsContent value="log" className="space-y-2">
          <ReceivingRegistry
            suppliers={suppliersData?.suppliers || []}
            warehouses={warehouses}
            onOpen={loadReceivingForEditing}
            onDelete={(id) => mutations.deleteDraftMutation.mutate(id)}
            onConvert={(id) => mutations.convertToInvoiceMutation.mutate(id)}
            onCorrect={(id) => mutations.correctReceivingMutation.mutate(id)}
            deletePending={mutations.deleteDraftMutation.isPending}
            correctPending={mutations.correctReceivingMutation.isPending}
            convertPending={mutations.convertToInvoiceMutation.isPending}
          />
        </TabsContent>

        {/* ── النموذج ─────────────────────────────────────────────────────── */}
        <TabsContent value="form" className="space-y-2">
          <ReceivingEditor
            form={form}
            lines={lines}
            supplierSearch={supplierSearch}
            autoSaveStatus={autoSave.autoSaveStatus}
            grandTotal={lines.grandTotal}
            isPending={mutations.isPending}
            confirmPostOpen={confirmPostOpen}
            setConfirmPostOpen={setConfirmPostOpen}
            itemSearchOpen={itemSearchOpen}
            setItemSearchOpen={setItemSearchOpen}
            statsItemId={stats.statsItemId}
            statsData={stats.statsData}
            statsLoading={stats.statsLoading}
            setStatsItemId={stats.setStatsItemId}
            openStats={stats.openStats}
            quickSupplierOpen={quickSupplierOpen}
            setQuickSupplierOpen={setQuickSupplierOpen}
            onSaveDraft={() => mutations.saveDraftMutation.mutate()}
            onPost={() => mutations.postReceivingMutation.mutate()}
            onNew={handleNew}
            onConvertForm={() => {
              if (form.editingReceivingId) mutations.convertToInvoiceMutation.mutate(form.editingReceivingId);
            }}
            onCorrectForm={() => {
              if (form.editingReceivingId) mutations.correctReceivingMutation.mutate(form.editingReceivingId);
            }}
            barcodeDisplay={barcodeDisplay}
            setBarcodeDisplay={setBarcodeDisplay}
            barcodeLoading={barcodeLoading}
            barcodeInputRef={barcodeInputRef}
            onBarcodeSubmit={handleBarcodeInputSubmit}
            warehouses={warehouses}
            canSaveDraft={form.canSaveDraft(lines.formLines)}
            onItemSelected={addItemToLines}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
