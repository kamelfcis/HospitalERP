import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { SalesLineLocal } from "../types";
import {
  genId,
  calculateQtyInMinor,
  computeUnitPriceFromBase,
  computeLineTotal,
  convertMinorToDisplayQty,
  getSmartDefaultUnitLevel,
} from "@/lib/invoice-lines";

// ─────────────────────────────────────────────────────────────────────────────
// أنواع مساعدة
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceItemData {
  id: string;
  salePriceCurrent: string;
  availableQtyMinor?: string | null;
  majorUnitName?: string | null;
  mediumUnitName?: string | null;
  minorUnitName?: string | null;
  majorToMedium?: string | null;
  majorToMinor?: string | null;
  mediumToMinor?: string | null;
  hasExpiry?: boolean;
}

interface FefoAllocation {
  allocatedQty: string;
  lotId?: string | null;
  expiryMonth?: number | string | null;
  expiryYear?: number | string | null;
  lotSalePrice?: string | null;
}

interface FefoExpiryOption {
  expiryMonth?: number | null;
  expiryYear?: number | null;
  availableQty?: string | null;
  lotId?: string | null;
  lotSalePrice?: string | null;
}

interface FefoOptions {
  itemId: string;
  itemData: InvoiceItemData;
  warehouseId: string;
  invoiceDate: string;
  unitLevel: string;
  totalRequiredMinor: number;
  /** السعر الأساسي المعتمد (من القسم أو من الصنف) */
  baseSalePrice: number;
  /** هل السعر سعر قسم؟ يلغي سعر الدُفعة */
  isDeptPrice: boolean;
  priceSource: string;
  availableQtyMinor: string;
}

interface FefoResult {
  ok: boolean;
  lines?: SalesLineLocal[];
  shortfall?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة FEFO المشتركة — تُستدعى من addItemToLines و handleQtyConfirm
// ─────────────────────────────────────────────────────────────────────────────
async function runFefo(opts: FefoOptions): Promise<FefoResult> {
  const {
    itemId, itemData, warehouseId, invoiceDate,
    unitLevel, totalRequiredMinor, baseSalePrice, isDeptPrice, priceSource, availableQtyMinor,
  } = opts;

  // 1. اطلب توزيع FEFO للكمية المطلوبة
  const fefoParams = new URLSearchParams({
    itemId, warehouseId,
    requiredQtyInMinor: String(totalRequiredMinor),
    asOfDate: invoiceDate,
  });
  const res = await fetch(`/api/transfer/fefo-preview?${fefoParams}`);
  if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
  const preview = await res.json();

  if (!preview.fulfilled) {
    return { ok: false, shortfall: preview.shortfall };
  }

  // 2. اجلب كل الدُفعات المتاحة (لقائمة الصلاحية الاختيارية)
  const allParams = new URLSearchParams({
    itemId, warehouseId,
    requiredQtyInMinor: "999999",
    asOfDate: invoiceDate,
  });
  const allRes = await fetch(`/api/transfer/fefo-preview?${allParams}`);
  const allPreview = allRes.ok ? await allRes.json() : { allocations: [] };
  const expiryOptions = allPreview.allocations
    .filter((a: FefoExpiryOption) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty || "0") > 0)
    .map((a: FefoExpiryOption) => ({
      expiryMonth:      a.expiryMonth as number,
      expiryYear:       a.expiryYear  as number,
      qtyAvailableMinor: a.availableQty as string,
      lotId:            a.lotId        as string,
      lotSalePrice:     a.lotSalePrice || "0",
    }));

