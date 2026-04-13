import { db }      from "../db";
import { eq }      from "drizzle-orm";
import { storage } from "../storage";
import { doctors }            from "@shared/schema";
import { assertInvoiceScopeGuard } from "../lib/scope-guard";

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
