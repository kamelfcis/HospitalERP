import openMethods from "./cashier-shift-open-storage";
import closeMethods, { type ShiftJournalContext } from "./cashier-shift-close-storage";

export type { ShiftJournalContext };

const methods = {
  ...openMethods,
  ...closeMethods,
};

export default methods;
