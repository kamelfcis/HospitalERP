/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Coverage Rules Storage
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  CRUD لجدول contract_coverage_rules.
 *  يُحمَّل كـ mixin على DatabaseStorage.prototype.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, asc } from "drizzle-orm";
import { db } from "../db";
import {
  contractCoverageRules,
  contracts,
} from "@shared/schema";
import type {
  ContractCoverageRule,
  InsertContractCoverageRule,
} from "@shared/schema";

const contractsRulesMethods = {

  async getCoverageRules(
    this: unknown,
    contractId: string,
  ): Promise<ContractCoverageRule[]> {
    return db
      .select()
      .from(contractCoverageRules)
      .where(eq(contractCoverageRules.contractId, contractId))
      .orderBy(asc(contractCoverageRules.priority));
  },

  async getCoverageRuleById(
    this: unknown,
    id: string,
  ): Promise<ContractCoverageRule | null> {
    const [row] = await db
      .select()
      .from(contractCoverageRules)
      .where(eq(contractCoverageRules.id, id));
    return row ?? null;
  },

  async createCoverageRule(
    this: unknown,
    data: InsertContractCoverageRule,
  ): Promise<ContractCoverageRule> {
    const [contract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.id, data.contractId));
    if (!contract) throw new Error("العقد غير موجود");

    const [row] = await db
      .insert(contractCoverageRules)
      .values(data)
      .returning();
    return row;
  },

  async updateCoverageRule(
    this: unknown,
    id: string,
    data: Partial<InsertContractCoverageRule>,
  ): Promise<ContractCoverageRule> {
    const [row] = await db
      .update(contractCoverageRules)
      .set(data)
      .where(eq(contractCoverageRules.id, id))
      .returning();
    if (!row) throw new Error("القاعدة غير موجودة");
    return row;
  },

  async deleteCoverageRule(
    this: unknown,
    id: string,
  ): Promise<void> {
    const result = await db
      .delete(contractCoverageRules)
      .where(eq(contractCoverageRules.id, id))
      .returning({ id: contractCoverageRules.id });
    if (!result.length) throw new Error("القاعدة غير موجودة");
  },
};

export default contractsRulesMethods;
