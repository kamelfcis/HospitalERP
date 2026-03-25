import { createContext, useContext } from "react";
import type { Warehouse } from "@shared/schema";
import type { PrepLine, BulkField, BulkOp, SortDir } from "./types";

export interface PrepContextValue {
  sourceWarehouseId: string;
  setSourceWarehouseId: (v: string) => void;
  destWarehouseId: string;
  setDestWarehouseId: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  warehouses: Warehouse[] | undefined;
  queryEnabled: boolean;
  isFetching: boolean;
  handleQuery: () => void;
  queried: boolean;

  visibleLines: PrepLine[];
  linesCount: number;
  excludeCovered: boolean;
  setExcludeCovered: (v: boolean) => void;
  sortSourceAsc: SortDir;
  setSortSourceAsc: (v: SortDir) => void;
  sortDestAsc: SortDir;
  setSortDestAsc: (v: SortDir) => void;
  bulkField: BulkField;
  setBulkField: (v: BulkField) => void;
  bulkOp: BulkOp;
  setBulkOp: (v: BulkOp) => void;
  bulkThreshold: string;
  setBulkThreshold: (v: string) => void;
  handleBulkExclude: () => void;
  handleResetExclusions: () => void;
  handleFillSuggested: () => void;
  handleQtyChange: (itemId: string, val: string) => void;
  handleExcludeItem: (itemId: string) => void;
  excludedCount: number;
  totalItems: number;
  linesWithQty: number;
  noSourceStockCount: number;
  coveredCount: number;

  sourceName: string;
  destName: string;
  isCreating: boolean;
  handleCreateTransfer: (transferDate: string) => void;
}

export const PrepContext = createContext<PrepContextValue | null>(null);

export function usePrep(): PrepContextValue {
  const ctx = useContext(PrepContext);
  if (!ctx) throw new Error("usePrep must be used within PrepProvider");
  return ctx;
}
