/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Permission Groups Routes — مسارات مجموعات الصلاحيات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  GET    /api/permission-groups              — قائمة المجموعات مع الإحصائيات
 *  GET    /api/permission-groups/:id          — مجموعة واحدة مع صلاحياتها وأعضائها
 *  POST   /api/permission-groups              — إنشاء مجموعة جديدة
 *  PUT    /api/permission-groups/:id          — تعديل اسم/وصف مجموعة
 *  DELETE /api/permission-groups/:id          — حذف مجموعة (غير نظامية، بدون أعضاء)
 *  PUT    /api/permission-groups/:id/permissions — استبدال صلاحيات مجموعة كاملةً
 *  PUT    /api/users/:id/permission-group     — تعيين/إلغاء تعيين مستخدم لمجموعة
 *
 *  قواعد الحماية:
 *  ───────────────
 *  • كل الـ GET:    permission_groups.view
 *  • كل الـ mutate: permission_groups.manage
 *  • تعيين المستخدم: users.edit
 *  • المجموعات النظامية (is_system=true): لا تُحذف، لا يُعدَّل اسمها
 *  • لا يمكن حذف مجموعة بها أعضاء نشطون
 *  • الصلاحيات يجب أن تكون من السجل الرسمي فقط
 *  • كل المنطق في طبقة Storage — الـ routes رقيقة
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { auditLog } from "../route-helpers";
import { asyncHandler } from "../route-helpers";

// ─────────────────────────────────────────────────────────────────────────────
//  Permission registry — مجموعة كل الصلاحيات المعترف بها في النظام
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS));

// ─────────────────────────────────────────────────────────────────────────────
//  Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name:        z.string().trim().min(1, "اسم المجموعة مطلوب").max(100, "الاسم طويل جداً"),
  description: z.string().trim().max(300, "الوصف طويل جداً").optional(),
});

const updateGroupSchema = z.object({
  name:        z.string().trim().min(1, "اسم المجموعة لا يمكن أن يكون فارغاً").max(100).optional(),
  description: z.string().trim().max(300).optional(),
});

const setPermissionsSchema = z.object({
  permissions: z
    .array(z.string())
    .transform(arr => [...new Set(arr)])    // إزالة المكررات
    .refine(
      arr => arr.every(p => KNOWN_PERMISSIONS.has(p)),
      { message: "بعض الصلاحيات غير موجودة في سجل النظام" }
    ),
});

