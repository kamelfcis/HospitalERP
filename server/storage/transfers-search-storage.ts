import { transfersSearchAdvancedMethods } from "./transfers-search-advanced";
import { transfersSearchPatternMethods } from "./transfers-search-pattern";

export const transfersSearchMethods = {
  ...transfersSearchAdvancedMethods,
  ...transfersSearchPatternMethods,
};
