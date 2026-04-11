export type {
  CreditInvoiceItem,
  HandoverShiftRow,
  HandoverTotals,
  HandoverSummaryResult,
  HandoverFilters,
} from "./cashier-handover-types";

import typesMethods from "./cashier-handover-types";
import summaryMethods from "./cashier-handover-summary";

const methods = {
  ...typesMethods,
  ...summaryMethods,
};

export default methods;
