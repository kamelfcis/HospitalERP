/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Clinic Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - clinic-master-storage.ts  : العيادات + المواعيد + الاستشارات
 *  - clinic-orders-storage.ts  : الطلبات + الأسعار + طلبات الخدمات
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export { default as clinicMasterMethods } from "./clinic-master-storage";
export { default as clinicOrdersMethods }  from "./clinic-orders-storage";
