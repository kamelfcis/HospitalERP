-- ============================================================
-- reporting/05_recon_checks.sql
--
-- Step 6.5 — Business Reconciliation Checks
--
-- PURPOSE: Prove that the reporting layer is not only
-- executable but also numerically correct.  For each check,
-- the rpt table result is compared side-by-side with a direct
-- aggregation from the transactional source tables, using
-- the IDENTICAL WHERE clauses and arithmetic that the refresh
-- function uses.  The diff column must be 0 for every row.
--
-- USAGE:
--   1. Edit the four \set blocks at the top of each section
--      to match test data that already exists in staging.
--   2. Run each section individually, or the whole file:
--        psql "$STAGING_DATABASE_URL" -f reporting/05_recon_checks.sql
--   3. Every "diff" column must show 0.  Any non-zero value
--      is a bug — open the detailed diagnostic query to
--      identify the discrepant rows.
--
-- PRECONDITION:
--   rpt_refresh_daily_revenue(:test_date),
--   rpt_refresh_patient_service_lines(:invoice_id),
--   rpt_refresh_account_balances(:period_id),
--   rpt_refresh_item_movements(:item_id, :wh_id, :date)
--   must all have been run successfully before executing
--   these checks (confirmed via rpt_refresh_log.status).
--
-- NOTE ON NULL patient_id (walk-ins):
--   rpt_patient_revenue uses a partial unique index for
--   walk-ins (patient_id IS NULL).  Check 2 covers a single
--   named invoice_id so this is not relevant there.
-- ============================================================


-- ============================================================
-- PREFLIGHT: Confirm the four tables have fresh data
-- ============================================================
\echo '=== PREFLIGHT: last successful refresh per table ==='

SELECT
    report_table_name,
    refresh_function,
    status,
    refresh_end_at,
    duration_ms,
    rows_affected,
    error_message
FROM rpt_refresh_log
WHERE report_table_name IN (
        'rpt_daily_revenue',
        'rpt_patient_service_usage',
        'rpt_account_balances_by_period',
        'rpt_item_movements_summary'
      )
  AND status IN ('success', 'failed')
ORDER BY report_table_name, refresh_end_at DESC;

-- ============================================================
-- CHECK 1 — Daily Revenue
--
-- Scope: one calendar date (p_test_date).
-- rpt source: rpt_daily_revenue WHERE revenue_date = :date
-- txn source: patient_invoice_headers  (status IN
--             ('finalized','paid')) UNION
--             sales_invoice_headers    (status = 'finalized')
--             for the same date.
--
-- NOTE: The refresh function sums patient_invoice_headers
-- totals at the HEADER level (total_amount, discount_amount,
-- net_amount), not by aggregating lines.  Voided lines do NOT
-- reduce the header totals — they are tracked separately in
-- rpt_patient_service_usage.  The source query below mirrors
-- this behaviour.
-- ============================================================
\echo ''
\echo '=== CHECK 1: Daily Revenue ==='

-- Set to any date that has finalized invoices in staging:
\set test_date '''2026-01-15'''

