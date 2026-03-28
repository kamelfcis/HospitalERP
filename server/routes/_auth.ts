/*
 * ═══════════════════════════════════════════════════════════════
 *  _auth.ts — Authentication & Authorization Middleware
 *  التحقق من الهوية والصلاحيات
 * ═══════════════════════════════════════════════════════════════
 *
 *  exports:
 *   requireAuth          — middleware: يتحقق أن المستخدم مسجل دخول
 *   checkPermission      — middleware factory: يتحقق من صلاحية محددة
 *   checkHospitalAccess  — middleware: يمنع الوصول لبيانات المستشفى في وضع الصيدلية
 *
 *  الاستخدام:
 *   app.get("/api/...", requireAuth, handler)
 *   app.post("/api/...", requireAuth, checkPermission("accounts.create"), handler)
 *   app.get("/api/bed-board", requireAuth, checkHospitalAccess, handler)
 *   app.post("/api/...", requireAuth, checkHospitalAccess, checkPermission("admissions.manage"), handler)
 * ═══════════════════════════════════════════════════════════════
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { getSetting } from "../settings-cache";
import { logger } from "../lib/logger";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "يجب تسجيل الدخول" });
  }
  next();
}

/**
 * checkHospitalAccess
 * يمنع وصول مستخدمي الصيدلية إلى endpoints المستشفى عندما:
 *   pharmacy_mode = true  AND  user.role !== "owner"
 *
 * يجب تطبيقه بعد requireAuth دائماً:
 *   requireAuth → checkHospitalAccess → [checkPermission]
 */
export function checkHospitalAccess(req: Request, res: Response, next: NextFunction) {
  const pharmacyMode = getSetting("pharmacy_mode", "false") === "true";
  const role = (req.session as { role?: string }).role ?? "";
  const isOwner = role === "owner";

  if (pharmacyMode && !isOwner) {
    logger.warn({
      event: "HOSPITAL_ACCESS_BLOCKED",
      userId: (req.session as { userId?: string }).userId ?? "unknown",
      role,
      path: req.path,
      method: req.method,
    }, "[PHARMACY_MODE] Blocked hospital endpoint access");
    return res.status(403).json({ message: "Forbidden in pharmacy mode" });
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
