import { permissionGroupsReadMethods } from "./permission-groups-read";
import { permissionGroupsWriteMethods } from "./permission-groups-write";
export type { PermissionGroupWithStats, PermissionGroupDetail } from "./permission-groups-read";

const permissionGroupsMethods = {
  ...permissionGroupsReadMethods,
  ...permissionGroupsWriteMethods,
};

export default permissionGroupsMethods;
