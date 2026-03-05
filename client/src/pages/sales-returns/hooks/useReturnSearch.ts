import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReturnSearchResult } from "../types";

export type SearchMode = "invoiceNumber" | "receiptBarcode" | "itemBarcode" | "itemCode" | "item";

export function useReturnSearch() {
  const [searchMode, setSearchMode] = useState<SearchMode>("invoiceNumber");
  const [searchValue, setSearchValue] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  const canSearch =
    (searchMode === "invoiceNumber" && !!searchValue.trim()) ||
    (searchMode === "receiptBarcode" && !!searchValue.trim()) ||
    (searchMode === "itemBarcode" && !!searchValue.trim()) ||
    (searchMode === "itemCode" && !!searchValue.trim()) ||
    (searchMode === "item" && !!selectedItemId);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (searchMode === "invoiceNumber" && searchValue) params.set("invoiceNumber", searchValue);
    if (searchMode === "receiptBarcode" && searchValue) params.set("receiptBarcode", searchValue);
    if (searchMode === "itemBarcode" && searchValue) params.set("itemBarcode", searchValue);
    if (searchMode === "itemCode" && searchValue) params.set("itemCode", searchValue);
    if (searchMode === "item" && selectedItemId) params.set("itemId", selectedItemId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (warehouseId) params.set("warehouseId", warehouseId);
    const qs = params.toString();
    return qs ? `/api/sales-returns/search?${qs}` : null;
  }, [searchMode, searchValue, selectedItemId, dateFrom, dateTo, warehouseId]);

  const { data: results = [], isLoading } = useQuery<ReturnSearchResult[]>({
    queryKey: [submittedUrl],
    enabled: !!submittedUrl,
    staleTime: 0,
  });

  const triggerSearch = useCallback(() => {
    if (canSearch) {
      const url = buildUrl();
      setSubmittedUrl(url);
    }
  }, [canSearch, buildUrl]);

  const resetSearch = useCallback(() => {
    setSearchValue("");
    setSelectedItemId(null);
    setSelectedItemName("");
    setDateFrom("");
    setDateTo("");
    setSubmittedUrl(null);
  }, []);

  return {
    searchMode, setSearchMode,
    searchValue, setSearchValue,
    selectedItemId, setSelectedItemId,
    selectedItemName, setSelectedItemName,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    warehouseId, setWarehouseId,
    results, isLoading,
    canSearch, triggerSearch, resetSearch,
  };
}
