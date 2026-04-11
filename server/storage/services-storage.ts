import servicesCrudMethods from "./services-crud-storage";
import servicesPricelistMethods from "./services-pricelist-storage";

const methods = {
  ...servicesCrudMethods,
  ...servicesPricelistMethods,
};

export default methods;
