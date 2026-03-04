export interface TreasurySummary {
  id: string;
  name: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  isActive: boolean;
  notes: string | null;
  openingBalance: string;
  totalIn: string;
  totalOut: string;
  balance: string;
  hasPassword: boolean;
}

export interface UserTreasuryRow {
  userId: string;
  treasuryId: string;
  treasuryName: string;
  userName: string;
}

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
}

export interface TreasuryTransaction {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  transactionDate: string;
}

export interface TreasuryStatement {
  transactions: TreasuryTransaction[];
  totalIn: string;
  totalOut: string;
  balance: string;
}

export const emptyForm = { name: "", glAccountId: "", isActive: true, notes: "" };
export type TreasuryForm = typeof emptyForm;
