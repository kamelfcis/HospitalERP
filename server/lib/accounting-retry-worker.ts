/**
 * accounting-retry-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Background worker that picks up failed / needs_retry accounting events and
 * re-attempts journal generation for each supported source type.
 *
 * Safeguards:
 *  • Respects next_retry_at — will not retry before the scheduled time
 *  • Stops retrying after MAX_RETRY_ATTEMPTS — marks permanently as "failed"
 *  • All retries call the same idempotent generateJournalEntry / source-specific
 *    handlers, so running the worker multiple times is safe
 *  • Each attempt increments attempt_count and updates last_attempted_at
 *  • Exponential backoff encoded in next_retry_at (2^n minutes, capped at 24h)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "./logger";
import { logAcctEvent, MAX_RETRY_ATTEMPTS, computeNextRetryAt } from "./accounting-event-logger";

// ── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Mark event permanently failed after exceeding max attempts */
async function markPermanentlyFailed(id: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE accounting_event_log
    SET  status            = 'failed',
         error_message     = ${`[تجاوز الحد الأقصى ${MAX_RETRY_ATTEMPTS} محاولات] ${reason}`},
         next_retry_at     = NULL,
         last_attempted_at = NOW(),
         updated_at        = NOW()
    WHERE id = ${id}
  `);
}

/** Mark event completed after successful retry.
 *  Guard: WHERE status != 'completed' prevents a racing path from overwriting a completed event. */
async function markCompleted(id: string, journalEntryId?: string | null): Promise<void> {
  await db.execute(sql`
    UPDATE accounting_event_log
    SET  status            = 'completed',
         error_message     = NULL,
         next_retry_at     = NULL,
         journal_entry_id  = COALESCE(${journalEntryId ?? null}, journal_entry_id),
         last_attempted_at = NOW(),
         updated_at        = NOW()
    WHERE id = ${id}
      AND status != 'completed'
  `);
}

/** Bump attempt_count and set next_retry_at for next attempt.
 *  Guard: WHERE status != 'completed' prevents a racing path from bumping attempt_count after success. */
async function markRetried(id: string, errorMsg: string, attemptCount: number): Promise<void> {
  const nextAt = computeNextRetryAt(attemptCount + 1);
  await db.execute(sql`
    UPDATE accounting_event_log
    SET  error_message     = ${errorMsg},
         next_retry_at     = ${nextAt.toISOString()},
         attempt_count     = attempt_count + 1,
         last_attempted_at = NOW(),
         updated_at        = NOW()
    WHERE id = ${id}
      AND status != 'completed'
  `);
}

// ── Per-source retry handlers ────────────────────────────────────────────────

async function retrySalesInvoice(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  const entry = await storage.regenerateJournalForInvoice(sourceId);
  if (entry) return { ok: true, journalEntryId: entry.id };

  // Check if already exists (idempotent path)
  const raw = await db.execute(sql`
    SELECT id FROM journal_entries
    WHERE source_type = 'sales_invoice' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  const existing = (raw as any).rows[0];
  if (existing) return { ok: true, journalEntryId: existing.id };

  throw new Error("لم يُنشأ قيد — راجع ربط الحسابات أو بيانات الفاتورة");
}

async function retryPatientInvoice(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  const invoiceData = await storage.getPatientInvoice(sourceId);
  if (!invoiceData) throw new Error("بيانات فاتورة المريض غير موجودة");

  const glLines = storage.buildPatientInvoiceGLLines(invoiceData, invoiceData.lines || []);
  const entry = await storage.generateJournalEntry({
    sourceType:       "patient_invoice",
    sourceDocumentId: sourceId,
    reference:        `PI-${invoiceData.invoiceNumber}`,
    description:      `قيد فاتورة مريض رقم ${invoiceData.invoiceNumber}`,
    entryDate:        invoiceData.invoiceDate,
    lines:            glLines,
  });
  if (entry) return { ok: true, journalEntryId: entry.id };
  throw new Error("لم يُنشأ قيد — راجع ربط الحسابات");
}

