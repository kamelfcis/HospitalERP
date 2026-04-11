import balanceMethods from "./finance-reports-balance-storage";
import incomeMethods from "./finance-reports-income-storage";

const methods = {
  ...balanceMethods,
  ...incomeMethods,
};

export default methods;
