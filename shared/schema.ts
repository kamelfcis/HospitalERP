/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 *  فهرس الجداول الكامل — مُرتّب حسب المجال الوظيفي
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 *  ── 1. التعدادات (enums.ts) ────────────────────────────────────────────────────
 *    account_type, journal_status, item_category, unit_level, lot_tx_type,
 *    transfer_status, sales_invoice_status, cashier_shift_status, customer_type,
 *    patient_invoice_status, patient_type, patient_invoice_line_type,
 *    payment_method, admission_status, encounter_type, encounter_status,
 *    user_role, transaction_type, mapping_line_type, receiving_status,
 *    purchase_invoice_status
 *
 *  ── 2. المستخدمون والصلاحيات (users.ts) ──────────────────────────────────────
 *    permission_groups, group_permissions, users, role_permissions, user_permissions
 *
 *  ── 3. المالية والمحاسبة (finance.ts) ─────────────────────────────────────────
 *    ⚠ Core Accounting — DO NOT MODIFY without accounting review:
 *      journal_entries, journal_lines, account_mappings
 *    fiscal_periods, cost_centers, accounts, user_account_scopes,
 *    journal_templates, template_lines, audit_log, accounting_event_log
 *
 *  ── 4. المخزون والأصناف (inventory.ts) ────────────────────────────────────────
 *    item_form_types, item_uoms, items, purchase_transactions, sales_transactions,
 *    departments, user_departments, user_clinics, item_department_prices,
 *    pharmacies, warehouses, user_warehouses, inventory_lots,
 *    inventory_lot_movements, store_transfers, transfer_lines,
 *    transfer_line_allocations, item_barcodes, stock_movement_headers,
 *    stock_movement_allocations, stock_count_sessions, stock_count_lines,
 *    opening_stock_headers, opening_stock_lines
 *
 *  ── 5. المشتريات (purchasing.ts) ──────────────────────────────────────────────
 *    suppliers, receiving_headers, receiving_lines, purchase_invoice_headers,
 *    purchase_invoice_lines, supplier_payments, supplier_payment_lines,
 *    purchase_return_headers, purchase_return_lines
 *
 *  ── 6. الفوترة (invoicing.ts) ─────────────────────────────────────────────────
 *    services, price_lists, price_list_items, price_adjustments_log,
 *    service_consumables, item_consumables, pharmacy_credit_customers,
 *    sales_invoice_headers, sales_invoice_lines, customer_receipts,
 *    customer_receipt_lines, delivery_receipts, delivery_receipt_lines,
 *    patient_invoice_headers, patient_invoice_lines, patient_invoice_payments,
 *    invoice_templates, invoice_template_lines
 *
 *  ── 7. المستشفى (hospital.ts) ─────────────────────────────────────────────────
 *    patients, patient_merge_audit, patient_aliases, doctors,
 *    cashier_shifts, cashier_transfer_log, cashier_receipts,
 *    cashier_refund_receipts, cashier_audit_log,
 *    surgery_types, surgery_category_prices, admissions,
 *    patient_visits, encounters, visit_aggregation_cache, stay_segments,
 *    floors, rooms, beds, doctor_transfers, doctor_settlements,
 *    doctor_settlement_allocations, drawer_passwords,
 *    treasuries, user_treasuries, treasury_transactions
 *
 *  ── 8. النظام (system.ts) ─────────────────────────────────────────────────────
 *    system_settings, chat_messages, tasks, task_assignees,
 *    task_comments, task_notifications
 *
 *  ── 9. الشركات (companies.ts) ─────────────────────────────────────────────────
 *    companies
 *
 *  ── 10. العقود والمطالبات (contracts.ts) ───────────────────────────────────────
 *    contracts, contract_members, contract_coverage_rules,
 *    contract_claim_batches, contract_claim_lines, contract_approvals,
 *    contract_claim_settlements, contract_claim_settlement_lines
 *
 *  ── 11. العيادات الخارجية (clinic.ts) ──────────────────────────────────────────
 *    clinic_clinics, clinic_doctor_schedules, clinic_appointments,
 *    clinic_user_clinic_assignments, clinic_user_doctor_assignments,
 *    clinic_consultations, clinic_consultation_drugs,
 *    clinic_doctor_favorite_drugs, clinic_service_doctor_prices, clinic_orders
 *
 *  ── 12. استقبال العيادة (intake.ts) ────────────────────────────────────────────
 *    clinic_visit_intake, clinic_doctor_favorites
 *
 *  ── 13. كشكول النواقص (shortage.ts) ────────────────────────────────────────────
 *    shortage_events, shortage_agg, shortage_followups
 *
 *  ── 14. الصرف بدون رصيد (oversell.ts) ─────────────────────────────────────────
 *    pending_stock_allocations, oversell_resolution_batches,
 *    oversell_cost_resolutions
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 */
export * from "./schema/enums";
export * from "./schema/users";
export * from "./schema/finance";
export * from "./schema/inventory";
export * from "./schema/purchasing";
export * from "./schema/invoicing";
export * from "./schema/hospital";
export * from "./schema/system";
export * from "./schema/clinic";
export * from "./schema/companies";
export * from "./schema/contracts";
export * from "./schema/intake";
export * from "./schema/shortage";
export * from "./schema/oversell";
