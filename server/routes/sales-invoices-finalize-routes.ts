import type { Express } from "express";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { db, pool } from "../db";
import { logger } from "../lib/logger";
import { eq, sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  broadcastToUnit,
} from "./_shared";
import { salesInvoiceHeaders, warehouses } from "@shared/schema";
import { assertMappingsComplete } from "../lib/mapping-completeness";

export function registerSalesInvoicesFinalizeRoutes(app: Express) {
  app.get("/api/sales-invoices/journal-failures", requireAuth, checkPermission(PERMISSIONS.JOURNAL_POST), async (_req, res) => {
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

  app.get("/api/sales-invoices/:id/journal-readiness", requireAuth, async (req, res) => {
    try {
      const result = await storage.checkJournalReadiness(req.params.id as string);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
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

      {
        const userId = (req.session as any).userId as string;
        const invoiceUser = await storage.getUser(userId);
        if (invoiceUser?.permissionGroupId) {
          const group = await storage.getPermissionGroup(invoiceUser.permissionGroupId);
          if (group) {
            const headerPct = parseFloat(String(existing.headerDiscountPercent ?? "0"));
            const headerAmt = parseFloat(String(existing.headerDiscountAmount  ?? "0"));

            if (group.maxDiscountPct != null) {
              const limitPct = parseFloat(group.maxDiscountPct);
              if (headerPct > limitPct) {
                return res.status(422).json({
                  message: `نسبة الخصم (${headerPct}%) تتجاوز الحد المسموح (${limitPct}%) لمجموعتك`,
                  code: "DISCOUNT_LIMIT_EXCEEDED",
                });
              }
            }

            if (group.maxDiscountValue != null) {
              const limitAmt = parseFloat(group.maxDiscountValue);
              if (headerAmt > limitAmt) {
                return res.status(422).json({
                  message: `قيمة الخصم (${headerAmt.toFixed(2)} ج) تتجاوز الحد المسموح (${limitAmt.toFixed(2)} ج) لمجموعتك`,
                  code: "DISCOUNT_LIMIT_EXCEEDED",
                });
              }
            }

            if (group.maxDiscountPct != null) {
              const limitPct = parseFloat(group.maxDiscountPct);
              const lineDiscPct = parseFloat(String(existing.discountAmount ?? "0")) / Math.max(parseFloat(String(existing.subtotal ?? "1")), 0.01) * 100;
              if (lineDiscPct > limitPct + 0.01) {
                return res.status(422).json({
                  message: `خصم الأسطر (${lineDiscPct.toFixed(2)}%) يتجاوز الحد المسموح (${limitPct}%) لمجموعتك`,
                  code: "DISCOUNT_LIMIT_EXCEEDED",
                });
              }
            }
          }
        }
      }

      await storage.assertPeriodOpen(existing.invoiceDate);

      // ── فحص ربط الحسابات قبل الاعتماد ────────────────────────────────────
      await assertMappingsComplete("sales_invoice");

      if (existing.customerType !== "cash" && !(existing as any).patientId) {
        return res.status(422).json({
          message: "فواتير الآجل والتأمين والتوصيل تستوجب ربط المريض — يرجى اختيار مريض من السجل الموحد قبل الاعتماد",
          code: "PATIENT_REQUIRED",
        });
      }

      {
        type LineWithItem = {
          line_type: string | null;
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
            sil.line_type,
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
          if (ln.line_type === "consumable") continue;

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
          logger.warn({ err: e.message }, "[CLINIC_ORDER_LINK] failed to update clinic order status");
        }
      }
      if (invoice.customerType !== "credit" && invoice.customerType !== "delivery") {
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
      }
      res.json(invoice);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      // Structured errors (assertMappingsComplete, etc.) carry a .status field
      if (error instanceof Error && typeof (error as any).status === "number") {
        const e = error as any;
        const payload: Record<string, unknown> = { message: msg };
        if (e.code)            payload.code            = e.code;
        if (e.missingMappings) payload.missingMappings = e.missingMappings;
        return res.status(e.status).json(payload);
      }
      if (msg?.includes("الفترة المحاسبية")) return res.status(403).json({ message: msg });
      if (msg.includes("ليست مسودة") || msg.includes("نهائية")) {
        return res.status(409).json({ message: msg });
      }
      if (msg.includes("غير كاف") || msg.includes("يتطلب") || msg.includes("بدون أصناف")) {
        return res.status(400).json({ message: msg });
      }
      res.status(500).json({ message: msg });
    }
  });
}
