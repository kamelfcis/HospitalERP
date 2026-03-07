/*
 * ═══════════════════════════════════════════════════════════════
 *  hospital.ts — Hospital Routes Registry (Delegation File)
 * ═══════════════════════════════════════════════════════════════
 *
 *  هذا الملف يجمع مسارات المستشفى من 3 ملفات منطقية:
 *
 *  hospital-bedboard.ts  → لوحة الأسرة، قبول المرضى، محرك الإقامة
 *  hospital-cashier.ts   → الصيدليات، الكاشير، الأدراج، الخزن
 *  hospital-rooms.ts     → إدارة الأدوار والغرف والأسرة
 *
 *  لإضافة route جديدة: أضفها في الملف المناسب أعلاه.
 *  لا تضع routes مباشرة هنا.
 * ═══════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import type { Server } from "http";
import { registerBedBoardRoutes } from "./hospital-bedboard";
import { registerCashierRoutes }  from "./hospital-cashier";
import { registerRoomsRoutes }    from "./hospital-rooms";

export function registerHospitalRoutes(app: Express, _httpServer: Server) {
  registerBedBoardRoutes(app);
  registerCashierRoutes(app);
  registerRoomsRoutes(app);
}
