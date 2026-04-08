/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Service Price Resolver — محلّل سعر الخدمة المركزي
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  نقطة تسعير واحدة لكل خدمة. ترتيب الأولوية:
 *    1. contract_price_list  — قائمة أسعار مربوطة بالعقد (base_price_list_id)
 *    2. default_price_list   — قائمة الأسعار الافتراضية (is_default=true, نشطة, صالحة)
 *    3. service_base_price   — السعر الأساسي من جدول الخدمات (fallback مضمون)
 *
 *  القواعد:
 *  - قائمة الأسعار يجب أن تكون: is_active=true + ضمن نطاق التواريخ
 *  - fallback صامت لـ service_base_price (مسجَّل في source)
 *  - يدعم الحالة الفردية والـ batch لمنع N+1
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { priceLists, priceListItems, services } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export type PriceSource =
  | "contract_price_list"
  | "default_price_list"
  | "service_base_price";

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
  priceListId?: string;
  priceListName?: string;
}

/**
 * فحص صلاحية قائمة الأسعار في تاريخ معين.
 * القائمة صالحة إذا كانت: is_active + valid_from <= date + valid_to >= date (أو بدون تاريخ)
 */
function isPriceListValidOnDate(
  pl: { isActive: boolean; validFrom: string | null; validTo: string | null },
  dateStr: string,
): boolean {
  if (!pl.isActive) return false;
  if (pl.validFrom && pl.validFrom > dateStr) return false;
  if (pl.validTo && pl.validTo < dateStr) return false;
  return true;
}

// ─── SINGLE RESOLUTION ────────────────────────────────────────────────────────

export interface ResolvePriceParams {
  serviceId: string;
  contractBasePriceListId?: string | null;
  evaluationDate?: string;
}

/**
 * يحلّ سعر خدمة واحدة.
 * يُستخدم للـ API endpoint — يأخذ base_price_list_id مباشرة (بدون جلب العقد)
 */
export async function resolveServicePrice(
  params: ResolvePriceParams,
): Promise<ResolvedPrice> {
  const { serviceId, contractBasePriceListId, evaluationDate } = params;
  const dateStr = evaluationDate ?? new Date().toISOString().substring(0, 10);

  // ── 1. Contract price list ─────────────────────────────────────────────────
  if (contractBasePriceListId) {
    const [contractPl] = await db
      .select({ id: priceLists.id, name: priceLists.name, isActive: priceLists.isActive, validFrom: priceLists.validFrom, validTo: priceLists.validTo })
      .from(priceLists)
      .where(eq(priceLists.id, contractBasePriceListId))
      .limit(1);

    if (contractPl && isPriceListValidOnDate(contractPl, dateStr)) {
      const [pli] = await db
        .select({ price: priceListItems.price })
        .from(priceListItems)
        .where(and(eq(priceListItems.priceListId, contractBasePriceListId), eq(priceListItems.serviceId, serviceId)))
        .limit(1);

      if (pli) {
        return {
          price: parseFloat(String(pli.price)) || 0,
          source: "contract_price_list",
          priceListId: contractPl.id,
          priceListName: contractPl.name,
        };
      }
    }
  }

  // ── 2. Default price list ──────────────────────────────────────────────────
  const defaultResult = await db
    .select({
      plId: priceLists.id, plName: priceLists.name,
      isActive: priceLists.isActive, validFrom: priceLists.validFrom, validTo: priceLists.validTo,
      price: priceListItems.price,
    })
    .from(priceLists)
    .innerJoin(priceListItems, and(eq(priceListItems.priceListId, priceLists.id), eq(priceListItems.serviceId, serviceId)))
    .where(and(eq(priceLists.isDefault, true), eq(priceLists.isActive, true)))
    .orderBy(priceLists.priceListType)
    .limit(5);

  for (const row of defaultResult) {
    if (isPriceListValidOnDate({ isActive: row.isActive, validFrom: row.validFrom, validTo: row.validTo }, dateStr)) {
      return {
        price: parseFloat(String(row.price)) || 0,
        source: "default_price_list",
        priceListId: row.plId,
        priceListName: row.plName,
      };
    }
  }

  // ── 3. Service base price (fallback) ──────────────────────────────────────
  const [svc] = await db
    .select({ basePrice: services.basePrice })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  return {
    price: parseFloat(String(svc?.basePrice ?? "0")) || 0,
    source: "service_base_price",
  };
}