  // 3. بنِ سطور الفاتورة من توزيع FEFO
  const lines: SalesLineLocal[] = preview.allocations
    .filter((a: FefoAllocation) => parseFloat(a.allocatedQty) > 0)
    .map((alloc: FefoAllocation) => {
      const allocMinor  = parseFloat(alloc.allocatedQty);
      const displayQty  = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
      const lotPrice    = parseFloat(alloc.lotSalePrice || "0");
      const lineBase    = isDeptPrice ? baseSalePrice : (lotPrice > 0 ? lotPrice : baseSalePrice);
      const linePrice   = computeUnitPriceFromBase(lineBase, unitLevel, itemData);
      const src         = isDeptPrice ? "department" : (lotPrice > 0 ? "lot" : priceSource);

      return {
        tempId:           genId(),
        itemId,
        item:             itemData as unknown as SalesLineLocal["item"],
        unitLevel,
        qty:              displayQty,
        salePrice:        linePrice,
        baseSalePrice:    lineBase,
        lineTotal:        computeLineTotal(displayQty, lineBase, unitLevel, itemData),
        expiryMonth:      alloc.expiryMonth || null,
        expiryYear:       alloc.expiryYear  || null,
        lotId:            alloc.lotId        || null,
        fefoLocked:       true,
        priceSource:      src,
        availableQtyMinor,
        expiryOptions,
      } as SalesLineLocal;
    });

