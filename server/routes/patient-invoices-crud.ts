import type { Express } from "express";
import { registerCrudQueries, assertNotFinalClosed, processInvoiceLines } from "./patient-invoices-crud-queries";
import { registerCrudMutations } from "./patient-invoices-crud-mutations";

export { assertNotFinalClosed, processInvoiceLines };

export function registerCrudRoutes(app: Express) {
  registerCrudQueries(app);
  registerCrudMutations(app);
}
