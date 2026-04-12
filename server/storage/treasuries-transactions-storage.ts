import { db } from "../db";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import {
  treasuries,
  treasuryTransactions,
  type Treasury,
  type TreasuryTransaction,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const treasuriesTransactionsMethods = {

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
        COALESCE(SUM(CASE WHEN tt.type IN ('in', 'receipt') THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(
          SUM(CASE WHEN tt.type IN ('out', 'cash_out') THEN tt.amount::numeric ELSE 0 END)
          + SUM(CASE WHEN tt.type = 'refund' THEN ABS(tt.amount::numeric) ELSE 0 END)
        , 0) AS total_out,
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

  async getTreasuryStatement(this: DatabaseStorage, params: { treasuryId: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{ transactions: TreasuryTransaction[]; total: number; page: number; pageSize: number; totalIn: string; totalOut: string; balance: string; pageOpeningBalance: number }> {
    const page     = Math.max(1, params.page     ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 100));
    const offset   = (page - 1) * pageSize;

    const dateCondFrom = params.dateFrom ? sql`AND tt.transaction_date >= ${params.dateFrom}` : sql``;
    const dateCondTo   = params.dateTo   ? sql`AND tt.transaction_date <= ${params.dateTo}`   : sql``;

    const aggResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN tt.type IN ('in', 'receipt') THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(
          SUM(CASE WHEN tt.type IN ('out', 'cash_out') THEN tt.amount::numeric ELSE 0 END)
          + SUM(CASE WHEN tt.type = 'refund' THEN ABS(tt.amount::numeric) ELSE 0 END)
        , 0) AS total_out
      FROM treasury_transactions tt
      WHERE tt.treasury_id = ${params.treasuryId}
        ${dateCondFrom}
        ${dateCondTo}
    `);
    const agg = aggResult.rows[0] as any;
    const totalIn  = parseFloat(agg?.total_in  ?? "0");
    const totalOut = parseFloat(agg?.total_out ?? "0");

    const openingResult = await db.execute(sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN type IN ('in', 'receipt')         THEN  amount::numeric
          WHEN type IN ('out', 'cash_out')        THEN -amount::numeric
          WHEN type = 'refund'                    THEN  amount::numeric  -- already negative
          ELSE 0
        END
      ), 0) AS opening
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
      if (parseFloat(p.amount) <= 0) {
        console.warn(`[Treasury] skipping zero-value payment row id=${p.id} amount=${p.amount} for invoice=${invoiceId}`);
        continue;
      }
      const ref = p.reference_number ? `[${p.reference_number}] ` : "";
      const desc = `${ref}تحصيل فاتورة مريض رقم ${invNum}${patientName ? ` - ${patientName}` : ""}`;
      await db.execute(sql`
        INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
        VALUES (${p.treasury_id}, 'in', ${p.amount}, ${desc}, 'patient_invoice_payment', ${p.id}, ${finalizationDate})
        ON CONFLICT (source_type, source_id, treasury_id)
          WHERE source_type IS NOT NULL AND source_id IS NOT NULL
        DO NOTHING
      `);
    }
  },
};

export default treasuriesTransactionsMethods;
