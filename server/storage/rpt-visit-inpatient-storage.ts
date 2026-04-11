import { db } from "../db";
import { sql } from "drizzle-orm";

export async function upsertInpatientVisits(): Promise<any> {
  return await db.execute(sql`
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
      or_room_total, transferred_total,
      company_share_total, patient_share_total,
      equipment_revenue, gas_revenue, is_any_final_closed,
      latest_invoice_id, latest_invoice_number,
      latest_invoice_status, latest_doctor_name,
      latest_invoice_created_at,
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
      COALESCE(line_agg.or_room_total,          0)                 AS or_room_total,
      COALESCE(transfer_agg.transferred_total,  0)                 AS transferred_total,
      COALESCE(line_agg.company_share_total,    0)                 AS company_share_total,
      COALESCE(line_agg.patient_share_total,    0)                 AS patient_share_total,
      COALESCE(line_agg.equipment_revenue,      0)                 AS equipment_revenue,
      COALESCE(line_agg.gas_revenue,            0)                 AS gas_revenue,
      COALESCE(hdr_agg.is_any_final_closed,  false)                AS is_any_final_closed,
      hdr_agg.latest_invoice_id                                     AS latest_invoice_id,
      hdr_agg.latest_invoice_number                                 AS latest_invoice_number,
      hdr_agg.latest_invoice_status                                 AS latest_invoice_status,
      hdr_agg.latest_doctor_name                                    AS latest_doctor_name,
      hdr_agg.latest_invoice_created_at                             AS latest_invoice_created_at,
      NOW()                                                         AS refreshed_at

    FROM admissions a

    LEFT JOIN (
      SELECT
        pih.admission_id,
        COUNT(pih.id)::smallint                                          AS invoice_count,
        SUM(pih.total_amount::numeric)                                   AS total_invoiced,
        SUM(pih.discount_amount::numeric)                                AS total_discount,
        SUM(pih.net_amount::numeric)                                     AS net_amount,
        SUM(pih.paid_amount::numeric)                                    AS total_paid,
        BOOL_OR(COALESCE(pih.is_final_closed, false))                    AS is_any_final_closed,
        (ARRAY_AGG(pih.department_id  ORDER BY pih.created_at DESC))[1] AS latest_dept_id,
        (ARRAY_AGG(pih.id             ORDER BY pih.created_at DESC, pih.id DESC))[1] AS latest_invoice_id,
        (ARRAY_AGG(pih.invoice_number ORDER BY pih.created_at DESC, pih.id DESC))[1] AS latest_invoice_number,
        (ARRAY_AGG(pih.status         ORDER BY pih.created_at DESC, pih.id DESC))[1] AS latest_invoice_status,
        (ARRAY_AGG(pih.doctor_name    ORDER BY pih.created_at DESC, pih.id DESC))[1] AS latest_doctor_name,
        (ARRAY_AGG(pih.created_at     ORDER BY pih.created_at DESC, pih.id DESC))[1] AS latest_invoice_created_at
      FROM patient_invoice_headers pih
      WHERE pih.status != 'cancelled'
        AND pih.admission_id IS NOT NULL
        AND pih.is_consolidated = false
      GROUP BY pih.admission_id
    ) hdr_agg ON hdr_agg.admission_id = a.id

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
        SUM(CASE
          WHEN pil.source_type = 'OR_ROOM' AND pil.is_void = false
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS or_room_total,
        SUM(CASE
          WHEN pil.line_type = 'equipment' AND pil.is_void = false
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS equipment_revenue,
        SUM(CASE
          WHEN pil.business_classification = 'gas' AND pil.is_void = false
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS gas_revenue,
        SUM(CASE
          WHEN pil.is_void = false
          THEN COALESCE(pil.company_share_amount::numeric, 0) ELSE 0
        END)                                                        AS company_share_total,
        SUM(CASE
          WHEN pil.is_void = false
          THEN COALESCE(pil.patient_share_amount::numeric, 0) ELSE 0
        END)                                                        AS patient_share_total,
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
        AND pih.is_consolidated = false
      GROUP BY pih.admission_id
    ) line_agg ON line_agg.admission_id = a.id

    LEFT JOIN (
      SELECT
        pih2.admission_id,
        COALESCE(SUM(dt.amount::numeric), 0) AS transferred_total
      FROM doctor_transfers dt
      JOIN patient_invoice_headers pih2
        ON pih2.id = dt.invoice_id
       AND pih2.status != 'cancelled'
       AND pih2.admission_id IS NOT NULL
       AND pih2.is_consolidated = false
      GROUP BY pih2.admission_id
    ) transfer_agg ON transfer_agg.admission_id = a.id

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
      or_room_total          = EXCLUDED.or_room_total,
      transferred_total      = EXCLUDED.transferred_total,
      company_share_total    = EXCLUDED.company_share_total,
      patient_share_total    = EXCLUDED.patient_share_total,
      equipment_revenue      = EXCLUDED.equipment_revenue,
      gas_revenue            = EXCLUDED.gas_revenue,
      is_any_final_closed    = EXCLUDED.is_any_final_closed,
      latest_invoice_id      = EXCLUDED.latest_invoice_id,
      latest_invoice_number  = EXCLUDED.latest_invoice_number,
      latest_invoice_status  = EXCLUDED.latest_invoice_status,
      latest_doctor_name     = EXCLUDED.latest_doctor_name,
      latest_invoice_created_at = EXCLUDED.latest_invoice_created_at,
      refreshed_at           = EXCLUDED.refreshed_at
  `);
}
