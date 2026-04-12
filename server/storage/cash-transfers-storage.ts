import { db } from "../db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import {
  cashTransfers,
  treasuries,
  treasuryTransactions,
  type CashTransfer,
  type InsertCashTransfer,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { generateCashTransferGL } from "../lib/cash-transfer-gl";

const cashTransfersMethods = {

  async createCashTransfer(
    this: DatabaseStorage,
    data: InsertCashTransfer,
    userId: string,
  ): Promise<CashTransfer> {
    return await db.transaction(async (tx) => {
      const [fromTreasury] = await tx
        .select({ id: treasuries.id, name: treasuries.name, glAccountId: treasuries.glAccountId })
        .from(treasuries)
        .where(eq(treasuries.id, data.fromTreasuryId));
      const [toTreasury] = await tx
        .select({ id: treasuries.id, name: treasuries.name, glAccountId: treasuries.glAccountId })
        .from(treasuries)
        .where(eq(treasuries.id, data.toTreasuryId));

      if (!fromTreasury) throw new Error("الخزنة المصدر غير موجودة");
      if (!toTreasury)   throw new Error("الخزنة الوجهة غير موجودة");
      if (fromTreasury.id === toTreasury.id) throw new Error("لا يمكن التحويل من وإلى نفس الخزنة");

      const amount = parseFloat(String(data.amount));
      if (isNaN(amount) || amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من الصفر");

      const serialRow = await tx.execute(sql`SELECT nextval('cash_transfer_serial_seq') AS serial`);
      const serialNumber = parseInt(String((serialRow.rows[0] as any).serial), 10);

      const transferDate = new Date().toISOString().slice(0, 10);

      const [transfer] = await tx
        .insert(cashTransfers)
        .values({
          ...data,
          serialNumber,
          transferredById: userId,
          amount:          String(amount),
          transferredAt:   new Date(),
        })
        .returning();

      await tx.insert(treasuryTransactions).values([
        {
          treasuryId:      fromTreasury.id,
          type:            "out",
          amount:          String(amount),
          sourceType:      "cash_transfer",
          sourceId:        transfer.id,
          description:     `تحويل نقدية إلى ${toTreasury.name} — إيصال #${serialNumber}`,
          transactionDate: transferDate,
          createdAt:       new Date(),
        },
        {
          treasuryId:      toTreasury.id,
          type:            "in",
          amount:          String(amount),
          sourceType:      "cash_transfer",
          sourceId:        transfer.id,
          description:     `تحويل نقدية من ${fromTreasury.name} — إيصال #${serialNumber}`,
          transactionDate: transferDate,
          createdAt:       new Date(),
        },
      ]);

      await generateCashTransferGL(tx as any, {
        transferId:       transfer.id,
        serialNumber,
        fromTreasuryId:   fromTreasury.id,
        fromTreasuryName: fromTreasury.name,
        fromGlAccountId:  fromTreasury.glAccountId,
        toTreasuryId:     toTreasury.id,
        toTreasuryName:   toTreasury.name,
        toGlAccountId:    toTreasury.glAccountId,
        amount,
        transferDate,
      });

      return transfer;
    });
  },

  async getCashTransfers(
    this: DatabaseStorage,
    params: { page?: number; pageSize?: number; dateFrom?: string; dateTo?: string; treasuryId?: string },
  ): Promise<{ rows: CashTransfer[]; total: number }> {
    const page     = Math.max(1, params.page     ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const conds = and(
      params.dateFrom   ? gte(cashTransfers.transferredAt, new Date(params.dateFrom)) : undefined,
      params.dateTo     ? lte(cashTransfers.transferredAt, new Date(params.dateTo + "T23:59:59")) : undefined,
      params.treasuryId
        ? sql`(${cashTransfers.fromTreasuryId} = ${params.treasuryId} OR ${cashTransfers.toTreasuryId} = ${params.treasuryId})`
        : undefined,
    );

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(cashTransfers)
      .where(conds);

    const rows = await db
      .select()
      .from(cashTransfers)
      .where(conds)
      .orderBy(desc(cashTransfers.transferredAt))
      .limit(pageSize)
      .offset(offset);

    return { rows, total };
  },

  async getCashTransferById(this: DatabaseStorage, id: string): Promise<CashTransfer | undefined> {
    const [row] = await db.select().from(cashTransfers).where(eq(cashTransfers.id, id));
    return row;
  },
};

export default cashTransfersMethods;
