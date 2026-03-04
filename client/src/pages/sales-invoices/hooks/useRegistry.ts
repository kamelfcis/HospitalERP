import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesInvoiceWithDetails } from "@shared/schema";

export function useRegistry(today: string, enabled: boolean) {
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCustomerType, setFilterCustomerType] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  const buildQuery = () => {
    const p = new URLSearchParams();
    p.set("page", page.toString());
    p.set("pageSize", pageSize.toString());
    if (filterStatus !== "all") p.set("status", filterStatus);
    if (filterCustomerType !== "all") p.set("customerType", filterCustomerType);
    if (filterDateFrom) p.set("dateFrom", filterDateFrom);
    if (filterDateTo) p.set("dateTo", filterDateTo);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  };

  const { data: listData, isLoading: listLoading } = useQuery<{ data: SalesInvoiceWithDetails[]; total: number }>({
    queryKey: ["/api/sales-invoices", page, filterStatus, filterCustomerType, filterDateFrom, filterDateTo, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices?${buildQuery()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled,
  });

  const invoices = listData?.data || [];
  const totalInvoices = listData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / pageSize));

  return {
    filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo,
    filterStatus, setFilterStatus,
    filterCustomerType, setFilterCustomerType,
    filterSearch, setFilterSearch,
    page, setPage,
    pageSize,
    invoices,
    totalInvoices,
    totalPages,
    listLoading,
  };
}
