import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";

export function registerCashTransferRoutes(app: Express) {
  app.get(
    "/api/cash-transfers",
    requireAuth,
    checkPermission(PERMISSIONS.CASH_TRANSFER_VIEW),
    async (req, res) => {
      try {
        const result = await storage.getCashTransfers({
          page:       req.query.page       ? parseInt(String(req.query.page), 10)     : 1,
          pageSize:   req.query.pageSize   ? parseInt(String(req.query.pageSize), 10) : 50,
          dateFrom:   req.query.dateFrom   ? String(req.query.dateFrom)   : undefined,
          dateTo:     req.query.dateTo     ? String(req.query.dateTo)     : undefined,
          treasuryId: req.query.treasuryId ? String(req.query.treasuryId) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  app.get(
    "/api/cash-transfers/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CASH_TRANSFER_VIEW),
    async (req, res) => {
      try {
        const row = await storage.getCashTransferById(req.params.id);
        if (!row) return res.status(404).json({ message: "التحويل غير موجود" });
        res.json(row);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/cash-transfers",
    requireAuth,
    checkPermission(PERMISSIONS.CASH_TRANSFER_CREATE),
    async (req, res) => {
      try {
        const userId = (req.session as any).userId as string;
        if (!userId) return res.status(401).json({ message: "غير مصرح" });

        const { fromTreasuryId, toTreasuryId, amount, notes, idempotencyKey } = req.body;
        if (!fromTreasuryId) return res.status(400).json({ message: "الخزنة المصدر مطلوبة" });
        if (!toTreasuryId)   return res.status(400).json({ message: "الخزنة الوجهة مطلوبة" });
        if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ message: "المبلغ يجب أن يكون أكبر من الصفر" });
        if (!idempotencyKey) return res.status(400).json({ message: "مفتاح التحقق مطلوب" });

        const transfer = await storage.createCashTransfer(
          { fromTreasuryId, toTreasuryId, amount: String(amount), notes: notes || null, idempotencyKey },
          userId,
        );
        res.status(201).json(transfer);
      } catch (err: any) {
        if (err.message?.includes("unique") || err.code === "23505") {
          return res.status(409).json({ message: "تم تنفيذ هذا التحويل مسبقاً" });
        }
        res.status(500).json({ message: err.message });
      }
    },
  );
}
