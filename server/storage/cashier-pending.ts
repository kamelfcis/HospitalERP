/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  cashier-pending.ts — Centralized "Pending Document" Business Logic
 *  المصدر الوحيد للحقيقة: تعريف "المستند المعلّق" في نظام الكاشير
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  INVARIANT — قاعدة حرام كسرها:
 *  ───────────────────────────────
 *  فاتورة مبيعات معلّقة =
 *    sales_invoice_headers.status = 'finalized'
 *    AND is_return = false
 *    AND NOT EXISTS (SELECT 1 FROM cashier_receipts WHERE invoice_id = id)
 *
 *  مرتجع معلّق =
 *    sales_invoice_headers.status = 'finalized'
 *    AND is_return = true
 *    AND NOT EXISTS (SELECT 1 FROM cashier_refund_receipts WHERE invoice_id = id)
 *
 *  ── لماذا NOT EXISTS وليس status فقط؟ ───────────────────────────────────
 *  - بيانات تاريخية أو قديمة قد تترك status='finalized' بعد إنشاء إيصال حقيقي.
 *  - الفلتر المزدوج يضمن تطابق منطق العرض ومنطق التحقق دائماً.
 *  - أي كود يقرأ "معلّق" يجب أن يمر من هنا — ممنوع نسخ هذا المنطق في مكان آخر.
 *
 *  ── نقاط الدخول المعتمدة ─────────────────────────────────────────────────
 *  1. getPendingSalesInvoices()     → شاشة تحصيل الكاشير (عرض + بحث)
 *  2. getPendingReturnInvoices()    → شاشة مرتجعات الكاشير (عرض + بحث)
 *  3. getPendingDocCountForUnit()   → التحقق من إغلاق الوردية (validate + actual close)
 *  4. getCashierConsistencyReport() → تشخيص تكامل البيانات (admin)
 *
 *  ── الصفوف المحظورة ─────────────────────────────────────────────────────
 *  ! لا تضف "status='finalized'" وحده لتحديد المعلّقات في أي كود جديد
 *  ! لا تُنشئ إيصالاً في cashier_receipts / cashier_refund_receipts خارج
 *    collectInvoices() / refundInvoices() — الإيصال + تحديث الحالة يجب أن
 *    يكونا دائماً في نفس الـ transaction
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { pool } from "../db";

/*
 * ── SQL fragments ── لا تُعدَّل إلا من هنا ─────────────────────────────────
 *  استخدمها مباشرةً في interpolated SQL strings ضمن هذا الملف فقط.
 *  الكود خارج هذا الملف يستخدم الدوال المُصدَّرة أدناه — لا الـ fragments.
 */
const PENDING_SALES_SQL = `
  sih.status   = 'finalized'
  AND sih.is_return = false
  AND NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = sih.id)
  AND NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)
`;

const PENDING_RETURNS_SQL = `
  sih.status   = 'finalized'
  AND sih.is_return = true
  AND NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = sih.id)
  AND NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)
`;

/* ─── Unit scoping helpers ───────────────────────────────────────────────── */
type UnitScope =
  | { unitType: "pharmacy";   pharmacyId: string; departmentId?: never }
  | { unitType: "department"; departmentId: string; pharmacyId?: never };

/*
 * countPendingSalesForUnit
 * عدد فواتير المبيعات المعلّقة لوحدة معينة (صيدلية أو قسم)
 */
export async function countPendingSalesForUnit(scope: UnitScope): Promise<number> {
  if (scope.unitType === "department") {
    const r = await pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count
      FROM sales_invoice_headers sih
      INNER JOIN warehouses w ON w.id = sih.warehouse_id
      WHERE w.department_id = $1
        AND ${PENDING_SALES_SQL}
    `, [scope.departmentId]);
    return parseInt(r.rows[0]?.count || "0", 10);
  }
  const r = await pool.query<{ count: string }>(`
    SELECT COUNT(*) AS count
    FROM sales_invoice_headers sih
    WHERE sih.pharmacy_id = $1
      AND ${PENDING_SALES_SQL}
  `, [scope.pharmacyId]);
  return parseInt(r.rows[0]?.count || "0", 10);
}

/*
 * countPendingReturnsForUnit
 * عدد المرتجعات المعلّقة لوحدة معينة
 */
export async function countPendingReturnsForUnit(scope: UnitScope): Promise<number> {
  if (scope.unitType === "department") {
    const r = await pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count
      FROM sales_invoice_headers sih
      INNER JOIN warehouses w ON w.id = sih.warehouse_id
      WHERE w.department_id = $1
        AND ${PENDING_RETURNS_SQL}
    `, [scope.departmentId]);
    return parseInt(r.rows[0]?.count || "0", 10);
  }
  const r = await pool.query<{ count: string }>(`
    SELECT COUNT(*) AS count
    FROM sales_invoice_headers sih
    WHERE sih.pharmacy_id = $1
      AND ${PENDING_RETURNS_SQL}
  `, [scope.pharmacyId]);
  return parseInt(r.rows[0]?.count || "0", 10);
}

/*
 * countPendingDocsForUnit
 * إجمالي المستندات المعلّقة (مبيعات + مرتجعات) — يُستخدم في إغلاق الوردية
 */
