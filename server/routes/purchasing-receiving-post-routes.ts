import type { Express, Request, Response } from "express";
import { storage }                          from "../storage";
import { PERMISSIONS }                      from "@shared/permissions";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
} from "./_shared";
import {
  ServiceError,
  validateInvoiceLineDiscounts,
  executeEditPostedReceiving,
  executePostReceiving,
  executeApprovePurchaseInvoice,
} from "../services/purchasing-receiving-post-service";

// ─── Error helper ─────────────────────────────────────────────────────────────

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof ServiceError) {
    res.status(err.status).json({
      message: err.message,
      ...(err.code   ? { code:       err.code }   : {}),
      ...(err.extras ? { ...err.extras }           : {}),
    });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  res.status(500).json({ message: msg });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerReceivingPostRoutes(app: Express) {

  // ── إذن الاستلام: تعديل المُرحَّل ─────────────────────────────────────────
  app.patch("/api/receivings/:id/edit-posted", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines) || lines.length === 0)
      return res.status(400).json({ message: "السطور مطلوبة" });
    try {
      res.json(await executeEditPostedReceiving(req.params.id, lines));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── إذن الاستلام: ترحيل ────────────────────────────────────────────────────
  app.post("/api/receivings/:id/post", requireAuth, checkPermission(PERMISSIONS.RECEIVING_POST), async (req, res) => {
    try {
      res.json(await executePostReceiving(req.params.id));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── إذن الاستلام: تصحيح (إنشاء مستند تصحيح) ──────────────────────────────
  app.post("/api/receivings/:id/correct", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      res.status(201).json(await storage.createReceivingCorrection(req.params.id));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── إذن الاستلام: تحويل إلى فاتورة ───────────────────────────────────────
  app.post("/api/receivings/:id/convert-to-invoice", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_CREATE), async (req, res) => {
    try {
      res.status(201).json(await storage.convertReceivingToInvoice(req.params.id));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: قائمة ──────────────────────────────────────────────────
  app.get("/api/purchase-invoices", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_VIEW), async (req, res) => {
    try {
      const { supplierId, status, dateFrom, dateTo, invoiceNumber, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getPurchaseInvoices({
        supplierId:      supplierId      as string,
        status:          status          as string,
        dateFrom:        dateFrom        as string,
        dateTo:          dateTo          as string,
        invoiceNumber:   invoiceNumber   as string,
        page:            page      ? parseInt(page      as string) : 1,
        pageSize:        pageSize  ? parseInt(pageSize  as string) : 20,
        includeCancelled: includeCancelled === "true",
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "purchase_invoice", "invoiceNumber") });
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: بالمعرّف ───────────────────────────────────────────────
  app.get("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_VIEW), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(addFormattedNumber(invoice, "purchase_invoice", "invoiceNumber"));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: حفظ تلقائي ────────────────────────────────────────────
  app.post("/api/purchase-invoices/:id/auto-save", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة" });
      const { lines, ...headerUpdates } = req.body;
      res.json(await storage.savePurchaseInvoice(req.params.id, Array.isArray(lines) ? lines : [], headerUpdates));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: تعديل (مع تحقق الخصم) ────────────────────────────────
  app.patch("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft")
        return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة ومُسعّرة", code: "INVOICE_APPROVED" });

      const { lines, ...headerUpdates } = req.body;
      const claimTrimmed = (headerUpdates.claimNumber ?? "").trim().replace(/\s*\/\s*/g, "/");
      if (!claimTrimmed)
        return res.status(400).json({ message: "رقم المطالبة مطلوب", code: "CLAIM_NUMBER_REQUIRED" });

      const discountErrors = validateInvoiceLineDiscounts(lines);
      if (discountErrors.length > 0)
        return res.status(400).json({ message: "أخطاء في بيانات الخصم", lineErrors: discountErrors });

      res.json(await storage.savePurchaseInvoice(req.params.id, lines, { ...headerUpdates, claimNumber: claimTrimmed }));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: حذف ───────────────────────────────────────────────────
  app.delete("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const deleted = await storage.deletePurchaseInvoice(req.params.id, req.body?.reason as string | undefined);
      if (!deleted) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json({ success: true });
    } catch (err) { handleServiceError(err, res); }
  });

  // ── فواتير الشراء: اعتماد ────────────────────────────────────────────────
  app.post("/api/purchase-invoices/:id/approve", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_APPROVE), async (req, res) => {
    try {
      res.json(await executeApprovePurchaseInvoice(req.params.id));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── أصناف: تلميحات الشراء ────────────────────────────────────────────────
  app.get("/api/items/:itemId/hints", requireAuth, async (req, res) => {
    try {
      const { supplierId, warehouseId } = req.query;
      res.json(await storage.getItemHints(req.params.itemId, (supplierId as string) || "", (warehouseId as string) || ""));
    } catch (err) { handleServiceError(err, res); }
  });

  // ── أصناف: إحصاءات المخزن ────────────────────────────────────────────────
  app.get("/api/items/:itemId/warehouse-stats", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getItemWarehouseStats(req.params.itemId));
    } catch (err) { handleServiceError(err, res); }
  });
}
