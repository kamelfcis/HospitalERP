import { clinicConsultationsReadMethods } from "./clinic-consultations-read";
import { clinicConsultationsWriteMethods } from "./clinic-consultations-write";

const methods = {
  ...clinicConsultationsReadMethods,
  ...clinicConsultationsWriteMethods,
};

export default methods;
