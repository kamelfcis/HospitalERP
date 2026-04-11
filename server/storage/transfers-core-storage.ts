import transfersCrudMethods from "./transfers-crud-storage";
import transfersPostingMethods from "./transfers-posting-storage";

const methods = {
  ...transfersCrudMethods,
  ...transfersPostingMethods,
};

export default methods;
