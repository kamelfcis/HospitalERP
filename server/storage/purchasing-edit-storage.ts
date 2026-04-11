import editReceivingMethods from "./purchasing-edit-receiving-storage";
import convertMethods from "./purchasing-convert-storage";

const methods = {
  ...editReceivingMethods,
  ...convertMethods,
};

export default methods;
