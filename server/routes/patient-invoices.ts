import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { sql } from "drizzle-orm";
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
import { createApprovalRequest } from "../lib/contract-approval-service";
import {
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  patientInvoiceHeaders,
  patientInvoiceLines,
} from "@shared/schema";
import { resolveBusinessClassificationWithMeta } from "@shared/resolve-business-classification";
import { applyContractCoverage } from "../lib/patient-invoice-coverage";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import { eq } from "drizzle-orm";

async function enforceNonZeroPrice(req: any, res: any, linesParsed: any[]): Promise<boolean> {
  const hasZeroPrice = linesParsed.some(l => parseFloat(String(l.unitPrice ?? 0)) <= 0);
  if (!hasZeroPrice) return true;

  const allowZeroPrice = req.body.allowZeroPrice === true;
  if (!allowZeroPrice) {
    res.status(422).json({ code: "ZERO_PRICE_LINES", message: "بعض بنود الفاتورة بها سعر صفري — تأكيد الحفظ؟" });
    return false;
  }

  const perms = await storage.getUserEffectivePermissions(req.session.userId);
  if (!perms.includes(PERMISSIONS.INVOICE_APPROVE_ZERO_PRICE)) {
    res.status(403).json({ message: "ليس لديك صلاحية اعتماد بنود بسعر صفري" });
    return false;
  }

  auditLog({
    tableName: "patient_invoice_headers",
    recordId: req.params?.id ?? "new",
    action: "zero_price_approved",
    newValues: JSON.stringify({
      reason: req.body.zeroPriceReason ?? "unspecified",
      zeroLines: linesParsed.filter(l => parseFloat(String(l.unitPrice ?? 0)) <= 0).map(l => l.description),
    }),
    userId: req.session.userId,
  }).catch(() => {});

  return true;
}

/**
 * Server-side classification guard — المصدر الوحيد للحقيقة.
 *
 * القاعدة: لا نثق أبداً في قيمة الـ client.
 * نحسب دائماً من master data بغض النظر عما أرسله الـ client.
 *
 * - إذا كانت قيمة الـ client تختلف عن المحسوبة → نسجل تحذير ونتجاهل الـ client
 * - إذا استُخدم fallback (master data فارغ) → نسجل تحذير
 */
async function autoFillClassification(lines: any[]): Promise<any[]> {
  if (lines.length === 0) return lines;

  // نجلب كل الـ IDs (مش بس الـ null) — لأن الـ server يُعيد الحساب دائماً
  const serviceIds = [...new Set(lines.map((l: any) => l.serviceId).filter(Boolean))] as string[];
  const itemIds    = [...new Set(lines.map((l: any) => l.itemId).filter(Boolean))] as string[];

  const [svcRows, itmRows] = await Promise.all([
    serviceIds.length > 0
      ? db.execute(sql`SELECT id, business_classification, service_type FROM services WHERE id IN (${sql.join(serviceIds.map(id => sql`${id}`), sql`, `)})`)
      : { rows: [] },
    itemIds.length > 0
      ? db.execute(sql`SELECT id, business_classification FROM items WHERE id IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`)
      : { rows: [] },
  ]);

  const svcMap = new Map((svcRows.rows as any[]).map(r => [r.id, r]));
  const itmMap = new Map((itmRows.rows as any[]).map(r => [r.id, r]));

  return lines.map(l => {
    const svc = svcMap.get(l.serviceId);
    const itm = itmMap.get(l.itemId);
    const { result, usedFallback, fallbackReason } = resolveBusinessClassificationWithMeta({
      lineType:                       l.lineType as "service" | "drug" | "consumable" | "equipment",
      sourceType:                     l.sourceType ?? null,
      serviceId:                      l.serviceId ?? null,
      serviceBusinessClassification:  svc?.business_classification ?? null,
      serviceType:                    svc?.service_type ?? null,
      itemId:                         l.itemId ?? null,
      itemBusinessClassification:     itm?.business_classification ?? null,
    });

    // Guard: الـ client أرسل قيمة مختلفة عن ما حسبه الـ server من master data
    if (l.businessClassification && l.businessClassification !== result) {
      logger.warn(
        {
          clientValue:  l.businessClassification,
          serverValue:  result,
          lineType:     l.lineType,
          serviceId:    l.serviceId,
          itemId:       l.itemId,
        },
        "[CLASSIFICATION] client value rejected — server recomputed from master",
      );
    }

    if (usedFallback) {
      logger.warn(
        { lineType: l.lineType, serviceId: l.serviceId, itemId: l.itemId, fallbackReason },
        "[CLASSIFICATION] server-side fallback used",
      );
    }

    return { ...l, businessClassification: result };
  });
}

