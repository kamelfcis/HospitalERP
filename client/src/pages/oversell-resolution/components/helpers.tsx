import { Badge } from "@/components/ui/badge";
import { CheckCircle, ShieldAlert } from "lucide-react";
import type { PendingAllocation, GlReadinessResult } from "./types";

export function psaBadge(status: PendingAllocation["status"]) {
  switch (status) {
    case "pending":            return <Badge variant="destructive" className="text-xs">معلق</Badge>;
    case "partially_resolved": return <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-400">جزئي</Badge>;
    case "fully_resolved":     return <Badge className="text-xs bg-green-100 text-green-700">مسوّى</Badge>;
    default:                   return <Badge variant="outline" className="text-xs">ملغي</Badge>;
  }
}

export function costStatusBadge(costStatus?: string | null) {
  if (!costStatus) return null;
  switch (costStatus) {
    case "pending":  return <Badge className="text-xs bg-orange-100 text-orange-700 border border-orange-300">تكلفة: معلقة</Badge>;
    case "partial":  return <Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-300">تكلفة: جزئية</Badge>;
    case "resolved": return <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">تكلفة: ✓</Badge>;
    default: return null;
  }
}

export function journalStatusBadge(status: string) {
  switch (status) {
    case "posted":  return <Badge className="text-xs bg-green-100 text-green-700">قيد مُرحَّل</Badge>;
    case "blocked": return <Badge className="text-xs bg-red-100 text-red-700">قيد محجوب</Badge>;
    case "voided":  return <Badge variant="outline" className="text-xs">ملغي</Badge>;
    default:        return <Badge variant="outline" className="text-xs">بدون قيد</Badge>;
  }
}

export function GlStatusBadge({ readiness }: { readiness: GlReadinessResult | null | undefined }) {
  if (!readiness) return <Badge variant="outline" className="text-xs">جاري الفحص...</Badge>;
  if (readiness.ready) {
    return <Badge className="text-xs bg-green-100 text-green-700 border border-green-300"><CheckCircle className="h-3 w-3 ml-1" />القيد جاهز</Badge>;
  }
  return <Badge className="text-xs bg-red-100 text-red-700 border border-red-300"><ShieldAlert className="h-3 w-3 ml-1" />القيد محجوب</Badge>;
}

export function ratioColor(ratio: number): string {
  if (ratio === 0)  return "text-green-600";
  if (ratio < 10)   return "text-amber-600";
  if (ratio < 25)   return "text-orange-600";
  return "text-red-700";
}

export function ratioBar(ratio: number): string {
  if (ratio === 0)  return "bg-green-500";
  if (ratio < 10)   return "bg-amber-500";
  if (ratio < 25)   return "bg-orange-500";
  return "bg-red-600";
}
