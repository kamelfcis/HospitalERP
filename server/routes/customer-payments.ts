/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Customer Payments Routes — مسارات تحصيل الآجل
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth, checkPermission } from "./_shared";
import { z }             from "zod";
import { pool }          from "../db";
import {
  getCustomerBalance,
  getCustomerCreditInvoices,
  getNextReceiptNumber,
  createCustomerReceipt,
  getCustomerReceiptReport,
  getCustomerAccountStatement,
  searchCreditCustomers,
  createCreditCustomer,
} from "../storage/customer-payments-storage";

const createReceiptSchema = z.object({
  customerId:    z.string().uuid(),
  receiptDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount:   z.number().positive(),
  paymentMethod: z.enum(["cash", "bank", "card", "check", "transfer"]).default("cash"),
  reference:     z.string().max(100).optional().nullable(),
  notes:         z.string().optional().nullable(),
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

export function registerCustomerPaymentRoutes(app: Express) {

  // ── GET /api/customer-payments/active-treasuries ─────────────────────────
  // يُعيد جميع الخزن النشطة (للأدمن) أو خزنة المستخدم (للموظف)
  app.get("/api/customer-payments/active-treasuries", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const result = await pool.query<{
        id: string; name: string; gl_account_id: string;
      }>(`
        SELECT id, name, gl_account_id
        FROM treasuries
        WHERE is_active = true
        ORDER BY name ASC
      `);
      res.json({ treasuries: result.rows });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/open-shifts (محفوظ للتوافق) ───────────────
  // يُعيد الوردات المفتوحة — مُستبدَل بـ active-treasuries لكنه محفوظ
  app.get("/api/customer-payments/open-shifts", requireAuth, checkPermission("credit_payment.view"), async (_req, res) => {
    try {
      const result = await pool.query<{
        id: string; opened_at: string;
        cashier_name: string; pharmacy_name: string; gl_account_id: string | null;
      }>(`
        SELECT cs.id, cs.opened_at,
               cs.cashier_name,
               COALESCE(p.name_ar, '') AS pharmacy_name,
               cs.gl_account_id
        FROM cashier_shifts cs
        LEFT JOIN pharmacies p ON p.id = cs.pharmacy_id
        WHERE cs.status = 'open'
        ORDER BY cs.opened_at DESC
        LIMIT 50
      `);
      res.json({ shifts: result.rows });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/credit-customers ─────────────────────────────────────────────
  app.get("/api/credit-customers", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const search     = String(req.query.search ?? "");
      const pharmacyId = req.query.pharmacyId ? String(req.query.pharmacyId) : null;
      const customers  = await searchCreditCustomers(search, pharmacyId);
      res.json({ customers });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/credit-customers (quick-add) ────────────────────────────────
  app.post("/api/credit-customers", requireAuth, checkPermission("credit_payment.manage"), async (req, res) => {
    try {
      const { name, phone, notes, pharmacyId } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "الاسم مطلوب" });
      const customer = await createCreditCustomer(
        name.trim(), phone || null, notes || null, pharmacyId || null
      );
      res.status(201).json(customer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/next-number ────────────────────────────────
  app.get("/api/customer-payments/next-number", requireAuth, checkPermission("credit_payment.view"), async (_req, res) => {
    try {
      const nextNumber = await getNextReceiptNumber();
      res.json({ nextNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/balance/:customerId ────────────────────────
  app.get("/api/customer-payments/balance/:customerId", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const balance = await getCustomerBalance(req.params.customerId);
      if (!balance) return res.status(404).json({ message: "العميل غير موجود" });
      res.json(balance);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/invoices/:customerId ───────────────────────
  app.get("/api/customer-payments/invoices/:customerId", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const status   = parseStatus(req.query.status, "unpaid");
      const invoices = await getCustomerCreditInvoices(req.params.customerId, status);
      res.json({ invoices });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/customer-payments ───────────────────────────────────────────
  app.post("/api/customer-payments", requireAuth, checkPermission("credit_payment.manage"), async (req, res) => {
    try {
      const parsed = createReceiptSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req as any).user?.id ?? null;
      const result = await createCustomerReceipt({
        ...parsed.data,
        createdBy: userId,
        userId,
        lines: parsed.data.lines.map((l) => ({ invoiceId: l.invoiceId, amountPaid: l.amountPaid })),
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/report/:customerId ─────────────────────────
  app.get("/api/customer-payments/report/:customerId", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const status = parseStatus(req.query.status, "all");
      const report = await getCustomerReceiptReport(req.params.customerId, status);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/customer-payments/statement/:customerId?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get("/api/customer-payments/statement/:customerId", requireAuth, checkPermission("credit_payment.view"), async (req, res) => {
    try {
      const customerId  = String(req.params.customerId);
      const now         = new Date();
      const firstOfYear = `${now.getFullYear()}-01-01`;
      const todayStr    = now.toISOString().split("T")[0];
      const fromDate    = String(req.query.from ?? firstOfYear);
      const toDate      = String(req.query.to   ?? todayStr);
      const result = await getCustomerAccountStatement(customerId, fromDate, toDate);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
