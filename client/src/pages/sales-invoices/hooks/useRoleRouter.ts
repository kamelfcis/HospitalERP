/**
 * useRoleRouter — توجيه حسب دور المستخدم داخل صفحة فواتير المبيعات
 *
 * الصيدلي / الكاشير / مساعد المخزن:
 *   - لا يرون قائمة الفواتير أبداً
 *   - عند الدخول للصفحة يُحوَّلون مباشرة لفاتورة جديدة
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

/** الأدوار التي تقفز مباشرة إلى فاتورة جديدة بدون قائمة */
const DIRECT_INVOICE_ROLES = ["pharmacist", "cashier", "warehouse_assistant"];

export function useRoleRouter(editId: string | null, navigate: (path: string) => void) {
  const { user, isLoading } = useAuth();
  const role = user?.role || "";
  const isDirectRole = DIRECT_INVOICE_ROLES.includes(role);

  useEffect(() => {
    // انتظر تحميل بيانات اليوزر أولاً
    if (isLoading) return;
    // لو الدور مقيّد والمستخدم في شاشة القائمة → وجّهه لفاتورة جديدة
    if (isDirectRole && !editId) {
      navigate("/sales-invoices?id=new");
    }
  }, [isLoading, isDirectRole, editId, navigate]);

  return {
    isDirectRole,
    role,
    isLoading,
  };
}
