import type { Express } from "express";
import { storage } from "../storage";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { PERMISSIONS } from "@shared/permissions";
import {
  requireAuth,
  checkPermission,
  addFormattedNumber,
  addFormattedNumbers,
} from "./_shared";
import { assertUserWarehousesAllowed } from "../lib/warehouse-guard";
import { getTransferSuggestions } from "../storage/transfer-suggestion-storage";

export function registerWarehousesTransfersRoutes(app: Express) {
  app.get("/api/transfers/smart-suggestion", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_VIEW), async (req, res) => {
    try {
      const { sourceWarehouseId, destWarehouseId, dateFrom, dateTo, excludeCovered, search, page, pageSize } = req.query;
      if (!sourceWarehouseId || !destWarehouseId || !dateFrom || !dateTo) {
        return res.status(400).json({ message: "sourceWarehouseId, destWarehouseId, dateFrom, dateTo مطلوبة" });
      }
      const result = await getTransferSuggestions({
        sourceWarehouseId: sourceWarehouseId as string,
        destWarehouseId: destWarehouseId as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        excludeCovered: excludeCovered === "true",
        search: (search as string) || "",
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 50,
      });
      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/transfers", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_VIEW), async (req, res) => {
    try {
      const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize, includeCancelled } = req.query;

      if (page || pageSize || fromDate || toDate || sourceWarehouseId || destWarehouseId || status || search || includeCancelled) {
        const result = await storage.getTransfersFiltered({
          fromDate: fromDate as string | undefined,
          toDate: toDate as string | undefined,
          sourceWarehouseId: sourceWarehouseId as string | undefined,
          destWarehouseId: destWarehouseId as string | undefined,
          status: status as string | undefined,
          search: search as string | undefined,
          page: parseInt(page as string) || 1,
          pageSize: parseInt(pageSize as string) || 50,
          includeCancelled: includeCancelled === 'true',
        });
        return res.json({ ...result, data: addFormattedNumbers(result.data || [], "transfer", "transferNumber") });
      }

      const transfers = await storage.getTransfers();
      res.json(addFormattedNumbers(transfers, "transfer", "transferNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/transfers/:id", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_VIEW), async (req, res) => {
    try {
      const transfer = await storage.getTransfer(req.params.id as string);
      if (!transfer) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json(addFormattedNumber(transfer, "transfer", "transferNumber"));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/transfer/fefo-preview", requireAuth, async (req, res) => {
    try {
      const { itemId, warehouseId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !warehouseId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId, warehouseId, requiredQtyInMinor مطلوبة" });
      }
      const qty = parseFloat(requiredQtyInMinor as string);
      if (qty <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const preview = await storage.getWarehouseFefoPreview(
        itemId as string,
        warehouseId as string,
        qty,
        date
      );
      res.json(preview);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers/auto-save", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_CREATE), async (req, res) => {
    try {
      const { header, lines, existingId } = req.body;
      if (!header) return res.status(400).json({ message: "بيانات ناقصة" });
      const { transferDate, sourceWarehouseId, destinationWarehouseId, notes } = header;
      if (!sourceWarehouseId || !destinationWarehouseId) {
        return res.status(400).json({ message: "يجب اختيار مخزن المصدر والوجهة" });
      }

      const whGuardMsg = await assertUserWarehousesAllowed(
        req.session.userId!,
        [sourceWarehouseId, destinationWarehouseId],
        storage,
      );
      if (whGuardMsg) return res.status(403).json({ message: whGuardMsg });

      const safeLines = Array.isArray(lines) ? lines.filter((l: any) => l.itemId) : [];
      const safeHeader = { transferDate: transferDate || new Date().toISOString().split("T")[0], sourceWarehouseId, destinationWarehouseId, notes: notes || null };

      if (existingId) {
        const existing = await storage.getTransfer(existingId);
        if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
        if (existing.status !== "draft") return res.status(409).json({ message: "لا يمكن تعديل تحويل مُرحّل" });
        await storage.updateDraftTransfer(existingId, safeHeader, safeLines);
        return res.json({ id: existingId, transferNumber: existing.transferNumber });
      } else {
        const transfer = await storage.createDraftTransfer(safeHeader, safeLines);
        return res.status(201).json({ id: transfer.id, transferNumber: transfer.transferNumber });
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_CREATE), async (req, res) => {
    try {
      const { transferDate, sourceWarehouseId, destinationWarehouseId, notes, lines } = req.body;

      if (!transferDate || !sourceWarehouseId || !destinationWarehouseId) {
        return res.status(400).json({ message: "بيانات التحويل غير مكتملة" });
      }
      if (sourceWarehouseId === destinationWarehouseId) {
        return res.status(400).json({ message: "مخزن المصدر والوجهة يجب أن يكونا مختلفين" });
      }
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "يجب إضافة سطر واحد على الأقل" });
      }

      const whGuardMsg = await assertUserWarehousesAllowed(
        req.session.userId!,
        [sourceWarehouseId, destinationWarehouseId],
        storage,
      );
      if (whGuardMsg) return res.status(403).json({ message: whGuardMsg });

      const header = { transferDate, sourceWarehouseId, destinationWarehouseId, notes: notes || null };
      const transfer = await storage.createDraftTransfer(header, lines);
      res.status(201).json(transfer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/transfers/:id/post", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_EXECUTE), async (req, res) => {
    try {
      const existing = await storage.getTransfer(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "التحويل غير موجود" });
      if (existing.status !== "draft") return res.status(409).json({ message: "التحويل مُرحّل بالفعل", code: "ALREADY_POSTED" });

      await storage.assertPeriodOpen(existing.transferDate);

      const transfer = await storage.postTransfer(req.params.id as string);
      await storage.createAuditLog({ tableName: "store_transfers", recordId: req.params.id as string, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
      scheduleInventorySnapshotRefresh("transfer_posted");
      res.json(transfer);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      if (_em.includes("الفترة المحاسبية")) return res.status(403).json({ message: (error instanceof Error ? error.message : String(error)) });
      if ((error instanceof Error ? error.message : String(error)).includes("غير مسودة") || (error instanceof Error ? error.message : String(error)).includes("مُرحّل بالفعل")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "ALREADY_POSTED" });
      }
      if ((error instanceof Error ? error.message : String(error)).includes("غير كافية") || (error instanceof Error ? error.message : String(error)).includes("مختلفين") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن") || (error instanceof Error ? error.message : String(error)).includes("غير موجود") || (error instanceof Error ? error.message : String(error)).includes("مطلوب")) {
        return res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/transfers/:id", requireAuth, checkPermission(PERMISSIONS.TRANSFERS_EXECUTE), async (req, res) => {
    try {
      const reason = req.body?.reason as string | undefined;
      const deleted = await storage.deleteTransfer(req.params.id as string, reason);
      if (!deleted) {
        return res.status(404).json({ message: "التحويل غير موجود" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : String(error)).includes("مُرحّل") || (error instanceof Error ? error.message : String(error)).includes("لا يمكن حذف")) {
        return res.status(409).json({ message: (error instanceof Error ? error.message : String(error)), code: "DOCUMENT_POSTED" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });
}
