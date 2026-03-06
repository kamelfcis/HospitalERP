import { useQueries } from "@tanstack/react-query";
import { Package, AlertCircle } from "lucide-react";
import { type ServiceLine } from "./ServicesGrid";

interface Props {
  serviceLines: ServiceLine[];
}

export function ConsumablesPanel({ serviceLines }: Props) {
  const queries = useQueries({
    queries: serviceLines.map(line => ({
      queryKey: ["/api/services", line.serviceId, "consumables"],
      queryFn: async () => {
        const res = await fetch(`/api/services/${line.serviceId}/consumables`);
        if (!res.ok) return [];
        const json = await res.json();
        return (Array.isArray(json) ? json : []).map((c: any) => ({
          ...c,
          forService: line.serviceName,
          forQty: line.quantity,
        }));
      },
      enabled: !!line.serviceId,
      staleTime: 30000,
    })),
  });

  const allConsumables = queries.flatMap(q => q.data || []);
  const isLoading = queries.some(q => q.isLoading);

  if (!serviceLines.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4">
        <div className="text-center">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <span>أضف خدمات لعرض المستهلكات</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="font-semibold text-xs text-muted-foreground px-1 mb-1 flex items-center gap-1">
        <Package className="h-3.5 w-3.5" />
        المستهلكات ({allConsumables.length})
      </h4>

      {isLoading && (
        <div className="text-xs text-muted-foreground text-center py-2">جارٍ التحميل...</div>
      )}

      {!isLoading && allConsumables.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-3">لا توجد مستهلكات مرتبطة</div>
      )}

      <div className="max-h-[280px] overflow-auto space-y-0.5">
        {allConsumables.map((c: any, i: number) => {
          const consumeQty = parseFloat(String(c.quantity || 0)) * (c.forQty || 1);
          return (
            <div
              key={`${c.itemId || c.item_id}-${i}`}
              className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/40 hover:bg-muted/60"
            >
              <div className="flex-1 min-w-0">
                <span className="block truncate font-medium">{c.itemNameAr || c.item_name_ar || c.itemName || "—"}</span>
                <span className="text-[10px] text-muted-foreground">{c.forService}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 mr-2">
                <span className="tabular-nums">{consumeQty}</span>
                <span className="text-muted-foreground">{c.unitLevel || c.unit_level || "minor"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
