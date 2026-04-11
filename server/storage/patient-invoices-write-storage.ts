import createMethods from "./patient-invoices-create";
import finalizeMethods from "./patient-invoices-finalize";

const methods = {
  ...createMethods,
  ...finalizeMethods,
};

export default methods;
