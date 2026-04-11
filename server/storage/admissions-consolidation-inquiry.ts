import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const inquiryMethods = {

  async getPatientInquiry(
    this: DatabaseStorage,
    filters: {
      adminDeptFilter?: string | null;
      clinicId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      search?: string | null;
    },
    forcedDeptIds: string[] | null,
  ): Promise<{ rows: Record<string, unknown>[]; count: number; limit: number; hasMore: boolean }> {

    const LIMIT = 200;
    const esc = (s: string) => s.replace(/'/g, "''");

    let deptClause: string;
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    } else if (filters.adminDeptFilter) {
      deptClause = `AND pih.department_id = '${esc(filters.adminDeptFilter)}'`;
    } else {
      deptClause = "";
    }

    let clinicClause = "";
    if (filters.clinicId) {
      const safeClinic = esc(filters.clinicId);
      clinicClause = `AND EXISTS (
        SELECT 1 FROM clinic_appointments ca
        WHERE (
          (pih.patient_id IS NOT NULL AND ca.patient_id = pih.patient_id)
          OR (pih.patient_id IS NULL AND ca.patient_name = pih.patient_name)
        )
        AND ca.clinic_id = '${safeClinic}'
      )`;
    }

    let dateClause = "";
    if (filters.dateFrom) {
      dateClause += ` AND pih.invoice_date >= '${esc(filters.dateFrom)}'::date`;
    }
    if (filters.dateTo) {
      dateClause += ` AND pih.invoice_date <= '${esc(filters.dateTo)}'::date`;
    }

    let searchClause = "";
    if (filters.search?.trim()) {
      const term = `%${esc(filters.search.trim().replace(/%/g, "\\%"))}%`;
      searchClause = `AND (pih.patient_name ILIKE '${term}' OR pih.patient_phone ILIKE '${term}')`;
    }

    const result = await db.execute(sql.raw(`
      WITH filtered_invoices AS (
        SELECT
          pih.id,
          COALESCE(pih.patient_id, 'anon:' || pih.patient_name) AS uid,
          pih.patient_id,
          pih.patient_name,
          pih.patient_phone,
          pih.department_id,
          pih.invoice_date,
          pih.net_amount::numeric          AS net_amount,
          pih.paid_amount::numeric         AS paid_amount,
          (pih.net_amount - pih.paid_amount)::numeric AS outstanding
        FROM patient_invoice_headers pih
        WHERE pih.status != 'cancelled'
          ${deptClause}
          ${clinicClause}
          ${dateClause}
          ${searchClause}
      ),
      invoice_totals AS (
        SELECT
          uid,
          patient_id,
          patient_name,
          patient_phone,
          department_id,
          COUNT(id)          AS invoice_count,
          SUM(net_amount)    AS total_net,
          SUM(paid_amount)   AS total_paid,
          SUM(outstanding)   AS total_outstanding,
          MAX(invoice_date)  AS last_invoice_date
        FROM filtered_invoices
        GROUP BY uid, patient_id, patient_name, patient_phone, department_id
      ),
      line_totals AS (
        SELECT
          fi.uid,
          COALESCE(SUM(CASE WHEN pil.line_type = 'service'    AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS services_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'drug'       AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS drugs_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'consumable' AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS consumables_total
        FROM filtered_invoices fi
        JOIN patient_invoice_lines pil ON pil.header_id = fi.id
        GROUP BY fi.uid
      )
      SELECT
        it.uid,
        it.patient_id,
        p.patient_code,
        COALESCE(p.full_name, it.patient_name) AS patient_name,
        COALESCE(p.phone, it.patient_phone)    AS patient_phone,
        it.department_id,
        d.name_ar                              AS dept_name,
        it.invoice_count,
        COALESCE(lt.services_total,    0)      AS services_total,
        COALESCE(lt.drugs_total,       0)      AS drugs_total,
        COALESCE(lt.consumables_total, 0)      AS consumables_total,
        it.total_net,
        it.total_paid,
        it.total_outstanding,
        it.last_invoice_date
      FROM invoice_totals it
      LEFT JOIN patients    p  ON p.id  = it.patient_id
      LEFT JOIN departments d  ON d.id  = it.department_id
      LEFT JOIN line_totals lt ON lt.uid = it.uid
      ORDER BY it.last_invoice_date DESC NULLS LAST
      LIMIT ${LIMIT + 1}
    `));

    const all = result.rows as Record<string, unknown>[];
    const hasMore = all.length > LIMIT;
    const rows = hasMore ? all.slice(0, LIMIT) : all;

    return { rows, count: rows.length, limit: LIMIT, hasMore };
  },

  async getPatientInquiryLines(
    this: DatabaseStorage,
    patientKey: { patientId?: string | null; patientName?: string | null },
    forcedDeptIds: string[] | null,
    lineType?: string | null,
  ): Promise<Record<string, unknown>[]> {

    const esc = (s: string) => s.replace(/'/g, "''");

    let patientClause: string;
    if (patientKey.patientId) {
      patientClause = `pih.patient_id = '${esc(patientKey.patientId)}'`;
    } else if (patientKey.patientName) {
      patientClause = `(pih.patient_id IS NULL AND pih.patient_name = '${esc(patientKey.patientName)}')`;
    } else {
      return [];
    }

    let deptClause = "";
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    }

    let lineTypeClause = "";
    if (lineType && ["service", "drug", "consumable"].includes(lineType)) {
      lineTypeClause = `AND pil.line_type = '${lineType}'`;
    }

    const result = await db.execute(sql.raw(`
      SELECT
        pil.id               AS line_id,
        pil.line_type,
        pil.description,
        pil.quantity,
        pil.unit_price,
        pil.total_price,
        pih.invoice_number,
        pih.invoice_date,
        pih.status           AS invoice_status,
        pih.department_id,
        d.name_ar            AS dept_name
      FROM patient_invoice_lines pil
      JOIN patient_invoice_headers pih ON pih.id = pil.header_id
      LEFT JOIN departments d ON d.id = pih.department_id
      WHERE pih.status != 'cancelled'
        AND NOT pil.is_void
        AND ${patientClause}
        ${deptClause}
        ${lineTypeClause}
      ORDER BY pih.invoice_date DESC, pil.created_at DESC
    `));

    return result.rows as Record<string, unknown>[];
  },

};

export default inquiryMethods;
