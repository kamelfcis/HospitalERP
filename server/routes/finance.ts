import type { Express } from "express";
import { registerAccountsRoutes } from "./accounts";
import { registerJournalEntriesRoutes } from "./journal-entries";
import { registerAccountSetupRoutes } from "./account-setup";

export function registerFinanceRoutes(app: Express) {
  registerAccountsRoutes(app);
  registerJournalEntriesRoutes(app);
  registerAccountSetupRoutes(app);
}
