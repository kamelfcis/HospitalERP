import { db } from "../db";
import { eq, sql, asc } from "drizzle-orm";
import {
  admissions,
  patientInvoiceHeaders,
  type Admission,
  type InsertAdmission,
  type PatientInvoiceHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getAdmissions(this: DatabaseStorage, filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string; page?: number; pageSize?: number }): Promise<any[] | { data: any[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const paginate = filters?.page !== undefined;
    const page     = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const conds: any[] = [];
    if (filters?.status) conds.push(sql`a.status = ${filters.status}`);

    if (filters?.dateFrom) {
      conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    } else if (paginate && !filters?.dateTo) {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      conds.push(sql`a.admission_date >= ${d30.toISOString().slice(0, 10)}`);
    }
    if (filters?.dateTo) conds.push(sql`a.admission_date <= ${filters.dateTo}`);

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    if (filters?.deptId) {
      conds.push(sql`(a.department_id = ${filters.deptId} OR (a.department_id IS NULL AND rpt.department_id = ${filters.deptId}))`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const limitClause = paginate
      ? sql`LIMIT ${pageSize} OFFSET ${offset}`
      : sql``;

    const countCol = paginate
      ? sql`, COUNT(*) OVER() AS total_count`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(rpt.net_amount,   0)                    AS total_net_amount,
        COALESCE(rpt.total_paid,   0)                    AS total_paid_amount,
        COALESCE(inv_latest.total_transferred, 0)        AS total_transferred_amount,
        inv_latest.latest_invoice_number                 AS latest_invoice_number,
        inv_latest.latest_invoice_id                     AS latest_invoice_id,
        inv_latest.latest_invoice_status                 AS latest_invoice_status,
        rpt.department_id                                AS latest_invoice_dept_id,
        rpt.department_name                              AS latest_invoice_dept_name,
        COALESCE(vg_cnt.visit_group_count, 0)            AS visit_group_count,
        pv.visit_number                                  AS visit_number
        ${countCol}
      FROM admissions a
      LEFT JOIN patient_visits pv ON pv.admission_id = a.id AND pv.visit_type = 'inpatient'
      LEFT JOIN rpt_patient_visit_summary rpt
        ON rpt.source_type = 'admission' AND rpt.source_id = a.id
      LEFT JOIN (
        SELECT
          pih.admission_id,
          (ARRAY_AGG(pih.invoice_number ORDER BY pih.created_at DESC))[1]  AS latest_invoice_number,
          (ARRAY_AGG(pih.id             ORDER BY pih.created_at DESC))[1]  AS latest_invoice_id,
          (ARRAY_AGG(pih.status         ORDER BY pih.created_at DESC))[1]  AS latest_invoice_status,
          COALESCE(SUM(dt_agg.dt_total), 0)                                AS total_transferred
        FROM patient_invoice_headers pih
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pih.id
        WHERE pih.status != 'cancelled'
          AND pih.admission_id IS NOT NULL
          AND pih.is_consolidated = false
        GROUP BY pih.admission_id
      ) inv_latest ON inv_latest.admission_id = a.id
      LEFT JOIN (
        SELECT
          admission_id,
          COUNT(DISTINCT visit_group_id) AS visit_group_count
        FROM patient_invoice_headers
        WHERE admission_id IS NOT NULL
          AND is_consolidated = false
          AND visit_group_id IS NOT NULL
        GROUP BY admission_id
      ) vg_cnt ON vg_cnt.admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
      ${limitClause}
    `);

    const rawRows = result.rows as any[];

    if (!paginate) {
      return rawRows.map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
      );
    }

    const total = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const data  = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });
    return { data, total, page, pageSize };
  },

  async getAdmission(this: DatabaseStorage, id: string): Promise<Admission | undefined> {
    const [a] = await db.select().from(admissions).where(eq(admissions.id, id));
    return a;
  },

  async createAdmission(this: DatabaseStorage, data: InsertAdmission): Promise<Admission> {
    let admissionNumber = data.admissionNumber;
    if (!admissionNumber) {
      const seqResult = await db.execute(sql`SELECT nextval('admission_number_seq') AS num`);
      admissionNumber = String((seqResult.rows[0] as any).num);
    }

    const [a] = await db.insert(admissions).values({
      ...data,
      admissionNumber,
    }).returning();
    return a;
  },

  async updateAdmission(this: DatabaseStorage, id: string, data: Partial<InsertAdmission>): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async dischargeAdmission(this: DatabaseStorage, id: string): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      status: "discharged",
      dischargeDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async getAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader[]> {
    return await db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.admissionId, admissionId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },

};

export default methods;
