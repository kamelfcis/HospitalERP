import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw, RefreshCw } from "lucide-react";

export interface HandoverFilters {
  from: string;
  to: string;
  cashierName: string;
  status: "all" | "open" | "closed";
}

interface FilterBarProps {
  filters: HandoverFilters;
  onApply: (filters: HandoverFilters) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function FilterBar({ filters, onApply, onRefresh, isLoading }: FilterBarProps) {
  const [draft, setDraft] = useState<HandoverFilters>(filters);

  const handleApply = () => onApply(draft);
  const handleReset = () => {
    const defaults: HandoverFilters = { from: todayISO(), to: todayISO(), cashierName: "", status: "all" };
    setDraft(defaults);
    onApply(defaults);
  };

  return (
    <div className="bg-card border rounded-lg p-4 mb-4" dir="rtl">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[130px]">
          <Label className="text-xs text-muted-foreground">من تاريخ</Label>
          <Input
            type="date"
            value={draft.from}
            onChange={e => setDraft(d => ({ ...d, from: e.target.value }))}
            data-testid="input-from-date"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[130px]">
          <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
          <Input
            type="date"
            value={draft.to}
            onChange={e => setDraft(d => ({ ...d, to: e.target.value }))}
            data-testid="input-to-date"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">الكاشير</Label>
          <Input
            placeholder="اسم الكاشير..."
            value={draft.cashierName}
            onChange={e => setDraft(d => ({ ...d, cashierName: e.target.value }))}
            data-testid="input-cashier-name"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">الحالة</Label>
          <Select
            value={draft.status}
            onValueChange={v => setDraft(d => ({ ...d, status: v as HandoverFilters["status"] }))}
          >
            <SelectTrigger data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="open">مفتوحة</SelectItem>
              <SelectItem value="closed">مغلقة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-end">
          <Button onClick={handleApply} disabled={isLoading} data-testid="button-apply-filters">
            <Search className="h-4 w-4 ml-1" />
            بحث
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isLoading} data-testid="button-reset-filters">
            <RotateCcw className="h-4 w-4 ml-1" />
            إعادة تعيين
          </Button>
          <Button variant="secondary" onClick={onRefresh} disabled={isLoading} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>
    </div>
  );
}
