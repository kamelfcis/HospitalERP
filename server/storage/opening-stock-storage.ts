import type { OpeningStockHeader, OpeningStockLine } from "@shared/schema";

export type OpeningStockHeaderWithWarehouse = OpeningStockHeader & {
  warehouseNameAr?: string;
  lineCount?:       number;
};

export type OpeningStockLineWithItem = OpeningStockLine & {
  itemNameAr?:     string;
  itemCode?:       string;
  majorUnitName?:  string | null;
  mediumUnitName?: string | null;
  minorUnitName?:  string | null;
};

import openingStockCrudMethods from "./opening-stock-crud-storage";
import openingStockPostingMethods from "./opening-stock-posting-storage";

const openingStockStorage = {
  ...openingStockCrudMethods,
  ...openingStockPostingMethods,
};

export default openingStockStorage;
