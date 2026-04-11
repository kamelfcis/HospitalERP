import salesReturnJournalMethods from "./sales-return-journal-storage";
import salesReturnCashMethods from "./sales-return-cash-storage";

const salesJournalReturnsMethods = {
  ...salesReturnJournalMethods,
  ...salesReturnCashMethods,
};

export default salesJournalReturnsMethods;
