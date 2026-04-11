// ACCOUNTING_PENDING: patient_invoice finalize → GL journal generation depends on
//   Account Mappings having 'receivables' + line-type accounts configured.
//   If mappings are missing, generateJournalEntry returns null silently.
//   journal_status tracks: 'none' | 'pending' | 'completed' | 'failed' | 'needs_retry'.
// ACCOUNTING_PENDING: patient_invoice final-close → no separate GL entry generated.
//   Close only validates payment sufficiency (cash: full paid, contract: paid + company share >= net).
// ACCOUNTING_PENDING: patient_invoice distribute → creates child invoices with journal_status='none',
//   GL is only generated on individual finalization of each child invoice.

import type { Express } from "express";
import { registerCrudRoutes }     from "./patient-invoices-crud";
import { registerFinalizeRoutes } from "./patient-invoices-finalize";
import { registerPaymentRoutes }  from "./patient-invoices-payments";

export function registerPatientInvoicesRoutes(app: Express) {
  registerCrudRoutes(app);
  registerFinalizeRoutes(app);
  registerPaymentRoutes(app);
}