/** Fires approval requests for all approval_required lines — non-blocking */
async function fireApprovalRequestsForInvoice(invoiceId: string, contractId: string) {
  try {
    const lines = await db.select().from(patientInvoiceLines)
      .where(
        eq(patientInvoiceLines.headerId, invoiceId)
      );
    const approvalLines = lines.filter((l: any) =>
      (l.coverageStatus === "approval_required") &&
      !(l.approvalStatus === "pending" || l.approvalStatus === "approved")
    );
    for (const l of approvalLines) {
      const al = l as any;
      await createApprovalRequest({
        patientInvoiceLineId: al.id,
        contractId,
        contractMemberId:   al.contractMemberId ?? null,
        serviceId:          al.serviceId ?? null,
        requestedAmount:    String(al.companyShareAmount ?? al.unitPrice ?? "0"),
        serviceDescription: al.description ?? "خدمة طبية",
      }).catch(() => {});
    }
  } catch (err: any) {
    logger.warn({ err: err.message, invoiceId }, "[Approvals] fireApprovalRequests failed (non-fatal)");
  }
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

      // إنشاء ملف مريض تلقائياً إذا لم يكن مرتبطاً
      if (!headerParsed.patientId && headerParsed.patientName?.trim()) {
        const ptRecord = await findOrCreatePatient(headerParsed.patientName, headerParsed.patientPhone || null);
        headerParsed = { ...headerParsed, patientId: ptRecord.id };
      }

      linesParsed = await autoFillClassification(linesParsed);

      linesParsed = await applyContractCoverage(
        (headerParsed as any).contractId ?? null,
        linesParsed,
        (headerParsed as any).invoiceDate ?? undefined,
      );

      if (!(await enforceNonZeroPrice(req, res, linesParsed))) return;

      const result = await storage.createPatientInvoice(headerParsed, linesParsed, paymentsParsed);

      // Phase 4: fire approval requests for approval_required lines (non-blocking)
      const rh = result as any;
      if (rh.contractId) {
        setImmediate(() => fireApprovalRequestsForInvoice(rh.id, rh.contractId));
      }

      res.status(201).json(result);
    } catch (error: unknown) {
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
      const { header, lines, payments, expectedVersion } = req.body;

      const headerParsed = insertPatientInvoiceHeaderSchema.partial().parse(header);
      let linesParsed = (lines || []).map((l: Record<string, unknown>) => insertPatientInvoiceLineSchema.omit({ headerId: true }).parse(l));
      const paymentsParsed = (payments || []).map((p: Record<string, unknown>) => insertPatientInvoicePaymentSchema.omit({ headerId: true }).parse(p));

      linesParsed = await autoFillClassification(linesParsed);

      linesParsed = await applyContractCoverage(
        (headerParsed as any).contractId ?? null,
        linesParsed,
        (headerParsed as any).invoiceDate ?? undefined,
      );

      if (!(await enforceNonZeroPrice(req, res, linesParsed))) return;

      const result = await storage.updatePatientInvoice(req.params.id as string, headerParsed, linesParsed, paymentsParsed, expectedVersion != null ? Number(expectedVersion) : undefined);

      // Phase 4: fire approval requests for approval_required lines (non-blocking)
      const rh2 = result as any;
      const cid2 = rh2.contractId ?? (headerParsed as any).contractId;
      if (cid2) {
        setImmediate(() => fireApprovalRequestsForInvoice(req.params.id as string, cid2));
      }

      res.json(result);
    } catch (error: unknown) {
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
          SELECT id, status, total_amount, discount_amount, header_discount_percent, header_discount_amount, version
          FROM patient_invoice_headers
          WHERE id = ${invoiceId}
          FOR UPDATE
        `);
        const inv = invRes.rows[0] as Record<string, unknown>;
        if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
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
      const { expectedVersion } = req.body || {};
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

      const paidAmount = parseFloat(String(existing.paidAmount || "0"));
      const netAmount = parseFloat(String(existing.netAmount || "0"));
      if (netAmount > 0 && paidAmount < netAmount) {
        return res.status(400).json({
          message: `لا يمكن اعتماد الفاتورة قبل السداد الكامل. المدفوع: ${paidAmount.toLocaleString("ar-EG")} ج.م من أصل ${netAmount.toLocaleString("ar-EG")} ج.م`,
          code: "UNPAID",
        });
      }

      await storage.assertPeriodOpen(existing.invoiceDate);

      const result = await storage.finalizePatientInvoice(
        invoiceId,
        expectedVersion != null ? Number(expectedVersion) : undefined
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

        // Set source doc + event log to "pending" BEFORE fire-and-forget
        await db.update(patientInvoiceHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
        await logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "pending" });

        storage.generateJournalEntry({
          sourceType: "patient_invoice",
          sourceDocumentId: invoiceId,
          reference: `PI-${result.invoiceNumber}`,
          description: `قيد فاتورة مريض رقم ${result.invoiceNumber} - ${result.patientName}`,
          entryDate: result.invoiceDate,
          lines: glLines,
        }).then(async (entry) => {
          if (entry) {
            await db.update(patientInvoiceHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
            logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
          } else {
            // generateJournalEntry returned null → mappings missing/skipped (already logged inside generateJournalEntry)
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

      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("مسودة") || (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("تم تعديل الفاتورة")) return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/patient-invoices/:id/distribute", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
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

  app.delete("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      await storage.deletePatientInvoice(req.params.id as string, reason);
      res.json({ success: true });
    } catch (error: unknown) {
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
