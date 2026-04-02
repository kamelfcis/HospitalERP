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
 *
 * لا يوجد حفظ تلقائي (auto-save) ولا مسودات — الحفظ مباشر عند الاعتماد فقط.
 */
import { useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PERMISSIONS } from "@shared/permissions";
import type { Warehouse, SalesInvoiceWithDetails } from "@shared/schema";

import { useInvoiceForm }      from "./hooks/useInvoiceForm";
import { useInvoiceLines }     from "./hooks/useInvoiceLines";
import { useInvoiceMutations } from "./hooks/useInvoiceMutations";
import { useItemSearch }       from "./hooks/useItemSearch";
import { useServiceSearch }    from "./hooks/useServiceSearch";
import { useStatsDialog }      from "./hooks/useStatsDialog";
import { useRegistry }         from "./hooks/useRegistry";
import { useLoadInvoice }      from "./hooks/useLoadInvoice";
import { useBarcodeScanner }   from "./hooks/useBarcodeScanner";
import { useRoleRouter }       from "./hooks/useRoleRouter";

import { SalesInvoiceEditor } from "./SalesInvoiceEditor";
import { InvoiceRegistry }    from "./components/InvoiceRegistry";
import { useReceiptPrint }    from "@/hooks/use-receipt-print";

import { useState } from "react";

