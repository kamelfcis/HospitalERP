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

  // طلب واحد فقط بكمية كبيرة → جميع الدُفعات مرتبة FEFO
  const allParams = new URLSearchParams({
    itemId, warehouseId,
    requiredQtyInMinor: "999999",
    asOfDate: invoiceDate,
  });
  const allRes = await fetch(`/api/transfer/fefo-preview?${allParams}`);
  if (!allRes.ok) throw new Error("فشل حساب توزيع الصلاحية");
  const allPreview = await allRes.json();

  // قائمة الصلاحية الاختيارية
  const expiryOptions = (allPreview.allocations as FefoExpiryOption[])
    .filter(a => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty || "0") > 0)
    .map(a => ({
      expiryMonth:       a.expiryMonth as number,
      expiryYear:        a.expiryYear  as number,
      qtyAvailableMinor: a.availableQty as string,
      lotId:             a.lotId        as string,
      lotSalePrice:      a.lotSalePrice || "0",
    }));

  // حساب توزيع FEFO للكمية المطلوبة من جانب العميل
  let remaining = totalRequiredMinor;
  const fefoAllocations: FefoAllocation[] = [];
  for (const lot of allPreview.allocations as FefoAllocation[]) {
    if (remaining <= 0) break;
    const avail = parseFloat(lot.allocatedQty || "0");
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    remaining -= take;
    fefoAllocations.push({ ...lot, allocatedQty: String(take) });
  }
  if (remaining > 0.001) {
    return { ok: false, shortfall: String(remaining) };
  }

  // بنِ سطور الفاتورة من توزيع FEFO
  const lines: SalesLineLocal[] = fefoAllocations
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
        // رصيد الدُفعة المحددة (lot) وليس الإجمالي الكلي
        availableQtyMinor: expiryOptions.find(o => o.lotId === alloc.lotId)?.qtyAvailableMinor || availableQtyMinor,
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

  // ── حذف مجموعة سطور بـ tempId (للخدمة + مستهلكاتها) ──────────────────────
  const removeLines = useCallback((tempIds: string[]) => {
    setLines((prev) => prev.filter((l) => !tempIds.includes(l.tempId)));
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
    const currentLines = linesRef.current;
    const index        = currentLines.findIndex((l) => l.tempId === tempId);
    const line         = currentLines[index];
    if (!line) return;

    // ── خروج سريع إن لم يُغيَّر المستخدم الكمية أصلاً ──────────────────────
    // pendingQtyRef فارغ = المستخدم تنقَّل بالسهم دون كتابة شيء
    // → لا داعي لأي حساب FEFO أو شبكة = تنقل سلس فوري
    const pendingVal = pendingQtyRef.current.get(tempId);
    if (pendingVal === undefined) return;

    const qtyEntered = parseFloat(pendingVal) || 0;
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

        // ── استعادة التركيز بعد FEFO ──────────────────────────────────────────
        // FEFO يستبدل السطور بـ tempId جديدة → الخلية التي انتقل إليها المستخدم
        // قد تختفي من الـ DOM فيضيع التركيز (يذهب لـ body تلقائياً).
        // • إن كان التركيز على عنصر مفيد (خلية أخرى / باركود) → لا نتدخل
        // • إن كان ضاع (body / null) → ابحث عن أول خلية كمية بعد آخر سطر للصنف
        setTimeout(() => {
          const active = document.activeElement;
          if (!active || active === document.body) {
            // جد موضع آخر سطر لهذا الصنف في السطور المحدَّثة
            const updatedLines = linesRef.current;
            const lastItemIdx  = updatedLines.reduce(
              (last, l, i) => (l.itemId === line.itemId ? i : last), -1,
            );
            const focusRowIdx = lastItemIdx + 1;
            const nextEl = document.querySelector<HTMLElement>(
              `[data-grid-row="${focusRowIdx}"][data-grid-col="qty"]`,
            );
            if (nextEl) {
              nextEl.focus();
              if (nextEl instanceof HTMLInputElement) nextEl.select();
            }
            // إن لم يوجد صف تالٍ → ابقَ على body (الاسكنر العالمي يعمل منه)
          }
        }, 50);
      } catch (err: unknown) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
    } else {
      // ── مسار عادي ──────────────────────────────────────────────────────────
      // لا نُغيّر التركيز: Enter/Tab أرسله للباركود في QtyCell.onKeyDown،
      // وArrowDown أرسله للخلية التالية قبل تشغيل هذه الدالة
      updateLine(index, { qty: qtyEntered });
    }
  }, [warehouseId, invoiceDate, toast, updateLine, linesRef]);

  // ── إضافة سطر مستهلك تابع لخدمة (سعر = 0، مرتبط بـ serviceId) ─────────────
  const addConsumableLine = useCallback(async (
    itemData: InvoiceItemData,
    qty: number,
    unitLevel: string,
    serviceId: string,
  ) => {
    // لا نستخدم FEFO للتسعير — نحن فقط نتتبع الكمية في المخزون
    // السعر = 0 دائماً لأن الخدمة هي التي تُغطي التكلفة
    setLines((prev) => [...prev, {
      tempId:        genId(),
      lineType:      "consumable" as const,
      itemId:        itemData.id,
      item:          itemData as unknown as SalesLineLocal["item"],
      serviceId,
      unitLevel,
      qty,
      salePrice:     0,
      baseSalePrice: 0,
      lineTotal:     0,
      expiryMonth:   null,
      expiryYear:    null,
      lotId:         null,
      fefoLocked:    false,
      priceSource:   "service",
      availableQtyMinor: itemData.availableQtyMinor || "0",
    }]);
  }, []);

  // ── إضافة سطر خدمة (بدون صنف مخزني) ───────────────────────────────────────
  const addServiceLine = useCallback((
    serviceId: string,
    serviceNameAr: string,
    salePrice: number,
  ) => {
    setLines((prev) => [...prev, {
      tempId:        genId(),
      lineType:      "service" as const,
      itemId:        "",
      item:          null,
      serviceId,
      serviceNameAr,
      unitLevel:     "major",
      qty:           1,
      salePrice,
      baseSalePrice: salePrice,
      lineTotal:     salePrice,
      expiryMonth:   null,
      expiryYear:    null,
      lotId:         null,
      fefoLocked:    false,
      priceSource:   "service",
    }]);
  }, []);

  return {
    lines, setLines,
    fefoLoading,
    linesRef,
    pendingQtyRef,
    updateLine,
    removeLine,
    removeLines,
    addItemToLines,
    addConsumableLine,
    addServiceLine,
    handleQtyConfirm,
    fetchExpiryOptions,
  };
}
