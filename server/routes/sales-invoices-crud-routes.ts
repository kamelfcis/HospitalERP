import type { Express } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
} from "./_shared";
import { salesInvoiceHeaders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { assertUserWarehouseAllowed } from "../lib/warehouse-guard";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import { runPharmacyDemoSeed } from "../seeds/pharmacy-demo";

export function registerSalesInvoicesCrudRoutes(app: Express) {
  app.get("/api/sales-invoices/pharmacists", requireAuth, async (req, res) => {
    try {
      const result = await pool.query<{ id: string; full_name: string; role: string }>(`
        SELECT id, full_name, role
        FROM users
        WHERE role IN ('pharmacist', 'cashier', 'warehouse_assistant', 'pharmacy_assistant', 'admin', 'owner')
          AND is_active = true
        ORDER BY full_name
      `);
      res.json(result.rows.map(u => ({ id: u.id, fullName: u.full_name, role: u.role })));
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/sales-invoices", requireAuth, async (req, res) => {
    try {
      const { status, dateFrom, dateTo, customerType, claimStatus, search, pharmacistId, warehouseId, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getSalesInvoices({
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        customerType: customerType as string,
        claimStatus: claimStatus as string,
        search: search as string,
        pharmacistId: pharmacistId as string,
        warehouseId: warehouseId as string,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
        includeCancelled: includeCancelled === 'true',
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "sales_invoice", "invoiceNumber") });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/sales-invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getSalesInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(addFormattedNumber(invoice, "sales_invoice", "invoiceNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/sales-invoices/auto-save", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const { header, lines, existingId } = req.body;
      if (!header?.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      const forbiddenMsg = await assertUserWarehouseAllowed(req.session.userId!, header.warehouseId, storage);
      if (forbiddenMsg) return res.status(403).json({ message: forbiddenMsg });
      const safeLines = Array.isArray(lines) ? lines.filter((l: Record<string, unknown>) => l.itemId || l.serviceId) : [];
      const enrichedHeader = { ...header, createdBy: req.session?.userId || header.createdBy || null };

      if (existingId) {
        const existing = await storage.getSalesInvoice(existingId);
        if (!existing) return res.status(404).json({ message: "الفاتورة غير موجودة" });
        if (existing.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة" });
        const invoice = await storage.updateSalesInvoice(existingId, enrichedHeader, safeLines);
        return res.json(invoice);
      } else {
        if (safeLines.length === 0) {
          const invoice = await storage.createSalesInvoice(enrichedHeader, []);
          return res.status(201).json(invoice);
        }
        const invoice = await storage.createSalesInvoice(enrichedHeader, safeLines);
        return res.status(201).json(invoice);
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.httpStatus || 500;
      res.status(status).json({ message: _em });
    }
  });

  app.post("/api/sales-invoices", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header?.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      if (!header?.invoiceDate) return res.status(400).json({ message: "تاريخ الفاتورة مطلوب" });
      const forbiddenMsg = await assertUserWarehouseAllowed(req.session.userId!, header.warehouseId, storage);
      if (forbiddenMsg) return res.status(403).json({ message: forbiddenMsg });
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId && !line.serviceId) return res.status(400).json({ message: "الصنف أو الخدمة مطلوب في كل سطر" });
        if (line.lineType !== "service" && (!line.qty || parseFloat(line.qty) <= 0)) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const enriched = { ...header, createdBy: req.session?.userId || header.createdBy || null, clinicOrderId: header.clinicOrderId || null };

      if (!enriched.patientId && enriched.customerName && enriched.customerType && enriched.customerType !== "cash") {
        try {
          const found = await findOrCreatePatient(enriched.customerName);
          enriched.patientId = found.id;
        } catch { /* non-fatal */ }
      }

      const invoice = await storage.createSalesInvoice(enriched, lines);
      res.status(201).json(invoice);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.httpStatus || 500;
      res.status(status).json({ message: _em });
    }
  });

  app.patch("/api/sales-invoices/:id", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId && !line.serviceId) return res.status(400).json({ message: "الصنف أو الخدمة مطلوب في كل سطر" });
        if (line.lineType !== "service" && (!line.qty || parseFloat(line.qty) <= 0)) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const enrichedHeader = { ...(header || {}), createdBy: req.session?.userId || (header || {}).createdBy || null };

      if (!enrichedHeader.patientId && enrichedHeader.customerName && enrichedHeader.customerType && enrichedHeader.customerType !== "cash") {
        try {
          const found = await findOrCreatePatient(enrichedHeader.customerName);
          enrichedHeader.patientId = found.id;
        } catch { /* non-fatal */ }
      }

      const invoice = await storage.updateSalesInvoice(req.params.id as string, enrichedHeader, lines);
      res.json(invoice);
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("نهائية") || (error instanceof Error ? error.message : String(error)).includes("معتمدة")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/sales-invoices/:id", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      await storage.deleteSalesInvoice(req.params.id as string, reason);
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("نهائية")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/seed/pharmacy-sales-demo", requireAuth, async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Seed not available in production" });
    }
    try {
      const result = await runPharmacyDemoSeed();
      res.json({ success: true, ...result });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
