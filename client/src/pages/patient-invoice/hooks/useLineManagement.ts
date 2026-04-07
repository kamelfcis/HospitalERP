import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { genId } from "../utils/id";
import type { LineLocal } from "../types";
import { resolveBusinessClassificationClient } from "@shared/resolve-business-classification";
import {
  type ItemUnitConfig,
  computeUnitPriceFromBase,
  calculateQtyInMinor,
  calculateQtyInSmallest,
  convertMinorToDisplayQty,
  convertSmallestToDisplayQty,
  itemHasMajorUnit,
  itemHasMediumUnit,
  getSmartDefaultUnitLevel,
} from "../utils/units";

// ── Domain types ───────────────────────────────────────────────────────────────
export interface FefoAllocation {
  allocatedQty: string;
  lotId?: string | null;
  expiryMonth?: number | string | null;
  expiryYear?: number | string | null;
  lotSalePrice?: string | null;
}

export interface ServiceSearchResult {
  id: string;
  nameAr?: string | null;
  name?: string | null;
  code?: string | null;
  basePrice?: string | null;
  requiresDoctor?: boolean | null;
  requiresNurse?: boolean | null;
  serviceType?: string | null;
  businessClassification?: string | null;
}

export interface ItemSearchResult extends ItemUnitConfig {
  id: string;
  nameAr?: string | null;
  itemCode?: string | null;
  hasExpiry?: boolean | null;
  allowOversell?: boolean | null;
  availableQtyMinor?: string | number | null;
  salePriceCurrent?: string | number | null;
  purchasePriceLast?: string | number | null;
  businessClassification?: string | null;
}

interface RawInvoiceLine {
  lineType: string;
  serviceId?: string | null;
  itemId?: string | null;
  description?: string | null;
  doctorName?: string | null;
  nurseName?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  discountPercent?: string | null;
  discountAmount?: string | null;
  totalPrice?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
  unitLevel?: string | null;
  itemData?: ItemSearchResult | null;
  priceSource?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  lotId?: string | null;
  expiryMonth?: number | string | null;
  expiryYear?: number | string | null;
  businessClassification?: string | null;
  service?: {
    requiresDoctor?: boolean | null;
    requiresNurse?: boolean | null;
    serviceType?: string | null;
    businessClassification?: string | null;
  } | null;
  line?: {
    lotId?: string | null;
    expiryMonth?: number | string | null;
    expiryYear?: number | string | null;
    priceSource?: string | null;
  } | null;
  requiresDoctor?: boolean | null;
  requiresNurse?: boolean | null;
}

// ── Recalc helpers (internal) ──────────────────────────────────────────────────
function recalcLine(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const totalPrice = Math.max(0, +(gross - line.discountAmount).toFixed(2));
  return { ...line, totalPrice };
}
function recalcLineFromPercent(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const discountAmount = +(gross * line.discountPercent / 100).toFixed(2);
  const totalPrice = Math.max(0, +(gross - discountAmount).toFixed(2));
  return { ...line, discountAmount, totalPrice };
}
function recalcLineFromAmount(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const discountPercent = gross > 0 ? +(line.discountAmount / gross * 100).toFixed(2) : 0;
  const totalPrice = Math.max(0, +(gross - line.discountAmount).toFixed(2));
  return { ...line, discountPercent, totalPrice };
}

interface UseLineManagementParams {
  warehouseId: string;
  invoiceDate: string;
  departmentId: string;
  setItemSearch: (v: string) => void;
  setItemResults: (v: ItemSearchResult[]) => void;
  addingItemRef: React.MutableRefObject<Set<string>>;
  itemSearchRef: React.RefObject<HTMLInputElement>;
  oversellEnabled?: boolean;
}

