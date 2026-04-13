/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoice Payment Service
 *  Extracted from patient-invoices-payment-ops.ts: add-payment handler.
 *
 *  recordPatientPayment() owns the full DB orchestration:
 *    1. Row-lock fetch + state validation
 *    2. Reference number generation (RCP-XXXXXX sequential)
 *    3. Payment insert
 *    4. Treasury transaction insert (idempotent ON CONFLICT)
 *    5. Paid-amount recalculation (SUM)
 *    6. Header update (paid_amount + version + updated_at)
 *    7. Audit log
 *    8. Return { updated, patientId } — route handles broadcast + refresh
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db }      from "../db";
import { sql }     from "drizzle-orm";
import { storage } from "../storage";
import { auditLog } from "../route-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientPaymentParams {
  amount:        number;
  paymentMethod: string;
  treasuryId?:   string;
  paymentDate?:  string;
  notes?:        string;
}

export interface RecordPaymentResult {
  patientId: string;
  updated:   Awaited<ReturnType<typeof storage.getPatientInvoice>>;
}

// ─── recordPatientPayment ─────────────────────────────────────────────────────

export async function recordPatientPayment(
  invoiceId: string,
  params:    PatientPaymentParams,
  userId:    string | undefined,
): Promise<RecordPaymentResult> {

  // 1. Lock row and validate state
  const invRes = await db.execute(sql`
    SELECT id, patient_id, status, is_final_closed, net_amount, paid_amount
    FROM patient_invoice_headers
    WHERE id = ${invoiceId}
    FOR UPDATE
  `);
  const inv = invRes.rows[0] as Record<string, unknown> | undefined;
  if (!inv) throw Object.assign(new Error("الفاتورة غير موجودة"), { status: 404 });
  if (inv.is_final_closed) {
    throw Object.assign(new Error("لا يمكن إضافة دفعة على فاتورة مغلقة نهائيًا"), { status: 409 });
  }
  if (inv.status !== "draft") {
    throw Object.assign(new Error("إضافة الدفعات تتم على الفواتير في حالة مسودة فقط"), { status: 409 });
  }

  // 2. Generate reference number (RCP-XXXXXX)
  const refRes = await db.execute(sql`
    SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
    FROM patient_invoice_payments WHERE reference_number LIKE 'RCP-%'
  `);
  const maxRef = parseInt(
    ((refRes.rows[0] as Record<string, unknown>).max_num as string | null) || "0"
  ) || 0;
  const referenceNumber = `RCP-${String(maxRef + 1).padStart(6, "0")}`;

  const actualDate = params.paymentDate || new Date().toISOString().split("T")[0];

  // 3. Insert payment record
  const paymentInsert = await db.execute(sql`
    INSERT INTO patient_invoice_payments
      (id, header_id, payment_date, amount, payment_method, treasury_id, reference_number, notes, created_at)
    VALUES
      (gen_random_uuid(), ${invoiceId}, ${actualDate}, ${Number(params.amount)},
       ${params.paymentMethod || "cash"}, ${params.treasuryId || null},
       ${referenceNumber}, ${params.notes || null}, NOW())
    RETURNING id
  `);
  const paymentId = (paymentInsert.rows[0] as Record<string, unknown>).id as string;

  // 4. Treasury transaction (idempotent)
  if (params.treasuryId) {
    await db.execute(sql`
      INSERT INTO treasury_transactions
        (treasury_id, type, amount, description, source_type, source_id, transaction_date)
      VALUES
        (${params.treasuryId}, 'in', ${Number(params.amount)},
         ${"استلام دفعة مريض — " + referenceNumber},
         'patient_invoice_payment', ${paymentId}, ${actualDate})
      ON CONFLICT (source_type, source_id, treasury_id)
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL
      DO NOTHING
    `);
  }

  // 5. Recalculate total paid
  const sumRes = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM patient_invoice_payments
    WHERE header_id = ${invoiceId}
  `);
  const totalPaid = parseFloat(
    ((sumRes.rows[0] as Record<string, unknown>).total_paid as string) || "0"
  );

  // 6. Update header
  await db.execute(sql`
    UPDATE patient_invoice_headers
    SET paid_amount = ${totalPaid},
        version    = version + 1,
        updated_at = NOW()
    WHERE id = ${invoiceId}
  `);

  // 7. Audit log
  await auditLog({
    tableName: "patient_invoice_headers",
    recordId:  invoiceId,
    action:    "add_payment",
    userId,
    newValues: JSON.stringify({
      amount:          params.amount,
      paymentMethod:   params.paymentMethod,
      treasuryId:      params.treasuryId,
      paymentDate:     actualDate,
      referenceNumber,
    }),
  });

  // 8. Return updated invoice + patientId for route-level broadcast
  return {
    patientId: String(inv.patient_id ?? ""),
    updated:   await storage.getPatientInvoice(invoiceId),
  };
}
