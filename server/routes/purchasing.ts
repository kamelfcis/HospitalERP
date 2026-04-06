import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  validateReceivingLines,
} from "./_shared";
import { insertSupplierSchema } from "@shared/schema";
import { assertUserWarehouseAllowed } from "../lib/warehouse-guard";

export function registerPurchasingRoutes(app: Express) {
  // ===== SUPPLIERS =====
  // Layer 2: requireAuth — supplier data is internal, not public
  app.get("/api/suppliers", requireAuth, async (req, res) => {
    try {
      const { search, page, pageSize, supplierType, isActive, sortBy, sortDir } = req.query;
      // isActive: "true" = active, "false" = inactive, absent/anything else = active only (management screen passes true/false)
      let isActiveFilter: boolean | null = true;
      if (isActive === "false") isActiveFilter = false;
      else if (isActive === "all") isActiveFilter = null;

      const validSortBy  = (sortBy === "nameAr" || sortBy === "currentBalance") ? sortBy : "currentBalance";
      const validSortDir = (sortDir === "asc" || sortDir === "desc") ? sortDir : "desc";

      const result = await storage.getSuppliers({
        search:       search as string | undefined,
        page:         parseInt(page as string) || 1,
        pageSize:     parseInt(pageSize as string) || 50,
        supplierType: supplierType as string | undefined,
        isActive:     isActiveFilter,
        sortBy:       validSortBy,
        sortDir:      validSortDir,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: requireAuth — supplier lookup used in receiving/purchase forms
  app.get("/api/suppliers/search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const results = await storage.searchSuppliers(q, limit);
      res.json(results);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: requireAuth — individual supplier detail
  app.get("/api/suppliers/:id", requireAuth, async (req, res) => {
    try {
      const supplier = await storage.getSupplier(req.params.id as string);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/suppliers", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const validated = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(validated);
      res.status(201).json(supplier);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: (error instanceof z.ZodError ? error.errors : []) });
      }
      if ((error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "").includes('unique') || (error as { code?: string }).code === '23505') {
        return res.status(409).json({ message: "كود المورد مُستخدم بالفعل" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.patch("/api/suppliers/:id", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      const validated = insertSupplierSchema.partial().parse(req.body);
      const supplier = await storage.updateSupplier(req.params.id as string, validated);
      if (!supplier) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(supplier);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ===== SUPPLIER RECEIVING =====
  // Layer 2: RECEIVING.VIEW required — receiving list contains financial data
  app.get("/api/receivings", requireAuth, checkPermission(PERMISSIONS.RECEIVING_VIEW), async (req, res) => {
    try {
      const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getReceivings({
        supplierId: supplierId as string | undefined,
        warehouseId: warehouseId as string | undefined,
        status: status as string | undefined,
        statusFilter: statusFilter as string | undefined,
        fromDate: fromDate as string | undefined,
        toDate: toDate as string | undefined,
        search: search as string | undefined,
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
        includeCancelled: includeCancelled === 'true',
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "receiving", "receivingNumber") });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: requireAuth — invoice uniqueness check used inside receiving form
  app.get("/api/receivings/check-invoice", requireAuth, async (req, res) => {
    try {
      const { supplierId, supplierInvoiceNo, excludeId } = req.query;
      if (!supplierId || !supplierInvoiceNo) return res.status(400).json({ message: "بيانات ناقصة" });
      const isUnique = await storage.checkSupplierInvoiceUnique(
        supplierId as string,
        supplierInvoiceNo as string,
        excludeId as string | undefined
      );
      res.json({ isUnique });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: RECEIVING.VIEW required — individual receiving detail
  app.get("/api/receivings/:id", requireAuth, checkPermission(PERMISSIONS.RECEIVING_VIEW), async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id as string);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      res.json(addFormattedNumber(receiving, "receiving", "receivingNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/receivings/auto-save", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const { header, lines, existingId } = req.body;
      if (!header) return res.status(400).json({ message: "بيانات ناقصة" });
      
      const receiveDate = header.receiveDate || new Date().toISOString().split("T")[0];
      const supplierId = header.supplierId || null;
      const warehouseId = header.warehouseId || null;
      let supplierInvoiceNo = header.supplierInvoiceNo?.trim() || "";
      
      if (!supplierId || !warehouseId) {
        return res.status(400).json({ message: "يجب اختيار المورد والمخزن أولاً للحفظ التلقائي" });
      }

      const whGuardMsg = await assertUserWarehouseAllowed(req.session.userId!, warehouseId, storage);
      if (whGuardMsg) return res.status(403).json({ message: whGuardMsg });

      if (!supplierInvoiceNo) {
        supplierInvoiceNo = `__AUTO_${Date.now()}`;
      }
      
      const safeHeader = { ...header, supplierId, warehouseId, receiveDate, supplierInvoiceNo };
      const safeLines = Array.isArray(lines) ? lines.filter((l: any) => l.itemId) : [];
      
      if (existingId) {
        const existing = await storage.getReceiving(existingId);
        if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
        if (existing.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل مستند مُرحّل" });
        
        if (supplierInvoiceNo && !supplierInvoiceNo.startsWith("__AUTO_")) {
          const isUnique = await storage.checkSupplierInvoiceUnique(supplierId, supplierInvoiceNo, existingId);
          if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر" });
        }
        
        const result = await storage.saveDraftReceiving(safeHeader, safeLines, existingId);
        return res.json(result);
      } else {
        if (supplierInvoiceNo && !supplierInvoiceNo.startsWith("__AUTO_")) {
          const isUnique = await storage.checkSupplierInvoiceUnique(supplierId, supplierInvoiceNo);
          if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر" });
        }
        
        const result = await storage.saveDraftReceiving(safeHeader, safeLines);
        return res.status(201).json(result);
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/receivings", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      if (!header.supplierId) return res.status(400).json({ message: "المورد مطلوب" });
      if (!header.receiveDate) return res.status(400).json({ message: "تاريخ الاستلام مطلوب" });
      if (!header.supplierInvoiceNo?.trim()) return res.status(400).json({ message: "رقم فاتورة المورد مطلوب" });
      if (!header.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });

      const whGuardMsg = await assertUserWarehouseAllowed(req.session.userId!, header.warehouseId, storage);
      if (whGuardMsg) return res.status(403).json({ message: whGuardMsg });

      const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo);
      if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines);
      res.status(201).json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/receivings/:id", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      const { header, lines } = req.body;
      if (!header || !lines) return res.status(400).json({ message: "بيانات ناقصة" });
      
      const existing = await storage.getReceiving(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل مستند مُرحّل", code: "DOCUMENT_POSTED" });
      }
      
      const isUnique = await storage.checkSupplierInvoiceUnique(header.supplierId, header.supplierInvoiceNo, req.params.id as string);
      if (!isUnique) return res.status(409).json({ message: "رقم فاتورة المورد مكرر لنفس المورد" });
      
      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0) {
        return res.status(400).json({ 
          message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
          lineErrors 
        });
      }
      
      const result = await storage.saveDraftReceiving(header, lines, req.params.id as string);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ── تعديل إذن استلام مُرحَّل (posted_qty_only) قبل تحويله لفاتورة ─────────
  app.patch("/api/receivings/:id/edit-posted", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      const { lines } = req.body;
      if (!lines || !Array.isArray(lines) || lines.length === 0)
        return res.status(400).json({ message: "السطور مطلوبة" });

      const existing = await storage.getReceiving(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "المستند غير موجود" });
      if (existing.status !== "posted_qty_only")
        return res.status(409).json({ message: "يمكن تعديل أذونات الاستلام المُرحَّلة (غير المحوَّلة لفاتورة) فقط", code: "WRONG_STATUS" });

      const lineErrors = await validateReceivingLines(lines);
      if (lineErrors.length > 0)
        return res.status(400).json({ message: "لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة", lineErrors });

      await storage.assertPeriodOpen(existing.receiveDate);

      const result = await storage.editPostedReceiving(req.params.id as string, lines);
      await storage.createAuditLog({
        tableName: "receiving_headers",
        recordId: req.params.id as string,
        action: "edit_posted",
        oldValues: JSON.stringify({ status: existing.status }),
        newValues: JSON.stringify({ linesCount: lines.filter((l: any) => !l.isRejected).length }),
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      if (_em.includes("الفترة") || _em.includes("مُحوَّل") || _em.includes("مُرحَّل") || _em.includes("يمكن") || _em.includes("لا يمكن") || _em.includes("تم بيع") || _em.includes("تم صرف"))
        return res.status(400).json({ message: _em });
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/receivings/:id/post", requireAuth, checkPermission(PERMISSIONS.RECEIVING_POST), async (req, res) => {
    try {
      const receiving = await storage.getReceiving(req.params.id as string);
      if (!receiving) return res.status(404).json({ message: "المستند غير موجود" });
      if (receiving.status === 'posted' || receiving.status === 'posted_qty_only' || receiving.status === 'posted_costed') {
        return res.status(409).json({ message: "المستند مُرحّل بالفعل", code: "ALREADY_POSTED" });
      }

      await storage.assertPeriodOpen(receiving.receiveDate);

      if (receiving.lines && receiving.lines.length > 0) {
        const lineErrors = await validateReceivingLines(receiving.lines);
        if (lineErrors.length > 0) {
          return res.status(400).json({ 
            message: "لا يمكن ترحيل الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة",
            lineErrors 
          });
        }
      }
      let result;
      if (receiving.correctionStatus === 'correction') {
        result = await storage.postReceivingCorrection(req.params.id as string);
      } else {
        result = await storage.postReceiving(req.params.id as string);
      }
      await storage.createAuditLog({ tableName: "receiving_headers", recordId: req.params.id as string, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? error.message : String(error)).includes("مطلوب") || (error instanceof Error ? error.message : String(error)).includes("لا توجد") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن") || (error instanceof Error ? error.message : String(error)).includes("غير موجود") || (error instanceof Error ? error.message : String(error)).includes("سالباً")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/receivings/:id/correct", requireAuth, checkPermission(PERMISSIONS.RECEIVING_EDIT), async (req, res) => {
    try {
      const result = await storage.createReceivingCorrection(req.params.id as string);
      res.status(201).json(result);
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("مسبقاً") || (error instanceof Error ? error.message : String(error)).includes("فقط") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن") || (error instanceof Error ? error.message : String(error)).includes("غير موجود") || (error instanceof Error ? error.message : String(error)).includes("معتمدة")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/receivings/:id", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deleteReceiving(req.params.id as string, reason);
      if (!deleted) return res.status(404).json({ message: "المستند غير موجود" });
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("لا يمكن حذف") || (error instanceof Error ? error.message : String(error)).includes("مُرحّل")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== CONVERT RECEIVING TO PURCHASE INVOICE =====
  app.post("/api/receivings/:id/convert-to-invoice", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_CREATE), async (req, res) => {
    try {
      const invoice = await storage.convertReceivingToInvoice(req.params.id as string);
      res.status(201).json(invoice);
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("مسبقاً") || (error instanceof Error ? error.message : String(error)).includes("أولاً") || (error instanceof Error ? error.message : String(error)).includes("غير موجود")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ===== PURCHASE INVOICES =====
  // Layer 2: PURCHASE_INVOICES.VIEW required — financial document list
  app.get("/api/purchase-invoices", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_VIEW), async (req, res) => {
    try {
      const { supplierId, status, dateFrom, dateTo, invoiceNumber, page, pageSize, includeCancelled } = req.query;
      const result = await storage.getPurchaseInvoices({
        supplierId: supplierId as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        invoiceNumber: invoiceNumber as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
        includeCancelled: includeCancelled === 'true',
      });
      res.json({ ...result, data: addFormattedNumbers(result.data || [], "purchase_invoice", "invoiceNumber") });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: PURCHASE_INVOICES.VIEW required — individual purchase invoice
  app.get("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_VIEW), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(addFormattedNumber(invoice, "purchase_invoice", "invoiceNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  function validateInvoiceLineDiscounts(lines: any[]): { lineIndex: number; field: string; messageAr: string }[] {
    const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
    if (!Array.isArray(lines)) return errors;
    const TOLERANCE = 0.02;
    lines.forEach((ln: any, i: number) => {
      const sp = parseFloat(ln.sellingPrice) || 0;
      const pp = parseFloat(ln.purchasePrice) || 0;
      const pct = parseFloat(ln.lineDiscountPct) || 0;
      const dv = parseFloat(ln.lineDiscountValue) || 0;

      if (pp < 0) {
        errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء لا يمكن أن يكون سالب" });
      }
      if (pct >= 100) {
        errors.push({ lineIndex: i, field: "lineDiscountPct", messageAr: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
      }
      if (sp > 0 && dv > sp + TOLERANCE) {
        errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم أكبر من سعر البيع" });
      }

      if (sp > 0 && (pct > 0 || dv > 0)) {
        const expectedDv = +(sp * (pct / 100)).toFixed(2);
        const expectedPp = +(sp - dv).toFixed(4);
        if (Math.abs(dv - expectedDv) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "lineDiscountValue", messageAr: "قيمة الخصم غير متوافقة مع نسبة الخصم" });
        }
        if (Math.abs(pp - expectedPp) > TOLERANCE) {
          errors.push({ lineIndex: i, field: "purchasePrice", messageAr: "سعر الشراء غير متوافق مع قيمة الخصم" });
        }
      }
    });
    return errors;
  }

  app.post("/api/purchase-invoices/:id/auto-save", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة" });
      const { lines, ...headerUpdates } = req.body;
      const safeLines = Array.isArray(lines) ? lines : [];
      const result = await storage.savePurchaseInvoice(req.params.id as string, safeLines, headerUpdates);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن تعديل فاتورة معتمدة ومُسعّرة", code: "INVOICE_APPROVED" });
      }
      const { lines, ...headerUpdates } = req.body;
      const claimTrimmed = (headerUpdates.claimNumber ?? "").trim().replace(/\s*\/\s*/g, "/");
      if (!claimTrimmed) {
        return res.status(400).json({ message: "رقم المطالبة مطلوب", code: "CLAIM_NUMBER_REQUIRED" });
      }
      const discountErrors = validateInvoiceLineDiscounts(lines);
      if (discountErrors.length > 0) {
        return res.status(400).json({ message: "أخطاء في بيانات الخصم", lineErrors: discountErrors });
      }
      const result = await storage.savePurchaseInvoice(req.params.id as string, lines, { ...headerUpdates, claimNumber: claimTrimmed });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/purchase-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_EDIT), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deletePurchaseInvoice(req.params.id as string, reason);
      if (!deleted) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("لا يمكن حذف")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "INVOICE_APPROVED" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/purchase-invoices/:id/approve", requireAuth, checkPermission(PERMISSIONS.PURCHASE_INVOICES_APPROVE), async (req, res) => {
    try {
      const invoice = await storage.getPurchaseInvoice(req.params.id as string);
      if (!invoice) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (invoice.status !== "draft") return res.status(409).json({ message: "الفاتورة معتمدة بالفعل", code: "ALREADY_APPROVED" });

      await storage.assertPeriodOpen(invoice.invoiceDate as string);

      if (!invoice.claimNumber?.trim()) {
        return res.status(400).json({ message: "رقم المطالبة مطلوب قبل الاعتماد", code: "CLAIM_NUMBER_REQUIRED" });
      }

      if (invoice.lines && Array.isArray(invoice.lines)) {
        const discountErrors = validateInvoiceLineDiscounts(invoice.lines as Array<Record<string, unknown>>);
        if (discountErrors.length > 0) {
          return res.status(400).json({ message: "أخطاء في بيانات الخصم - لا يمكن الاعتماد", lineErrors: discountErrors });
        }
      }
      const result = await storage.approvePurchaseInvoice(req.params.id as string);
      await storage.createAuditLog({ tableName: "purchase_invoice_headers", recordId: req.params.id as string, action: "approve", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "approved" }) });
      scheduleInventorySnapshotRefresh("purchase_approved");
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em?.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? error.message : String(error)).includes("معتمدة")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "ALREADY_APPROVED" });
      }
      if ((error instanceof Error ? error.message : String(error)).includes("غير موجودة")) {
        return res.status(404).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // Layer 2: requireAuth — item purchase hints used in receiving form
  app.get("/api/items/:itemId/hints", requireAuth, async (req, res) => {
    try {
      const { supplierId, warehouseId } = req.query;
      const hints = await storage.getItemHints(req.params.itemId as string, (supplierId as string) || "", (warehouseId as string) || "");
      res.json(hints);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Layer 2: requireAuth — inventory stats per item/warehouse, used in purchase forms
  app.get("/api/items/:itemId/warehouse-stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getItemWarehouseStats(req.params.itemId as string);
      res.json(stats);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
