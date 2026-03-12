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