WITH rpt AS (
    SELECT
        COALESCE(SUM(total_gross),    0) AS rpt_gross,
        COALESCE(SUM(total_discount), 0) AS rpt_discount,
        COALESCE(SUM(total_net),      0) AS rpt_net,
        COALESCE(SUM(invoice_count),  0) AS rpt_invoices
    FROM rpt_daily_revenue
    WHERE revenue_date = :test_date
),
src_patient AS (
    -- Exactly the filter from rpt_refresh_daily_revenue function
    SELECT
        COALESCE(SUM(total_amount),    0) AS gross,
        COALESCE(SUM(discount_amount), 0) AS discount,
        COALESCE(SUM(net_amount),      0) AS net,
        COUNT(DISTINCT id)                AS invoices
    FROM patient_invoice_headers
    WHERE invoice_date        = :test_date
      AND status::TEXT IN ('finalized', 'paid')
),
src_sales AS (
    -- Exactly the filter from rpt_refresh_daily_revenue function
    SELECT
        COALESCE(SUM(subtotal),       0) AS gross,
        COALESCE(SUM(discount_value), 0) AS discount,
        COALESCE(SUM(net_total),      0) AS net,
        COUNT(DISTINCT id)               AS invoices
    FROM sales_invoice_headers
    WHERE invoice_date        = :test_date
      AND status::TEXT        = 'finalized'
),
src AS (
    SELECT
        src_patient.gross + src_sales.gross       AS src_gross,
        src_patient.discount + src_sales.discount AS src_discount,
        src_patient.net + src_sales.net           AS src_net,
        src_patient.invoices + src_sales.invoices AS src_invoices
    FROM src_patient, src_sales
)
SELECT
    :test_date                             AS scope_date,

    rpt.rpt_gross                          AS rpt_total_gross,
    src.src_gross                          AS src_total_gross,
    ROUND(rpt.rpt_gross - src.src_gross, 4)  AS diff_gross,

    rpt.rpt_discount                       AS rpt_total_discount,
    src.src_discount                       AS src_total_discount,
    ROUND(rpt.rpt_discount - src.src_discount, 4) AS diff_discount,

    rpt.rpt_net                            AS rpt_total_net,
    src.src_net                            AS src_total_net,
    ROUND(rpt.rpt_net - src.src_net, 4)    AS diff_net,

    rpt.rpt_invoices                       AS rpt_invoice_count,
    src.src_invoices                       AS src_invoice_count,
    (rpt.rpt_invoices - src.src_invoices)  AS diff_invoice_count,

    CASE
        WHEN ROUND(rpt.rpt_gross    - src.src_gross,    4) = 0
         AND ROUND(rpt.rpt_discount - src.src_discount, 4) = 0
         AND ROUND(rpt.rpt_net      - src.src_net,      4) = 0
         AND (rpt.rpt_invoices - src.src_invoices)         = 0
        THEN 'PASS'
        ELSE 'FAIL'
    END                                    AS result
FROM rpt, src;

-- Diagnostic: break down by source_type to isolate which
-- stream (patient_invoice vs sales_pharmacy) has the diff:
\echo '--- Check 1 detail: rpt_daily_revenue by source_type ---'
SELECT
    source_type,
    SUM(invoice_count)  AS rpt_invoices,
    SUM(total_gross)    AS rpt_gross,
    SUM(total_discount) AS rpt_discount,
    SUM(total_net)      AS rpt_net
FROM rpt_daily_revenue
WHERE revenue_date = :test_date
GROUP BY source_type
ORDER BY source_type;


-- ============================================================
-- CHECK 2 — Patient Service Usage
--
-- Scope: one invoice_id (p_test_invoice_id).
-- rpt source: rpt_patient_service_usage WHERE invoice_id = :id
-- txn source: patient_invoice_lines WHERE header_id = :id
--
-- The refresh function creates one rpt row per line (keyed on
-- source_line_id = patient_invoice_lines.id).  Void status
-- and total_price are copied verbatim.  No arithmetic is
-- applied — the check here validates row count AND the sum
-- of total_price across all non-void lines.
-- ============================================================
\echo ''
\echo '=== CHECK 2: Patient Service Usage ==='

-- Set to the id of any finalized patient_invoice_headers row
-- that has been processed by rpt_refresh_patient_service_lines:
\set test_invoice_id '''PIH-XXXXXXXX'''

