import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { logger } from "../lib/logger";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission, checkHospitalAccess, broadcastToUnit } from "./_shared";
import { insertAdmissionSchema } from "@shared/schema";
import { findOrCreatePatient } from "../lib/find-or-create-patient";

export function registerAdmissionsRoutes(app: Express) {
  // ==================== Surgery Types API ====================

  app.get("/api/surgery-types", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      res.json(await storage.getSurgeryTypes(search));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/surgery-types", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const { nameAr, category, isActive } = req.body;
      if (!nameAr?.trim()) return res.status(400).json({ message: "اسم العملية مطلوب" });
      if (!["major","medium","minor","skilled","simple"].includes(category))
        return res.status(400).json({ message: "تصنيف غير صالح" });
      const row = await storage.createSurgeryType({ nameAr: nameAr.trim(), category, isActive: isActive !== false });
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/surgery-types/:id", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
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

  app.delete("/api/surgery-types/:id", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      await storage.deleteSurgeryType(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) {
      res.status(e.message.includes("مرتبط") ? 409 : 500).json({ message: e.message });
    }
  });

  app.get("/api/surgery-category-prices", requireAuth, checkHospitalAccess, async (req, res) => {
    try { res.json(await storage.getSurgeryCategoryPrices()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/surgery-category-prices/:category", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const { price } = req.body;
      if (price === undefined || isNaN(parseFloat(price)))
        return res.status(400).json({ message: "السعر غير صالح" });
      const row = await storage.upsertSurgeryCategoryPrice(req.params.category as string, String(parseFloat(price)));
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/patient-invoices/:id/surgery-type", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
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

  app.get("/api/admissions", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const filters: Record<string, unknown> = {};
      if (req.query.status as string)   filters.status   = req.query.status as string;
      if (req.query.search as string)   filters.search   = req.query.search as string;
      if (req.query.dateFrom as string) filters.dateFrom = req.query.dateFrom as string;
      if (req.query.dateTo as string)   filters.dateTo   = req.query.dateTo as string;
      if (req.query.deptId as string)   filters.deptId   = req.query.deptId as string;
      if (req.query.page as string) {
        filters.page     = parseInt(String(req.query.page))     || 1;
        filters.pageSize = parseInt(String(req.query.pageSize || "50")) || 50;
      }

      // ── فرض عزل القسم: إذا كان للمستخدم قسم محدد يُقيَّد به ──────────────
      const sessionUser = await storage.getUser(req.session.userId!);
      if (sessionUser?.departmentId) {
        filters.deptId = sessionUser.departmentId;
      }

      const result = await storage.getAdmissions(filters);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const a = await storage.getAdmission(req.params.id as string);
      if (!a) return res.status(404).json({ message: "الإقامة غير موجودة" });
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/admissions", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_CREATE), async (req, res) => {
    try {
      const parsed = insertAdmissionSchema.parse(req.body);
      let resolvedPatientId = parsed.patientId ?? undefined;
      if (!resolvedPatientId && parsed.patientName?.trim()) {
        const pt = await findOrCreatePatient(parsed.patientName, (parsed as any).patientPhone);
        resolvedPatientId = pt.id;
      }
      const a = await storage.createAdmission({ ...parsed, patientId: resolvedPatientId });
      res.status(201).json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.patch("/api/admissions/:id", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const parsed = insertAdmissionSchema.partial().parse(req.body);
      const a = await storage.updateAdmission(req.params.id as string, parsed);
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.post("/api/admissions/:id/discharge", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const a = await storage.dischargeAdmission(req.params.id as string);
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/invoices", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const invoices = await storage.getAdmissionInvoices(req.params.id as string);
      res.json(invoices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/admissions/:id/consolidate", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const consolidated = await storage.consolidateAdmissionInvoices(req.params.id as string);
      res.json(consolidated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/report", requireAuth, checkHospitalAccess, async (req, res) => {
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
  // ملاحظة: Sales Returns ليست hospital-only — تعمل في الصيدلية أيضاً
  // لذلك لا يُطبق عليها checkHospitalAccess

  app.get("/api/sales-returns/search", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const role   = req.session.role as string | undefined;
      const { invoiceNumber, receiptBarcode, itemBarcode, itemCode, itemId, dateFrom, dateTo, warehouseId } = req.query as Record<string, string | undefined>;
      if (!invoiceNumber && !receiptBarcode && !itemBarcode && !itemCode && !itemId) {
        return res.status(400).json({ message: "يجب إدخال رقم فاتورة أو باركود إيصال أو صنف للبحث" });
      }

      const fullAccessRoles = ["admin", "accountant", "manager"];
      let allowedWarehouseIds: string[] | undefined;
      let effectiveWarehouseId = warehouseId;

      if (!fullAccessRoles.includes(role || "")) {
        const assigned = await storage.getUserWarehouses(userId);
        if (assigned.length > 0) {
          allowedWarehouseIds = assigned.map((w) => w.id);
          if (warehouseId && !allowedWarehouseIds.includes(warehouseId)) {
            effectiveWarehouseId = undefined;
          }
        }
      }

      const results = await storage.searchSaleInvoicesForReturn({
        invoiceNumber, receiptBarcode, itemBarcode, itemCode, itemId,
        dateFrom, dateTo,
        warehouseId: effectiveWarehouseId,
        allowedWarehouseIds,
      });
      res.json(results);
    } catch (e: any) {
      logger.error({ err: e.message }, "[SALES_RETURNS_SEARCH]");
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/sales-returns/invoice/:id", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const invoice = await storage.getSaleInvoiceForReturn(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة أو غير مرحّلة" });
      res.json(invoice);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/sales-returns", requireAuth, checkPermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
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
      }).catch(err => logger.warn({ err: err.message }, "[Audit] sales return"));
      scheduleInventorySnapshotRefresh("sales_return");

      // ── SSE broadcast — إعلام شاشة الكاشير فوراً ─────────────────────
      // نُعلم الكاشير بـ invoice_finalized حتى يُحدّث تابة مردودات المبيعات
      // نفس النمط المستخدم عند إنشاء فواتير البيع في sales-invoices route
      setImmediate(async () => {
        try {
          let unitId = (result as Record<string, unknown>).pharmacyId as string | null | undefined;
          if (!unitId) {
            // حالة المستشفى: المخزن مرتبط بقسم وليس بصيدلية
            const wh = await storage.getWarehouse(warehouseId);
            unitId = wh?.departmentId ?? null;
          }
          if (unitId) {
            broadcastToUnit(unitId, "invoice_finalized", { returnId: result.id, ts: Date.now() });
            logger.debug({ unitId, returnId: result.id }, "[SALES_RETURN] SSE invoice_finalized broadcast sent");
          }
        } catch (err) {
          logger.warn({ err }, "[SALES_RETURN] SSE broadcast failed (non-fatal)");
        }
      });

      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
