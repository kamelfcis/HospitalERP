export interface JournalLineInput {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  costCenterId: string | null;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalTotals {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
}
