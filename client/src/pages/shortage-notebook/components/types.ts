export type DashboardMode  = "shortage_driven" | "full_analysis";
export type DisplayUnit    = "major" | "medium" | "minor";
export type StatusFilter   = "not_available" | "available_elsewhere" | "low_stock" | "high_demand" | "normal" | "";
export type SortDir        = "asc" | "desc";

export interface DashboardRow {
  itemId:              string;
  itemCode:            string;
  itemName:            string;
  category:            string;
  displayUnitName:     string | null;
  salePriceCurrent:    number;
  requestCount:        number;
  recent7dRequests:    number;
  firstRequestedAt:    string | null;
  lastRequestedAt:     string | null;
  isResolved:          boolean;
  totalQtyMinor:       number;
  warehousesWithStock: number;
  qtyDisplay:          number;
  totalIssuedMinor:    number;
  activeSalesDays:     number;
  avgDailyMinor:       number;
  avgDailyDisplay:     number;
  daysOfCoverage:      number | null;
  statusFlag:          string;
  totalCount:          number;
  followupId:          string | null;
  followupActionType:  string | null;
  followupDueDate:     string | null;
  followupActionAt:    string | null;
}

export interface DashboardResponse {
  rows:  DashboardRow[];
  total: number;
  page:  number;
  limit: number;
}

export interface WarehouseStockRow {
  warehouseId:   string;
  warehouseName: string;
  qtyInMinor:    number;
  qtyDisplay:    number;
  displayUnit:   string | null;
}
