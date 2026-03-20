/**
 * WarehouseTransferNotice
 *
 * Informational banner explaining that warehouse_transfer GL accounts
 * are configured per-warehouse (via the warehouse record itself), not
 * via the account_mappings table.
 */

import { Info } from "lucide-react";

export function WarehouseTransferNotice() {
  return (
    <div
      className="mx-6 mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2 text-sm"
      data-testid="notice-warehouse-transfer"
    >
      <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
      <div className="text-blue-800">
        <span className="font-semibold block">التحويلات المخزنية — آلية ربط خاصة</span>
        <span className="text-xs leading-relaxed">
          حساب المخزون لكل مستودع يُحدَّد مباشرةً في{" "}
          <strong>إعدادات المستودع → حقل "حساب المخزون"</strong>
          {" "}— ولا يمر عبر جدول ربط الحسابات هنا.
          <br />
          <strong>سياسة التحكم المحاسبي:</strong>
          <ul className="mt-1 space-y-0.5 list-none">
            <li>• كلا المستودعين <strong>بدون</strong> حساب GL → التحويل يكتمل بدون قيد (مقبول)</li>
            <li>• أحدهما فقط له حساب GL → <strong className="text-red-700">يُوقَف الترحيل</strong> (إعداد ناقص)</li>
            <li>• كلاهما له حساب GL → قيد إلزامي — <strong className="text-red-700">يُوقَف إذا لا توجد فترة مفتوحة</strong></li>
          </ul>
          القيد: <strong>مدين ← مخزن الوجهة</strong> / <strong>دائن ← مخزن المصدر</strong> بقيمة تكلفة الدفعات.
        </span>
      </div>
    </div>
  );
}
