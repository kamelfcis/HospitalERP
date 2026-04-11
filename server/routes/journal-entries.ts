import type { Express } from "express";
import { registerJournalEntriesCrudRoutes } from "./journal-entries-crud-routes";
import { registerJournalEntriesActionsRoutes } from "./journal-entries-actions-routes";

export function registerJournalEntriesRoutes(app: Express) {
  registerJournalEntriesCrudRoutes(app);
  registerJournalEntriesActionsRoutes(app);
}
