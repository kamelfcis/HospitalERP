import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesInvoiceWithDetails } from "@shared/schema";

// Minimal type for registry pharmacist filter — does NOT require users.view
interface PharmacistOption {
  id: string;
  fullName: string;
  role: string;
}

interface RegistryTotals {
  subtotal: number;
  discountValue: number;
  netTotal: number;
}

export function useRegistry(today: string, enabled: boolean) {
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCustomerType, setFilterCustomerType] = useState("all");
  const [filterPharmacistId, setFilterPharmacistId] = useState("all");
  const [filterWarehouseId, setFilterWarehouseId] = useState("all");
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
    if (filterPharmacistId !== "all") p.set("pharmacistId", filterPharmacistId);
    if (filterWarehouseId !== "all") p.set("warehouseId", filterWarehouseId);
    if (filterDateFrom) p.set("dateFrom", filterDateFrom);
    if (filterDateTo) p.set("dateTo", filterDateTo);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  };

  const { data: listData, isLoading: listLoading } = useQuery<{ data: SalesInvoiceWithDetails[]; total: number; totals: RegistryTotals }>({
    queryKey: ["/api/sales-invoices", page, filterStatus, filterCustomerType, filterPharmacistId, filterWarehouseId, filterDateFrom, filterDateTo, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices?${buildQuery()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled,
    staleTime: 20_000,
  });

  // Dedicated pharmacist lookup — does NOT require users.view permission
  // Compound Layer 2 decision: SALES_REGISTRY_VIEW users must filter by pharmacist
  // without needing admin-level user management access
  const { data: pharmacistData } = useQuery<PharmacistOption[]>({
    queryKey: ["/api/sales-invoices/pharmacists"],
    enabled,
    staleTime: 5 * 60_000,
  });

  const invoices = listData?.data || [];
  const totalInvoices = listData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / pageSize));
  const totals: RegistryTotals = listData?.totals || { subtotal: 0, discountValue: 0, netTotal: 0 };

  const pharmacistUsers = pharmacistData || [];

  return {
    filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo,
    filterStatus, setFilterStatus,
    filterCustomerType, setFilterCustomerType,
    filterPharmacistId, setFilterPharmacistId,
    filterWarehouseId, setFilterWarehouseId,
    filterSearch, setFilterSearch,
    page, setPage,
    pageSize,
    invoices,
    totalInvoices,
    totalPages,
    listLoading,
    totals,
    pharmacistUsers,
  };
}
