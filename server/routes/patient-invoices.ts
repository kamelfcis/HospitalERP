// ACCOUNTING_PENDING: patient_invoice finalize → GL journal generation depends on
//   Account Mappings having 'receivables' + line-type accounts configured.
//   If mappings are missing, generateJournalEntry returns null silently.
//   journal_status tracks: 'none' | 'pending' | 'completed' | 'failed' | 'needs_retry'.
// ACCOUNTING_PENDING: patient_invoice final-close → no separate GL entry generated.
//   Close only validates payment sufficiency (cash: full paid, contract: paid + company share >= net).
// ACCOUNTING_PENDING: patient_invoice distribute → creates child invoices with journal_status='none',
//   GL is only generated on individual finalization of each child invoice.

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { sql, eq, inArray } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  broadcastToUnit,
} from "./_shared";
import { generateClaimsForInvoice } from "../lib/contract-claim-generator";
import {
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  patientInvoiceHeaders,
  patientInvoiceLines,
  doctors,
  services,
  companies,
  treasuries,
} from "@shared/schema";
import { resolveBusinessClassificationWithMeta } from "@shared/resolve-business-classification";
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

async function assertNotFinalClosed(invoiceId: string): Promise<void> {
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

async function processInvoiceLines(
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
      headerDoctorId: headerParsed.doctorId ?? null,
      headerDoctorName: headerParsed.doctorName ?? null,
    });
  } else {
    processed = processed.filter((l: any) => l.lineType !== "doctor_cost");
  }

  return processed;
}

