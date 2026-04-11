import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptIds?: string[]; statusFilter?: string; page?: number; pageSize?: number }): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    const page     = Math.max(1, filters?.page     ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);

    let effectiveDateFrom = filters?.dateFrom;
    let effectiveDateTo   = filters?.dateTo;
    if (!hasDateFilter) {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      effectiveDateFrom = d90.toISOString().slice(0, 10);
    }

    const rptConds: string[] = ["r.invoice_count > 0"];
    if (effectiveDateFrom) rptConds.push(`r.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   rptConds.push(`r.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      rptConds.push(`r.department_id IN (${ids})`);
    }
    if (filters?.statusFilter === "draft")        rptConds.push(`r.latest_invoice_status = 'draft'`);
    if (filters?.statusFilter === "finalized")    rptConds.push(`r.latest_invoice_status = 'finalized' AND r.is_any_final_closed = false`);
    if (filters?.statusFilter === "final_closed") rptConds.push(`r.is_any_final_closed = true`);
    const rptFilter = rptConds.join(" AND ");

    const liRptConds: string[] = ["r2.invoice_count > 0"];
    if (effectiveDateFrom) liRptConds.push(`r2.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   liRptConds.push(`r2.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      liRptConds.push(`r2.department_id IN (${ids})`);
    }
    if (filters?.statusFilter === "draft")        liRptConds.push(`r2.latest_invoice_status = 'draft'`);
    if (filters?.statusFilter === "finalized")    liRptConds.push(`r2.latest_invoice_status = 'finalized' AND r2.is_any_final_closed = false`);
    if (filters?.statusFilter === "final_closed") liRptConds.push(`r2.is_any_final_closed = true`);
    const liRptFilter = liRptConds.join(" AND ");

    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map((t: string) => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR p.national_id ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM rpt_patient_visit_summary r3` +
            ` WHERE r3.patient_name = p.full_name` +
            ` AND r3.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    const result = await db.execute(sql`
      SELECT
        p.id,
        p.patient_code,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(SUM(r.service_revenue),    0)   AS services_total,
        COALESCE(SUM(r.drug_revenue),       0)   AS drugs_total,
        COALESCE(SUM(r.consumable_revenue), 0)   AS consumables_total,
        COALESCE(SUM(r.or_room_total),      0)   AS or_room_total,
        COALESCE(SUM(r.stay_revenue),       0)   AS stay_total,
        COALESCE(SUM(r.equipment_revenue),  0)   AS equipment_total,
        COALESCE(SUM(r.gas_revenue),        0)   AS gas_total,
        COALESCE(SUM(r.net_amount),         0)   AS grand_total,
        COALESCE(SUM(r.total_paid),         0)   AS paid_total,
        COALESCE(SUM(r.transferred_total),  0)   AS transferred_total,
        COALESCE(SUM(r.company_share_total),0)   AS company_share_total,
        COALESCE(SUM(r.patient_share_total),0)   AS patient_share_total,
        COALESCE(SUM(r.outstanding_balance),0)   AS outstanding_total,
        li.latest_invoice_id,
        li.latest_invoice_number,
        li.latest_invoice_status,
        li.latest_doctor_name,
        li.latest_patient_type,
        li.latest_is_final_closed,
        COUNT(*) OVER()                          AS total_count
      FROM patients p
      JOIN rpt_patient_visit_summary r ON r.patient_name = p.full_name
      LEFT JOIN (
        SELECT DISTINCT ON (r2.patient_name)
          r2.patient_name,
          r2.latest_invoice_id,
          r2.latest_invoice_number,
          r2.latest_invoice_status,
          r2.latest_doctor_name,
          r2.patient_type                        AS latest_patient_type,
          r2.is_any_final_closed                 AS latest_is_final_closed
        FROM rpt_patient_visit_summary r2
        WHERE ${sql.raw(liRptFilter)}
        ORDER BY r2.patient_name,
                 r2.latest_invoice_created_at DESC NULLS LAST,
                 r2.latest_invoice_id DESC
      ) li ON li.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
        AND ${sql.raw(rptFilter)}
      GROUP BY p.id, p.patient_code, p.full_name, p.phone, p.national_id, p.age, p.created_at,
               li.latest_invoice_id, li.latest_invoice_number,
               li.latest_invoice_status, li.latest_doctor_name,
               li.latest_patient_type, li.latest_is_final_closed
      ORDER BY p.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const rawRows = result.rows as any[];
    const total   = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const rows    = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });

    return { rows, total, page, pageSize };
  },

};

export default methods;
