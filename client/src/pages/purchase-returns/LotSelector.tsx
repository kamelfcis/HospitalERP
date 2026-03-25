import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvailableLot } from "./types";

interface Props {
  itemId:      string;
  warehouseId: string;
  isFreeItem:  boolean;   // true = show free/bonus lots only; false = paid lots only
  value:       string;
  onChange:    (v: string) => void;
}

export function LotSelector({ itemId, warehouseId, isFreeItem, value, onChange }: Props) {
  // isFreeItem comes from line.isFreeItem which was derived from the server's
  // invoice line data (purchasePrice = 0 → free).  We send it to the API as a
  // strict "true"/"false" string — the API rejects any other value with 400.
  const isFreeStr = isFreeItem ? "true" : "false";

  const { data: lots = [], isLoading } = useQuery<AvailableLot[]>({
    queryKey: ["/api/purchase-returns/lots", itemId, warehouseId, isFreeStr],
    queryFn: () =>
      fetch(
        `/api/purchase-returns/lots?itemId=${encodeURIComponent(itemId)}&warehouseId=${encodeURIComponent(warehouseId)}&isFreeItem=${isFreeStr}`
      ).then(async r => {
        if (!r.ok) throw new Error((await r.json()).message ?? "خطأ في تحميل اللوتات");
        return r.json();
      }),
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
