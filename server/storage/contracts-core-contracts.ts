import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
  companies,
  contracts,
  priceLists,
} from "@shared/schema";
import type {
  Contract,
  InsertContract,
} from "@shared/schema";

export const contractsCoreContractsMethods = {
  async getContractsByCompany(
    this: unknown,
    companyId: string
  ): Promise<Contract[]> {
    return db
      .select()
      .from(contracts)
      .where(eq(contracts.companyId, companyId))
      .orderBy(desc(contracts.createdAt));
  },

  async getAllActiveContracts(this: unknown): Promise<Array<{
    id: string;
    contractName: string;
    contractNumber: string | null;
    companyCoveragePct: string | null;
    startDate: string;
    endDate: string;
    companyId: string;
    companyName: string;
  }>> {
    const rows = await db
      .select({
        id:                 contracts.id,
        contractName:       contracts.contractName,
        contractNumber:     contracts.contractNumber,
        companyCoveragePct: contracts.companyCoveragePct,
        startDate:          contracts.startDate,
        endDate:            contracts.endDate,
        companyId:          contracts.companyId,
        companyName:        companies.nameAr,
      })
      .from(contracts)
      .innerJoin(companies, eq(contracts.companyId, companies.id))
      .where(eq(contracts.isActive, true))
      .orderBy(companies.nameAr, contracts.contractName);
    return rows;
  },

  async getContractById(
    this: unknown,
    id: string
  ): Promise<Contract | null> {
    const [row] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1);
    return row ?? null;
  },

  async createContract(
    this: unknown,
    data: InsertContract
  ): Promise<Contract> {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, data.companyId))
      .limit(1);
    if (!company) throw new Error("الشركة غير موجودة");

    if (data.startDate >= data.endDate) {
      throw new Error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
    }

    if (data.basePriceListId) {
      const [pl] = await db
        .select({ id: priceLists.id, priceListType: priceLists.priceListType })
        .from(priceLists)
        .where(eq(priceLists.id, data.basePriceListId))
        .limit(1);
      if (!pl) throw new Error("قائمة الأسعار المحددة غير موجودة");
    }

    const [row] = await db.insert(contracts).values(data).returning();
    return row;
  },

  async updateContract(
    this: unknown,
    id: string,
    data: Partial<InsertContract>
  ): Promise<Contract> {
    if (
      data.startDate &&
      data.endDate &&
      data.startDate >= data.endDate
    ) {
      throw new Error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
    }

    const [row] = await db
      .update(contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();

    if (!row) throw new Error("العقد غير موجود");
    return row;
  },
};
