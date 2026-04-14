// ACCOUNTING_PENDING: supplier payments create GL journal entries via generateJournalEntry()
//   but depends on Account Mappings for 'supplier_payment' source_type being configured.
//   If mappings are missing, no GL entry is generated.

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Supplier Payments Routes — مسارات سداد الموردين
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth, checkPermission, broadcastToUnit } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { z }             from "zod";
import { pool }          from "../db";
import {
  getSupplierBalance,
  getSupplierInvoices,
  createSupplierPayment,
  getSupplierPaymentReport,
  getNextPaymentNumber,
  getSupplierAccountStatement,
} from "../storage/supplier-payments-storage";
import { storage } from "../storage";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { assertMappingsComplete } from "../lib/mapping-completeness";


const createPaymentSchema = z.object({
  supplierId:    z.string().uuid(),
  paymentDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount:   z.number().positive(),
  reference:     z.string().max(100).optional().nullable(),
  notes:         z.string().optional().nullable(),
  paymentMethod: z.enum(["bank", "cash", "check", "transfer"]).default("bank"),
  glAccountId:   z.string().optional().nullable(),
  shiftId:       z.string().optional().nullable(),
  lines: z.array(z.object({
    invoiceId:  z.string().uuid(),
    amountPaid: z.number().positive(),
  })).min(1, "يجب تحديد فاتورة واحدة على الأقل"),
});

function parseStatus(
  raw: unknown,
  defaultVal: "unpaid" | "paid" | "all"
): "unpaid" | "paid" | "all" {
  const s = String(raw ?? defaultVal);
  if (s === "paid" || s === "all" || s === "unpaid") return s;
  return defaultVal;
}

export function registerSupplierPaymentRoutes(app: Express) {
  // GET /api/supplier-payments/next-number
  app.get("/api/supplier-payments/next-number", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (_req, res) => {
    try {
      const nextNum = await getNextPaymentNumber();
      res.json({ nextNumber: nextNum });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/supplier-payments/balance/:supplierId
  app.get("/api/supplier-payments/balance/:supplierId", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const result = await getSupplierBalance(supplierId);
      if (!result) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/supplier-payments/invoices/:supplierId?status=unpaid|paid|all&claimNumber=...
  app.get("/api/supplier-payments/invoices/:supplierId", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (req, res) => {
    try {
      const supplierId  = String(req.params.supplierId);
      const status      = parseStatus(req.query.status, "unpaid");
      const rawClaim    = req.query.claimNumber ? String(req.query.claimNumber) : null;
      const claimNumber = rawClaim?.trim().replace(/\s*\/\s*/g, "/") || null;
      const rows = await getSupplierInvoices(supplierId, status, claimNumber);
      res.json(rows);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // POST /api/supplier-payments
  app.post("/api/supplier-payments", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (req, res) => {
    try {
      const body = createPaymentSchema.parse(req.body);

      // ── فحص ربط الحسابات قبل تسجيل السداد ───────────────────────────────
      await assertMappingsComplete("supplier_payment");

      const userId = req.session.userId ?? null;
      const result = await createSupplierPayment({
        ...body,
        createdBy:   userId,
        glAccountId: body.glAccountId ?? null,
        shiftId:     body.shiftId ?? null,
      });

      // ── قيد المحاسبة القديم (fire-and-forget) — يُشغَّل فقط بدون خزنة ──
      // عند توفّر الخزنة، يُنشأ القيد داخل createSupplierPayment مباشرةً
      if (!body.glAccountId) {
        storage.generateJournalEntry({
          sourceType:       "supplier_payment",
          sourceDocumentId: result.paymentId,
          reference:        body.reference ?? `SPM-${String(result.paymentNumber).padStart(4, "0")}`,
          description:      `سداد موردين رقم #${String(result.paymentNumber).padStart(4, "0")}`,
          entryDate:        body.paymentDate,
          lines: [
            { lineType: "ap_settlement", amount: String(body.totalAmount) },
          ],
        }).catch((err: any) => {
          const msg: string = err?.message ?? String(err);
          console.warn(`[SUPPLIER_PAYMENT] journal generation failed for ${result.paymentId}:`, msg);
          logAcctEvent({
            sourceType: "supplier_payment",
            sourceId:   result.paymentId,
            eventType:  "supplier_payment_legacy_journal",
            status:     "needs_retry",
            errorMessage: msg,
          }).catch(() => {});
        });
      }

      // ── SSE: إعلام الكاشير بمنصرف موردين (fire-and-forget) ─────────────
      if (body.shiftId) {
        pool.query<{ pharmacy_id: string | null; department_id: string | null; unit_type: string }>(
          `SELECT pharmacy_id, department_id, unit_type FROM cashier_shifts WHERE id = $1 LIMIT 1`,
          [body.shiftId]
        ).then(({ rows }) => {
          const sh = rows[0];
          if (!sh) return;
          const unitKey = sh.unit_type === "pharmacy" ? sh.pharmacy_id : sh.department_id;
          if (unitKey) broadcastToUnit(unitKey, "supplier_paid", { shiftId: body.shiftId, paymentId: result.paymentId });
        }).catch(() => {});
      }

      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(422).json({ message: err.errors[0]?.message ?? "بيانات غير صالحة" });
      }
      const status = typeof err?.status === "number" ? err.status : 400;
      const payload: Record<string, unknown> = { message: err.message };
      if (err?.code)            payload.code            = err.code;
      if (err?.missingMappings) payload.missingMappings = err.missingMappings;
      res.status(status).json(payload);
    }
  });

  // GET /api/supplier-payments/report/:supplierId?status=unpaid|paid|all
  app.get("/api/supplier-payments/report/:supplierId", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const status = parseStatus(req.query.status, "all");
      const result = await getSupplierPaymentReport(supplierId, status);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/supplier-payments/statement/:supplierId?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/supplier-payments/statement/:supplierId", requireAuth, checkPermission(PERMISSIONS.SUPPLIER_PAYMENTS_VIEW), async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const now        = new Date();
      const firstOfYear = `${now.getFullYear()}-01-01`;
      const todayStr    = now.toISOString().split("T")[0];
      const fromDate   = String(req.query.from ?? firstOfYear);
      const toDate     = String(req.query.to   ?? todayStr);
      const result = await getSupplierAccountStatement(supplierId, fromDate, toDate);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
