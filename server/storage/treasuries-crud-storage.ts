import coreMethods from "./treasuries-core-storage";
import assignmentsMethods from "./treasuries-assignments-storage";

const treasuriesCrudMethods = {
  ...coreMethods,
  ...assignmentsMethods,
};

export default treasuriesCrudMethods;
