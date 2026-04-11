import consolidationMethods from "./admissions-consolidation-core";
import inquiryMethods from "./admissions-consolidation-inquiry";

const methods = {
  ...consolidationMethods,
  ...inquiryMethods,
};

export default methods;
