import { db }      from "../db";
import { eq }      from "drizzle-orm";
import { storage } from "../storage";
import { doctors, patientInvoiceHeaders } from "@shared/schema";
import { assertInvoiceScopeGuard } from "../lib/scope-guard";
import { logger }  from "../lib/logger";
import { generatePatientInvoiceGL } from "../lib/patient-invoice-gl-generator";

export class FinalizeValidationError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = "FinalizeValidationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * assertInvoiceCanBeFinalized
 *
 * Validates all pre-conditions required before finalizing a patient invoice.
 * Throws FinalizeValidationError (400) for business-rule violations.
 * Propagates ScopeViolationError and period-open errors unchanged so the
 * route's existing catch block handles them correctly.
 *
 * Checks (in order):
 *   1. Doctor-cost lines without a linked doctorId (orphan cost lines)
 *   2. Doctor account configuration for the invoice's billing mode
 *   3. Fiscal period is open for the invoice date
 *   4. User's department/warehouse scope allows this invoice
 */
export async function assertInvoiceCanBeFinalized(
  existing: any,
  userId: string,
): Promise<void> {
  const lines           = (existing.lines ?? []) as any[];
  const billingMode     = existing.billingMode || "hospital_collect";
  const hasDoctorCostLines = lines.some((l: any) => l.lineType === "doctor_cost" && !l.isVoid);

  // ── 1. Orphan doctor-cost lines ──────────────────────────────────────────────
  if (hasDoctorCostLines) {
    const orphans = lines.filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && !l.doctorId);
    if (orphans.length > 0) {
      throw new FinalizeValidationError(
        400,
        "يوجد سطور أجر طبيب بدون ربط بطبيب (doctor_id). يجب تحديد الطبيب أولاً.",
        "DOCTOR_COST_NO_DOCTOR",
      );
    }
  }

  // ── 2. Doctor account checks ─────────────────────────────────────────────────
  if (existing.doctorId) {
    const [doc] = await db
      .select({
        payableAccountId:    doctors.payableAccountId,
        receivableAccountId: doctors.receivableAccountId,
        financialMode:       doctors.financialMode,
        costCenterId:        doctors.costCenterId,
      })
      .from(doctors)
      .where(eq(doctors.id, existing.doctorId))
      .limit(1);

    const doctorData = doc ?? null;

    if (billingMode === "hospital_collect" && hasDoctorCostLines && !doctorData?.payableAccountId) {
      throw new FinalizeValidationError(
        400,
        "لا يمكن اعتماد فاتورة تحصيل مستشفى بدون تحديد حساب الدائنين (مستحقات الطبيب). عدّل بيانات الطبيب أولاً.",
        "DOCTOR_NO_PAYABLE",
      );
    }
    if (billingMode === "doctor_collect" && !doctorData?.receivableAccountId) {
      throw new FinalizeValidationError(
        400,
        "لا يمكن اعتماد فاتورة تحصيل طبيب بدون تحديد حساب المدينين للطبيب. عدّل بيانات الطبيب أولاً.",
        "DOCTOR_NO_RECEIVABLE",
      );
    }
  }

  // ── 3. Fiscal period open ────────────────────────────────────────────────────
  await storage.assertPeriodOpen(existing.invoiceDate);

  // ── 4. Scope guard ───────────────────────────────────────────────────────────
  await assertInvoiceScopeGuard(
    userId,
    existing.departmentId,
    existing.warehouseId,
    "patient_invoice_finalize",
  );
}

/**
 * recordFinalizeSnapshot
 *
 * Fire-and-forget: records the audit log, builds + persists the finalized
 * snapshot JSON, emits the INVOICE_FINALIZED structured log, and triggers
 * outpatient GL generation.  All DB writes use .catch() to avoid blocking
 * the HTTP response.
 *
 * Owns:
 *   1. Audit log insert (status change draft → finalized)
 *   2. Classifications summary aggregation by businessClassification
 *   3. Structured INVOICE_FINALIZED logger.info event
 *   4. Snapshot payload construction + finalizedSnapshotJson DB write
 *   5. Outpatient GL journal trigger (deferred to final-close for inpatient)
 */
export function recordFinalizeSnapshot(
  invoiceId:   string,
  existing:    any,
  result:      any,
  finalizedBy: string | null,
): void {
  // ── 1. Audit log ─────────────────────────────────────────────────────────────
  storage.createAuditLog({
    tableName: "patient_invoice_headers",
    recordId:  invoiceId,
    action:    "finalize",
    oldValues: JSON.stringify({ status: "draft",      version: existing.version }),
    newValues: JSON.stringify({ status: "finalized",  version: result.version }),
  }).catch((err: any) => logger.warn({ err: err.message, invoiceId }, "[Audit] patient invoice finalize"));

  // ── 2. Classifications summary ────────────────────────────────────────────────
  const finalizedLines = (existing.lines ?? []) as any[];
  const classificationsSummary = finalizedLines.reduce(
    (acc: Record<string, { count: number; totalEGP: number }>, l: any) => {
      const cls = l.businessClassification || "unclassified";
      if (!acc[cls]) acc[cls] = { count: 0, totalEGP: 0 };
      acc[cls].count++;
      acc[cls].totalEGP = parseFloat((acc[cls].totalEGP + parseFloat(String(l.totalPrice || "0"))).toFixed(2));
      return acc;
    },
    {},
  );

  // ── 3. Structured event log ───────────────────────────────────────────────────
  logger.info({
    invoiceId,
    invoiceNumber:         result.invoiceNumber,
    patientName:           result.patientName,
    totalAmount:           result.totalAmount,
    netAmount:             result.netAmount,
    lineCount:             finalizedLines.length,
    finalizedBy,
    classificationsSummary,
  }, "INVOICE_FINALIZED");

  // ── 4. Snapshot JSON persistence ─────────────────────────────────────────────
  const snapshotPayload = {
    invoiceId,
    invoiceNumber:  result.invoiceNumber,
    patientName:    result.patientName,
    invoiceDate:    result.invoiceDate,
    finalizedAt:    new Date().toISOString(),
    finalizedBy,
    totalAmount:    result.totalAmount,
    netAmount:      result.netAmount,
    paidAmount:     result.paidAmount,
    lineCount:      finalizedLines.length,
    classificationsSummary,
    lineTotals: finalizedLines.map((l: any) => ({
      lineType:               l.lineType,
      businessClassification: l.businessClassification,
      description:            l.description,
      quantity:               l.quantity,
      unitPrice:              l.unitPrice,
      totalPrice:             l.totalPrice,
    })),
  };
  db.update(patientInvoiceHeaders)
    .set({ finalizedSnapshotJson: JSON.stringify(snapshotPayload), updatedAt: new Date() })
    .where(eq(patientInvoiceHeaders.id, invoiceId))
    .catch((err: any) => logger.warn({ err: err.message, invoiceId }, "[Snapshot] failed to save finalized snapshot to DB"));

  // ── 5. GL generation (outpatient only) ───────────────────────────────────────
  const isInpatient = !!existing.admissionId;
  if (!isInpatient) {
    generatePatientInvoiceGL(invoiceId)
      .catch((err: any) => logger.warn({ err: err.message, invoiceId }, "[GL] patient invoice finalize (outpatient)"));
  } else {
    logger.info({ invoiceId }, "[GL] inpatient invoice — GL deferred to final-close");
  }
}
