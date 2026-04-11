/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Clinic Orders Storage — Barrel Re-export
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - clinic-drugs-storage.ts          : الأدوية المفضلة للطبيب (Doctor Favorite Drugs)
 *  - clinic-orders-core-storage.ts    : طلبات العيادة + كشف الطبيب + الأسعار
 *  - clinic-dept-orders-storage.ts    : طلبات خدمات الأقسام (Dept Service Orders)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import clinicDrugsMethods from "./clinic-drugs-storage";
import clinicOrdersCoreMethods from "./clinic-orders-core-storage";
import clinicDeptOrdersMethods from "./clinic-dept-orders-storage";

const methods = {
  ...clinicDrugsMethods,
  ...clinicOrdersCoreMethods,
  ...clinicDeptOrdersMethods,
};

export default methods;
