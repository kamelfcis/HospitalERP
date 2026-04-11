export type {
  DisplayUnit,
  DashboardMode,
  StatusFilter,
  RecordShortageParams,
  DashboardParams,
  DashboardRow,
  FollowupRecord,
  WarehouseStockRow,
} from "./shortage-types";

export { recordShortage, resolveShortage } from "./shortage-recording-storage";
export { getDashboard, getWarehouseStock } from "./shortage-dashboard-storage";
export { markOrderedFromSupplier, markReceived, undoOrderedFromSupplier } from "./shortage-followup-storage";