async function retryPurchaseReceiving(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  const [header] = await db.execute(sql`
    SELECT id, receiving_number, receive_date FROM receiving_headers WHERE id = ${sourceId}
  `).then(r => (r as any).rows);
  if (!header) throw new Error("أذن الاستلام غير موجود");

  const linesRaw = await db.execute(sql`
    SELECT line_total FROM receiving_lines WHERE receiving_id = ${sourceId} AND is_rejected IS NOT TRUE
  `);
  const totalCost = (linesRaw as any).rows.reduce((s: number, l: any) => s + parseFloat(l.line_total || "0"), 0);
  if (totalCost <= 0) throw new Error("إجمالي تكلفة الاستلام صفر — لا قيد مطلوب");

  const entry = await storage.generateJournalEntry({
    sourceType:       "receiving",
    sourceDocumentId: sourceId,
    reference:        `RCV-${header.receiving_number}`,
    description:      `قيد استلام مورد رقم ${header.receiving_number}`,
    entryDate:        header.receive_date,
    lines: [
      { lineType: "inventory", amount: String(totalCost) },
      { lineType: "payables",  amount: String(totalCost) },
    ],
  });
  if (entry) {
    await db.execute(sql`
      UPDATE receiving_headers SET journal_status = 'posted', journal_error = NULL, updated_at = NOW()
      WHERE id = ${sourceId}
    `);
    return { ok: true, journalEntryId: entry.id };
  }
  throw new Error("لم يُنشأ قيد — راجع ربط الحسابات للمخزون والموردين");
}

async function retrySalesReturn(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  // Phase 1 — generate the GL reversal journal if it doesn't already exist
  await storage.generateSalesReturnJournal(sourceId);

  // Check for a completed journal (idempotent: might have been created above or earlier)
  const raw = await db.execute(sql`
    SELECT id, status FROM journal_entries
    WHERE source_type = 'sales_return' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  const existing = (raw as any).rows[0];
  if (!existing) throw new Error("لم يُنشأ قيد مردود المبيعات — راجع ربط حسابات فواتير المبيعات");

  // Phase 2 — if the cashier has already refunded this return invoice (status = collected)
  // but the journal is still in draft, complete Phase 2 now.
  if (existing.status === "draft") {
    const invRaw = await db.execute(sql`
      SELECT sih.status, crr.shift_id, cs.gl_account_id
      FROM sales_invoice_headers sih
      LEFT JOIN cashier_refund_receipts crr ON crr.invoice_id = sih.id
      LEFT JOIN cashier_shifts cs ON cs.id = crr.shift_id
      WHERE sih.id = ${sourceId}
      LIMIT 1
    `);
    const invRow = (invRaw as any).rows[0];
    if (invRow?.status === "collected" && invRow?.gl_account_id) {
      logger.info({ sourceId, glAccountId: invRow.gl_account_id },
        "[SALES_RETURN] invoice already collected — triggering Phase-2 from retry worker");
      await storage.completeSalesReturnWithCash([sourceId], invRow.gl_account_id);
    }
  }

  return { ok: true, journalEntryId: existing.id };
}

async function retryDeliveryReceipt(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  // ── 1. جلب بيانات الإيصال ──────────────────────────────────────────────────
  const raw = await db.execute(sql`
    SELECT id, receipt_number, receipt_date, total_amount, gl_account_id
    FROM delivery_receipts
    WHERE id = ${sourceId}
  `);
  const receipt = (raw as any).rows[0];
  if (!receipt) throw new Error("إيصال التوصيل غير موجود");

  // ── 2. idempotency: هل القيد موجود مسبقاً؟ ──────────────────────────────
  const existingRaw = await db.execute(sql`
    SELECT id FROM journal_entries
    WHERE source_type = 'delivery_receipt' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  const existing = (existingRaw as any).rows[0];
  if (existing) {
    // تأكّد من أن delivery_receipts.journal_entry_id محدَّثة
    await db.execute(sql`
      UPDATE delivery_receipts SET journal_entry_id = ${existing.id} WHERE id = ${sourceId}
    `);
    return { ok: true, journalEntryId: existing.id };
  }

  // ── 3. حسابات GL ─────────────────────────────────────────────────────────
  const glDebitId: string | null = receipt.gl_account_id ?? null;
  if (!glDebitId) throw new Error("إيصال التوصيل لا يحتوي على حساب خزينة — تحقق من إعدادات الكاشير");

  const mappingsRaw = await db.execute(sql`
    SELECT debit_account_id FROM account_mappings
    WHERE transaction_type = 'sales_invoice' AND line_type = 'receivables'
    LIMIT 1
  `);
  const glCreditId: string | null = (mappingsRaw as any).rows[0]?.debit_account_id ?? null;
  if (!glCreditId) throw new Error("لم يُعيَّن حساب المدينون (receivables) في ربط حسابات فواتير المبيعات");

  // ── 4. الفترة المالية ────────────────────────────────────────────────────
  const periodRaw = await db.execute(sql`
    SELECT id FROM fiscal_periods
    WHERE is_closed = false
      AND start_date <= ${receipt.receipt_date}::date
      AND end_date   >= ${receipt.receipt_date}::date
    LIMIT 1
  `);
  const periodId: string | null = (periodRaw as any).rows[0]?.id ?? null;

  // ── 5. إنشاء القيد ───────────────────────────────────────────────────────
  const entryNumRes = await db.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
  const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);
  const amount      = parseFloat(receipt.total_amount).toFixed(2);
  const receiptNum  = receipt.receipt_number;

  const [entry] = await db.execute(sql`
    INSERT INTO journal_entries
      (entry_number, entry_date, description, reference, status, period_id,
       total_debit, total_credit, source_type, source_document_id, source_entry_type, posted_at)
    VALUES (
      ${entryNumber}, ${receipt.receipt_date}::date,
      ${'تحصيل توصيل منزلي - إيصال ' + receiptNum},
      ${'DLVMT-' + receiptNum},
      'posted', ${periodId ?? null},
      ${amount}, ${amount},
      'delivery_receipt', ${sourceId}, 'delivery_receipt_collection', now()
    )
    RETURNING id
  `).then(r => (r as any).rows);
  if (!entry) throw new Error("فشل إدراج رأس القيد");

  await db.execute(sql`
    INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
    VALUES
      (${entry.id}, 1, ${glDebitId},  ${amount}, '0.00', ${'تحصيل توصيل منزلي - إيصال ' + receiptNum}),
      (${entry.id}, 2, ${glCreditId}, '0.00', ${amount}, ${'ذمم توصيل منزلي - إيصال ' + receiptNum})
  `);

  await db.execute(sql`
    UPDATE delivery_receipts SET journal_entry_id = ${entry.id} WHERE id = ${sourceId}
  `);

  return { ok: true, journalEntryId: entry.id };
}

