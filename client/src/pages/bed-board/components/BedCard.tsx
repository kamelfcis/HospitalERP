import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BedDouble, MoreVertical, UserPlus, FileText,
  ArrowRightLeft, LogOut, Sparkles, Wrench,
  User,
} from "lucide-react";
import type { BedData } from "../types";
import { STATUS_CONFIG } from "../types";

interface Props {
  bed: BedData;
  onAction: (action: string, bed: BedData) => void;
}

// Top-border accent color per status (RTL-neutral — top edge signals state instantly)
const ACCENT: Record<string, string> = {
  OCCUPIED:       "border-t-blue-500",
  EMPTY:          "border-t-green-500",
  NEEDS_CLEANING: "border-t-amber-500",
  MAINTENANCE:    "border-t-red-500",
};

// Subtle hint text for non-occupied states
const HINT: Record<string, string> = {
  EMPTY:          "متاح للاستقبال",
  NEEDS_CLEANING: "بانتظار التنظيف",
  MAINTENANCE:    "تحت الصيانة",
};

export function BedCard({ bed, onAction }: Props) {
  const cfg     = STATUS_CONFIG[bed.status];
  const accent  = ACCENT[bed.status];
  const isOccupied = bed.status === "OCCUPIED";

  return (
    <div
      className={[
        "relative flex flex-col border border-t-4 rounded-xl w-52 min-h-[110px]",
        "shadow-sm transition-all duration-150 hover:shadow-md hover:-translate-y-px",
        cfg.card,
        accent,
      ].join(" ")}
      data-testid={`bed-card-${bed.id}`}
    >
      {/* ── Top row: bed label + menu ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <BedDouble className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          <span className="font-extrabold text-base leading-none tracking-tight truncate">
            {bed.bedNumber}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              aria-label={`قائمة السرير ${bed.bedNumber}`}
              data-testid={`bed-menu-${bed.id}`}
            >
              <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            {bed.status === "EMPTY" && (
              <DropdownMenuItem
                data-testid={`bed-action-admit-${bed.id}`}
                onClick={() => onAction("admit", bed)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                استقبال مريض
              </DropdownMenuItem>
            )}

            {bed.status === "OCCUPIED" && (
              <>
                <DropdownMenuItem
                  data-testid={`bed-action-invoice-${bed.id}`}
                  onClick={() => onAction("invoice", bed)}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  فتح الفاتورة
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`bed-action-transfer-${bed.id}`}
                  onClick={() => onAction("transfer", bed)}
                  className="gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                  تحويل لسرير آخر
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid={`bed-action-discharge-${bed.id}`}
                  onClick={() => onAction("discharge", bed)}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  خروج المريض
                </DropdownMenuItem>
              </>
            )}

            {bed.status === "NEEDS_CLEANING" && (
              <DropdownMenuItem
                data-testid={`bed-action-clean-${bed.id}`}
                onClick={() => onAction("clean", bed)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                تعليم كنظيف
              </DropdownMenuItem>
            )}

            {(bed.status === "EMPTY" || bed.status === "NEEDS_CLEANING") && (
              <DropdownMenuItem
                data-testid={`bed-action-maintenance-${bed.id}`}
                onClick={() => onAction("maintenance", bed)}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" aria-hidden="true" />
                وضع في صيانة
              </DropdownMenuItem>
            )}

            {bed.status === "MAINTENANCE" && (
              <DropdownMenuItem
                data-testid={`bed-action-clear-maintenance-${bed.id}`}
                onClick={() => onAction("clean", bed)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                إنهاء الصيانة
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Status badge ──────────────────────────────────────────────────── */}
      <div className="px-3 pb-2">
        <Badge
          variant="outline"
          className={`text-[10px] px-2 py-0.5 font-semibold rounded-full ${cfg.badge}`}
        >
          {cfg.label}
        </Badge>
      </div>

      {/* ── Patient block (occupied only) ──────────────────────────────────── */}
      {isOccupied && (bed.patientName || bed.admissionNumber) && (
        <div className="mx-2 mb-2.5 mt-auto rounded-lg bg-white/50 dark:bg-white/5 border border-blue-200/60 dark:border-blue-700/40 px-2.5 py-2 space-y-0.5">
          {bed.patientName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400 opacity-70" aria-hidden="true" />
              <p
                className="text-xs font-semibold leading-tight truncate"
                data-testid={`bed-patient-${bed.id}`}
              >
                {bed.patientName}
              </p>
            </div>
          )}
          {bed.admissionNumber && (
            <p
              className="text-[10px] font-mono text-muted-foreground ps-5"
              data-testid={`bed-admission-${bed.id}`}
            >
              {bed.admissionNumber}
            </p>
          )}
        </div>
      )}

      {/* ── Hint text for non-occupied states ─────────────────────────────── */}
      {!isOccupied && (
        <p className="px-3 pb-3 mt-auto text-[10px] text-muted-foreground opacity-70 select-none">
          {HINT[bed.status]}
        </p>
      )}
    </div>
  );
}
