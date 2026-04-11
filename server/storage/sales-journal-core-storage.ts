import salesJournalRegenMethods from "./sales-journal-regen-storage";
import salesJournalBuildMethods from "./sales-journal-build-storage";
import salesJournalGenerateMethods from "./sales-journal-generate-storage";

const salesJournalCoreMethods = {
  ...salesJournalRegenMethods,
  ...salesJournalBuildMethods,
  ...salesJournalGenerateMethods,
};

export default salesJournalCoreMethods;
