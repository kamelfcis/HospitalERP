import salesJournalLinesMethods from "./sales-journal-lines-storage";
import salesJournalInsertMethods from "./sales-journal-insert-storage";

const salesJournalBuildMethods = {
  ...salesJournalLinesMethods,
  ...salesJournalInsertMethods,
};

export default salesJournalBuildMethods;