WITH rpt AS (
    SELECT
        COUNT(*)                                                      AS rpt_row_count,
        COALESCE(SUM(total_price) FILTER (WHERE NOT is_void), 0)     AS rpt_net_total,
        COUNT(*) FILTER (WHERE is_void)                              AS rpt_void_count
    FROM rpt_patient_service_usage
    WHERE invoice_id = :test_invoice_id
),
src AS (
    SELECT
        COUNT(*)                                                      AS src_row_count,
        COALESCE(SUM(total_price) FILTER (WHERE NOT is_void), 0)     AS src_net_total,
        COUNT(*) FILTER (WHERE is_void)                              AS src_void_count
    FROM patient_invoice_lines
    WHERE header_id = :test_invoice_id
)
SELECT
    :test_invoice_id                                                AS scope_invoice_id,

    rpt.rpt_row_count                                               AS rpt_row_count,
    src.src_row_count                                               AS src_row_count,
    (rpt.rpt_row_count - src.src_row_count)                        AS diff_row_count,

    rpt.rpt_net_total                                               AS rpt_net_total,
    src.src_net_total                                               AS src_net_total,
    ROUND(rpt.rpt_net_total - src.src_net_total, 4)                AS diff_net_total,

    rpt.rpt_void_count                                              AS rpt_void_count,
    src.src_void_count                                              AS src_void_count,
    (rpt.rpt_void_count - src.src_void_count)                      AS diff_void_count,

    CASE
        WHEN (rpt.rpt_row_count - src.src_row_count) = 0
         AND ROUND(rpt.rpt_net_total - src.src_net_total, 4) = 0
         AND (rpt.rpt_void_count - src.src_void_count) = 0
        THEN 'PASS'
        ELSE 'FAIL'
    END                                                             AS result
FROM rpt, src;

-- Diagnostic: show rpt rows vs source rows side by side at
-- line level to pinpoint which line_id drifted:
\echo '--- Check 2 detail: line-by-line comparison ---'
SELECT
    src.id                           AS source_line_id,
    src.line_type,
    src.is_void                      AS src_is_void,
    src.total_price                  AS src_total_price,
    rpt.is_void                      AS rpt_is_void,
    rpt.total_price                  AS rpt_total_price,
    ROUND(rpt.total_price - src.total_price, 4) AS diff_price,
    CASE WHEN rpt.source_line_id IS NULL THEN 'MISSING_IN_RPT'
         WHEN src.id           IS NULL THEN 'ORPHAN_IN_RPT'
         WHEN ROUND(rpt.total_price - src.total_price, 4) <> 0 THEN 'PRICE_MISMATCH'
         WHEN rpt.is_void <> src.is_void THEN 'VOID_MISMATCH'
         ELSE 'OK'
    END                              AS line_status
FROM patient_invoice_lines      src
FULL OUTER JOIN rpt_patient_service_usage rpt
    ON rpt.source_line_id = src.id
WHERE COALESCE(src.header_id, rpt.invoice_id) = :test_invoice_id
ORDER BY src.id;


-- ============================================================
-- CHECK 3 — Account Balances
--
-- Scope: one fiscal_period_id × one account_id.
-- rpt source: rpt_account_balances_by_period
--             WHERE period_id = :period AND account_id = :acct
--               AND cost_center_id IS NULL
-- txn source: journal_lines JOIN journal_entries
--             WHERE period_id = :period AND status = 'posted'
--               AND account_id = :acct AND cost_center_id IS NULL
--
-- The closing_balance formula in the refresh function is:
--   asset/expense:   opening_balance + debit - credit
--   other:           opening_balance - debit + credit
-- We replicate it here directly.
-- ============================================================
\echo ''
\echo '=== CHECK 3: Account Balances ==='

-- Set to a real fiscal_periods.id and accounts.id:
\set test_period_id  '''FP-2026-01'''
\set test_account_id '''4001'''

