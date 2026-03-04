/**
 * دوال مساعدة لتصنيف الألوان بناءً على حالة الفاتورة أو نوع الخدمة.
 */

export function getStatusBadgeClass(status: string): string {
  if (status === "draft")     return "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "finalized") return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "cancelled") return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
  return "";
}

export function getServiceRowClass(serviceType: string): string {
  if (serviceType === "ACCOMMODATION") return "bg-amber-50 dark:bg-amber-950/30";
  if (serviceType === "OPERATING_ROOM") return "bg-indigo-50 dark:bg-indigo-950/30";
  return "";
}
