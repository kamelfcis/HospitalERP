export type DisplayUnit = "major" | "medium" | "minor";
export type DashboardMode = "shortage_driven" | "full_analysis";
export type StatusFilter =
  | "not_available"
  | "available_elsewhere"
  | "low_stock"
  | "high_demand"
  | "normal"
  | null;

export interface RecordShortageParams {
  itemId:       string;
  warehouseId?: string | null;
  requestedBy:  string;
  sourceScreen: string;
  notes?:       string | null;
}

export interface DashboardParams {
  mode:              DashboardMode;
  displayUnit:       DisplayUnit;
  fromDate:          string;
  toDate:            string;
  categories?:       string[] | null;
  status?:           StatusFilter;
  search?:           string | null;
  warehouseId?:      string | null;
  showResolved?:     boolean;
  excludeOrdered?:   boolean;
  showOrderedOnly?:  boolean;
  orderedFromDate?:  string | null;
  orderedToDate?:    string | null;
  page:          number;
  limit:         number;
  sortBy:        string;
  sortDir:       "asc" | "desc";
}

export interface DashboardRow {
  itemId:                  string;
  itemCode:                string;
  itemName:                string;
  category:                string;
  majorUnitName:           string | null;
  mediumUnitName:          string | null;
  minorUnitName:           string | null;
  majorToMinor:            number | null;
  mediumToMinor:           number | null;
  displayUnitName:         string | null;
  salePriceCurrent:        number;
  requestCount:            number;
  recent7dRequests:        number;
  firstRequestedAt:        string | null;
  lastRequestedAt:         string | null;
  isResolved:              boolean;
  totalQtyMinor:           number;
  warehousesWithStock:     number;
  qtyDisplay:              number;
  totalIssuedMinor:        number;
  activeSalesDays:         number;
  avgDailyMinor:           number;
  avgDailyDisplay:         number;
  daysOfCoverage:          number | null;
  statusFlag:              string;
  totalCount:              number;
  followupId:              string | null;
  followupActionType:      string | null;
  followupDueDate:         string | null;
  followupActionAt:        string | null;
}

export interface FollowupRecord {
  id:              string;
  itemId:          string;
  actionType:      string;
  actionAt:        string;
  followUpDueDate: string;
}

export interface WarehouseStockRow {
  warehouseId:   string;
  warehouseName: string;
  qtyInMinor:    number;
  qtyDisplay:    number;
  displayUnit:   string | null;
}
