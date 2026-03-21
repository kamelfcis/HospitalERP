/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Approvals Storage — مخزن طلبات الموافقة المسبقة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Phase 4: CRUD لجدول contract_approvals + استعلامات الطابور
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq, and, desc, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import {
  contractApprovals,
  companies,
  contracts,
  contractMembers,
  type ContractApproval,
  type InsertContractApproval,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { logger } from "../lib/logger";

// ─── Filters ──────────────────────────────────────────────────────────────

export interface ApprovalFilters {
  status?:     string;
  companyId?:  string;
  contractId?: string;
  dateFrom?:   string;
  dateTo?:     string;
  lineId?:     string;
}

export interface ApprovalWithContext extends ContractApproval {
  companyName?:    string;
  contractName?:   string;
  contractNumber?: string;
  memberName?:     string;
  memberCardNumber?: string;
}

// ─── Storage Mixin ────────────────────────────────────────────────────────

const contractsApprovalsStorageMixin = {

  async createApproval(
    this: DatabaseStorage,
    data: InsertContractApproval & {
      approvalStatus?: string;
      requestedBy?: string;
    },
  ): Promise<ContractApproval> {
    const [created] = await db
      .insert(contractApprovals)
      .values({
        ...data,
        approvalStatus: (data.approvalStatus ?? "pending") as any,
        requestedAt:    new Date(),
        createdAt:      new Date(),
        updatedAt:      new Date(),
      })
      .returning();
    return created;
  },

  async getApprovalById(
    this: DatabaseStorage,
    id: string,
  ): Promise<ContractApproval | undefined> {
    const [row] = await db
      .select()
      .from(contractApprovals)
      .where(eq(contractApprovals.id, id))
      .limit(1);
    return row;
  },

  async getApprovalByLineId(
    this: DatabaseStorage,
    lineId: string,
  ): Promise<ContractApproval | undefined> {
    // Returns the most recent active (pending) approval for a line
    const rows = await db
      .select()
      .from(contractApprovals)
      .where(
        and(
          eq(contractApprovals.patientInvoiceLineId, lineId),
          eq(contractApprovals.approvalStatus, "pending" as any),
        )
      )
      .orderBy(desc(contractApprovals.requestedAt))
      .limit(1);
    return rows[0];
  },

  async updateApproval(
    this: DatabaseStorage,
    id: string,
    updates: Partial<{
      approvalStatus:   string;
      approvalDecision: string;
      approvedAmount:   string;
      rejectionReason:  string;
      decidedAt:        Date;
      decidedBy:        string;
      notes:            string;
    }>,
  ): Promise<ContractApproval> {
    const [updated] = await db
      .update(contractApprovals)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(contractApprovals.id, id))
      .returning();
    return updated;
  },

  async listApprovals(
    this: DatabaseStorage,
    filters: ApprovalFilters = {},
  ): Promise<ApprovalWithContext[]> {
    const rows = await db.select().from(contractApprovals)
      .orderBy(desc(contractApprovals.requestedAt));

    let filtered = rows as ApprovalWithContext[];

    if (filters.status)     filtered = filtered.filter(r => r.approvalStatus === filters.status);
    if (filters.contractId) filtered = filtered.filter(r => r.contractId === filters.contractId);
    if (filters.lineId)     filtered = filtered.filter(r => r.patientInvoiceLineId === filters.lineId);
    if (filters.dateFrom)   filtered = filtered.filter(r => {
      const d = r.requestedAt ? new Date(r.requestedAt).toISOString().split("T")[0] : "";
      return d >= filters.dateFrom!;
    });
    if (filters.dateTo)     filtered = filtered.filter(r => {
      const d = r.requestedAt ? new Date(r.requestedAt).toISOString().split("T")[0] : "";
      return d <= filters.dateTo!;
    });

    // Enrich with company/contract name if companyId filter
    if (filters.companyId) {
      // Load contracts for this company and filter
      const companyContracts = await db.select({ id: contracts.id })
        .from(contracts)
        .where(eq(contracts.companyId, filters.companyId));
      const contractIds = new Set(companyContracts.map(c => c.id));
      filtered = filtered.filter(r => contractIds.has(r.contractId));
    }

    // Enrich with names
    if (filtered.length > 0) {
      const contractIds   = [...new Set(filtered.map(r => r.contractId))];
      const memberIds     = [...new Set(filtered.map(r => r.contractMemberId).filter(Boolean) as string[])];

      const [contractRows, memberRows] = await Promise.all([
        contractIds.length > 0
          ? db.select({
              id: contracts.id,
              contractName: contracts.contractName,
              contractNumber: contracts.contractNumber,
              companyId: contracts.companyId,
            }).from(contracts).where(inArray(contracts.id, contractIds))
          : Promise.resolve([]),
        memberIds.length > 0
          ? db.select({
              id: contractMembers.id,
              memberName: contractMembers.memberName,
              memberCardNumber: contractMembers.memberCardNumber,
            }).from(contractMembers).where(inArray(contractMembers.id, memberIds))
          : Promise.resolve([]),
      ]);

      const contractMap = Object.fromEntries(contractRows.map(c => [c.id, c]));
      const memberMap   = Object.fromEntries(memberRows.map(m => [m.id, m]));

      // Load company names
      const companyIds = [...new Set(contractRows.map(c => c.companyId).filter(Boolean) as string[])];
      const companyRows = companyIds.length > 0
        ? await db.select({ id: companies.id, nameAr: companies.nameAr })
            .from(companies).where(inArray(companies.id, companyIds))
        : [];
      const companyMap = Object.fromEntries(companyRows.map(c => [c.id, c.nameAr]));

      filtered = filtered.map(r => ({
        ...r,
        contractName:    contractMap[r.contractId]?.contractName,
        contractNumber:  contractMap[r.contractId]?.contractNumber,
        companyName:     companyMap[contractMap[r.contractId]?.companyId ?? ""],
        memberName:      r.contractMemberId ? memberMap[r.contractMemberId]?.memberName : undefined,
        memberCardNumber: r.contractMemberId ? memberMap[r.contractMemberId]?.memberCardNumber : undefined,
      }));
    }

    return filtered;
  },
};

export default contractsApprovalsStorageMixin;
