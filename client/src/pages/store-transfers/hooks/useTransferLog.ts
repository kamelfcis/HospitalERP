import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Warehouse, StoreTransferWithDetails } from "@shared/schema";

export function useTransferLog() {
  const today = new Date().toISOString().split("T")[0];
  const [filterFromDate, setFilterFromDate] = useState(today);
  const [filterToDate, setFilterToDate] = useState(today);
  const [filterSourceWarehouse, setFilterSourceWarehouse] = useState("");
  const [filterDestWarehouse, setFilterDestWarehouse] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch.trim());
      setLogPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", logPage.toString());
    params.set("pageSize", logPageSize.toString());
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    if (filterSourceWarehouse && filterSourceWarehouse !== "all") params.set("sourceWarehouseId", filterSourceWarehouse);
    if (filterDestWarehouse && filterDestWarehouse !== "all") params.set("destWarehouseId", filterDestWarehouse);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  };

  const { data: transfersData, isLoading: transfersLoading } = useQuery<{
    data: StoreTransferWithDetails[];
    total: number;
  }>({
    queryKey: [
      "/api/transfers",
      logPage,
      filterFromDate,
      filterToDate,
      filterSourceWarehouse,
      filterDestWarehouse,
      filterStatus,
      debouncedSearch,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/transfers?${buildQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch transfers");
      return res.json();
    },
  });

  const transfers = transfersData?.data || [];
  const totalTransfers = transfersData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalTransfers / logPageSize));

  return {
    warehouses,
    transfers,
    transfersLoading,
    totalPages,
    logPage,
    setLogPage,
    filterFromDate,
    setFilterFromDate,
    filterToDate,
    setFilterToDate,
    filterSourceWarehouse,
    setFilterSourceWarehouse,
    filterDestWarehouse,
    setFilterDestWarehouse,
    filterStatus,
    setFilterStatus,
    filterSearch,
    setFilterSearch,
  };
}
