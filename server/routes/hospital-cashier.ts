import type { Express } from "express";
import { registerCashierSetupRoutes } from "./hospital-cashier-setup";
import { registerCashierShiftRoutes } from "./hospital-cashier-shifts";
import { registerCashierReceiptRoutes } from "./hospital-cashier-receipts";

export function registerCashierRoutes(app: Express) {
  registerCashierSetupRoutes(app);
  registerCashierShiftRoutes(app);
  registerCashierReceiptRoutes(app);
}
