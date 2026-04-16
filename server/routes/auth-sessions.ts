import type { Express, Request } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { pool } from "../db";
import { DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";
import { logger } from "../lib/logger";
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/** Must finish before login routes accept traffic — serverless cold starts used to race fire-and-forget seeds. */
async function runAuthBootstrapSeeds(): Promise<void> {
  try {
    const existing = await storage.getPharmacies();
    if (existing.length === 0) {
      await storage.createPharmacy({ code: "PH01", nameAr: "الصيدلية الرئيسية", isActive: true });
      await storage.createPharmacy({ code: "PH02", nameAr: "صيدلية الطوارئ", isActive: true });
      logger.info("[SEED] Seeded default pharmacies");
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "[SEED] Failed to seed pharmacies");
  }

  try {
    let seeded = false;
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const existing = await storage.getRolePermissions(role);
      const existingSet = new Set(existing.map(p => p.permission));
      const missing = perms.filter(p => !existingSet.has(p));
      if (missing.length > 0) {
        for (const perm of missing) {
          try {
            await pool.query(`INSERT INTO role_permissions (role, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [role, perm]);
          } catch {}
        }
        seeded = true;
      }
    }
    if (seeded) logger.info("[SEED] Synced role permissions with defaults");
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "[SEED] Failed to seed role permissions");
  }

  try {
    const allUsers = await storage.getUsers();
    if (allUsers.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await storage.createUser({
        username: "admin",
        password: hashedPassword,
        fullName: "مدير النظام",
        role: "admin",
        isActive: true,
      });
      logger.info("[SEED] Seeded default admin user (admin/admin123)");
    }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "[SEED] Failed to seed admin user");
  }
}

export async function registerAuthSessionsRoutes(app: Express) {
  await runAuthBootstrapSeeds();

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "يرجى إدخال اسم المستخدم وكلمة المرور" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      req.session.userId = user.id;
      req.session.role = user.role;
      await saveSession(req);

      const permissions = await storage.getUserEffectivePermissions(user.id);
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser, permissions });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "فشل تسجيل الخروج" });
      }
      res.json({ message: "تم تسجيل الخروج" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "غير مسجل" });
    }
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.isActive) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "غير مسجل" });
      }
      const permissions = await storage.getUserEffectivePermissions(user.id);
      const { password: _, ...safeUser } = user;
      const isAdminRole = user.role === "admin" || (user.role as string) === "owner";
      const allowedWarehouses = isAdminRole ? [] : await storage.getUserWarehouses(user.id);
      const allowedWarehouseIds = allowedWarehouses.map(w => w.id);

      const allowedDepts = isAdminRole ? [] : await storage.getUserDepartments(user.id);
      let allowedDepartmentIds = allowedDepts.map(d => d.id);
      if (!isAdminRole && allowedDepartmentIds.length === 0 && user.departmentId) {
        allowedDepartmentIds = [user.departmentId];
      }

      let effectiveMaxDiscountPct:   string | null = safeUser.maxDiscountPct ?? null;
      let effectiveMaxDiscountValue: string | null = null;
      let groupDefaultRoute:         string | null = null;

      if (user.permissionGroupId) {
        const group = await storage.getPermissionGroup(user.permissionGroupId);
        if (group) {
          if (group.maxDiscountPct != null) {
            const groupPct = parseFloat(group.maxDiscountPct);
            if (effectiveMaxDiscountPct == null || groupPct < parseFloat(effectiveMaxDiscountPct)) {
              effectiveMaxDiscountPct = String(groupPct);
            }
          }
          if (group.maxDiscountValue != null) {
            effectiveMaxDiscountValue = group.maxDiscountValue;
          }
          groupDefaultRoute = group.defaultRoute ?? null;
        }
      }

      const userTreasury = await storage.getUserTreasury(user.id);

      res.json({
        user: {
          ...safeUser,
          maxDiscountPct:   effectiveMaxDiscountPct,
          maxDiscountValue: effectiveMaxDiscountValue,
          defaultRoute:     groupDefaultRoute,
          defaultTreasuryId: userTreasury?.id ?? null,
        },
        permissions,
        allowedWarehouseIds,
        allowedDepartmentIds,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
