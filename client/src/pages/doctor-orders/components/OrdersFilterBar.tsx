import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import type { OrderStatusFilter, OrderTypeFilter } from "../types";

interface Props {
  statusFilter: OrderStatusFilter;
  typeFilter: OrderTypeFilter;
  onStatusChange: (v: OrderStatusFilter) => void;
  onTypeChange: (v: OrderTypeFilter) => void;
  onRefresh: () => void;
  totalCount: number;
  pendingCount: number;
}

export function OrdersFilterBar({ statusFilter, typeFilter, onStatusChange, onTypeChange, onRefresh, totalCount, pendingCount }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex gap-1">
        {(["all", "pending", "executed", "cancelled"] as OrderStatusFilter[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => onStatusChange(s)}
            data-testid={`filter-status-${s}`}
          >
            {s === "all" ? "الكل" : s === "pending" ? `معلق (${pendingCount})` : s === "executed" ? "منفذ" : "ملغي"}
          </Button>
        ))}
      </div>

      <Select value={typeFilter} onValueChange={(v) => onTypeChange(v as OrderTypeFilter)}>
        <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الأنواع</SelectItem>
          <SelectItem value="service">خدمات</SelectItem>
          <SelectItem value="pharmacy">أدوية/صيدلية</SelectItem>
        </SelectContent>
      </Select>

      <div className="mr-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{totalCount} نتيجة</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRefresh} data-testid="button-refresh-orders">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
