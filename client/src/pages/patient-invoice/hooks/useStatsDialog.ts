import { useState, useCallback } from "react";

/**
 * يدير حوار أرصدة المخازن للصنف المحدد.
 */
export function useStatsDialog() {
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsItemName, setStatsItemName] = useState("");
  const [statsData, setStatsData] = useState<any[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const openStatsPopup = useCallback(async (itemId: string, itemName: string) => {
    setStatsItemId(itemId);
    setStatsItemName(itemName);
    setStatsData(null);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) setStatsData(await res.json());
    } catch {
      // non-critical: show empty state
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const closeStatsDialog = useCallback(() => {
    setStatsItemId(null);
    setStatsData(null);
  }, []);

  return {
    statsItemId, statsItemName,
    statsData, statsLoading,
    openStatsPopup,
    closeStatsDialog,
  };
}