export function registerPatientInvoicesRoutes(app: Express) {
  // ============= Patient Invoices =============

  app.get("/api/patient-invoices/next-number", requireAuth, async (_req, res) => {
    try {
      const num = await storage.getNextPatientInvoiceNumber();
      res.json({ nextNumber: num });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-invoice-payments/next-ref", requireAuth, async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string || "0") || 0;
      const ref = await storage.getNextPaymentRefNumber(offset);
      res.json({ ref });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-invoices", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        patientName: req.query.patientName as string,
        doctorName: req.query.doctorName as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
        includeCancelled: req.query.includeCancelled === 'true',
      };
      const result = await storage.getPatientInvoices(filters);
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "patient_invoice", "invoiceNumber") });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const invoice = await storage.getPatientInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "فاتورة المريض غير موجودة" });
      res.json(addFormattedNumber(invoice, "patient_invoice", "invoiceNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-invoices", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_CREATE), async (req, res) => {
    try {
      const { header, lines, payments } = req.body;

      let headerParsed = insertPatientInvoiceHeaderSchema.parse(header) as any;
      let linesParsed = (lines || []).map((l: Record<string, unknown>) => insertPatientInvoiceLineSchema.omit({ headerId: true }).parse(l));
      const paymentsParsed = (payments || []).map((p: Record<string, unknown>) => insertPatientInvoicePaymentSchema.omit({ headerId: true }).parse(p));

      if (!headerParsed.patientId && headerParsed.patientName?.trim()) {
        const ptRecord = await findOrCreatePatient(headerParsed.patientName, headerParsed.patientPhone || null);
        headerParsed = { ...headerParsed, patientId: ptRecord.id };
      }

      linesParsed = await processInvoiceLines(linesParsed, headerParsed, req.session.userId as string);

      await assertInvoiceScopeGuard(req.session.userId as string, headerParsed.departmentId, headerParsed.warehouseId, "patient_invoice_create");
      await assertServiceDeptMatch(linesParsed.filter((l: any) => l.lineType !== "doctor_cost"), headerParsed.departmentId);
      void auditItemPriceDeviations(linesParsed, headerParsed.departmentId, headerParsed.warehouseId, null, req.session.userId);
      if (!(await enforceNonZeroPrice(req, res, linesParsed.filter((l: any) => l.lineType !== "doctor_cost")))) return;

      const result = await storage.createPatientInvoice(headerParsed, linesParsed, paymentsParsed);

      // Phase 4: fire approval requests for approval_required lines (non-blocking)
      const rh = result as any;
      if (rh.contractId) {
        setImmediate(() => fireApprovalRequestsForInvoice(rh.id, rh.contractId));
      }

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      if (error instanceof z.ZodError || (error instanceof Error && error.name === "ZodError")) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("unique") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate")) {
        return res.status(409).json({ message: "رقم الفاتورة مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      await assertNotFinalClosed(req.params.id as string);

      const { header, lines, payments, expectedVersion } = req.body;

      const headerParsed = insertPatientInvoiceHeaderSchema.partial().parse(header);
      let linesParsed = (lines || []).map((l: Record<string, unknown>) => insertPatientInvoiceLineSchema.omit({ headerId: true }).parse(l));
      const paymentsParsed = (payments || []).map((p: Record<string, unknown>) => insertPatientInvoicePaymentSchema.omit({ headerId: true }).parse(p));

      if (!(headerParsed as any).billingMode) {
        const [existingHdr] = await db.select({ billingMode: patientInvoiceHeaders.billingMode }).from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, req.params.id as string)).limit(1);
        if (existingHdr?.billingMode) {
          (headerParsed as any).billingMode = existingHdr.billingMode;
        }
      }

      linesParsed = await processInvoiceLines(linesParsed, headerParsed, req.session.userId as string);

      await assertInvoiceScopeGuard(req.session.userId as string, (headerParsed as any).departmentId, (headerParsed as any).warehouseId, "patient_invoice_update");
      await assertServiceDeptMatch(linesParsed.filter((l: any) => l.lineType !== "doctor_cost"), (headerParsed as any).departmentId);
      void auditItemPriceDeviations(linesParsed, (headerParsed as any).departmentId, (headerParsed as any).warehouseId, req.params.id as string, req.session.userId);
      if (!(await enforceNonZeroPrice(req, res, linesParsed.filter((l: any) => l.lineType !== "doctor_cost")))) return;

      const result = await storage.updatePatientInvoice(req.params.id as string, headerParsed, linesParsed, paymentsParsed, expectedVersion != null ? Number(expectedVersion) : undefined);

      // Phase 4: fire approval requests for approval_required lines (non-blocking)
      const rh2 = result as any;
      const cid2 = rh2.contractId ?? (headerParsed as any).contractId;
      if (cid2) {
        setImmediate(() => fireApprovalRequestsForInvoice(req.params.id as string, cid2));
      }

      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      if ((error as any).statusCode === 409) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      if (error instanceof z.ZodError || (error instanceof Error && error.name === "ZodError")) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("نهائية") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("تم تعديل الفاتورة")) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/patient-invoices/:id/header-discount",
    requireAuth,
    checkPermission("patient_invoices.discount"),
    async (req, res) => {
      try {
        const invoiceId = req.params.id as string;
        const { discountType, discountValue } = req.body;

        if (!["percent", "amount"].includes(discountType)) {
          return res.status(400).json({ message: "نوع الخصم غير صحيح — استخدم percent أو amount" });
        }
        const rawValue = parseFloat(String(discountValue));
        if (isNaN(rawValue) || rawValue < 0) {
          return res.status(400).json({ message: "قيمة الخصم غير صالحة" });
        }

        const invRes = await db.execute(sql`
          SELECT id, status, total_amount, discount_amount, header_discount_percent, header_discount_amount, version, is_final_closed
          FROM patient_invoice_headers
          WHERE id = ${invoiceId}
          FOR UPDATE
        `);
        const inv = invRes.rows[0] as Record<string, unknown>;
        if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
        if (inv.is_final_closed) {
          return res.status(409).json({ message: "لا يمكن تعديل فاتورة تم إغلاقها نهائيًا" });
        }
        if (inv.status !== "draft") {
          return res.status(409).json({ message: "لا يمكن تعديل فاتورة نهائية" });
        }

        const totalAmount = parseFloat((inv.total_amount as string) || "0");
        const lineDiscount = parseFloat((inv.discount_amount as string) || "0");
        const subTotal = totalAmount - lineDiscount;

        let headerDiscountPercent: number;
        let headerDiscountAmount: number;

        if (discountType === "percent") {
          if (rawValue > 100) {
            return res.status(400).json({ message: "نسبة الخصم لا يمكن أن تتجاوز 100%" });
          }
          headerDiscountPercent = rawValue;
          headerDiscountAmount = +(subTotal * rawValue / 100).toFixed(2);
        } else {
          if (rawValue > subTotal) {
            return res.status(400).json({ message: "مبلغ الخصم أكبر من صافي الفاتورة" });
          }
          headerDiscountAmount = +rawValue.toFixed(2);
          headerDiscountPercent = subTotal > 0 ? +(rawValue / subTotal * 100).toFixed(4) : 0;
        }

        const newNetAmount = +(subTotal - headerDiscountAmount).toFixed(2);

        await db.execute(sql`
          UPDATE patient_invoice_headers
          SET header_discount_percent = ${headerDiscountPercent},
              header_discount_amount  = ${headerDiscountAmount},
              net_amount              = ${newNetAmount},
              version                 = version + 1,
              updated_at              = NOW()
          WHERE id = ${invoiceId}
        `);

        await auditLog({
          tableName: "patient_invoice_headers",
          recordId: invoiceId,
          action: "header_discount",
          newValues: JSON.stringify({
            discountType,
            discountValue,
            headerDiscountPercent,
            headerDiscountAmount,
            newNetAmount,
            appliedBy: (req.session as any)?.userId as string | undefined,
          }),
        });

        const updated = await storage.getPatientInvoice(invoiceId);
        res.json(updated);
      } catch (err: unknown) {
        const _em = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
        res.status(500).json({ message: _em });
      }
    }
  );

  app.post("/api/patient-invoices/:id/finalize", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { expectedVersion, oversellReason } = req.body || {};
      const invoiceId = req.params.id as string;

      const existing = await storage.getPatientInvoice(invoiceId);
      if (!existing) return res.status(404).json({ message: "فاتورة المريض غير موجودة" });

      // ── Idempotent: لو الفاتورة معتمدة بالفعل → نرجع نجاح بدون تسجيل مكرر ──
      if (existing.status === "finalized") {
        return res.json({ ...existing, _idempotent: true });
      }
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن اعتماد فاتورة ملغاة", code: "INVALID_STATUS" });
      }

      // ── Hard validation: doctor financial accounts ──────────────────────
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

      if (existing.doctorId) {
        const [doc] = await db.select({
          payableAccountId: doctors.payableAccountId,
          receivableAccountId: doctors.receivableAccountId,
          financialMode: doctors.financialMode,
        }).from(doctors).where(eq(doctors.id, existing.doctorId)).limit(1);

        if (validationBillingMode === "hospital_collect" && hasDoctorCostLines && !doc?.payableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل مستشفى بدون تحديد حساب الدائنين (مستحقات الطبيب). عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_PAYABLE",
          });
        }
        if (validationBillingMode === "doctor_collect" && !doc?.receivableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل طبيب بدون تحديد حساب المدينين للطبيب. عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_RECEIVABLE",
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      await storage.assertPeriodOpen(existing.invoiceDate);

      // ── Scope guard: تحقق أن القسم والمخزن مسموح للمستخدم ────────────────
      await assertInvoiceScopeGuard(
        req.session.userId as string,
        (existing as any).departmentId,
        (existing as any).warehouseId,
        "patient_invoice_finalize",
      );
      // ─────────────────────────────────────────────────────────────────────

      // ── Item price audit (non-blocking, logging only) ──────────────────
      void auditItemPriceDeviations(
        (existing as any).lines ?? [],
        (existing as any).departmentId,
        (existing as any).warehouseId,
        invoiceId,
        req.session.userId,
      );
      // ──────────────────────────────────────────────────────────────────

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

      const invoiceLines = await storage.getPatientInvoice(invoiceId);
      if (invoiceLines) {
        // ── INVOICE_FINALIZED audit log مع ملخص التصنيفات التجارية ─────────────
        const finalizedLines = invoiceLines.lines || [];
        const classificationsSummary = finalizedLines.reduce(
          (acc: Record<string, { count: number; totalEGP: number }>, l: any) => {
            const cls = l.businessClassification || "unclassified";
            if (!acc[cls]) acc[cls] = { count: 0, totalEGP: 0 };
            acc[cls].count++;
            acc[cls].totalEGP = parseFloat(
              (acc[cls].totalEGP + parseFloat(String(l.totalPrice || "0"))).toFixed(2)
            );
            return acc;
          },
          {},
        );
        const finalizedBy = (req.session as any)?.userId ?? null;

        logger.info(
          {
            invoiceId,
            invoiceNumber:          result.invoiceNumber,
            patientName:            result.patientName,
            totalAmount:            result.totalAmount,
            netAmount:              result.netAmount,
            lineCount:              finalizedLines.length,
            finalizedBy,
            classificationsSummary,
          },
          "INVOICE_FINALIZED",
        );

        // ── حفظ الـ snapshot في DB (مرجع دائم — لا يضيع مع الـ logs) ──────────
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
          lineTotals:     finalizedLines.map((l: any) => ({
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

        const glLines = storage.buildPatientInvoiceGLLines(result, invoiceLines.lines || []);

        const dynamicAccountOverrides: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }> = {};
        const invBillingMode = (result as any).billingMode || "hospital_collect";

        if (result.doctorId) {
          const [doc] = await db.select({
            payableAccountId: doctors.payableAccountId,
            receivableAccountId: doctors.receivableAccountId,
            costCenterId: doctors.costCenterId,
          }).from(doctors).where(eq(doctors.id, result.doctorId)).limit(1);

          if (invBillingMode === "doctor_collect") {
            if (doc?.receivableAccountId) {
              const paymentType = (result as any).patientType === "cash" ? "cash" : "receivables";
              dynamicAccountOverrides[paymentType] = { debitAccountId: doc.receivableAccountId };
            }
          } else {
            if (doc?.payableAccountId) {
              dynamicAccountOverrides["doctor_cost"] = { creditAccountId: doc.payableAccountId };
            }
          }

          const doctorCostCenterId = doc?.costCenterId || null;
          let fallbackCostCenterId: string | null = null;
          if (!doctorCostCenterId) {
            const costLines = (invoiceLines.lines || []).filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && l.serviceId);
            const svcIds = [...new Set(costLines.map((l: any) => l.serviceId))].filter(Boolean) as string[];
            if (svcIds.length > 0) {
              const svcRows = await db.select({ costCenterId: services.costCenterId }).from(services).where(inArray(services.id, svcIds));
              fallbackCostCenterId = svcRows.find(s => s.costCenterId)?.costCenterId || null;
            }
          }
          const effectiveCostCenterId = doctorCostCenterId || fallbackCostCenterId;
          if (effectiveCostCenterId) {
            for (const gl of glLines) {
              if (gl.lineType === "doctor_cost") {
                gl.costCenterId = effectiveCostCenterId;
              }
            }
          }
        }

        if ((result as any).patientType === "cash") {
          const treasuryRes = await db.execute(sql`
            SELECT t.gl_account_id
            FROM patient_invoice_payments p
            JOIN treasuries t ON t.id = p.treasury_id
            WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL
            ORDER BY p.created_at DESC
            LIMIT 1
          `);
          const treasuryGl = (treasuryRes.rows[0] as Record<string, unknown>)?.gl_account_id as string | undefined;
          if (treasuryGl) {
            dynamicAccountOverrides["cash"] = { debitAccountId: treasuryGl };
          }
        }

        if ((result as any).companyId && (result as any).patientType !== "cash") {
          const [comp] = await db.select({ glAccountId: companies.glAccountId })
            .from(companies).where(eq(companies.id, (result as any).companyId)).limit(1);
          if (comp?.glAccountId) {
            dynamicAccountOverrides["receivables"] = { debitAccountId: comp.glAccountId };
          }
        }

        // Set source doc + event log to "pending" BEFORE fire-and-forget
        await db.update(patientInvoiceHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
        await logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "pending" });

        storage.generatePatientInvoiceJournal({
          sourceDocumentId: invoiceId,
          reference: `PI-${result.invoiceNumber}`,
          description: `قيد فاتورة مريض رقم ${result.invoiceNumber} - ${result.patientName}`,
          entryDate: result.invoiceDate,
          lines: glLines,
          departmentId: (existing as any).departmentId || null,
          ...(Object.keys(dynamicAccountOverrides).length > 0 ? { dynamicAccountOverrides } : {}),
        }).then(async (entry) => {
          if (entry) {
            await db.update(patientInvoiceHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
            logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
          } else {
            await db.update(patientInvoiceHeaders).set({ journalStatus: "needs_retry", journalError: "ربط الحسابات غير مكتمل — راجع /account-mappings", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
          }
        }).catch(async (err: any) => {
          logger.warn({ err: err.message, invoiceId }, "[GL] patient invoice finalize — journal failed");
          await db.update(patientInvoiceHeaders).set({ journalStatus: "failed", journalError: err.message, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
          logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "failed", errorMessage: err.message }).catch(() => {});
        });
      } else {
        await db.update(patientInvoiceHeaders).set({ journalStatus: "failed", journalError: "بيانات الفاتورة غير متاحة لبناء القيد", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
        logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "blocked", errorMessage: "بيانات الفاتورة غير متاحة لبناء القيد" }).catch(() => {});
      }

      storage.createTreasuryTransactionsForInvoice(invoiceId, result.finalizedAt
        ? new Date(result.finalizedAt).toISOString().split("T")[0]
        : result.invoiceDate
      ).catch(err => logger.warn({ err: err.message, invoiceId }, "[Treasury] patient invoice finalize"));

      // بث SSE: تحديث الكاشير الفوري عند تسوية فاتورة مريض
      if (existing.departmentId) {
        broadcastToUnit(existing.departmentId, "invoice_finalized", {
          id: result.id,
          invoiceNumber: result.invoiceNumber,
          netTotal: result.netAmount,
          isReturn: false,
          departmentId: existing.departmentId,
          type: "patient_invoice",
        });
      }

      // توليد مطالبات العقد (fire-and-forget — الفشل لا يوقف الاعتماد)
      // claimStatus يُعيَّن 'generating' هنا — الـ generator يُعيِّن 'generated' أو 'failed'
      const hasContract = !!(result as any).companyId || !!(result as any).contractId;
      if (hasContract) {
        await db.update(patientInvoiceHeaders)
          .set({ claimStatus: "generating", updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId))
          .catch(() => {}); // non-blocking
      }
      generateClaimsForInvoice(invoiceId)
        .catch(err => logger.warn({ err: err.message, invoiceId }, "[Claims] fire-and-forget outer catch"));

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("مسودة") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("تم تعديل الفاتورة")) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  الإغلاق النهائي للفاتورة المجمعة — Final Close
  //  القواعد: outstanding=0، ليست ملغاة، لا فواتير draft في نفس الإقامة
  // ══════════════════════════════════════════════════════════════════════════
  app.post("/api/patient-invoices/:id/final-close", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any)?.userId as string | undefined;

      const invRes = await db.execute(sql`
        SELECT id, status, is_consolidated, admission_id, net_amount, paid_amount, is_final_closed,
               patient_type, contract_id, company_id
        FROM patient_invoice_headers WHERE id = ${id}
      `);
      const inv = invRes.rows[0] as Record<string,unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (inv.is_final_closed) return res.status(409).json({ message: "الفاتورة مغلقة نهائياً بالفعل" });
      if (inv.status === "cancelled") return res.status(409).json({ message: "لا يمكن إغلاق فاتورة ملغاة" });
      if (inv.status !== "finalized") return res.status(409).json({ message: "يجب اعتماد الفاتورة أولاً قبل الإغلاق النهائي" });

      const netAmount = parseFloat(String(inv.net_amount || 0));
      const paidAmount = parseFloat(String(inv.paid_amount || 0));
      const isContractPatient = !!(inv.contract_id || inv.company_id);

      if (isContractPatient) {
        // ACCOUNTING_PENDING: contract final-close — company share treated as آجل (accounts receivable)
        //
        // Cascade: try contract_claim_lines first, then invoice line-level shares,
        // then treat entire remaining as company share for contract patients.
        //
        // Rule: contract patient can final-close if patient has paid their share.
        // The remaining balance is the company's responsibility per contract terms.

        const claimRes = await db.execute(sql`
          SELECT COALESCE(SUM(company_share_amount::numeric), 0)::text AS total_company_share
          FROM contract_claim_lines
          WHERE invoice_header_id = ${id}
        `);
        const claimCompanyShare = parseFloat(String((claimRes.rows[0] as Record<string,unknown>)?.total_company_share || "0"));

        let coveredAmount: number;

        if (claimCompanyShare > 0.01) {
          coveredAmount = paidAmount + claimCompanyShare;
        } else {
          const lineShareRes = await db.execute(sql`
            SELECT
              COALESCE(SUM(company_share_amount::numeric), 0)::text          AS line_company_share,
              COALESCE(SUM(patient_share_amount::numeric), 0)::text          AS line_patient_share,
              COALESCE(SUM(total_price::numeric), 0)::text                   AS lines_net,
              COALESCE(SUM(CASE WHEN company_share_amount IS NULL AND patient_share_amount IS NULL
                                THEN total_price::numeric ELSE 0 END), 0)::text AS unassigned_amount
            FROM patient_invoice_lines
            WHERE header_id = ${id} AND COALESCE(is_void, false) = false
          `);
          const lineCompanyShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_company_share  || "0"));
          const linePatientShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_patient_share  || "0"));
          const unassignedAmount  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.unassigned_amount   || "0"));

          if (lineCompanyShare > 0.01 || linePatientShare > 0.01) {
            coveredAmount = paidAmount + lineCompanyShare + unassignedAmount;
          } else {
            coveredAmount = netAmount;
          }
        }

        if (coveredAmount < netAmount - 0.01) {
          const companyPortion = coveredAmount - paidAmount;
          const remaining = netAmount - coveredAmount;
          return res.status(409).json({
            message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي ${remaining.toFixed(2)} ج.م غير مغطى (المدفوع من المريض: ${paidAmount.toFixed(2)} + نصيب الشركة: ${companyPortion.toFixed(2)} من أصل ${netAmount.toFixed(2)})`,
          });
        }
      } else {
        const outstanding = netAmount - paidAmount;
        if (outstanding > 0.01) {
          return res.status(409).json({ message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي: ${outstanding.toFixed(2)} ج.م` });
        }
      }

      if (inv.admission_id) {
        const draftRes = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM patient_invoice_headers
          WHERE admission_id = ${inv.admission_id as string}
            AND id != ${id}
            AND status = 'draft'
            AND is_consolidated = false
        `);
        const draftCount = parseInt(String((draftRes.rows[0] as Record<string,unknown>)?.cnt ?? "0"));
        if (draftCount > 0) {
          return res.status(409).json({ message: `يوجد ${draftCount} فاتورة/فواتير في حالة مسودة مرتبطة بهذه الإقامة — يرجى إنهاؤها أولاً` });
        }
      }

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET is_final_closed = true, final_closed_at = NOW(), final_closed_by = ${userId || null}, updated_at = NOW()
        WHERE id = ${id}
      `);

      Promise.resolve().then(() => {
        auditLog({
          tableName: "patient_invoice_headers",
          recordId: id,
          action: "final_close",
          userId,
          newValues: { isFinalClosed: true, closedAt: new Date().toISOString() },
        }).catch(() => {});
      });

      return res.json({ success: true, message: "تم الإغلاق النهائي للفاتورة بنجاح" });
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/patient-invoices/:id/distribute", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      await assertNotFinalClosed(req.params.id as string);
      const { patients } = req.body;
      if (!Array.isArray(patients) || patients.length < 2) {
        return res.status(400).json({ message: "يجب تحديد مريضين على الأقل" });
      }
      for (const p of patients) {
        if (!p.name || !p.name.trim()) {
          return res.status(400).json({ message: "يجب إدخال اسم كل مريض" });
        }
      }
      const result = await storage.distributePatientInvoice(req.params.id as string, patients);
      const userId = (req.session as any)?.userId as string | undefined;
      Promise.resolve().then(() => {
        const ids = result.map((inv: Record<string, unknown>) => inv.id as string).join(",");
        auditLog({ tableName: "patient_invoice_headers", recordId: req.params.id as string, action: "distribute", userId, newValues: { createdInvoiceIds: ids, patientCount: patients.length } }).catch(() => {});
      });
      res.json({ invoices: result });
    } catch (error: unknown) {
      if ((error as any).statusCode === 409) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("نهائية") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("غير موجودة") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("لا تحتوي")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/patient-invoices/distribute-direct", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      const { patients, lines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = req.body;
      if (!Array.isArray(patients) || patients.length < 2) {
        return res.status(400).json({ message: "يجب تحديد مريضين على الأقل" });
      }
      for (const p of patients) {
        if (!p.name || !p.name.trim()) {
          return res.status(400).json({ message: "يجب إدخال اسم كل مريض" });
        }
      }
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "لا توجد بنود للتوزيع" });
      }
      const result = await storage.distributePatientInvoiceDirect({
        patients, lines, invoiceDate: invoiceDate || new Date().toISOString().split("T")[0],
        departmentId, warehouseId, doctorName, patientType, contractName, notes,
      });
      const userId = (req.session as any)?.userId as string | undefined;
      Promise.resolve().then(() => {
        const ids = result.map((inv: Record<string, unknown>) => inv.id as string).join(",");
        auditLog({ tableName: "patient_invoice_headers", recordId: ids, action: "distribute_direct", userId, newValues: { createdInvoiceIds: ids, patientCount: patients.length } }).catch(() => {});
      });
      res.json({ invoices: result });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  PATCH /api/patient-invoices/:id/clinical-info
  //  تحديث التشخيص والملاحظات — مسموح دائماً حتى بعد الحفظ النهائي (بيانات طبية)
  // ══════════════════════════════════════════════════════════════════════════
  app.patch("/api/patient-invoices/:id/clinical-info", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const userId = (req.session as any)?.userId as string | undefined;
      const { diagnosis, notes } = req.body as { diagnosis?: string; notes?: string };

      const invRes = await db.execute(sql`
        SELECT id, status, is_final_closed, diagnosis, notes
        FROM patient_invoice_headers
        WHERE id = ${invoiceId}
        FOR UPDATE
      `);
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });

      const oldDiagnosis = inv.diagnosis;
      const oldNotes = inv.notes;

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET diagnosis   = ${diagnosis !== undefined ? diagnosis : inv.diagnosis},
            notes       = ${notes !== undefined ? notes : inv.notes},
            updated_at  = NOW()
        WHERE id = ${invoiceId}
      `);

      await auditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "clinical_info_update",
        userId,
        oldValues: JSON.stringify({ diagnosis: oldDiagnosis, notes: oldNotes }),
        newValues: JSON.stringify({ diagnosis, notes }),
      });

      const updated = await storage.getPatientInvoice(invoiceId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  POST /api/patient-invoices/:id/add-payment
  //  إضافة دفعة واحدة على فاتورة مسودة (بدون أي GL logic)
  // ══════════════════════════════════════════════════════════════════════════
  app.post("/api/patient-invoices/:id/add-payment", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const userId = (req.session as any)?.userId as string | undefined;
      const { amount, paymentMethod, treasuryId, paymentDate, notes } = req.body as {
        amount: number;
        paymentMethod: string;
        treasuryId?: string;
        paymentDate?: string;
        notes?: string;
      };

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ message: "المبلغ يجب أن يكون أكبر من صفر" });
      }
      const validMethods = ["cash", "card", "bank_transfer", "insurance"];
      if (paymentMethod && !validMethods.includes(paymentMethod)) {
        return res.status(400).json({ message: "طريقة الدفع غير صحيحة" });
      }

      const invRes = await db.execute(sql`
        SELECT id, status, is_final_closed, net_amount, paid_amount
        FROM patient_invoice_headers
        WHERE id = ${invoiceId}
        FOR UPDATE
      `);
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (inv.is_final_closed) {
        return res.status(409).json({ message: "لا يمكن إضافة دفعة على فاتورة مغلقة نهائيًا" });
      }
      if (inv.status !== "draft") {
        return res.status(409).json({ message: "إضافة الدفعات تتم على الفواتير في حالة مسودة فقط" });
      }

      const refRes = await db.execute(sql`
        SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
        FROM patient_invoice_payments WHERE reference_number LIKE 'RCP-%'
      `);
      const maxRef = parseInt(((refRes.rows[0] as Record<string, unknown>).max_num as string | null) || "0") || 0;
      const referenceNumber = `RCP-${String(maxRef + 1).padStart(6, "0")}`;

      const actualDate = paymentDate || new Date().toISOString().split("T")[0];

      await db.execute(sql`
        INSERT INTO patient_invoice_payments (id, header_id, payment_date, amount, payment_method, treasury_id, reference_number, notes, created_at)
        VALUES (gen_random_uuid(), ${invoiceId}, ${actualDate}, ${Number(amount)}, ${paymentMethod || "cash"}, ${treasuryId || null}, ${referenceNumber}, ${notes || null}, NOW())
      `);

      const sumRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS total_paid
        FROM patient_invoice_payments
        WHERE header_id = ${invoiceId}
      `);
      const totalPaid = parseFloat(((sumRes.rows[0] as Record<string, unknown>).total_paid as string) || "0");

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET paid_amount = ${totalPaid},
            version    = version + 1,
            updated_at = NOW()
        WHERE id = ${invoiceId}
      `);

      await auditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "add_payment",
        userId,
        newValues: JSON.stringify({ amount, paymentMethod, treasuryId, paymentDate: actualDate, referenceNumber }),
      });

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      const updated = await storage.getPatientInvoice(invoiceId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      await assertNotFinalClosed(req.params.id as string);
      const reason = req.body?.reason as string | undefined;
      await storage.deletePatientInvoice(req.params.id as string, reason);
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error as any).statusCode === 409) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("نهائية")) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Backfill: business_classification لبنود فاتورة المريض
  //  POST /api/admin/backfill-business-classification
  //  ?dryRun=true  → معاينة فقط بدون كتابة (Safe Preview Mode)
  //  يعالج فقط البنود ذات business_classification IS NULL (آمن — لا يمسّ مصنَّف)
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/admin/backfill-business-classification", requireAuth, async (req, res) => {
    try {
      const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;

      const rows = await db.execute(sql`
        SELECT
          pil.id,
          pil.line_type,
          pil.source_type,
          pil.service_id,
          pil.item_id,
          s.business_classification AS svc_biz_class,
          s.service_type            AS svc_type,
          i.business_classification AS item_biz_class
        FROM patient_invoice_lines pil
        LEFT JOIN services s ON s.id = pil.service_id
        LEFT JOIN items    i ON i.id = pil.item_id
        WHERE pil.business_classification IS NULL
          AND pil.is_void = false
        ORDER BY pil.created_at
      `);

      const lines = rows.rows as Array<{
        id: string;
        line_type: string;
        source_type: string | null;
        service_id: string | null;
        item_id: string | null;
        svc_biz_class: string | null;
        svc_type: string | null;
        item_biz_class: string | null;
      }>;

      let updated = 0;
      let fallbacks = 0;
      const preview: Array<{ id: string; lineType: string; resolved: string; usedFallback: boolean; fallbackReason?: string }> = [];

      for (const row of lines) {
        const { result, usedFallback, fallbackReason } = resolveBusinessClassificationWithMeta({
          lineType:                      row.line_type as "service" | "drug" | "consumable" | "equipment",
          sourceType:                    row.source_type,
          serviceId:                     row.service_id,
          serviceBusinessClassification: row.svc_biz_class,
          serviceType:                   row.svc_type,
          itemBusinessClassification:    row.item_biz_class,
          itemId:                        row.item_id,
        });

        if (usedFallback) {
          fallbacks++;
          logger.warn({ id: row.id, lineType: row.line_type, fallbackReason }, "[BACKFILL] fallback classification");
        }

        if (dryRun) {
          preview.push({ id: row.id, lineType: row.line_type, resolved: result, usedFallback, fallbackReason });
        } else {
          await db.execute(sql`
            UPDATE patient_invoice_lines
            SET business_classification = ${result}
            WHERE id = ${row.id}
              AND business_classification IS NULL
          `);
          updated++;
        }
      }

      if (dryRun) {
        logger.info({ total: lines.length, fallbacks }, "[BACKFILL] dry-run preview complete");
        return res.json({
          dryRun: true,
          total:     lines.length,
          fallbacks,
          preview,
          message: `معاينة: ${lines.length} بند سيتم تحديثه — منها ${fallbacks} بند بـ fallback`,
        });
      }

      logger.info({ updated, fallbacks }, "[BACKFILL] business_classification backfill complete");
      res.json({
        success: true,
        updated,
        fallbacks,
        message: `تم تحديث ${updated} بند — منها ${fallbacks} بند استُخدم فيه الاشتقاق التلقائي`,
      });
    } catch (err: unknown) {
      logger.error({ err }, "[BACKFILL] business_classification backfill failed");
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

}
