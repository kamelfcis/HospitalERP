import salesJournalCoreMethods from "./sales-journal-core-storage";
import salesJournalCashierMethods from "./sales-journal-cashier-storage";
import salesJournalReturnsMethods from "./sales-journal-returns-storage";

const methods = {
  ...salesJournalCoreMethods,
  ...salesJournalCashierMethods,
  ...salesJournalReturnsMethods,
};

export default methods;
