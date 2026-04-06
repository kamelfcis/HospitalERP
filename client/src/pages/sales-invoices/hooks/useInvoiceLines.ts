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
  /** دُفعات محملة مسبقاً من ItemFastSearch — تُلغي طلب API */
  preloadedBatches?: Array<{
    expiryMonth: number | null;
    expiryYear: number | null;
    qtyAvailableMinor: string;
    lotId?: string | null;
    lotSalePrice?: string | null;
  }>;
}

// ── كاش أسعار القسم (60 ثانية) لتجنب طلب API متكرر لنفس الصنف ──────────────
type PriceCacheEntry = { baseSalePrice: number; isDeptPrice: boolean; priceSource: string; ts: number };
const PRICING_CACHE_TTL = 60_000;

interface FefoResult {
  ok: boolean;
  lines?: SalesLineLocal[];
  shortfall?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// نوع مشترك للتوزيع الخام
// ─────────────────────────────────────────────────────────────────────────────
type RawAlloc = {
  lotId?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  availableQty: string;
  allocatedQty: string;
  lotSalePrice?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// خطوة 1: جلب توزيع FEFO الخام (بدون تسعير)
// يدعم بيانات محملة مسبقاً أو طلب API
// ─────────────────────────────────────────────────────────────────────────────
async function getFefoAllocations(opts: {
  itemId: string;
  warehouseId: string;
  invoiceDate: string;
  totalRequiredMinor: number;
  preloadedBatches?: Array<{ expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotId?: string | null; lotSalePrice?: string | null }>;
}): Promise<{ ok: boolean; allocations?: RawAlloc[]; expiryOptions?: FefoExpiryOption[]; shortfall?: string }> {
  const { itemId, warehouseId, invoiceDate, totalRequiredMinor, preloadedBatches } = opts;

  // ── مصدر الدُفعات ─────────────────────────────────────────────────────────
  let sourceLots: Array<{ lotId?: string | null; expiryMonth?: number | null; expiryYear?: number | null; availableQty: string; lotSalePrice?: string | null }>;

  if (preloadedBatches && preloadedBatches.length > 0) {
    sourceLots = preloadedBatches
      .filter(b => parseFloat(b.qtyAvailableMinor || "0") > 0)
      .map(b => ({
        lotId:        b.lotId ?? null,
        expiryMonth:  b.expiryMonth,
        expiryYear:   b.expiryYear,
        availableQty: b.qtyAvailableMinor,
        lotSalePrice: b.lotSalePrice ?? null,
      }));
  } else {
    const allParams = new URLSearchParams({ itemId, warehouseId, requiredQtyInMinor: "999999", asOfDate: invoiceDate });
    const allRes = await fetch(`/api/transfer/fefo-preview?${allParams}`);
    if (!allRes.ok) throw new Error("فشل حساب توزيع الصلاحية");
    const allPreview = await allRes.json();
    sourceLots = (allPreview.allocations as any[])
      .filter(a => parseFloat(a.availableQty || "0") > 0)
      .map(a => ({
        lotId:        a.lotId       ?? null,
        expiryMonth:  a.expiryMonth ?? null,
        expiryYear:   a.expiryYear  ?? null,
        availableQty: a.availableQty || "0",
        lotSalePrice: a.lotSalePrice ?? null,
      }));
  }

  // ── قائمة الصلاحية للعرض في واجهة المستخدم ────────────────────────────────
  const expiryOptions: FefoExpiryOption[] = sourceLots
    .filter(b => b.expiryMonth && b.expiryYear)
    .map(b => ({
      expiryMonth:       b.expiryMonth as number,
      expiryYear:        b.expiryYear  as number,
      qtyAvailableMinor: b.availableQty,
      lotId:             b.lotId as string,
      lotSalePrice:      b.lotSalePrice || "0",
    }));

  // ── توزيع FEFO على الكمية المطلوبة ──────────────────────────────────────
  let remaining = totalRequiredMinor;
  const allocations: RawAlloc[] = [];
  for (const lot of sourceLots) {
    if (remaining <= 0) break;
    const avail = parseFloat(lot.availableQty || "0");
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    remaining -= take;
    allocations.push({ ...lot, allocatedQty: String(take) });
  }
  if (remaining > 0.001) {
    return { ok: false, shortfall: String(remaining) };
  }

  return { ok: true, allocations, expiryOptions };
}

// ─────────────────────────────────────────────────────────────────────────────
// خطوة 2: بناء سطور الفاتورة من التوزيع الخام + التسعير
// دالة خالصة — لا طلبات شبكة
// ─────────────────────────────────────────────────────────────────────────────
function buildFefoLines(
  allocations: RawAlloc[],
  expiryOptions: FefoExpiryOption[],
  pricing: { baseSalePrice: number; isDeptPrice: boolean; priceSource: string },
  itemId: string,
  itemData: InvoiceItemData,
  unitLevel: string,
  availableQtyMinor: string,
): SalesLineLocal[] {
  const { baseSalePrice, isDeptPrice, priceSource } = pricing;
  return allocations
    .filter(a => parseFloat(a.allocatedQty) > 0)
    .map(alloc => {
      const allocMinor = parseFloat(alloc.allocatedQty);
      const displayQty = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
      const lotPrice   = parseFloat(alloc.lotSalePrice || "0");
      const lineBase   = isDeptPrice ? baseSalePrice : (lotPrice > 0 ? lotPrice : baseSalePrice);
      const linePrice  = computeUnitPriceFromBase(lineBase, unitLevel, itemData);
      const src        = isDeptPrice ? "department" : (lotPrice > 0 ? "lot" : priceSource);
      return {
        tempId:            genId(),
        itemId,
        item:              itemData as unknown as SalesLineLocal["item"],
        unitLevel,
        qty:               displayQty,
        salePrice:         linePrice,
        baseSalePrice:     lineBase,
        lineTotal:         computeLineTotal(displayQty, lineBase, unitLevel, itemData),
        expiryMonth:       alloc.expiryMonth || null,
        expiryYear:        alloc.expiryYear  || null,
        lotId:             alloc.lotId        || null,
        fefoLocked:        true,
        priceSource:       src,
        availableQtyMinor: expiryOptions.find(o => o.lotId === alloc.lotId)?.qtyAvailableMinor || availableQtyMinor,
        expiryOptions,
      } as SalesLineLocal;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة FEFO الكاملة (للاستخدام في handleQtyConfirm — مع API دائماً)
// ─────────────────────────────────────────────────────────────────────────────
async function runFefo(opts: FefoOptions): Promise<FefoResult> {
  const {
    itemId, itemData, warehouseId, invoiceDate,
    unitLevel, totalRequiredMinor, baseSalePrice, isDeptPrice, priceSource, availableQtyMinor,
    preloadedBatches,
  } = opts;

  const allocResult = await getFefoAllocations({
    itemId, warehouseId, invoiceDate, totalRequiredMinor, preloadedBatches,
  });
  if (!allocResult.ok) return { ok: false, shortfall: allocResult.shortfall };

  const lines = buildFefoLines(
    allocResult.allocations!, allocResult.expiryOptions!,
    { baseSalePrice, isDeptPrice, priceSource },
    itemId, itemData, unitLevel, availableQtyMinor,
  );
  return { ok: true, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة جلب السعر (قسم أو صنف) — مع كاش 60 ثانية
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePricing(
  itemData: InvoiceItemData,
  warehouseId: string,
  cache: Map<string, PriceCacheEntry>,
): Promise<{ baseSalePrice: number; isDeptPrice: boolean; priceSource: string }> {
  let baseSalePrice = parseFloat(String(itemData.salePriceCurrent)) || 0;
  let priceSource   = "item";
  let isDeptPrice   = false;

  if (warehouseId) {
    const cacheKey = `${itemData.id}_${warehouseId}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PRICING_CACHE_TTL) {
      return { baseSalePrice: cached.baseSalePrice, isDeptPrice: cached.isDeptPrice, priceSource: cached.priceSource };
    }
    try {
      const res = await fetch(`/api/pricing?itemId=${itemData.id}&warehouseId=${warehouseId}`);
      if (res.ok) {
        const data = await res.json();
        const resolved = parseFloat(data.price);
        if (resolved > 0) baseSalePrice = resolved;
        if (data.source) priceSource = data.source;
        isDeptPrice = data.source === "department";
        cache.set(cacheKey, { baseSalePrice, isDeptPrice, priceSource, ts: Date.now() });
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
  // كاش أسعار نطاقه الفاتورة الحالية فقط — يُعاد ضبطه عند فتح فاتورة جديدة
  const pricingCacheRef             = useRef<Map<string, PriceCacheEntry>>(new Map());
  // رقم الطلب الأحدث لكل صنف — لرفض استجابات async قديمة (stale writes)
  const fefoRequestRef              = useRef<Map<string, number>>(new Map());

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
  // allBatches + resolvedPriceArg قادمان من ItemFastSearch (محملة مسبقاً)
  // إن توفرا: صفر طلبات API → إضافة فورية
  // إن غابا: تسعير + FEFO بالتوازي (تحسين 50% عن التسلسل)
  const addItemToLines = useCallback(async (
    itemData: InvoiceItemData,
    overrides?: { qty?: number; unitLevel?: string },
    allBatches?: Array<{ expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotId?: string | null; lotSalePrice?: string | null }>,
    resolvedPriceArg?: { baseSalePrice: number; isDeptPrice: boolean; priceSource: string },
  ) => {
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

      const hasBatches = (allBatches?.length ?? 0) > 0;

      // ── حماية من الكتابة القديمة (stale write protection) ────────────────────
      // كل طلب FEFO للصنف يأخذ رقماً متصاعداً — إذا عاد طلب قديم بعد طلب أحدث يُهمَل
      const reqVersion = (fefoRequestRef.current.get(itemData.id) ?? 0) + 1;
      fefoRequestRef.current.set(itemData.id, reqVersion);

      setFefoLoading(true);
      try {
        // ── التسعير و FEFO بالتوازي ──────────────────────────────────────────
        const [pricing, allocResult] = await Promise.all([
          resolvedPriceArg
            ? Promise.resolve(resolvedPriceArg)
            : resolvePricing(itemData, warehouseId, pricingCacheRef.current),
          getFefoAllocations({
            itemId: itemData.id, warehouseId, invoiceDate,
            totalRequiredMinor,
            preloadedBatches: hasBatches ? allBatches : undefined,
          }),
        ]);

        // إذا جاء طلب أحدث أثناء الانتظار → تجاهل هذه النتيجة
        if (fefoRequestRef.current.get(itemData.id) !== reqVersion) return;

        if (!allocResult.ok) {
          toast({
            title:       "الكمية غير متاحة",
            description: allocResult.shortfall ? `العجز: ${allocResult.shortfall}` : undefined,
            variant:     "destructive",
          });
          return;
        }

        const lines = buildFefoLines(
          allocResult.allocations!, allocResult.expiryOptions!,
          pricing, itemData.id, itemData, unitLevel, itemData.availableQtyMinor || "0",
        );
        setLines((prev) => spliceItemLines(prev, itemData.id, lines));
      } catch (err: unknown) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
      return;
    }

    // ── مسار عادي (صنف بدون صلاحية) ─────────────────────────────────────────
    const { baseSalePrice, isDeptPrice: _dep, priceSource } = resolvedPriceArg
      ?? await resolvePricing(itemData, warehouseId, pricingCacheRef.current);
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
      tempId:            genId(),
      itemId:            itemData.id,
      item:              itemData as unknown as SalesLineLocal["item"],
      unitLevel:         targetUnit,
      qty:               targetQty,
      salePrice:         computeUnitPriceFromBase(baseSalePrice, targetUnit, itemData),
      baseSalePrice,
      lineTotal:         computeLineTotal(targetQty, baseSalePrice, targetUnit, itemData),
      expiryMonth:       null,
      expiryYear:        null,
      lotId:             null,
      fefoLocked:        false,
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

      // حماية من stale write — تأكيد الكمية يلغي أي طلب addItem سابق
      const reqVersion = (fefoRequestRef.current.get(line.itemId) ?? 0) + 1;
      fefoRequestRef.current.set(line.itemId, reqVersion);

      // أعد جلب السعر لضمان دقته (قد يتغير سعر القسم)
      const { baseSalePrice, isDeptPrice, priceSource } = await resolvePricing(
        line.item, warehouseId, pricingCacheRef.current,
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

        // إذا جاء طلب addItem جديد أثناء الانتظار → تجاهل هذا التأكيد
        if (fefoRequestRef.current.get(line.itemId) !== reqVersion) return;

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
