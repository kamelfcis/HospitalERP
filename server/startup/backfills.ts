/**
 * server/startup/backfills.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * عمليات backfill البيانات عند بدء التشغيل
 *
 *  • patient_visits for existing admissions
 *  • encounters for admissions with visits
 *  • normalized_full_name for patients
 *  • inventory_lots expiry_month/expiry_year from expiry_date
 *  • doctor_id on patient invoice headers and lines
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

type LogFn = (msg: string, source?: string) => void;

export async function runBackfills(log: LogFn): Promise<void> {
  // ── Patient visits for existing admissions ────────────────────────────────
  try {
    const unlinkedAdmissions = await db.execute(sql`
      SELECT a.id, a.patient_id, a.department_id, a.created_at
      FROM admissions a
      WHERE a.patient_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM patient_visits pv WHERE pv.admission_id = a.id
        )
      ORDER BY a.created_at
    `);
    const rows = unlinkedAdmissions.rows as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      let backfillCount = 0;
      for (const adm of rows) {
        const cntRes = await db.execute(sql`SELECT COUNT(*) AS cnt FROM patient_visits`);
        const seq = parseInt((cntRes.rows[0] as Record<string, unknown>)?.cnt as string ?? "0") + 1;
        const visitNumber = `VIS-${String(seq).padStart(6, "0")}`;
        const pvResult = await db.execute(sql`
          INSERT INTO patient_visits (id, visit_number, patient_id, visit_type, department_id, admission_id, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${visitNumber}, ${adm.patient_id || null}, 'inpatient', ${adm.department_id || null}, ${adm.id}, 'open', NOW(), NOW())
          RETURNING id
        `);
        const visitId = (pvResult.rows[0] as Record<string, unknown>)?.id as string;
        if (visitId) {
          await db.execute(sql`
            UPDATE patient_invoice_headers
            SET visit_id = ${visitId}, updated_at = NOW()
            WHERE admission_id = ${adm.id} AND is_consolidated = true AND visit_id IS NULL
          `);
          backfillCount++;
        }
      }
      log(`[STARTUP] patient_visits backfill: created ${backfillCount} inpatient visit(s) for existing admissions`);
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] patient_visits backfill error");
  }

  // ── Encounters for existing admissions with visits ────────────────────────
  try {
    const admissionsWithVisits = await db.execute(sql`
      SELECT a.id AS admission_id, a.department_id,
             pv.id AS visit_id, a.created_at
      FROM admissions a
      JOIN patient_visits pv ON pv.admission_id = a.id
      WHERE NOT EXISTS (
        SELECT 1 FROM encounters e WHERE e.admission_id = a.id
      )
    `);
    const encRows = admissionsWithVisits.rows as Array<Record<string, unknown>>;
    if (encRows.length > 0) {
      let encCount = 0;
      for (const row of encRows) {
        await db.execute(sql`
          INSERT INTO encounters (visit_id, admission_id, department_id, encounter_type, status, started_at, created_by)
          VALUES (${row.visit_id}, ${row.admission_id}, ${row.department_id || null}, 'ward', 'active',
                  ${row.created_at || new Date()}, NULL)
        `);
        encCount++;
      }
      log(`[STARTUP] encounters backfill: created ${encCount} encounter(s) for existing admissions`);
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] encounters backfill error");
  }

  // ── Normalized full name for patients ─────────────────────────────────────
  try {
    const normFix = await db.execute(sql`
      UPDATE patients
      SET normalized_full_name = LOWER(TRIM(
        REGEXP_REPLACE(
          TRANSLATE(
            REPLACE(REPLACE(REPLACE(REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(full_name, E'[\\u064B-\\u065F]', '', 'g'),
                'ـ', '', 'g'),
              'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'),
            'ى', 'ي'),
          '\\s+', ' ', 'g')
      ))
      WHERE full_name IS NOT NULL
        AND (normalized_full_name IS NULL OR normalized_full_name = '')
    `);
    const normFixed = (normFix as any).rowCount ?? 0;
    if (normFixed > 0) log(`[STARTUP] patient normalized_full_name backfill: ${normFixed} row(s) fixed`);
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] patient normalization backfill error");
  }

  // ── Inventory lots expiry_month/expiry_year from expiry_date ──────────────
  try {
    const fix = await db.execute(sql`
      UPDATE inventory_lots
      SET    expiry_month = EXTRACT(MONTH FROM expiry_date)::int,
             expiry_year  = EXTRACT(YEAR  FROM expiry_date)::int,
             updated_at   = NOW()
      WHERE  expiry_date IS NOT NULL
        AND  (expiry_month IS NULL OR expiry_year IS NULL)
    `);
    const fixed = (fix as any).rowCount ?? 0;
    if (fixed > 0) log(`[STARTUP] inventory_lots expiry backfill: ${fixed} row(s) fixed`);
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] expiry backfill error");
  }

  // ── Doctor ID on patient invoice headers and lines ────────────────────────
  try {
    const hdrFix = await db.execute(sql`
      UPDATE patient_invoice_headers h
      SET    doctor_id  = d.id,
             updated_at = NOW()
      FROM   doctors d
      WHERE  h.doctor_id IS NULL
        AND  h.doctor_name IS NOT NULL
        AND  h.doctor_name != ''
        AND  LOWER(TRIM(h.doctor_name)) = LOWER(TRIM(d.name))
    `);
    const hdrFixed = (hdrFix as any).rowCount ?? 0;

    const lineFix = await db.execute(sql`
      UPDATE patient_invoice_lines l
      SET    doctor_id = d.id
      FROM   doctors d
      WHERE  l.doctor_id IS NULL
        AND  l.doctor_name IS NOT NULL
        AND  l.doctor_name != ''
        AND  LOWER(TRIM(l.doctor_name)) = LOWER(TRIM(d.name))
    `);
    const lineFixed = (lineFix as any).rowCount ?? 0;

    if (hdrFixed > 0 || lineFixed > 0) {
      log(`[STARTUP] doctor_id backfill: ${hdrFixed} header(s), ${lineFixed} line(s) linked`);
    }

    const unmatchedRes = await db.execute(sql`
      SELECT DISTINCT doctor_name
      FROM (
        SELECT doctor_name FROM patient_invoice_headers
        WHERE doctor_id IS NULL AND doctor_name IS NOT NULL AND doctor_name != ''
        UNION
        SELECT doctor_name FROM patient_invoice_lines
        WHERE doctor_id IS NULL AND doctor_name IS NOT NULL AND doctor_name != ''
      ) u
    `);
    const unmatchedNames = (unmatchedRes.rows || []).map((r: any) => r.doctor_name);
    if (unmatchedNames.length > 0) {
      logger.warn({ unmatchedNames, count: unmatchedNames.length }, "[STARTUP] doctor_id backfill: unmatched doctor names (no matching doctor record)");
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[STARTUP] doctor_id backfill error");
  }
}
