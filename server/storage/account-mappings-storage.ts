/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Account Mappings Storage — ربط الحسابات + TTL Cache
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - CRUD ربط الحسابات (Account Mappings)
 *  - TTL in-memory cache (60 ثانية) لتجنب round-trip لكل تأكيد فاتورة
 *  - getMappingsForTransaction: دقة دلالية مع priority tiers (dept → wh → ph → generic)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, and, asc, inArray, isNull } from "drizzle-orm";
import {
  accountMappings,
  accounts as accountsTable,
} from "@shared/schema";
import type {
  AccountMapping,
  InsertAccountMapping,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logAcctEvent } from "../lib/accounting-event-logger";
import {
  validateAccountCategory,
  REVENUE_FIRST_LINE_TYPES,
} from "../lib/account-category-validator";

// ── Account Mappings TTL Cache ────────────────────────────────────────────────
// يُستخدم الكاش لتجنب استعلام DB في كل توليد قيد محاسبي (يُستدعى عند كل تأكيد فاتورة)
// TTL: 60 ثانية — يُبطل تلقائياً عند أي تعديل في جدول account_mappings
interface _MappingCacheEntry { data: AccountMapping[]; exp: number }
const _mappingCache = new Map<string, _MappingCacheEntry>();
const _MAPPING_TTL = 60_000;

export function _mkCacheKey(txType: string, wh?: string|null, ph?: string|null, dept?: string|null): string {
  return `${txType}|${wh ?? ""}|${ph ?? ""}|${dept ?? ""}`;
}
export function _invalidateMappingCache(): void { _mappingCache.clear(); }

