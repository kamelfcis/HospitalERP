import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Warehouse } from "@shared/schema";
import type { PrepItem, PrepLine } from "../types";

export function useSetup(onDataLoaded: (items: PrepItem[]) => void) {
  const { toast } = useToast();

  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [queried, setQueried] = useState(false);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const queryEnabled =
    !!sourceWarehouseId && !!destWarehouseId && !!dateFrom && !!dateTo && sourceWarehouseId !== destWarehouseId;

  const { isFetching, refetch } = useQuery<PrepItem[]>({
    queryKey: ["/api/transfer-preparation/query", sourceWarehouseId, destWarehouseId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ sourceWarehouseId, destWarehouseId, dateFrom, dateTo });
      const res = await fetch(`/api/transfer-preparation/query?${params}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "خطأ في الاستعلام");
      }
      return res.json();
    },
    enabled: false,
    gcTime: 0,
  });

  const handleQuery = useCallback(async () => {
    if (!queryEnabled) {
      toast({ title: "تنبيه", description: "يرجى اختيار المخزنين والفترة", variant: "destructive" });
      return;
    }
    try {
      const result = await refetch();
      if (result.data) {
        onDataLoaded(result.data);
        setQueried(true);
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  }, [queryEnabled, refetch, toast, onDataLoaded]);

  const sourceName = warehouses?.find((w) => w.id === sourceWarehouseId)?.nameAr || "";
  const destName = warehouses?.find((w) => w.id === destWarehouseId)?.nameAr || "";

  return {
    sourceWarehouseId, setSourceWarehouseId,
    destWarehouseId, setDestWarehouseId,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    warehouses, queryEnabled, isFetching, handleQuery,
    queried, sourceName, destName,
  };
}
