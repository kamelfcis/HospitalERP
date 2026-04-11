import { contractsCoreContractsMethods } from "./contracts-core-contracts";
import { contractsCoreMembersMethods } from "./contracts-core-members";
export type { ContractMemberLookupResult } from "./contracts-core-members";

const contractsCoreMethods = {
  ...contractsCoreContractsMethods,
  ...contractsCoreMembersMethods,
};

export default contractsCoreMethods;
