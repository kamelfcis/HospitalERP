import { pool } from "../db";
import type { DatabaseStorage } from "./index";
import type {
  CreditInvoiceItem,
  HandoverShiftRow,
  HandoverTotals,
  HandoverSummaryResult,
  HandoverFilters,
} from "./cashier-handover-types";

const summaryMethods = {
  async getDrawerHandoverSummary(
    this: DatabaseStorage,
    filters: HandoverFilters
  ): Promise<HandoverSummaryResult> {
    const {
      from,
      to,
      cashierName,
      status = "all",
      page = 1,
      pageSize = 50,
    } = filters;

    const offset = (page - 1) * pageSize;
    const params: unknown[] = [];
    let paramIdx = 1;

    const conditions: string[] = [];

    if (from) {
      conditions.push(`s.business_date >= $${paramIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`s.business_date <= $${paramIdx++}`);
      params.push(to);
    }
    if (cashierName && cashierName.trim()) {
      conditions.push(`s.cashier_name = $${paramIdx++}`);
      params.push(cashierName.trim());
    }
    if (status && status !== "all") {
      if (status === "open") {
        conditions.push(`s.status IN ('open', 'stale')`);
      } else {
        conditions.push(`s.status = $${paramIdx++}`);
        params.push(status);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const baseQuery = `
      WITH
      receipts_agg AS (
        SELECT shift_id,
               COALESCE(SUM(amount), 0)  AS cash_total,
               COUNT(*)::int             AS sales_count
        FROM cashier_receipts
        GROUP BY shift_id
      ),
      refunds_agg AS (
        SELECT shift_id,
               COALESCE(SUM(amount), 0)  AS refund_total,
               COUNT(*)::int             AS refund_count
        FROM cashier_refund_receipts
        GROUP BY shift_id
      ),
      credit_agg AS (
        SELECT claimed_by_shift_id AS shift_id,
               COALESCE(SUM(net_total), 0) AS credit_total,
               COUNT(*)::int               AS credit_count
        FROM sales_invoice_headers
        WHERE is_return = false
          AND customer_type = 'credit'
          AND status IN ('finalized', 'collected')
          AND claimed_by_shift_id IS NOT NULL
        GROUP BY claimed_by_shift_id
      ),
      delivery_agg AS (
        SELECT
          COALESCE(
            dr.shift_id,
            (SELECT cs.id FROM cashier_shifts cs
             WHERE cs.gl_account_id = dr.gl_account_id
               AND dr.gl_account_id IS NOT NULL
             ORDER BY cs.opened_at DESC LIMIT 1)
          ) AS shift_id,
          COALESCE(SUM(dr.total_amount::numeric), 0) AS delivery_total,
          COUNT(*)::int                              AS delivery_count
        FROM delivery_receipts dr
        GROUP BY 1
      ),
      credit_collected_agg AS (
        SELECT shift_id,
               COALESCE(SUM(total_amount::numeric), 0) AS credit_collected_total,
               COUNT(*)::int                           AS credit_collected_count
        FROM customer_receipts
        WHERE shift_id IS NOT NULL
        GROUP BY shift_id
      ),
      supplier_paid_agg AS (
        SELECT shift_id,
               COALESCE(SUM(total_amount::numeric), 0) AS supplier_paid_total,
               COUNT(*)::int                           AS supplier_paid_count
        FROM supplier_payments
        WHERE shift_id IS NOT NULL
        GROUP BY shift_id
      )
      SELECT
        s.id                                                        AS "shiftId",
        s.business_date                                             AS "shiftDate",
        s.opened_at                                                 AS "openedAt",
        s.closed_at                                                 AS "closedAt",
        s.cashier_id                                                AS "cashierId",
        s.cashier_name                                              AS "cashierName",
        s.pharmacy_id                                               AS "pharmacyId",
        p.name_ar                                                   AS "pharmacyName",
        s.unit_type                                                 AS "unitType",
        s.status,
        COALESCE(s.opening_cash, 0)::float                         AS "openingCash",
        COALESCE(s.closing_cash, 0)::float                         AS "closingCash",
        COALESCE(s.expected_cash, 0)::float                        AS "expectedCash",
        (COALESCE(s.closing_cash, 0)
          - (COALESCE(s.opening_cash, 0)
             + COALESCE(r.cash_total, 0)
             + COALESCE(cc.credit_collected_total, 0)
             + COALESCE(d.delivery_total, 0)
             - COALESCE(ref.refund_total, 0)
             - COALESCE(sp.supplier_paid_total, 0))
        )::float                                                    AS "variance",
        COALESCE(r.cash_total, 0)::float                           AS "cashSalesTotal",
        COALESCE(c.credit_total, 0)::float                         AS "creditSalesTotal",
        COALESCE(cc.credit_collected_total, 0)::float              AS "creditCollected",
        COALESCE(sp.supplier_paid_total, 0)::float                 AS "supplierPaid",
        COALESCE(d.delivery_total, 0)::float                       AS "deliveryCollectedTotal",
        (COALESCE(r.sales_count, 0) + COALESCE(c.credit_count, 0))::int AS "salesInvoiceCount",
        COALESCE(ref.refund_total, 0)::float                       AS "returnsTotal",
        COALESCE(ref.refund_count, 0)::int                         AS "returnInvoiceCount",
        (COALESCE(r.cash_total, 0) + COALESCE(c.credit_total, 0) + COALESCE(d.delivery_total, 0) - COALESCE(ref.refund_total, 0))::float AS "netTotal",
        COALESCE(s.closing_cash, 0)::float                         AS "transferredToTreasury",
        s.handover_receipt_number                                   AS "handoverReceiptNumber"
      FROM cashier_shifts s
      LEFT JOIN pharmacies p             ON p.id = s.pharmacy_id
      LEFT JOIN receipts_agg r           ON r.shift_id   = s.id
      LEFT JOIN refunds_agg ref          ON ref.shift_id  = s.id
      LEFT JOIN credit_agg c             ON c.shift_id    = s.id
      LEFT JOIN delivery_agg d           ON d.shift_id    = s.id
      LEFT JOIN credit_collected_agg cc  ON cc.shift_id   = s.id
      LEFT JOIN supplier_paid_agg sp     ON sp.shift_id   = s.id
      ${whereClause}
    `;

    const countParams = [...params];
    const countQuery = `
      WITH
      receipts_agg AS (SELECT shift_id FROM cashier_receipts GROUP BY shift_id),
      refunds_agg  AS (SELECT shift_id FROM cashier_refund_receipts GROUP BY shift_id),
      credit_agg   AS (SELECT claimed_by_shift_id AS shift_id FROM sales_invoice_headers WHERE claimed_by_shift_id IS NOT NULL GROUP BY claimed_by_shift_id)
      SELECT COUNT(*)::int AS total
      FROM cashier_shifts s
      LEFT JOIN pharmacies p ON p.id = s.pharmacy_id
      LEFT JOIN receipts_agg r   ON r.shift_id   = s.id
      LEFT JOIN refunds_agg ref  ON ref.shift_id  = s.id
      LEFT JOIN credit_agg c     ON c.shift_id    = s.id
      ${whereClause}
    `;

    const dataParams = [...params, pageSize, offset];
    const dataQuery = `
      ${baseQuery}
      ORDER BY s.opened_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, countParams),
      pool.query(dataQuery, dataParams),
    ]);

    const total = parseInt(countResult.rows[0]?.total || "0");
    const baseRows = dataResult.rows as Omit<HandoverShiftRow, "creditInvoices">[];

    const shiftIds = baseRows.map(r => r.shiftId).filter(Boolean);
    const creditInvoiceMap = new Map<string, CreditInvoiceItem[]>();
    if (shiftIds.length > 0) {
      const placeholders = shiftIds.map((_, i) => `$${i + 1}`).join(", ");
      const ciResult = await pool.query<{
        invoiceId: string; invoiceNumber: number; customerName: string | null;
        netTotal: number; invoiceDate: string; shiftId: string;
      }>(`
        SELECT id AS "invoiceId",
               invoice_number AS "invoiceNumber",
               customer_name  AS "customerName",
               net_total::float AS "netTotal",
               invoice_date   AS "invoiceDate",
               claimed_by_shift_id AS "shiftId"
        FROM sales_invoice_headers
        WHERE is_return = false
          AND customer_type = 'credit'
          AND status IN ('finalized', 'collected')
          AND claimed_by_shift_id IN (${placeholders})
        ORDER BY invoice_date, invoice_number
      `, shiftIds);
      for (const ci of ciResult.rows) {
        if (!creditInvoiceMap.has(ci.shiftId)) creditInvoiceMap.set(ci.shiftId, []);
        creditInvoiceMap.get(ci.shiftId)!.push({
          invoiceId: ci.invoiceId,
          invoiceNumber: ci.invoiceNumber,
          customerName: ci.customerName,
          netTotal: ci.netTotal,
          invoiceDate: ci.invoiceDate,
        });
      }
    }

    const rows: HandoverShiftRow[] = baseRows.map(r => ({
      ...r,
      creditInvoices: creditInvoiceMap.get(r.shiftId) ?? [],
    }));

    const totals: HandoverTotals = {
      totalCashSales:             rows.reduce((s, r) => s + r.cashSalesTotal, 0),
      totalCreditSales:           rows.reduce((s, r) => s + r.creditSalesTotal, 0),
      totalCreditCollected:       rows.reduce((s, r) => s + r.creditCollected, 0),
      totalSupplierPaid:          rows.reduce((s, r) => s + r.supplierPaid, 0),
      totalDeliveryCollected:     rows.reduce((s, r) => s + r.deliveryCollectedTotal, 0),
      totalSalesInvoiceCount:     rows.reduce((s, r) => s + r.salesInvoiceCount, 0),
      totalReturns:               rows.reduce((s, r) => s + r.returnsTotal, 0),
      totalReturnInvoiceCount:    rows.reduce((s, r) => s + r.returnInvoiceCount, 0),
      totalNet:                   rows.reduce((s, r) => s + r.netTotal, 0),
      totalTransferredToTreasury: rows.reduce((s, r) => s + r.transferredToTreasury, 0),
      rowCount:                   total,
    };

    return {
      rows,
      totals,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },
};

export default summaryMethods;
