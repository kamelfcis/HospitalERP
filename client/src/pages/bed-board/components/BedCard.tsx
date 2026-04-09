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

const STATUS_STYLES: Record<string, {
  bg: string;
  border: string;
  accent: string;
  text: string;
  pill: string;
  label: string;
}> = {
  EMPTY: {
    bg: "bg-emerald-50/80 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800/60",
    accent: "bg-emerald-500 dark:bg-emerald-600",
    text: "text-emerald-900 dark:text-emerald-100",
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    label: "متاح",
  },
  OCCUPIED: {
    bg: "bg-blue-50/80 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800/60",
    accent: "bg-blue-500 dark:bg-blue-600",
    text: "text-blue-900 dark:text-blue-100",
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    label: "مشغول",
  },
  NEEDS_CLEANING: {
    bg: "bg-amber-50/60 dark:bg-amber-950/25",
    border: "border-amber-200 dark:border-amber-800/50",
    accent: "bg-amber-400 dark:bg-amber-600",
    text: "text-amber-900 dark:text-amber-100",
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    label: "تنظيف",
  },
  MAINTENANCE: {
    bg: "bg-rose-50/60 dark:bg-rose-950/25",
    border: "border-rose-200 dark:border-rose-800/50",
    accent: "bg-rose-400 dark:bg-rose-600",
    text: "text-rose-900 dark:text-rose-100",
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    label: "صيانة",
  },
};

export function BedCard({ bed, onAction }: Props) {
  const s = STATUS_STYLES[bed.status] ?? STATUS_STYLES.EMPTY;
  const isOccupied = bed.status === "OCCUPIED";

  return (
    <div
      className={`relative ${s.bg} ${s.border} border rounded-xl shadow-sm hover:shadow transition-all duration-150 min-w-[120px] max-w-[160px] flex flex-col overflow-hidden`}
      data-testid={`bed-card-${bed.id}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${s.accent} rounded-t-xl`} />

      <div className="flex items-center justify-between px-2.5 pt-3 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <BedDouble className={`h-3.5 w-3.5 shrink-0 ${s.text} opacity-60`} />
          <span className={`font-bold text-sm leading-none tracking-tight truncate ${s.text}`}>
            {bed.bedNumber}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 focus-visible:ring-1"
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

      <div className="px-2.5 pb-1">
        <span className={`inline-block text-[9px] font-semibold rounded-full px-2 py-0.5 ${s.pill}`}>
          {s.label}
        </span>
      </div>

      {isOccupied && (bed.patientName || bed.admissionNumber) && (
        <div className="mx-2 mb-2 mt-0.5 rounded-lg bg-white/60 dark:bg-white/5 border border-blue-100 dark:border-blue-800/30 px-2 py-1.5 space-y-0.5">
          {bed.patientName && (
            <div className="flex items-center gap-1 min-w-0">
              <User className="h-2.5 w-2.5 shrink-0 text-blue-500 dark:text-blue-400 opacity-70" />
              <p className="text-[10px] font-semibold leading-tight truncate text-foreground" data-testid={`bed-patient-${bed.id}`}>
                {bed.patientName}
              </p>
            </div>
          )}
          {bed.admissionNumber && (
            <p className="text-[9px] font-mono text-muted-foreground ps-4 truncate" data-testid={`bed-admission-${bed.id}`}>
              {bed.admissionNumber}
            </p>
          )}
        </div>
      )}

      {!isOccupied && (
        <p className="px-2.5 pb-2 text-[9px] text-muted-foreground select-none">
          {bed.status === "EMPTY" && "جاهز للاستقبال"}
          {bed.status === "NEEDS_CLEANING" && "بانتظار التنظيف"}
          {bed.status === "MAINTENANCE" && "تحت الصيانة"}
        </p>
      )}
    </div>
  );
}
