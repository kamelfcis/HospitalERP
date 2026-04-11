import queryMethods from "./contracts-claims-query-storage";
import opsMethods from "./contracts-claims-ops-storage";
import type { ContractClaimBatch, ContractClaimLine } from "@shared/schema";

export interface ClaimBatchFilters {
  companyId?: string;
  contractId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ClaimBatchWithLines extends ContractClaimBatch {
  lines: ContractClaimLine[];
  companyName?: string;
  contractName?: string;
  contractNumber?: string;
}

export interface RespondLineInput {
  lineId:          string;
  status:          "approved" | "rejected";
  approvedAmount?: string;
  rejectionReason?: string;
}

export interface SettleClaimBatchInput {
  companyReferenceNo?: string;
  settlementDate:      string;
  notes?:              string;
  bankAccountId?:      string;
  companyArAccountId?: string;
}

const claimsStorageMethods = {
  ...queryMethods,
  ...opsMethods,
};

export default claimsStorageMethods;
