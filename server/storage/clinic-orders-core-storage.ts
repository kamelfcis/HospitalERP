import clinicOrdersQueryMethods from "./clinic-orders-query-storage";
import clinicOrdersExecMethods from "./clinic-orders-exec-storage";

const methods = {
  ...clinicOrdersQueryMethods,
  ...clinicOrdersExecMethods,
};

export default methods;
