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
import {
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  patientInvoiceHeaders,
} from "@shared/schema";
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

export function registerPatientInvoicesRoutes(app: Express) {
  // ============= Patient Invoices =============

  app.get("/api/patient-invoices/next-number", async (_req, res) => {
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

  app.get("/api/patient-invoices", async (req, res) => {
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

  app.get("/api/patient-invoices/:id", async (req, res) => {
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

      const headerParsed = insertPatientInvoiceHeaderSchema.parse(header);
      const linesParsed = (lines || []).map((l: Record<string, unknown>) => insertPatientInvoiceLineSchema.omit({ headerId: true }).parse(l));
      const paymentsParsed = (payments || []).map((p: Record<string, unknown>) => insertPatientInvoicePaymentSchema.omit({ headerId: true }).parse(p));

      if (!(await enforceNonZeroPrice(req, res, linesParsed))) return;

      const result = await storage.createPatientInvoice(headerParsed, linesParsed, paymentsParsed);
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
      const linesParsed = (lines || []).map((l: Record<string, unknown>) => insertPatientInvoiceLineSchema.omit({ headerId: true }).parse(l));
      const paymentsParsed = (payments || []).map((p: Record<string, unknown>) => insertPatientInvoicePaymentSchema.omit({ headerId: true }).parse(p));

      if (!(await enforceNonZeroPrice(req, res, linesParsed))) return;

      const result = await storage.updatePatientInvoice(req.params.id as string, headerParsed, linesParsed, paymentsParsed, expectedVersion != null ? Number(expectedVersion) : undefined);
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
      if (existing.status !== "draft") return res.status(409).json({ message: "الفاتورة ليست مسودة", code: "ALREADY_FINALIZED" });

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

}
