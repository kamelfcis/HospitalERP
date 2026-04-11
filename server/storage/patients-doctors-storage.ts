import patientsCoreMethods from "./patients-core-storage";
import doctorsMethods from "./doctors-storage";
import admissionsMethods from "./admissions-storage";
import patientMergeMethods from "./patient-merge-storage";

const methods = {
  ...patientsCoreMethods,
  ...doctorsMethods,
  ...admissionsMethods,
  ...patientMergeMethods,
};

export default methods;
