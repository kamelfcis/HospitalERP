import timelineMethods from "./patients-timeline-storage";
import consultationsMethods from "./patients-consultations-storage";

const methods = {
  ...timelineMethods,
  ...consultationsMethods,
};

export default methods;
