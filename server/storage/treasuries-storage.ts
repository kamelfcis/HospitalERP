/*
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  ⚠️  NO-TOUCH ZONE — منطقة محظور التعديل                     ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  هذا الملف يتحكم في:                                          ║
 * ║   • تحويلات الأطباء (Doctor Transfers)                        ║
 * ║   • تسويات الأطباء (Doctor Settlements)                       ║
 * ║   • حركات الخزينة (Treasury Transactions)                     ║
 * ║                                                               ║
 * ║  المنطق المالي هنا حساس جداً ومرتبط بالقيود المحاسبية         ║
 * ║  خطأ بسيط = اختلال في أرصدة الأطباء والخزن                   ║
 * ║  لا تعدّل إلا بعد مراجعة كاملة للـ finance-storage.ts أولاً  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

import { db } from "../db";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import {
  doctorTransfers,
  doctorSettlements,
  doctorSettlementAllocations,
  treasuries,
  userTreasuries,
  treasuryTransactions,
  auditLog,
  type DoctorTransfer,
  type DoctorSettlement,
  type DoctorSettlementAllocation,
  type Treasury,
  type InsertTreasury,
  type TreasuryTransaction,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {

  async getDoctorTransfers(this: DatabaseStorage, invoiceId: string): Promise<DoctorTransfer[]> {
    return db.select().from(doctorTransfers)
      .where(eq(doctorTransfers.invoiceId, invoiceId))
      .orderBy(asc(doctorTransfers.createdAt));
  },

  async transferToDoctorPayable(this: DatabaseStorage, params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer> {
    return await db.transaction(async (tx) => {
      const invRes = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${params.invoiceId} FOR UPDATE`);
      const inv = invRes.rows[0] as any;
      if (!inv) throw Object.assign(new Error("الفاتورة غير موجودة"), { statusCode: 404 });
      if (inv.status !== "finalized") throw Object.assign(new Error("يمكن التحويل فقط للفواتير المعتمدة"), { statusCode: 400 });

      const already = await tx.execute(sql`SELECT COALESCE(SUM(amount), 0) AS total FROM doctor_transfers WHERE invoice_id = ${params.invoiceId}`);
      const alreadyAmount = parseFloat((already.rows[0] as any)?.total ?? "0");
      const netAmount = parseFloat(inv.net_amount ?? "0");
      const requested = parseFloat(params.amount);
      const remaining = netAmount - alreadyAmount;

      if (requested <= 0) throw Object.assign(new Error("يجب أن يكون المبلغ أكبر من الصفر"), { statusCode: 400 });
      if (requested > remaining + 0.001) throw Object.assign(new Error(`المبلغ يتجاوز المتبقي القابل للتحويل (${remaining.toFixed(2)})`), { statusCode: 400 });

      const existing = await tx.execute(sql`SELECT id FROM doctor_transfers WHERE client_request_id = ${params.clientRequestId}`);
      if ((existing.rows as any[]).length > 0) {
        const [row] = await tx.select().from(doctorTransfers).where(eq(doctorTransfers.clientRequestId, params.clientRequestId));
        return row;
      }

      const [transfer] = await tx.insert(doctorTransfers).values({
        invoiceId: params.invoiceId,
        doctorName: params.doctorName,
        amount: params.amount,
        clientRequestId: params.clientRequestId,
        notes: params.notes ?? null,
      }).returning();

      await tx.insert(auditLog).values({
        tableName: "doctor_transfers",
        recordId: transfer.id,
        action: "create",
        newValues: JSON.stringify({ invoiceId: params.invoiceId, doctorName: params.doctorName, amount: params.amount }),
      });

      return transfer;
    });
  },

  async getDoctorSettlements(this: DatabaseStorage, params?: { doctorName?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{ data: (DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[]; total: number; page: number; pageSize: number }> {
    const page     = Math.max(1, params?.page     ?? 1);
    const pageSize = Math.min(200, Math.max(1, params?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const whereParts: string[] = [];
    if (params?.doctorName) whereParts.push(`ds.doctor_name = '${params.doctorName.replace(/'/g, "''")}'`);
    if (params?.dateFrom)   whereParts.push(`ds.payment_date >= '${params.dateFrom}'`);
    if (params?.dateTo)     whereParts.push(`ds.payment_date <= '${params.dateTo}'`);
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await db.execute(sql`
      SELECT
        ds.id,
        ds.doctor_name,
        ds.payment_date,
        ds.amount,
        ds.payment_method,
        ds.settlement_uuid,
        ds.notes,
        ds.gl_posted,
        ds.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',           dsa.id,
              'settlementId', dsa.settlement_id,
              'transferId',   dsa.transfer_id,
              'amount',       dsa.amount::text,
              'createdAt',    dsa.created_at
            ) ORDER BY dsa.created_at ASC
          ) FILTER (WHERE dsa.id IS NOT NULL),
          '[]'::json
        ) AS allocations,
        COUNT(*) OVER() AS total_count
      FROM doctor_settlements ds
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.settlement_id = ds.id
      ${sql.raw(whereClause)}
      GROUP BY ds.id
      ORDER BY ds.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const rawRows = result.rows as any[];
    const total   = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const data    = rawRows.map(row => ({
      id:              row.id,
      doctorName:      row.doctor_name,
      paymentDate:     row.payment_date,
      amount:          row.amount,
      paymentMethod:   row.payment_method,
      settlementUuid:  row.settlement_uuid,
      notes:           row.notes,
      glPosted:        row.gl_posted,
      createdAt:       row.created_at,
      allocations:     Array.isArray(row.allocations) ? row.allocations : [],
    })) as (DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[];

    return { data, total, page, pageSize };
  },

  async getDoctorOutstandingTransfers(this: DatabaseStorage, doctorName: string): Promise<(DoctorTransfer & { settled: string; remaining: string })[]> {
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.client_request_id AS "clientRequestId",
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        dt.created_at        AS "createdAt",
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      WHERE dt.doctor_name = ${doctorName}
      GROUP BY dt.id
      HAVING (dt.amount - COALESCE(SUM(dsa.amount), 0)) > 0.001
      ORDER BY dt.transferred_at ASC
    `);
    return res.rows as any[];
  },

  async createDoctorSettlement(this: DatabaseStorage, params: {
    doctorName: string;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    settlementUuid: string;
    notes?: string;
    allocations?: { transferId: string; amount: string }[];
  }): Promise<DoctorSettlement & { allocations: DoctorSettlementAllocation[] }> {

    let settlementId: string | null = null;
    let glSourceId: string | null = null;

    await db.transaction(async (tx) => {
      const existingRes = await tx.execute(sql`SELECT id FROM doctor_settlements WHERE settlement_uuid = ${params.settlementUuid}`);
      if ((existingRes.rows as any[]).length > 0) {
        settlementId = (existingRes.rows[0] as any).id;
        return;
      }

      const paymentTotal = parseMoney(params.amount);
      if (paymentTotal <= 0) throw Object.assign(new Error("المبلغ يجب أن يكون أكبر من الصفر"), { statusCode: 400 });

      let resolvedAllocations: { transferId: string; amount: number }[];

      if (params.allocations && params.allocations.length > 0) {
        resolvedAllocations = params.allocations.map(a => ({ transferId: a.transferId, amount: parseMoney(a.amount) }));
      } else {
        const outstanding = await tx.execute(sql`
          SELECT dt.id, dt.amount - COALESCE(SUM(dsa.amount), 0) AS remaining
          FROM doctor_transfers dt
          LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
          WHERE dt.doctor_name = ${params.doctorName}
          GROUP BY dt.id, dt.amount
          HAVING dt.amount - COALESCE(SUM(dsa.amount), 0) > 0.001
          ORDER BY dt.transferred_at ASC
        `);
        resolvedAllocations = [];
        let leftover = paymentTotal;
        for (const row of outstanding.rows as any[]) {
          if (leftover <= 0.001) break;
          const rem = parseMoney(String(row.remaining));
          const alloc = Math.min(rem, leftover);
          resolvedAllocations.push({ transferId: row.id, amount: alloc });
          leftover = parseMoney(roundMoney(leftover - alloc));
        }
        if (leftover > 0.001) throw Object.assign(new Error(`مبلغ التسوية (${paymentTotal.toFixed(2)}) يتجاوز المستحقات المتبقية`), { statusCode: 400 });
      }

      const sumAlloc = resolvedAllocations.reduce((s, a) => s + a.amount, 0);
      const delta = parseMoney(roundMoney(paymentTotal - sumAlloc));
      if (Math.abs(delta) > 0.1) throw Object.assign(new Error("مجموع التخصيصات لا يساوي مبلغ التسوية"), { statusCode: 400 });
      if (resolvedAllocations.length > 0 && Math.abs(delta) > 0) {
        resolvedAllocations[resolvedAllocations.length - 1].amount = parseMoney(roundMoney(resolvedAllocations[resolvedAllocations.length - 1].amount + delta));
      }

      const [settlement] = await tx.insert(doctorSettlements).values({
        doctorName: params.doctorName,
        paymentDate: params.paymentDate,
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        settlementUuid: params.settlementUuid,
        notes: params.notes ?? null,
      }).returning();

      settlementId = settlement.id;
      glSourceId = settlement.id;

      for (const alloc of resolvedAllocations) {
        await tx.insert(doctorSettlementAllocations).values({
          settlementId: settlement.id,
          transferId: alloc.transferId,
          amount: roundMoney(alloc.amount),
        });
      }

      await tx.insert(auditLog).values({
        tableName: "doctor_settlements",
        recordId: settlement.id,
        action: "create",
        newValues: JSON.stringify({ doctorName: params.doctorName, amount: params.amount, paymentMethod: params.paymentMethod, allocationCount: resolvedAllocations.length }),
      });
    });

    if (glSourceId) {
      try {
        await this.generateJournalEntry({
          sourceType: "doctor_payable_settlement",
          sourceDocumentId: glSourceId,
          reference: `SETTLE-${glSourceId.slice(0, 8).toUpperCase()}`,
          description: `تسوية مستحقات الطبيب: ${params.doctorName}`,
          entryDate: params.paymentDate,
          lines: [{ lineType: "doctor_payable_settlement", amount: params.amount }],
        });
        if (glSourceId) {
          await db.update(doctorSettlements)
            .set({ glPosted: true })
            .where(eq(doctorSettlements.id, glSourceId));
        }
      } catch (e) {
        console.log(`[DOCTOR_SETTLEMENT] GL skipped for ${glSourceId}: ${(e as Error).message}`);
      }
    }

    console.log(`[DOCTOR_SETTLEMENT] settlement=${settlementId} doctor=${params.doctorName} amount=${params.amount}`);

    const [final] = await db.select().from(doctorSettlements).where(eq(doctorSettlements.id, settlementId!));
    const allocs = await db.select().from(doctorSettlementAllocations)
      .where(eq(doctorSettlementAllocations.settlementId, settlementId!))
      .orderBy(asc(doctorSettlementAllocations.createdAt));
    return { ...final, allocations: allocs };
  },

  async getTreasuriesSummary(this: DatabaseStorage): Promise<(Treasury & {
    glAccountCode: string; glAccountName: string;
    openingBalance: string; totalIn: string; totalOut: string; balance: string; hasPassword: boolean;
  })[]> {
    const rows = await db.execute(sql`
      SELECT
        t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
        a.code                AS gl_account_code,
        a.name                AS gl_account_name,
        COALESCE(a.opening_balance, 0) AS opening_balance,
        COALESCE(SUM(CASE WHEN tt.type = 'in'  THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN tt.type = 'out' THEN tt.amount::numeric ELSE 0 END), 0) AS total_out,
        CASE WHEN dp.gl_account_id IS NOT NULL THEN true ELSE false END AS has_password
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      LEFT JOIN treasury_transactions tt ON tt.treasury_id = t.id
      LEFT JOIN drawer_passwords dp ON dp.gl_account_id = t.gl_account_id
      GROUP BY t.id, a.code, a.name, a.opening_balance, dp.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => {
      const ob  = parseFloat(r.opening_balance)  || 0;
      const tin = parseFloat(r.total_in)  || 0;
      const tout = parseFloat(r.total_out) || 0;
      return {
        id: r.id, name: r.name, glAccountId: r.gl_account_id,
        isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
        glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
        openingBalance: ob.toFixed(2),
        totalIn:   tin.toFixed(2),
        totalOut:  tout.toFixed(2),
        balance:   (ob + tin - tout).toFixed(2),
        hasPassword: r.has_password,
      };
    });
  },

  async getTreasuries(this: DatabaseStorage): Promise<(Treasury & { glAccountCode: string; glAccountName: string })[]> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    }));
  },

  async getTreasury(this: DatabaseStorage, id: string): Promise<Treasury | undefined> {
    const [row] = await db.select().from(treasuries).where(eq(treasuries.id, id));
    return row;
  },

  async createTreasury(this: DatabaseStorage, data: InsertTreasury): Promise<Treasury> {
    const [row] = await db.insert(treasuries).values(data).returning();
    return row;
  },

  async updateTreasury(this: DatabaseStorage, id: string, data: Partial<InsertTreasury>): Promise<Treasury> {
    const [row] = await db.update(treasuries).set(data).where(eq(treasuries.id, id)).returning();
    if (!row) throw new Error("الخزنة غير موجودة");
    return row;
  },

  async deleteTreasury(this: DatabaseStorage, id: string): Promise<boolean> {
    const res = await db.delete(treasuries).where(eq(treasuries.id, id)).returning();
    return res.length > 0;
  },

  async getUserTreasury(this: DatabaseStorage, userId: string): Promise<(Treasury & { glAccountCode: string; glAccountName: string }) | null> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN accounts a ON a.id = t.gl_account_id
      WHERE ut.user_id = ${userId}
    `);
    if (!rows.rows.length) return null;
    const r = rows.rows[0] as any;
    return {
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    };
  },

  async getAllUserTreasuries(this: DatabaseStorage): Promise<{ userId: string; treasuryId: string; treasuryName: string; userName: string }[]> {
    const rows = await db.execute(sql`
      SELECT ut.user_id, ut.treasury_id, t.name AS treasury_name, u.full_name AS user_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN users u ON u.id = ut.user_id
      ORDER BY u.full_name
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.user_id, treasuryId: r.treasury_id,
      treasuryName: r.treasury_name, userName: r.user_name,
    }));
  },

  async assignUserTreasury(this: DatabaseStorage, userId: string, treasuryId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO user_treasuries (user_id, treasury_id)
      VALUES (${userId}, ${treasuryId})
      ON CONFLICT (user_id) DO UPDATE SET treasury_id = ${treasuryId}, created_at = NOW()
    `);
  },

  async removeUserTreasury(this: DatabaseStorage, userId: string): Promise<void> {
    await db.delete(userTreasuries).where(eq(userTreasuries.userId, userId));
  },

  async getTreasuryStatement(this: DatabaseStorage, params: { treasuryId: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{ transactions: TreasuryTransaction[]; total: number; page: number; pageSize: number; totalIn: string; totalOut: string; balance: string; pageOpeningBalance: number }> {
    const page     = Math.max(1, params.page     ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 100));
    const offset   = (page - 1) * pageSize;

    const dateCondFrom = params.dateFrom ? sql`AND tt.transaction_date >= ${params.dateFrom}` : sql``;
    const dateCondTo   = params.dateTo   ? sql`AND tt.transaction_date <= ${params.dateTo}`   : sql``;

    const aggResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN tt.type = 'in'  THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN tt.type != 'in' THEN tt.amount::numeric ELSE 0 END), 0) AS total_out
      FROM treasury_transactions tt
      WHERE tt.treasury_id = ${params.treasuryId}
        ${dateCondFrom}
        ${dateCondTo}
    `);
    const agg = aggResult.rows[0] as any;
    const totalIn  = parseFloat(agg?.total_in  ?? "0");
    const totalOut = parseFloat(agg?.total_out ?? "0");

    const openingResult = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount::numeric ELSE -amount::numeric END), 0) AS opening
      FROM (
        SELECT type, amount
        FROM treasury_transactions
        WHERE treasury_id = ${params.treasuryId}
          ${dateCondFrom}
          ${dateCondTo}
        ORDER BY transaction_date ASC, created_at ASC
        LIMIT ${offset}
      ) pre
    `);
    const pageOpeningBalance = parseFloat((openingResult.rows[0] as any)?.opening ?? "0");

    const listResult = await db.execute(sql`
      SELECT id, treasury_id, type, amount, description, source_type, source_id, transaction_date, created_at
      FROM treasury_transactions tt
      WHERE tt.treasury_id = ${params.treasuryId}
        ${dateCondFrom}
        ${dateCondTo}
      ORDER BY tt.transaction_date ASC, tt.created_at ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM treasury_transactions tt
      WHERE tt.treasury_id = ${params.treasuryId}
        ${dateCondFrom}
        ${dateCondTo}
    `);
    const total = Number((countResult.rows[0] as any)?.total ?? 0);

    return {
      transactions:        listResult.rows as TreasuryTransaction[],
      total,
      page,
      pageSize,
      totalIn:             totalIn.toFixed(2),
      totalOut:            totalOut.toFixed(2),
      balance:             (totalIn - totalOut).toFixed(2),
      pageOpeningBalance,
    };
  },

  async createTreasuryTransactionsForInvoice(this: DatabaseStorage, invoiceId: string, finalizationDate: string): Promise<void> {
    const payments = await db.execute(sql`
      SELECT p.id, p.amount, p.payment_method, p.treasury_id, p.notes, p.reference_number
      FROM patient_invoice_payments p
      WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL
    `);
    if (!payments.rows.length) return;
    const header = await db.execute(sql`
      SELECT h.invoice_number, pa.name AS patient_name
      FROM patient_invoice_headers h
      LEFT JOIN patients pa ON pa.id = h.patient_id
      WHERE h.id = ${invoiceId}
    `);
    const row = header.rows[0] as any;
    const invNum = row?.invoice_number ?? invoiceId;
    const patientName = row?.patient_name ?? "";
    for (const p of payments.rows as any[]) {
      const ref = p.reference_number ? `[${p.reference_number}] ` : "";
      const desc = `${ref}تحصيل فاتورة مريض رقم ${invNum}${patientName ? ` - ${patientName}` : ""}`;
      await db.execute(sql`
        INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
        VALUES (${p.treasury_id}, 'in', ${p.amount}, ${desc}, 'patient_invoice', ${p.id}, ${finalizationDate})
        ON CONFLICT (source_type, source_id, treasury_id) DO NOTHING
      `);
    }
  },
};

export default methods;
