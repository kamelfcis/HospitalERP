import admitMethods from "./bedboard-admit-storage";
import transferDischargeMethods from "./bedboard-transfer-discharge-storage";

const methods = {
  ...admitMethods,
  ...transferDischargeMethods,
};

export default methods;