WITH rpt AS (
    SELECT
        period_debit,
        period_credit,
        closing_balance,
        opening_balance,
        account_type,
        journal_line_count
    FROM rpt_account_balances_by_period
    WHERE period_id       = :test_period_id
      AND account_id      = :test_account_id
      AND cost_center_id  IS NULL
),
src AS (
    SELECT
        COALESCE(SUM(jl.debit),  0)  AS src_debit,
        COALESCE(SUM(jl.credit), 0)  AS src_credit,
        COUNT(*)                     AS src_line_count
    FROM journal_lines   jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.period_id      = :test_period_id
      AND je.status::TEXT   = 'posted'
      AND jl.account_id     = :test_account_id
      AND jl.cost_center_id IS NULL
),
opening AS (
    -- opening_balance is stored on the accounts table directly
    SELECT opening_balance, account_type
    FROM accounts
    WHERE id = :test_account_id
    LIMIT 1
)
SELECT
    :test_period_id                                              AS scope_period,
    :test_account_id                                             AS scope_account,

    rpt.period_debit                                            AS rpt_debit,
    src.src_debit                                               AS src_debit,
    ROUND(rpt.period_debit - src.src_debit, 4)                 AS diff_debit,

    rpt.period_credit                                           AS rpt_credit,
    src.src_credit                                              AS src_credit,
    ROUND(rpt.period_credit - src.src_credit, 4)               AS diff_credit,

    opening.opening_balance                                     AS opening_balance,
    opening.account_type,

    -- Replicate the refresh function closing balance formula:
    CASE WHEN opening.account_type IN ('asset', 'expense')
         THEN ROUND(opening.opening_balance + src.src_debit - src.src_credit, 4)
         ELSE ROUND(opening.opening_balance - src.src_debit + src.src_credit, 4)
    END                                                         AS expected_closing_balance,
    rpt.closing_balance                                         AS rpt_closing_balance,
    ROUND(
        rpt.closing_balance -
        CASE WHEN opening.account_type IN ('asset','expense')
             THEN opening.opening_balance + src.src_debit - src.src_credit
             ELSE opening.opening_balance - src.src_debit + src.src_credit
        END, 4
    )                                                           AS diff_closing_balance,

    rpt.journal_line_count                                      AS rpt_line_count,
    src.src_line_count                                          AS src_line_count,
    (rpt.journal_line_count - src.src_line_count)              AS diff_line_count,

    CASE
        WHEN ROUND(rpt.period_debit  - src.src_debit,  4) = 0
         AND ROUND(rpt.period_credit - src.src_credit, 4) = 0
         AND ROUND(
              rpt.closing_balance -
              CASE WHEN opening.account_type IN ('asset','expense')
                   THEN opening.opening_balance + src.src_debit - src.src_credit
                   ELSE opening.opening_balance - src.src_debit + src.src_credit
              END, 4
             ) = 0
        THEN 'PASS'
        ELSE 'FAIL'
    END                                                         AS result
FROM rpt, src, opening;

-- Diagnostic: list the individual posted journal entries that
-- contributed to the source aggregation to aid in tracing
-- any discrepancy back to a specific entry:
\echo '--- Check 3 detail: posted entries for this account+period ---'
SELECT
    je.id            AS entry_id,
    je.entry_date,
    je.status,
    jl.debit,
    jl.credit,
    jl.description
FROM journal_lines   jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.period_id    = :test_period_id
  AND je.status::TEXT = 'posted'
  AND jl.account_id   = :test_account_id
  AND jl.cost_center_id IS NULL
ORDER BY je.entry_date, je.id;


-- ============================================================
-- CHECK 4 — Inventory Movement Summary
--
-- Scope: one item_id × one warehouse_id × one date range.
-- rpt source: rpt_item_movements_summary
--             WHERE item_id = :item AND warehouse_id = :wh
--               AND movement_date BETWEEN :start AND :end
-- txn source: inventory_lot_movements
--             JOIN inventory_lots ON lot_id
--             WHERE lots.item_id = :item
--               AND movements.warehouse_id = :wh
--               AND tx_date::DATE BETWEEN :start AND :end
--
-- tx_type mapping (from rpt_refresh_item_movements function):
--   received_qty : tx_type = 'receive'
--   issued_qty   : tx_type IN ('sale', 'patient_sale')
--   return_in    : tx_type = 'return_in'
--   return_out   : tx_type = 'return_out'
--   transfer_in  : tx_type = 'transfer_in'
--   transfer_out : tx_type = 'transfer_out'
--   adjustment   : tx_type = 'adjustment'
--   net_qty_change: SUM(qty_change_in_minor) regardless of type
--
-- qty_change_in_minor is POSITIVE for inflows ('receive',
-- 'return_in', 'transfer_in') and NEGATIVE for outflows
-- ('sale', 'patient_sale', 'return_out', 'transfer_out').
-- issued_qty and return_out_qty are stored as positive values
-- in the rpt table so we use ABS() on the source.
-- ============================================================
\echo ''
\echo '=== CHECK 4: Inventory Movement Summary ==='

-- Set to a real item_id, warehouse_id, and date range:
\set test_item_id  '''ITEM-0001'''
\set test_wh_id    '''WH-MAIN'''
\set test_start    '''2026-01-01'''
\set test_end      '''2026-01-31'''

