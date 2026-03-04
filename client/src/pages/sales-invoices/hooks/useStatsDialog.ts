import { useState } from "react";

export function useStatsDialog() {
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const openStats = async (itemId: string) => {
    setStatsItemId(itemId);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) setStatsData(await res.json());
    } catch {}
    setStatsLoading(false);
  };

  const closeStats = () => setStatsItemId(null);

  return { statsItemId, statsData, statsLoading, openStats, closeStats };
}
