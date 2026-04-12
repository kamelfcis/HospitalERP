import { db } from "../db";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  doctorTransfers,
  doctorSettlements,
  doctorSettlementAllocations,
  auditLog,
  type DoctorTransfer,
  type DoctorSettlement,
  type DoctorSettlementAllocation,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";
import { generateDoctorTransferGL } from "../lib/doctor-transfer-gl";
import { generateDoctorSettlementGL } from "../lib/doctor-settlement-gl";

const methods = {

  async getDoctorTransfers(this: DatabaseStorage, invoiceId: string): Promise<DoctorTransfer[]> {
    return db.select().from(doctorTransfers)
      .where(eq(doctorTransfers.invoiceId, invoiceId))
      .orderBy(asc(doctorTransfers.createdAt));
  },

  async transferToDoctorPayable(this: DatabaseStorage, params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer> {
    let glParams: { transferId: string; invoiceDate: string; invoiceNumber: string; departmentId: string | null } | null = null;

    const transfer = await db.transaction(async (tx) => {
      const invRes = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${params.invoiceId} FOR UPDATE`);
      const inv = invRes.rows[0] as any;
      if (!inv) throw Object.assign(new Error("الفاتورة غير موجودة"), { statusCode: 404 });
      if (inv.is_final_closed) throw Object.assign(new Error("الفاتورة مغلقة نهائياً — لا يمكن التحويل"), { statusCode: 400 });

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

      const [row] = await tx.insert(doctorTransfers).values({
        invoiceId:       params.invoiceId,
        doctorName:      params.doctorName,
        amount:          params.amount,
        clientRequestId: params.clientRequestId,
        notes:           params.notes ?? null,
      }).returning();

      await tx.insert(auditLog).values({
        tableName: "doctor_transfers",
        recordId:  row.id,
        action:    "create",
        newValues: JSON.stringify({ invoiceId: params.invoiceId, doctorName: params.doctorName, amount: params.amount }),
      });

      // نحتفظ بمعلومات الفاتورة لتوليد القيد خارج الـ transaction
      glParams = {
        transferId:    row.id,
        invoiceDate:   String(inv.invoice_date ?? new Date().toISOString().split("T")[0]),
        invoiceNumber: String(inv.invoice_number ?? ""),
        departmentId:  inv.department_id ? String(inv.department_id) : null,
      };

      return row;
    });

    // ── توليد قيد التحويل — fire-and-forget ──────────────────────────────────
    if (glParams) {
      const p = glParams as { transferId: string; invoiceDate: string; invoiceNumber: string; departmentId: string | null };
      generateDoctorTransferGL({
        transferId:    p.transferId,
        invoiceId:     params.invoiceId,
        doctorName:    params.doctorName,
        amount:        params.amount,
        invoiceDate:   p.invoiceDate,
        invoiceNumber: p.invoiceNumber,
        departmentId:  p.departmentId,
      }).catch(err => logger.warn({ err: err.message, transferId: p.transferId }, "[DoctorTransferGL] fire-and-forget error"));
    }

    return transfer;
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

  async getDoctorOutstandingTransfers(this: DatabaseStorage, doctorName: string): Promise<(DoctorTransfer & { settled: string; remaining: string; invoiceNumber: string; patientName: string })[]> {
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id          AS "invoiceId",
        dt.doctor_name         AS "doctorName",
        dt.amount::text        AS amount,
        dt.client_request_id   AS "clientRequestId",
        dt.transferred_at      AS "transferredAt",
        dt.notes,
        dt.created_at          AS "createdAt",
        COALESCE(SUM(dsa.amount), 0)::text               AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining,
        COALESCE(pih.invoice_number, '')                 AS "invoiceNumber",
        COALESCE(pih.patient_name,   '')                 AS "patientName"
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      LEFT JOIN patient_invoice_headers pih       ON pih.id = dt.invoice_id
      WHERE dt.doctor_name = ${doctorName}
      GROUP BY dt.id, pih.invoice_number, pih.patient_name
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
    treasuryId?: string;
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

    // توليد قيد التسوية — fire-and-forget إذا كانت خزنة محددة
    if (glSourceId && params.treasuryId) {
      generateDoctorSettlementGL({
        settlementId: glSourceId,
        doctorName:   params.doctorName,
        amount:       params.amount,
        paymentDate:  params.paymentDate,
        treasuryId:   params.treasuryId,
      }).catch(err =>
        logger.warn({ err: err.message, settlementId: glSourceId }, "[DoctorSettlementGL] fire-and-forget error"),
      );
    }

    logger.info({ settlementId, doctorName: params.doctorName, amount: params.amount }, "[DOCTOR_SETTLEMENT] settlement completed");

    const [final] = await db.select().from(doctorSettlements).where(eq(doctorSettlements.id, settlementId!));
    const allocs = await db.select().from(doctorSettlementAllocations)
      .where(eq(doctorSettlementAllocations.settlementId, settlementId!))
      .orderBy(asc(doctorSettlementAllocations.createdAt));
    return { ...final, allocations: allocs };
  },
};

export default methods;
