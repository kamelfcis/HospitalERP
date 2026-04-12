import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { eq } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission, broadcastToUnit } from "./_shared";
import { broadcastPatientInvoiceUpdate } from "./_sse";
import { patientInvoiceHeaders, doctors } from "@shared/schema";
import { generateClaimsForInvoice } from "../lib/contract-claim-generator";
import { assertInvoiceScopeGuard, ScopeViolationError } from "../lib/scope-guard";
import { auditItemPriceDeviations } from "../lib/patient-invoice-helpers";
import { generatePatientInvoiceGL } from "../lib/patient-invoice-gl-generator";

export function registerFinalizePostRoute(app: Express) {

  app.post("/api/patient-invoices/:id/finalize", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { expectedVersion, oversellReason } = req.body || {};
      const invoiceId = req.params.id as string;

      const existing = await storage.getPatientInvoice(invoiceId);
      if (!existing) return res.status(404).json({ message: "فاتورة المريض غير موجودة" });

      if (existing.status === "finalized") {
        return res.json({ ...existing, _idempotent: true });
      }
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن اعتماد فاتورة ملغاة", code: "INVALID_STATUS" });
      }

      const existingLines = (existing as any).lines ?? [];
      const hasDoctorCostLines = existingLines.some((l: any) => l.lineType === "doctor_cost" && !l.isVoid);
      const validationBillingMode = (existing as any).billingMode || "hospital_collect";

      if (hasDoctorCostLines) {
        const orphanCostLines = existingLines.filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && !l.doctorId);
        if (orphanCostLines.length > 0) {
          return res.status(400).json({
            message: "يوجد سطور أجر طبيب بدون ربط بطبيب (doctor_id). يجب تحديد الطبيب أولاً.",
            code: "DOCTOR_COST_NO_DOCTOR",
          });
        }
      }

      let doctorData: { payableAccountId: string | null; receivableAccountId: string | null; financialMode: string | null; costCenterId: string | null } | null = null;
      if (existing.doctorId) {
        const [doc] = await db.select({
          payableAccountId:    doctors.payableAccountId,
          receivableAccountId: doctors.receivableAccountId,
          financialMode:       doctors.financialMode,
          costCenterId:        doctors.costCenterId,
        }).from(doctors).where(eq(doctors.id, existing.doctorId)).limit(1);
        doctorData = doc ?? null;

        if (validationBillingMode === "hospital_collect" && hasDoctorCostLines && !doctorData?.payableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل مستشفى بدون تحديد حساب الدائنين (مستحقات الطبيب). عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_PAYABLE",
          });
        }
        if (validationBillingMode === "doctor_collect" && !doctorData?.receivableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل طبيب بدون تحديد حساب المدينين للطبيب. عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_RECEIVABLE",
          });
        }
      }

      await storage.assertPeriodOpen(existing.invoiceDate);

      await assertInvoiceScopeGuard(
        req.session.userId as string,
        (existing as any).departmentId,
        (existing as any).warehouseId,
        "patient_invoice_finalize",
      );

      void auditItemPriceDeviations(
        (existing as any).lines ?? [],
        (existing as any).departmentId,
        (existing as any).warehouseId,
        invoiceId,
        req.session.userId,
      );

      const result = await storage.finalizePatientInvoice(
        invoiceId,
        expectedVersion != null ? Number(expectedVersion) : undefined,
        oversellReason ? String(oversellReason).trim() : undefined
      );

      storage.createAuditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "finalize",
        oldValues: JSON.stringify({ status: "draft", version: existing.version }),
        newValues: JSON.stringify({ status: "finalized", version: result.version }),
      }).catch(err => logger.warn({ err: err.message, invoiceId }, "[Audit] patient invoice finalize"));

      const invoiceLines = existing;
      if (invoiceLines) {
        const finalizedLines = invoiceLines.lines || [];
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
        const finalizedBy = (req.session as any)?.userId ?? null;

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

        // توليد قيد GL — fire-and-forget عبر الدالة المركزية المشتركة
        generatePatientInvoiceGL(invoiceId)
          .catch(err => logger.warn({ err: err.message, invoiceId }, "[GL] patient invoice finalize"));
      }

      storage.createTreasuryTransactionsForInvoice(invoiceId, result.finalizedAt
        ? new Date(result.finalizedAt).toISOString().split("T")[0]
        : result.invoiceDate
      ).catch(err => logger.warn({ err: err.message, invoiceId }, "[Treasury] patient invoice finalize"));

      if (existing.departmentId) {
        broadcastToUnit(existing.departmentId, "invoice_finalized", {
          id:           result.id,
          invoiceNumber: result.invoiceNumber,
          netTotal:     result.netAmount,
          isReturn:     false,
          departmentId: existing.departmentId,
          type:         "patient_invoice",
        });
      }
      const _ptId = String((result as any).patientId ?? (existing as any).patientId ?? "");
      if (_ptId) broadcastPatientInvoiceUpdate(_ptId, "invoice_finalized", { invoiceId, ts: Date.now() });
      const hasContract = !!(result as any).companyId || !!(result as any).contractId;
      if (hasContract) {
        await db.update(patientInvoiceHeaders)
          .set({ claimStatus: "generating", updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId))
          .catch(() => {});
      }
      generateClaimsForInvoice(invoiceId)
        .catch(err => logger.warn({ err: err.message, invoiceId }, "[Claims] fire-and-forget outer catch"));

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg?.includes("الفترة المحاسبية")) return res.status(403).json({ message: msg });
      if (msg?.includes("مسودة") || msg?.includes("تم تعديل الفاتورة")) return res.status(409).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });
}
