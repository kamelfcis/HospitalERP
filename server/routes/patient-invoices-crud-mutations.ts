import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission } from "./_shared";
import {
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  patientInvoiceHeaders,
} from "@shared/schema";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { assertInvoiceScopeGuard, assertServiceDeptMatch, ScopeViolationError } from "../lib/scope-guard";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import {
  enforceNonZeroPrice,
  auditItemPriceDeviations,
  fireApprovalRequestsForInvoice,
} from "../lib/patient-invoice-helpers";
import { assertNotFinalClosed, processInvoiceLines } from "./patient-invoices-crud-queries";

export function registerCrudMutations(app: Express) {
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
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return res.status(409).json({ message: "رقم الفاتورة مكرر" });
      }
      res.status(500).json({ message: msg });
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
        const [existingHdr] = await db.select({ billingMode: patientInvoiceHeaders.billingMode })
          .from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, req.params.id as string)).limit(1);
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
        return res.status(409).json({ message: error instanceof Error ? error.message : String(error) });
      }
      if (error instanceof z.ZodError || (error instanceof Error && error.name === "ZodError")) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("نهائية") || msg.includes("تم تعديل الفاتورة")) {
        return res.status(409).json({ message: msg });
      }
      res.status(500).json({ message: msg });
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
        if (inv.is_final_closed) return res.status(409).json({ message: "لا يمكن تعديل فاتورة تم إغلاقها نهائيًا" });
        if (inv.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل فاتورة نهائية" });

        const totalAmount = parseFloat((inv.total_amount as string) || "0");
        const lineDiscount = parseFloat((inv.discount_amount as string) || "0");
        const subTotal = totalAmount - lineDiscount;

        let headerDiscountPercent: number;
        let headerDiscountAmount: number;

        if (discountType === "percent") {
          if (rawValue > 100) return res.status(400).json({ message: "نسبة الخصم لا يمكن أن تتجاوز 100%" });
          headerDiscountPercent = rawValue;
          headerDiscountAmount = +(subTotal * rawValue / 100).toFixed(2);
        } else {
          if (rawValue > subTotal) return res.status(400).json({ message: "مبلغ الخصم أكبر من صافي الفاتورة" });
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
            discountType, discountValue,
            headerDiscountPercent, headerDiscountAmount, newNetAmount,
            appliedBy: (req.session as any)?.userId as string | undefined,
          }),
        });

        const updated = await storage.getPatientInvoice(invoiceId);
        res.json(updated);
      } catch (err: unknown) {
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
      }
    }
  );
}
