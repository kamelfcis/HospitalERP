/*
 * TreasurySelector — مكوّن مشترك لاختيار الخزنة
 * ─────────────────────────────────────────────────
 * • أدمن/مالك → قائمة منسدلة بجميع الخزن النشطة
 * • موظف + خزنة مخصصة → شارة للقراءة فقط
 * • موظف بدون خزنة → نص "لا توجد خزنة مخصصة"
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
  label = "الخزنة:",
  selectedTreasuryId,
  setSelectedTreasuryId,
  isAdmin,
  myTreasury,
  allTreasuries,
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

  // أدمن / مالك → قائمة منسدلة كاملة
  if (isAdmin) {
    return (
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        <Select value={selectedTreasuryId} onValueChange={setSelectedTreasuryId}>
          <SelectTrigger className="h-7 w-[180px] text-xs" data-testid="select-treasury">
            <SelectValue placeholder="بدون ربط بخزنة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون ربط بخزنة</SelectItem>
            {allTreasuries.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // موظف مع خزنة مخصصة → شارة للقراءة فقط
  if (myTreasury?.id) {
    return (
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {myTreasury.name}
        </Badge>
      </div>
    );
  }

  // موظف بدون خزنة مخصصة
  return (
    <div className="flex items-center gap-1">
      <Label className="text-xs">{label}</Label>
      <span className="text-xs text-muted-foreground">لا توجد خزنة مخصصة</span>
    </div>
  );
}
