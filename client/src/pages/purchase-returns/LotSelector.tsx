import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvailableLot } from "./types";

interface Props {
  itemId: string;
  warehouseId: string;
  value: string;
  onChange: (v: string) => void;
}

export function LotSelector({ itemId, warehouseId, value, onChange }: Props) {
  const { data: lots = [], isLoading } = useQuery<AvailableLot[]>({
    queryKey: ["/api/purchase-returns/lots", itemId, warehouseId],
    queryFn: () =>
      fetch(`/api/purchase-returns/lots?itemId=${itemId}&warehouseId=${warehouseId}`)
        .then(r => r.json()),
    enabled: !!(itemId && warehouseId),
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || lots.length === 0}>
      <SelectTrigger className="h-8 text-xs" data-testid={`lot-select-${itemId}`}>
        <SelectValue
          placeholder={
            isLoading ? "جارٍ التحميل…" :
            lots.length === 0 ? "لا توجد كميات" :
            "اختر اللوت"
          }
        />
      </SelectTrigger>
      <SelectContent>
        {lots.map(l => (
          <SelectItem key={l.id} value={l.id}>
            {l.expiryDate
              ? `ت.انتهاء: ${l.expiryDate} | متاح: ${parseFloat(l.qtyInMinor).toFixed(2)}`
              : `بدون تاريخ | متاح: ${parseFloat(l.qtyInMinor).toFixed(2)}`
            }
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
