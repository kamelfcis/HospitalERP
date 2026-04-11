export type { StockCountLineRow, StockCountSessionWithLines } from "./stock-count-crud-storage";
export type { LoadedItem, LoadItemsOpts, UpsertCountLine } from "./stock-count-lines-storage";

import stockCountCrudStorage from "./stock-count-crud-storage";
import stockCountLinesStorage from "./stock-count-lines-storage";
import stockCountPostingStorage from "./stock-count-posting-storage";

const stockCountStorage = {
  ...stockCountCrudStorage,
  ...stockCountLinesStorage,
  ...stockCountPostingStorage,
};

export default stockCountStorage;
