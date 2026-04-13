/**
 * Hook: useCustomerPaymentsData
 *
 * مسؤول عن: كل API calls لشاشة تحصيل الآجل
 * - جلب رصيد العميل
 * - جلب الفواتير المتاحة للتحصيل
 * - جلب رقم الإيصال التالي
 * - جلب كشف الحساب
 *
 * الـ component يحتفظ بـ: local UI state (sort, selection, amounts, form fields)
 */

import { useQuery }                          from "@tanstack/react-query";
import type { CustomerCreditInvoiceRow }     from "@shared/schema/invoicing";

// ─── Types (مُصدَّرة للاستخدام في الـ component) ────────────────────────────

export interface BalanceResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  totalInvoiced:  string;
  totalReturns:   string;
  totalPaid:      string;
  currentBalance: string;
}

export interface CustomerStatementLine {
  txnDate:      string;
  sourceType:   string;
  sourceLabel:  string;
  sourceNumber: string;
  sourceRef:    string | null;
  description:  string;
  debit:        number;
  credit:       number;
  balance:      number;
}

export interface CustomerStatementResult {
  customerId:     string;
  name:           string;
  phone:          string | null;
  fromDate:       string;
  toDate:         string;
  openingBalance: number;
  lines:          CustomerStatementLine[];
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface Params {
  customerId:   string;
  filterStatus: "unpaid" | "paid" | "all";
  activeTab:    "payment" | "statement";
  stmtFrom:     string;
  stmtTo:       string;
}

export function useCustomerPaymentsData({
  customerId,
  filterStatus,
  activeTab,
  stmtFrom,
  stmtTo,
}: Params) {
  const enabled = !!customerId;

  const balanceQuery = useQuery<BalanceResult>({
    queryKey: ["/api/customer-payments/balance", customerId],
    queryFn:  async () => {
      const r = await fetch(`/api/customer-payments/balance/${customerId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل جلب الرصيد");
      return r.json();
    },
    enabled,
  });

  const nextNumQuery = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/customer-payments/next-number"],
    queryFn:  async () => {
      const r = await fetch("/api/customer-payments/next-number", { credentials: "include" });
      return r.json();
    },
    enabled,
  });

  const invoicesQuery = useQuery<{ invoices: CustomerCreditInvoiceRow[] }>({
    queryKey: ["/api/customer-payments/invoices", customerId, filterStatus],
    queryFn:  async () => {
      const r = await fetch(
        `/api/customer-payments/invoices/${customerId}?status=${filterStatus}`,
        { credentials: "include" },
      );
      return r.json();
    },
    enabled,
  });

  const statementQuery = useQuery<CustomerStatementResult>({
    queryKey: ["/api/customer-payments/statement", customerId, stmtFrom, stmtTo],
    queryFn:  async () => {
      const r = await fetch(
        `/api/customer-payments/statement/${customerId}?from=${stmtFrom}&to=${stmtTo}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("فشل تحميل كشف الحساب");
      return r.json();
    },
    enabled: enabled && activeTab === "statement",
    staleTime: 10_000,
  });

  return {
    balanceData:      balanceQuery.data,
    refetchBalance:   balanceQuery.refetch,

    nextNumData:      nextNumQuery.data,

    rawInvoices:      invoicesQuery.data?.invoices ?? [],
    refetchInvoices:  invoicesQuery.refetch,

    statementData:    statementQuery.data,
    stmtLoading:      statementQuery.isLoading,
    refetchStatement: statementQuery.refetch,
  };
}
