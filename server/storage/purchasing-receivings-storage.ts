/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchasing Receivings Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  هذا الملف barrel يجمع وحدات تخزين الموردين وأذونات الاستلام:
 *  - purchasing-suppliers-storage.ts     : الموردون (CRUD + search)
 *  - purchasing-receivings-core-storage.ts : أذونات الاستلام (draft, post, delete, hints)
 *  - purchasing-edit-storage.ts          : تعديل استلام مُرحّل + تحويل لفاتورة
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import suppliersMethods from "./purchasing-suppliers-storage";
import receivingsCoreMethods from "./purchasing-receivings-core-storage";
import editMethods from "./purchasing-edit-storage";

const methods = {
  ...suppliersMethods,
  ...receivingsCoreMethods,
  ...editMethods,
};

export default methods;