const methods = {

  async getAccountMappings(this: DatabaseStorage, transactionType?: string): Promise<AccountMapping[]> {
    if (transactionType) {
      return db.select().from(accountMappings)
        .where(eq(accountMappings.transactionType, transactionType))
        .orderBy(asc(accountMappings.lineType));
    }
    return db.select().from(accountMappings).orderBy(asc(accountMappings.transactionType), asc(accountMappings.lineType));
  },

  async getAccountMapping(this: DatabaseStorage, id: string): Promise<AccountMapping | undefined> {
    const [mapping] = await db.select().from(accountMappings).where(eq(accountMappings.id, id));
    return mapping;
  },

  async upsertAccountMapping(this: DatabaseStorage, data: InsertAccountMapping): Promise<AccountMapping> {
    const conditions = [
      eq(accountMappings.transactionType, data.transactionType),
      eq(accountMappings.lineType, data.lineType),
    ];
    if (data.warehouseId) {
      conditions.push(eq(accountMappings.warehouseId, data.warehouseId));
    } else {
      conditions.push(isNull(accountMappings.warehouseId));
    }
    if (data.pharmacyId) {
      conditions.push(eq(accountMappings.pharmacyId, data.pharmacyId));
    } else {
      conditions.push(isNull(accountMappings.pharmacyId));
    }
    if (data.departmentId) {
      conditions.push(eq(accountMappings.departmentId, data.departmentId));
    } else {
      conditions.push(isNull(accountMappings.departmentId));
    }

    const existing = await db.select().from(accountMappings).where(and(...conditions));

    let result: AccountMapping;
    if (existing.length > 0) {
      const [updated] = await db.update(accountMappings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(accountMappings.id, existing[0].id))
        .returning();
      result = updated;
    } else {
      const [created] = await db.insert(accountMappings).values(data).returning();
      result = created;
    }
    _invalidateMappingCache();
    return result;
  },

  async deleteAccountMapping(this: DatabaseStorage, id: string): Promise<boolean> {
    const res = await db.delete(accountMappings).where(eq(accountMappings.id, id));
    _invalidateMappingCache();
    return (res as any).rowCount > 0;
  },

  // ── bulkUpsertAccountMappings ─────────────────────────────────────────────
  // جلب جميع السجلات الموجودة في استعلام واحد، ثم batch insert/update متوازية
  async bulkUpsertAccountMappings(
    this: DatabaseStorage,
    items: InsertAccountMapping[]
  ): Promise<AccountMapping[]> {
    if (items.length === 0) return [];

    const txTypes = [...new Set(items.map(i => i.transactionType))];

    return db.transaction(async (tx) => {
      const existingAll = await tx.select()
        .from(accountMappings)
        .where(inArray(accountMappings.transactionType, txTypes));

      const existingMap = new Map<string, AccountMapping>();
      for (const row of existingAll) {
        const key = `${row.transactionType}|${row.lineType}|${row.warehouseId ?? ""}|${row.pharmacyId ?? ""}|${row.departmentId ?? ""}`;
        existingMap.set(key, row);
      }

      const toInsert: InsertAccountMapping[] = [];
      const toUpdate: Array<{ id: string; data: InsertAccountMapping }> = [];

      for (const data of items) {
        const key = `${data.transactionType}|${data.lineType}|${data.warehouseId ?? ""}|${data.pharmacyId ?? ""}|${data.departmentId ?? ""}`;
        const existing = existingMap.get(key);
        if (existing) {
          toUpdate.push({ id: existing.id, data });
        } else {
          toInsert.push(data);
        }
      }

      const now = new Date();
      const [insertedRows, updatedRows] = await Promise.all([
        toInsert.length > 0
          ? tx.insert(accountMappings).values(toInsert).returning()
          : Promise.resolve([] as AccountMapping[]),
        Promise.all(
          toUpdate.map(({ id, data }) =>
            tx.update(accountMappings)
              .set({ ...data, updatedAt: now })
              .where(eq(accountMappings.id, id))
              .returning()
              .then(rows => rows[0])
          )
        ),
      ]);

      _invalidateMappingCache();
      return [...insertedRows, ...updatedRows.filter(Boolean)];
    });
  },

  async getMappingsForTransaction(
    this: DatabaseStorage,
    transactionType: string,
    warehouseId?: string | null,
    pharmacyId?:  string | null,
    departmentId?: string | null,
  ): Promise<AccountMapping[]> {
    const cacheKey = _mkCacheKey(transactionType, warehouseId, pharmacyId, departmentId);
    const cached = _mappingCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached.data;

    const allMappings = await db.select().from(accountMappings)
      .where(and(
        eq(accountMappings.transactionType, transactionType),
        eq(accountMappings.isActive, true),
      ))
      .orderBy(asc(accountMappings.lineType));

    const accountIds = [
      ...new Set(
        allMappings.flatMap(m => [m.debitAccountId, m.creditAccountId].filter(Boolean) as string[])
      ),
    ];
    const accountTypeMap = new Map<string, string>();
    if (accountIds.length > 0) {
      const rows = await db
        .select({ id: accountsTable.id, accountType: accountsTable.accountType })
        .from(accountsTable)
        .where(inArray(accountsTable.id, accountIds));
      for (const r of rows) {
        accountTypeMap.set(r.id, r.accountType as string);
      }
    }

    const departmentSpecific: AccountMapping[] = departmentId
      ? allMappings.filter(m => m.departmentId === departmentId && !m.warehouseId && !m.pharmacyId)
      : [];
    const warehouseSpecific: AccountMapping[] = warehouseId
      ? allMappings.filter(m => m.warehouseId === warehouseId && !m.pharmacyId && !m.departmentId)
      : [];
    const pharmacySpecific: AccountMapping[] = pharmacyId
      ? allMappings.filter(m => m.pharmacyId === pharmacyId && !m.warehouseId && !m.departmentId)
      : [];
    const generic: AccountMapping[] = allMappings.filter(m => !m.warehouseId && !m.pharmacyId && !m.departmentId);

    if (!warehouseId && !pharmacyId && !departmentId) {
      return generic;
    }

    function isMappingValid(m: AccountMapping): boolean {
      if (m.debitAccountId) {
        const aType = accountTypeMap.get(m.debitAccountId) ?? "";
        if (!validateAccountCategory(aType, m.lineType, "debit").valid) return false;
      }
      if (m.creditAccountId) {
        const aType = accountTypeMap.get(m.creditAccountId) ?? "";
        if (!validateAccountCategory(aType, m.lineType, "credit").valid) return false;
      }
      return true;
    }

    const allLineTypes = new Set(allMappings.map(m => m.lineType));
    const resultMap = new Map<string, AccountMapping>();

    for (const lineType of allLineTypes) {
      const dp = departmentSpecific.filter(m => m.lineType === lineType);
      const wh = warehouseSpecific.filter(m => m.lineType === lineType);
      const ph = pharmacySpecific.filter(m => m.lineType === lineType);
      const ge = generic.filter(m => m.lineType === lineType);

      const orderedCandidates: AccountMapping[] = REVENUE_FIRST_LINE_TYPES.has(lineType)
        ? [...dp, ...ph, ...wh, ...ge]
        : [...dp, ...wh, ...ph, ...ge];

      for (const candidate of orderedCandidates) {
        if (isMappingValid(candidate)) {
          resultMap.set(lineType, candidate);
          break;
        }
        const whyMsg: string[] = [];
        if (candidate.debitAccountId) {
          const r = validateAccountCategory(accountTypeMap.get(candidate.debitAccountId) ?? "unknown", lineType, "debit");
          if (!r.valid) whyMsg.push(r.message);
        }
        if (candidate.creditAccountId) {
          const r = validateAccountCategory(accountTypeMap.get(candidate.creditAccountId) ?? "unknown", lineType, "credit");
          if (!r.valid) whyMsg.push(r.message);
        }
        logAcctEvent({
          sourceType:   transactionType,
          sourceId:     candidate.id,
          eventType:    "invalid_mapping_skipped",
          status:       "completed",
          errorMessage: `[تحذير] تم تجاهل ربط حساب غير صالح دلالياً — ${whyMsg.join("; ")} — معرف الربط: ${candidate.id}`,
        }).catch(() => {});
      }
    }

    const resolved = [...resultMap.values()];
    _mappingCache.set(cacheKey, { data: resolved, exp: Date.now() + _MAPPING_TTL });
    return resolved;
  },
};

export default methods;
