/*
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  ⚠️  NO-TOUCH ZONE — منطقة محظور التعديل                     ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  هذا الملف يتحكم في:                                          ║
 * ║   • تسجيل الدخول وتسجيل الخروج                               ║
 * ║   • إنشاء المستخدمين والأدوار والصلاحيات                      ║
 * ║   • إعداد النظام عند أول تشغيل                                ║
 * ║                                                               ║
 * ║  أي خطأ هنا = لا أحد يقدر يدخل النظام                       ║
 * ║  لا تعدّل إلا إذا كنت متأكداً 100% مما تفعله                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "../storage";
import { pool } from "../db";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  userDepartmentsAssignmentSchema,
  userWarehousesAssignmentSchema,
} from "./_shared";

export async function registerAuthRoutes(app: Express) {
  (async () => {
    try {
      const existing = await storage.getPharmacies();
      if (existing.length === 0) {
        await storage.createPharmacy({ code: "PH01", nameAr: "الصيدلية الرئيسية", isActive: true });
        await storage.createPharmacy({ code: "PH02", nameAr: "صيدلية الطوارئ", isActive: true });
        console.log("Seeded default pharmacies");
      }
    } catch (e) {
      console.error("Failed to seed pharmacies:", e);
    }
  })();

  (async () => {
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
      if (seeded) console.log("Synced role permissions with defaults");
    } catch (e) {
      console.error("Failed to seed role permissions:", e);
    }
  })();

  (async () => {
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
        console.log("Seeded default admin user (admin/admin123)");
      }
    } catch (e) {
      console.error("Failed to seed admin user:", e);
    }
  })();

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
      res.json({ user: safeUser, permissions, allowedWarehouseIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users", requireAuth, checkPermission("users.view"), async (req, res) => {
    try {
      const allUsers = await storage.getUsers();
      const safeUsers = allUsers.map(({ password: _, ...u }) => u);
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", requireAuth, checkPermission("users.create"), async (req, res) => {
    try {
      const { username, password, fullName, role, departmentId, pharmacyId, isActive } = req.body;
      if (!username || !password || !fullName || !role) {
        return res.status(400).json({ message: "يرجى إدخال جميع الحقول المطلوبة" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "اسم المستخدم مستخدم بالفعل" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        fullName,
        role,
        departmentId: departmentId || null,
        pharmacyId: pharmacyId || null,
        isActive: isActive !== false,
      });
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/users/:id", requireAuth, checkPermission("users.edit"), async (req, res) => {
    try {
      const { id } = req.params;
      const { username, password, fullName, role, departmentId, pharmacyId, isActive, cashierGlAccountId } = req.body;

      const updateData: any = {};
      if (username !== undefined) updateData.username = username;
      if (fullName !== undefined) updateData.fullName = fullName;
      if (role !== undefined) updateData.role = role;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (cashierGlAccountId !== undefined) updateData.cashierGlAccountId = cashierGlAccountId || null;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, checkPermission("users.delete"), async (req, res) => {
    try {
      const { id } = req.params;
      if (id === req.session.userId) {
        return res.status(400).json({ message: "لا يمكنك حذف حسابك الشخصي" });
      }
      const result = await storage.deleteUser(id);
      if (!result) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      res.json({ message: "تم حذف المستخدم" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/permissions", requireAuth, checkPermission("users.view"), async (req, res) => {
    try {
      const userPerms = await storage.getUserPermissions(req.params.id);
      res.json(userPerms);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/permissions", requireAuth, checkPermission("users.edit"), async (req, res) => {
    try {
      const { permissions } = req.body;
      const oldPerms = await storage.getUserPermissions(req.params.id);
      await storage.setUserPermissions(req.params.id, permissions || []);
      auditLog({
        tableName: "user_permissions",
        recordId: req.params.id,
        action: "update",
        oldValues: oldPerms.map((p: any) => p.permission),
        newValues: permissions || [],
        userId: req.session.userId,
      }).catch(err => console.error("[Audit] permission change:", err));
      res.json({ message: "تم تحديث الصلاحيات" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/role-permissions/:role", requireAuth, checkPermission("users.view"), async (req, res) => {
    try {
      const perms = await storage.getRolePermissions(req.params.role);
      res.json(perms.map(p => p.permission));
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

  app.get("/api/users/:id/departments", async (req, res) => {
    try {
      const depts = await storage.getUserDepartments(req.params.id);
      res.json(depts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/departments", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try {
      const validated = userDepartmentsAssignmentSchema.parse(req.body);
      const { departmentIds } = validated;
      await storage.setUserDepartments(req.params.id, departmentIds || []);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "departmentIds يجب أن يكون مصفوفة" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/warehouses", async (req, res) => {
    try {
      const whs = await storage.getUserWarehouses(req.params.id);
      res.json(whs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/warehouses", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try {
      const validated = userWarehousesAssignmentSchema.parse(req.body);
      const { warehouseIds } = validated;
      await storage.setUserWarehouses(req.params.id, warehouseIds || []);
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "warehouseIds يجب أن يكون مصفوفة" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/cashier-scope", requireAuth, checkPermission("users.view"), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.params.id);
      const [depts] = await Promise.all([
        storage.getUserDepartments(req.params.id),
        storage.getUserWarehouses(req.params.id),
      ]);
      res.json({ ...scope, assignedDepartments: depts, assignedPharmacyIds: scope.allowedPharmacyIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/cashier-scope", requireAuth, checkPermission("users.edit"), async (req, res) => {
    try {
      const { departmentIds = [], hasAllUnits = false } = req.body;
      await storage.setUserDepartments(req.params.id, departmentIds);
      const allPerms = await storage.getUserPermissions(req.params.id);
      const filtered = allPerms.filter(p => p.permission !== "cashier.all_units");
      const updated = [
        ...filtered.map(p => ({ permission: p.permission, granted: p.granted as boolean })),
        ...(hasAllUnits ? [{ permission: "cashier.all_units", granted: true }] : []),
      ];
      await storage.setUserPermissions(req.params.id, updated);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
