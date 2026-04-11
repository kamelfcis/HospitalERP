/*
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  ⚠️  NO-TOUCH ZONE — منطقة محظور التعديل                     ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  هذا الملف يتحكم في:                                          ║
 * ║   • تحويلات الأطباء (Doctor Transfers)                        ║
 * ║   • تسويات الأطباء (Doctor Settlements)                       ║
 * ║   • حركات الخزينة (Treasury Transactions)                     ║
 * ║                                                               ║
 * ║  المنطق المالي هنا حساس جداً ومرتبط بالقيود المحاسبية         ║
 * ║  خطأ بسيط = اختلال في أرصدة الأطباء والخزن                   ║
 * ║  لا تعدّل إلا بعد مراجعة كاملة للـ finance-storage.ts أولاً  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

import treasuriesCrudMethods from "./treasuries-crud-storage";
import treasuriesTransactionsMethods from "./treasuries-transactions-storage";

const methods = {
  ...treasuriesCrudMethods,
  ...treasuriesTransactionsMethods,
};

export default methods;
