import crudMethods from "./finance-chart-crud-storage";
import journalMethods from "./finance-chart-journal-storage";

const methods = {
  ...crudMethods,
  ...journalMethods,
};

export default methods;
