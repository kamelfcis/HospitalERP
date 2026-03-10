-- ============================================================
-- HOSPITAL ERP — REPORTING LAYER
-- File 03: Refresh Logic (PostgreSQL Functions)
-- ============================================================
-- IMPORTANT: These functions read ONLY from transactional
-- tables. They never write to transactional tables.
-- Each function is wrapped in a transaction and uses
-- INSERT ... ON CONFLICT DO UPDATE (upsert) so they are
-- safe to re-run multiple times (idempotent).
-- ============================================================


-- ============================================================
-- HELPER: get department name from id
-- (departments use name_ar in this schema)
-- ============================================================
CREATE OR REPLACE FUNCTION _rpt_dept_name(p_dept_id VARCHAR)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name_ar FROM departments WHERE id = p_dept_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION _rpt_pharmacy_name(p_pharm_id VARCHAR)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name_ar FROM pharmacies WHERE id = p_pharm_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION _rpt_wh_name(p_wh_id VARCHAR)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name_ar FROM warehouses WHERE id = p_wh_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION _rpt_item_name(p_item_id VARCHAR)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name_ar FROM items WHERE id = p_item_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION _rpt_service_name(p_svc_id VARCHAR)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT name_ar FROM services WHERE id = p_svc_id LIMIT 1;
$$;


