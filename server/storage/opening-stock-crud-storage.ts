import { openingStockCrudReadMethods } from "./opening-stock-crud-read";
import { openingStockCrudWriteMethods } from "./opening-stock-crud-write";

const openingStockCrudMethods = {
  ...openingStockCrudReadMethods,
  ...openingStockCrudWriteMethods,
};

export default openingStockCrudMethods;
