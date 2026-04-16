import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, checkPermission, sseClients, capSseForVercel } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { logger } from "../lib/logger";

export function registerCashierSetupRoutes(app: Express) {
  app.get("/api/pharmacies", requireAuth, async (_req, res) => {
    try { res.json(await storage.getPharmacies()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/pharmacies/:id", requireAuth, async (req, res) => {
    try {
      const p = await storage.getPharmacy(req.params.id as string);
      if (!p) return res.status(404).json({ message: "الصيدلية غير موجودة" });
      res.json(p);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/pharmacies", requireAuth, checkPermission(PERMISSIONS.PHARMACIES_MANAGE), async (req, res) => {
    try { res.json(await storage.createPharmacy(req.body)); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/sse/:pharmacyId", (req, res) => {
    const unitId = req.params.pharmacyId;

    res.writeHead(200, {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sseWrite = (data: string) => {
      res.write(data);
      (res as any).flush?.();
    };

    sseWrite(`event: connected\ndata: ${JSON.stringify({ unitId })}\n\n`);
    logger.debug({ unitId }, "[SSE] cashier client connected");

    if (!sseClients.has(unitId)) sseClients.set(unitId, new Set());
    sseClients.get(unitId)!.add(res);

    const keepAlive = setInterval(() => {
      try { sseWrite(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15_000);

    const dispose = capSseForVercel(req, res, () => {
      clearInterval(keepAlive);
      const clients = sseClients.get(unitId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(unitId);
      }
      logger.debug({ unitId }, "[SSE] cashier client disconnected");
    });
    req.on("close", dispose);
  });

  app.get("/api/drawer-passwords", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (_req, res) => {
    try { res.json(await storage.getDrawersWithPasswordStatus()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/drawer-passwords/set", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      if (!password || password.length < 4) return res.status(400).json({ message: "كلمة السر يجب أن تكون 4 أحرف على الأقل" });
      await storage.setDrawerPassword(glAccountId, await bcrypt.hash(password, 10));
      res.json({ success: true, message: "تم تعيين كلمة السر بنجاح" });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/drawer-passwords/validate", async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      const hash = await storage.getDrawerPassword(glAccountId);
      if (!hash) return res.json({ valid: true, hasPassword: false });
      if (!await bcrypt.compare(password || "", hash)) return res.status(401).json({ message: "كلمة السر غير صحيحة" });
      res.json({ valid: true, hasPassword: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/drawer-passwords/:glAccountId", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const removed = await storage.removeDrawerPassword(req.params.glAccountId as string);
      if (!removed) return res.status(404).json({ message: "لا توجد كلمة سر لهذه الخزنة" });
      res.json({ success: true, message: "تم إزالة كلمة السر" });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/units", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId;
      const [pharms, depts] = await Promise.all([storage.getPharmacies(), storage.getDepartments()]);
      const activePharms = pharms.filter((p) => p.isActive);
      const activeDepts  = depts.filter((d) => d.isActive);
      if (!userId) return res.json({ pharmacies: activePharms, departments: activeDepts });
      const scope = await storage.getUserOperationalScope(userId);
      if (scope.isFullAccess) return res.json({ pharmacies: activePharms, departments: activeDepts, isFullAccess: true });
      res.json({
        pharmacies: activePharms.filter((p) => scope.allowedPharmacyIds.includes(p.id)),
        departments: activeDepts.filter((d) => scope.allowedDepartmentIds.includes(d.id)),
        isFullAccess: false,
      });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/staff", requireAuth, async (_req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id, username, full_name AS "fullName" FROM users WHERE is_active = true ORDER BY full_name`);
      res.json(rows.rows);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/my-cashier-gl-account", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId;
      if (!userId) return res.json(null);
      res.json(await storage.getUserCashierGlAccount(userId) || null);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });
}
