import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BedDouble, MoreVertical, UserPlus, FileText,
  ArrowRightLeft, LogOut, Sparkles, Wrench, User,
} from "lucide-react";
import type { BedData } from "../types";

interface Props {
  bed: BedData;
  onAction: (action: string, bed: BedData) => void;
}

const GRADIENT: Record<string, string> = {
  EMPTY:          "from-emerald-400 to-emerald-600",
  OCCUPIED:       "from-blue-500 to-indigo-700",
  NEEDS_CLEANING: "from-amber-400 to-orange-500",
  MAINTENANCE:    "from-red-400 to-rose-600",
};

const STATUS_LABEL: Record<string, string> = {
  EMPTY:          "متاح",
  OCCUPIED:       "مشغول",
  NEEDS_CLEANING: "تنظيف",
  MAINTENANCE:    "صيانة",
};

export function BedCard({ bed, onAction }: Props) {
  const gradient = GRADIENT[bed.status];
  const isOccupied = bed.status === "OCCUPIED";

  return (
    <div
      className={`relative bg-gradient-to-br ${gradient} text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 min-w-[120px] max-w-[160px] flex flex-col`}
      data-testid={`bed-card-${bed.id}`}
    >
      {/* Top row: bed number + menu */}
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
        <div className="flex items-center gap-1 min-w-0">
          <BedDouble className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="font-extrabold text-sm leading-none tracking-tight truncate">
            {bed.bedNumber}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full shrink-0 text-white/80 hover:text-white hover:bg-white/20 focus-visible:ring-1 focus-visible:ring-white"
              aria-label={`قائمة السرير ${bed.bedNumber}`}
              data-testid={`bed-menu-${bed.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {bed.status === "EMPTY" && (
              <DropdownMenuItem onClick={() => onAction("admit", bed)} className="gap-2" data-testid={`bed-action-admit-${bed.id}`}>
                <UserPlus className="h-4 w-4" /> استقبال مريض
              </DropdownMenuItem>
            )}
            {bed.status === "OCCUPIED" && (
              <>
                <DropdownMenuItem onClick={() => onAction("invoice", bed)} className="gap-2" data-testid={`bed-action-invoice-${bed.id}`}>
                  <FileText className="h-4 w-4" /> فتح الفاتورة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("transfer", bed)} className="gap-2" data-testid={`bed-action-transfer-${bed.id}`}>
                  <ArrowRightLeft className="h-4 w-4" /> تحويل لسرير آخر
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction("discharge", bed)} className="gap-2 text-destructive focus:text-destructive" data-testid={`bed-action-discharge-${bed.id}`}>
                  <LogOut className="h-4 w-4" /> خروج المريض
                </DropdownMenuItem>
              </>
            )}
            {bed.status === "NEEDS_CLEANING" && (
              <DropdownMenuItem onClick={() => onAction("clean", bed)} className="gap-2" data-testid={`bed-action-clean-${bed.id}`}>
                <Sparkles className="h-4 w-4" /> تعليم كنظيف
              </DropdownMenuItem>
            )}
            {(bed.status === "EMPTY" || bed.status === "NEEDS_CLEANING") && (
              <DropdownMenuItem onClick={() => onAction("maintenance", bed)} className="gap-2" data-testid={`bed-action-maintenance-${bed.id}`}>
                <Wrench className="h-4 w-4" /> وضع في صيانة
              </DropdownMenuItem>
            )}
            {bed.status === "MAINTENANCE" && (
              <DropdownMenuItem onClick={() => onAction("clean", bed)} className="gap-2" data-testid={`bed-action-clear-maintenance-${bed.id}`}>
                <Sparkles className="h-4 w-4" /> إنهاء الصيانة
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status pill */}
      <div className="px-2.5 pb-1">
        <span className="inline-block text-[9px] font-semibold bg-white/20 rounded-full px-2 py-0.5">
          {STATUS_LABEL[bed.status]}
        </span>
      </div>

      {/* Patient info (occupied only) */}
      {isOccupied && (bed.patientName || bed.admissionNumber) && (
        <div className="mx-2 mb-2 mt-0.5 rounded-lg bg-white/15 px-2 py-1.5 space-y-0.5">
          {bed.patientName && (
            <div className="flex items-center gap-1 min-w-0">
              <User className="h-2.5 w-2.5 shrink-0 opacity-80" />
              <p className="text-[10px] font-semibold leading-tight truncate" data-testid={`bed-patient-${bed.id}`}>
                {bed.patientName}
              </p>
            </div>
          )}
          {bed.admissionNumber && (
            <p className="text-[9px] font-mono opacity-70 ps-4 truncate" data-testid={`bed-admission-${bed.id}`}>
              {bed.admissionNumber}
            </p>
          )}
        </div>
      )}

      {/* Hint for non-occupied */}
      {!isOccupied && (
        <p className="px-2.5 pb-2 text-[9px] opacity-60 select-none">
          {bed.status === "EMPTY" && "جاهز للاستقبال"}
          {bed.status === "NEEDS_CLEANING" && "بانتظار التنظيف"}
          {bed.status === "MAINTENANCE" && "تحت الصيانة"}
        </p>
      )}
    </div>
  );
}
