import admissionsCrudMethods from "./admissions-crud-storage";
import admissionsConsolidationMethods from "./admissions-consolidation-storage";

const methods = {
  ...admissionsCrudMethods,
  ...admissionsConsolidationMethods,
};

export default methods;
