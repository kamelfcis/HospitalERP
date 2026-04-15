/**
 * Ensures generic account_mappings exist so live HTTP tests can post receivings / invoices.
 * Safe to call repeatedly (skips rows that already exist).
 */
import { db } from "../../server/db";
import { accounts, accountMappings } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";

async function firstAccountId(type: "asset" | "liability"): Promise<string | null> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.isActive, true), eq(accounts.accountType, type)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function hasGenericMapping(tx: string, line: string): Promise<boolean> {
  const rows = await db
    .select({ id: accountMappings.id })
    .from(accountMappings)
    .where(
      and(
        eq(accountMappings.transactionType, tx),
        eq(accountMappings.lineType, line),
        eq(accountMappings.isActive, true),
        isNull(accountMappings.warehouseId),
        isNull(accountMappings.pharmacyId),
        isNull(accountMappings.departmentId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function ensureLiveTestAccountMappings(): Promise<void> {
  const assetId = await firstAccountId("asset");
  const liabilityId = await firstAccountId("liability");
  if (!assetId || !liabilityId) {
    console.warn("[vitest globalSetup] No asset/liability accounts in DB — live receiving tests may fail (422 mapping).");
    return;
  }

  const seeds: Array<{
    transactionType: string;
    lineType: string;
    debitAccountId: string | null;
    creditAccountId: string | null;
  }> = [
    { transactionType: "receiving", lineType: "inventory", debitAccountId: assetId, creditAccountId: null },
    { transactionType: "receiving", lineType: "payables", debitAccountId: null, creditAccountId: liabilityId },
    { transactionType: "purchase_invoice", lineType: "inventory", debitAccountId: assetId, creditAccountId: null },
    { transactionType: "sales_invoice", lineType: "receivables", debitAccountId: assetId, creditAccountId: null },
  ];

  for (const row of seeds) {
    if (await hasGenericMapping(row.transactionType, row.lineType)) continue;
    await db.insert(accountMappings).values({
      transactionType: row.transactionType,
      lineType:        row.lineType,
      debitAccountId:  row.debitAccountId,
      creditAccountId: row.creditAccountId,
      description:     "Vitest live API globalSetup seed",
      isActive:        true,
    });
  }
}
