import { db } from "../db";
import { sql } from "drizzle-orm";
import type { RptRefreshResult } from "./rpt-refresh-storage";

const methods = {

  async refreshPatientVisitClassification(): Promise<RptRefreshResult> {
    const start = Date.now();
    let totalUpserted = 0;

    const admResult = await db.execute(sql`
      INSERT INTO rpt_patient_visit_classification (
        source_type, source_id,
        patient_id, department_id,
        period_year, period_month,
        business_classification,
        total_amount, line_count,
        refreshed_at
      )
      SELECT
        'admission'                                                     AS source_type,
        a.id                                                            AS source_id,
        a.patient_id,
        dept_agg.latest_dept_id                                         AS department_id,
        EXTRACT(YEAR  FROM a.admission_date)::smallint                 AS period_year,
        EXTRACT(MONTH FROM a.admission_date)::smallint                 AS period_month,
        pil.business_classification,
        SUM(pil.total_price::numeric)                                   AS total_amount,
        COUNT(*)::integer                                               AS line_count,
        NOW()

      FROM admissions a

      LEFT JOIN (
        SELECT
          pih2.admission_id,
          (ARRAY_AGG(pih2.department_id ORDER BY pih2.created_at DESC))[1] AS latest_dept_id
        FROM patient_invoice_headers pih2
        WHERE pih2.status = 'finalized'
          AND pih2.admission_id IS NOT NULL
        GROUP BY pih2.admission_id
      ) dept_agg ON dept_agg.admission_id = a.id

      JOIN patient_invoice_headers pih
        ON pih.admission_id = a.id
       AND pih.status = 'finalized'

      JOIN patient_invoice_lines pil
        ON pil.header_id = pih.id
       AND NOT pil.is_void
       AND pil.business_classification IS NOT NULL

      GROUP BY
        a.id, a.patient_id, dept_agg.latest_dept_id,
        a.admission_date, pil.business_classification

      ON CONFLICT (source_type, source_id, business_classification) DO UPDATE SET
        patient_id              = EXCLUDED.patient_id,
        department_id           = EXCLUDED.department_id,
        period_year             = EXCLUDED.period_year,
        period_month            = EXCLUDED.period_month,
        total_amount            = EXCLUDED.total_amount,
        line_count              = EXCLUDED.line_count,
        refreshed_at            = EXCLUDED.refreshed_at
    `);
    totalUpserted += Number((admResult as any).rowCount ?? 0);

    const invResult = await db.execute(sql`
      INSERT INTO rpt_patient_visit_classification (
        source_type, source_id,
        patient_id, department_id,
        period_year, period_month,
        business_classification,
        total_amount, line_count,
        refreshed_at
      )
      SELECT
        'patient_invoice'                                               AS source_type,
        pih.id                                                          AS source_id,
        pat.id                                                          AS patient_id,
        COALESCE(pih.department_id, w.department_id)                   AS department_id,
        EXTRACT(YEAR  FROM pih.invoice_date)::smallint                 AS period_year,
        EXTRACT(MONTH FROM pih.invoice_date)::smallint                 AS period_month,
        pil.business_classification,
        SUM(pil.total_price::numeric)                                   AS total_amount,
        COUNT(*)::integer                                               AS line_count,
        NOW()

      FROM patient_invoice_headers pih

      JOIN patient_invoice_lines pil
        ON pil.header_id = pih.id
       AND NOT pil.is_void
       AND pil.business_classification IS NOT NULL

      LEFT JOIN patients    pat ON pat.full_name = pih.patient_name
      LEFT JOIN warehouses  w   ON w.id = pih.warehouse_id

      WHERE pih.admission_id IS NULL
        AND pih.status = 'finalized'

      GROUP BY
        pih.id, pih.invoice_date,
        pat.id,
        pih.department_id, w.department_id,
        pil.business_classification

      ON CONFLICT (source_type, source_id, business_classification) DO UPDATE SET
        patient_id              = EXCLUDED.patient_id,
        department_id           = EXCLUDED.department_id,
        period_year             = EXCLUDED.period_year,
        period_month            = EXCLUDED.period_month,
        total_amount            = EXCLUDED.total_amount,
        line_count              = EXCLUDED.line_count,
        refreshed_at            = EXCLUDED.refreshed_at
    `);
    totalUpserted += Number((invResult as any).rowCount ?? 0);

    await db.execute(sql`
      DELETE FROM rpt_patient_visit_classification rpc
      WHERE rpc.source_type = 'admission'
        AND NOT EXISTS (
          SELECT 1 FROM admissions a WHERE a.id = rpc.source_id
        )
    `);

    await db.execute(sql`
      DELETE FROM rpt_patient_visit_classification rpc
      WHERE rpc.source_type = 'patient_invoice'
        AND NOT EXISTS (
          SELECT 1
          FROM patient_invoice_headers pih
          WHERE pih.id     = rpc.source_id
            AND pih.status = 'finalized'
        )
    `);

    const durationMs = Date.now() - start;
    return { upserted: totalUpserted, durationMs, ranAt: new Date().toISOString() };
  },
};

export default methods;
