import purchasingReceivingQueryMethods from "./purchasing-receiving-query-storage";
import purchasingReceivingWriteMethods from "./purchasing-receiving-write-storage";

const methods = {
  ...purchasingReceivingQueryMethods,
  ...purchasingReceivingWriteMethods,
};

export default methods;
