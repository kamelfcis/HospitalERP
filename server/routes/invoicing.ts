import type { Express } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { runPharmacyDemoSeed } from "../seeds/pharmacy-demo";
import { sql } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  broadcastToPharmacy,
} from "./_shared";
import { auditLog } from "../route-helpers";
import { PERMISSIONS } from "@shared/permissions";
import {
  insertServiceSchema,
  insertPriceListSchema,
  insertPatientInvoiceHeaderSchema,
  insertPatientInvoiceLineSchema,
  insertPatientInvoicePaymentSchema,
  insertAdmissionSchema,
  salesInvoiceHeaders,
  warehouses,
  items,
  itemBarcodes,
  inventoryLots,
} from "@shared/schema";

export function registerInvoicingRoutes(app: Express) {

  // ===== Services =====

  app.get("/api/services", async (req, res) => {
    try {
      const { search, departmentId, category, active, page, pageSize } = req.query;
      const result = await storage.getServices({
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        active: active as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/services", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validated);
      res.status(201).json(service);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/services/:id", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(req.params.id as string, validated);
      if (!service) {
        return res.status(404).json({ message: "الخدمة غير موجودة" });
      }
      res.json(service);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود الخدمة مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/service-categories", async (req, res) => {
    try {
      const categories = await storage.getServiceCategories();
      res.json(categories);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== Service Consumables =====

  app.get("/api/services/:id/consumables", async (req, res) => {
    try {
      const consumables = await storage.getServiceConsumables(req.params.id as string);
      res.json(consumables);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.put("/api/services/:id/consumables", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const lines = req.body;
      if (!Array.isArray(lines)) {
        return res.status(400).json({ message: "يجب إرسال مصفوفة من المستهلكات" });
      }
      const validUnitLevels = ["major", "medium", "minor"];
      for (const line of lines) {
        if (!line.itemId || !line.quantity || Number(line.quantity) <= 0) {
          return res.status(400).json({ message: "كل مستهلك يجب أن يحتوي على صنف وكمية صحيحة" });
        }
        if (line.unitLevel && !validUnitLevels.includes(line.unitLevel)) {
          return res.status(400).json({ message: "مستوى الوحدة غير صالح" });
        }
      }
      const result = await storage.replaceServiceConsumables(req.params.id as string, lines);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== Price Lists =====

  app.get("/api/price-lists", async (req, res) => {
    try {
      const lists = await storage.getPriceLists();
      res.json(lists);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/price-lists", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertPriceListSchema.parse(req.body);
      const list = await storage.createPriceList(validated);
      res.status(201).json(list);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.put("/api/price-lists/:id", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = insertPriceListSchema.partial().parse(req.body);
      const list = await storage.updatePriceList(req.params.id as string, validated);
      if (!list) {
        return res.status(404).json({ message: "قائمة الأسعار غير موجودة" });
      }
      res.json(list);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("duplicate key") || (error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "كود قائمة الأسعار مكرر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== Price List Items =====

  app.get("/api/price-lists/:id/items", async (req, res) => {
    try {
      const { search, departmentId, category, page, pageSize } = req.query;
      const result = await storage.getPriceListItems(req.params.id as string, {
        search: search as string,
        departmentId: departmentId as string,
        category: category as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  const priceListItemsBodySchema = z.object({
    items: z.array(z.object({
      serviceId: z.string(),
      price: z.string(),
      minDiscountPct: z.string().optional(),
      maxDiscountPct: z.string().optional(),
    })).min(1, "يجب إرسال بند واحد على الأقل"),
  });

  app.post("/api/price-lists/:id/items", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = priceListItemsBodySchema.parse(req.body);
      await storage.upsertPriceListItems(req.params.id as string, validated.items);
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/price-lists/:id/copy-from", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const { sourceListId } = z.object({ sourceListId: z.string() }).parse(req.body);
      await storage.copyPriceList(req.params.id as string, sourceListId);
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== Bulk Adjustment =====

  const bulkAdjustBodySchema = z.object({
    mode: z.enum(['PCT', 'FIXED']),
    direction: z.enum(['INCREASE', 'DECREASE']),
    value: z.number().positive("القيمة يجب أن تكون أكبر من صفر"),
    departmentId: z.string().optional(),
    category: z.string().optional(),
    createMissingFromBasePrice: z.boolean().optional(),
  });

  app.post("/api/price-lists/:id/bulk-adjust/preview", requireAuth, async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustPreview(req.params.id as string, validated);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/price-lists/:id/bulk-adjust/apply", requireAuth, checkPermission(PERMISSIONS.SERVICES_MANAGE), async (req, res) => {
    try {
      const validated = bulkAdjustBodySchema.parse(req.body);
      const result = await storage.bulkAdjustApply(req.params.id as string, validated);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes("أسعار سالبة")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ==================== Sales Invoices ====================
  
  app.get("/api/sales-invoices", async (req, res) => {
    try {
      const { status, dateFrom, dateTo, customerType, search, pharmacistId, warehouseId, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getSalesInvoices({
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        customerType: customerType as string,
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

  app.get("/api/sales-invoices/journal-failures", async (_req, res) => {
    try {
      const result = await db.select({
        id: salesInvoiceHeaders.id,
        invoiceNumber: salesInvoiceHeaders.invoiceNumber,
        invoiceDate: salesInvoiceHeaders.invoiceDate,
        netTotal: salesInvoiceHeaders.netTotal,
        journalStatus: salesInvoiceHeaders.journalStatus,
        journalError: salesInvoiceHeaders.journalError,
        journalRetries: salesInvoiceHeaders.journalRetries,
        finalizedAt: salesInvoiceHeaders.finalizedAt,
      }).from(salesInvoiceHeaders)
        .where(eq(salesInvoiceHeaders.journalStatus, "failed"))
        .orderBy(salesInvoiceHeaders.finalizedAt);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/sales-invoices/retry-all-journals", requireAuth, checkPermission(PERMISSIONS.JOURNAL_POST), async (_req, res) => {
    try {
      const result = await storage.retryFailedJournals();
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/sales-invoices/:id/journal-readiness", async (req, res) => {
    try {
      const result = await storage.checkJournalReadiness(req.params.id as string);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/sales-invoices/:id", async (req, res) => {
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
      const safeLines = Array.isArray(lines) ? lines.filter((l: Record<string, unknown>) => l.itemId) : [];
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
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/sales-invoices", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header?.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      if (!header?.invoiceDate) return res.status(400).json({ message: "تاريخ الفاتورة مطلوب" });
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId) return res.status(400).json({ message: "الصنف مطلوب في كل سطر" });
        if (!line.qty || parseFloat(line.qty) <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const enriched = { ...header, createdBy: req.session?.userId || header.createdBy || null, clinicOrderId: header.clinicOrderId || null };
      const invoice = await storage.createSalesInvoice(enriched, lines);
      res.status(201).json(invoice);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/sales-invoices/:id", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId) return res.status(400).json({ message: "الصنف مطلوب في كل سطر" });
        if (!line.qty || parseFloat(line.qty) <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const invoice = await storage.updateSalesInvoice(req.params.id as string, header || {}, lines);
      res.json(invoice);
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("نهائية") || (error instanceof Error ? error.message : String(error)).includes("معتمدة")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/sales-invoices/:id/regenerate-journal", requireAuth, checkPermission(PERMISSIONS.JOURNAL_POST), async (req, res) => {
    try {
      const result = await storage.regenerateJournalForInvoice(req.params.id as string);
      if (!result) return res.status(400).json({ message: "لا يمكن إنشاء القيد - تحقق من ربط الحسابات" });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/sales-invoices/:id/finalize", requireAuth, checkPermission(PERMISSIONS.SALES_FINALIZE), async (req, res) => {
    try {
      const existing = await storage.getSalesInvoice(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (existing.status !== "draft") return res.status(409).json({ message: "الفاتورة ليست مسودة", code: "ALREADY_FINALIZED" });

      await storage.assertPeriodOpen(existing.invoiceDate);

      const readiness = await storage.checkJournalReadiness(req.params.id as string);
      if (!readiness.ready) {
        return res.status(422).json({
          message: "لا يمكن تأكيد الفاتورة بسبب مشاكل في الإعداد المحاسبي",
          issues: readiness.critical,
          code: "JOURNAL_READINESS_FAILED",
        });
      }

      const invoice = await storage.finalizeSalesInvoice(req.params.id as string);
      await storage.createAuditLog({ tableName: "sales_invoice_headers", recordId: req.params.id as string, action: "finalize", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "finalized" }) });
      if (invoice.clinicOrderId) {
        try {
          const orderIds = invoice.clinicOrderId.split(",").filter(Boolean);
          for (const oid of orderIds) {
            await pool.query(
              `UPDATE clinic_orders SET status = 'executed', executed_at = NOW(), executed_invoice_id = $1 WHERE id = $2 AND status = 'pending'`,
              [req.params.id as string, oid.trim()]
            );
          }
        } catch (e: any) {
          console.error('[CLINIC_ORDER_LINK]', e.message);
        }
      }
      if (invoice.pharmacyId) {
        broadcastToPharmacy(invoice.pharmacyId, "invoice_finalized", {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          netTotal: invoice.netTotal,
          isReturn: invoice.isReturn,
          pharmacyId: invoice.pharmacyId,
        });
      }
      res.json(invoice);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? error.message : String(error)).includes("ليست مسودة") || (error instanceof Error ? error.message : String(error)).includes("نهائية")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      if ((error instanceof Error ? error.message : String(error)).includes("غير كاف") || (error instanceof Error ? error.message : String(error)).includes("يتطلب") || (error instanceof Error ? error.message : String(error)).includes("بدون أصناف")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
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
      }).catch(err => console.error("[Audit] patient invoice finalize:", err));

      const invoiceLines = await storage.getPatientInvoice(invoiceId);
      if (invoiceLines) {
        const glLines = storage.buildPatientInvoiceGLLines(result, invoiceLines.lines || []);
        storage.generateJournalEntry({
          sourceType: "patient_invoice",
          sourceDocumentId: invoiceId,
          reference: `PI-${result.invoiceNumber}`,
          description: `قيد فاتورة مريض رقم ${result.invoiceNumber} - ${result.patientName}`,
          entryDate: result.invoiceDate,
          lines: glLines,
        }).catch(err => console.error("[GL] patient invoice finalize:", err));
      }

      storage.createTreasuryTransactionsForInvoice(invoiceId, result.finalizedAt
        ? new Date(result.finalizedAt).toISOString().split("T")[0]
        : result.invoiceDate
      ).catch(err => console.error("[Treasury] patient invoice finalize:", err));

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

  // ==================== Patients API ====================

  app.get("/api/patients", async (req, res) => {
    try {
      const search = req.query.search as string;
      const list = search ? await storage.searchPatients(search) : await storage.getPatients();
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/stats", async (req, res) => {
    try {
      const { search, dateFrom, dateTo, deptId } = req.query as Record<string, string>;
      const list = await storage.getPatientStats({ search, dateFrom, dateTo, deptId });
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id", async (req, res) => {
    try {
      const p = await storage.getPatient(req.params.id as string);
      if (!p) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-invoices/:id/transfers", requireAuth, async (req, res) => {
    try {
      const transfers = await storage.getDoctorTransfers(req.params.id as string);
      res.json(transfers);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-invoices/:id/transfer-to-doctor",
    requireAuth,
    checkPermission("patient_invoices.transfer_doctor"),
    async (req, res) => {
    try {
      const { doctorName, amount, clientRequestId, notes } = req.body;
      if (!doctorName || !amount || !clientRequestId) {
        return res.status(400).json({ message: "doctorName وamount وclientRequestId مطلوبة" });
      }
      const transfer = await storage.transferToDoctorPayable({
        invoiceId: req.params.id as string,
        doctorName,
        amount: String(amount),
        clientRequestId,
        notes,
      });
      res.status(201).json(transfer);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ==================== Doctor Settlements ====================

  app.get("/api/doctor-settlements", requireAuth, async (req, res) => {
    try {
      const { doctorName } = req.query;
      const data = await storage.getDoctorSettlements(doctorName ? { doctorName: String(doctorName) } : undefined);
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-settlements/outstanding", requireAuth, async (req, res) => {
    try {
      const { doctorName } = req.query;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const data = await storage.getDoctorOutstandingTransfers(String(doctorName));
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctor-settlements",
    requireAuth,
    checkPermission("doctor_settlements.create"),
    async (req, res) => {
    try {
      const { doctorName, paymentDate, amount, paymentMethod, settlementUuid, notes, allocations } = req.body;
      if (!doctorName || !paymentDate || !amount || !settlementUuid) {
        return res.status(400).json({ message: "doctorName وpaymentDate وamount وsettlementUuid مطلوبة" });
      }
      const settlement = await storage.createDoctorSettlement({
        doctorName,
        paymentDate,
        amount: String(amount),
        paymentMethod: paymentMethod || "cash",
        settlementUuid,
        notes,
        allocations,
      });
      res.status(201).json(settlement);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/patients", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const p = await storage.createPatient(req.body);
      res.status(201).json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const p = await storage.updatePatient(req.params.id as string, req.body);
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      await storage.deletePatient(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ==================== Doctors API ====================

  app.get("/api/doctors/balances", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getDoctorBalances());
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-statement", requireAuth, async (req, res) => {
    try {
      const { doctorName, dateFrom, dateTo } = req.query as Record<string, string>;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      res.json(await storage.getDoctorStatement({ doctorName, dateFrom, dateTo }));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors", async (req, res) => {
    try {
      const search = req.query.search as string;
      const includeInactive = req.query.includeInactive === "true";
      const list = search ? await storage.searchDoctors(search) : await storage.getDoctors(includeInactive);
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors/:id", async (req, res) => {
    try {
      const d = await storage.getDoctor(req.params.id as string);
      if (!d) return res.status(404).json({ message: "طبيب غير موجود" });
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_CREATE), async (req, res) => {
    try {
      const d = await storage.createDoctor(req.body);
      res.status(201).json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      const d = await storage.updateDoctor(req.params.id as string, req.body);
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      await storage.deleteDoctor(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ==================== Surgery Types API ====================

  app.get("/api/surgery-types", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      res.json(await storage.getSurgeryTypes(search));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/surgery-types", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const { nameAr, category, isActive } = req.body;
      if (!nameAr?.trim()) return res.status(400).json({ message: "اسم العملية مطلوب" });
      if (!["major","medium","minor","skilled","simple"].includes(category))
        return res.status(400).json({ message: "تصنيف غير صالح" });
      const row = await storage.createSurgeryType({ nameAr: nameAr.trim(), category, isActive: isActive !== false });
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/surgery-types/:id", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const { nameAr, category, isActive } = req.body;
      if (category && !["major","medium","minor","skilled","simple"].includes(category))
        return res.status(400).json({ message: "تصنيف غير صالح" });
      const row = await storage.updateSurgeryType(req.params.id as string, {
        ...(nameAr !== undefined && { nameAr: nameAr.trim() }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json(row);
    } catch (e: any) {
      res.status(e.message.includes("غير موجود") ? 404 : 500).json({ message: e.message });
    }
  });

  app.delete("/api/surgery-types/:id", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      await storage.deleteSurgeryType(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) {
      res.status(e.message.includes("مرتبط") ? 409 : 500).json({ message: e.message });
    }
  });

  app.get("/api/surgery-category-prices", async (req, res) => {
    try { res.json(await storage.getSurgeryCategoryPrices()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/surgery-category-prices/:category", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const { price } = req.body;
      if (price === undefined || isNaN(parseFloat(price)))
        return res.status(400).json({ message: "السعر غير صالح" });
      const row = await storage.upsertSurgeryCategoryPrice(req.params.category as string, String(parseFloat(price)));
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/patient-invoices/:id/surgery-type", requireAuth, async (req, res) => {
    try {
      const { surgeryTypeId } = req.body;
      await storage.updateInvoiceSurgeryType(req.params.id as string, surgeryTypeId || null);
      res.json({ success: true });
    } catch (e: any) {
      const code = e.message.includes("غير موجود") ? 404
        : e.message.includes("نهائية") ? 409 : 500;
      res.status(code).json({ message: e.message });
    }
  });

  // ==================== Admissions API ====================

  app.get("/api/admissions", async (req, res) => {
    try {
      const filters: Record<string, unknown> = {};
      if (req.query.status as string)   filters.status   = req.query.status as string;
      if (req.query.search as string)   filters.search   = req.query.search as string;
      if (req.query.dateFrom as string) filters.dateFrom = req.query.dateFrom as string;
      if (req.query.dateTo as string)   filters.dateTo   = req.query.dateTo as string;
      if (req.query.deptId as string)   filters.deptId   = req.query.deptId as string;
      const list = await storage.getAdmissions(filters);
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id", async (req, res) => {
    try {
      const a = await storage.getAdmission(req.params.id as string);
      if (!a) return res.status(404).json({ message: "الإقامة غير موجودة" });
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/admissions", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_CREATE), async (req, res) => {
    try {
      const parsed = insertAdmissionSchema.parse(req.body);
      const a = await storage.createAdmission(parsed);
      res.status(201).json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.patch("/api/admissions/:id", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const parsed = insertAdmissionSchema.partial().parse(req.body);
      const a = await storage.updateAdmission(req.params.id as string, parsed);
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.post("/api/admissions/:id/discharge", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const a = await storage.dischargeAdmission(req.params.id as string);
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/invoices", async (req, res) => {
    try {
      const invoices = await storage.getAdmissionInvoices(req.params.id as string);
      res.json(invoices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/admissions/:id/consolidate", requireAuth, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const consolidated = await storage.consolidateAdmissionInvoices(req.params.id as string);
      res.json(consolidated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/report", async (req, res) => {
    try {
      const admission = await storage.getAdmission(req.params.id as string);
      if (!admission) return res.status(404).json({ message: "الإقامة غير موجودة" });

      const invoices = await storage.getAdmissionInvoices(req.params.id as string);
      const invoiceDetails = [];
      for (const inv of invoices) {
        if (inv.isConsolidated) continue;
        const detail = await storage.getPatientInvoice(inv.id);
        const dept = inv.departmentId ? await storage.getDepartment(inv.departmentId) : null;
        invoiceDetails.push({
          ...(detail || inv),
          departmentName: dept?.nameAr || "بدون قسم",
        });
      }

      res.json({ admission, invoices: invoiceDetails });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ─── Sales Returns ──────────────────────────────────────────────────────────

  app.get("/api/sales-returns/search", requireAuth, async (req, res) => {
    try {
      const { invoiceNumber, receiptBarcode, itemBarcode, itemCode, itemId, dateFrom, dateTo, warehouseId } = req.query as Record<string, string | undefined>;
      if (!invoiceNumber && !receiptBarcode && !itemBarcode && !itemCode && !itemId) {
        return res.status(400).json({ message: "يجب إدخال رقم فاتورة أو باركود إيصال أو صنف للبحث" });
      }
      const results = await storage.searchSaleInvoicesForReturn({ invoiceNumber, receiptBarcode, itemBarcode, itemCode, itemId, dateFrom, dateTo, warehouseId });
      res.json(results);
    } catch (e: any) {
      console.error("[SALES_RETURNS_SEARCH]", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/sales-returns/invoice/:id", requireAuth, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const invoice = await storage.getSaleInvoiceForReturn(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة أو غير مرحّلة" });
      res.json(invoice);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/sales-returns", requireAuth, async (req, res) => {
    try {
      const { originalInvoiceId, warehouseId, returnLines, discountType, discountPercent, discountValue, notes } = req.body;
      if (!originalInvoiceId || !returnLines?.length) {
        return res.status(400).json({ message: "بيانات المرتجع غير مكتملة" });
      }
      const activeLines = returnLines.filter((l: Record<string, unknown>) => parseFloat(l.qtyInMinor as string) > 0);
      if (!activeLines.length) return res.status(400).json({ message: "يجب إدخال كمية مرتجعة لصنف واحد على الأقل" });

      const result = await storage.createSalesReturn({
        originalInvoiceId, warehouseId, returnLines: activeLines,
        discountType: discountType || "percent", discountPercent: discountPercent || "0",
        discountValue: discountValue || "0", notes: notes || "",
        createdBy: req.session.userId!,
      });
      auditLog({
        tableName: "sales_invoice_headers",
        recordId: result.id || originalInvoiceId,
        action: "sales_return",
        newValues: { originalInvoiceId, linesCount: activeLines.length },
        userId: req.session.userId,
      }).catch(err => console.error("[Audit] sales return:", err));
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
