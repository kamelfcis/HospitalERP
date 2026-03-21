/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contract Approval Service — خدمة الموافقات المسبقة للعقود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Phase 4: تحوّل approval_required إلى سير عمل تشغيلي فعال.
 *
 *  آلة حالة الموافقة:
 *    pending  → approved   (approveLine)
 *    pending  → rejected   (rejectLine)
 *    pending  → cancelled  (cancelApproval)
 *    approved → مُقفَل — يحتاج APPROVALS_OVERRIDE
 *    rejected → مُقفَل — يحتاج APPROVALS_OVERRIDE
 *
 *  تأثير القرار على سطر الفاتورة:
 *    approved:
 *      patientInvoiceLine.approvalStatus  → 'approved'
 *      patientInvoiceLine.coverageStatus  → 'covered'
 *    rejected:
 *      patientInvoiceLine.approvalStatus  → 'rejected'
 *      patientInvoiceLine.coverageStatus  → 'not_covered'
 *      patientInvoiceLine.companyShareAmount → '0'
 *      patientInvoiceLine.patientShareAmount → contractPrice
 *
 *  كل الكتابات تمر عبر storage + db مباشرةً (no HTTP, pure business logic).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { patientInvoiceLines, contractApprovals } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateApprovalParams {
  patientInvoiceLineId: string;
  contractId:           string;
  contractMemberId?:    string | null;
  serviceId?:           string | null;
  requestedAmount:      string;
  serviceDescription?:  string;
  requestedBy?:         string | null;
  notes?:               string | null;
}

export interface ApproveLineParams {
  approvalId:      string;
  userId:          string;
  approvedAmount?: string;   // null = full approval
  notes?:          string;
}

export interface RejectLineParams {
  approvalId:      string;
  userId:          string;
  rejectionReason: string;
  notes?:          string;
}

export interface CancelApprovalParams {
  approvalId: string;
  userId:     string;
  notes?:     string;
}

export class ApprovalServiceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ApprovalServiceError";
  }
}

// ─── Service Functions ────────────────────────────────────────────────────

/**
 * createApprovalRequest
 *
 * ينشئ طلب موافقة جديد للسطر المحدد.
 * إذا كان هناك طلب pending موجود بالفعل، يُعيده دون إنشاء مكرر.
 */
export async function createApprovalRequest(params: CreateApprovalParams) {
  const {
    patientInvoiceLineId, contractId, contractMemberId,
    serviceId, requestedAmount, serviceDescription, requestedBy, notes,
  } = params;

  // Check for existing pending approval (idempotency)
  const existing = await storage.getApprovalByLineId(patientInvoiceLineId);
  if (existing) {
    logger.debug({ lineId: patientInvoiceLineId, existingId: existing.id },
      "[Approvals] pending approval already exists — returning existing");
    return existing;
  }

  const approval = await storage.createApproval({
    patientInvoiceLineId,
    contractId,
    contractMemberId:   contractMemberId ?? null,
    serviceId:          serviceId ?? null,
    requestedAmount,
    serviceDescription: serviceDescription ?? null,
    requestedBy:        requestedBy ?? null,
    notes:              notes ?? null,
    approvalStatus:     "pending",
  });

  // Sync line approvalStatus to pending
  await syncLineApprovalStatus(patientInvoiceLineId, "pending", null);

  logger.info({ approvalId: approval.id, lineId: patientInvoiceLineId, contractId },
    "[Approvals] approval request created");

  return approval;
}

/**
 * approveLine
 *
 * يقبل طلب الموافقة.
 * - full_approval: إذا لم يُحدَّد approvedAmount أو يساوي requestedAmount
 * - partial_approval: إذا كان approvedAmount < requestedAmount
 *
 * تأثيرات على السطر:
 *   coverageStatus  → 'covered'
 *   approvalStatus  → 'approved'
 *   companyShareAmount يُحدَّث إذا كانت موافقة جزئية
 */
export async function approveLine(params: ApproveLineParams) {
  const { approvalId, userId, approvedAmount, notes } = params;

  const approval = await storage.getApprovalById(approvalId);
  if (!approval) throw new ApprovalServiceError("طلب الموافقة غير موجود", "NOT_FOUND");

  if (approval.approvalStatus !== "pending") {
    throw new ApprovalServiceError(
      `لا يمكن الموافقة على طلب بحالة: ${approval.approvalStatus}`,
      "INVALID_STATE",
    );
  }

  const finalApprovedAmount = approvedAmount ?? approval.requestedAmount;
  const isPartial = parseFloat(finalApprovedAmount) < parseFloat(String(approval.requestedAmount));
  const decision  = isPartial ? "partial_approval" : "full_approval";

  const updated = await storage.updateApproval(approvalId, {
    approvalStatus:   "approved",
    approvalDecision: decision,
    approvedAmount:   finalApprovedAmount,
    decidedAt:        new Date(),
    decidedBy:        userId,
    notes:            notes ?? undefined,
  });

  // Sync line fields
  if (approval.patientInvoiceLineId) {
    await syncLineApprovalStatus(approval.patientInvoiceLineId, "approved", "covered");

    if (isPartial) {
      // Adjust company share to approved amount; patient picks up the rest
      const line = await db.select()
        .from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.id, approval.patientInvoiceLineId))
        .limit(1);
      if (line[0]) {
        const l = line[0] as any;
        const contractPrice   = parseFloat(String(l.contractPrice ?? l.unitPrice ?? "0"));
        const newPatientShare = (contractPrice - parseFloat(finalApprovedAmount)).toFixed(2);
        await db.update(patientInvoiceLines)
          .set({
            companyShareAmount: finalApprovedAmount,
            patientShareAmount: newPatientShare,
          } as any)
          .where(eq(patientInvoiceLines.id, approval.patientInvoiceLineId));
      }
    }
  }

  logger.info({ approvalId, decision, approvedAmount: finalApprovedAmount, decidedBy: userId },
    "[Approvals] line approved");

  return updated;
}

