import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReturnSearchResult } from "../types";

export type SearchMode = "invoiceNumber" | "receiptBarcode" | "item";

export function useReturnSearch() {
  const [searchMode, setSearchMode] = useState<SearchMode>("invoiceNumber");
  const [searchValue, setSearchValue] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (searchMode === "invoiceNumber" && searchValue) params.set("invoiceNumber", searchValue);
    if (searchMode === "receiptBarcode" && searchValue) params.set("receiptBarcode", searchValue);
    if (searchMode === "item" && selectedItemId) params.set("itemId", selectedItemId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (warehouseId) params.set("warehouseId", warehouseId);
    return params.toString();
  }, [searchMode, searchValue, selectedItemId, dateFrom, dateTo, warehouseId]);

  const canSearch =
    (searchMode === "invoiceNumber" && !!searchValue.trim()) ||
    (searchMode === "receiptBarcode" && !!searchValue.trim()) ||
    (searchMode === "item" && !!selectedItemId);

  const queryString = buildParams();
  const fullUrl = queryString ? `/api/sales-returns/search?${queryString}` : "/api/sales-returns/search";

  const { data: results = [], isLoading, refetch } = useQuery<ReturnSearchResult[]>({
    queryKey: [fullUrl],
    enabled: searchTriggered && canSearch,
  });

  const triggerSearch = useCallback(() => {
    if (canSearch) {
      setSearchTriggered(true);
      refetch();
    }
  }, [canSearch, refetch]);

  const resetSearch = useCallback(() => {
    setSearchValue("");
    setSelectedItemId(null);
    setSelectedItemName("");
    setDateFrom("");
    setDateTo("");
    setSearchTriggered(false);
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
