import type { Express } from "express";
import { registerSalesInvoicesCrudRoutes } from "./sales-invoices-crud-routes";
import { registerSalesInvoicesFinalizeRoutes } from "./sales-invoices-finalize-routes";

export function registerSalesInvoicesRoutes(app: Express) {
  registerSalesInvoicesFinalizeRoutes(app);
  registerSalesInvoicesCrudRoutes(app);
}
