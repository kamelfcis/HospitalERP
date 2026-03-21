import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pill, Beaker } from "lucide-react";
import { TargetBadge } from "./TargetBadge";
import { PharmacyGroupPopup } from "./PharmacyGroupPopup";
import { ServiceGroupPopup } from "./ServiceGroupPopup";
import type { GroupedClinicOrder, ClinicOrder } from "../types";

const STATUS_CLASSES: Record<string, string> = {
  executed: "bg-green-50 text-green-700 border-green-200",
  pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  mixed:    "bg-amber-50 text-amber-700 border-amber-200",
};

interface Props {
  group: GroupedClinicOrder;
  onExecute: (order: ClinicOrder) => void;
  isExecuting: boolean;
  canExecute: boolean;
}

export function GroupedOrderRow({ group, onExecute, isExecuting, canExecute }: Props) {
  const isPharmacy = group.orderType === "pharmacy";
  const Icon = isPharmacy ? Pill : Beaker;

  const colorScheme = isPharmacy
    ? { bg: "bg-green-50/30 hover:bg-green-50/60", icon: "text-green-600", badge: "bg-green-100 text-green-700", btnBorder: "border-green-300 text-green-700" }
    : { bg: "bg-blue-50/30 hover:bg-blue-50/60",  icon: "text-blue-600",  badge: "bg-blue-100 text-blue-700",  btnBorder: "border-blue-300 text-blue-700" };

  const statusLabel = group.groupStatus === "executed"
    ? "منفذ"
    : group.groupStatus === "pending"
    ? "معلق"
    : "جزئي";

  const statusClass = STATUS_CLASSES[group.groupStatus] ?? STATUS_CLASSES.mixed;

  // Active lines for counts (exclude cancelled from active count per Correction 3)
  const pendingLines   = group.lines.filter(l => l.status === "pending");
  const activeCount    = group.pendingCount + group.executedCount;  // non-cancelled

  // Summary label
  const countLabel = isPharmacy
    ? `عدد الأدوية: ${activeCount}`
    : `عدد الخدمات: ${activeCount}`;

  return (
    <TableRow
      key={group.groupKey}
      data-testid={`order-group-${group.groupKey}`}
      className={colorScheme.bg}
    >
      {/* Type icon + count badge */}
      <TableCell>
        <div className="flex items-center gap-0.5">
          <Icon className={`h-4 w-4 ${colorScheme.icon}`} />
          {activeCount > 1 && (
            <span className={`text-[10px] font-bold ${colorScheme.badge} rounded-full w-4 h-4 flex items-center justify-center`}>
              {activeCount}
            </span>
          )}
        </div>
      </TableCell>

      {/* Patient / Doctor / Date */}
      <TableCell>
        <div className="text-sm font-medium">{group.patientName}</div>
        {group.doctorName && (
          <div className="text-xs text-muted-foreground">{group.doctorName}</div>
        )}
        {group.appointmentDate && (
          <div className="text-xs text-muted-foreground" dir="ltr">{group.appointmentDate}</div>
        )}
      </TableCell>

      {/* Order summary — "عدد الأدوية: X" / "عدد الخدمات: X" + detail trigger */}
      <TableCell>
        <div className="text-sm font-medium">{countLabel}</div>
        {group.cancelledCount > 0 && (
          <div className="text-[11px] text-red-500">{group.cancelledCount} ملغي</div>
        )}
        {isPharmacy ? (
          <PharmacyGroupPopup
            orders={group.lines}
            pendingOrders={pendingLines}
            patientName={group.patientName}
            trigger={
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 cursor-pointer"
                data-testid={`button-detail-pharmacy-${group.groupKey}`}
              >
                عرض التفاصيل
              </button>
            }
          />
        ) : (
          <ServiceGroupPopup
            orders={group.lines}
            pendingOrders={pendingLines}
            patientName={group.patientName}
            trigger={
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 cursor-pointer"
                data-testid={`button-detail-service-${group.groupKey}`}
              >
                عرض التفاصيل
              </button>
            }
          />
        )}
      </TableCell>

      {/* Target */}
      <TableCell>
        <TargetBadge targetType={group.targetType as "pharmacy" | "department"} targetName={group.targetName} />
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant="outline" className={`text-xs ${statusClass}`}>
          {statusLabel}
          {group.groupStatus === "mixed" && ` ${group.executedCount}/${activeCount}`}
        </Badge>
      </TableCell>

      {/* Actions */}
      {canExecute && (
        <TableCell>
          {pendingLines.length > 0 && isPharmacy && (
            <PharmacyGroupPopup
              orders={group.lines}
              pendingOrders={pendingLines}
              patientName={group.patientName}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
                  data-testid={`button-pharmacy-group-${group.groupKey}`}
                >
                  <Pill className="h-3 w-3" />
                  صرف ({pendingLines.length})
                </Button>
              }
            />
          )}
          {pendingLines.length > 0 && !isPharmacy && group.lines.filter(l => l.status !== "cancelled").length === 1 && (
            <Button
              size="sm"
              variant="outline"
              className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
              onClick={() => onExecute(pendingLines[0])}
              disabled={isExecuting}
              data-testid={`button-execute-${pendingLines[0].id}`}
            >
              <Beaker className="h-3 w-3" />
              تنفيذ
            </Button>
          )}
          {pendingLines.length > 0 && !isPharmacy && group.lines.filter(l => l.status !== "cancelled").length > 1 && (
            <ServiceGroupPopup
              orders={group.lines}
              pendingOrders={pendingLines}
              patientName={group.patientName}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
                  data-testid={`button-service-group-${group.groupKey}`}
                >
                  <Beaker className="h-3 w-3" />
                  تنفيذ ({pendingLines.length})
                </Button>
              }
            />
          )}
          {pendingLines.length === 0 && (
            <span className={`text-xs ${isPharmacy ? "text-green-600" : "text-blue-600"}`}>
              {isPharmacy ? "تم الصرف" : "تم التنفيذ"}
            </span>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
