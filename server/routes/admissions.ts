import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission } from "./_shared";
import { insertAdmissionSchema } from "@shared/schema";

export function registerAdmissionsRoutes(app: Express) {
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
      if (req.query.page as string) {
        filters.page     = parseInt(String(req.query.page))     || 1;
        filters.pageSize = parseInt(String(req.query.pageSize || "50")) || 50;
      }
      const result = await storage.getAdmissions(filters);
      res.json(result);
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
