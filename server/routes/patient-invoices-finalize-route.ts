import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { eq } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission, broadcastToUnit } from "./_shared";
import { broadcastPatientInvoiceUpdate } from "./_sse";
import { patientInvoiceHeaders } from "@shared/schema";
import { generateClaimsForInvoice } from "../lib/contract-claim-generator";
import { ScopeViolationError } from "../lib/scope-guard";
import { auditItemPriceDeviations } from "../lib/patient-invoice-helpers";
import { assertInvoiceCanBeFinalized, FinalizeValidationError, recordFinalizeSnapshot } from "../services/patient-invoice-finalize-service";

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

      await assertInvoiceCanBeFinalized(existing, req.session.userId as string);

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

      recordFinalizeSnapshot(invoiceId, existing, result, (req.session as any)?.userId ?? null);

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
      if (error instanceof FinalizeValidationError) {
        return res.status(error.statusCode).json({ message: error.message, code: error.code });
      }
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
