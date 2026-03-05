/**
 * useStockStats — نافذة إحصاء أرصدة المخزون
 *
 * تُجلب بيانات صنف معين من كل المستودعات وتُعرض في StockStatsDialog.
 */
import { useState, useCallback } from "react";

export function useStockStats() {
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsData,   setStatsData]   = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const openStats = useCallback(async (itemId: string) => {
    setStatsItemId(itemId);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) setStatsData(await res.json());
    } catch {}
    setStatsLoading(false);
  }, []);

  return { statsItemId, setStatsItemId, statsData, statsLoading, openStats };
}
