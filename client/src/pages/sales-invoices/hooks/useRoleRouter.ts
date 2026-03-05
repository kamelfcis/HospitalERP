/**
 * useRoleRouter — توجيه حسب صلاحيات المستخدم داخل صفحة فواتير المبيعات
 *
 * من يملك صلاحية sales.registry_view → يرى قائمة الفواتير عادياً
 * من لا يملكها (صيدلي، كاشير، ...) → يُوجَّه مباشرة لفاتورة جديدة
 *
 * التحكم من شاشة إدارة المستخدمين — يمكن منح/سحب الصلاحية لأي مستخدم
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/permissions";

export function useRoleRouter(editId: string | null, navigate: (path: string) => void) {
  const { hasPermission, isLoading } = useAuth();
  const canViewRegistry = hasPermission(PERMISSIONS.SALES_REGISTRY_VIEW);

  useEffect(() => {
    // انتظر تحميل بيانات اليوزر أولاً
    if (isLoading) return;
    // لو لا يملك صلاحية القائمة وهو في شاشة القائمة → وجّهه لفاتورة جديدة
    if (!canViewRegistry && !editId) {
      navigate("/sales-invoices?id=new");
    }
  }, [isLoading, canViewRegistry, editId, navigate]);

  return {
    canViewRegistry,
    isLoading,
  };
}
