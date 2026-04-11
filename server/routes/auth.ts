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
import { registerAuthSessionsRoutes } from "./auth-sessions";
import { registerAuthUsersRoutes } from "./auth-users";

export async function registerAuthRoutes(app: Express) {
  await registerAuthSessionsRoutes(app);
  registerAuthUsersRoutes(app);
}