// ─── BATCH RESOLUTION ────────────────────────────────────────────────────────

export interface BatchResolvePriceParams {
  serviceIds: string[];
  contractBasePriceListId?: string | null;
  evaluationDate?: string;
}

export type BatchResolvedPrices = Map<string, ResolvedPrice>;

/**
 * يحلّ أسعار مجموعة خدمات دفعة واحدة — يُستخدم في applyContractCoverage.
 * يُجري استعلامَين كحدٍّ أقصى بدلاً من N استعلام.
 */
export async function resolveServicePriceBatch(
  params: BatchResolvePriceParams,
): Promise<BatchResolvedPrices> {
  const { serviceIds, contractBasePriceListId, evaluationDate } = params;
  const dateStr = evaluationDate ?? new Date().toISOString().substring(0, 10);
  const result: BatchResolvedPrices = new Map();

  if (serviceIds.length === 0) return result;

  // ── 1. Contract price list batch ───────────────────────────────────────────
  const remaining = new Set(serviceIds);

  if (contractBasePriceListId) {
    const [contractPl] = await db
      .select({ id: priceLists.id, name: priceLists.name, isActive: priceLists.isActive, validFrom: priceLists.validFrom, validTo: priceLists.validTo })
      .from(priceLists)
      .where(eq(priceLists.id, contractBasePriceListId))
      .limit(1);

    if (contractPl && isPriceListValidOnDate(contractPl, dateStr)) {
      const contractItems = await db
        .select({ serviceId: priceListItems.serviceId, price: priceListItems.price })
        .from(priceListItems)
        .where(and(eq(priceListItems.priceListId, contractBasePriceListId), inArray(priceListItems.serviceId, serviceIds)));

      for (const item of contractItems) {
        result.set(item.serviceId, {
          price: parseFloat(String(item.price)) || 0,
          source: "contract_price_list",
          priceListId: contractPl.id,
          priceListName: contractPl.name,
        });
        remaining.delete(item.serviceId);
      }
    }
  }

  // ── 2. Default price list batch (only for services not yet resolved) ───────
  const stillNeeded = Array.from(remaining);
  if (stillNeeded.length > 0) {
    const defaultRows = await db
      .select({
        serviceId: priceListItems.serviceId,
        price: priceListItems.price,
        plId: priceLists.id, plName: priceLists.name,
        isActive: priceLists.isActive, validFrom: priceLists.validFrom, validTo: priceLists.validTo,
      })
      .from(priceLists)
      .innerJoin(priceListItems, and(eq(priceListItems.priceListId, priceLists.id), inArray(priceListItems.serviceId, stillNeeded)))
      .where(and(eq(priceLists.isDefault, true), eq(priceLists.isActive, true)));

    for (const row of defaultRows) {
      if (remaining.has(row.serviceId) && isPriceListValidOnDate({ isActive: row.isActive, validFrom: row.validFrom, validTo: row.validTo }, dateStr)) {
        result.set(row.serviceId, {
          price: parseFloat(String(row.price)) || 0,
          source: "default_price_list",
          priceListId: row.plId,
          priceListName: row.plName,
        });
        remaining.delete(row.serviceId);
      }
    }
  }

  // ── 3. Fallback to service base prices for anything still unresolved ───────
  const fallbackNeeded = Array.from(remaining);
  if (fallbackNeeded.length > 0) {
    const svcRows = await db
      .select({ id: services.id, basePrice: services.basePrice })
      .from(services)
      .where(inArray(services.id, fallbackNeeded));

    for (const svc of svcRows) {
      result.set(svc.id, {
        price: parseFloat(String(svc.basePrice ?? "0")) || 0,
        source: "service_base_price",
      });
    }
  }

  return result;
}
