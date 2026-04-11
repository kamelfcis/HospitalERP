import returnsQueryMethods from "./sales-invoices-returns-query-storage";
import finalizeOpsMethods from "./sales-invoices-finalize-ops-storage";

const methods = {
  ...returnsQueryMethods,
  ...finalizeOpsMethods,
};

export default methods;