/**
 * rejectLine
 *
 * يرفض طلب الموافقة.
 *
 * تأثيرات على السطر:
 *   coverageStatus  → 'not_covered'
 *   approvalStatus  → 'rejected'
 *   companyShareAmount → '0'
 *   patientShareAmount → contractPrice (full patient responsibility)
 */
export async function rejectLine(params: RejectLineParams) {
  const { approvalId, userId, rejectionReason, notes } = params;

  const approval = await storage.getApprovalById(approvalId);
  if (!approval) throw new ApprovalServiceError("طلب الموافقة غير موجود", "NOT_FOUND");

  if (approval.approvalStatus !== "pending") {
    throw new ApprovalServiceError(
      `لا يمكن رفض طلب بحالة: ${approval.approvalStatus}`,
      "INVALID_STATE",
    );
  }

  const updated = await storage.updateApproval(approvalId, {
    approvalStatus:   "rejected",
    approvalDecision: "rejection",
    rejectionReason,
    decidedAt:        new Date(),
    decidedBy:        userId,
    notes:            notes ?? undefined,
  });

  // Sync line fields: rejected → not_covered, companyShare=0, patient pays all
  if (approval.patientInvoiceLineId) {
    await syncLineApprovalStatus(approval.patientInvoiceLineId, "rejected", "not_covered");

    const line = await db.select()
      .from(patientInvoiceLines)
      .where(eq(patientInvoiceLines.id, approval.patientInvoiceLineId))
      .limit(1);
    if (line[0]) {
      const l = line[0] as any;
      const contractPrice = String(l.contractPrice ?? l.unitPrice ?? "0");
      await db.update(patientInvoiceLines)
        .set({
          companyShareAmount: "0",
          patientShareAmount: contractPrice,
        } as any)
        .where(eq(patientInvoiceLines.id, approval.patientInvoiceLineId));
    }
  }

  logger.info({ approvalId, rejectionReason, decidedBy: userId },
    "[Approvals] line rejected");

  return updated;
}

/**
 * cancelApproval
 *
 * يُلغي طلب موافقة pending.
 * لا يُلغي طلبات approved/rejected (يحتاج APPROVALS_OVERRIDE).
 */
export async function cancelApproval(params: CancelApprovalParams) {
  const { approvalId, userId, notes } = params;

  const approval = await storage.getApprovalById(approvalId);
  if (!approval) throw new ApprovalServiceError("طلب الموافقة غير موجود", "NOT_FOUND");

  if (approval.approvalStatus !== "pending") {
    throw new ApprovalServiceError(
      `لا يمكن إلغاء طلب بحالة: ${approval.approvalStatus} — يحتاج صلاحية التجاوز`,
      "INVALID_STATE",
    );
  }

  const updated = await storage.updateApproval(approvalId, {
    approvalStatus: "cancelled",
    decidedAt:      new Date(),
    decidedBy:      userId,
    notes:          notes ?? undefined,
  });

  // Sync line — cancelled resets back to approval_required state
  if (approval.patientInvoiceLineId) {
    await syncLineApprovalStatus(approval.patientInvoiceLineId, "pending", "approval_required");
  }

  logger.info({ approvalId, cancelledBy: userId }, "[Approvals] approval cancelled");

  return updated;
}

/**
 * getApprovalByLine
 *
 * يُعيد آخر طلب موافقة فعّال للسطر (pending → approved → rejected).
 */
export async function getApprovalByLine(lineId: string) {
  return storage.getApprovalByLineId(lineId);
}

/**
 * listPendingApprovals
 */
export async function listPendingApprovals(filters?: { companyId?: string; contractId?: string }) {
  return storage.listApprovals({ status: "pending", ...filters });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

async function syncLineApprovalStatus(
  lineId:         string,
  approvalStatus: string,
  coverageStatus: string | null,
) {
  try {
    const updates: any = { approvalStatus, updatedAt: new Date() };
    if (coverageStatus !== null) updates.coverageStatus = coverageStatus;
    await db.update(patientInvoiceLines)
      .set(updates)
      .where(eq(patientInvoiceLines.id, lineId));
  } catch (err: any) {
    logger.warn({ err: err.message, lineId }, "[Approvals] syncLineApprovalStatus failed (non-fatal)");
  }
}