export async function countPendingDocsForUnit(scope: UnitScope): Promise<number> {
  const [sales, returns] = await Promise.all([
    countPendingSalesForUnit(scope),
    countPendingReturnsForUnit(scope),
  ]);
  return sales + returns;
}

/*
 * ── Pending sales list SQL ────────────────────────────────────────────────
 * SQL predicates for getPendingSalesInvoices — used inline in cashier-storage
 */
export const pendingSalesPredicate = {
  sql: PENDING_SALES_SQL,
  /**
   * Returns the NOT EXISTS guard as a SQL snippet you can safely append to a WHERE clause.
   * Alias field must be `sih`.
   */
  notExistsSalesReceipt: `
    NOT EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = sih.id)
  `,
  notExistsRefundReceipt: `
    NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)
  `,
};

export const pendingReturnsPredicate = {
  sql: PENDING_RETURNS_SQL,
  notExistsSalesReceipt:   pendingSalesPredicate.notExistsSalesReceipt,
  notExistsRefundReceipt:  pendingSalesPredicate.notExistsRefundReceipt,
};

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  DIAGNOSTIC — Consistency Report
 *  تشخيص التناسق بين الإيصالات وحالة الفواتير
 *
 *  يكشف:
 *  1. ghost_sales   — فاتورة مبيعات لها إيصال لكن status لا يزال finalized
 *  2. ghost_returns — مرتجع له إيصال صرف لكن status لا يزال finalized
 *
 *  المدة المتوقعة لأي ghost: صفر.
 *  أي صف في هذا التقرير يعني أن هناك بيانات بحاجة إصلاح.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface CashierConsistencyRow {
  type: "ghost_sale" | "ghost_return";
  invoiceId: string;
  invoiceNumber: number;
  pharmacyId: string | null;
  status: string;
  receiptCount: number;
  refundReceiptCount: number;
}

export interface CashierConsistencyReport {
  ok: boolean;
  ghostSalesCount: number;
  ghostReturnsCount: number;
  rows: CashierConsistencyRow[];
}

export async function getCashierConsistencyReport(): Promise<CashierConsistencyReport> {
  const result = await pool.query<{
    type: "ghost_sale" | "ghost_return";
    invoice_id: string;
    invoice_number: number;
    pharmacy_id: string | null;
    status: string;
    receipt_count: string;
    refund_receipt_count: string;
  }>(`
    -- ghost sales: has cashier_receipt but status still finalized
    SELECT
      'ghost_sale'::text             AS type,
      sih.id                         AS invoice_id,
      sih.invoice_number,
      sih.pharmacy_id,
      sih.status::text,
      (SELECT COUNT(*) FROM cashier_receipts        cr  WHERE cr.invoice_id  = sih.id)::int AS receipt_count,
      (SELECT COUNT(*) FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)::int AS refund_receipt_count
    FROM sales_invoice_headers sih
    WHERE sih.status = 'finalized'
      AND sih.is_return = false
      AND EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = sih.id)

    UNION ALL

    -- ghost returns: has cashier_refund_receipt but status still finalized
    SELECT
      'ghost_return'::text           AS type,
      sih.id                         AS invoice_id,
      sih.invoice_number,
      sih.pharmacy_id,
      sih.status::text,
      (SELECT COUNT(*) FROM cashier_receipts        cr  WHERE cr.invoice_id  = sih.id)::int AS receipt_count,
      (SELECT COUNT(*) FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)::int AS refund_receipt_count
    FROM sales_invoice_headers sih
    WHERE sih.status = 'finalized'
      AND sih.is_return = true
      AND EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)

    ORDER BY invoice_number
  `);

  const rows: CashierConsistencyRow[] = result.rows.map(r => ({
    type:              r.type,
    invoiceId:         r.invoice_id,
    invoiceNumber:     r.invoice_number,
    pharmacyId:        r.pharmacy_id,
    status:            r.status,
    receiptCount:      Number(r.receipt_count),
    refundReceiptCount: Number(r.refund_receipt_count),
  }));

  const ghostSalesCount   = rows.filter(r => r.type === "ghost_sale").length;
  const ghostReturnsCount = rows.filter(r => r.type === "ghost_return").length;

  return {
    ok: rows.length === 0,
    ghostSalesCount,
    ghostReturnsCount,
    rows,
  };
}

/*
 * repairGhostInvoices
 * إصلاح ذري للفواتير الوهمية — يُحدّث status إلى 'collected'
 * مقيّد ببيئة التطوير والـ admin endpoints فقط.
 * يُعيد قائمة الفواتير المُصلحة.
 */
export async function repairGhostInvoices(): Promise<{
  repairedCount: number;
  repairedIds: string[];
}> {
  const result = await pool.query<{ id: string; invoice_number: number }>(`
    UPDATE sales_invoice_headers
    SET status = 'collected', updated_at = NOW()
    WHERE status = 'finalized'
      AND (
        EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = id)
        OR
        EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = id)
      )
    RETURNING id, invoice_number
  `);

  return {
    repairedCount: result.rowCount ?? 0,
    repairedIds:   result.rows.map(r => r.id),
  };
}
