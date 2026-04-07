/**
 * ═══════════════════════════════════════════════════════════════════
 *  Stay Engine — Line Builder
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Helper مركزي لبناء سطر إقامة STAY_ENGINE بشكل موحَّد.
 *  يُستخدم في ثلاثة مواضع:
 *    - admitPatientToBed  (سطر اليوم الأول)
 *    - transferPatientBed (سطر التحويل)
 *    - accrueStayLines    (التراكم اليومي)
 *
 *  القواعد الثابتة التي يُطبّقها هذا الـ helper دائماً:
 *    - quantity        = options.quantity ?? '1'
 *    - total_price     = rate × quantity  (محسوبة بدقة، لا صفر ولا NULL)
 *    - business_classification = 'accommodation'  (لا يُقبل استثناء)
 *    - source_type     = 'STAY_ENGINE'
 *    - ON CONFLICT DO NOTHING  (idempotent — آمن للتشغيل المتكرر)
 * ═══════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";

export interface StayLineParams {
  invoiceId:   string;
  serviceId:   string | null;
  description: string;
  ratePerDay:  string;
  sourceId:    string;
  sortOrder?:  number;
  quantity?:   string;
}

/**
 * يبني SQL statement كاملة لإدراج سطر STAY_ENGINE.
 *
 * total_price = ratePerDay × quantity  (مُقرَّب لـ 4 خانات عشرية)
 */
export function buildStayLineSQL(p: StayLineParams) {
  const qty      = p.quantity ?? "1";
  const rate     = parseFloat(p.ratePerDay) || 0;
  const qtyNum   = parseFloat(qty) || 1;
  const total    = String(+(rate * qtyNum).toFixed(4));
  const sortOrd  = p.sortOrder ?? 0;

  return sql`
    INSERT INTO patient_invoice_lines
      (header_id, line_type, service_id, description,
       quantity, unit_price, discount_percent, discount_amount,
       total_price, unit_level, sort_order, source_type, source_id,
       business_classification)
    VALUES
      (${p.invoiceId}, 'service', ${p.serviceId}, ${p.description},
       ${qty}, ${p.ratePerDay}, '0', '0',
       ${total}, 'minor', ${sortOrd},
       'STAY_ENGINE', ${p.sourceId},
       'accommodation')
    ON CONFLICT (source_type, source_id)
      WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
    DO NOTHING
  `;
}