const assignGroupSchema = z.object({
  groupId: z.string().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
//  Route Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerPermissionGroupRoutes(app: Express) {

  // ── GET /api/permission-groups — قائمة المجموعات مع الإحصائيات ───────────
  app.get(
    "/api/permission-groups",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_VIEW),
    asyncHandler(async (_req, res) => {
      const groups = await storage.getPermissionGroups();
      res.json(groups);
    })
  );

  // ── GET /api/permission-groups/:id — مجموعة واحدة كاملة ──────────────────
  app.get(
    "/api/permission-groups/:id",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_VIEW),
    asyncHandler(async (req, res) => {
      const group = await storage.getPermissionGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ message: "المجموعة غير موجودة" });
      }
      res.json(group);
    })
  );

  // ── POST /api/permission-groups — إنشاء مجموعة جديدة ────────────────────
  app.post(
    "/api/permission-groups",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_MANAGE),
    asyncHandler(async (req, res) => {
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }

      const group = await storage.createPermissionGroup(parsed.data);

      auditLog({
        tableName: "permission_groups",
        recordId:  group.id,
        action:    "create",
        newValues: { name: group.name, description: group.description },
        userId:    req.session.userId,
      }).catch(() => {});

      res.status(201).json(group);
    })
  );

  // ── PUT /api/permission-groups/:id — تعديل اسم / وصف مجموعة ─────────────
  app.put(
    "/api/permission-groups/:id",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_MANAGE),
    asyncHandler(async (req, res) => {
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }

      // حماية المجموعات النظامية — لا يُعدَّل أي حقل (اسم أو وصف)
      const existing = await storage.getPermissionGroup(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "المجموعة غير موجودة" });
      }
      if (existing.isSystem) {
        return res.status(403).json({ message: "لا يمكن تعديل مجموعة نظامية" });
      }

      const group = await storage.updatePermissionGroup(req.params.id, parsed.data);

      auditLog({
        tableName: "permission_groups",
        recordId:  req.params.id,
        action:    "update",
        newValues: parsed.data,
        userId:    req.session.userId,
      }).catch(() => {});

      res.json(group);
    })
  );

  // ── DELETE /api/permission-groups/:id — حذف مجموعة ──────────────────────
  app.delete(
    "/api/permission-groups/:id",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_MANAGE),
    asyncHandler(async (req, res) => {
      // منع الأدمن من حذف نفسه بطريقة غير مباشرة:
      // تحقق من أن المجموعة المحذوفة ليست مجموعة المستخدم الحالي
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.permissionGroupId === req.params.id) {
        return res.status(403).json({ message: "لا يمكنك حذف المجموعة التي أنت عضو فيها" });
      }

      // كل حمايات الحذف (is_system, has_members) في storage
      await storage.deletePermissionGroup(req.params.id);

      auditLog({
        tableName: "permission_groups",
        recordId:  req.params.id,
        action:    "delete",
        userId:    req.session.userId,
      }).catch(() => {});

      res.json({ message: "تم حذف المجموعة" });
    })
  );

  // ── PUT /api/permission-groups/:id/permissions — استبدال صلاحيات المجموعة
  app.put(
    "/api/permission-groups/:id/permissions",
    requireAuth,
    checkPermission(PERMISSIONS.PERMISSION_GROUPS_MANAGE),
    asyncHandler(async (req, res) => {
      const parsed = setPermissionsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }

      // قرأ القديم للـ audit
      const before = await storage.getPermissionGroup(req.params.id);
      if (!before) {
        return res.status(404).json({ message: "المجموعة غير موجودة" });
      }

      // حماية المجموعات النظامية — لا يمكن تعديل صلاحياتها أبداً
      if (before.isSystem) {
        return res.status(403).json({ message: "لا يمكن تعديل صلاحيات مجموعة نظامية" });
      }

      await storage.setGroupPermissions(req.params.id, parsed.data.permissions);

      auditLog({
        tableName: "group_permissions",
        recordId:  req.params.id,
        action:    "update",
        oldValues: { permissions: before.permissions },
        newValues: { permissions: parsed.data.permissions },
        userId:    req.session.userId,
      }).catch(() => {});

      // أعد تحميل المجموعة لإرجاع الحالة الجديدة كاملة
      const updated = await storage.getPermissionGroup(req.params.id);
      res.json({ message: "تم تحديث صلاحيات المجموعة", group: updated });
    })
  );

  // ── PUT /api/users/:id/permission-group — تعيين مستخدم لمجموعة ───────────
  app.put(
    "/api/users/:id/permission-group",
    requireAuth,
    checkPermission(PERMISSIONS.USERS_EDIT),
    asyncHandler(async (req, res) => {
      const parsed = assignGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "groupId يجب أن يكون نصاً أو null" });
      }

      // لا يمكن للمستخدم تعديل مجموعته الخاصة
      if (req.params.id === req.session.userId && parsed.data.groupId !== null) {
        const self = await storage.getUser(req.session.userId!);
        if (self?.permissionGroupId !== parsed.data.groupId) {
          return res.status(403).json({ message: "لا يمكنك تعديل مجموعة صلاحياتك الخاصة" });
        }
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }

      const oldGroupId = targetUser.permissionGroupId;
      await storage.assignUserToGroup(req.params.id, parsed.data.groupId);

      auditLog({
        tableName: "users",
        recordId:  req.params.id,
        action:    "update",
        oldValues: { permissionGroupId: oldGroupId },
        newValues: { permissionGroupId: parsed.data.groupId },
        userId:    req.session.userId,
      }).catch(() => {});

      res.json({ message: "تم تحديث مجموعة المستخدم" });
    })
  );
}
