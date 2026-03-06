/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Route Registry — فهرس المسارات
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  هذا الملف هو نقطة الدخول الرئيسية لكل مسارات API.
 *  كل مجموعة من المسارات مقسمة في ملف منفصل حسب المجال:
 *
 *  auth.ts      → تسجيل الدخول وإدارة المستخدمين والصلاحيات
 *  finance.ts   → الحسابات ومراكز التكلفة والقيود والتقارير المالية
 *  inventory.ts → الأصناف والمخازن والتحويلات والموردين والاستلام
 *  invoicing.ts → فواتير البيع وفواتير المرضى والخدمات والتسعير
 *  hospital.ts  → لوحة الأسرة والأقسام والخزينة وعمليات المستشفى
 *  system.ts    → إعدادات النظام والإعلانات والمحادثات
 *  clinic.ts    → العيادات الخارجية وطلبات الأقسام
 *  _shared.ts   → البنية المشتركة (middleware, SSE, validation schemas)
 *
 *  This file is the main entry point for all API routes.
 *  Each domain has its own file for easy navigation and maintenance.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import type { Server } from "http";
import { registerAuthRoutes } from "./auth";
import { registerFinanceRoutes } from "./finance";
import { registerInventoryRoutes } from "./inventory";
import { registerInvoicingRoutes } from "./invoicing";
import { registerHospitalRoutes } from "./hospital";
import { registerSystemRoutes } from "./system";
import { registerClinicRoutes } from "./clinic";

export { broadcastToPharmacy, broadcastBedBoardUpdate } from "./_shared";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerAuthRoutes(app);
  registerFinanceRoutes(app);
  registerInventoryRoutes(app);
  registerInvoicingRoutes(app);
  registerHospitalRoutes(app, httpServer);
  registerSystemRoutes(app);
  registerClinicRoutes(app);

  return httpServer;
}
