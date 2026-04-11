import preflightMethods from "./cashier-preflight-storage";
import generateJournalMethods from "./cashier-generate-journal-storage";

const methods = {
  ...preflightMethods,
  ...generateJournalMethods,
};

export default methods;
