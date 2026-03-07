/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoices Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - patient-invoices-core-storage.ts          : CRUD الأساسي
 *  - patient-invoices-distribution-storage.ts  : التوزيع على مرضى متعددين
 *  - patient-invoices-returns-storage.ts       : مردودات المبيعات
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export { default as patientInvoicesCoreMethods }         from "./patient-invoices-core-storage";
export { default as patientInvoicesDistributionMethods } from "./patient-invoices-distribution-storage";
export { default as patientInvoicesReturnsMethods }      from "./patient-invoices-returns-storage";
