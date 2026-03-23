/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Supplier Payments Routes — مسارات سداد الموردين
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth }   from "./_shared";
import { z }             from "zod";
import {
  getSupplierBalance,
  getSupplierInvoices,
  createSupplierPayment,
  getSupplierPaymentReport,
} from "../storage/supplier-payments-storage";


const createPaymentSchema = z.object({
  supplierId:    z.string().uuid(),
  paymentDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount:   z.number().positive(),
  reference:     z.string().max(100).optional().nullable(),
  notes:         z.string().optional().nullable(),
  paymentMethod: z.enum(["bank", "cash", "check", "transfer"]).default("bank"),
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
  // GET /api/supplier-payments/balance/:supplierId
  app.get("/api/supplier-payments/balance/:supplierId", requireAuth, async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const result = await getSupplierBalance(supplierId);
      if (!result) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/supplier-payments/invoices/:supplierId?status=unpaid|paid|all
  app.get("/api/supplier-payments/invoices/:supplierId", requireAuth, async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const status = parseStatus(req.query.status, "unpaid");
      const rows = await getSupplierInvoices(supplierId, status);
      res.json(rows);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // POST /api/supplier-payments
  app.post("/api/supplier-payments", requireAuth, async (req, res) => {
    try {
      const body = createPaymentSchema.parse(req.body);
      const user = (req as any).user;
      const result = await createSupplierPayment({
        ...body,
        createdBy: user?.id ? String(user.id) : null,
      });
      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(422).json({ message: err.errors[0]?.message ?? "بيانات غير صالحة" });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // GET /api/supplier-payments/report/:supplierId?status=unpaid|paid|all
  app.get("/api/supplier-payments/report/:supplierId", requireAuth, async (req, res) => {
    try {
      const supplierId = String(req.params.supplierId);
      const status = parseStatus(req.query.status, "all");
      const result = await getSupplierPaymentReport(supplierId, status);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
