import distributeMethods from "./patient-invoices-distribute-storage";
import distributeDirectMethods from "./patient-invoices-distribute-direct-storage";

const methods = {
  ...distributeMethods,
  ...distributeDirectMethods,
};

export default methods;
