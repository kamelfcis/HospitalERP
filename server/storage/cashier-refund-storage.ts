import refundProcessMethods from "./cashier-refund-process";
import totalsMethods from "./cashier-refund-totals";

const methods = {
  ...refundProcessMethods,
  ...totalsMethods,
};

export default methods;
