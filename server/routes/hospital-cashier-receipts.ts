import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, checkPermission, checkAnyPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";

export function registerCashierReceiptRoutes(app: Express) {
  app.get("/api/cashier/shift/:shiftId/totals", requireAuth, async (req, res) => {
    try { res.json(await storage.getShiftTotals(req.params.shiftId as string)); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/cashier/receipts/:id/print", requireAuth, async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      res.json(await storage.markReceiptPrinted(req.params.id as string, printedBy, reprintReason));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("مطبوع مسبقاً")) return res.status(409).json({ message: msg });
      if (msg.includes("غير موجود")) return res.status(404).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/cashier/refund-receipts/:id/print", requireAuth, async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      res.json(await storage.markRefundReceiptPrinted(req.params.id as string, printedBy, reprintReason));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("مطبوع مسبقاً")) return res.status(409).json({ message: msg });
      if (msg.includes("غير موجود")) return res.status(404).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/cashier/receipts/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.getCashierReceipt(req.params.id as string);
      if (!r) return res.status(404).json({ message: "الإيصال غير موجود" });
      res.json(r);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/refund-receipts/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.getCashierRefundReceipt(req.params.id as string);
      if (!r) return res.status(404).json({ message: "إيصال المرتجع غير موجود" });
      res.json(r);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries", requireAuth, checkAnyPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW, PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      const userId = req.session.userId as string;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (perms.includes(PERMISSIONS.CASHIER_HANDOVER_VIEW)) {
        return res.json(await storage.getTreasuries());
      }
      const mine = await storage.getUserTreasury(userId);
      return res.json(mine ? [mine] : []);
    }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/summary", requireAuth, checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW), async (req, res) => {
    try { res.json(await storage.getTreasuriesSummary()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/treasuries", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      if (!name || !glAccountId) return res.status(400).json({ message: "الاسم والحساب مطلوبان" });
      res.status(201).json(await storage.createTreasury({ name, glAccountId, isActive: isActive ?? true, notes }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.patch("/api/treasuries/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      res.json(await storage.updateTreasury(req.params.id as string, { name, glAccountId, isActive, notes }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/treasuries/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try { await storage.deleteTreasury(req.params.id as string); res.json({ ok: true }); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/my-assigned", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;
      const rows = await db.execute(sql`
        SELECT t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
               a.code AS gl_account_code, a.name AS gl_account_name
        FROM   user_treasuries ut
        JOIN   treasuries t ON t.id = ut.treasury_id
        JOIN   accounts   a ON a.id = t.gl_account_id
        WHERE  ut.user_id = ${userId}
      `);
      if (!rows.rows.length) return res.json(null);
      const r = rows.rows[0] as Record<string, unknown>;
      res.json({
        id: r.id, name: r.name, glAccountId: r.gl_account_id,
        isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
        glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
      });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/mine", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;

      const assigned = await storage.getUserTreasury(userId);
      if (assigned) return res.json(assigned);

      const shift = await storage.getMyOpenShift(userId) as
        { glAccountId?: string | null; id?: string; openedAt?: string } | null;
      if (shift?.glAccountId) {
        const rows = await db.execute(sql`
          SELECT t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
                 a.code AS gl_account_code, a.name AS gl_account_name
          FROM   treasuries t
          JOIN   accounts   a ON a.id = t.gl_account_id
          WHERE  t.gl_account_id = ${shift.glAccountId}
            AND  t.is_active = true
          LIMIT 1
        `);
        if (rows.rows.length > 0) {
          const r = rows.rows[0] as Record<string, unknown>;
          return res.json({
            id:            r.id,
            name:          r.name,
            glAccountId:   r.gl_account_id,
            isActive:      r.is_active,
            notes:         r.notes,
            createdAt:     r.created_at,
            glAccountCode: r.gl_account_code,
            glAccountName: r.gl_account_name,
          });
        }

        const glRows = await db.execute(sql`
          SELECT id, code, name FROM accounts WHERE id = ${shift.glAccountId} LIMIT 1
        `);
        if (glRows.rows.length > 0) {
          const g = glRows.rows[0] as Record<string, unknown>;
          return res.json({
            id:            `shift-${shift.id}`,
            name:          String(g.name),
            glAccountId:   shift.glAccountId,
            isActive:      true,
            notes:         null,
            createdAt:     shift.openedAt,
            glAccountCode: String(g.code),
            glAccountName: String(g.name),
          });
        }
      }

      res.json(null);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/:id/statement", requireAuth, checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW), async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      const page     = parseInt(String(req.query.page     || "1"))   || 1;
      const pageSize = parseInt(String(req.query.pageSize || "100")) || 100;
      res.json(await storage.getTreasuryStatement({ treasuryId: req.params.id as string, dateFrom, dateTo, page, pageSize }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/user-treasuries", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try { res.json(await storage.getAllUserTreasuries()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/user-treasuries", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try {
      const { userId, treasuryId } = req.body;
      if (!userId || !treasuryId) return res.status(400).json({ message: "userId و treasuryId مطلوبان" });
      await storage.assignUserTreasury(userId, treasuryId);
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/user-treasuries/:userId", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try { await storage.removeUserTreasury(req.params.userId as string); res.json({ ok: true }); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });
}
