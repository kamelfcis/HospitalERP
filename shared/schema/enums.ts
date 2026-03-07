import { pgEnum } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense"
]);

export const journalStatusEnum = pgEnum("journal_status", [
  "draft",
  "posted",
  "reversed"
]);

export const itemCategoryEnum = pgEnum("item_category", [
  "drug",
  "supply",
  "service"
]);

export const unitLevelEnum = pgEnum("unit_level", [
  "major",
  "medium",
  "minor"
]);

export const lotTxTypeEnum = pgEnum("lot_tx_type", ["in", "out", "adj"]);
export const transferStatusEnum = pgEnum("transfer_status", ["draft", "executed", "cancelled"]);
export const salesInvoiceStatusEnum = pgEnum("sales_invoice_status", ["draft", "finalized", "collected", "cancelled"]);
export const cashierShiftStatusEnum = pgEnum("cashier_shift_status", ["open", "closed"]);
export const customerTypeEnum = pgEnum("customer_type", ["cash", "credit", "contract"]);
export const patientInvoiceStatusEnum = pgEnum("patient_invoice_status", ["draft", "finalized", "cancelled"]);
export const patientTypeEnum = pgEnum("patient_type", ["cash", "contract"]);
export const patientInvoiceLineTypeEnum = pgEnum("patient_invoice_line_type", ["service", "drug", "consumable", "equipment"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "bank_transfer", "insurance"]);
export const admissionStatusEnum = pgEnum("admission_status", ["active", "discharged", "cancelled"]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "accountant",
  "pharmacist",
  "cashier",
  "doctor",
  "nurse",
  "receptionist",
  "warehouse",
  "viewer",
  "lab",
  "radiology",
  "it"
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["sales_invoice", "patient_invoice", "receiving", "purchase_invoice", "cashier_collection", "cashier_refund"]);

export const mappingLineTypeEnum = pgEnum("mapping_line_type", [
  "inventory",
  "cogs",
  "revenue",
  "receivable",
  "payable",
  "cash",
  "discount",
  "tax",
  "other"
]);

export const receivingStatusEnum = pgEnum("receiving_status", ["draft", "posted", "posted_qty_only", "posted_costed", "cancelled"]);
export const purchaseInvoiceStatusEnum = pgEnum("purchase_invoice_status", ["draft", "approved_costed", "cancelled"]);
