import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import type { PurchaseTransaction } from "@shared/schema";
import type { ItemWithFormType, AvgSalesResponse } from "../types";
import { useItemForm } from "./useItemForm";
import { useItemDeptPrices } from "./useItemDeptPrices";
import { useItemBarcodes } from "./useItemBarcodes";
import { useItemDialogs } from "./useItemDialogs";

export function useItemCard() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/items/:id");
  const isNew = params?.id === "new";
  const itemId = isNew ? null : (params?.id ?? null);

  const [isEditing, setIsEditing] = useState(isNew);
  const [salesPeriod, setSalesPeriod] = useState("3");
  const [purchaseFromDate, setPurchaseFromDate] = useState("");

  const { data: item, isLoading } = useQuery<ItemWithFormType>({
    queryKey: ["/api/items", itemId],
    enabled: !!itemId,
  });

  const dialogs = useItemDialogs();

  const form = useItemForm({
    itemId,
    isNew,
    item,
    formTypes: dialogs.formTypes,
    uoms: dialogs.uoms,
    refetchFormTypes: dialogs.refetchFormTypes,
    refetchUoms: dialogs.refetchUoms,
    onSaveSuccess: () => {
      if (isNew) navigate("/items");
      else setIsEditing(false);
    },
  });

  const deptPrices = useItemDeptPrices(itemId);
  const barcodes = useItemBarcodes(itemId);

  const purchaseFromDateFull = purchaseFromDate ? `${purchaseFromDate}-01` : "";

  const { data: lastPurchases } = useQuery<PurchaseTransaction[]>({
    queryKey: ["/api/items", itemId, "last-purchases", purchaseFromDateFull],
    queryFn: async () => {
      const url = purchaseFromDateFull
        ? `/api/items/${itemId}/last-purchases?fromDate=${purchaseFromDateFull}`
        : `/api/items/${itemId}/last-purchases`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!itemId,
  });

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = now.toISOString().split("T")[0];
    const start = new Date(now);
    start.setMonth(start.getMonth() - parseInt(salesPeriod));
    return { startDate: start.toISOString().split("T")[0], endDate: end };
  }, [salesPeriod]);

  const { data: avgSales } = useQuery<AvgSalesResponse>({
    queryKey: ["/api/items", itemId, "avg-sales", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/items/${itemId}/avg-sales?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!itemId,
  });

  return {
    isNew,
    itemId,
    isEditing,
    setIsEditing,
    item,
    isLoading,
    navigate,

    lastPurchases,
    avgSales,
    salesPeriod, setSalesPeriod,
    purchaseFromDate, setPurchaseFromDate,

    ...form,
    ...deptPrices,
    ...barcodes,
    ...dialogs,
  };
}
