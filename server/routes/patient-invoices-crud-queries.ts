import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
} from "./_shared";
import {
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  patientInvoiceHeaders,
} from "@shared/schema";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { applyContractCoverage } from "../lib/patient-invoice-coverage";
import { injectDoctorCostLines } from "../lib/doctor-cost-engine";
import { assertInvoiceScopeGuard, assertServiceDeptMatch, ScopeViolationError } from "../lib/scope-guard";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import {
  enforceNonZeroPrice,
  auditContractPriceOverrides,
  auditItemPriceDeviations,
  autoFillClassification,
  fireApprovalRequestsForInvoice,
} from "../lib/patient-invoice-helpers";
import { generateClaimsForInvoice } from "../lib/contract-claim-generator";

export async function assertNotFinalClosed(invoiceId: string): Promise<void> {
  const row = await db.execute(sql`
    SELECT is_final_closed FROM patient_invoice_headers WHERE id = ${invoiceId}
  `);
  const inv = row.rows?.[0] as Record<string, unknown> | undefined;
  if (inv?.is_final_closed) {
    const err = new Error("لا يمكن تعديل فاتورة تم إغلاقها نهائيًا");
    (err as any).statusCode = 409;
    throw err;
  }
}

export async function processInvoiceLines(
  lines: any[],
  headerParsed: any,
  userId: string,
): Promise<any[]> {
  let processed = await autoFillClassification(lines);

  processed = processed.map((l: any) => ({
    ...l,
    appliedBy: l.templateId ? (userId || null) : null,
    appliedAt: l.templateId ? (l.appliedAt ? new Date(l.appliedAt) : new Date()) : null,
  }));

  processed = await applyContractCoverage(
    headerParsed.contractId ?? null,
    processed,
    headerParsed.invoiceDate ?? undefined,
  );
  auditContractPriceOverrides(processed, headerParsed.contractId, userId);

  const billingMode = headerParsed.billingMode || "hospital_collect";
  if (billingMode !== "doctor_collect") {
    processed = await injectDoctorCostLines(processed, {
      headerDoctorId:   headerParsed.doctorId   ?? null,
      headerDoctorName: headerParsed.doctorName ?? null,
    });
  } else {
    processed = processed.filter((l: any) => l.lineType !== "doctor_cost");
  }

  return processed;
}

export function registerCrudQueries(app: Express) {
  app.get("/api/patient-invoices/next-number", requireAuth, async (_req, res) => {
    try {
      const num = await storage.getNextPatientInvoiceNumber();
      res.json({ nextNumber: num });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patient-invoice-payments/next-ref", requireAuth, async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string || "0") || 0;
      const ref = await storage.getNextPaymentRefNumber(offset);
      res.json({ ref });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patient-invoices", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const filters = {
        status:           req.query.status as string,
        dateFrom:         req.query.dateFrom as string,
        dateTo:           req.query.dateTo as string,
        patientName:      req.query.patientName as string,
        doctorName:       req.query.doctorName as string,
        page:             req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize:         req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
        includeCancelled: req.query.includeCancelled === 'true',
      };
      const result = await storage.getPatientInvoices(filters);
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "patient_invoice", "invoiceNumber") });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const invoice = await storage.getPatientInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "فاتورة المريض غير موجودة" });
      res.json(addFormattedNumber(invoice, "patient_invoice", "invoiceNumber"));
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });
}
