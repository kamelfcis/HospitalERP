/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchasing Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  هذا الملف barrel يجمع وحدات تخزين المشتريات المقسّمة:
 *  - purchasing-receivings-storage.ts  : الموردون + أذونات الاستلام + تلميحات الأسعار + التحويل لفاتورة
 *  - purchasing-invoices-storage.ts    : فواتير المشتريات + القيود + تصحيحات الاستلام
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export { default as purchasingReceivingsMethods } from "./purchasing-receivings-storage";
export { default as purchasingInvoicesMethods } from "./purchasing-invoices-storage";