-- ============================================================
-- 1. rpt_account_balances_by_period
-- Triggered on: journal_entry posted or reversed.
-- Full rebuild for a period_id: call with p_full=true.
-- Incremental (single entry): call with p_full=false,
--   p_entry_id = the newly posted entry id.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_account_balances(
    p_period_id  VARCHAR,
    p_full       BOOLEAN  DEFAULT TRUE,
    p_entry_id   VARCHAR  DEFAULT NULL
)
RETURNS INTEGER    -- rows upserted
LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Step 1: compute period-level balances from journal_lines
    WITH source AS (
        SELECT
            jl.account_id,
            jl.cost_center_id,
            SUM(jl.debit)  AS period_debit,
            SUM(jl.credit) AS period_credit,
            COUNT(*)       AS line_count,
            MAX(je.entry_date) AS last_entry_date
        FROM journal_lines  jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.period_id = p_period_id
          AND je.status    = 'posted'
          AND (p_full = TRUE OR je.id = p_entry_id)
        GROUP BY jl.account_id, jl.cost_center_id
    ),
    acct AS (
        SELECT
            a.id            AS account_id,
            a.code          AS account_code,
            a.name          AS account_name,
            a.account_type  AS account_type,
            a.level         AS account_level,
            a.parent_id     AS parent_account_id,
            a.opening_balance
        FROM accounts a
    ),
    fp AS (
        SELECT id, name, is_closed,
               EXTRACT(YEAR  FROM start_date)::SMALLINT AS p_year,
               EXTRACT(MONTH FROM start_date)::SMALLINT AS p_month
        FROM fiscal_periods WHERE id = p_period_id
        LIMIT 1
    ),
    cc AS (
        SELECT id, code, name FROM cost_centers
    )
    INSERT INTO rpt_account_balances_by_period (
        id, period_id, period_year, period_month, period_name,
        is_period_closed,
        account_id, account_code, account_name, account_type,
        account_level, parent_account_id,
        cost_center_id, cost_center_code, cost_center_name,
        opening_balance, period_debit, period_credit, closing_balance,
        journal_line_count, last_entry_date, refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_period_id,
        fp.p_year,
        fp.p_month,
        fp.name,
        fp.is_closed,
        acct.account_id,
        acct.account_code,
        acct.account_name,
        acct.account_type,
        acct.account_level,
        acct.parent_account_id,
        src.cost_center_id,
        cc.code,
        cc.name,
        acct.opening_balance,
        src.period_debit,
        src.period_credit,
        -- closing balance: assets/expenses grow with debit; liabilities/equity/revenue grow with credit
        CASE WHEN acct.account_type IN ('asset','expense')
             THEN acct.opening_balance + src.period_debit  - src.period_credit
             ELSE acct.opening_balance - src.period_debit  + src.period_credit
        END,
        src.line_count,
        src.last_entry_date,
        NOW()
    FROM source src
    JOIN acct  ON acct.account_id       = src.account_id
    JOIN fp    ON TRUE
    LEFT JOIN cc ON cc.id               = src.cost_center_id
    ON CONFLICT (period_id, account_id, cost_center_id) DO UPDATE SET
        period_debit        = EXCLUDED.period_debit,
        period_credit       = EXCLUDED.period_credit,
        closing_balance     = EXCLUDED.closing_balance,
        journal_line_count  = EXCLUDED.journal_line_count,
        last_entry_date     = EXCLUDED.last_entry_date,
        is_period_closed    = EXCLUDED.is_period_closed,
        refreshed_at        = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- 2. rpt_patient_visit_summary
-- Rebuild a single visit (called on invoice finalize,
-- payment, or discharge).
-- p_visit_type: 'inpatient' or 'outpatient'
-- p_source_id:  admissions.id OR patient_invoice_headers.id
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_patient_visit(
    p_visit_type VARCHAR,
    p_source_id  VARCHAR
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_admission_id VARCHAR;
BEGIN
    -- Resolve which admission or outpatient invoice we're rebuilding
    IF p_visit_type = 'inpatient' THEN
        v_admission_id := p_source_id;
    ELSE
        -- For outpatient: source_id is patient_invoice_headers.id
        v_admission_id := NULL;
    END IF;

    INSERT INTO rpt_patient_visit_summary (
        id, visit_type, source_id, visit_date, discharge_date, los_days,
        period_year, period_month, period_week,
        patient_id, patient_name, patient_type, insurance_company, payment_type,
        department_id, department_name, doctor_name,
        surgery_type_id, surgery_type_name, admission_status,
        invoice_count, total_invoiced, total_discount, net_amount,
        total_paid, outstanding_balance,
        service_revenue, drug_revenue, consumable_revenue, stay_revenue,
        service_line_count, drug_line_count, consumable_line_count,
        refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_visit_type,
        p_source_id,
        CASE WHEN p_visit_type='inpatient' THEN a.admission_date ELSE h.invoice_date END,
        CASE WHEN p_visit_type='inpatient' THEN a.discharge_date ELSE NULL END,
        CASE WHEN p_visit_type='inpatient' AND a.discharge_date IS NOT NULL
             THEN (a.discharge_date - a.admission_date)::NUMERIC
             ELSE NULL END,
        EXTRACT(YEAR  FROM COALESCE(a.admission_date, h.invoice_date))::SMALLINT,
        EXTRACT(MONTH FROM COALESCE(a.admission_date, h.invoice_date))::SMALLINT,
        EXTRACT(WEEK  FROM COALESCE(a.admission_date, h.invoice_date))::SMALLINT,
        COALESCE(a.patient_id, h.patient_id),
        COALESCE(a.patient_name, h.patient_name),
        h.patient_type::TEXT,
        a.insurance_company,
        a.payment_type,
        h.department_id,
        _rpt_dept_name(h.department_id),
        COALESCE(a.doctor_name, h.doctor_name),
        a.surgery_type_id,
        NULL,                         -- surgery_type_name: join surgery_types if needed
        a.status::TEXT,
        agg.invoice_count,
        agg.total_invoiced,
        agg.total_discount,
        agg.net_amount,
        agg.total_paid,
        agg.net_amount - agg.total_paid,
        agg.service_revenue,
        agg.drug_revenue,
        agg.consumable_revenue,
        agg.stay_revenue,
        agg.service_lines,
        agg.drug_lines,
        agg.consumable_lines,
        NOW()
    FROM (
        -- Aggregate invoices linked to this visit
        SELECT
            COUNT(DISTINCT ih.id)                                               AS invoice_count,
            COALESCE(SUM(ih.total_amount),    0)                                AS total_invoiced,
            COALESCE(SUM(ih.discount_amount), 0)                                AS total_discount,
            COALESCE(SUM(ih.net_amount),      0)                                AS net_amount,
            COALESCE(SUM(ih.paid_amount),     0)                                AS total_paid,
            COALESCE(SUM(CASE WHEN il.line_type='service'     AND NOT il.is_void THEN il.total_price ELSE 0 END),0) AS service_revenue,
            COALESCE(SUM(CASE WHEN il.line_type='drug'        AND NOT il.is_void THEN il.total_price ELSE 0 END),0) AS drug_revenue,
            COALESCE(SUM(CASE WHEN il.line_type='consumable'  AND NOT il.is_void THEN il.total_price ELSE 0 END),0) AS consumable_revenue,
            COALESCE(SUM(CASE WHEN il.line_type='stay'        AND NOT il.is_void THEN il.total_price ELSE 0 END),0) AS stay_revenue,
            COUNT(CASE WHEN il.line_type='service'    AND NOT il.is_void THEN 1 END)   AS service_lines,
            COUNT(CASE WHEN il.line_type='drug'       AND NOT il.is_void THEN 1 END)   AS drug_lines,
            COUNT(CASE WHEN il.line_type='consumable' AND NOT il.is_void THEN 1 END)   AS consumable_lines,
            MAX(ih.id) AS last_hdr_id
        FROM patient_invoice_headers ih
        LEFT JOIN patient_invoice_lines il ON il.header_id = ih.id
        WHERE (p_visit_type = 'inpatient'  AND ih.admission_id = p_source_id)
           OR (p_visit_type = 'outpatient' AND ih.id           = p_source_id)
    ) agg
    LEFT JOIN patient_invoice_headers h ON h.id = agg.last_hdr_id
    LEFT JOIN admissions a ON a.id = v_admission_id
    ON CONFLICT ON CONSTRAINT rpt_patient_visit_summary_visit_type_source_id
        DO UPDATE SET
            discharge_date      = EXCLUDED.discharge_date,
            los_days            = EXCLUDED.los_days,
            admission_status    = EXCLUDED.admission_status,
            invoice_count       = EXCLUDED.invoice_count,
            total_invoiced      = EXCLUDED.total_invoiced,
            total_discount      = EXCLUDED.total_discount,
            net_amount          = EXCLUDED.net_amount,
            total_paid          = EXCLUDED.total_paid,
            outstanding_balance = EXCLUDED.outstanding_balance,
            service_revenue     = EXCLUDED.service_revenue,
            drug_revenue        = EXCLUDED.drug_revenue,
            consumable_revenue  = EXCLUDED.consumable_revenue,
            stay_revenue        = EXCLUDED.stay_revenue,
            service_line_count  = EXCLUDED.service_line_count,
            drug_line_count     = EXCLUDED.drug_line_count,
            consumable_line_count = EXCLUDED.consumable_line_count,
            refreshed_at        = NOW();
END;
$$;


-- ============================================================
-- 3. rpt_patient_service_usage
-- Append new lines from a finalised invoice.
-- Safe to call multiple times (ON CONFLICT ... DO UPDATE).
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_patient_service_lines(
    p_invoice_id VARCHAR
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO rpt_patient_service_usage (
        id, source_line_id, invoice_id,
        service_date, period_year, period_month,
        patient_id, patient_name, patient_type, insurance_company,
        department_id, department_name, doctor_name,
        line_type, service_id, service_name, service_category,
        item_id, item_name, item_category,
        quantity, unit_price, discount_amount, total_price,
        unit_cost, cogs, gross_margin,
        is_void, voided_at, refreshed_at
    )
    SELECT
        gen_random_uuid(),
        il.id,
        il.header_id,
        ih.invoice_date,
        EXTRACT(YEAR  FROM ih.invoice_date)::SMALLINT,
        EXTRACT(MONTH FROM ih.invoice_date)::SMALLINT,
        ih.patient_id,
        ih.patient_name,
        ih.patient_type::TEXT,
        adm.insurance_company,
        ih.department_id,
        _rpt_dept_name(ih.department_id),
        COALESCE(il.doctor_name, ih.doctor_name),
        il.line_type::TEXT,
        il.service_id,
        _rpt_service_name(il.service_id),
        svc.category,
        il.item_id,
        _rpt_item_name(il.item_id),
        itm.category::TEXT,
        il.quantity,
        il.unit_price,
        il.discount_amount,
        il.total_price,
        lot.purchase_price,                              -- unit cost from lot
        CASE WHEN lot.purchase_price IS NOT NULL
             THEN il.quantity * lot.purchase_price
             ELSE NULL END,
        CASE WHEN lot.purchase_price IS NOT NULL
             THEN il.total_price - (il.quantity * lot.purchase_price)
             ELSE NULL END,
        il.is_void,
        il.voided_at,
        NOW()
    FROM patient_invoice_lines     il
    JOIN patient_invoice_headers   ih  ON ih.id  = il.header_id
    LEFT JOIN admissions           adm ON adm.id = ih.admission_id
    LEFT JOIN services             svc ON svc.id = il.service_id
    LEFT JOIN items                itm ON itm.id = il.item_id
    LEFT JOIN inventory_lots       lot ON lot.id = il.lot_id
    WHERE il.header_id = p_invoice_id
    ON CONFLICT (source_line_id) DO UPDATE SET
        is_void      = EXCLUDED.is_void,
        voided_at    = EXCLUDED.voided_at,
        gross_margin = EXCLUDED.gross_margin,
        refreshed_at = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- 4. rpt_inventory_snapshot
-- Full rebuild for snapshot_date = TODAY for all items.
-- Run nightly at 23:59, or on-demand for any past date.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_inventory_snapshot(
    p_snapshot_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO rpt_inventory_snapshot (
        id, snapshot_date,
        item_id, item_code, item_name, item_category, has_expiry,
        warehouse_id, warehouse_code, warehouse_name,
        qty_in_minor, active_lot_count,
        expired_qty, expiring_30d_qty, expiring_90d_qty,
        earliest_expiry_date, nearest_expiry_lot_id,
        avg_unit_cost, total_cost_value, total_sale_value,
        refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_snapshot_date,
        l.item_id,
        itm.item_code,
        itm.name_ar,
        itm.category::TEXT,
        itm.has_expiry,
        l.warehouse_id,
        wh.warehouse_code,
        wh.name_ar,
        SUM(l.qty_in_minor),
        COUNT(*) FILTER (WHERE l.is_active AND l.qty_in_minor > 0),
        -- Expired: expiry_date < today
        COALESCE(SUM(l.qty_in_minor) FILTER (WHERE l.expiry_date < p_snapshot_date), 0),
        -- Expiring in 30 days
        COALESCE(SUM(l.qty_in_minor) FILTER (
            WHERE l.expiry_date BETWEEN p_snapshot_date AND p_snapshot_date + 30
        ), 0),
        -- Expiring in 90 days
        COALESCE(SUM(l.qty_in_minor) FILTER (
            WHERE l.expiry_date BETWEEN p_snapshot_date AND p_snapshot_date + 90
        ), 0),
        MIN(l.expiry_date) FILTER (WHERE l.expiry_date >= p_snapshot_date AND l.qty_in_minor > 0),
        -- Lot id with nearest non-expired expiry
        (SELECT ll.id FROM inventory_lots ll
         WHERE ll.item_id      = l.item_id
           AND ll.warehouse_id = l.warehouse_id
           AND ll.expiry_date >= p_snapshot_date
           AND ll.qty_in_minor > 0
         ORDER BY ll.expiry_date ASC LIMIT 1),
        -- Weighted average cost
        CASE WHEN SUM(l.qty_in_minor) > 0
             THEN SUM(l.qty_in_minor * COALESCE(l.provisional_purchase_price, l.purchase_price))
                  / SUM(l.qty_in_minor)
             ELSE NULL END,
        SUM(l.qty_in_minor * COALESCE(l.provisional_purchase_price, l.purchase_price)),
        SUM(l.qty_in_minor * l.sale_price),
        NOW()
    FROM inventory_lots   l
    JOIN items            itm ON itm.id = l.item_id
    JOIN warehouses       wh  ON wh.id  = l.warehouse_id
    WHERE l.is_active = TRUE
    GROUP BY l.item_id, l.warehouse_id, itm.item_code, itm.name_ar,
             itm.category, itm.has_expiry, wh.warehouse_code, wh.name_ar
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
        refreshed_at          = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- 5. rpt_item_movements_summary
-- Upsert a single day's movement totals for an item+warehouse.
-- Called after any inventory_lot_movements INSERT.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_item_movements(
    p_item_id      VARCHAR,
    p_warehouse_id VARCHAR,
    p_date         DATE DEFAULT CURRENT_DATE
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO rpt_item_movements_summary (
        id, movement_date, period_year, period_month,
        item_id, item_name, item_category,
        warehouse_id, warehouse_name,
        received_qty,    received_value,   receipt_tx_count,
        issued_qty,      issued_value,     issue_tx_count,
        return_in_qty,   return_out_qty,
        transfer_in_qty, transfer_out_qty,
        adjustment_qty,  net_qty_change,
        refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_date,
        EXTRACT(YEAR  FROM p_date)::SMALLINT,
        EXTRACT(MONTH FROM p_date)::SMALLINT,
        p_item_id,
        _rpt_item_name(p_item_id),
        (SELECT category::TEXT FROM items WHERE id = p_item_id LIMIT 1),
        p_warehouse_id,
        _rpt_wh_name(p_warehouse_id),
        -- Received (positive, tx_type = 'receive')
        COALESCE(SUM(qty_change_in_minor) FILTER (WHERE tx_type::TEXT = 'receive'), 0),
        COALESCE(SUM(qty_change_in_minor * COALESCE(unit_cost, 0)) FILTER (WHERE tx_type::TEXT = 'receive'), 0),
        COUNT(*) FILTER (WHERE tx_type::TEXT = 'receive'),
        -- Issued / Sold (negative values, flip sign)
        COALESCE(ABS(SUM(qty_change_in_minor)) FILTER (WHERE tx_type::TEXT IN ('sale','patient_sale')), 0),
        COALESCE(ABS(SUM(qty_change_in_minor * COALESCE(unit_cost,0))) FILTER (WHERE tx_type::TEXT IN ('sale','patient_sale')), 0),
        COUNT(*) FILTER (WHERE tx_type::TEXT IN ('sale','patient_sale')),
        -- Returns
        COALESCE(SUM(qty_change_in_minor)  FILTER (WHERE tx_type::TEXT = 'return_in'),  0),
        COALESCE(ABS(SUM(qty_change_in_minor)) FILTER (WHERE tx_type::TEXT = 'return_out'), 0),
        -- Transfers
        COALESCE(SUM(qty_change_in_minor)  FILTER (WHERE tx_type::TEXT = 'transfer_in'),  0),
        COALESCE(ABS(SUM(qty_change_in_minor)) FILTER (WHERE tx_type::TEXT = 'transfer_out'), 0),
        -- Adjustments
        COALESCE(SUM(qty_change_in_minor) FILTER (WHERE tx_type::TEXT = 'adjustment'), 0),
        -- Net
        COALESCE(SUM(qty_change_in_minor), 0),
        NOW()
    FROM inventory_lot_movements  m
    JOIN inventory_lots           l ON l.id = m.lot_id
    WHERE l.item_id      = p_item_id
      AND m.warehouse_id = p_warehouse_id
      AND m.tx_date::DATE = p_date
    ON CONFLICT (movement_date, item_id, warehouse_id) DO UPDATE SET
        received_qty      = EXCLUDED.received_qty,
        received_value    = EXCLUDED.received_value,
        receipt_tx_count  = EXCLUDED.receipt_tx_count,
        issued_qty        = EXCLUDED.issued_qty,
        issued_value      = EXCLUDED.issued_value,
        issue_tx_count    = EXCLUDED.issue_tx_count,
        return_in_qty     = EXCLUDED.return_in_qty,
        return_out_qty    = EXCLUDED.return_out_qty,
        transfer_in_qty   = EXCLUDED.transfer_in_qty,
        transfer_out_qty  = EXCLUDED.transfer_out_qty,
        adjustment_qty    = EXCLUDED.adjustment_qty,
        net_qty_change    = EXCLUDED.net_qty_change,
        refreshed_at      = NOW();
END;
$$;


-- ============================================================
-- 6. rpt_daily_revenue
-- Rebuild one day's revenue rows for all sources.
-- Run nightly for yesterday; run intraday for today.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_daily_revenue(
    p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Delete old rows for this date (full-day rebuild)
    DELETE FROM rpt_daily_revenue WHERE revenue_date = p_date;

    -- ── Patient invoices (source_type = 'patient_invoice') ──
    INSERT INTO rpt_daily_revenue (
        id, revenue_date, period_year, period_month, period_week,
        source_type, department_id, department_name, pharmacy_id, pharmacy_name, doctor_name,
        invoice_count, return_count,
        total_gross, total_discount, total_net, total_collected,
        service_revenue, drug_revenue, consumable_revenue, stay_revenue,
        total_cogs, gross_profit, refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_date,
        EXTRACT(YEAR FROM p_date)::SMALLINT,
        EXTRACT(MONTH FROM p_date)::SMALLINT,
        EXTRACT(WEEK  FROM p_date)::SMALLINT,
        'patient_invoice',
        ih.department_id,
        _rpt_dept_name(ih.department_id),
        NULL, NULL,
        ih.doctor_name,
        COUNT(DISTINCT ih.id),
        0,
        COALESCE(SUM(ih.total_amount),    0),
        COALESCE(SUM(ih.discount_amount), 0),
        COALESCE(SUM(ih.net_amount),      0),
        -- Payments collected on this date
        COALESCE((
            SELECT SUM(pmt.amount)
            FROM patient_invoice_payments pmt
            JOIN patient_invoice_headers  pmh ON pmh.id = pmt.header_id
            WHERE pmt.payment_date = p_date
              AND pmh.department_id = ih.department_id
        ), 0),
        COALESCE(SUM(CASE WHEN il.line_type = 'service'    AND NOT il.is_void THEN il.total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN il.line_type = 'drug'       AND NOT il.is_void THEN il.total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN il.line_type = 'consumable' AND NOT il.is_void THEN il.total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN il.line_type = 'stay'       AND NOT il.is_void THEN il.total_price ELSE 0 END), 0),
        0,  -- COGS computed separately below
        0,
        NOW()
    FROM patient_invoice_headers  ih
    LEFT JOIN patient_invoice_lines il ON il.header_id = ih.id
    WHERE ih.invoice_date = p_date
      AND ih.status::TEXT IN ('finalized','paid')
    GROUP BY ih.department_id, ih.doctor_name;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- ── Pharmacy sales (source_type = 'sales_pharmacy') ──
    INSERT INTO rpt_daily_revenue (
        id, revenue_date, period_year, period_month, period_week,
        source_type, department_id, department_name, pharmacy_id, pharmacy_name, doctor_name,
        invoice_count, return_count,
        total_gross, total_discount, total_net, total_collected,
        service_revenue, drug_revenue, consumable_revenue, stay_revenue,
        total_cogs, gross_profit, refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_date,
        EXTRACT(YEAR FROM p_date)::SMALLINT,
        EXTRACT(MONTH FROM p_date)::SMALLINT,
        EXTRACT(WEEK  FROM p_date)::SMALLINT,
        'sales_pharmacy',
        NULL, NULL,
        sh.pharmacy_id,
        _rpt_pharmacy_name(sh.pharmacy_id),
        NULL,
        COUNT(DISTINCT sh.id) FILTER (WHERE NOT sh.is_return),
        COUNT(DISTINCT sh.id) FILTER (WHERE sh.is_return),
        COALESCE(SUM(sh.subtotal),  0),
        COALESCE(SUM(sh.discount_value), 0),
        COALESCE(SUM(sh.net_total), 0),
        0,
        0,
        COALESCE(SUM(sl.line_total), 0),
        0, 0,
        0, 0,
        NOW()
    FROM sales_invoice_headers  sh
    LEFT JOIN sales_invoice_lines sl ON sl.invoice_id = sh.id
    WHERE sh.invoice_date = p_date
      AND sh.status::TEXT  = 'finalized'
      AND sh.pharmacy_id IS NOT NULL
    GROUP BY sh.pharmacy_id;

    GET DIAGNOSTICS v_count = v_count + ROW_COUNT;

    RETURN v_count;
END;
$$;


-- ============================================================
-- 7. rpt_patient_revenue  (monthly rollup)
-- Full rebuild for a given year+month.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_patient_revenue_month(
    p_year  SMALLINT,
    p_month SMALLINT
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO rpt_patient_revenue (
        id, period_year, period_month,
        patient_id, patient_name, patient_type, insurance_company,
        visit_count, invoice_count,
        total_invoiced, total_discount, net_amount, total_paid, outstanding_balance,
        refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_year, p_month,
        ih.patient_id,
        MAX(ih.patient_name),
        MAX(ih.patient_type::TEXT),
        MAX(adm.insurance_company),
        COUNT(DISTINCT COALESCE(ih.admission_id, ih.id)),
        COUNT(DISTINCT ih.id),
        COALESCE(SUM(ih.total_amount),    0),
        COALESCE(SUM(ih.discount_amount), 0),
        COALESCE(SUM(ih.net_amount),      0),
        COALESCE(SUM(ih.paid_amount),     0),
        COALESCE(SUM(ih.net_amount - ih.paid_amount), 0)
    FROM patient_invoice_headers  ih
    LEFT JOIN admissions          adm ON adm.id = ih.admission_id
    WHERE EXTRACT(YEAR  FROM ih.invoice_date) = p_year
      AND EXTRACT(MONTH FROM ih.invoice_date) = p_month
      AND ih.status::TEXT IN ('finalized','paid')
    GROUP BY ih.patient_id
    ON CONFLICT (period_year, period_month, patient_id) DO UPDATE SET
        visit_count         = EXCLUDED.visit_count,
        invoice_count       = EXCLUDED.invoice_count,
        total_invoiced      = EXCLUDED.total_invoiced,
        total_discount      = EXCLUDED.total_discount,
        net_amount          = EXCLUDED.net_amount,
        total_paid          = EXCLUDED.total_paid,
        outstanding_balance = EXCLUDED.outstanding_balance,
        refreshed_at        = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- 8. rpt_department_activity  (daily)
-- Full rebuild for a given date.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_refresh_dept_activity(
    p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM rpt_department_activity WHERE activity_date = p_date;

    INSERT INTO rpt_department_activity (
        id, activity_date, period_year, period_month,
        department_id, department_name,
        new_admissions, discharges, census_eod,
        total_beds, beds_occupied_eod, occupancy_rate,
        clinic_orders_placed, clinic_orders_executed,
        invoices_created, invoices_finalized,
        gross_revenue, net_revenue, cash_collected,
        refreshed_at
    )
    SELECT
        gen_random_uuid(),
        p_date,
        EXTRACT(YEAR  FROM p_date)::SMALLINT,
        EXTRACT(MONTH FROM p_date)::SMALLINT,
        d.id,
        d.name_ar,
        -- Admissions on this date
        COUNT(DISTINCT a.id) FILTER (WHERE a.admission_date = p_date),
        -- Discharges on this date
        COUNT(DISTINCT a.id) FILTER (WHERE a.discharge_date = p_date),
        -- Census end-of-day (admitted before/on p_date and not yet discharged)
        COUNT(DISTINCT a.id) FILTER (
            WHERE a.admission_date <= p_date
              AND (a.discharge_date IS NULL OR a.discharge_date > p_date)
        ),
        -- Total beds in dept
        (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id
         JOIN floors f ON f.id = r.floor_id WHERE f.id IS NOT NULL),  -- simplified
        0,  -- beds_occupied_eod: requires room-bed join (populate separately)
        0,
        -- Clinic orders
        COUNT(DISTINCT co.id) FILTER (WHERE co.created_at::DATE = p_date),
        COUNT(DISTINCT co.id) FILTER (WHERE co.executed_at::DATE = p_date),
        -- Patient invoices
        COUNT(DISTINCT ih.id)                                         FILTER (WHERE ih.invoice_date = p_date),
        COUNT(DISTINCT ih.id) FILTER (WHERE ih.finalized_at::DATE = p_date),
        COALESCE(SUM(ih.total_amount) FILTER (WHERE ih.invoice_date = p_date), 0),
        COALESCE(SUM(ih.net_amount)   FILTER (WHERE ih.invoice_date = p_date), 0),
        COALESCE((SELECT SUM(pmt.amount) FROM patient_invoice_payments pmt
                  JOIN patient_invoice_headers pmh ON pmh.id = pmt.header_id
                  WHERE pmt.payment_date = p_date AND pmh.department_id = d.id), 0),
        NOW()
    FROM departments             d
    LEFT JOIN admissions         a   ON a.patient_id IS NOT NULL AND (
            SELECT ih2.department_id FROM patient_invoice_headers ih2
            WHERE ih2.admission_id = a.id LIMIT 1) = d.id
    LEFT JOIN patient_invoice_headers ih ON ih.department_id = d.id
                                         AND ih.invoice_date = p_date
    LEFT JOIN clinic_orders      co  ON co.target_id = d.id
    GROUP BY d.id, d.name_ar;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ============================================================
-- CONVENIENCE: full nightly refresh
-- Call this from a pg_cron job or external scheduler.
-- ============================================================
CREATE OR REPLACE FUNCTION rpt_nightly_refresh()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_yesterday DATE := CURRENT_DATE - 1;
    v_year      SMALLINT := EXTRACT(YEAR  FROM v_yesterday)::SMALLINT;
    v_month     SMALLINT := EXTRACT(MONTH FROM v_yesterday)::SMALLINT;
    v_msg       TEXT     := '';
    v_n         INTEGER;
BEGIN
    -- 1. Inventory snapshot for today
    SELECT rpt_refresh_inventory_snapshot(CURRENT_DATE) INTO v_n;
    v_msg := v_msg || 'inventory_snapshot: ' || v_n || ' rows. ';

    -- 2. Daily revenue for yesterday
    SELECT rpt_refresh_daily_revenue(v_yesterday) INTO v_n;
    v_msg := v_msg || 'daily_revenue: ' || v_n || ' rows. ';

    -- 3. Patient revenue month rollup for yesterday's month
    SELECT rpt_refresh_patient_revenue_month(v_year, v_month) INTO v_n;
    v_msg := v_msg || 'patient_revenue: ' || v_n || ' rows. ';

    -- 4. Department activity for yesterday
    SELECT rpt_refresh_dept_activity(v_yesterday) INTO v_n;
    v_msg := v_msg || 'dept_activity: ' || v_n || ' rows. ';

    RETURN v_msg;
END;
$$;


-- ============================================================
-- pg_cron schedule (uncomment when pg_cron is available):
-- ============================================================
-- SELECT cron.schedule('nightly-reporting-refresh',
--   '5 0 * * *',
--   'SELECT rpt_nightly_refresh()');
