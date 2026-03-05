/**
 * useRoleRouter — توجيه حسب صلاحيات المستخدم داخل صفحة فواتير المبيعات
 *
 * من يملك صلاحية sales.registry_view → يرى قائمة الفواتير عادياً
 * من لا يملكها → يُوجَّه مباشرة لفاتورة جديدة
 *
 * يُجبر على جلب الصلاحيات الطازة من السيرفر قبل أي قرار توجيه —
 * يحل مشكلة الـ cache القديم بعد تعديل صلاحيات أي مستخدم.
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { PERMISSIONS } from "@shared/permissions";

export function useRoleRouter(editId: string | null, navigate: (path: string) => void) {
  const { hasPermission, isLoading, user } = useAuth();
  const canViewRegistry = hasPermission(PERMISSIONS.SALES_REGISTRY_VIEW);

  // نضمن تحديث الصلاحيات من السيرفر قبل أي قرار توجيه
  const [permissionsReady, setPermissionsReady] = useState(false);

  useEffect(() => {
    // أعد الجلب وانتظر الانتهاء — يضمن عدم استخدام cache قديم
    queryClient
      .refetchQueries({ queryKey: ["/api/auth/me"] })
      .then(() => setPermissionsReady(true))
      .catch(() => setPermissionsReady(true)); // في حالة خطأ، نتابع بالبيانات الموجودة
  }, []);

  useEffect(() => {
    // لا نوجّه إلا بعد:
    // 1- انتهاء جلب الصلاحيات الطازة
    // 2- انتهاء تحميل الـ auth
    // 3- تأكيد وجود المستخدم
    if (!permissionsReady || isLoading || !user) return;
    if (!canViewRegistry && !editId) {
      navigate("/sales-invoices?id=new");
    }
  }, [permissionsReady, isLoading, user, canViewRegistry, editId, navigate]);

  return {
    canViewRegistry,
    permissionsReady,
  };
}
