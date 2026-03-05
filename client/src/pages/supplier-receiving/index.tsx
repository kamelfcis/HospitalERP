/**
 * SupplierReceiving — نقطة دخول صفحة استلام الموردين
 *
 * الـ orchestrator: يجمع كل الـ hooks ويوزعها على المكوّنات.
 * لا يحتوي على أي UI مباشر — فقط تنسيق وتوجيه.
 *
 * التدفق:
 *   tab="log"  → ReceivingRegistry (السجل)
 *   tab="form" → ReceivingEditor   (النموذج)
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Warehouse, Supplier, ReceivingHeaderWithDetails } from "@shared/schema";

import { useReceivingForm }      from "./hooks/useReceivingForm";
import { useReceivingLines }     from "./hooks/useReceivingLines";
import { useAutoSave }           from "./hooks/useAutoSave";
import { useSupplierSearch }     from "./hooks/useSupplierSearch";
import { useReceivingMutations } from "./hooks/useReceivingMutations";

import { ReceivingRegistry } from "./components/ReceivingRegistry";
import { ReceivingEditor }   from "./components/ReceivingEditor";
import { useBarcodeScanner } from "../sales-invoices/hooks/useBarcodeScanner";

import { calculateQtyInMinor, getDefaultUnitLevel } from "./types";
import type { ReceivingLineLocal } from "./types";

export default function SupplierReceiving() {
  const { toast }    = useToast();
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState<string>("log");

  // ── نوافذ الحوار ────────────────────────────────────────────────────────
  const [confirmPostOpen, setConfirmPostOpen]       = useState(false);
  const [itemSearchOpen, setItemSearchOpen]         = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen]   = useState(false);
  const [statsItemId, setStatsItemId]               = useState<string | null>(null);
  const [statsData, setStatsData]                   = useState<any[]>([]);
  const [statsLoading, setStatsLoading]             = useState(false);

  const openStats = async (itemId: string) => {
    setStatsItemId(itemId);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) setStatsData(await res.json());
    } catch {}
    setStatsLoading(false);
  };

  // ── hooks الحالة ────────────────────────────────────────────────────────
  const form    = useReceivingForm();
  const lines   = useReceivingLines();

  const supplierSearch = useSupplierSearch(form.setSupplierId);

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
        const res = await fetch(`/api/receivings/check-invoice?${params}`);
        if (res.ok) {
          const data = await res.json();
          form.setInvoiceDuplicateError(data.isUnique ? "" : "رقم الفاتورة مكرر لنفس المورد");
        }
      } catch { form.setInvoiceDuplicateError(""); }
    }, 500);
    return () => { if (invoiceCheckRef.current) clearTimeout(invoiceCheckRef.current); };
  }, [form.supplierId, form.supplierInvoiceNo]);

  // ── إضافة صنف للسطور ────────────────────────────────────────────────────
  const addItemToLines = useCallback(async (item: any) => {
    const newLine = await lines.addItemLine(item, form.supplierId, form.warehouseId);
    if (newLine) {
      // تركيز على حقل الكمية للسطر الجديد
      setTimeout(() => {
        const keys = Array.from(lines.qtyInputRefs.current.keys());
        const lastIdx = keys.length > 0 ? Math.max(...keys) : -1;
        if (lastIdx >= 0) lines.qtyInputRefs.current.get(lastIdx)?.focus();
      }, 80);
    }
  }, [form.supplierId, form.warehouseId, lines]);

  // ── باركود ──────────────────────────────────────────────────────────────
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const pendingQtyRef   = useRef<Map<string, string>>(new Map());

  const { barcodeDisplay, setBarcodeDisplay, barcodeLoading, handleBarcodeInputSubmit } =
    useBarcodeScanner({
      warehouseId:    form.warehouseId,
      isDraft:        form.formStatus === "draft"
        && !itemSearchOpen
        && !!form.warehouseId
        && !!form.supplierId
        && !!form.supplierInvoiceNo.trim(),
      addItemToLines,
      pendingQtyRef,
      barcodeInputRef,
    });

  // ── تحميل إذن للتعديل ───────────────────────────────────────────────────
  const loadReceivingForEditing = useCallback(async (receivingId: string) => {
    try {
      const res = await fetch(`/api/receivings/${receivingId}`);
      if (!res.ok) throw new Error("فشل تحميل إذن الاستلام");
      const receiving: ReceivingHeaderWithDetails = await res.json();

      form.setEditingReceivingId(receiving.id);
      form.setReceiveDate(receiving.receiveDate);
      form.setSupplierId(receiving.supplierId);
      form.setWarehouseId(receiving.warehouseId);
      form.setSupplierInvoiceNo(receiving.supplierInvoiceNo);
      form.setFormNotes(receiving.notes || "");
      form.setFormStatus(receiving.status);
      form.setFormReceivingNumber(receiving.receivingNumber);
      form.setFormCorrectionStatus((receiving as any).correctionStatus || null);
      form.setFormCorrectionOfId((receiving as any).correctionOfId || null);
      form.setFormConvertedToInvoiceId((receiving as any).convertedToInvoiceId || null);

      if (receiving.supplier) {
        supplierSearch.setSelectedSupplier(receiving.supplier);
        supplierSearch.setSupplierSearchText(`${receiving.supplier.code} - ${receiving.supplier.nameAr}`);
      }

      // بناء السطور
      const loadedLines: ReceivingLineLocal[] = (receiving.lines || []).map((line: any) => ({
        id:                    crypto.randomUUID(),
        itemId:                line.itemId,
        item:                  line.item || null,
        unitLevel:             line.unitLevel,
        qtyEntered:            parseFloat(line.qtyEntered as string),
        qtyInMinor:            parseFloat(line.qtyInMinor as string),
        purchasePrice:         parseFloat(line.purchasePrice as string) || 0,
        lineTotal:             parseFloat(line.lineTotal as string) || 0,
        batchNumber:           line.batchNumber || "",
        expiryMonth:           line.expiryMonth ?? null,
        expiryYear:            line.expiryYear ?? null,
        salePrice:             line.salePrice ? parseFloat(line.salePrice as string) : null,
        lastPurchasePriceHint: line.purchasePrice ? parseFloat(line.purchasePrice as string) : null,
        lastSalePriceHint:     line.salePriceHint ? parseFloat(line.salePriceHint as string) : null,
        bonusQty:              parseFloat(line.bonusQty as string) || 0,
        bonusQtyInMinor:       parseFloat(line.bonusQtyInMinor as string) || 0,
        onHandInWarehouse:     "0",
        notes:                 line.notes || "",
        isRejected:            line.isRejected || false,
        rejectionReason:       line.rejectionReason || "",
      }));

      // جلب hints وتصحيح الوحدات بشكل متوازٍ
      const hintsResults = await Promise.allSettled(
        loadedLines.map((ln) =>
          fetch(`/api/items/${ln.itemId}/hints?supplierId=${receiving.supplierId}&warehouseId=${receiving.warehouseId}`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null),
        ),
      );

      let fixedCount = 0;
      hintsResults.forEach((result, i) => {
        const hints = result.status === "fulfilled" ? result.value : null;
        if (hints) {
          loadedLines[i] = {
            ...loadedLines[i],
            onHandInWarehouse:     hints.onHandMinor || "0",
            lastPurchasePriceHint: loadedLines[i].lastPurchasePriceHint || (hints.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : null),
            lastSalePriceHint:     loadedLines[i].lastSalePriceHint     || (hints.lastSalePrice     ? parseFloat(hints.lastSalePrice)     : null),
          };
        }
        // تصحيح الوحدة للمسودات
        if (receiving.status === "draft") {
          const item = loadedLines[i].item;
          if (item) {
            const expectedUnit = getDefaultUnitLevel(item);
            if (!loadedLines[i].unitLevel || (item.majorUnitName && loadedLines[i].unitLevel !== "major")) {
              loadedLines[i] = {
                ...loadedLines[i],
                unitLevel: expectedUnit,
                qtyInMinor: calculateQtyInMinor(loadedLines[i].qtyEntered, expectedUnit, item),
              };
              fixedCount++;
            }
          }
        }
      });

      if (fixedCount > 0) {
        toast({ title: "تم ضبط وحدة الشراء للوحدة الكبرى", description: `تم تصحيح ${fixedCount} سطر` });
      }

      lines.setFormLines(loadedLines);
      autoSave.resetAutoSave();
      setActiveTab("form");
    } catch (err: any) {
      toast({ title: "خطأ في تحميل إذن الاستلام", description: err.message, variant: "destructive" });
    }
  }, [form, lines, supplierSearch, autoSave, toast]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    form.resetForm(lines.resetLines, autoSave.resetAutoSave, supplierSearch.resetSupplier);
    autoSave.resetAutoSave();
  }, [form, lines, autoSave, supplierSearch]);

  // ── Mutations ─────────────────────────────────────────────────────────
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
    onPostSuccess: () => { handleNew(); },
    onCorrectSuccess: (newId) => { loadReceivingForEditing(newId); },
    onConvertSuccess: (invoiceId) => { navigate(`/purchase-invoices?id=${invoiceId}`); },
    onDismissConfirm: () => setConfirmPostOpen(false),
    resetAutoSave: autoSave.resetAutoSave,
  });

  // ── بيانات عامة ─────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });
  const { data: suppliersData }   = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", "all"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers?page=1&pageSize=500");
      if (!res.ok) throw new Error("فشل جلب الموردين");
      return res.json();
    },
  });
  const allSuppliers = suppliersData?.suppliers || [];

  // ── canSaveDraft ─────────────────────────────────────────────────────
  const canSaveDraft = form.canSaveDraft(lines.formLines);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* ── Toolbar ── */}
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

        {/* ── السجل ── */}
        <TabsContent value="log" className="space-y-2">
          <ReceivingRegistry
            suppliers={allSuppliers}
            warehouses={warehouses}
            onOpen={(id) => loadReceivingForEditing(id)}
            onDelete={(id) => mutations.deleteDraftMutation.mutate(id)}
            onConvert={(id) => mutations.convertToInvoiceMutation.mutate(id)}
            onCorrect={(id) => mutations.correctReceivingMutation.mutate(id)}
            deletePending={mutations.deleteDraftMutation.isPending}
            correctPending={mutations.correctReceivingMutation.isPending}
            convertPending={mutations.convertToInvoiceMutation.isPending}
          />
        </TabsContent>

        {/* ── النموذج ── */}
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
            statsItemId={statsItemId}
            statsData={statsData}
            statsLoading={statsLoading}
            setStatsItemId={setStatsItemId}
            openStats={openStats}
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
            canSaveDraft={canSaveDraft}
            onItemSelected={addItemToLines}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
