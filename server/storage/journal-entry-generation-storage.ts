import patientMethods from "./journal-entry-patient";
import generalMethods from "./journal-entry-general";

const methods = {
  ...patientMethods,
  ...generalMethods,
};

export default methods;
