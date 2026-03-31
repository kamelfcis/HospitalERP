/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Core Storage
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  CRUD for `contracts` and `contract_members` tables.
 *
 *  Rules enforced here:
 *  Contracts:
 *    - validate companyId exists
 *    - validate startDate < endDate
 *    - validate basePriceListId exists if provided
 *
 *  Members:
 *    - unique memberCardNumber per contract (DB unique index + app guard)
 *    - validate patientId if provided
 *    - lookupMemberByCard returns member + contract + company in one result
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "../db";
import {
  companies,
  contracts,
  contractMembers,
  patients,
  priceLists,
} from "@shared/schema";
import type {
  Contract,
  InsertContract,
  ContractMember,
  InsertContractMember,
  Company,
} from "@shared/schema";

export interface ContractMemberLookupResult {
  member:   ContractMember;
  contract: Contract;
  company:  Company;
}

const contractsCoreMethods = {
  // ── Contracts ───────────────────────────────────────────────────────────

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
    // Validate company exists
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, data.companyId))
      .limit(1);
    if (!company) throw new Error("الشركة غير موجودة");

    // Validate date range
    if (data.startDate >= data.endDate) {
      throw new Error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
    }

    // Validate basePriceListId + domain isolation guard
    // صيدلية: يجب أن تكون قائمة الأسعار من نوع pharmacy
    // خدمات: يجب أن تكون من نوع service أو mixed
    if (data.basePriceListId) {
      const [pl] = await db
        .select({ id: priceLists.id, priceListType: priceLists.priceListType })
        .from(priceLists)
        .where(eq(priceLists.id, data.basePriceListId))
        .limit(1);
      if (!pl) throw new Error("قائمة الأسعار المحددة غير موجودة");
      // إذا ربط المستخدم قائمة خدمات بعقد صيدلية يظهر تحذير عبر API —
      // القاعدة: نوع القائمة يُخزَّن فقط، التحقق يتم في مكان الاستخدام.
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

  // ── Members ─────────────────────────────────────────────────────────────

  async getMembersByContract(
    this: unknown,
    contractId: string
  ): Promise<ContractMember[]> {
    return db
      .select()
      .from(contractMembers)
      .where(eq(contractMembers.contractId, contractId))
      .orderBy(desc(contractMembers.createdAt));
  },

  async getMemberById(
    this: unknown,
    id: string
  ): Promise<ContractMember | null> {
    const [row] = await db
      .select()
      .from(contractMembers)
      .where(eq(contractMembers.id, id))
      .limit(1);
    return row ?? null;
  },

  async createContractMember(
    this: unknown,
    data: InsertContractMember
  ): Promise<ContractMember> {
    // Validate contract exists
    const [contract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.id, data.contractId))
      .limit(1);
    if (!contract) throw new Error("العقد غير موجود");

    // Validate patient if linked
    if (data.patientId) {
      const [patient] = await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.id, data.patientId))
        .limit(1);
      if (!patient) throw new Error("المريض غير موجود");
    }

    // Guard unique card per contract (DB index also enforces it)
    const [dupCard] = await db
      .select({ id: contractMembers.id })
      .from(contractMembers)
      .where(
        and(
          eq(contractMembers.contractId, data.contractId),
          eq(contractMembers.memberCardNumber, data.memberCardNumber)
        )
      )
      .limit(1);
    if (dupCard) {
      throw new Error(
        `رقم بطاقة المنتسب "${data.memberCardNumber}" مستخدم بالفعل في هذا العقد`
      );
    }

    const [row] = await db.insert(contractMembers).values(data).returning();
    return row;
  },

  async updateContractMember(
    this: unknown,
    id: string,
    data: Partial<InsertContractMember>
  ): Promise<ContractMember> {
    // If changing card number, check uniqueness within same contract
    if (data.memberCardNumber && data.contractId) {
      const [dup] = await db
        .select({ id: contractMembers.id })
        .from(contractMembers)
        .where(
          and(
            eq(contractMembers.contractId, data.contractId),
            eq(contractMembers.memberCardNumber, data.memberCardNumber)
          )
        )
        .limit(1);
      if (dup && dup.id !== id) {
        throw new Error(
          `رقم بطاقة المنتسب "${data.memberCardNumber}" مستخدم بالفعل في هذا العقد`
        );
      }
    }

    const [row] = await db
      .update(contractMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contractMembers.id, id))
      .returning();

    if (!row) throw new Error("المنتسب غير موجود");
    return row;
  },

  /**
   * lookupMemberByCard
   *
   * Finds an active member by card number as of a given date.
   * Returns the resolved member + its parent contract + company.
   * This is the primary integration endpoint for the registration/booking UI.
   */
  async lookupMemberByCard(
    this: unknown,
    cardNumber: string,
    date: string
  ): Promise<ContractMemberLookupResult | null> {
    // Find matching active member whose coverage period includes the given date
    const [member] = await db
      .select()
      .from(contractMembers)
      .where(
        and(
          eq(contractMembers.memberCardNumber, cardNumber),
          eq(contractMembers.isActive, true),
          lte(contractMembers.startDate, date),
          gte(contractMembers.endDate, date)
        )
      )
      .limit(1);

    if (!member) return null;

    // Fetch parent contract (must be active and covering the date)
    const [contract] = await db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.id, member.contractId),
          eq(contracts.isActive, true),
          lte(contracts.startDate, date),
          gte(contracts.endDate, date)
        )
      )
      .limit(1);

    if (!contract) return null;

    // Fetch parent company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, contract.companyId))
      .limit(1);

    if (!company) return null;

    return { member, contract, company };
  },
};

export default contractsCoreMethods;
