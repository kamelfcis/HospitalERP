export { normalizeClaimNumber } from "./purchasing-invoices-query";
import queryMethods from "./purchasing-invoices-query";
import saveMethods from "./purchasing-invoices-approve";

const coreMethods = {
  ...queryMethods,
  ...saveMethods,
};

export default coreMethods;
