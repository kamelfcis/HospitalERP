// ============================================================
//  hook إدارة البحث عن فاتورة مبيعات للإرجاع
// ============================================================
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
  // الـ URL يُحفظ فقط عند الضغط على "بحث" — لا بحث تلقائي
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  // هل يمكن تنفيذ البحث بالوضع الحالي؟
  const canSearch =
    (["invoiceNumber", "receiptBarcode", "itemBarcode", "itemCode"].includes(searchMode) && !!searchValue.trim()) ||
    (searchMode === "item" && !!selectedItemId);

  const buildSearchUrl = useCallback((): string | null => {
    const params = new URLSearchParams();
    if (searchMode === "invoiceNumber" && searchValue)  params.set("invoiceNumber", searchValue);
    if (searchMode === "receiptBarcode" && searchValue) params.set("receiptBarcode", searchValue);
    if (searchMode === "itemBarcode" && searchValue)    params.set("itemBarcode", searchValue);
    if (searchMode === "itemCode" && searchValue)       params.set("itemCode", searchValue);
    if (searchMode === "item" && selectedItemId)        params.set("itemId", selectedItemId);
    if (dateFrom)    params.set("dateFrom", dateFrom);
    if (dateTo)      params.set("dateTo", dateTo);
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
    if (canSearch) setSubmittedUrl(buildSearchUrl());
  }, [canSearch, buildSearchUrl]);

  const resetSearch = useCallback(() => {
    setSearchValue("");
    setSelectedItemId(null);
    setSelectedItemName("");
    setDateFrom("");
    setDateTo("");
    setSubmittedUrl(null);
  }, []);

  const changeMode = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
    setSearchValue("");
    setSelectedItemId(null);
    setSelectedItemName("");
  }, []);

  return {
    searchMode, setSearchMode: changeMode,
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
