import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableHead, TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2, ChevronUp, ChevronDown,
  Warehouse, PackageX, ArrowLeftRight, Flame, TrendingDown, Loader2,
} from "lucide-react";
import type { DisplayUnit, SortDir, WarehouseStockRow } from "./types";

export const STATUS_META: Record<string, { label: string; color: string; icon: typeof PackageX }> = {
  not_available:      { label: "غير متوفر",       color: "bg-red-100 text-red-700 border-red-200",     icon: PackageX },
  available_elsewhere:{ label: "متوفر بمخزن آخر",  color: "bg-blue-100 text-blue-700 border-blue-200",  icon: ArrowLeftRight },
  high_demand:        { label: "ضغط عالٍ",         color: "bg-orange-100 text-orange-700 border-orange-200", icon: Flame },
  low_stock:          { label: "مخزون منخفض",     color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: TrendingDown },
  normal:             { label: "طبيعي",            color: "bg-green-100 text-green-700 border-green-200",  icon: CheckCircle2 },
};

export function StatusBadge({ flag }: { flag: string }) {
  const meta = STATUS_META[flag] ?? STATUS_META.normal;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function CoveragePill({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">—</span>;
  const color =
    days < 7  ? "text-red-600 font-bold" :
    days < 14 ? "text-orange-500 font-semibold" :
    days < 30 ? "text-yellow-600" :
                "text-green-600";
  return <span className={`text-sm ${color}`}>{days.toFixed(1)} يوم</span>;
}

export function WarehouseStockPopover({
  itemId,
  displayUnit,
  trigger,
}: {
  itemId:      string;
  displayUnit: DisplayUnit;
  trigger:     React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<WarehouseStockRow[]>({
    queryKey: [`/api/shortage/item/${itemId}/stock?displayUnit=${displayUnit}`],
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          رصيد المخازن
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">لا يوجد رصيد في أي مخزن</p>
        ) : (
          <div className="space-y-1">
            {data.map((w) => (
              <div key={w.warehouseId} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{w.warehouseName}</span>
                <span className="font-semibold">
                  {w.qtyDisplay.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                  {w.displayUnit ? ` ${w.displayUnit}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SortTh({
  col, current, dir, label, onSort, className = "",
}: {
  col: string; current: string; dir: SortDir;
  label: string; onSort: (c: string) => void; className?: string;
}) {
  const active = current === col;
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-20" />
        )}
      </span>
    </TableHead>
  );
}

export function fmtDateAr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function todayStr()    { return new Date().toISOString().slice(0, 10); }
export function ago30dayStr() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
