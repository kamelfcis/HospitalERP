import { transfersInventoryMethods } from "./transfers-inventory-storage";
import { transfersSearchMethods } from "./transfers-search-storage";
import { transfersLogisticsMethods } from "./transfers-logistics-storage";

export const transfersUtilsMethods = {
  ...transfersInventoryMethods,
  ...transfersSearchMethods,
  ...transfersLogisticsMethods,
};
