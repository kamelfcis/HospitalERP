import rptVisitSummaryMethods from "./rpt-visit-summary-storage";
import rptVisitClassificationMethods from "./rpt-visit-classification-storage";

const methods = {
  ...rptVisitSummaryMethods,
  ...rptVisitClassificationMethods,
};

export default methods;
