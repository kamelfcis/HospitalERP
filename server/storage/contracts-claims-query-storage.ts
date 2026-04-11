import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  contractClaimBatches,
  contractClaimLines,
  companies,
  contracts,
  type ContractClaimBatch,
  type ContractClaimLine,
  type InsertClaimLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import type { ClaimBatchFilters, ClaimBatchWithLines } from "./contracts-claims-storage";

const methods = {

  async getClaimBatches(
    this: DatabaseStorage,
    filters: ClaimBatchFilters = {}
  ): Promise<ClaimBatchWithLines[]> {
    const rows = await db
      .select({
        batch:          contractClaimBatches,
        companyNameAr:  companies.nameAr,
        contractName:   contracts.contractName,
        contractNumber: contracts.contractNumber,
      })
      .from(contractClaimBatches)
      .leftJoin(companies, eq(contractClaimBatches.companyId, companies.id))
      .leftJoin(contracts, eq(contractClaimBatches.contractId, contracts.id))
      .orderBy(desc(contractClaimBatches.createdAt));

    const filtered = rows.filter(r => {
      if (filters.companyId  && r.batch.companyId  !== filters.companyId)  return false;
      if (filters.contractId && r.batch.contractId !== filters.contractId) return false;
      if (filters.status     && r.batch.status     !== filters.status)     return false;
      if (filters.dateFrom   && r.batch.batchDate  <  filters.dateFrom)    return false;
      if (filters.dateTo     && r.batch.batchDate  >  filters.dateTo)      return false;
      return true;
    });

    const batchIds = filtered.map(r => r.batch.id);
    if (batchIds.length === 0) return [];

    const allLines = await db
      .select()
      .from(contractClaimLines)
      .where(inArray(contractClaimLines.batchId, batchIds))
      .orderBy(contractClaimLines.serviceDate);

    const linesByBatch: Record<string, ContractClaimLine[]> = {};
    for (const line of allLines) {
      if (!linesByBatch[line.batchId]) linesByBatch[line.batchId] = [];
      linesByBatch[line.batchId].push(line);
    }

    return filtered.map(r => ({
      ...r.batch,
      companyName:    r.companyNameAr  ?? undefined,
      contractName:   r.contractName   ?? undefined,
      contractNumber: r.contractNumber ?? undefined,
      lines:          linesByBatch[r.batch.id] ?? [],
    }));
  },

  async getClaimBatch(
    this: DatabaseStorage,
    batchId: string
  ): Promise<ClaimBatchWithLines | null> {
    const rows = await db
      .select({
        batch:          contractClaimBatches,
        companyNameAr:  companies.nameAr,
        contractName:   contracts.contractName,
        contractNumber: contracts.contractNumber,
      })
      .from(contractClaimBatches)
      .leftJoin(companies, eq(contractClaimBatches.companyId, companies.id))
      .leftJoin(contracts, eq(contractClaimBatches.contractId, contracts.id))
      .where(eq(contractClaimBatches.id, batchId));

    if (!rows[0]) return null;

    const lines = await db
      .select()
      .from(contractClaimLines)
      .where(eq(contractClaimLines.batchId, batchId))
      .orderBy(contractClaimLines.serviceDate);

    return {
      ...rows[0].batch,
      companyName:    rows[0].companyNameAr  ?? undefined,
      contractName:   rows[0].contractName   ?? undefined,
      contractNumber: rows[0].contractNumber ?? undefined,
      lines,
    };
  },

  async findOrCreateDraftBatch(
    this: DatabaseStorage,
    companyId:  string,
    contractId: string,
    batchDate:  string
  ): Promise<ContractClaimBatch> {
    const existing = await db
      .select()
      .from(contractClaimBatches)
      .where(
        and(
          eq(contractClaimBatches.companyId,  companyId),
          eq(contractClaimBatches.contractId, contractId),
          eq(contractClaimBatches.status,     "draft"),
        )
      )
      .limit(1);

    if (existing[0]) return existing[0];

    const batchNumber = await generateBatchNumber();
    const [created] = await db
      .insert(contractClaimBatches)
      .values({ companyId, contractId, batchNumber, batchDate, status: "draft", totalClaimed: "0" })
      .returning();
    return created;
  },

  async upsertClaimLine(
    this: DatabaseStorage,
    data: InsertClaimLine & { batchId: string }
  ): Promise<ContractClaimLine> {
    const idKey = data.patientInvoiceLineId || data.salesInvoiceLineId;

    if (idKey) {
      const existing = await db
        .select()
        .from(contractClaimLines)
        .where(
          and(
            eq(contractClaimLines.batchId, data.batchId),
            data.patientInvoiceLineId
              ? eq(contractClaimLines.patientInvoiceLineId, idKey)
              : eq(contractClaimLines.salesInvoiceLineId, idKey)
          )
        )
        .limit(1);
      if (existing[0]) return existing[0];
    }

    const [line] = await db.insert(contractClaimLines).values(data).returning();

    const companyShare = parseFloat(String(data.companyShareAmount || 0));
    await db
      .update(contractClaimBatches)
      .set({
        totalClaimed: sql`${contractClaimBatches.totalClaimed} + ${companyShare.toFixed(2)}`,
        updatedAt:    new Date(),
      })
      .where(eq(contractClaimBatches.id, data.batchId));

    return line;
  },

};

async function generateBatchNumber(): Promise<string> {
  const result = await db.execute(
    sql`SELECT nextval('contract_claim_batch_seq') AS seq`
  ).catch(async () => {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS contract_claim_batch_seq START 1`);
    return db.execute(sql`SELECT nextval('contract_claim_batch_seq') AS seq`);
  });
  const seq = String((result as any).rows?.[0]?.seq ?? Date.now());
  return `CLM-${new Date().getFullYear()}-${seq.padStart(6, "0")}`;
}

export default methods;
