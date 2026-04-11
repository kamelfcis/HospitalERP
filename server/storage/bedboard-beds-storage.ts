export { default as bedboardQueriesMethods } from "./bedboard-queries-storage";
export { default as bedboardOperationsMethods } from "./bedboard-operations-storage";

import bedboardQueriesMethods from "./bedboard-queries-storage";
import bedboardOperationsMethods from "./bedboard-operations-storage";

const methods = {
  ...bedboardQueriesMethods,
  ...bedboardOperationsMethods,
};

export default methods;
