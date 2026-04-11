import salesInvoicesCreateMethods from "./sales-invoices-create-storage";
import salesInvoicesUpdateMethods from "./sales-invoices-update-storage";

const methods = {
  ...salesInvoicesCreateMethods,
  ...salesInvoicesUpdateMethods,
};

export default methods;
