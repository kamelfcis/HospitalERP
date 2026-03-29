/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  cashier-pending.ts — Centralized "Pending Document" Business Logic
 *  المصدر الوحيد للحقيقة: تعريف "المستند المعلّق" في نظام الكاشير
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ╔══════════════════════════════════════════════════════════════════════════╗
 *  ║  THIS MODULE IS READ-ONLY — NO WRITE OPERATIONS ALLOWED                ║
 *  ║  هذا الملف للقراءة فقط — ممنوع منعاً باتاً أي INSERT / UPDATE / DELETE  ║
 *  ║  All writes belong in route handlers or db.transaction() callers only. ║
 *  ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *  sql.raw() safety: ALL constants below are hardcoded internal predicates.
 *  None accept user input. Do NOT interpolate request data into these strings.
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
 * ── SQL predicate fragments ── defined ONCE, used everywhere ────────────────
 *
 *  EXPORTED: use PENDING_SALES_SQL / PENDING_RETURNS_SQL / PENDING_RECEIPT_GUARD_SQL
 *  anywhere in the codebase that needs the predicate — pool.query(), tx.execute(),
 *  or Drizzle sql`...${sql.raw(PENDING_RECEIPT_GUARD_SQL)}...` inside transactions.
 *
 *  DO NOT copy these strings. Import and reuse.
 */

/** Common NOT EXISTS receipt guards — identical for sales and returns */
export const PENDING_RECEIPT_GUARD_SQL = `
  AND NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = sih.id)
  AND NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = sih.id)
`.trim();

/** Full WHERE predicate: sales invoice pending collection
 *  ⚠ فواتير الآجل (customer_type='credit') مستثناة — تُحصَّل عبر شاشة تحصيل الآجل فقط
 *  ⚠ فواتير التوصيل (customer_type='delivery') مستثناة — تُحصَّل عبر شاشة تحصيل التوصيل فقط */
export const PENDING_SALES_SQL = `
  sih.status   = 'finalized'
  AND sih.is_return = false
  AND sih.customer_type NOT IN ('credit', 'delivery')
  ${PENDING_RECEIPT_GUARD_SQL}
`.trim();

/** Full WHERE predicate: return invoice pending refund */
export const PENDING_RETURNS_SQL = `
  sih.status   = 'finalized'
  AND sih.is_return = true
  ${PENDING_RECEIPT_GUARD_SQL}
`.trim();

/** Combined: any document pending collection or refund */
export const PENDING_DOCS_SQL = `
  sih.status = 'finalized'
  ${PENDING_RECEIPT_GUARD_SQL}
`.trim();

/**
 * Preferred alias — identical to PENDING_DOCS_SQL.
 * Use this name when the context is "collection" (cashier drawer).
 * ⚠ sql.raw() safe: constant, no user input, no dynamic concatenation.
 */
export const PENDING_COLLECTION_DOCS_SQL = PENDING_DOCS_SQL;

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
 * ── WRITE OPERATIONS ARE NOT IN THIS FILE ────────────────────────────────
 *
 * cashier-pending.ts is READ-ONLY.
 *
 * The repair operation (repairGhostInvoices) lives in server/routes/reports.ts
 * alongside its endpoint handler, where writes belong.
 *
 * If you need to add admin repair logic, add it there — not here.
 * ─────────────────────────────────────────────────────────────────────────
 */
