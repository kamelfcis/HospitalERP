import journalEntryMethods from "./finance-chart-journal-entries";
import templatesAuditMethods from "./finance-chart-templates-audit";

const methods = {
  ...journalEntryMethods,
  ...templatesAuditMethods,
};

export default methods;
