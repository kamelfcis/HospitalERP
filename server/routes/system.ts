import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";
import { PERMISSIONS } from "@shared/permissions";
import { setSetting } from "../settings-cache";
import {
  requireAuth,
  checkPermission,
  chatSseClients,
  broadcastChatMessage,
} from "./_shared";

export function registerSystemRoutes(app: Express) {

  // ==================== System Settings ====================

  app.get("/api/public/login-background", async (_req, res) => {
    try {
      const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, "login_background"));
      if (rows.length === 0 || !rows[0].value) return res.status(404).json({ message: "لا توجد صورة" });
      res.json({ image: rows[0].value });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/login-background", requireAuth, async (req: any, res) => {
    try {
      if (req.session.role !== "admin" && req.session.role !== "owner") {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const { image } = req.body;
      if (typeof image !== "string" || !image.startsWith("data:image/")) {
        return res.status(400).json({ message: "صورة غير صالحة" });
      }
      await db.insert(systemSettings).values({ key: "login_background", value: image, updatedAt: new Date() })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: image, updatedAt: new Date() } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const rows = await db.select().from(systemSettings);
      const result: Record<string, string> = {};
      for (const row of rows) result[row.key] = row.value;
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/settings/:key", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (typeof value !== "string") return res.status(400).json({ message: "قيمة غير صالحة" });
      const ALLOWED_KEYS = ["stay_billing_mode"];
      if (!ALLOWED_KEYS.includes(key)) return res.status(400).json({ message: "مفتاح إعداد غير مسموح" });
      await setSetting(key, value);
      res.json({ key, value });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Announcements (news ticker) ───────────────────────────────────────────
  app.get("/api/announcements", requireAuth, async (_req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id, message, is_active AS "isActive", created_at AS "createdAt", created_by AS "createdBy" FROM announcements ORDER BY created_at DESC`);
      res.json(rows.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/announcements/active", requireAuth, async (_req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id, message FROM announcements WHERE is_active = true ORDER BY created_at DESC`);
      res.json(rows.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/announcements", requireAuth, async (req, res) => {
    if (!["owner", "admin"].includes(req.session.role!)) return res.status(403).json({ message: "غير مصرح" });
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "نص الإعلان مطلوب" });
      const rows = await db.execute(sql`
        INSERT INTO announcements (message, is_active, created_by)
        VALUES (${message.trim()}, true, ${req.session.userId})
        RETURNING id, message, is_active AS "isActive", created_at AS "createdAt"
      `);
      res.json(rows.rows[0]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/announcements/:id", requireAuth, async (req, res) => {
    if (!["owner", "admin"].includes(req.session.role!)) return res.status(403).json({ message: "غير مصرح" });
    try {
      const { id } = req.params;
      const { message, isActive } = req.body;
      await db.execute(sql`
        UPDATE announcements
        SET message   = COALESCE(${message ?? null}, message),
            is_active = COALESCE(${isActive ?? null}, is_active)
        WHERE id = ${id}
      `);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/announcements/:id", requireAuth, async (req, res) => {
    if (!["owner", "admin"].includes(req.session.role!)) return res.status(403).json({ message: "غير مصرح" });
    try {
      await db.execute(sql`DELETE FROM announcements WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Chat ──────────────────────────────────────────────────────────────────

  app.get("/api/chat/sse", requireAuth, (req, res) => {
    const userId = req.session.userId!;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    chatSseClients.set(userId, res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(ping); } }, 25000);
    req.on("close", () => { clearInterval(ping); chatSseClients.delete(userId); });
  });

  app.get("/api/chat/users", requireAuth, async (req, res) => {
    try {
      const users = await storage.getChatUsers(req.session.userId!);
      res.json(users);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/chat/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getChatUnreadCount(req.session.userId!);
      res.json({ count });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/chat/messages/:otherUserId", requireAuth, async (req, res) => {
    try {
      const { otherUserId } = req.params;
      const me = req.session.userId!;
      await storage.markChatRead(otherUserId, me);
      const msgs = await storage.getChatConversation(me, otherUserId);
      res.json(msgs);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/chat/messages", requireAuth, async (req, res) => {
    try {
      const { receiverId, body } = req.body;
      if (!receiverId || !body?.trim()) return res.status(400).json({ message: "مستلم ونص الرسالة مطلوبان" });
      const msg = await storage.sendChatMessage(req.session.userId!, receiverId, body.trim());
      const senderRow = await db.execute(sql`SELECT full_name FROM users WHERE id = ${req.session.userId!}`);
      const senderName = (senderRow.rows[0] as any)?.full_name ?? "مستخدم";
      broadcastChatMessage(receiverId, { ...msg, senderName });
      res.json(msg);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/chat/messages/read/:senderId", requireAuth, async (req, res) => {
    try {
      await storage.markChatRead(req.params.senderId, req.session.userId!);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