WITH rpt AS (
    SELECT
        COALESCE(SUM(received_qty),    0) AS rpt_received,
        COALESCE(SUM(received_value),  0) AS rpt_received_val,
        COALESCE(SUM(issued_qty),      0) AS rpt_issued,
        COALESCE(SUM(issued_value),    0) AS rpt_issued_val,
        COALESCE(SUM(return_in_qty),   0) AS rpt_return_in,
        COALESCE(SUM(return_out_qty),  0) AS rpt_return_out,
        COALESCE(SUM(transfer_in_qty), 0) AS rpt_transfer_in,
        COALESCE(SUM(transfer_out_qty),0) AS rpt_transfer_out,
        COALESCE(SUM(adjustment_qty),  0) AS rpt_adjustment,
        COALESCE(SUM(net_qty_change),  0) AS rpt_net_change
    FROM rpt_item_movements_summary
    WHERE item_id      = :test_item_id
      AND warehouse_id = :test_wh_id
      AND movement_date BETWEEN :test_start AND :test_end
),
src AS (
    -- Mirror the exact FILTER expressions from rpt_refresh_item_movements
    SELECT
        -- Received: positive qty movements with tx_type='receive'
        COALESCE(SUM(m.qty_change_in_minor)
            FILTER (WHERE m.tx_type::TEXT = 'receive'),
            0)                                                           AS src_received,
        COALESCE(SUM(m.qty_change_in_minor * COALESCE(m.unit_cost, 0))
            FILTER (WHERE m.tx_type::TEXT = 'receive'),
            0)                                                           AS src_received_val,
        -- Issued: negative qty, stored as ABS in rpt
        COALESCE(ABS(SUM(m.qty_change_in_minor))
            FILTER (WHERE m.tx_type::TEXT IN ('sale', 'patient_sale')),
            0)                                                           AS src_issued,
        COALESCE(ABS(SUM(m.qty_change_in_minor * COALESCE(m.unit_cost, 0)))
            FILTER (WHERE m.tx_type::TEXT IN ('sale', 'patient_sale')),
            0)                                                           AS src_issued_val,
        -- Returns
        COALESCE(SUM(m.qty_change_in_minor)
            FILTER (WHERE m.tx_type::TEXT = 'return_in'),
            0)                                                           AS src_return_in,
        COALESCE(ABS(SUM(m.qty_change_in_minor))
            FILTER (WHERE m.tx_type::TEXT = 'return_out'),
            0)                                                           AS src_return_out,
        -- Transfers
        COALESCE(SUM(m.qty_change_in_minor)
            FILTER (WHERE m.tx_type::TEXT = 'transfer_in'),
            0)                                                           AS src_transfer_in,
        COALESCE(ABS(SUM(m.qty_change_in_minor))
            FILTER (WHERE m.tx_type::TEXT = 'transfer_out'),
            0)                                                           AS src_transfer_out,
        -- Adjustments
        COALESCE(SUM(m.qty_change_in_minor)
            FILTER (WHERE m.tx_type::TEXT = 'adjustment'),
            0)                                                           AS src_adjustment,
        -- Net (all tx types summed, sign preserved)
        COALESCE(SUM(m.qty_change_in_minor), 0)                         AS src_net_change
    FROM inventory_lot_movements m
    JOIN inventory_lots          l ON l.id = m.lot_id
    WHERE l.item_id         = :test_item_id
      AND m.warehouse_id    = :test_wh_id
      AND m.tx_date::DATE BETWEEN :test_start AND :test_end
)
SELECT
    :test_item_id                                              AS scope_item,
    :test_wh_id                                                AS scope_warehouse,
    :test_start || ' → ' || :test_end                         AS scope_dates,

    rpt.rpt_received                                          AS rpt_received_qty,
    src.src_received                                          AS src_received_qty,
    ROUND(rpt.rpt_received - src.src_received, 4)            AS diff_received_qty,

    rpt.rpt_received_val                                      AS rpt_received_val,
    src.src_received_val                                      AS src_received_val,
    ROUND(rpt.rpt_received_val - src.src_received_val, 4)    AS diff_received_val,

    rpt.rpt_issued                                            AS rpt_issued_qty,
    src.src_issued                                            AS src_issued_qty,
    ROUND(rpt.rpt_issued - src.src_issued, 4)                AS diff_issued_qty,

    rpt.rpt_issued_val                                        AS rpt_issued_val,
    src.src_issued_val                                        AS src_issued_val,
    ROUND(rpt.rpt_issued_val - src.src_issued_val, 4)        AS diff_issued_val,

    rpt.rpt_return_in                                         AS rpt_return_in,
    src.src_return_in                                         AS src_return_in,
    ROUND(rpt.rpt_return_in - src.src_return_in, 4)          AS diff_return_in,

    rpt.rpt_return_out                                        AS rpt_return_out,
    src.src_return_out                                        AS src_return_out,
    ROUND(rpt.rpt_return_out - src.src_return_out, 4)        AS diff_return_out,

    rpt.rpt_transfer_in                                       AS rpt_transfer_in,
    src.src_transfer_in                                       AS src_transfer_in,
    ROUND(rpt.rpt_transfer_in - src.src_transfer_in, 4)      AS diff_transfer_in,

    rpt.rpt_transfer_out                                      AS rpt_transfer_out,
    src.src_transfer_out                                      AS src_transfer_out,
    ROUND(rpt.rpt_transfer_out - src.src_transfer_out, 4)    AS diff_transfer_out,

    rpt.rpt_adjustment                                        AS rpt_adjustment,
    src.src_adjustment                                        AS src_adjustment,
    ROUND(rpt.rpt_adjustment - src.src_adjustment, 4)        AS diff_adjustment,

    rpt.rpt_net_change                                        AS rpt_net_change,
    src.src_net_change                                        AS src_net_change,
    ROUND(rpt.rpt_net_change - src.src_net_change, 4)        AS diff_net_change,

    CASE
        WHEN ROUND(rpt.rpt_received    - src.src_received,    4) = 0
         AND ROUND(rpt.rpt_issued      - src.src_issued,      4) = 0
         AND ROUND(rpt.rpt_return_in   - src.src_return_in,   4) = 0
         AND ROUND(rpt.rpt_return_out  - src.src_return_out,  4) = 0
         AND ROUND(rpt.rpt_transfer_in - src.src_transfer_in, 4) = 0
         AND ROUND(rpt.rpt_transfer_out- src.src_transfer_out,4) = 0
         AND ROUND(rpt.rpt_adjustment  - src.src_adjustment,  4) = 0
         AND ROUND(rpt.rpt_net_change  - src.src_net_change,  4) = 0
        THEN 'PASS'
        ELSE 'FAIL'
    END                                                        AS result
