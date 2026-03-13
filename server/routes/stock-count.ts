/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Stock Count Routes — مسارات جرد الأصناف
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  GET  /api/stock-count/sessions             — قائمة جلسات الجرد
 *  POST /api/stock-count/sessions             — إنشاء جلسة جديدة
 *  GET  /api/stock-count/sessions/:id         — جلسة مع سطورها الكاملة
 *  PATCH /api/stock-count/sessions/:id        — تعديل رأس الجلسة (draft فقط)
 *  POST /api/stock-count/sessions/:id/cancel  — إلغاء الجلسة
 *  POST /api/stock-count/sessions/:id/lines   — bulk upsert للسطور
 *  DELETE /api/stock-count/sessions/:id/lines/zero — حذف السطور الصفرية
 *  DELETE /api/stock-count/sessions/:id/lines/:lineId — حذف سطر واحد
 *  GET  /api/stock-count/sessions/:id/load-items — تحميل أصناف المستودع
 *  POST /api/stock-count/sessions/:id/post    — ترحيل الجلسة
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { requireAuth } from "./_auth";
import { checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { storage } from "../storage";

export function registerStockCountRoutes(app: Express) {

  // ── GET /api/stock-count/sessions ─────────────────────────────────────────
  app.get("/api/stock-count/sessions", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_VIEW), async (req, res) => {
    try {
      const { warehouseId, status, page, pageSize } = req.query as Record<string, string | undefined>;
      const result = await storage.getStockCountSessions({
        warehouseId,
        status,
        page:     page     ? parseInt(page)     : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
      });
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ message: msg });
    }
  });

  // ── POST /api/stock-count/sessions ────────────────────────────────────────
  app.post("/api/stock-count/sessions", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      const { warehouseId, countDate, notes } = req.body;
      if (!warehouseId) return res.status(400).json({ message: "المستودع مطلوب" });
      if (!countDate)   return res.status(400).json({ message: "تاريخ الجرد مطلوب" });

      const session = await storage.createStockCountSession({
        warehouseId,
        countDate,
        notes,
        createdBy: req.session.userId!,
      });
      return res.status(201).json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── GET /api/stock-count/sessions/:id ─────────────────────────────────────
  app.get("/api/stock-count/sessions/:id", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_VIEW), async (req, res) => {
    try {
      const session = await storage.getStockCountSessionWithLines(req.params.id as string);
      if (!session) return res.status(404).json({ message: "جلسة الجرد غير موجودة" });
      return res.json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ message: msg });
    }
  });

  // ── PATCH /api/stock-count/sessions/:id ───────────────────────────────────
  app.patch("/api/stock-count/sessions/:id", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      const { countDate, notes } = req.body;
      const session = await storage.updateStockCountHeader(req.params.id as string, { countDate, notes });
      return res.json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── POST /api/stock-count/sessions/:id/cancel ─────────────────────────────
  app.post("/api/stock-count/sessions/:id/cancel", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      await storage.cancelStockCountSession(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── POST /api/stock-count/sessions/:id/lines ──────────────────────────────
  // Bulk upsert lines (pass array of lines to save)
  app.post("/api/stock-count/sessions/:id/lines", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      const lines = req.body as any[];
      if (!Array.isArray(lines)) return res.status(400).json({ message: "يجب إرسال مصفوفة من السطور" });
      const result = await storage.upsertStockCountLines(req.params.id as string, lines);
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── DELETE /api/stock-count/sessions/:id/lines/zero ───────────────────────
  app.delete("/api/stock-count/sessions/:id/lines/zero", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      const deleted = await storage.deleteZeroLines(req.params.id as string);
      return res.json({ deleted });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── DELETE /api/stock-count/sessions/:id/lines/:lineId ────────────────────
  app.delete("/api/stock-count/sessions/:id/lines/:lineId", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_CREATE), async (req, res) => {
    try {
      await storage.deleteStockCountLine(req.params.lineId as string);
      return res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

  // ── GET /api/stock-count/sessions/:id/load-items ──────────────────────────
  // تحميل أصناف المستودع مع رصيد الـ lots وعلامة هل جُردت أم لا
  app.get("/api/stock-count/sessions/:id/load-items", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_VIEW), async (req, res) => {
    try {
      const session = await storage.getStockCountSessionWithLines(req.params.id as string);
      if (!session) return res.status(404).json({ message: "جلسة الجرد غير موجودة" });

      const { includeAll, q, category } = req.query as Record<string, string | undefined>;

      const items = await storage.loadItemsForSession(
        session.warehouseId,
        req.params.id as string,
        {
          includeAll:   includeAll === "true",
          itemNameQ:    q,
          itemCategory: category,
        }
      );
      return res.json(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ message: msg });
    }
  });

  // ── POST /api/stock-count/sessions/:id/post ───────────────────────────────
  app.post("/api/stock-count/sessions/:id/post", requireAuth, checkPermission(PERMISSIONS.STOCK_COUNT_POST), async (req, res) => {
    try {
      const session = await storage.postStockCountSession(
        req.params.id as string,
        req.session.userId!
      );
      return res.json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ message: msg });
    }
  });

}
