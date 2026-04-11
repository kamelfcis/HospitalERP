import clinicCrudMethods from "./clinic-crud-storage";
import clinicAppointmentsMethods from "./clinic-appointments-storage";
import clinicConsultationsMethods from "./clinic-consultations-storage";

const methods = {
  ...clinicCrudMethods,
  ...clinicAppointmentsMethods,
  ...clinicConsultationsMethods,
};

export default methods;