FROM rpt, src;

-- Diagnostic: break down source movements by tx_type and date
-- so a failed diff can be traced to a specific transaction:
\echo '--- Check 4 detail: source movements by date and tx_type ---'
SELECT
    m.tx_date::DATE                        AS tx_date,
    m.tx_type::TEXT                        AS tx_type,
    COUNT(*)                               AS tx_count,
    SUM(m.qty_change_in_minor)             AS qty_sum,
    SUM(m.qty_change_in_minor * COALESCE(m.unit_cost, 0)) AS value_sum,
    MIN(m.reference_type)                  AS sample_reference_type,
    MIN(m.reference_id)                    AS sample_reference_id
FROM inventory_lot_movements m
JOIN inventory_lots          l ON l.id = m.lot_id
WHERE l.item_id         = :test_item_id
  AND m.warehouse_id    = :test_wh_id
  AND m.tx_date::DATE BETWEEN :test_start AND :test_end
GROUP BY m.tx_date::DATE, m.tx_type::TEXT
ORDER BY m.tx_date::DATE, m.tx_type::TEXT;


-- ============================================================
-- SUMMARY: All checks side by side
-- ============================================================
\echo ''
\echo '=== RECONCILIATION SUMMARY ==='
\echo 'Re-run each section individually if any check shows FAIL.'
\echo 'All diff columns must be 0 for the reporting layer to be'
\echo 'considered numerically correct and safe for production.'
