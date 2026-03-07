/*
 * ═══════════════════════════════════════════════════════════════
 *  _auth.ts — Authentication & Authorization Middleware
 *  التحقق من الهوية والصلاحيات
 * ═══════════════════════════════════════════════════════════════
 *
 *  exports:
 *   requireAuth       — middleware: يتحقق أن المستخدم مسجل دخول
 *   checkPermission   — middleware factory: يتحقق من صلاحية محددة
 *
 *  الاستخدام:
 *   app.get("/api/...", requireAuth, handler)
 *   app.post("/api/...", requireAuth, checkPermission("accounts.create"), handler)
 * ═══════════════════════════════════════════════════════════════
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  next();
}

async function requirePermission(
  req: Request,
  res: Response,
  next: NextFunction,
  permission: string,
) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  const perms = await storage.getUserEffectivePermissions(req.session.userId);
  if (!perms.includes(permission)) {
    return res.status(403).json({ message: "لا تملك صلاحية لهذا الإجراء" });
  }
  next();
}

export function checkPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requirePermission(req, res, next, permission);
  };
}