export function useLineManagement({
  warehouseId,
  invoiceDate,
  departmentId,
  setItemSearch,
  setItemResults,
  addingItemRef,
  itemSearchRef,
  oversellEnabled = false,
}: UseLineManagementParams) {
  const { toast } = useToast();

  const [lines, setLines]       = useState<LineLocal[]>([]);
  const [fefoLoading, setFefoLoading] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const linesRef                 = useRef(lines);
  const pendingQtyRef            = useRef<Map<string, string>>(new Map());

  useEffect(() => { linesRef.current = lines; }, [lines]);

  // ── Basic line ops ─────────────────────────────────────────────────────────
  const resetLines = useCallback(() => setLines([]), []);

  const loadLines = useCallback((raw: RawInvoiceLine[]): LineLocal[] => {
    const loaded: LineLocal[] = raw.map(l => ({
      tempId: genId(),
      lineType: l.lineType as LineLocal["lineType"],
      serviceId: l.serviceId ?? null,
      itemId: l.itemId ?? null,
      description: l.description || "",
      doctorName: l.doctorName || "",
      nurseName: l.nurseName || "",
      requiresDoctor: l.service?.requiresDoctor ?? l.requiresDoctor ?? false,
      requiresNurse: l.service?.requiresNurse ?? l.requiresNurse ?? false,
      quantity: parseFloat(l.quantity ?? "0") || 0,
      unitPrice: parseFloat(l.unitPrice || "0") || 0,
      discountPercent: parseFloat(l.discountPercent || "0") || 0,
      discountAmount: parseFloat(l.discountAmount || "0") || 0,
      totalPrice: parseFloat(l.totalPrice || "0") || 0,
      notes: l.notes || "",
      sortOrder: l.sortOrder || 0,
      serviceType: l.service?.serviceType || "",
      unitLevel: (l.unitLevel as LineLocal["unitLevel"] | null | undefined) || "minor",
      item: l.itemData || null,
      lotId: l.line?.lotId ?? l.lotId ?? null,
      expiryMonth: (l.line?.expiryMonth ?? l.expiryMonth) ? Number(l.line?.expiryMonth ?? l.expiryMonth) : null,
      expiryYear: (l.line?.expiryYear ?? l.expiryYear) ? Number(l.line?.expiryYear ?? l.expiryYear) : null,
      priceSource: l.line?.priceSource || l.priceSource || "",
      sourceType: l.sourceType ?? null,
      sourceId: l.sourceId ?? null,
      coverageStatus:     (l as any).coverageStatus     ?? null,
      approvalStatus:     (l as any).approvalStatus     ?? null,
      companyShareAmount: (l as any).companyShareAmount  ?? null,
      patientShareAmount: (l as any).patientShareAmount  ?? null,
      contractPrice:      (l as any).contractPrice       ?? null,
      listPrice:          (l as any).listPrice           ?? null,
      contractRuleId:     (l as any).contractRuleId      ?? null,
      businessClassification: l.businessClassification ?? (l as any).business_classification ?? null,
      templateId:           (l as any).templateId           ?? (l as any).template_id            ?? null,
      templateNameSnapshot: (l as any).templateNameSnapshot ?? (l as any).template_name_snapshot ?? null,
      appliedAt:            (l as any).appliedAt            ?? (l as any).applied_at              ?? null,
      appliedBy:            (l as any).appliedBy            ?? (l as any).applied_by              ?? null,
    }));
    setLines(loaded);
    return loaded;
  }, []);

  const updateLine = useCallback((tempId: string, field: string, value: unknown) => {
    setLines(prev =>
      prev.map(l => {
        if (l.tempId !== tempId) return l;
        const updated = { ...l, [field]: value };
        if (field === "quantity" || field === "unitPrice") return recalcLine(updated);
        if (field === "discountPercent") return recalcLineFromPercent(updated);
        if (field === "discountAmount") return recalcLineFromAmount(updated);
        return updated;
      })
    );
  }, []);

  const removeLine = useCallback((tempId: string) => {
    setLines(prev => prev.filter(l => l.tempId !== tempId));
  }, []);

  const filteredLines = useCallback(
    (type: string) => lines.filter(l => l.lineType === type),
    [lines]
  );

  // ── Add service line ───────────────────────────────────────────────────────
  const addServiceLine = useCallback((
    svc: ServiceSearchResult,
    opts?: { templateId?: string | null; templateNameSnapshot?: string | null; appliedAt?: string | null; defaultQty?: number; doctorName?: string; nurseName?: string; notes?: string }
  ) => {
    const businessClassification = resolveBusinessClassificationClient({
      lineType: "service",
      serviceBusinessClassification: svc.businessClassification ?? null,
      serviceType: svc.serviceType ?? null,
      serviceId: svc.id,
    });
    const qty       = opts?.defaultQty ?? 1;
    const unitPrice = parseFloat(svc.basePrice || "0") || 0;
    const newLine: LineLocal = {
      tempId: genId(),
      lineType: "service",
      serviceId: svc.id,
      itemId: null,
      description: svc.nameAr || svc.name || svc.code || "",
      quantity: qty,
      unitPrice,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: +(qty * unitPrice).toFixed(2),
      doctorName: opts?.doctorName || "",
      nurseName: opts?.nurseName || "",
      requiresDoctor: svc.requiresDoctor ?? false,
      requiresNurse: svc.requiresNurse ?? false,
      notes: opts?.notes || "",
      sortOrder: 0,
      serviceType: svc.serviceType || "SERVICE",
      unitLevel: "minor" as const,
      lotId: null,
      expiryMonth: null,
      expiryYear: null,
      priceSource: "service",
      sourceType: null,
      sourceId: null,
      coverageStatus:     null,
      approvalStatus:     null,
      companyShareAmount: null,
      patientShareAmount: null,
      contractPrice:      null,
      listPrice:          null,
      contractRuleId:     null,
      businessClassification,
      templateId:           opts?.templateId           ?? null,
      templateNameSnapshot: opts?.templateNameSnapshot ?? null,
      appliedAt:            opts?.appliedAt            ?? null,
      appliedBy:            null,
    };
    setLines(prev => [...prev, newLine]);
  }, []);

  // ── Add item line (with FEFO) ──────────────────────────────────────────────
  const addItemLine = useCallback(async (
    item: ItemSearchResult,
    lineType: "drug" | "consumable" | "equipment",
    opts?: { templateId?: string | null; templateNameSnapshot?: string | null; appliedAt?: string | null; defaultQty?: number; notes?: string }
  ) => {
    const defaultUnit = getSmartDefaultUnitLevel(item) as "major" | "medium" | "minor";
    const baseSalePrice = parseFloat(String(item.salePriceCurrent || item.purchasePriceLast || "0")) || 0;
    const unitPrice = computeUnitPriceFromBase(baseSalePrice, defaultUnit, item);
    const businessClassification = resolveBusinessClassificationClient({
      lineType,
      itemBusinessClassification: item.businessClassification ?? null,
      itemId: item.id,
    });
    const requestedQty = opts?.defaultQty ?? 1;

    if (item.hasExpiry && !warehouseId) {
      toast({
        title: "يجب اختيار المخزن",
        description: "اختر المخزن أولاً لتفعيل التوزيع التلقائي للصلاحية (FEFO)",
        variant: "destructive",
      });
      setItemSearch(""); setItemResults([]);
      return;
    }

    const tempLineId = genId();
    const placeholder: LineLocal = {
      tempId: tempLineId,
      lineType,
      serviceId: null,
      itemId: item.id,
      description: item.nameAr || item.itemCode || "",
      quantity: requestedQty,
      unitPrice,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: +(requestedQty * unitPrice).toFixed(2),
      doctorName: "",
      nurseName: "",
      requiresDoctor: false,
      requiresNurse: false,
      notes: opts?.notes || "",
      sortOrder: 0,
      serviceType: "",
      unitLevel: defaultUnit,
      item,
      lotId: null,
      expiryMonth: null,
      expiryYear: null,
      priceSource: "item",
      sourceType: null,
      sourceId: null,
      coverageStatus:     null,
      approvalStatus:     null,
      companyShareAmount: null,
      patientShareAmount: null,
      contractPrice:      null,
      listPrice:          null,
      contractRuleId:     null,
      businessClassification,
      templateId:           opts?.templateId           ?? null,
      templateNameSnapshot: opts?.templateNameSnapshot ?? null,
      appliedAt:            opts?.appliedAt            ?? null,
      appliedBy:            null,
    };
    setLines(prev => [...prev, placeholder]);
    setItemSearch(""); setItemResults([]);
    requestAnimationFrame(() => itemSearchRef.current?.focus());

    const asyncToken = genId();
    addingItemRef.current.add(asyncToken);

    try {
      let resolvedPrice = baseSalePrice;
      let priceSource   = "item";
      if (departmentId || warehouseId) {
        try {
          const params = new URLSearchParams({ itemId: item.id });
          if (departmentId) params.set("departmentId", departmentId);
          if (warehouseId)  params.set("warehouseId", warehouseId);
          const priceRes = await fetch(`/api/pricing?${params}`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const resolved  = parseFloat(priceData.price);
            if (resolved > 0) resolvedPrice = resolved;
            if (priceData.source) priceSource = priceData.source;
          }
        } catch {}
      }
      const isDeptPrice  = priceSource === "department";
      const finalUnitPrice = computeUnitPriceFromBase(resolvedPrice, defaultUnit, item);

      if (!addingItemRef.current.has(asyncToken)) return;

      if (item.hasExpiry && warehouseId) {
        setFefoLoading(true);
        try {
          const currentLines     = linesRef.current;
          const existingLines    = currentLines.filter(l => l.itemId === item.id && l.tempId !== tempLineId);
          const existingQtyMinor = existingLines.reduce((sum, l) => sum + calculateQtyInMinor(l.quantity || 1, l.unitLevel, l.item || item), 0);
          const additionalMinor  = calculateQtyInMinor(requestedQty, defaultUnit, item);
          const totalRequired    = existingQtyMinor + additionalMinor;

          const fefoParams = new URLSearchParams({
            itemId: item.id, warehouseId,
            requiredQtyInMinor: String(totalRequired), asOfDate: invoiceDate,
          });
          const res = await fetch(`/api/transfer/fefo-preview?${fefoParams}`);
          if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
          const preview = await res.json();

          if (!addingItemRef.current.has(asyncToken)) return;

          if (!preview.fulfilled) {
            if (item.allowOversell === true && oversellEnabled === true) {
              toast({
                title: "صرف بدون رصيد",
                description: `${item.nameAr || item.itemCode} — سيتم إضافة البند بدون دفعة (تكلفة مؤجلة)`,
                variant: "default",
              });
              setLines(prev => prev.map(l => l.tempId !== tempLineId ? l : {
                ...l,
                unitPrice: finalUnitPrice,
                totalPrice: +(l.quantity * finalUnitPrice).toFixed(2),
                priceSource,
              }));
              return;
            }
            setLines(prev => prev.filter(l => l.tempId !== tempLineId));
            toast({
              title: "الكمية غير متاحة",
              description: preview.shortfall ? `العجز: ${preview.shortfall}` : "الرصيد غير كافي",
              variant: "destructive",
            });
            return;
          }

          const origLine = linesRef.current.find(l => l.tempId === tempLineId);
          const newFefoLines: LineLocal[] = (preview.allocations as FefoAllocation[])
            .filter((a) => parseFloat(a.allocatedQty) > 0)
            .map((alloc) => {
              const allocMinor  = parseFloat(alloc.allocatedQty);
              const displayQty  = convertMinorToDisplayQty(allocMinor, defaultUnit, item);
              const lineBase    = isDeptPrice
                ? resolvedPrice
                : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice!) : resolvedPrice);
              const linePrice   = computeUnitPriceFromBase(lineBase, defaultUnit, item);
              const lineTotal   = +(displayQty * linePrice).toFixed(2);
              return {
                tempId: genId(), lineType, serviceId: null,
                itemId: item.id, description: item.nameAr || item.itemCode || "",
                quantity: displayQty, unitPrice: linePrice,
                discountPercent: 0, discountAmount: 0, totalPrice: lineTotal,
                doctorName: "", nurseName: "",
                requiresDoctor: false, requiresNurse: false,
                notes: "", sortOrder: 0, serviceType: "",
                unitLevel: defaultUnit, item,
                lotId: alloc.lotId || null,
                expiryMonth: alloc.expiryMonth || null,
                expiryYear: alloc.expiryYear || null,
                priceSource, sourceType: null, sourceId: null,
                coverageStatus: null, approvalStatus: null,
                companyShareAmount: null, patientShareAmount: null,
                contractPrice: null, listPrice: null, contractRuleId: null,
                businessClassification,
                templateId:           origLine?.templateId           ?? null,
                templateNameSnapshot: origLine?.templateNameSnapshot ?? null,
                appliedAt:            origLine?.appliedAt            ?? null,
                appliedBy:            origLine?.appliedBy            ?? null,
              } as LineLocal;
            });

          setLines(prev => [...prev.filter(l => l.itemId !== item.id), ...newFefoLines]);
          if (newFefoLines.length > 1) {
            toast({ title: `${item.nameAr}`, description: `تم التوزيع على ${newFefoLines.length} دفعات (FEFO)` });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          toast({ title: "خطأ في توزيع الصلاحية", description: msg, variant: "destructive" });
        } finally {
          setFefoLoading(false);
        }
      } else {
        if (finalUnitPrice !== unitPrice || priceSource !== "item") {
          setLines(prev => prev.map(l => l.tempId !== tempLineId ? l : {
            ...l, unitPrice: finalUnitPrice,
            totalPrice: +(l.quantity * finalUnitPrice).toFixed(2), priceSource,
          }));
        }
      }
    } finally {
      addingItemRef.current.delete(asyncToken);
    }
  }, [warehouseId, invoiceDate, departmentId, toast, setItemSearch, setItemResults, oversellEnabled]);

  // ── FEFO: unit level change ────────────────────────────────────────────────
  const handleUnitLevelChange = useCallback(async (tempId: string, newLevel: "major" | "medium" | "minor") => {
    const line = linesRef.current.find(l => l.tempId === tempId);
    if (!line || !line.itemId || !line.item) return;
    const oldLevel = line.unitLevel;
    if (oldLevel === newLevel) return;

    const baseSalePrice = parseFloat(String(line.item.salePriceCurrent || line.item.purchasePriceLast || "0")) || 0;
    let newUnitPrice = computeUnitPriceFromBase(baseSalePrice, newLevel, line.item);

    if (line.priceSource === "department" && departmentId) {
      try {
        const params = new URLSearchParams({ itemId: line.itemId });
        if (departmentId) params.set("departmentId", departmentId);
        if (warehouseId)  params.set("warehouseId", warehouseId);
        const priceRes = await fetch(`/api/pricing?${params}`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const resolved  = parseFloat(priceData.price);
          if (resolved > 0) newUnitPrice = computeUnitPriceFromBase(resolved, newLevel, line.item);
        }
      } catch {}
    }

    const isExpiry = !!(line.lotId || line.expiryMonth || line.expiryYear);
    if (isExpiry && warehouseId) {
      const otherLines  = linesRef.current.filter(l => l.itemId === line.itemId && l.tempId !== tempId);
      const otherMinor  = otherLines.reduce((sum, l) => sum + calculateQtyInMinor(l.quantity, l.unitLevel, l.item || line.item), 0);
      const thisMinor   = calculateQtyInMinor(1, newLevel, line.item);
      const totalMinor  = otherMinor + thisMinor;

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: line.itemId, warehouseId,
          requiredQtyInMinor: String(totalMinor), asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams}`);
        if (!res.ok) throw new Error("فشل حساب التوزيع");
        const preview = await res.json();

        if (preview.fulfilled) {
          const isDeptPrice = line.priceSource === "department";
          const newFefoLines: LineLocal[] = (preview.allocations as FefoAllocation[])
            .filter((a) => parseFloat(a.allocatedQty) > 0)
            .map((alloc) => {
              const allocMinor  = parseFloat(alloc.allocatedQty);
              const displayQty  = convertMinorToDisplayQty(allocMinor, newLevel, line.item);
              const lotBase     = isDeptPrice
                ? newUnitPrice
                : computeUnitPriceFromBase(
                    parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice!) : baseSalePrice,
                    newLevel, line.item
                  );
              const lineTotal = +(displayQty * lotBase).toFixed(2);
              return {
                tempId: genId(), lineType: line.lineType, serviceId: null,
                itemId: line.itemId, description: line.description,
                quantity: displayQty, unitPrice: lotBase,
                discountPercent: 0, discountAmount: 0, totalPrice: lineTotal,
                doctorName: "", nurseName: "",
                requiresDoctor: false, requiresNurse: false,
                notes: "", sortOrder: 0, serviceType: "",
                unitLevel: newLevel, item: line.item,
                lotId: alloc.lotId || null,
                expiryMonth: alloc.expiryMonth || null,
                expiryYear: alloc.expiryYear || null,
                priceSource: line.priceSource, sourceType: null, sourceId: null,
                coverageStatus: null, approvalStatus: null,
                companyShareAmount: null, patientShareAmount: null,
                contractPrice: null, listPrice: null, contractRuleId: null,
                businessClassification: line.businessClassification ?? null,
                appliedAt:  line.appliedAt  ?? null,
                appliedBy:  line.appliedBy  ?? null,
              } as LineLocal;
            });
          setLines(prev => [...prev.filter(l => l.itemId !== line.itemId), ...newFefoLines]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
    } else {
      setLines(prev => prev.map(l => {
        if (l.tempId !== tempId) return l;
        const total = +(1 * newUnitPrice).toFixed(2);
        return { ...l, unitLevel: newLevel, quantity: 1, unitPrice: newUnitPrice, totalPrice: total, discountPercent: 0, discountAmount: 0 };
      }));
    }
  }, [warehouseId, invoiceDate, departmentId, toast]);

  // ── FEFO: qty confirm ──────────────────────────────────────────────────────
  const handleQtyConfirm = useCallback(async (tempId: string) => {
    const line       = linesRef.current.find(l => l.tempId === tempId);
    if (!line || !line.itemId) return;

    const pendingVal  = pendingQtyRef.current.get(tempId);
    const qtyEntered  = parseFloat(pendingVal ?? String(line.quantity)) || 0;
    pendingQtyRef.current.delete(tempId);

    if (qtyEntered <= 0) { toast({ title: "كمية غير صحيحة", variant: "destructive" }); return; }

    const isExpiry = !!(line.lotId || line.expiryMonth || line.expiryYear);
    if (!isExpiry || !warehouseId) { updateLine(tempId, "quantity", qtyEntered); return; }

    const allLinesForItem = linesRef.current.filter(l => l.itemId === line.itemId);
    const otherMinor      = allLinesForItem
      .filter(l => l.tempId !== tempId)
      .reduce((sum, l) => sum + calculateQtyInMinor(l.quantity, l.unitLevel, l.item), 0);
    const enteredMinor    = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
    const totalRequired   = otherMinor + enteredMinor;
    if (totalRequired <= 0) return;

    setFefoLoading(true);
    try {
      const fefoParams = new URLSearchParams({
        itemId: line.itemId, warehouseId,
        requiredQtyInMinor: String(totalRequired), asOfDate: invoiceDate,
      });
      const res = await fetch(`/api/transfer/fefo-preview?${fefoParams}`);
      if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
      const preview = await res.json();

      if (!preview.fulfilled) {
        if (line.item?.allowOversell === true && oversellEnabled === true) {
          updateLine(tempId, "quantity", qtyEntered);
          toast({
            title: "صرف بدون رصيد",
            description: `الكمية المطلوبة تتجاوز الرصيد — سيتم معالجتها كتكلفة مؤجلة`,
            variant: "default",
          });
          return;
        }
        toast({
          title: "الكمية غير متاحة",
          description: preview.shortfall ? `العجز: ${preview.shortfall}` : "الرصيد غير كافي",
          variant: "destructive",
        });
        return;
      }

      let resolvedPrice = parseFloat(String(line.unitPrice)) || 0;
      let isDeptPrice   = line.priceSource === "department";
      if (departmentId || warehouseId) {
        try {
          const params = new URLSearchParams({ itemId: line.itemId });
          if (departmentId) params.set("departmentId", departmentId);
          if (warehouseId)  params.set("warehouseId", warehouseId);
          const priceRes = await fetch(`/api/pricing?${params}`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const resolved  = parseFloat(priceData.price);
            if (resolved > 0) resolvedPrice = resolved;
            isDeptPrice = priceData.source === "department";
          }
        } catch {}
      }

      const ul      = line.unitLevel || "minor";
      const itemRef = line.item;
      const newFefoLines: LineLocal[] = (preview.allocations as FefoAllocation[])
        .filter((a) => parseFloat(a.allocatedQty) > 0)
        .map((alloc) => {
          const allocMinor = parseFloat(alloc.allocatedQty);
          const displayQty = convertMinorToDisplayQty(allocMinor, ul, itemRef);
          const basePrice  = isDeptPrice
            ? resolvedPrice
            : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice!) : resolvedPrice);
          const linePrice  = computeUnitPriceFromBase(basePrice, ul, itemRef);
          const lineTotal  = +(displayQty * linePrice).toFixed(2);
          return {
            tempId: genId(), lineType: line.lineType, serviceId: null,
            itemId: line.itemId, description: line.description,
            quantity: displayQty, unitPrice: linePrice,
            discountPercent: 0, discountAmount: 0, totalPrice: lineTotal,
            doctorName: "", nurseName: "",
            requiresDoctor: false, requiresNurse: false,
            notes: "", sortOrder: 0, serviceType: "",
            unitLevel: ul, item: itemRef,
            lotId: alloc.lotId || null,
            expiryMonth: alloc.expiryMonth || null,
            expiryYear: alloc.expiryYear || null,
            priceSource: isDeptPrice ? "department" : (parseFloat(alloc.lotSalePrice || "0") > 0 ? "lot" : "item"),
            sourceType: null, sourceId: null,
            coverageStatus: null, approvalStatus: null,
            companyShareAmount: null, patientShareAmount: null,
            contractPrice: null, listPrice: null, contractRuleId: null,
            businessClassification: line.businessClassification ?? null,
            templateId:           line.templateId           ?? null,
            templateNameSnapshot: line.templateNameSnapshot ?? null,
            appliedAt:            line.appliedAt            ?? null,
            appliedBy:            line.appliedBy            ?? null,
          } as LineLocal;
        });

      setLines(prev => [...prev.filter(l => l.itemId !== line.itemId), ...newFefoLines]);
      if (newFefoLines.length > 1) {
        toast({ title: `تم التوزيع على ${newFefoLines.length} دفعات (FEFO)` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ في توزيع الصلاحية", description: msg, variant: "destructive" });
    } finally {
      setFefoLoading(false);
    }
  }, [warehouseId, invoiceDate, departmentId, toast, updateLine, oversellEnabled]);

  // ── Apply template (bulk, one API call, atomic UI lock) ──────────────────
  const applyTemplate = useCallback(async (
    templateId: string,
    opts?: { replaceExisting?: boolean }
  ) => {
    setIsApplyingTemplate(true);
    try {
      const res = await fetch(`/api/invoice-templates/${templateId}/apply`);
      if (!res.ok) throw new Error("فشل تحميل النموذج");
      const tmpl = await res.json() as {
        id: string;
        name: string;
        lines: Array<{
          id: string;
          lineType: string;
          serviceId: string | null;
          itemId: string | null;
          defaultQty: string | null;
          notes: string | null;
          doctorName: string | null;
          nurseName: string | null;
          service?: { id: string; nameAr: string; name: string; code: string; basePrice: string; serviceType: string; requiresDoctor: boolean; requiresNurse: boolean; businessClassification?: string | null } | null;
          item?: { id: string; nameAr: string; itemCode: string; salePriceCurrent: string; purchasePriceLast: string; hasExpiry: boolean; businessClassification?: string | null; category?: string } | null;
        }>;
      };

      // Replace mode: remove all non-STAY_ENGINE lines before applying
      if (opts?.replaceExisting) {
        setLines(prev => prev.filter(l => l.sourceType === "STAY_ENGINE" || l.sourceType === "stay_engine"));
      }

      const appliedAt = new Date().toISOString();
      const trace = { templateId: tmpl.id, templateNameSnapshot: tmpl.name, appliedAt };

      for (const tl of tmpl.lines) {
        const qty = parseFloat(tl.defaultQty ?? "1") || 1;
        const lineOpts = { ...trace, defaultQty: qty, notes: tl.notes || "", doctorName: tl.doctorName || "", nurseName: tl.nurseName || "" };

        if (tl.lineType === "service" && tl.service) {
          addServiceLine(tl.service as Parameters<typeof addServiceLine>[0], lineOpts);
        } else if (tl.item) {
          const lineType = (tl.lineType as "drug" | "consumable" | "equipment") || "drug";
          await addItemLine(tl.item as Parameters<typeof addItemLine>[0], lineType, lineOpts);
        }
      }

      toast({ title: `تم تطبيق النموذج: ${tmpl.name}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ في تطبيق النموذج", description: msg, variant: "destructive" });
    } finally {
      setIsApplyingTemplate(false);
    }
  }, [addServiceLine, addItemLine, toast]);

  return {
    lines,
    fefoLoading,
    isApplyingTemplate,
    linesRef,
    pendingQtyRef,
    resetLines,
    loadLines,
    addServiceLine,
    addItemLine,
    updateLine,
    removeLine,
    filteredLines,
    handleUnitLevelChange,
    handleQtyConfirm,
    applyTemplate,
  };
}
