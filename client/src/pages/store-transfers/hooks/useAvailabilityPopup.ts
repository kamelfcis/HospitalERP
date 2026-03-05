import { useState, useCallback, useRef } from "react";

export function useAvailabilityPopup() {
  const [availPopupItemId, setAvailPopupItemId] = useState<string | null>(null);
  const [availPopupData, setAvailPopupData] = useState<any[] | null>(null);
  const [availPopupLoading, setAvailPopupLoading] = useState(false);
  const [availPopupPosition, setAvailPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const availPopupCache = useRef<Record<string, { data: any[]; ts: number }>>({});

  const showAvailabilityPopup = useCallback(async (itemId: string, _item: any, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setAvailPopupPosition({ top: rect.bottom + 4, left: rect.left });
    setAvailPopupItemId(itemId);

    const cached = availPopupCache.current[itemId];
    if (cached && Date.now() - cached.ts < 60000) {
      setAvailPopupData(cached.data);
      return;
    }

    setAvailPopupLoading(true);
    setAvailPopupData(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/items/${itemId}/availability-summary?asOfDate=${today}&excludeExpired=1`);
      if (res.ok) {
        const data = await res.json();
        setAvailPopupData(data);
        availPopupCache.current[itemId] = { data, ts: Date.now() };
      }
    } catch {
      setAvailPopupData([]);
    } finally {
      setAvailPopupLoading(false);
    }
  }, []);

  const closeAvailPopup = useCallback(() => {
    setAvailPopupItemId(null);
    setAvailPopupData(null);
    setAvailPopupPosition(null);
  }, []);

  return {
    availPopupItemId,
    availPopupData,
    availPopupLoading,
    availPopupPosition,
    showAvailabilityPopup,
    closeAvailPopup,
  };
}
