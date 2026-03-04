import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BedDouble, MoreVertical, UserPlus, FileText,
  ArrowRightLeft, LogOut, Sparkles, Wrench,
} from "lucide-react";
import type { BedData } from "../types";
import { STATUS_CONFIG } from "../types";

interface Props {
  bed: BedData;
  onAction: (action: string, bed: BedData) => void;
}

export function BedCard({ bed, onAction }: Props) {
  const cfg = STATUS_CONFIG[bed.status];

  return (
    <div
      className={`relative border rounded-lg p-3 w-40 shadow-sm transition-shadow hover:shadow-md ${cfg.card}`}
      data-testid={`bed-card-${bed.id}`}
    >
      {/* Header row: number + menu */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <BedDouble className="h-4 w-4 opacity-60" />
          <span className="font-bold text-sm">{bed.bedNumber}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full"
              data-testid={`bed-menu-${bed.id}`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {bed.status === "EMPTY" && (
              <DropdownMenuItem
                data-testid={`bed-action-admit-${bed.id}`}
                onClick={() => onAction("admit", bed)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
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
                  <FileText className="h-4 w-4" />
                  فتح الفاتورة
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`bed-action-transfer-${bed.id}`}
                  onClick={() => onAction("transfer", bed)}
                  className="gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  تحويل لسرير آخر
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid={`bed-action-discharge-${bed.id}`}
                  onClick={() => onAction("discharge", bed)}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
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
                <Sparkles className="h-4 w-4" />
                تعليم كنظيف
              </DropdownMenuItem>
            )}

            {(bed.status === "EMPTY" || bed.status === "NEEDS_CLEANING") && (
              <DropdownMenuItem
                data-testid={`bed-action-maintenance-${bed.id}`}
                onClick={() => onAction("maintenance", bed)}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" />
                وضع في صيانة
              </DropdownMenuItem>
            )}

            {bed.status === "MAINTENANCE" && (
              <DropdownMenuItem
                data-testid={`bed-action-clear-maintenance-${bed.id}`}
                onClick={() => onAction("clean", bed)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                إنهاء الصيانة
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status badge */}
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.badge}`}>
        {cfg.label}
      </Badge>

      {/* Patient info */}
      {bed.patientName && (
        <p
          className="text-xs mt-1.5 font-medium truncate"
          data-testid={`bed-patient-${bed.id}`}
        >
          {bed.patientName}
        </p>
      )}
      {bed.admissionNumber && (
        <p
          className="text-[10px] text-muted-foreground mt-0.5"
          data-testid={`bed-admission-${bed.id}`}
        >
          {bed.admissionNumber}
        </p>
      )}
    </div>
  );
}
