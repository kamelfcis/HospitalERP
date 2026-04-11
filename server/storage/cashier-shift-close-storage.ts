import { cashierShiftCloseValidateMethods } from "./cashier-shift-close-validate";
import { cashierShiftCloseExecuteMethods } from "./cashier-shift-close-execute";
export type { ShiftJournalContext } from "./cashier-shift-close-execute";

const methods = {
  ...cashierShiftCloseValidateMethods,
  ...cashierShiftCloseExecuteMethods,
};

export default methods;
