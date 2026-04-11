import returnCrudMethods from "./patient-invoices-return-crud-storage";
import returnPostMethods from "./patient-invoices-return-post-storage";

const methods = {
  ...returnCrudMethods,
  ...returnPostMethods,
};

export default methods;
