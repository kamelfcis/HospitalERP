import listMethods from "./clinic-orders-list-storage";
import dataMethods from "./clinic-orders-data-storage";

const methods = {
  ...listMethods,
  ...dataMethods,
};

export default methods;
