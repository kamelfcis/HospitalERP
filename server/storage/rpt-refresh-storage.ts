/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RPT Refresh Storage — إعادة بناء جداول التقارير المُجمَّعة
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  refreshPatientVisitSummary()
 *  ────────────────────────────
 *  يُحدّث جدول `rpt_patient_visit_summary` من البيانات الحية.
 *  - UPSERT بحيث إعادة التشغيل لا تُكرّر بيانات
 *  - مشكلة N×M محلولة: تجميع رؤوس/بنود الفواتير منفصل
 *  - يُغطّي حالياً: source_type = 'admission' فقط
 *
 *  refreshPatientVisitClassification()
 *  ────────────────────────────────────
 *  يُحدّث جدول `rpt_patient_visit_classification` من البيانات الحية.
 *  - Grain: صف واحد لكل (source_type × source_id × business_classification)
 *  - source_type = 'admission'       → source_id = admissions.id
 *  - source_type = 'patient_invoice' → source_id = patient_invoice_headers.id
 *  - المصدر الوحيد: patient_invoice_lines.business_classification
 *  - Draft مستبعد (status = 'finalized' | 'partial_paid' | 'paid' فقط)
 *  - Cancelled مستبعد دائماً
 *  - is_void مستبعد دائماً على مستوى البند
 *  - business_classification = NULL مستبعد (بنود غير مصنّفة)
 *  - patient_id و department_id يُسمح بـ NULL لا يوقفان الـ refresh
 *  - refreshed_at = وقت بناء صف الـ rpt وليس وقت العملية الأصلية
 *  - ❌ لا يُقرأ أثناء إنشاء/تعديل الفاتورة
 *  - ❌ لا يستخدم finalized_snapshot_json كمصدر
 *
 *  refreshInventorySnapshot()
 *  ───────────────────────────
 *  يُحدّث جدول `rpt_inventory_snapshot` من `inventory_lots` الحية.
 *  - UPSERT على UNIQUE(snapshot_date, item_id, warehouse_id)
 *  - يُدرج صفاً واحداً لكل (صنف × مخزن) يملك lots فعلية
 *  - بعد الإدراج يحذف الصفوف القديمة (snapshot_date < CURRENT_DATE)
 *    لضمان صف واحد فقط لكل حبّة (item, warehouse) في أي وقت
 *
 *  القواعد الصارمة:
 *  - لا trigger على مسار الكتابة التشغيلي
 *  - لا تعديل للـ schema هنا
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

  // ─── rpt_inventory_snapshot ────────────────────────────────────────────────
  //
  // يُعيد بناء لقطة المخزون الجارية من inventory_lots.
  //
  // الخوارزمية:
  //   1. UPSERT بصف واحد لكل (item_id × warehouse_id) لديه lots فعلية.
  //      snapshot_date = CURRENT_DATE — الحقل الثالث في المفتاح الفريد.
  //   2. حذف الصفوف القديمة (snapshot_date < CURRENT_DATE) بعد الإدراج.
  //      النتيجة: حبّة واحدة فقط لكل (item, warehouse) في الجدول.
  //
  // nearestExpiryLotId: يتطلب correlated subquery لأن DISTINCT FIRST
  //   غير متاح في GROUP BY مباشرةً، لكنه مُقيَّد بـ LIMIT 1 + INDEX،
  //   فعلياً O(log N) لكل مجموعة.
  //
  async refreshInventorySnapshot(): Promise<RptRefreshResult> {
    const start = Date.now();

    const result = await db.execute(sql`
      INSERT INTO rpt_inventory_snapshot (
        snapshot_date,
        item_id, item_code, item_name, item_category, has_expiry,
        warehouse_id, warehouse_code, warehouse_name,
        qty_in_minor, active_lot_count,
        expired_qty, expiring_30d_qty, expiring_90d_qty,
        earliest_expiry_date, nearest_expiry_lot_id,
        avg_unit_cost, total_cost_value, total_sale_value,
        refreshed_at
      )
      SELECT
        CURRENT_DATE,
        i.id,
        i.item_code,
        i.name_ar,
        i.category::text,
        i.has_expiry,
        w.id,
        w.warehouse_code,
        w.name_ar,

        -- qty_in_minor: مجموع الكميات الإيجابية في الـ lots الفعّالة
        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0),

        -- active_lot_count
        COUNT(il.id)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0),

        -- expired_qty: كميات منتهية الصلاحية (is_active مع تاريخ في الماضي)
        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date < CURRENT_DATE), 0),

        -- expiring_30d_qty
        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE
                    AND il.expiry_date <= CURRENT_DATE + 30), 0),

        -- expiring_90d_qty
        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE
                    AND il.expiry_date <= CURRENT_DATE + 90), 0),

        -- earliest_expiry_date
        MIN(il.expiry_date)
          FILTER (WHERE il.is_active
                    AND il.qty_in_minor::numeric > 0
                    AND il.expiry_date IS NOT NULL
                    AND il.expiry_date >= CURRENT_DATE),

        -- nearest_expiry_lot_id: أقرب lot بتاريخ انتهاء صالح (LIMIT 1 + INDEX)
        (SELECT il2.id
         FROM   inventory_lots il2
         WHERE  il2.item_id    = i.id
           AND  il2.warehouse_id = w.id
           AND  il2.is_active  = true
           AND  il2.qty_in_minor::numeric > 0
           AND  il2.expiry_date IS NOT NULL
           AND  il2.expiry_date >= CURRENT_DATE
         ORDER BY il2.expiry_date ASC
         LIMIT 1),

        -- avg_unit_cost: متوسط تكلفة الوحدة بالكمية مرجّحة
        CASE
          WHEN SUM(il.qty_in_minor::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0) > 0
          THEN SUM((il.qty_in_minor * il.purchase_price)::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0)
             / SUM(il.qty_in_minor::numeric)
               FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0)
          ELSE NULL
        END,

        -- total_cost_value
        COALESCE(SUM((il.qty_in_minor * il.purchase_price)::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0),

        -- total_sale_value
        COALESCE(SUM(il.qty_in_minor::numeric)
          FILTER (WHERE il.is_active AND il.qty_in_minor::numeric > 0), 0)
          * i.sale_price_current::numeric,

        NOW()

      FROM  inventory_lots il
      JOIN  items      i ON i.id  = il.item_id      AND i.is_active = true
      JOIN  warehouses w ON w.id  = il.warehouse_id

      GROUP BY
        i.id, i.item_code, i.name_ar, i.category, i.has_expiry, i.sale_price_current,
        w.id, w.warehouse_code, w.name_ar

      ON CONFLICT (snapshot_date, item_id, warehouse_id) DO UPDATE SET
        qty_in_minor          = EXCLUDED.qty_in_minor,
        active_lot_count      = EXCLUDED.active_lot_count,
        expired_qty           = EXCLUDED.expired_qty,
        expiring_30d_qty      = EXCLUDED.expiring_30d_qty,
        expiring_90d_qty      = EXCLUDED.expiring_90d_qty,
        earliest_expiry_date  = EXCLUDED.earliest_expiry_date,
        nearest_expiry_lot_id = EXCLUDED.nearest_expiry_lot_id,
        avg_unit_cost         = EXCLUDED.avg_unit_cost,
        total_cost_value      = EXCLUDED.total_cost_value,
        total_sale_value      = EXCLUDED.total_sale_value,
        item_name             = EXCLUDED.item_name,
        item_category         = EXCLUDED.item_category,
        item_code             = EXCLUDED.item_code,
        warehouse_name        = EXCLUDED.warehouse_name,
        warehouse_code        = EXCLUDED.warehouse_code,
        refreshed_at          = EXCLUDED.refreshed_at
    `);

    // حذف الصفوف القديمة لضمان صف واحد لكل (item, warehouse)
    await db.execute(sql`
      DELETE FROM rpt_inventory_snapshot
      WHERE snapshot_date < CURRENT_DATE
    `);

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return { upserted, durationMs, ranAt: new Date().toISOString() };
  },

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

      -- ── تجميع التحويلات للأطباء مُسبقاً (بدلاً من correlated subquery) ──────
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

    // ── UPSERT — الفواتير المستقلة (source_type = 'patient_invoice') ──────────
    //
    // كل فاتورة مستقلة (admission_id IS NULL, status != 'cancelled') تُمثَّل
    // بصف واحد. حقول latest_invoice_* = بيانات الفاتورة نفسها (grain = الفاتورة).
    // department_id: COALESCE(pih.department_id, warehouse.department_id) لضمان
    // تعبئته حتى عند غياب pih.department_id المباشر.
    //
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

      -- ── تجميع تحويلات الأطباء لهذه الفاتورة ─────────────────────────────
      LEFT JOIN (
        SELECT invoice_id, SUM(amount::numeric) AS transferred_total
        FROM doctor_transfers
        GROUP BY invoice_id
      ) ta ON ta.invoice_id = pih.id

      -- ── القسم من المخزن إذا لم يكن department_id مباشراً على الفاتورة ─────
      LEFT JOIN warehouses  w   ON w.id   = pih.warehouse_id
      LEFT JOIN departments d   ON d.id   = COALESCE(pih.department_id, w.department_id)
      -- ── بحث عن patient_id بالاسم (best-effort) ──────────────────────────
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

    // ── CLEANUP ───────────────────────────────────────────────────────────────
    // حذف صفوف admission: حين يُحذف سجل الإقامة
    await db.execute(sql`
      DELETE FROM rpt_patient_visit_summary rpt
      WHERE rpt.source_type = 'admission'
        AND NOT EXISTS (
          SELECT 1 FROM admissions a WHERE a.id = rpt.source_id
        )
    `);

    // حذف صفوف patient_invoice: حين تصبح الفاتورة ملغاة أو محذوفة
    await db.execute(sql`
      DELETE FROM rpt_patient_visit_summary rpt
      WHERE rpt.source_type = 'patient_invoice'
        AND NOT EXISTS (
          SELECT 1 FROM patient_invoice_headers pih
          WHERE pih.id = rpt.source_id
            AND pih.status != 'cancelled'
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

  // ─── rpt_item_movements_summary ────────────────────────────────────────────
  //
  // يُعيد بناء ملخّص حركات الأصناف من inventory_lot_movements.
  //
  // الحبوب (Grain): يوم × صنف × مخزن — UNIQUE(movement_date, item_id, warehouse_id)
  //
  // تصنيف الحركات:
  //   received_qty / received_value : tx_type='in'  + reference_type='receiving'
  //   issued_qty / issued_value     : tx_type='out' + reference_type IN ('sales_invoice','patient_invoice')
  //   transfer_in_qty               : tx_type='in'  + reference_type='transfer'
  //   transfer_out_qty              : tx_type='out' + reference_type='transfer'
  //   return_in_qty                 : tx_type='in'  + reference_type='sales_return'
  //   return_out_qty                : tx_type='out' + reference_type='sales_return'
  //   adjustment_qty                : tx_type='adj' — إشارة مُحتفَظ بها (موجب=زيادة، سالب=نقص)
  //   net_qty_change                : SUM(qty_change_in_minor) — المجموع الجبري لجميع الحركات
  //
  async refreshItemMovementsSummary(): Promise<RptRefreshResult> {
    const start = Date.now();

    const result = await db.execute(sql`
      WITH src AS (
        -- CTE: flatten joins + pre-cast tx_date to date so GROUP BY is clean
        SELECT
          ilm.tx_date::date   AS tx_day,
          il.item_id,
          i.name_ar           AS item_name,
          i.category::text    AS item_category,
          ilm.warehouse_id,
          w.name_ar           AS warehouse_name,
          ilm.tx_type,
          ilm.reference_type,
          ilm.qty_change_in_minor,
          COALESCE(ilm.unit_cost, 0) AS unit_cost
        FROM inventory_lot_movements ilm
        JOIN inventory_lots  il ON il.id = ilm.lot_id
        JOIN items           i  ON i.id  = il.item_id
        JOIN warehouses      w  ON w.id  = ilm.warehouse_id
      )
      INSERT INTO rpt_item_movements_summary (
        movement_date, period_year, period_month,
        item_id, item_name, item_category,
        warehouse_id, warehouse_name,
        received_qty, received_value, receipt_tx_count,
        issued_qty, issued_value, issue_tx_count,
        transfer_in_qty, transfer_out_qty,
        return_in_qty, return_out_qty,
        adjustment_qty,
        net_qty_change,
        refreshed_at
      )
      SELECT
        tx_day                                                           AS movement_date,
        EXTRACT(YEAR  FROM tx_day)::smallint                            AS period_year,
        EXTRACT(MONTH FROM tx_day)::smallint                            AS period_month,
        item_id,
        item_name,
        item_category,
        warehouse_id,
        warehouse_name,

        -- received_qty / received_value
        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                 THEN qty_change_in_minor ELSE 0 END)                   AS received_qty,
        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                 THEN qty_change_in_minor * unit_cost
                 ELSE 0 END)                                             AS received_value,
        COUNT(CASE WHEN tx_type = 'in'  AND reference_type = 'receiving'
                   THEN 1 END)::integer                                  AS receipt_tx_count,

        -- issued_qty / issued_value (sales + patient merged)
        SUM(CASE WHEN tx_type = 'out'
                  AND reference_type IN ('sales_invoice', 'patient_invoice')
                 THEN -qty_change_in_minor ELSE 0 END)                  AS issued_qty,
        SUM(CASE WHEN tx_type = 'out'
                  AND reference_type IN ('sales_invoice', 'patient_invoice')
                 THEN -qty_change_in_minor * unit_cost
                 ELSE 0 END)                                             AS issued_value,
        COUNT(CASE WHEN tx_type = 'out'
                    AND reference_type IN ('sales_invoice', 'patient_invoice')
                   THEN 1 END)::integer                                  AS issue_tx_count,

        -- transfer_in_qty
        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'transfer'
                 THEN qty_change_in_minor ELSE 0 END)                   AS transfer_in_qty,

        -- transfer_out_qty
        SUM(CASE WHEN tx_type = 'out' AND reference_type = 'transfer'
                 THEN -qty_change_in_minor ELSE 0 END)                  AS transfer_out_qty,

        -- return_in_qty
        SUM(CASE WHEN tx_type = 'in'  AND reference_type = 'sales_return'
                 THEN qty_change_in_minor ELSE 0 END)                   AS return_in_qty,

        -- return_out_qty
        SUM(CASE WHEN tx_type = 'out' AND reference_type = 'sales_return'
                 THEN -qty_change_in_minor ELSE 0 END)                  AS return_out_qty,

        -- adjustment_qty — signed: positive=increase, negative=decrease
        SUM(CASE WHEN tx_type = 'adj'
                 THEN qty_change_in_minor ELSE 0 END)                   AS adjustment_qty,

        -- net_qty_change — algebraic sum of all movements for the day
        SUM(qty_change_in_minor)                                         AS net_qty_change,

        NOW()                                                            AS refreshed_at

      FROM src
      GROUP BY
        tx_day,
        item_id, item_name, item_category,
        warehouse_id, warehouse_name

      ON CONFLICT (movement_date, item_id, warehouse_id) DO UPDATE SET
        item_name        = EXCLUDED.item_name,
        item_category    = EXCLUDED.item_category,
        warehouse_name   = EXCLUDED.warehouse_name,
        received_qty     = EXCLUDED.received_qty,
        received_value   = EXCLUDED.received_value,
        receipt_tx_count = EXCLUDED.receipt_tx_count,
        issued_qty       = EXCLUDED.issued_qty,
        issued_value     = EXCLUDED.issued_value,
        issue_tx_count   = EXCLUDED.issue_tx_count,
        transfer_in_qty  = EXCLUDED.transfer_in_qty,
        transfer_out_qty = EXCLUDED.transfer_out_qty,
        return_in_qty    = EXCLUDED.return_in_qty,
        return_out_qty   = EXCLUDED.return_out_qty,
        adjustment_qty   = EXCLUDED.adjustment_qty,
        net_qty_change   = EXCLUDED.net_qty_change,
        refreshed_at     = EXCLUDED.refreshed_at
    `);

    const durationMs = Date.now() - start;
    const upserted   = Number((result as any).rowCount ?? 0);

    return {
      upserted,
      durationMs,
      ranAt: new Date().toISOString(),
    };
  },

  // ─── rpt_patient_visit_classification ──────────────────────────────────────
  //
  // Grain: صف واحد لكل (source_type × source_id × business_classification)
  //
  // قواعد الاستبعاد:
  //   Draft     → مستبعد — الجدول يعكس الإيراد المعتمد فقط
  //   Cancelled → مستبعد دائماً
  //   status enum: draft | finalized | cancelled (لا partial_paid أو paid)
  //   is_void   → مستبعد على مستوى البند
  //   business_classification IS NULL → مستبعد (بنود غير مصنّفة)
  //
  // التدفق:
  //   1. UPSERT للإقامات   (source_type = 'admission')
  //   2. UPSERT للفواتير المستقلة (source_type = 'patient_invoice')
  //   3. تنظيف الصفوف اليتيمة
  //
  async refreshPatientVisitClassification(): Promise<RptRefreshResult> {
    const start = Date.now();
    let totalUpserted = 0;

    // ── 1. الإقامات (source_type = 'admission') ─────────────────────────────
    //
    // source_id   = admissions.id
    // department  = آخر department_id على فواتير الإقامة
    // period_*    = من admission_date
    // الفواتير المؤهلة: status = 'finalized' فقط (enum: draft|finalized|cancelled)
    //
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

      -- ── آخر department_id على فواتير هذه الإقامة ─────────────────────────
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

    // ── 2. الفواتير المستقلة (source_type = 'patient_invoice') ──────────────
    //
    // source_id   = patient_invoice_headers.id
    // period_*    = من invoice_date
    // department  = COALESCE(pih.department_id, warehouses.department_id)
    // patient_id  = best-effort عبر مطابقة الاسم (nullable OK)
    // الفواتير المؤهلة: status = 'finalized' فقط (enum: draft|finalized|cancelled)
    //
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

    // ── 3. تنظيف — حذف الصفوف اليتيمة ──────────────────────────────────────
    //
    // إقامة محذوفة أو فاتورة أصبحت cancelled/draft بعد refresh سابق.
    //
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