export default function SalesInvoices() {
  const { toast }           = useToast();
  const { reprintInvoice }  = useReceiptPrint();
  const [, navigate]        = useLocation();
  const searchString        = useSearch();
  const params              = new URLSearchParams(searchString);
  const editId              = params.get("id");
  const today               = new Date().toISOString().split("T")[0];
  const isNew               = editId === "new";

  // ── توجيه حسب الدور (الصيدلي → فاتورة جديدة مباشرة) ──────────────────────
  const { canViewRegistry, permissionsReady } = useRoleRouter(editId, navigate);

  // ── بيانات المستخدم ────────────────────────────────────────────────────────
  const { user, allowedWarehouseIds, hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.SALES_CREATE);

  // ── بيانات عامة ───────────────────────────────────────────────────────────
  const { data: allWarehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"], staleTime: 5 * 60_000 });

  // فلترة المستودعات: عرض المسموح بها فقط (فارغة = كل المستودعات لـ admin/owner)
  const warehouses = useMemo(() => {
    if (!allWarehouses) return undefined;
    if (allowedWarehouseIds.length === 0) return allWarehouses;
    return allWarehouses.filter(w => allowedWarehouseIds.includes(w.id));
  }, [allWarehouses, allowedWarehouseIds]);

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

  const linesHook = useInvoiceLines(form.warehouseId, form.invoiceDate);
  const { lines, setLines } = linesHook;

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines]);
  const netTotal = useMemo(() => +(subtotal - form.discountValue).toFixed(2), [subtotal, form.discountValue]);

  // ── قواعد التغطية للتقدير المرئي (يُحمَّل فقط عند اختيار عقد) ──────────
  const isContractDraft = form.customerType === "contract" && !!form.contractId && isDraft;
  const { data: contractRulesRaw } = useQuery<any[]>({
    queryKey: ["/api/contracts", form.contractId, "rules"],
    enabled: isContractDraft,
    staleTime: 60_000,
  });

  // تقدير حصتي الشركة والمريض قبل الاعتماد (يُستخدم للعرض فقط)
  const { estimatedCompanyTotal, estimatedPatientTotal } = useMemo(() => {
    if (!isContractDraft || !contractRulesRaw) {
      return { estimatedCompanyTotal: null, estimatedPatientTotal: null };
    }
    const rules = contractRulesRaw as any[];
    const covPct = form.companyCoveragePct / 100;
    let cSum = 0;
    let pSum = 0;
    for (const line of lines) {
      const lt       = line.lineTotal;
      const cat      = line.item?.category ?? null;
      const itemId   = line.itemId;
      const sorted   = [...rules].filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
      // Pass 1: الاستثناء
      const excluded = sorted.some(r =>
        (r.ruleType === "exclude_item_category" && r.itemCategory && r.itemCategory === cat) ||
        (r.ruleType === "exclude_item"          && r.itemId      && r.itemId      === itemId)
      );
      if (excluded) { pSum += lt; continue; }
      // Pass 3: التسعير
      const priceRule = sorted.find(r =>
        (r.ruleType === "discount_pct" || r.ruleType === "global_discount") &&
        (!r.itemCategory || r.itemCategory === cat) &&
        (!r.itemId       || r.itemId       === itemId)
      );
      let contractPrice = lt;
      if (priceRule) {
        const discPct = parseFloat(priceRule.discountPct ?? "0");
        contractPrice = lt * (1 - discPct / 100);
      }
      const cShare = +(contractPrice * covPct).toFixed(2);
      const pShare = +(lt - cShare).toFixed(2);
      cSum += cShare;
      pSum += pShare;
    }
    return { estimatedCompanyTotal: +cSum.toFixed(2), estimatedPatientTotal: +pSum.toFixed(2) };
  }, [isContractDraft, contractRulesRaw, lines, form.companyCoveragePct]);

  // ── تحميل الفاتورة الموجودة ───────────────────────────────────────────────
  useLoadInvoice({
    invoiceDetail, isNew, warehouses,
    defaultWarehouseId: user?.defaultWarehouseId,
    form, setLines,
  });

  // ── hooks الميزات ────────────────────────────────────────────────────────
  const registry       = useRegistry(today, !editId);
  const statsHook      = useStatsDialog();
  const itemSearchHook = useItemSearch(form.warehouseId);
  const serviceSearchHook = useServiceSearch(
    form.warehouseId, form.invoiceDate, linesHook.addItemToLines,
  );

  const clinicOrderId = params.get("clinicOrderId");
  const clinicOrderIdsParam = params.get("clinicOrderIds");
  const allClinicIds = clinicOrderIdsParam
    ? clinicOrderIdsParam.split(",").filter(Boolean)
    : clinicOrderId ? [clinicOrderId] : [];

  const [savedClinicOrderIds, setSavedClinicOrderIds] = useState<string[]>([]);
  useEffect(() => {
    if (allClinicIds.length > 0 && savedClinicOrderIds.length === 0) setSavedClinicOrderIds(allClinicIds);
  }, [allClinicIds.join(",")]);

  const mutationsHook = useInvoiceMutations({
    editId, isNew,
    warehouseId:        form.warehouseId,
    invoiceDate:        form.invoiceDate,
    customerType:       form.customerType,
    customerName:       form.customerName,
    customerId:         form.customerId,
    contractCompany:    form.contractCompany,
    contractId:         form.contractId,
    contractMemberId:   form.contractMemberId,
    companyId:          form.companyId,
    companyCoveragePct: form.companyCoveragePct,
    discountPct:        form.discountPct,
    discountValue:      form.discountValue,
    subtotal, netTotal,
    notes:              form.notes,
    clinicOrderId:      savedClinicOrderIds[0] || null,
    clinicOrderIds:     savedClinicOrderIds,
    lines,
    onSaveSuccess:      () => {},
    onFinalizeSuccess:  () => { setSavedClinicOrderIds([]); },
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

  // ── prefill صيدلانى من أمر عيادة (?clinicOrderId / ?clinicOrderIds) ──────
  const pharmacyIdParam = params.get("pharmacyId");
  const altItemIdParam = params.get("altItemId");
  const clinicPrefillDoneRef = useRef(false);
  const hasClinicParam = allClinicIds.length > 0;

  useEffect(() => {
    if (!hasClinicParam) return;
    if (!editId) {
      const newParams = new URLSearchParams();
      newParams.set("id", "new");
      if (allClinicIds.length > 1) {
        newParams.set("clinicOrderIds", allClinicIds.join(","));
      } else {
        newParams.set("clinicOrderId", allClinicIds[0]);
      }
      if (pharmacyIdParam) newParams.set("pharmacyId", pharmacyIdParam);
      if (altItemIdParam) newParams.set("altItemId", altItemIdParam);
      navigate(`/sales-invoices?${newParams.toString()}`);
      return;
    }
    if (editId !== "new" || clinicPrefillDoneRef.current) return;
  }, [hasClinicParam, editId, navigate, pharmacyIdParam, altItemIdParam]);

  const pendingClinicItemsRef = useRef<Array<{ itemData: any; qty: number; unitLevel: string }>>([]);

  useEffect(() => {
    if (!hasClinicParam || editId !== "new" || clinicPrefillDoneRef.current) return;
    const doFetch = async () => {
      try {
        const allOrders: any[] = [];
        for (const oid of allClinicIds) {
          const res = await fetch(`/api/clinic-orders/${oid}`);
          if (res.ok) allOrders.push(await res.json());
        }
        if (allOrders.length === 0) return;

        const firstOrder = allOrders[0];
        const wId = pharmacyIdParam || firstOrder.targetId || "";
        if (wId) form.setWarehouseId(wId);
        if (firstOrder.patientName || firstOrder.apptPatientName) {
          form.setCustomerName(firstOrder.apptPatientName || firstOrder.patientName);
        }

        const itemsToAdd: Array<{ itemData: any; qty: number; unitLevel: string }> = [];
        for (const order of allOrders) {
          const itemIdToAdd = (allOrders.length === 1 && altItemIdParam) ? altItemIdParam : order.itemId;
          if (!itemIdToAdd) continue;
          let itemData: any = null;
          try {
            const itemRes = await fetch(`/api/items/${itemIdToAdd}`);
            if (itemRes.ok) {
              const fullItem = await itemRes.json();
              itemData = {
                id: fullItem.id,
                nameAr: fullItem.nameAr || fullItem.name_ar || order.drugName || "",
                nameEn: fullItem.nameEn || fullItem.name_en || null,
                itemCode: fullItem.itemCode || fullItem.item_code || "",
                category: fullItem.category || "drug",
                salePriceCurrent: String(fullItem.salePriceCurrent || fullItem.sale_price_current || "0"),
                majorUnitName: fullItem.majorUnitName || fullItem.major_unit_name || null,
                mediumUnitName: fullItem.mediumUnitName || fullItem.medium_unit_name || null,
                minorUnitName: fullItem.minorUnitName || fullItem.minor_unit_name || null,
                majorToMedium: fullItem.majorToMedium || fullItem.major_to_medium || null,
                majorToMinor: fullItem.majorToMinor || fullItem.major_to_minor || null,
                mediumToMinor: fullItem.mediumToMinor || fullItem.medium_to_minor || null,
                hasExpiry: fullItem.hasExpiry ?? fullItem.has_expiry ?? false,
                availableQtyMinor: "0",
              };
            }
          } catch {}
          if (!itemData) {
            itemData = {
              id: itemIdToAdd,
              nameAr: order.drugName || order.itemNameAr || "",
              nameEn: null, itemCode: "", category: "drug",
              salePriceCurrent: order.salePriceCurrent || "0",
              majorUnitName: order.majorUnitName || null,
              mediumUnitName: order.mediumUnitName || null,
              minorUnitName: order.minorUnitName || null,
              majorToMedium: order.majorToMedium || null,
              majorToMinor: order.majorToMinor || null,
              mediumToMinor: order.mediumToMinor || null,
              hasExpiry: order.hasExpiry || false,
              availableQtyMinor: "0",
            };
          }
          itemsToAdd.push({ itemData, qty: parseFloat(order.quantity) || 1, unitLevel: order.unitLevel || "major" });
        }
        pendingClinicItemsRef.current = itemsToAdd;
        clinicPrefillDoneRef.current = true;
        navigate("/sales-invoices?id=new");
      } catch (_) {}
    };
    const timer = setTimeout(doFetch, 400);
    return () => clearTimeout(timer);
  }, [hasClinicParam, editId, pharmacyIdParam, altItemIdParam]);

  useEffect(() => {
    if (pendingClinicItemsRef.current.length === 0 || !form.warehouseId) return;
    const items = pendingClinicItemsRef.current;
    pendingClinicItemsRef.current = [];
    (async () => {
      for (const { itemData, qty, unitLevel } of items) {
        await linesHook.addItemToLines(itemData, { qty, unitLevel });
      }
    })();
  }, [form.warehouseId]);

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
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
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
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
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
        totalTaxAmount={parseFloat(String(invoiceDetail?.totalTaxAmount || "0")) || 0}
        barcodeDisplay={barcode.barcodeDisplay}
        setBarcodeDisplay={barcode.setBarcodeDisplay}
        barcodeLoading={barcode.barcodeLoading}
        barcodeInputRef={barcodeInputRef}
        onBarcodeScan={barcode.handleBarcodeInputSubmit}
        linesHook={linesHook}
        mutationsHook={mutationsHook}
        itemSearchHook={itemSearchHook}
        serviceSearchHook={serviceSearchHook}
        statsHook={statsHook}
        onBack={() => navigate("/sales-invoices")}
        maxDiscountPct={user?.maxDiscountPct   ? parseFloat(user.maxDiscountPct)   : null}
        maxDiscountValue={user?.maxDiscountValue ? parseFloat(user.maxDiscountValue) : null}
        estimatedCompanyTotal={estimatedCompanyTotal}
        estimatedPatientTotal={estimatedPatientTotal}
      />
    );
  }

  // انتظار جلب الصلاحيات الطازة من السيرفر قبل أي قرار
  if (!permissionsReady && !editId) return null;
  // من لا يملك صلاحية القائمة → ينتظر التوجيه للفاتورة الجديدة
  if (permissionsReady && !canViewRegistry && !editId) return null;

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
      filterWarehouseId={registry.filterWarehouseId}
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
      onSetFilterWarehouseId={registry.setFilterWarehouseId}
      onSetFilterSearch={registry.setFilterSearch}
      canCreate={canCreate}
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
      onReprintReceipt={(id) => reprintInvoice(id)}
    />
  );
}
