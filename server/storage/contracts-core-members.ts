import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "../db";
import {
  companies,
  contracts,
  contractMembers,
  patients,
} from "@shared/schema";
import type {
  Contract,
  ContractMember,
  InsertContractMember,
  Company,
} from "@shared/schema";

export interface ContractMemberLookupResult {
  member:   ContractMember;
  contract: Contract;
  company:  Company;
}

export const contractsCoreMembersMethods = {
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
    const [contract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.id, data.contractId))
      .limit(1);
    if (!contract) throw new Error("العقد غير موجود");

    if (data.patientId) {
      const [patient] = await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.id, data.patientId))
        .limit(1);
      if (!patient) throw new Error("المريض غير موجود");
    }

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

  async lookupMemberByCard(
    this: unknown,
    cardNumber: string,
    date: string
  ): Promise<ContractMemberLookupResult | null> {
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

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, contract.companyId))
      .limit(1);

    if (!company) return null;

    return { member, contract, company };
  },
};
