import crudMethods from "./items-crud-storage";
import dataMethods from "./items-data-storage";

const methods = {
  ...crudMethods,
  ...dataMethods,
};

export default methods;
