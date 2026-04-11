import chartMethods from "./finance-chart-storage";
import costCentersMethods from "./finance-costcenters-storage";

const methods = {
  ...chartMethods,
  ...costCentersMethods,
};

export default methods;
