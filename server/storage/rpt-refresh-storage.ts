/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RPT Refresh Storage — إعادة بناء جداول التقارير المُجمَّعة
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يحتوي على دالة `refreshPatientVisitSummary()` التي تُحدّث جدول
 *  `rpt_patient_visit_summary` من البيانات الحية بصورة آمنة ومتكررة.
 *
 *  القواعد الصارمة:
 *  - لا trigger على مسار الكتابة التشغيلي
 *  - UPSERT بحيث إعادة التشغيل لا تُكرّر بيانات
 *  - تغطّي فقط الإقامات ذات الفواتير المرتبطة مباشرةً عبر admission_id
 *
 *  مشكلة N×M محلولة: تجميع رؤوس الفواتير منفصل عن تجميع البنود،
 *  كلٌّ منهما في subquery مستقلة للاتحاد لاحقاً.
 *
 *  الجدول يُغطّي حالياً: source_type = 'admission' فقط.
 *  المصادر الأخرى محجوزة للإصدارات القادمة.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface RptRefreshResult {
  upserted: number;
  durationMs: number;
  ranAt: string;
}

const methods = {

  async refreshPatientVisitSummary(): Promise<RptRefreshResult> {
    const start = Date.now();

    // ─── UPSERT — الإقامات فقط (source_type = 'admission') ──────────────────
    //
    // هيكل الاستعلام:
    //   hdr_agg : تجميع رؤوس الفواتير (net_amount, paid_amount, etc.)
    //   line_agg: تجميع بنود الفواتير  (service_revenue, drug_revenue, etc.)
    //
    // السبب في الفصل: JOIN(headers × lines) يُضاعف مبالغ الرؤوس بعدد البنود.
    // الحل: كل subquery تجمّع بشكل مستقل ثم تُوحَّد عبر LEFT JOIN على admission_id.
    //
    const result = await db.execute(sql`
      INSERT INTO rpt_patient_visit_summary (
        source_type, source_id,
        visit_type, visit_date, discharge_date, los_days,
        period_year, period_month, period_week,
        patient_id, patient_name, patient_type,
        insurance_company, payment_type,
        department_id, department_name, doctor_name,
        surgery_type_id, surgery_type_name, admission_status,
        invoice_count, total_invoiced, total_discount, net_amount,
        total_paid, outstanding_balance,
        service_revenue, drug_revenue, consumable_revenue, stay_revenue,
        service_line_count, drug_line_count, consumable_line_count,
        refreshed_at
      )
      SELECT
        'admission'                                                   AS source_type,
        a.id                                                          AS source_id,
        'inpatient'                                                   AS visit_type,
        a.admission_date                                              AS visit_date,
        a.discharge_date,
        CASE
          WHEN a.discharge_date IS NOT NULL
          THEN (a.discharge_date - a.admission_date)::numeric
          ELSE (CURRENT_DATE - a.admission_date)::numeric
        END                                                           AS los_days,
        EXTRACT(YEAR  FROM a.admission_date)::smallint               AS period_year,
        EXTRACT(MONTH FROM a.admission_date)::smallint               AS period_month,
        EXTRACT(WEEK  FROM a.admission_date)::smallint               AS period_week,
        a.patient_id,
        a.patient_name,
        a.payment_type                                                AS patient_type,
        a.insurance_company,
        a.payment_type,
        hdr_agg.latest_dept_id                                        AS department_id,
        d.name_ar                                                     AS department_name,
        a.doctor_name,
        a.surgery_type_id,
        st.name_ar                                                    AS surgery_type_name,
        a.status::text                                                AS admission_status,
        COALESCE(hdr_agg.invoice_count,    0)::smallint              AS invoice_count,
        COALESCE(hdr_agg.total_invoiced,   0)                        AS total_invoiced,
        COALESCE(hdr_agg.total_discount,   0)                        AS total_discount,
        COALESCE(hdr_agg.net_amount,       0)                        AS net_amount,
        COALESCE(hdr_agg.total_paid,       0)                        AS total_paid,
        GREATEST(0,
          COALESCE(hdr_agg.net_amount, 0) - COALESCE(hdr_agg.total_paid, 0)
        )                                                             AS outstanding_balance,
        COALESCE(line_agg.service_revenue,    0)                     AS service_revenue,
        COALESCE(line_agg.drug_revenue,       0)                     AS drug_revenue,
        COALESCE(line_agg.consumable_revenue, 0)                     AS consumable_revenue,
        COALESCE(line_agg.stay_revenue,       0)                     AS stay_revenue,
        COALESCE(line_agg.service_line_count, 0)                     AS service_line_count,
        COALESCE(line_agg.drug_line_count,    0)                     AS drug_line_count,
        COALESCE(line_agg.consumable_line_count, 0)                  AS consumable_line_count,
        NOW()                                                         AS refreshed_at

      FROM admissions a

      -- ── تجميع رؤوس الفواتير منفصلاً (بدون بنود) لتجنب ضرب المبالغ ───────
      LEFT JOIN (
        SELECT
          pih.admission_id,
          COUNT(pih.id)::smallint                                     AS invoice_count,
          SUM(pih.total_amount::numeric)                              AS total_invoiced,
          SUM(pih.discount_amount::numeric)                           AS total_discount,
          SUM(pih.net_amount::numeric)                                AS net_amount,
          SUM(pih.paid_amount::numeric)                               AS total_paid,
          (ARRAY_AGG(pih.department_id ORDER BY pih.created_at DESC))[1] AS latest_dept_id
        FROM patient_invoice_headers pih
        WHERE pih.status != 'cancelled'
          AND pih.admission_id IS NOT NULL
        GROUP BY pih.admission_id
      ) hdr_agg ON hdr_agg.admission_id = a.id

      -- ── تجميع بنود الفواتير منفصلاً (للإيرادات حسب النوع) ───────────────
      LEFT JOIN (
        SELECT
          pih.admission_id,
          SUM(CASE
            WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                 AND pil.is_void = false
            THEN pil.total_price::numeric ELSE 0
          END)                                                        AS service_revenue,
          SUM(CASE
            WHEN pil.line_type = 'drug' AND pil.is_void = false
            THEN pil.total_price::numeric ELSE 0
          END)                                                        AS drug_revenue,
          SUM(CASE
            WHEN pil.line_type = 'consumable' AND pil.is_void = false
            THEN pil.total_price::numeric ELSE 0
          END)                                                        AS consumable_revenue,
          SUM(CASE
            WHEN pil.source_type = 'STAY_ENGINE' AND pil.is_void = false
            THEN pil.total_price::numeric ELSE 0
          END)                                                        AS stay_revenue,
          COUNT(CASE
            WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                 AND pil.is_void = false THEN 1
          END)                                                        AS service_line_count,
          COUNT(CASE
            WHEN pil.line_type = 'drug' AND pil.is_void = false THEN 1
          END)                                                        AS drug_line_count,
          COUNT(CASE
            WHEN pil.line_type = 'consumable' AND pil.is_void = false THEN 1
          END)                                                        AS consumable_line_count
        FROM patient_invoice_headers pih
        JOIN patient_invoice_lines pil ON pil.header_id = pih.id
        WHERE pih.status != 'cancelled'
          AND pih.admission_id IS NOT NULL
        GROUP BY pih.admission_id
      ) line_agg ON line_agg.admission_id = a.id

      LEFT JOIN departments  d  ON d.id  = hdr_agg.latest_dept_id
      LEFT JOIN surgery_types st ON st.id = a.surgery_type_id

      ON CONFLICT (source_type, source_id) DO UPDATE SET
        visit_date             = EXCLUDED.visit_date,
        discharge_date         = EXCLUDED.discharge_date,
        los_days               = EXCLUDED.los_days,
        period_year            = EXCLUDED.period_year,
        period_month           = EXCLUDED.period_month,
        period_week            = EXCLUDED.period_week,
        patient_id             = EXCLUDED.patient_id,
        patient_name           = EXCLUDED.patient_name,
        patient_type           = EXCLUDED.patient_type,
        insurance_company      = EXCLUDED.insurance_company,
        payment_type           = EXCLUDED.payment_type,
        department_id          = EXCLUDED.department_id,
        department_name        = EXCLUDED.department_name,
        doctor_name            = EXCLUDED.doctor_name,
        surgery_type_id        = EXCLUDED.surgery_type_id,
        surgery_type_name      = EXCLUDED.surgery_type_name,
        admission_status       = EXCLUDED.admission_status,
        invoice_count          = EXCLUDED.invoice_count,
        total_invoiced         = EXCLUDED.total_invoiced,
        total_discount         = EXCLUDED.total_discount,
        net_amount             = EXCLUDED.net_amount,
        total_paid             = EXCLUDED.total_paid,
        outstanding_balance    = EXCLUDED.outstanding_balance,
        service_revenue        = EXCLUDED.service_revenue,
        drug_revenue           = EXCLUDED.drug_revenue,
        consumable_revenue     = EXCLUDED.consumable_revenue,
        stay_revenue           = EXCLUDED.stay_revenue,
        service_line_count     = EXCLUDED.service_line_count,
        drug_line_count        = EXCLUDED.drug_line_count,
        consumable_line_count  = EXCLUDED.consumable_line_count,
        refreshed_at           = EXCLUDED.refreshed_at
    `);

    // حذف صفوف rpt التي حُذف سجل الإقامة المصدر لها
    await db.execute(sql`
      DELETE FROM rpt_patient_visit_summary rpt
      WHERE rpt.source_type = 'admission'
        AND NOT EXISTS (
          SELECT 1 FROM admissions a WHERE a.id = rpt.source_id
        )
    `);

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return {
      upserted,
      durationMs,
      ranAt: new Date().toISOString(),
    };
  },
};

export default methods;
