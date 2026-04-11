import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { logger } from "../lib/logger";
import { auditLog } from "../route-helpers";
import {
  requireAuth,
  checkPermission,
  userDepartmentsAssignmentSchema,
  userWarehousesAssignmentSchema,
} from "./_shared";

export function registerAuthUsersRoutes(app: Express) {
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
      const { username, password, fullName, role, departmentId, pharmacyId, isActive, cashierGlAccountId, defaultWarehouseId, defaultPurchaseWarehouseId, cashierVarianceAccountId, cashierVarianceShortAccountId, cashierVarianceOverAccountId, allCashierUnits } = req.body;

      const updateData: any = {};
      if (username !== undefined) updateData.username = username;
      if (fullName !== undefined) updateData.fullName = fullName;
      if (role !== undefined) updateData.role = role;
      if (departmentId !== undefined) updateData.departmentId = departmentId;
      if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (cashierGlAccountId !== undefined) updateData.cashierGlAccountId = cashierGlAccountId || null;
      if (cashierVarianceAccountId !== undefined) updateData.cashierVarianceAccountId = cashierVarianceAccountId || null;
      if (cashierVarianceShortAccountId !== undefined) updateData.cashierVarianceShortAccountId = cashierVarianceShortAccountId || null;
      if (cashierVarianceOverAccountId !== undefined) updateData.cashierVarianceOverAccountId = cashierVarianceOverAccountId || null;
      if (defaultWarehouseId !== undefined) updateData.defaultWarehouseId = defaultWarehouseId || null;
      if (defaultPurchaseWarehouseId !== undefined) updateData.defaultPurchaseWarehouseId = defaultPurchaseWarehouseId || null;
      if (allCashierUnits !== undefined) updateData.allCashierUnits = !!allCashierUnits;
      if ("permissionGroupId" in req.body) updateData.permissionGroupId = req.body.permissionGroupId || null;
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

  app.get("/api/role-permissions/:role", requireAuth, checkPermission("users.view"), async (req, res) => {
    try {
      const perms = await storage.getRolePermissions(req.params.role);
      res.json(perms.map(p => p.permission));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/users/:id/effective-permissions",
    requireAuth,
    checkPermission(PERMISSIONS.USERS_VIEW),
    async (req, res) => {
      try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ message: "المستخدم غير موجود" });
        }
        const detailed = await storage.getUserEffectivePermissionsDetailed(req.params.id);
        res.json({
          userId: req.params.id,
          role: user.role,
          groupId: user.permissionGroupId ?? null,
          permissions: detailed,
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

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
      const scope = await storage.getUserOperationalScope(req.params.id);
      const [depts] = await Promise.all([
        storage.getUserDepartments(req.params.id),
        storage.getUserWarehouses(req.params.id),
      ]);
      res.json({ ...scope, assignedDepartments: depts, assignedPharmacyIds: scope.allowedPharmacyIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/account-scope", requireAuth, async (req, res) => {
    try {
      const accountIds = await storage.getUserAccountScope(req.params.id);
      res.json({ accountIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/account-scope", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try {
      const { accountIds } = req.body;
      if (!Array.isArray(accountIds)) {
        return res.status(400).json({ message: "accountIds يجب أن يكون مصفوفة" });
      }
      const actorUserId = req.session.userId as string;
      const oldIds = await storage.getUserAccountScope(req.params.id);
      await storage.setUserAccountScope(req.params.id, accountIds, actorUserId);
      const oldSet  = new Set(oldIds);
      const newSet  = new Set(accountIds as string[]);
      const added   = (accountIds as string[]).filter(id => !oldSet.has(id));
      const removed = oldIds.filter(id => !newSet.has(id));
      auditLog({
        tableName: "user_account_scopes",
        recordId:  req.params.id,
        action:    "update",
        oldValues: {
          scope:        oldIds.length === 0 ? "unrestricted" : `${oldIds.length} accounts`,
          accountIds:   oldIds,
        },
        newValues: {
          scope:        accountIds.length === 0 ? "unrestricted" : `${accountIds.length} accounts`,
          accountIds:   accountIds,
          added,
          removed,
          targetUserId: req.params.id,
          actorUserId,
        },
        userId:    actorUserId,
      }).catch(err => logger.warn({ err: err.message }, "[Audit] user account scope change"));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/cashier-scope", requireAuth, checkPermission("users.edit"), async (req, res) => {
    try {
      const { departmentIds = [] } = req.body;
      await storage.setUserDepartments(req.params.id, departmentIds);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
