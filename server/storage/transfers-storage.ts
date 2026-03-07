/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Transfers Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  هذا الملف barrel يجمع وحدات تخزين التحويلات المقسّمة:
 *  - transfers-core-storage.ts   : التحويل CRUD + الترحيل + الحذف
 *  - transfers-utils-storage.ts  : FEFO Preview + توافر الأصناف + البحث المتقدم + قيود التحويل
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export { default as transfersCoreMethods } from "./transfers-core-storage";
export { transfersInventoryMethods } from "./transfers-inventory-storage";
export { transfersSearchMethods } from "./transfers-search-storage";
export { transfersLogisticsMethods } from "./transfers-logistics-storage";
