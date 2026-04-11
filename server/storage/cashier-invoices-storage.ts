import cashierPendingMethods from "./cashier-pending-storage";
import cashierCollectMethods from "./cashier-collect-storage";
import cashierRefundMethods from "./cashier-refund-storage";

const methods = {
  ...cashierPendingMethods,
  ...cashierCollectMethods,
  ...cashierRefundMethods,
};

export default methods;