async function retrySupplierPayment(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  // ── 1. جلب بيانات السداد + المورد ────────────────────────────────────────
  const raw = await db.execute(sql`
    SELECT sp.id, sp.payment_number, sp.payment_date, sp.total_amount,
           sp.gl_account_id, sp.journal_entry_id, sp.supplier_id,
           s.gl_account_id AS supplier_gl_account_id,
           s.supplier_type
    FROM supplier_payments sp
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    WHERE sp.id = ${sourceId}
  `);
  const pmt = (raw as any).rows[0];
  if (!pmt) throw new Error("سداد المورد غير موجود");

  // ── 2. idempotency: هل القيد موجود مسبقاً؟ ──────────────────────────────
  if (pmt.journal_entry_id) return { ok: true, journalEntryId: pmt.journal_entry_id };

  const existingRaw = await db.execute(sql`
    SELECT id FROM journal_entries
    WHERE source_type = 'supplier_payment' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  const existing = (existingRaw as any).rows[0];
  if (existing) {
    await db.execute(sql`UPDATE supplier_payments SET journal_entry_id = ${existing.id} WHERE id = ${sourceId}`);
    return { ok: true, journalEntryId: existing.id };
  }

  // ── 3. حل حساب ذمم المورد (AP) — نفس منطق createSupplierPayment ──────────
  const glAccountId: string | null = pmt.gl_account_id ?? null;
  if (!glAccountId) throw new Error("سداد المورد لا يحتوي على حساب خزينة (gl_account_id)");

  let apAccountId: string | null = pmt.supplier_gl_account_id ?? null;
  if (!apAccountId) {
    // Fallback: account_mappings لنوع المورد
    const supplierType     = pmt.supplier_type || "drugs";
    const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
    const mapRaw = await db.execute(sql`
      SELECT debit_account_id, credit_account_id FROM account_mappings
      WHERE transaction_type = 'purchase_invoice' AND line_type = ${payablesLineType} AND is_active = true
      LIMIT 1
    `);
    const m = (mapRaw as any).rows[0];
    apAccountId = m?.credit_account_id || m?.debit_account_id || null;
  }
  if (!apAccountId) throw new Error("تعذّر تحديد حساب ذمم المورد — عرِّف gl_account_id للمورد أو ربط حسابات المشتريات");

  // ── 4. الفترة المالية ─────────────────────────────────────────────────────
  const periodRaw = await db.execute(sql`
    SELECT id FROM fiscal_periods
    WHERE is_closed = false
      AND start_date <= ${pmt.payment_date}::date
      AND end_date   >= ${pmt.payment_date}::date
    LIMIT 1
  `);
  const periodId: string | null = (periodRaw as any).rows[0]?.id ?? null;
  if (!periodId) throw new Error(`لا توجد فترة مالية مفتوحة لتاريخ السداد (${pmt.payment_date})`);

  // ── 5. إنشاء القيد ───────────────────────────────────────────────────────
  const entryNumber = await storage.getNextEntryNumber();
  const amount = parseFloat(pmt.total_amount).toFixed(2);
  const pmtNum = pmt.payment_number;

  const [entry] = await db.execute(sql`
    INSERT INTO journal_entries
      (entry_number, entry_date, period_id, description, reference, status,
       source_type, source_document_id, total_debit, total_credit, posted_at)
    VALUES (
      ${entryNumber}, ${pmt.payment_date}::date, ${periodId},
      ${'سداد مورد — سند #' + pmtNum}, ${'SUPPMT-' + pmtNum},
      'posted', 'supplier_payment', ${sourceId},
      ${amount}, ${amount}, now()
    )
    RETURNING id
  `).then(r => (r as any).rows);
  if (!entry) throw new Error("فشل إدراج رأس قيد سداد المورد");

  await db.execute(sql`
    INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
    VALUES
      (${entry.id}, 1, ${apAccountId}, ${amount}, '0.00', ${'سداد مورد #' + pmtNum + ' - ذمم موردين'}),
      (${entry.id}, 2, ${glAccountId}, '0.00', ${amount}, ${'سداد مورد #' + pmtNum + ' - خزنة'})
  `);

  await db.execute(sql`UPDATE supplier_payments SET journal_entry_id = ${entry.id} WHERE id = ${sourceId}`);
  return { ok: true, journalEntryId: entry.id };
}

async function retryOpeningStock(sourceId: string): Promise<{ ok: boolean; journalEntryId?: string }> {
  // ── 1. جلب بيانات الرصيد الافتتاحي ───────────────────────────────────────
  const raw = await db.execute(sql`
    SELECT h.id, h.post_date, h.status,
           COALESCE(SUM(l.purchase_price * l.qty_in_minor), 0) AS total_cost
    FROM opening_stock_headers h
    LEFT JOIN opening_stock_lines l ON l.header_id = h.id
    WHERE h.id = ${sourceId}
    GROUP BY h.id, h.post_date, h.status
  `);
  const hdr = (raw as any).rows[0];
  if (!hdr) throw new Error("وثيقة الرصيد الافتتاحي غير موجودة");
  if (hdr.status !== "posted") throw new Error(`الوثيقة في حالة "${hdr.status}" — يجب أن تكون مُرحَّلة`);

  const totalCost = parseFloat(hdr.total_cost || "0");
  if (totalCost <= 0) throw new Error("إجمالي تكلفة الرصيد الافتتاحي صفر — لا قيد مطلوب");

  // ── 2. idempotency ────────────────────────────────────────────────────────
  const existingRaw = await db.execute(sql`
    SELECT id FROM journal_entries
    WHERE source_type = 'opening_stock' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  const existing = (existingRaw as any).rows[0];
  if (existing) return { ok: true, journalEntryId: existing.id };

  // ── 3. إنشاء القيد عبر generateJournalEntry ──────────────────────────────
  const entry = await storage.generateJournalEntry({
    sourceType:       "opening_stock",
    sourceDocumentId: sourceId,
    reference:        `OS-${sourceId.slice(0, 8).toUpperCase()}`,
    description:      `رصيد افتتاحي للمخزون — ${hdr.post_date}`,
    entryDate:        hdr.post_date,
    lines: [
      { lineType: "inventory",      amount: totalCost.toFixed(2) },
      { lineType: "opening_equity", amount: totalCost.toFixed(2) },
    ],
  });
  if (entry) return { ok: true, journalEntryId: entry.id };
  throw new Error("لم يُنشأ قيد — راجع ربط الحسابات (inventory / opening_equity) أو افتح فترة مالية");
}

async function retryWarehouseTransfer(sourceId: string): Promise<{ ok: boolean; message?: string }> {
  // The warehouse transfer journal is created inside postTransfer's DB transaction.
  // Re-running it would re-post inventory movements — unsafe.
  // Instead, we check if GL accounts are now configured and generate the journal directly.
  const raw = await db.execute(sql`
    SELECT
      st.id, st.transfer_number, st.transfer_date, st.status,
      sw.gl_account_id AS src_gl, sw.name_ar AS src_name,
      dw.gl_account_id AS dst_gl, dw.name_ar AS dst_name
    FROM store_transfers st
    LEFT JOIN warehouses sw ON sw.id = st.source_warehouse_id
    LEFT JOIN warehouses dw ON dw.id = st.destination_warehouse_id
    WHERE st.id = ${sourceId}
  `);
  const t = (raw as any).rows[0];
  if (!t) throw new Error("التحويل المخزني غير موجود");
  if (t.status !== "posted") throw new Error(`التحويل في حالة "${t.status}" — يجب أن يكون مُرحّلاً`);

  if (!t.src_gl || !t.dst_gl) {
    const missing = !t.src_gl ? t.src_name : t.dst_name;
    throw new Error(`المستودع "${missing}" لا يزال بدون حساب GL — أضف الحساب من إعدادات المستودعات ثم أعد المحاولة`);
  }

  // Check for existing journal (idempotency)
  const existing = await db.execute(sql`
    SELECT id FROM journal_entries
    WHERE source_type = 'warehouse_transfer' AND source_document_id = ${sourceId}
    LIMIT 1
  `);
  if ((existing as any).rows[0]) {
    return { ok: true, message: "القيد موجود مسبقاً" };
  }

  // Compute total cost from lot movements
  const movRaw = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(quantity_change_in_minor) * unit_cost::numeric), 0) AS total_cost
    FROM inventory_lot_movements
    WHERE reference_type = 'store_transfer' AND reference_id = ${sourceId} AND quantity_change_in_minor < 0
  `);
  const totalCost = parseFloat((movRaw as any).rows[0]?.total_cost || "0");
  if (totalCost <= 0) throw new Error("تكلفة التحويل صفر — لا قيد مطلوب");

  // Find open fiscal period
  const periodRaw = await db.execute(sql`
    SELECT id FROM fiscal_periods
    WHERE start_date <= ${t.transfer_date} AND end_date >= ${t.transfer_date} AND is_closed = FALSE
    LIMIT 1
  `);
  const period = (periodRaw as any).rows[0];
  if (!period) throw new Error(`لا توجد فترة مالية مفتوحة لتاريخ التحويل (${t.transfer_date})`);

  const entryNumber = await storage.getNextEntryNumber();
  const amount = totalCost.toFixed(2);

  const [entry] = await db.execute(sql`
    INSERT INTO journal_entries
      (entry_number, entry_date, period_id, description, reference,
       source_type, source_document_id, status, total_debit, total_credit)
    VALUES
      (${entryNumber}, ${t.transfer_date}, ${period.id},
       ${'قيد تحويل مخزني ' + t.transfer_number + ' — ' + t.src_name + ' → ' + t.dst_name},
       ${'TRF-' + t.transfer_number}, 'warehouse_transfer', ${sourceId},
       'posted', ${amount}, ${amount})
    RETURNING id
  `).then(r => (r as any).rows);

  await db.execute(sql`
    INSERT INTO journal_lines (journal_entry_id, line_number, account_id, debit, credit, description)
    VALUES
      (${entry.id}, 1, ${t.dst_gl}, ${amount}, '0.00', ${'تحويل وارد — ' + t.dst_name}),
      (${entry.id}, 2, ${t.src_gl}, '0.00',   ${amount}, ${'تحويل صادر — ' + t.src_name})
  `);

  return { ok: true };
}

// ── Main worker tick ─────────────────────────────────────────────────────────

export async function runAccountingRetryTick(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  // Pick events that are due for retry.
  //
  // Eligibility rules:
  //  • status 'failed' or 'needs_retry' with next_retry_at due (or unset)
  //  • status 'pending' older than 5 minutes — catches events that were never moved out of pending
  //    (e.g. server crash between log write and journal generation)
  //  • last_attempted_at < NOW() - 30 s — concurrency guard: prevents the worker from picking up
  //    an event that was just touched by another worker tick or a manual admin retry
  //  • attempt_count < MAX_RETRY_ATTEMPTS — never re-attempt permanently failed events
  const raw = await db.execute(sql`
    SELECT id, source_type, source_id, event_type, attempt_count, error_message
    FROM accounting_event_log
    WHERE attempt_count < ${MAX_RETRY_ATTEMPTS}
      AND last_attempted_at < NOW() - INTERVAL '30 seconds'
      AND (
        (
          status IN ('failed', 'needs_retry')
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        )
        OR (
          status = 'pending'
          AND last_attempted_at < NOW() - INTERVAL '5 minutes'
        )
      )
    ORDER BY last_attempted_at ASC
    LIMIT 30
  `);

  const events = (raw as any).rows as Array<{
    id: string;
    source_type: string;
    source_id: string;
    event_type: string;
    attempt_count: number;
    error_message: string | null;
  }>;

  if (events.length === 0) return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };

  let succeeded = 0, failed = 0, skipped = 0;

  for (const ev of events) {
    const { id, source_type, source_id, event_type, attempt_count } = ev;

    // Skip event types that are not auto-retryable
    const isSkipped = [
      "doctor_settlement_journal",
      "cashier_collection_journals_top_level_failure",
      "cashier_refund_journals_top_level_failure",
      "warehouse_transfer_journal_skipped",  // needs admin action (set GL accounts)
    ].includes(event_type);

    if (isSkipped) {
      skipped++;
      continue;
    }

    try {
      let result: { ok: boolean; journalEntryId?: string; message?: string } = { ok: false };

      if (source_type === "sales_invoice") {
        result = await retrySalesInvoice(source_id);
      } else if (source_type === "patient_invoice") {
        result = await retryPatientInvoice(source_id);
      } else if (source_type === "purchase_receiving" || source_type === "receiving") {
        result = await retryPurchaseReceiving(source_id);
      } else if (source_type === "warehouse_transfer") {
        result = await retryWarehouseTransfer(source_id);
      } else if (source_type === "sales_return") {
        result = await retrySalesReturn(source_id);
      } else if (source_type === "delivery_receipt") {
        result = await retryDeliveryReceipt(source_id);
      } else if (source_type === "supplier_payment") {
        result = await retrySupplierPayment(source_id);
      } else if (source_type === "opening_stock") {
        result = await retryOpeningStock(source_id);
      } else {
        // Unknown source type — skip
        skipped++;
        continue;
      }

      if (result.ok) {
        await markCompleted(id, result.journalEntryId);
        succeeded++;
        logger.info({ id, source_type, source_id, event_type, attempt: attempt_count + 1 }, "[ACCT_RETRY_WORKER] succeeded");
      } else {
        await markRetried(id, "إعادة المحاولة لم تُنتج نتيجة — راجع ربط الحسابات", attempt_count);
        failed++;
      }
    } catch (err: unknown) {
      const msg = errMsg(err);
      logger.warn({ id, source_type, source_id, attempt: attempt_count + 1, err: msg }, "[ACCT_RETRY_WORKER] attempt failed");

      if (attempt_count + 1 >= MAX_RETRY_ATTEMPTS) {
        await markPermanentlyFailed(id, msg);
      } else {
        await markRetried(id, msg, attempt_count);
      }
      failed++;
    }
  }

  return { attempted: events.length, succeeded, failed, skipped };
}
