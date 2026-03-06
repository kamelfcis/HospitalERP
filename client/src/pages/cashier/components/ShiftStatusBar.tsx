import { LogOut, Building2, FlaskConical, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import type { CashierShift } from "../types";

interface ShiftStatusBarProps {
  activeShift: CashierShift;
  unitName: string;
  unitType: string;
  onCloseShift: () => void;
  isClosing?: boolean;
}

export function ShiftStatusBar({ activeShift, unitName, unitType, onCloseShift, isClosing }: ShiftStatusBarProps) {
  return (
    <div className="flex flex-row-reverse items-center justify-between gap-3 flex-wrap">
      <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
        <Badge className="text-[10px] px-1.5 py-0 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
          وردية مفتوحة
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate" data-testid="text-shift-unit">
          {unitType === "department" ? <Building2 className="h-2.5 w-2.5 ml-1 inline" /> : <FlaskConical className="h-2.5 w-2.5 ml-1 inline" />}
          {unitName}
        </Badge>
        <span className="text-xs" data-testid="text-shift-cashier-name">
          الكاشير: {activeShift.cashierName}
        </span>
        <span className="text-xs text-muted-foreground">
          رصيد الافتتاح: {formatNumber(activeShift.openingCash)}
        </span>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={onCloseShift}
        disabled={isClosing}
        data-testid="button-close-shift"
      >
        {isClosing
          ? <Loader2 className="ml-1 h-3 w-3 animate-spin" />
          : <LogOut className="ml-1 h-3 w-3" />}
        إغلاق الوردية
      </Button>
    </div>
  );
}
