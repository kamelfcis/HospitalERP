/**
 * MappingStatusBar
 *
 * Green/amber completion summary for the currently-selected transaction type.
 * Tells the user how many required vs. conditional lines are configured.
 */

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { MappingRow } from "../types";

interface MappingStatusBarProps {
  setupComplete:      boolean;
  requiredMissing:    MappingRow[];
  conditionalMissing: MappingRow[];
  configured:         MappingRow[];
  isWarehouseView:    boolean;
  isPharmacyView:     boolean;
}

export function MappingStatusBar({
  setupComplete,
  requiredMissing,
  conditionalMissing,
  configured,
  isWarehouseView,
  isPharmacyView,
}: MappingStatusBarProps) {
  return (
    <div
      className={`mx-6 mb-4 rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm ${
        setupComplete ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
      }`}
      data-testid="status-bar"
    >
      {setupComplete ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
      )}

      <span className={`font-medium ${setupComplete ? "text-green-700" : "text-amber-700"}`}>
        {setupComplete
          ? "الإعداد مكتمل للسطور الإلزامية"
          : `${requiredMissing.length} سطر إلزامي غير مكتمل`}
      </span>

      <span className="text-muted-foreground text-xs">|</span>
      <span className="text-xs text-muted-foreground">{configured.length} مكتمل</span>

      {conditionalMissing.length > 0 && (
        <span className="text-xs text-amber-600">{conditionalMissing.length} شرطي غير مضبوط</span>
      )}

      {isWarehouseView && (
        <Badge variant="outline" className="text-[10px] mr-auto">
          إعداد خاص بالمستودع — السطور غير المحددة هنا تستخدم الإعداد العام تلقائياً
        </Badge>
      )}
      {isPharmacyView && (
        <Badge variant="outline" className="text-[10px] mr-auto border-emerald-400 text-emerald-700">
          إعداد خاص بالصيدلية — السطور غير المحددة هنا تستخدم الإعداد العام تلقائياً
        </Badge>
      )}
    </div>
  );
}
