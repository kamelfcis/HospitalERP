import clinicSchedulingMethods from "./clinic-scheduling-storage";
import clinicBookingMethods from "./clinic-booking-storage";
import clinicRefundMethods from "./clinic-refund-storage";

const methods = {
  ...clinicSchedulingMethods,
  ...clinicBookingMethods,
  ...clinicRefundMethods,
};

export default methods;
