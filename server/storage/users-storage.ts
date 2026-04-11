export { clearPermissionCacheForUser, clearAllPermissionCache } from "./users-crud-storage";

import crudMethods from "./users-crud-storage";
import scopeMethods from "./users-scope-storage";

const methods = {
  ...crudMethods,
  ...scopeMethods,
};

export default methods;
