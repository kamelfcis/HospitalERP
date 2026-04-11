import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, Loader2, Phone, PackageCheck,
} from "lucide-react";
import { StatusBadge, CoveragePill, WarehouseStockPopover, fmtDateAr } from "./helpers";
import type { DashboardRow, DashboardMode, DisplayUnit } from "./types";

function isActiveOrder(row: DashboardRow): boolean {
  return (
    row.followupActionType === "ordered_from_supplier" &&
    row.followupDueDate != null &&
    new Date(row.followupDueDate) > new Date()
  );
}

export const ShortageRow = memo(function ShortageRow({
  row,
  displayUnit,
  onResolve,
  resolving,
  onMarkOrdered,
  markingOrdered,
  onMarkReceived,
  markingReceived,
  localOrdered,
  canManage,
  mode,
}: {
  row:              DashboardRow;
  displayUnit:      DisplayUnit;
  onResolve:        () => void;
  resolving:        boolean;
  onMarkOrdered:    () => void;
  markingOrdered:   boolean;
  onMarkReceived:   () => void;
  markingReceived:  boolean;
  localOrdered:     boolean;
  canManage:        boolean;
  mode:             DashboardMode;
}) {
  const unitLabel  = row.displayUnitName ?? "";
  const ordered    = isActiveOrder(row) || localOrdered;

  return (
    <TableRow
      className={`text-sm ${row.isResolved ? "opacity-50" : ""} ${ordered ? "bg-green-50 hover:bg-green-50" : "hover:bg-gray-50"}`}
      data-testid={`row-shortage-${row.itemId}`}
    >
      <TableCell className="font-mono text-xs text-gray-500">{row.itemCode}</TableCell>

      <TableCell className="font-medium max-w-52">
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="truncate" title={row.itemName}>{row.itemName}</div>
            {row.category && (
              <div className="text-xs text-gray-400">{row.category}</div>
            )}
          </div>
          {ordered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 shrink-0 mt-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-1.5 py-0.5 text-xs font-medium leading-none cursor-default">
                  <Phone className="h-2.5 w-2.5" />
                  مطلوب
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-right max-w-52">
                <div className="font-medium">مطلوب من الشركة</div>
                {row.followupActionAt && (
                  <div className="text-xs opacity-80 mt-0.5">
                    تم الطلب: {new Date(row.followupActionAt).toLocaleDateString("ar-EG")}
                  </div>
                )}
                {row.followupDueDate && (
                  <div className="text-xs opacity-80">
                    المتابعة: {new Date(row.followupDueDate).toLocaleDateString("ar-EG")}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>

      <TableCell className="text-center">
        <WarehouseStockPopover
          itemId={row.itemId}
          displayUnit={displayUnit}
          trigger={
            <button
              className="group inline-flex items-center gap-1 hover:underline cursor-pointer"
              data-testid={`btn-stock-${row.itemId}`}
            >
              <span
                className={`font-semibold ${
                  row.totalQtyMinor === 0 ? "text-red-600" :
                  row.warehousesWithStock > 1 ? "text-blue-600" :
                  "text-gray-800"
                }`}
              >
                {row.qtyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
              </span>
              {unitLabel && <span className="text-xs text-gray-400">{unitLabel}</span>}
              {row.warehousesWithStock > 1 && (
                <span className="text-xs text-blue-400">({row.warehousesWithStock} مخازن)</span>
              )}
            </button>
          }
        />
      </TableCell>

      <TableCell className="text-center">
        <span className="font-bold text-gray-800">{row.requestCount}</span>
      </TableCell>

      <TableCell className="text-center">
        {row.recent7dRequests > 0 ? (
          <Badge variant="secondary" className="text-xs">
            {row.recent7dRequests}
          </Badge>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </TableCell>

      <TableCell className="text-center text-xs text-gray-500">
        {fmtDateAr(row.lastRequestedAt)}
      </TableCell>

      <TableCell className="text-center text-xs">
        {row.avgDailyDisplay > 0 ? (
          <span className="text-gray-700">
            {row.avgDailyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
            {unitLabel && <span className="text-gray-400"> {unitLabel}</span>}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </TableCell>

      <TableCell className="text-center">
        <CoveragePill days={row.daysOfCoverage} />
      </TableCell>

      <TableCell className="text-center">
        <StatusBadge flag={row.statusFlag} />
      </TableCell>

      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">

          {canManage && row.category !== "service" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkOrdered}
                  disabled={markingOrdered || ordered}
                  data-testid={`btn-order-${row.itemId}`}
                  className={`h-7 w-7 p-0 transition-colors ${
                    ordered
                      ? "text-green-600 bg-green-100 hover:bg-green-100 cursor-default rounded"
                      : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                  }`}
                >
                  {markingOrdered ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className={`h-4 w-4 ${ordered ? "fill-green-200" : ""}`} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-right max-w-52">
                {ordered && row.followupActionAt && row.followupDueDate ? (
                  <>
                    <div className="font-medium">مطلوب من الشركة</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      تم الطلب: {new Date(row.followupActionAt).toLocaleDateString("ar-EG")}
                    </div>
                    <div className="text-xs opacity-80">
                      المتابعة: {new Date(row.followupDueDate).toLocaleDateString("ar-EG")}
                    </div>
                  </>
                ) : (
                  "تم طلبه من الشركة"
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {canManage && row.category !== "service" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkReceived}
                  disabled={markingReceived}
                  data-testid={`btn-received-${row.itemId}`}
                  className="h-7 w-7 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                >
                  {markingReceived ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackageCheck className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>تم التوريد</TooltipContent>
            </Tooltip>
          )}

          {mode === "shortage_driven" && !row.isResolved ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResolve}
                  disabled={resolving}
                  data-testid={`btn-resolve-${row.itemId}`}
                  className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                >
                  {resolving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>تحديد كمحلول</TooltipContent>
            </Tooltip>
          ) : row.isResolved ? (
            <span className="text-xs text-gray-400">محلول</span>
          ) : null}

        </div>
      </TableCell>
    </TableRow>
  );
});
