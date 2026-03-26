/*
 * TreasurySelector — مكوّن مشترك لاختيار الخزنة / الوردية
 * ──────────────────────────────────────────────────────────
 * • غير أدمن + وردية مفتوحة → شارة للقراءة فقط (خزنته الشخصية)
 * • أدمن → قائمة منسدلة بجميع الورديات المفتوحة
 * • غير أدمن بدون وردية → نص "لا توجد وردية مفتوحة"
 */

import { Badge }  from "@/components/ui/badge";
import { Label }  from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { TreasurySelectorState } from "@/hooks/use-treasury-selector";

interface Props extends TreasurySelectorState {
  label?: string;
}

export function TreasurySelector({
  label = "الخزنة / الوردية:",
  selectedShiftId,
  setSelectedShiftId,
  isAdmin,
  myShift,
  allShifts,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // أدمن → قائمة منسدلة كاملة
  if (isAdmin) {
    return (
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
          <SelectTrigger className="h-7 w-[200px] text-xs" data-testid="select-shift">
            <SelectValue placeholder="بدون ربط بوردية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون ربط بوردية</SelectItem>
            {allShifts.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.pharmacy_name ? `${s.pharmacy_name} — ` : ""}وردية #{s.shift_number} ({s.cashier_name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // غير أدمن مع وردية مفتوحة → شارة للقراءة فقط
  if (myShift?.id) {
    const label2 = myShift.pharmacyName
      ? `${myShift.pharmacyName} — وردية #${myShift.shiftNumber}`
      : `وردية #${myShift.shiftNumber}`;
    return (
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {label2}
        </Badge>
      </div>
    );
  }

  // غير أدمن بدون وردية
  return (
    <div className="flex items-center gap-1">
      <Label className="text-xs">{label}</Label>
      <span className="text-xs text-muted-foreground">لا توجد وردية مفتوحة</span>
    </div>
  );
}
