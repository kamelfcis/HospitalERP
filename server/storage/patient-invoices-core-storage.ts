import queryMethods from "./patient-invoices-query-storage";
import writeMethods from "./patient-invoices-write-storage";

const methods = {
  ...queryMethods,
  ...writeMethods,
};

export default methods;
