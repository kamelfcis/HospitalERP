import { db } from "../db";
import { eq, and, sql, or, ilike } from "drizzle-orm";
import {
  suppliers,
  type Supplier,
  type InsertSupplier,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

function toSupplierDbPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (typeof out.creditLimit === "number") out.creditLimit = String(out.creditLimit);
  else if (out.creditLimit === undefined) delete out.creditLimit;
  if (typeof out.openingBalance === "number") out.openingBalance = String(out.openingBalance);
  else if (out.openingBalance === undefined) delete out.openingBalance;
  if (typeof out.defaultPaymentTerms === "number") out.defaultPaymentTerms = out.defaultPaymentTerms;
  else if (out.defaultPaymentTerms === undefined) delete out.defaultPaymentTerms;
  return out;
}

const methods = {
  async getSuppliers(this: DatabaseStorage, params: {
    search?: string;
    page: number;
    pageSize: number;
    supplierType?: string;
    isActive?: boolean | null;
    sortBy?: "nameAr" | "currentBalance";
    sortDir?: "asc" | "desc";
  }): Promise<{ suppliers: (Supplier & { currentBalance: string })[]; total: number }> {
    const { search, page = 1, pageSize = 50, supplierType, isActive, sortBy = "currentBalance", sortDir = "desc" } = params;
    const offset = (page - 1) * pageSize;

    const orderExpr = sortBy === "currentBalance"
      ? (sortDir === "asc" ? sql`current_balance ASC`  : sql`current_balance DESC`)
      : (sortDir === "asc" ? sql`s.name_ar ASC`        : sql`s.name_ar DESC`);

    const searchClause  = search ? sql`AND (s.name_ar ILIKE ${`%${search}%`} OR s.code ILIKE ${`%${search}%`} OR s.phone ILIKE ${`%${search}%`} OR s.tax_id ILIKE ${`%${search}%`})` : sql``;
    const typeClause    = supplierType ? sql`AND s.supplier_type = ${supplierType}` : sql``;
    const activeClause  = (isActive === null || isActive === undefined) ? sql`` : sql`AND s.is_active = ${isActive}`;

    const rawRows = await db.execute(sql`
      WITH supplier_invoice_totals AS (
        SELECT   supplier_id,
                 COALESCE(SUM(net_payable::numeric), 0) AS invoices_total
        FROM     purchase_invoice_headers
        WHERE    status = 'approved_costed'
        GROUP BY supplier_id
      )
      SELECT
        s.id, s.code, s.name_ar, s.name_en, s.phone, s.tax_id, s.address,
        s.supplier_type, s.is_active, s.created_at,
        s.payment_mode, s.credit_limit, s.default_payment_terms,
        s.contact_person, s.opening_balance, s.gl_account_id,
        ROUND(
          COALESCE(s.opening_balance::numeric, 0) + COALESCE(sit.invoices_total, 0),
          2
        )::text AS current_balance
      FROM   suppliers s
      LEFT   JOIN supplier_invoice_totals sit ON sit.supplier_id = s.id
      WHERE  TRUE
        ${activeClause}
        ${typeClause}
        ${searchClause}
      ORDER BY ${orderExpr}
      LIMIT  ${pageSize}
      OFFSET ${offset}
    `);

    const countRaw = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM   suppliers s
      WHERE  TRUE
        ${activeClause}
        ${typeClause}
        ${searchClause}
    `);

    const rows = (rawRows as any).rows as any[];
    const total = Number(((countRaw as any).rows[0])?.total ?? 0);

    const result = rows.map(r => ({
      id:                  r.id,
      code:                r.code,
      nameAr:              r.name_ar,
      nameEn:              r.name_en ?? null,
      phone:               r.phone ?? null,
      taxId:               r.tax_id ?? null,
      address:             r.address ?? null,
      supplierType:        r.supplier_type,
      isActive:            r.is_active,
      createdAt:           r.created_at,
      paymentMode:         r.payment_mode,
      creditLimit:         r.credit_limit ?? null,
      defaultPaymentTerms: r.default_payment_terms ?? null,
      contactPerson:       r.contact_person ?? null,
      openingBalance:      r.opening_balance ?? null,
      glAccountId:         r.gl_account_id ?? null,
      currentBalance:      r.current_balance ?? "0.00",
    })) as (Supplier & { currentBalance: string })[];

    return { suppliers: result, total };
  },

  async searchSuppliers(this: DatabaseStorage, q: string, limit: number = 20): Promise<Pick<Supplier, 'id' | 'code' | 'nameAr' | 'nameEn' | 'phone'>[]> {
    const trimmed = q.trim();
    if (!trimmed) {
      return db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(suppliers.nameAr).limit(limit);
    }
    const isNumericLike = /^\d+$/.test(trimmed);
    let results;
    if (isNumericLike) {
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        ilike(suppliers.code, `${trimmed}%`),
        ilike(suppliers.phone, `%${trimmed}%`),
      ))).orderBy(sql`CASE WHEN ${suppliers.code} = ${trimmed} THEN 0 ELSE 1 END`, suppliers.code).limit(limit);
    } else {
      const pattern = `%${trimmed}%`;
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        ilike(suppliers.nameAr, pattern),
        ilike(suppliers.nameEn, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
        ilike(suppliers.taxId, pattern),
      ))).orderBy(suppliers.nameAr).limit(limit);
    }
    return results;
  },

  async getSupplier(this: DatabaseStorage, id: string): Promise<Supplier | undefined> {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return s;
  },

  async createSupplier(this: DatabaseStorage, supplier: InsertSupplier): Promise<Supplier> {
    const dbPayload = toSupplierDbPayload(supplier);
    const [s] = await db.insert(suppliers).values(dbPayload as any).returning();
    return s;
  },

  async updateSupplier(this: DatabaseStorage, id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const dbPayload = toSupplierDbPayload(supplier);
    const [s] = await db.update(suppliers).set(dbPayload as any).where(eq(suppliers.id, id)).returning();
    return s;
  },
};

export default methods;
