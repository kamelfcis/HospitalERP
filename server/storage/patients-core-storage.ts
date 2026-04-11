import patientsCrudMethods from "./patients-crud-storage";
import patientsStatsMethods from "./patients-stats-storage";
import patientsJourneyMethods from "./patients-journey-storage";

const methods = {
  ...patientsCrudMethods,
  ...patientsStatsMethods,
  ...patientsJourneyMethods,
};

export default methods;
