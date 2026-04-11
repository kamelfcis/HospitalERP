import createMethods from "./clinic-booking-create-storage";
import statusMethods from "./clinic-booking-status-storage";

const methods = {
  ...createMethods,
  ...statusMethods,
};

export default methods;
