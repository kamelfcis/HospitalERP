import { db } from "../db";
import { sql } from "drizzle-orm";

export async function upsertOutpatientVisitsAndCleanup(): Promise<void> {
  await db.execute(sql`
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
      'patient_invoice'                                              AS source_type,
      pih.id                                                         AS source_id,
      'outpatient'                                                   AS visit_type,
      pih.invoice_date                                               AS visit_date,
      NULL::date                                                     AS discharge_date,
      0::numeric                                                     AS los_days,
      EXTRACT(YEAR  FROM pih.invoice_date)::smallint                AS period_year,
      EXTRACT(MONTH FROM pih.invoice_date)::smallint                AS period_month,
      EXTRACT(WEEK  FROM pih.invoice_date)::smallint                AS period_week,
      pat.id                                                         AS patient_id,
      pih.patient_name,
      pih.patient_type::text                                         AS patient_type,
      NULL::varchar                                                  AS insurance_company,
      pih.patient_type::text                                         AS payment_type,
      COALESCE(pih.department_id, w.department_id)                  AS department_id,
      d.name_ar                                                      AS department_name,
      pih.doctor_name,
      NULL::varchar                                                  AS surgery_type_id,
      NULL::text                                                     AS surgery_type_name,
      NULL::varchar                                                  AS admission_status,
      1::smallint                                                    AS invoice_count,
      pih.total_amount::numeric                                      AS total_invoiced,
      pih.discount_amount::numeric                                   AS total_discount,
      pih.net_amount::numeric                                        AS net_amount,
      pih.paid_amount::numeric                                       AS total_paid,
      GREATEST(0, pih.net_amount::numeric - pih.paid_amount::numeric) AS outstanding_balance,
      COALESCE(la.service_revenue,       0)                         AS service_revenue,
      COALESCE(la.drug_revenue,          0)                         AS drug_revenue,
      COALESCE(la.consumable_revenue,    0)                         AS consumable_revenue,
      COALESCE(la.stay_revenue,          0)                         AS stay_revenue,
      COALESCE(la.service_line_count,    0)                         AS service_line_count,
      COALESCE(la.drug_line_count,       0)                         AS drug_line_count,
      COALESCE(la.consumable_line_count, 0)                         AS consumable_line_count,
      COALESCE(la.or_room_total,         0)                         AS or_room_total,
      COALESCE(ta.transferred_total,     0)                         AS transferred_total,
      COALESCE(la.company_share_total,   0)                         AS company_share_total,
      COALESCE(la.patient_share_total,   0)                         AS patient_share_total,
      COALESCE(la.equipment_revenue,     0)                         AS equipment_revenue,
      COALESCE(la.gas_revenue,           0)                         AS gas_revenue,
      COALESCE(pih.is_final_closed, false)                           AS is_any_final_closed,
      pih.id                                                         AS latest_invoice_id,
      pih.invoice_number                                             AS latest_invoice_number,
      pih.status::text                                               AS latest_invoice_status,
      pih.doctor_name                                                AS latest_doctor_name,
      pih.created_at                                                 AS latest_invoice_created_at,
      NOW()                                                          AS refreshed_at

    FROM patient_invoice_headers pih

    LEFT JOIN (
      SELECT
        pil.header_id,
        SUM(CASE
          WHEN pil.source_type IS NULL AND pil.line_type = 'service'
               AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS service_revenue,
        SUM(CASE
          WHEN pil.line_type = 'drug' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS drug_revenue,
        SUM(CASE
          WHEN pil.line_type = 'consumable' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS consumable_revenue,
        SUM(CASE
          WHEN pil.source_type = 'STAY_ENGINE' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS stay_revenue,
        SUM(CASE
          WHEN pil.source_type = 'OR_ROOM' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS or_room_total,
        SUM(CASE
          WHEN pil.line_type = 'equipment' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS equipment_revenue,
        SUM(CASE
          WHEN pil.business_classification = 'gas' AND NOT pil.is_void
          THEN pil.total_price::numeric ELSE 0
        END)                                                        AS gas_revenue,
        SUM(CASE
          WHEN NOT pil.is_void
          THEN COALESCE(pil.company_share_amount::numeric, 0) ELSE 0
        END)                                                        AS company_share_total,
        SUM(CASE
          WHEN NOT pil.is_void
          THEN COALESCE(pil.patient_share_amount::numeric, 0) ELSE 0
        END)                                                        AS patient_share_total,
        COUNT(CASE
          WHEN pil.source_type IS NULL AND pil.line_type = 'service'
               AND NOT pil.is_void THEN 1
        END)                                                        AS service_line_count,
        COUNT(CASE
          WHEN pil.line_type = 'drug' AND NOT pil.is_void THEN 1
        END)                                                        AS drug_line_count,
        COUNT(CASE
          WHEN pil.line_type = 'consumable' AND NOT pil.is_void THEN 1
        END)                                                        AS consumable_line_count
      FROM patient_invoice_lines pil
      GROUP BY pil.header_id
    ) la ON la.header_id = pih.id

    LEFT JOIN (
      SELECT invoice_id, SUM(amount::numeric) AS transferred_total
      FROM doctor_transfers
      GROUP BY invoice_id
    ) ta ON ta.invoice_id = pih.id

    LEFT JOIN warehouses  w   ON w.id   = pih.warehouse_id
    LEFT JOIN departments d   ON d.id   = COALESCE(pih.department_id, w.department_id)
    LEFT JOIN patients    pat ON pat.full_name = pih.patient_name

    WHERE pih.admission_id IS NULL
      AND pih.status != 'cancelled'

    ON CONFLICT (source_type, source_id) DO UPDATE SET
      visit_date             = EXCLUDED.visit_date,
      period_year            = EXCLUDED.period_year,
      period_month           = EXCLUDED.period_month,
      period_week            = EXCLUDED.period_week,
      patient_id             = EXCLUDED.patient_id,
      patient_name           = EXCLUDED.patient_name,
      patient_type           = EXCLUDED.patient_type,
      payment_type           = EXCLUDED.payment_type,
      department_id          = EXCLUDED.department_id,
      department_name        = EXCLUDED.department_name,
      doctor_name            = EXCLUDED.doctor_name,
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

  await db.execute(sql`
    DELETE FROM rpt_patient_visit_summary rpt
    WHERE rpt.source_type = 'admission'
      AND NOT EXISTS (
        SELECT 1 FROM admissions a WHERE a.id = rpt.source_id
      )
  `);

  await db.execute(sql`
    DELETE FROM rpt_patient_visit_summary rpt
    WHERE rpt.source_type = 'patient_invoice'
      AND NOT EXISTS (
        SELECT 1 FROM patient_invoice_headers pih
        WHERE pih.id = rpt.source_id
          AND pih.status != 'cancelled'
      )
  `);
}
