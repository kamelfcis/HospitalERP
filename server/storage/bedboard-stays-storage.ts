import bedboardStaysCrudMethods from "./bedboard-stays-crud-storage";
import bedboardStaysAccrualMethods from "./bedboard-stays-accrual-storage";

const methods = {
  ...bedboardStaysCrudMethods,
  ...bedboardStaysAccrualMethods,
};

export default methods;
