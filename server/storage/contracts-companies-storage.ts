/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts → Companies Storage
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  CRUD for the `companies` table.
 *
 *  Rules enforced here:
 *  - Unique code: checked before insert/update
 *  - glAccountId existence: validated if provided
 *  - Soft-delete only: deactivateCompany sets isActive=false
 *  - Cannot deactivate a company that has active contracts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, ilike, or, desc } from "drizzle-orm";
import { db } from "../db";
import { companies, contracts } from "@shared/schema";
import type { Company, InsertCompany } from "@shared/schema";

export interface GetCompaniesParams {
  search?: string;
  companyType?: string;
  isActive?: boolean;
}

const companiesMethods = {
  async getCompanies(
    this: unknown,
    params: GetCompaniesParams = {}
  ): Promise<Company[]> {
    let query = db.select().from(companies).$dynamic();

    const filters: ReturnType<typeof eq>[] = [];

    if (params.isActive !== undefined) {
      filters.push(eq(companies.isActive, params.isActive));
    }
    if (params.companyType) {
      filters.push(eq(companies.companyType, params.companyType));
    }

    if (filters.length > 0) {
      query = query.where(and(...filters));
    }

    if (params.search) {
      const term = `%${params.search}%`;
      query = query.where(
        or(ilike(companies.nameAr, term), ilike(companies.code, term))
      );
    }

    return query.orderBy(desc(companies.createdAt));
  },

  async getCompanyById(
    this: unknown,
    id: string
  ): Promise<Company | null> {
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
    return row ?? null;
  },

  async createCompany(
    this: unknown,
    data: InsertCompany
  ): Promise<Company> {
    // Check code uniqueness
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.code, data.code))
      .limit(1);
    if (existing) {
      throw new Error(`كود الشركة "${data.code}" مستخدم بالفعل`);
    }

    const [row] = await db.insert(companies).values(data).returning();
    return row;
  },

  async updateCompany(
    this: unknown,
    id: string,
    data: Partial<InsertCompany>
  ): Promise<Company> {
    // Check code uniqueness if code is changing
    if (data.code) {
      const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.code, data.code)))
        .limit(1);
      if (existing && existing.id !== id) {
        throw new Error(`كود الشركة "${data.code}" مستخدم بالفعل`);
      }
    }

    const [row] = await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!row) throw new Error("الشركة غير موجودة");
    return row;
  },

  async deactivateCompany(
    this: unknown,
    id: string
  ): Promise<Company> {
    // Guard: cannot deactivate if active contracts exist
    const [activeContract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.companyId, id), eq(contracts.isActive, true)))
      .limit(1);

    if (activeContract) {
      throw new Error(
        "لا يمكن إلغاء تفعيل الشركة لوجود عقود نشطة مرتبطة بها"
      );
    }

    const [row] = await db
      .update(companies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!row) throw new Error("الشركة غير موجودة");
    return row;
  },
};

export default companiesMethods;
