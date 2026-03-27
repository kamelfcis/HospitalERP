/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Delivery Payments Routes — تحصيل فواتير التوصيل المنزلي
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth }   from "./_auth";
import { checkPermission } from "./_auth";
import { PERMISSIONS }   from "@shared/permissions";
import {
  getDeliveryInvoices,
  createDeliveryReceipt,
  getDeliveryReceiptReport,
} from "../storage/delivery-payments-storage";
import {
  deliveryPaymentClients,
  broadcastDeliveryPaymentUpdate,
} from "./_sse";

const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res, next).catch(next);

export function registerDeliveryPaymentRoutes(app: Express) {
  // ── GET /api/delivery-payments/invoices ──────────────────────────────────
  app.get(
    "/api/delivery-payments/invoices",
    requireAuth,
    checkPermission(PERMISSIONS.DELIVERY_PAYMENT_VIEW),
    asyncHandler(async (req, res) => {
      const filter    = (req.query.filter as "unpaid" | "paid" | "all") ?? "unpaid";
      const pharmacyId = req.query.pharmacyId as string | undefined;
      const data = await getDeliveryInvoices(filter, pharmacyId);
      res.json(data);
    })
  );

  // ── POST /api/delivery-payments/receipts ─────────────────────────────────
  app.post(
    "/api/delivery-payments/receipts",
    requireAuth,
    checkPermission(PERMISSIONS.DELIVERY_PAYMENT_MANAGE),
    asyncHandler(async (req, res) => {
      const {
        receiptDate, totalAmount, paymentMethod,
        reference, notes, glAccountId, shiftId, lines,
      } = req.body;

      if (!receiptDate || !totalAmount || !paymentMethod || !lines?.length) {
        return res.status(400).json({ message: "بيانات غير مكتملة" });
      }

      const userId = req.session.userId ?? null;

      const result = await createDeliveryReceipt({
        receiptDate,
        totalAmount: Number(totalAmount),
        paymentMethod,
        reference:   reference ?? null,
        notes:       notes ?? null,
        createdBy:   userId,
        glAccountId: glAccountId ?? null,
        shiftId:     shiftId ?? null,
        userId,
        lines:       lines.map((l: any) => ({
          invoiceId:  l.invoiceId,
          amountPaid: Number(l.amountPaid),
        })),
      });

      broadcastDeliveryPaymentUpdate();
      res.json(result);
    })
  );

  // ── GET /api/delivery-payments/sse — تحديثات لحظية ──────────────────────
  app.get("/api/delivery-payments/sse", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    deliveryPaymentClients.add(res);
    req.on("close", () => deliveryPaymentClients.delete(res));
  });

  // ── GET /api/delivery-payments/report ────────────────────────────────────
  app.get(
    "/api/delivery-payments/report",
    requireAuth,
    checkPermission(PERMISSIONS.DELIVERY_PAYMENT_VIEW),
    asyncHandler(async (req, res) => {
      const { from, to, pharmacyId } = req.query as Record<string, string>;
      const rows = await getDeliveryReceiptReport({ from, to, pharmacyId });
      res.json(rows);
    })
  );
}
