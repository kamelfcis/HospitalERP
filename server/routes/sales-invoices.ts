import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { db, pool } from "../db";
import { eq, sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  broadcastToUnit,
} from "./_shared";
import { salesInvoiceHeaders, warehouses } from "@shared/schema";
import { runPharmacyDemoSeed } from "../seeds/pharmacy-demo";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: التحقق من صلاحية المستودع للمستخدم
// يعيد رسالة الخطأ أو null إذا كان الوصول مسموحاً
// ─────────────────────────────────────────────────────────────────────────────
async function getWarehouseForbiddenMsg(userId: string, warehouseId: string): Promise<string | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;
  if (user.role === "admin" || (user.role as string) === "owner") return null;
  const allowed = await storage.getUserWarehouses(userId);
  if (allowed.length === 0) return null; // لا قيود = وصول كامل
  if (!allowed.some(w => w.id === warehouseId)) {
    return "ليس لديك صلاحية استخدام هذا المستودع";
  }
  return null;
}

export function registerSalesInvoicesRoutes(app: Express) {
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
      const forbiddenMsg = await getWarehouseForbiddenMsg(req.session.userId!, header.warehouseId);
      if (forbiddenMsg) return res.status(403).json({ message: forbiddenMsg });
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
      const forbiddenMsg = await getWarehouseForbiddenMsg(req.session.userId!, header.warehouseId);
      if (forbiddenMsg) return res.status(403).json({ message: forbiddenMsg });
      if (!lines || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      
      for (const line of lines) {
        if (!line.itemId) return res.status(400).json({ message: "الصنف مطلوب في كل سطر" });
        if (!line.qty || parseFloat(line.qty) <= 0) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }

      const enriched = { ...header, createdBy: req.session?.userId || header.createdBy || null, clinicOrderId: header.clinicOrderId || null };
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

      // ── فحص قابلية التسعير لكل سطر قبل الاعتماد ─────────────────────────
      {
        type LineWithItem = {
          unit_level: string;
          name_ar: string;
          major_unit_name: string | null;
          medium_unit_name: string | null;
          minor_unit_name: string | null;
          major_to_medium: string | null;
          major_to_minor: string | null;
          medium_to_minor: string | null;
        };
        const linesResult = await db.execute(sql`
          SELECT
            sil.unit_level,
            i.name_ar,
            i.major_unit_name,
            i.medium_unit_name,
            i.minor_unit_name,
            i.major_to_medium,
            i.major_to_minor,
            i.medium_to_minor
          FROM sales_invoice_lines sil
          JOIN items i ON i.id = sil.item_id
          WHERE sil.invoice_id = ${req.params.id}
        `);
        const linesWithItems = (linesResult as any).rows as LineWithItem[];

        for (const ln of linesWithItems) {
          const m2med = parseFloat(String(ln.major_to_medium ?? "0")) || 0;
          const m2min = parseFloat(String(ln.major_to_minor  ?? "0")) || 0;
          const med2m = parseFloat(String(ln.medium_to_minor ?? "0")) || 0;

          let priceable = true;
          let unitDisplayName = ln.unit_level;
          if (ln.unit_level === "medium") {
            priceable = m2med > 0;
            unitDisplayName = ln.medium_unit_name || "متوسطة";
          } else if (ln.unit_level === "minor") {
            priceable = m2min > 0 || (m2med > 0 && med2m > 0);
            unitDisplayName = ln.minor_unit_name || "صغرى";
          } else {
            unitDisplayName = ln.major_unit_name || "كبرى";
          }

          if (!priceable) {
            return res.status(400).json({
              message: `الصنف "${ln.name_ar}" بوحدة "${unitDisplayName}": معامل التحويل غير معرّف — لا يمكن اعتماد الفاتورة`,
              code: "UNIT_CONVERSION_MISSING",
            });
          }
        }
      }

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
      scheduleInventorySnapshotRefresh("sales_finalized");
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
      // بث SSE: للصيدليات نستخدم pharmacyId مباشرة،
      // للأقسام (pharmacy=null) نحصل على departmentId من المخزن
      const broadcastPayload = {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        netTotal: invoice.netTotal,
        isReturn: invoice.isReturn,
        pharmacyId: invoice.pharmacyId,
      };
      if (invoice.pharmacyId) {
        broadcastToUnit(invoice.pharmacyId, "invoice_finalized", broadcastPayload);
      } else if (invoice.warehouseId) {
        const [wh] = await db.select({ departmentId: warehouses.departmentId })
          .from(warehouses)
          .where(eq(warehouses.id, invoice.warehouseId))
          .limit(1);
        if (wh?.departmentId) broadcastToUnit(wh.departmentId, "invoice_finalized", broadcastPayload);
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

}