  return { ok: true, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة جلب السعر (قسم أو صنف)
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePricing(
  itemData: InvoiceItemData,
  warehouseId: string,
): Promise<{ baseSalePrice: number; isDeptPrice: boolean; priceSource: string }> {
  let baseSalePrice = parseFloat(String(itemData.salePriceCurrent)) || 0;
  let priceSource   = "item";
  let isDeptPrice   = false;

  if (warehouseId) {
    try {
      const res = await fetch(`/api/pricing?itemId=${itemData.id}&warehouseId=${warehouseId}`);
      if (res.ok) {
        const data = await res.json();
        const resolved = parseFloat(data.price);
        if (resolved > 0) baseSalePrice = resolved;
        if (data.source) priceSource = data.source;
        isDeptPrice = data.source === "department";
      }
    } catch {}
  }

  return { baseSalePrice, isDeptPrice, priceSource };
}

// ─────────────────────────────────────────────────────────────────────────────
// مساعد: يُعيد إدراج سطور FEFO في نفس موضع الصنف الأصلي
// ─────────────────────────────────────────────────────────────────────────────
function spliceItemLines(
  prev: SalesLineLocal[],
  itemId: string,
  newLines: SalesLineLocal[],
): SalesLineLocal[] {
  const insertAt      = prev.findIndex((l) => l.itemId === itemId);
  const withoutItem   = prev.filter((l) => l.itemId !== itemId);
  if (insertAt < 0) {
    return [...withoutItem, ...newLines];
  }
  // كم صنف (من أصناف أخرى) يسبق أول ظهور لهذا الصنف في القائمة المفلترة؟
  const posInFiltered = prev.slice(0, insertAt).filter((l) => l.itemId !== itemId).length;
  return [
    ...withoutItem.slice(0, posInFiltered),
    ...newLines,
    ...withoutItem.slice(posInFiltered),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// الـ Hook الرئيسي
// ─────────────────────────────────────────────────────────────────────────────
export function useInvoiceLines(
  warehouseId: string,
  invoiceDate: string,
  barcodeInputRef: React.RefObject<HTMLInputElement>,
) {
  const { toast } = useToast();
  const [lines, setLines]           = useState<SalesLineLocal[]>([]);
  const [fefoLoading, setFefoLoading] = useState(false);
  const linesRef                    = useRef<SalesLineLocal[]>([]);
  linesRef.current                  = lines;
  const pendingQtyRef               = useRef<Map<string, string>>(new Map());

  // ── تحديث سطر ──────────────────────────────────────────────────────────────
  // كل سطر يتحدث بشكل مستقل — حتى لو كان FEFO
  const updateLine = useCallback((index: number, patch: Partial<SalesLineLocal>) => {
    setLines((prev) => {
      const updated = [...prev];
      const target  = updated[index];
      const ln      = { ...target, ...patch };

      if (patch.unitLevel) {
        // تغيير الوحدة يُعيد الكمية لـ 1 بدلاً من تحويل الكمية الحالية
        ln.qty       = 1;
        ln.salePrice = computeUnitPriceFromBase(ln.baseSalePrice, patch.unitLevel, ln.item);
      }

      ln.lineTotal   = computeLineTotal(ln.qty, ln.baseSalePrice, ln.unitLevel, ln.item);
      updated[index] = ln;
      return updated;
    });
  }, []);

  // ── حذف سطر ────────────────────────────────────────────────────────────────
  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── جلب خيارات الصلاحية لسطر موجود ────────────────────────────────────────
  const fetchExpiryOptions = useCallback(async (itemId: string, lineIndex: number) => {
    if (!warehouseId) return;
    try {
      const params = new URLSearchParams({
        itemId, warehouseId, requiredQtyInMinor: "999999", asOfDate: invoiceDate,
      });
      const res = await fetch(`/api/transfer/fefo-preview?${params}`);
      if (!res.ok) return;
      const preview = await res.json();
      const opts = preview.allocations
        .filter((a: FefoExpiryOption) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty || "0") > 0)
        .map((a: FefoExpiryOption) => ({
          expiryMonth:       a.expiryMonth as number,
          expiryYear:        a.expiryYear  as number,
          qtyAvailableMinor: a.availableQty as string,
          lotId:             a.lotId        as string,
          lotSalePrice:      a.lotSalePrice || "0",
        }));
      setLines((prev) => {
        const updated = [...prev];
        updated[lineIndex] = { ...updated[lineIndex], expiryOptions: opts };
        return updated;
      });
    } catch {}
  }, [warehouseId, invoiceDate]);

  // ── إضافة صنف للفاتورة (من البحث السريع أو الباركود) ──────────────────────
  const addItemToLines = useCallback(async (
    itemData: InvoiceItemData,
    overrides?: { qty?: number; unitLevel?: string },
  ) => {
    const { baseSalePrice, isDeptPrice, priceSource } = await resolvePricing(itemData, warehouseId);

    // ── مسار FEFO (صنف بصلاحية) ──────────────────────────────────────────────
    if (itemData.hasExpiry && warehouseId) {
      const currentLines       = linesRef.current;
      const existingForItem    = currentLines.filter((l) => l.itemId === itemData.id);
      const existingMinor      = existingForItem.reduce(
        (s, l) => s + calculateQtyInMinor(l.qty, l.unitLevel, l.item), 0,
      );
      const smartDefault       = getSmartDefaultUnitLevel(itemData);
      const overrideQty        = overrides?.qty ?? 1;
      const overrideUnit       = overrides?.unitLevel ?? smartDefault;
      const additionalMinor    = calculateQtyInMinor(overrideQty, overrideUnit, itemData);
      const totalRequiredMinor = existingMinor + additionalMinor;
      const unitLevel          = overrides?.unitLevel
        ?? (existingForItem.length > 0 ? existingForItem[0].unitLevel : smartDefault);

      setFefoLoading(true);
      try {
        const result = await runFefo({
          itemId: itemData.id, itemData, warehouseId, invoiceDate,
          unitLevel, totalRequiredMinor, baseSalePrice, isDeptPrice, priceSource,
          availableQtyMinor: itemData.availableQtyMinor || "0",
        });

        if (!result.ok) {
          toast({
            title:       "الكمية غير متاحة",
            description: result.shortfall ? `العجز: ${result.shortfall}` : undefined,
            variant:     "destructive",
          });
          return;
        }

        setLines((prev) => spliceItemLines(prev, itemData.id, result.lines ?? []));
      } catch (err: unknown) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
      return;
    }

    // ── مسار عادي (صنف بدون صلاحية) ─────────────────────────────────────────
    const targetUnit = overrides?.unitLevel ?? getSmartDefaultUnitLevel(itemData);
    const targetQty  = overrides?.qty ?? 1;

    if (!overrides) {
      const existingIdx = linesRef.current.findIndex(
        (l) => l.itemId === itemData.id && l.unitLevel === targetUnit,
      );
      if (existingIdx >= 0) {
        updateLine(existingIdx, { qty: linesRef.current[existingIdx].qty + targetQty });
        return;
      }
    }

    setLines((prev) => [...prev, {
      tempId:           genId(),
      itemId:           itemData.id,
      item:             itemData as unknown as SalesLineLocal["item"],
      unitLevel:        targetUnit,
      qty:              targetQty,
      salePrice:        computeUnitPriceFromBase(baseSalePrice, targetUnit, itemData),
      baseSalePrice,
      lineTotal:        computeLineTotal(targetQty, baseSalePrice, targetUnit, itemData),
      expiryMonth:      null,
      expiryYear:       null,
      lotId:            null,
      fefoLocked:       false,
      priceSource,
      availableQtyMinor: itemData.availableQtyMinor || "0",
    }]);
  }, [updateLine, warehouseId, invoiceDate, toast]);

  // ── تأكيد تعديل الكمية (يعيد حساب FEFO إن لزم) ───────────────────────────
  const handleQtyConfirm = useCallback(async (tempId: string) => {
    // احفظ مكان التركيز الحالي لاستعادته بعد الانتهاء
    // — إن كان المستخدم انتقل بسهم لخلية أخرى → يبقى فيها
    // — إن ضغط Enter/Tab → التركيز كان انتقل للباركود فيعود إليه
    const prevFocused = document.activeElement as HTMLElement | null;

    const currentLines = linesRef.current;
    const index        = currentLines.findIndex((l) => l.tempId === tempId);
    const line         = currentLines[index];
    if (!line) return;

    const pendingVal  = pendingQtyRef.current.get(tempId);
    const qtyEntered  = parseFloat(pendingVal ?? String(line.qty)) || 0;
    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      return;
    }
    pendingQtyRef.current.delete(tempId);

    // ── مسار FEFO ────────────────────────────────────────────────────────────
    if (line.item?.hasExpiry && warehouseId) {
      const allForItem         = currentLines.filter((l) => l.itemId === line.itemId);
      const otherMinor         = allForItem
        .filter((l) => l.tempId !== tempId)
        .reduce((s, l) => s + calculateQtyInMinor(l.qty, l.unitLevel, l.item), 0);
      const thisMinor          = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
      const totalRequiredMinor = otherMinor + thisMinor;
      if (totalRequiredMinor <= 0) return;

      // أعد جلب السعر لضمان دقته (قد يتغير سعر القسم)
      const { baseSalePrice, isDeptPrice, priceSource } = await resolvePricing(
        line.item, warehouseId,
      );

      setFefoLoading(true);
      try {
        const result = await runFefo({
          itemId:            line.itemId,
          itemData:          line.item,
          warehouseId,
          invoiceDate,
          unitLevel:         line.unitLevel,
          totalRequiredMinor,
          baseSalePrice,
          isDeptPrice,
          priceSource,
          availableQtyMinor: line.availableQtyMinor || "0",
        });

        if (!result.ok) {
          toast({
            title:       "الكمية غير متاحة",
            description: result.shortfall ? `العجز: ${result.shortfall}` : undefined,
            variant:     "destructive",
          });
          return;
        }

        setLines((prev) => spliceItemLines(prev, line.itemId, result.lines ?? []));
      } catch (err: unknown) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
    } else {
      // ── مسار عادي ──────────────────────────────────────────────────────────
      updateLine(index, { qty: qtyEntered });
    }

    // أعِد التركيز لمكانه قبل بدء العملية:
    // — خلية جدول (انتقل بسهم) → يبقى فيها
    // — حقل باركود / body / null → اذهب للباركود
    setTimeout(() => {
      if (
        prevFocused &&
        prevFocused !== document.body &&
        document.contains(prevFocused)
      ) {
        prevFocused.focus();
      } else {
        barcodeInputRef.current?.focus();
      }
    }, 50);
  }, [warehouseId, invoiceDate, toast, updateLine, barcodeInputRef]);

  return {
    lines, setLines,
    fefoLoading,
    linesRef,
    pendingQtyRef,
    updateLine,
    removeLine,
    addItemToLines,
    handleQtyConfirm,
    fetchExpiryOptions,
  };
}
