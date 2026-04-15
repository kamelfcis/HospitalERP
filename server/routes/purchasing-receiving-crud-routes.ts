import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
  validateReceivingLines,
} from "./_shared";
import { assertUserWarehouseAllowed } from "../lib/warehouse-guard";

export function registerReceivingCrudRoutes(app: Express) {
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
      if (!header.warehouseId) return res.status(400).json({ message: "المخزن مطلوب" });
      if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: "يجب إضافة صنف واحد على الأقل" });
      if (!header.supplierInvoiceNo?.trim()) return res.status(400).json({ message: "رقم فاتورة المورد مطلوب" });

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
}
