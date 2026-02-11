import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const accountTypeEnum = pgEnum("account_type", [
  "asset",      // أصول
  "liability",  // خصوم
  "equity",     // حقوق ملكية
  "revenue",    // إيرادات
  "expense"     // مصروفات
]);

export const journalStatusEnum = pgEnum("journal_status", [
  "draft",      // مسودة
  "posted",     // مُرحّل
  "reversed"    // ملغي
]);

export const itemCategoryEnum = pgEnum("item_category", [
  "drug",       // دواء
  "supply",     // مستلزمات
  "service"     // خدمة
]);

export const unitLevelEnum = pgEnum("unit_level", [
  "major",      // وحدة كبرى
  "medium",     // وحدة متوسطة
  "minor"       // وحدة صغرى
]);

export const lotTxTypeEnum = pgEnum("lot_tx_type", ["in", "out", "adj"]);
export const transferStatusEnum = pgEnum("transfer_status", ["draft", "executed"]);
export const salesInvoiceStatusEnum = pgEnum("sales_invoice_status", ["draft", "finalized", "collected", "cancelled"]);
export const cashierShiftStatusEnum = pgEnum("cashier_shift_status", ["open", "closed"]);
export const customerTypeEnum = pgEnum("customer_type", ["cash", "credit", "contract"]);
export const patientInvoiceStatusEnum = pgEnum("patient_invoice_status", ["draft", "finalized", "cancelled"]);
export const patientTypeEnum = pgEnum("patient_type", ["cash", "contract"]);
export const patientInvoiceLineTypeEnum = pgEnum("patient_invoice_line_type", ["service", "drug", "consumable", "equipment"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "bank_transfer", "insurance"]);
export const admissionStatusEnum = pgEnum("admission_status", ["active", "discharged", "cancelled"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["sales_invoice", "patient_invoice", "receiving", "purchase_invoice", "cashier_collection", "cashier_refund"]);
export const mappingLineTypeEnum = pgEnum("mapping_line_type", [
  "revenue_services", "revenue_drugs", "revenue_consumables", "revenue_equipment",
  "cogs", "inventory", "cash", "receivables", "payables", "returns",
  "revenue_general", "expense_general"
]);

// المستخدمين
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("user"), // admin, accountant, viewer
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// الفترات المحاسبية
export const fiscalPeriods = pgTable("fiscal_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// مراكز التكلفة
export const costCenters = pgTable("cost_centers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type"),
  parentId: varchar("parent_id").references((): any => costCenters.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  parentIdx: index("idx_cost_centers_parent").on(table.parentId),
}));

// دليل الحسابات
export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  parentId: varchar("parent_id").references((): any => accounts.id, { onDelete: "set null" }),
  level: integer("level").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  requiresCostCenter: boolean("requires_cost_center").notNull().default(false),
  description: text("description"),
  openingBalance: decimal("opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  parentIdx: index("idx_accounts_parent").on(table.parentId),
  typeIdx: index("idx_accounts_type").on(table.accountType),
}));

// القيود اليومية
export const journalEntries = pgTable("journal_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entryNumber: integer("entry_number").notNull().unique(),
  entryDate: date("entry_date").notNull(),
  description: text("description").notNull(),
  status: journalStatusEnum("status").notNull().default("draft"),
  periodId: varchar("period_id").references(() => fiscalPeriods.id),
  totalDebit: decimal("total_debit", { precision: 18, scale: 2 }).notNull().default("0"),
  totalCredit: decimal("total_credit", { precision: 18, scale: 2 }).notNull().default("0"),
  reference: text("reference"),
  createdBy: varchar("created_by").references(() => users.id),
  postedBy: varchar("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at"),
  reversedBy: varchar("reversed_by").references(() => users.id),
  reversedAt: timestamp("reversed_at"),
  reversalEntryId: varchar("reversal_entry_id").references((): any => journalEntries.id, { onDelete: "set null" }),
  templateId: varchar("template_id").references(() => journalTemplates.id, { onDelete: "set null" }),
  sourceType: text("source_type"),
  sourceDocumentId: varchar("source_document_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("idx_journal_entries_date").on(table.entryDate),
  statusIdx: index("idx_journal_entries_status").on(table.status),
  periodIdx: index("idx_journal_entries_period").on(table.periodId),
  sourceIdx: index("idx_journal_entries_source").on(table.sourceType, table.sourceDocumentId),
}));

// سطور القيود
export const journalLines = pgTable("journal_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  journalEntryId: varchar("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  description: text("description"),
  debit: decimal("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: decimal("credit", { precision: 18, scale: 2 }).notNull().default("0"),
}, (table) => ({
  entryIdx: index("idx_journal_lines_entry").on(table.journalEntryId),
  accountIdx: index("idx_journal_lines_account").on(table.accountId),
  costCenterIdx: index("idx_journal_lines_cost_center").on(table.costCenterId),
}));

// نماذج القيود
export const journalTemplates = pgTable("journal_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// سطور نماذج القيود
export const templateLines = pgTable("template_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => journalTemplates.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: varchar("account_id").references(() => accounts.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
  description: text("description"),
  debitPercent: decimal("debit_percent", { precision: 15, scale: 2 }),
  creditPercent: decimal("credit_percent", { precision: 15, scale: 2 }),
});

// سجل التدقيق
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableName: text("table_name").notNull(),
  recordId: varchar("record_id").notNull(),
  action: text("action").notNull(), // create, update, delete, post, reverse
  oldValues: text("old_values"),
  newValues: text("new_values"),
  userId: varchar("user_id").references(() => users.id),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tableRecordIdx: index("idx_audit_log_table_record").on(table.tableName, table.recordId),
  createdAtIdx: index("idx_audit_log_created_at").on(table.createdAt),
}));

// أنواع أشكال الأصناف (أقراص، كريم، فوار، إلخ)
export const itemFormTypes = pgTable("item_form_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// وحدات القياس
export const itemUoms = pgTable("item_uoms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// الأصناف
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemCode: varchar("item_code", { length: 50 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  category: itemCategoryEnum("category").notNull(),
  isToxic: boolean("is_toxic").notNull().default(false),
  hasExpiry: boolean("has_expiry").notNull().default(false),
  formTypeId: varchar("form_type_id").references(() => itemFormTypes.id),
  purchasePriceLast: decimal("purchase_price_last", { precision: 18, scale: 2 }).notNull().default("0"),
  salePriceCurrent: decimal("sale_price_current", { precision: 18, scale: 2 }).notNull().default("0"),
  majorUnitName: text("major_unit_name"),
  mediumUnitName: text("medium_unit_name"),
  minorUnitName: text("minor_unit_name"),
  majorToMedium: decimal("major_to_medium", { precision: 10, scale: 4 }),
  majorToMinor: decimal("major_to_minor", { precision: 10, scale: 4 }),
  mediumToMinor: decimal("medium_to_minor", { precision: 10, scale: 4 }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_items_category").on(table.category),
  nameArIdx: index("idx_items_name_ar").on(table.nameAr),
  formTypeIdx: index("idx_items_form_type").on(table.formTypeId),
}));

// حركات المشتريات
export const purchaseTransactions = pgTable("purchase_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  txDate: date("tx_date").notNull(),
  supplierName: text("supplier_name"),
  qty: decimal("qty", { precision: 18, scale: 4 }).notNull(),
  unitLevel: unitLevelEnum("unit_level").notNull().default("minor"),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 2 }).notNull(),
  salePriceSnapshot: decimal("sale_price_snapshot", { precision: 18, scale: 2 }),
  total: decimal("total", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  itemIdx: index("idx_purchase_tx_item").on(table.itemId),
  dateIdx: index("idx_purchase_tx_date").on(table.txDate),
}));

// حركات المبيعات
export const salesTransactions = pgTable("sales_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  txDate: date("tx_date").notNull(),
  qty: decimal("qty", { precision: 18, scale: 4 }).notNull(),
  unitLevel: unitLevelEnum("unit_level").notNull().default("minor"),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull(),
  total: decimal("total", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  itemIdx: index("idx_sales_tx_item").on(table.itemId),
  dateIdx: index("idx_sales_tx_date").on(table.txDate),
}));

// الأقسام (صيدلية خارجية، صيدلية داخلية، عناية، عمليات...)
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userDepartments = pgTable("user_departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  departmentId: varchar("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueUserDept: uniqueIndex("idx_user_departments_unique").on(table.userId, table.departmentId),
}));

// أسعار الأصناف حسب القسم
export const itemDepartmentPrices = pgTable("item_department_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  departmentId: varchar("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  itemDeptUniq: uniqueIndex("idx_item_dept_unique").on(table.itemId, table.departmentId),
  itemIdx: index("idx_item_dept_prices_item").on(table.itemId),
  deptIdx: index("idx_item_dept_prices_dept").on(table.departmentId),
}));

export const pharmacies = pgTable("pharmacies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: index("idx_pharmacies_code").on(table.code),
}));

export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseCode: varchar("warehouse_code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  departmentId: varchar("department_id").references(() => departments.id),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: index("idx_warehouses_code").on(table.warehouseCode),
  pharmacyIdx: index("idx_warehouses_pharmacy").on(table.pharmacyId),
}));

export const userWarehouses = pgTable("user_warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueUserWh: uniqueIndex("idx_user_warehouses_unique").on(table.userId, table.warehouseId),
}));

export const inventoryLots = pgTable("inventory_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  expiryDate: date("expiry_date"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  receivedDate: date("received_date").notNull(),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 4 }).notNull(),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull().default("0"),
  qtyInMinor: decimal("qty_in_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  itemExpiryIdx: index("idx_lots_item_expiry").on(table.itemId, table.expiryYear, table.expiryMonth),
  itemReceivedIdx: index("idx_lots_item_received").on(table.itemId, table.receivedDate),
  itemWarehouseExpiryIdx: index("idx_lots_item_warehouse_expiry").on(table.itemId, table.warehouseId, table.expiryYear, table.expiryMonth),
  itemWarehouseIdx: index("idx_lots_item_warehouse").on(table.itemId, table.warehouseId),
  itemWarehouseExpiryMonthIdx: index("idx_lots_item_warehouse_expiry_month").on(table.itemId, table.warehouseId, table.expiryYear, table.expiryMonth),
}));

export const inventoryLotMovements = pgTable("inventory_lot_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lotId: varchar("lot_id").notNull().references(() => inventoryLots.id, { onDelete: "restrict" }),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  txDate: timestamp("tx_date").notNull().defaultNow(),
  txType: lotTxTypeEnum("tx_type").notNull(),
  qtyChangeInMinor: decimal("qty_change_in_minor", { precision: 18, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 18, scale: 4 }),
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  lotTxDateIdx: index("idx_lot_movements_lot_txdate").on(table.lotId, table.txDate),
}));

export const storeTransfers = pgTable("store_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transferNumber: integer("transfer_number").notNull().unique(),
  transferDate: date("transfer_date").notNull(),
  sourceWarehouseId: varchar("source_warehouse_id").notNull().references(() => warehouses.id),
  destinationWarehouseId: varchar("destination_warehouse_id").notNull().references(() => warehouses.id),
  status: transferStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  executedAt: timestamp("executed_at"),
}, (table) => ({
  transferNumberIdx: index("idx_transfers_number").on(table.transferNumber),
  sourceWarehouseIdx: index("idx_transfers_source").on(table.sourceWarehouseId),
  destWarehouseIdx: index("idx_transfers_dest").on(table.destinationWarehouseId),
  dateIdx: index("idx_transfers_date").on(table.transferDate),
}));

export const transferLines = pgTable("transfer_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transferId: varchar("transfer_id").notNull().references(() => storeTransfers.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  unitLevel: unitLevelEnum("unit_level").notNull().default("major"),
  qtyEntered: decimal("qty_entered", { precision: 18, scale: 4 }).notNull(),
  qtyInMinor: decimal("qty_in_minor", { precision: 18, scale: 4 }).notNull(),
  selectedExpiryDate: date("selected_expiry_date"),
  selectedExpiryMonth: integer("selected_expiry_month"),
  selectedExpiryYear: integer("selected_expiry_year"),
  availableAtSaveMinor: decimal("available_at_save_minor", { precision: 18, scale: 4 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  transferIdx: index("idx_transfer_lines_transfer").on(table.transferId),
  itemIdx: index("idx_transfer_lines_item").on(table.itemId),
}));

export const transferLineAllocations = pgTable("transfer_line_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lineId: varchar("line_id").notNull().references(() => transferLines.id, { onDelete: "cascade" }),
  sourceLotId: varchar("source_lot_id").notNull().references(() => inventoryLots.id),
  expiryDate: date("expiry_date"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  qtyOutInMinor: decimal("qty_out_in_minor", { precision: 18, scale: 4 }).notNull(),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 4 }).notNull(),
  destinationLotId: varchar("destination_lot_id").references(() => inventoryLots.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  lineIdx: index("idx_transfer_allocs_line").on(table.lineId),
}));

export const itemBarcodes = pgTable("item_barcodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  barcodeValue: varchar("barcode_value", { length: 50 }).notNull().unique(),
  barcodeType: varchar("barcode_type", { length: 20 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  itemIdx: index("idx_barcodes_item").on(table.itemId),
}));

export const receivingStatusEnum = pgEnum("receiving_status", ["draft", "posted", "posted_qty_only"]);
export const purchaseInvoiceStatusEnum = pgEnum("purchase_invoice_status", ["draft", "approved_costed"]);

export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  phone: text("phone"),
  taxId: varchar("tax_id", { length: 30 }),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: index("idx_suppliers_code").on(table.code),
  nameArIdx: index("idx_suppliers_name_ar").on(table.nameAr),
}));

export const receivingHeaders = pgTable("receiving_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receivingNumber: integer("receiving_number").notNull().unique(),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id),
  supplierInvoiceNo: text("supplier_invoice_no").notNull(),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id),
  receiveDate: date("receive_date").notNull(),
  notes: text("notes"),
  status: receivingStatusEnum("status").notNull().default("draft"),
  totalQty: decimal("total_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 18, scale: 2 }).notNull().default("0"),
  postedAt: timestamp("posted_at"),
  convertedToInvoiceId: varchar("converted_to_invoice_id"),
  convertedAt: timestamp("converted_at"),
  correctionOfId: varchar("correction_of_id"),
  correctedById: varchar("corrected_by_id"),
  correctionStatus: text("correction_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  supplierInvoiceUniq: uniqueIndex("idx_receiving_supplier_invoice").on(table.supplierId, table.supplierInvoiceNo),
  numberIdx: index("idx_receiving_number").on(table.receivingNumber),
  supplierIdx: index("idx_receiving_supplier").on(table.supplierId),
  warehouseIdx: index("idx_receiving_warehouse").on(table.warehouseId),
  dateIdx: index("idx_receiving_date").on(table.receiveDate),
  statusIdx: index("idx_receiving_status").on(table.status),
}));

export const receivingLines = pgTable("receiving_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receivingId: varchar("receiving_id").notNull().references(() => receivingHeaders.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  unitLevel: unitLevelEnum("unit_level").notNull().default("major"),
  qtyEntered: decimal("qty_entered", { precision: 18, scale: 4 }).notNull(),
  qtyInMinor: decimal("qty_in_minor", { precision: 18, scale: 4 }).notNull(),
  bonusQty: decimal("bonus_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  bonusQtyInMinor: decimal("bonus_qty_in_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 4 }).notNull().default("0"),
  lineTotal: decimal("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }),
  salePriceHint: decimal("sale_price_hint", { precision: 18, scale: 2 }),
  notes: text("notes"),
  isRejected: boolean("is_rejected").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  receivingIdx: index("idx_receiving_lines_receiving").on(table.receivingId),
  itemIdx: index("idx_receiving_lines_item").on(table.itemId),
}));

export const purchaseInvoiceHeaders = pgTable("purchase_invoice_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: integer("invoice_number").notNull().unique(),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id),
  supplierInvoiceNo: text("supplier_invoice_no").notNull(),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id),
  receivingId: varchar("receiving_id").references(() => receivingHeaders.id),
  invoiceDate: date("invoice_date").notNull(),
  status: purchaseInvoiceStatusEnum("status").notNull().default("draft"),
  discountType: text("discount_type").default("percent"),
  discountValue: decimal("discount_value", { precision: 18, scale: 4 }).notNull().default("0"),
  totalBeforeVat: decimal("total_before_vat", { precision: 18, scale: 2 }).notNull().default("0"),
  totalVat: decimal("total_vat", { precision: 18, scale: 2 }).notNull().default("0"),
  totalAfterVat: decimal("total_after_vat", { precision: 18, scale: 2 }).notNull().default("0"),
  totalLineDiscounts: decimal("total_line_discounts", { precision: 18, scale: 2 }).notNull().default("0"),
  netPayable: decimal("net_payable", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  numberIdx: index("idx_pi_number").on(table.invoiceNumber),
  supplierIdx: index("idx_pi_supplier").on(table.supplierId),
  receivingIdx: index("idx_pi_receiving").on(table.receivingId),
  statusIdx: index("idx_pi_status").on(table.status),
  dateIdx: index("idx_pi_date").on(table.invoiceDate),
}));

export const purchaseInvoiceLines = pgTable("purchase_invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => purchaseInvoiceHeaders.id, { onDelete: "cascade" }),
  receivingLineId: varchar("receiving_line_id"),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  unitLevel: unitLevelEnum("unit_level").notNull().default("major"),
  qty: decimal("qty", { precision: 18, scale: 4 }).notNull(),
  bonusQty: decimal("bonus_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  sellingPrice: decimal("selling_price", { precision: 18, scale: 2 }).notNull().default("0"),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 4 }).notNull().default("0"),
  lineDiscountPct: decimal("line_discount_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  lineDiscountValue: decimal("line_discount_value", { precision: 18, scale: 2 }).notNull().default("0"),
  vatRate: decimal("vat_rate", { precision: 8, scale: 4 }).notNull().default("0"),
  valueBeforeVat: decimal("value_before_vat", { precision: 18, scale: 2 }).notNull().default("0"),
  vatAmount: decimal("vat_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  valueAfterVat: decimal("value_after_vat", { precision: 18, scale: 2 }).notNull().default("0"),
  batchNumber: text("batch_number"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  invoiceIdx: index("idx_pi_lines_invoice").on(table.invoiceId),
  itemIdx: index("idx_pi_lines_item").on(table.itemId),
}));

// فواتير المبيعات
export const salesInvoiceHeaders = pgTable("sales_invoice_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: integer("invoice_number").notNull().unique(),
  invoiceDate: date("invoice_date").notNull(),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  customerType: customerTypeEnum("customer_type").notNull().default("cash"),
  customerName: text("customer_name"),
  contractCompany: text("contract_company"),
  status: salesInvoiceStatusEnum("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type").default("percent"),
  discountPercent: decimal("discount_percent", { precision: 8, scale: 4 }).notNull().default("0"),
  discountValue: decimal("discount_value", { precision: 18, scale: 2 }).notNull().default("0"),
  netTotal: decimal("net_total", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  finalizedAt: timestamp("finalized_at"),
  finalizedBy: varchar("finalized_by"),
  isReturn: boolean("is_return").notNull().default(false),
  originalInvoiceId: varchar("original_invoice_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("idx_sales_inv_date").on(table.invoiceDate),
  statusIdx: index("idx_sales_inv_status").on(table.status),
  isReturnIdx: index("idx_sales_inv_is_return").on(table.isReturn),
  pharmacyIdx: index("idx_sales_inv_pharmacy").on(table.pharmacyId),
}));

export const salesInvoiceLines = pgTable("sales_invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  unitLevel: unitLevelEnum("unit_level").notNull().default("major"),
  qty: decimal("qty", { precision: 18, scale: 4 }).notNull(),
  qtyInMinor: decimal("qty_in_minor", { precision: 18, scale: 4 }).notNull(),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  lotId: varchar("lot_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// الخدمات (Service Master)
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 30 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  departmentId: varchar("department_id").notNull().references(() => departments.id),
  category: text("category"),
  serviceType: text("service_type").notNull().default("SERVICE"),
  defaultWarehouseId: varchar("default_warehouse_id").references(() => warehouses.id),
  revenueAccountId: varchar("revenue_account_id").notNull().references(() => accounts.id),
  costCenterId: varchar("cost_center_id").notNull().references(() => costCenters.id),
  basePrice: decimal("base_price", { precision: 18, scale: 2 }).notNull().default("0"),
  requiresDoctor: boolean("requires_doctor").notNull().default(false),
  requiresNurse: boolean("requires_nurse").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: index("idx_services_code").on(table.code),
  deptIdx: index("idx_services_department").on(table.departmentId),
  categoryIdx: index("idx_services_category").on(table.category),
  activeIdx: index("idx_services_active").on(table.isActive),
}));

// قوائم الأسعار
export const priceLists = pgTable("price_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("EGP"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  departmentId: varchar("department_id").references(() => departments.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// بنود قوائم الأسعار
export const priceListItems = pgTable("price_list_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  priceListId: varchar("price_list_id").notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 18, scale: 2 }).notNull(),
  minDiscountPct: decimal("min_discount_pct", { precision: 5, scale: 2 }),
  maxDiscountPct: decimal("max_discount_pct", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  priceListIdx: index("idx_pli_price_list").on(table.priceListId),
  serviceIdx: index("idx_pli_service").on(table.serviceId),
  uniquePriceListService: uniqueIndex("idx_pli_unique").on(table.priceListId, table.serviceId),
}));

// سجل تعديلات الأسعار
export const priceAdjustmentsLog = pgTable("price_adjustments_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  priceListId: varchar("price_list_id").notNull().references(() => priceLists.id),
  actionType: text("action_type").notNull(),
  direction: text("direction").notNull(),
  value: decimal("value", { precision: 18, scale: 4 }).notNull(),
  filterDepartmentId: varchar("filter_department_id"),
  filterCategory: text("filter_category"),
  affectedCount: integer("affected_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// مستهلكات الخدمات
export const serviceConsumables = pgTable("service_consumables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => items.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull().default("1"),
  unitLevel: text("unit_level").notNull().default("minor"),
  notes: text("notes"),
}, (table) => ({
  serviceIdx: index("idx_sc_service").on(table.serviceId),
  uniqueServiceItem: uniqueIndex("idx_sc_unique").on(table.serviceId, table.itemId),
}));

// فواتير المرضى - رأس الفاتورة
export const patientInvoiceHeaders = pgTable("patient_invoice_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: varchar("invoice_number", { length: 30 }).notNull().unique(),
  invoiceDate: date("invoice_date").notNull(),
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone"),
  patientType: patientTypeEnum("patient_type").notNull().default("cash"),
  departmentId: varchar("department_id").references(() => departments.id),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  admissionId: varchar("admission_id"),
  isConsolidated: boolean("is_consolidated").notNull().default(false),
  sourceInvoiceIds: text("source_invoice_ids"),
  doctorName: text("doctor_name"),
  contractName: text("contract_name"),
  notes: text("notes"),
  status: patientInvoiceStatusEnum("status").notNull().default("draft"),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  netAmount: decimal("net_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  invoiceNumIdx: index("idx_pat_inv_number").on(table.invoiceNumber),
  dateIdx: index("idx_pat_inv_date").on(table.invoiceDate),
  patientIdx: index("idx_pat_inv_patient").on(table.patientName),
  doctorIdx: index("idx_pat_inv_doctor").on(table.doctorName),
  statusIdx: index("idx_pat_inv_status").on(table.status),
  admissionIdx: index("idx_pat_inv_admission").on(table.admissionId),
}));

// فواتير المرضى - بنود الفاتورة
export const patientInvoiceLines = pgTable("patient_invoice_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headerId: varchar("header_id").notNull().references(() => patientInvoiceHeaders.id, { onDelete: "cascade" }),
  lineType: patientInvoiceLineTypeEnum("line_type").notNull(),
  serviceId: varchar("service_id").references(() => services.id),
  itemId: varchar("item_id").references(() => items.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 18, scale: 2 }).notNull().default("0"),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalPrice: decimal("total_price", { precision: 18, scale: 2 }).notNull().default("0"),
  unitLevel: text("unit_level").notNull().default("minor"),
  lotId: varchar("lot_id"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  priceSource: text("price_source"),
  doctorName: text("doctor_name"),
  nurseName: text("nurse_name"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  headerIdx: index("idx_pat_line_header").on(table.headerId),
  typeIdx: index("idx_pat_line_type").on(table.lineType),
}));

// فواتير المرضى - سداد الدفعات
export const patientInvoicePayments = pgTable("patient_invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headerId: varchar("header_id").notNull().references(() => patientInvoiceHeaders.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  headerIdx: index("idx_pat_pay_header").on(table.headerId),
}));

// ورديات الكاشير
export const cashierShifts = pgTable("cashier_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cashierId: varchar("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  status: cashierShiftStatusEnum("status").notNull().default("open"),
  openingCash: decimal("opening_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  closingCash: decimal("closing_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  expectedCash: decimal("expected_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  variance: decimal("variance", { precision: 18, scale: 2 }).notNull().default("0"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  cashierIdx: index("idx_cashier_shifts_cashier").on(table.cashierId),
  statusIdx: index("idx_cashier_shifts_status").on(table.status),
  openedAtIdx: index("idx_cashier_shifts_opened").on(table.openedAt),
  pharmacyIdx: index("idx_cashier_shifts_pharmacy").on(table.pharmacyId),
}));

// إيصالات تحصيل الكاشير
export const cashierReceipts = pgTable("cashier_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: integer("receipt_number").notNull(),
  shiftId: varchar("shift_id").notNull().references(() => cashierShifts.id),
  invoiceId: varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  collectedBy: text("collected_by").notNull(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
}, (table) => ({
  shiftIdx: index("idx_cashier_receipts_shift").on(table.shiftId),
  invoiceUniq: uniqueIndex("idx_cashier_receipts_invoice_unique").on(table.invoiceId),
  receiptNumIdx: index("idx_cashier_receipts_number").on(table.receiptNumber),
}));

// إيصالات رد المرتجعات
export const cashierRefundReceipts = pgTable("cashier_refund_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: integer("receipt_number").notNull(),
  shiftId: varchar("shift_id").notNull().references(() => cashierShifts.id),
  invoiceId: varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  refundedBy: text("refunded_by").notNull(),
  refundedAt: timestamp("refunded_at").notNull().defaultNow(),
}, (table) => ({
  shiftIdx: index("idx_cashier_refunds_shift").on(table.shiftId),
  invoiceUniq: uniqueIndex("idx_cashier_refunds_invoice_unique").on(table.invoiceId),
  receiptNumIdx: index("idx_cashier_refunds_number").on(table.receiptNumber),
}));

// سجل أحداث الكاشير
export const cashierAuditLog = pgTable("cashier_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftId: varchar("shift_id").references(() => cashierShifts.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  performedBy: text("performed_by").notNull(),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
}, (table) => ({
  shiftIdx: index("idx_cashier_audit_shift").on(table.shiftId),
  actionIdx: index("idx_cashier_audit_action").on(table.action),
  performedAtIdx: index("idx_cashier_audit_performed").on(table.performedAt),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFiscalPeriodSchema = createInsertSchema(fiscalPeriods).omit({ id: true, createdAt: true, closedAt: true });
export const insertCostCenterSchema = createInsertSchema(costCenters).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ 
  id: true, 
  entryNumber: true,
  createdAt: true, 
  updatedAt: true,
  postedAt: true,
  reversedAt: true 
});
export const insertJournalLineSchema = createInsertSchema(journalLines).omit({ id: true });
export const insertJournalTemplateSchema = createInsertSchema(journalTemplates).omit({ id: true, createdAt: true });
export const insertTemplateLineSchema = createInsertSchema(templateLines).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, createdAt: true });
export const insertItemFormTypeSchema = createInsertSchema(itemFormTypes).omit({ id: true, createdAt: true });
export const insertItemUomSchema = createInsertSchema(itemUoms).omit({ id: true, createdAt: true });
export const insertItemSchema = createInsertSchema(items).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseTransactionSchema = createInsertSchema(purchaseTransactions).omit({ id: true, createdAt: true });
export const insertSalesTransactionSchema = createInsertSchema(salesTransactions).omit({ id: true, createdAt: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true });
export const insertItemDepartmentPriceSchema = createInsertSchema(itemDepartmentPrices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true, createdAt: true });
export const insertUserDepartmentSchema = createInsertSchema(userDepartments).omit({ id: true, createdAt: true });
export const insertUserWarehouseSchema = createInsertSchema(userWarehouses).omit({ id: true, createdAt: true });
export const insertInventoryLotSchema = createInsertSchema(inventoryLots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInventoryLotMovementSchema = createInsertSchema(inventoryLotMovements).omit({ id: true, createdAt: true });
export const insertItemBarcodeSchema = createInsertSchema(itemBarcodes).omit({ id: true, createdAt: true });
export const insertStoreTransferSchema = createInsertSchema(storeTransfers).omit({ id: true, transferNumber: true, createdAt: true, executedAt: true });
export const insertTransferLineSchema = createInsertSchema(transferLines).omit({ id: true, createdAt: true });
export const insertTransferLineAllocationSchema = createInsertSchema(transferLineAllocations).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertReceivingHeaderSchema = createInsertSchema(receivingHeaders).omit({ id: true, receivingNumber: true, createdAt: true, updatedAt: true, postedAt: true, convertedToInvoiceId: true, convertedAt: true, correctionOfId: true, correctedById: true, correctionStatus: true });
export const insertReceivingLineSchema = createInsertSchema(receivingLines).omit({ id: true, createdAt: true });
export const insertPurchaseInvoiceHeaderSchema = createInsertSchema(purchaseInvoiceHeaders).omit({ id: true, invoiceNumber: true, createdAt: true, updatedAt: true, approvedAt: true, approvedBy: true });
export const insertPurchaseInvoiceLineSchema = createInsertSchema(purchaseInvoiceLines).omit({ id: true, createdAt: true });

export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceListSchema = createInsertSchema(priceLists).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceListItemSchema = createInsertSchema(priceListItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceAdjustmentLogSchema = createInsertSchema(priceAdjustmentsLog).omit({ id: true, createdAt: true });
export const insertServiceConsumableSchema = createInsertSchema(serviceConsumables).omit({ id: true });

export const insertPatientInvoiceHeaderSchema = createInsertSchema(patientInvoiceHeaders).omit({ id: true, createdAt: true, updatedAt: true, finalizedAt: true });
export const insertPatientInvoiceLineSchema = createInsertSchema(patientInvoiceLines).omit({ id: true, createdAt: true });
export const insertPatientInvoicePaymentSchema = createInsertSchema(patientInvoicePayments).omit({ id: true, createdAt: true });

export const insertPharmacySchema = createInsertSchema(pharmacies).omit({ id: true, createdAt: true });
export const insertCashierShiftSchema = createInsertSchema(cashierShifts).omit({ id: true, openedAt: true, closedAt: true });
export const insertCashierReceiptSchema = createInsertSchema(cashierReceipts).omit({ id: true, collectedAt: true });
export const insertCashierRefundReceiptSchema = createInsertSchema(cashierRefundReceipts).omit({ id: true, refundedAt: true });
export const insertCashierAuditLogSchema = createInsertSchema(cashierAuditLog).omit({ id: true, performedAt: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertFiscalPeriod = z.infer<typeof insertFiscalPeriodSchema>;
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect;

export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;
export type CostCenter = typeof costCenters.$inferSelect;

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;
export type JournalLine = typeof journalLines.$inferSelect;

export type InsertJournalTemplate = z.infer<typeof insertJournalTemplateSchema>;
export type JournalTemplate = typeof journalTemplates.$inferSelect;

export type InsertTemplateLine = z.infer<typeof insertTemplateLineSchema>;
export type TemplateLine = typeof templateLines.$inferSelect;

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

export type InsertItemFormType = z.infer<typeof insertItemFormTypeSchema>;
export type ItemFormType = typeof itemFormTypes.$inferSelect;

export type InsertItemUom = z.infer<typeof insertItemUomSchema>;
export type ItemUom = typeof itemUoms.$inferSelect;

export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

export type InsertPurchaseTransaction = z.infer<typeof insertPurchaseTransactionSchema>;
export type PurchaseTransaction = typeof purchaseTransactions.$inferSelect;

export type InsertSalesTransaction = z.infer<typeof insertSalesTransactionSchema>;
export type SalesTransaction = typeof salesTransactions.$inferSelect;

export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export type InsertItemDepartmentPrice = z.infer<typeof insertItemDepartmentPriceSchema>;
export type ItemDepartmentPrice = typeof itemDepartmentPrices.$inferSelect;

export type InsertInventoryLot = z.infer<typeof insertInventoryLotSchema>;
export type InventoryLot = typeof inventoryLots.$inferSelect;

export type InsertInventoryLotMovement = z.infer<typeof insertInventoryLotMovementSchema>;
export type InventoryLotMovement = typeof inventoryLotMovements.$inferSelect;

export type InsertItemBarcode = z.infer<typeof insertItemBarcodeSchema>;
export type ItemBarcode = typeof itemBarcodes.$inferSelect;

export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

export type InsertUserDepartment = z.infer<typeof insertUserDepartmentSchema>;
export type UserDepartment = typeof userDepartments.$inferSelect;

export type InsertUserWarehouse = z.infer<typeof insertUserWarehouseSchema>;
export type UserWarehouse = typeof userWarehouses.$inferSelect;

export type InsertStoreTransfer = z.infer<typeof insertStoreTransferSchema>;
export type StoreTransfer = typeof storeTransfers.$inferSelect;

export type InsertTransferLine = z.infer<typeof insertTransferLineSchema>;
export type TransferLine = typeof transferLines.$inferSelect;

export type InsertTransferLineAllocation = z.infer<typeof insertTransferLineAllocationSchema>;
export type TransferLineAllocation = typeof transferLineAllocations.$inferSelect;

export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

export type InsertReceivingHeader = z.infer<typeof insertReceivingHeaderSchema>;
export type ReceivingHeader = typeof receivingHeaders.$inferSelect;

export type InsertReceivingLine = z.infer<typeof insertReceivingLineSchema>;
export type ReceivingLine = typeof receivingLines.$inferSelect;

export type InsertPurchaseInvoiceHeader = z.infer<typeof insertPurchaseInvoiceHeaderSchema>;
export type PurchaseInvoiceHeader = typeof purchaseInvoiceHeaders.$inferSelect;

export type InsertPurchaseInvoiceLine = z.infer<typeof insertPurchaseInvoiceLineSchema>;
export type PurchaseInvoiceLine = typeof purchaseInvoiceLines.$inferSelect;

// Extended types for API responses
export type JournalEntryWithLines = JournalEntry & {
  lines: (JournalLine & {
    account?: Account;
    costCenter?: CostCenter;
  })[];
  createdByUser?: User;
  postedByUser?: User;
  period?: FiscalPeriod;
};

export type AccountWithChildren = Account & {
  children?: AccountWithChildren[];
};

export type CostCenterWithChildren = CostCenter & {
  children?: CostCenterWithChildren[];
};

// Account type labels in Arabic
export const accountTypeLabels: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات"
};

// Journal status labels in Arabic
export const journalStatusLabels: Record<string, string> = {
  draft: "مسودة",
  posted: "مُرحّل",
  reversed: "ملغي"
};

// Item category labels in Arabic
export const itemCategoryLabels: Record<string, string> = {
  drug: "دواء",
  supply: "مستلزمات",
  service: "خدمة"
};

// Unit level labels in Arabic
export const unitLevelLabels: Record<string, string> = {
  major: "وحدة كبرى",
  medium: "وحدة متوسطة",
  minor: "وحدة صغرى"
};

// Extended type for Item with form type
export type ItemWithFormType = Item & {
  formType?: ItemFormType;
};

// Extended type for ItemDepartmentPrice with department info
export type ItemDepartmentPriceWithDepartment = ItemDepartmentPrice & {
  department?: Department;
};

// Extended type for TransferLine with item info
export type TransferLineWithItem = TransferLine & {
  item?: Item;
};

// Extended type for StoreTransfer with related info
export type StoreTransferWithDetails = StoreTransfer & {
  sourceWarehouse?: Warehouse;
  destinationWarehouse?: Warehouse;
  lines?: TransferLineWithItem[];
};

// Transfer status labels in Arabic
export const transferStatusLabels: Record<string, string> = {
  draft: "مسودة",
  executed: "مُنفّذ"
};

export type ReceivingLineWithItem = ReceivingLine & {
  item?: Item;
};

export type ReceivingHeaderWithDetails = ReceivingHeader & {
  supplier?: Supplier;
  warehouse?: Warehouse;
  lines?: ReceivingLineWithItem[];
};

export const receivingStatusLabels: Record<string, string> = {
  draft: "مسودة",
  posted: "مُرحّل",
  posted_qty_only: "مُرحّل (كمية فقط)",
};

export const correctionStatusLabels: Record<string, string> = {
  corrected: "مُصحَّح",
  correction: "تصحيح",
};

export type PurchaseInvoiceLineWithItem = PurchaseInvoiceLine & {
  item?: Item;
};

export type PurchaseInvoiceWithDetails = PurchaseInvoiceHeader & {
  supplier?: Supplier;
  warehouse?: Warehouse;
  receiving?: ReceivingHeader;
  lines?: PurchaseInvoiceLineWithItem[];
};

export const purchaseInvoiceStatusLabels: Record<string, string> = {
  draft: "مسودة",
  approved_costed: "مُعتمد ومُسعّر"
};

export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;

export type InsertPriceList = z.infer<typeof insertPriceListSchema>;
export type PriceList = typeof priceLists.$inferSelect;

export type InsertPriceListItem = z.infer<typeof insertPriceListItemSchema>;
export type PriceListItem = typeof priceListItems.$inferSelect;

export type InsertPriceAdjustmentLog = z.infer<typeof insertPriceAdjustmentLogSchema>;
export type PriceAdjustmentLog = typeof priceAdjustmentsLog.$inferSelect;

export type InsertServiceConsumable = z.infer<typeof insertServiceConsumableSchema>;
export type ServiceConsumable = typeof serviceConsumables.$inferSelect;

export type ServiceConsumableWithItem = ServiceConsumable & {
  item?: Item;
};

export type ServiceWithDepartment = Service & {
  department?: Department;
  revenueAccount?: Account;
  costCenter?: CostCenter;
};

export type PriceListItemWithService = PriceListItem & {
  service?: Service & { department?: Department };
};

export const serviceTypeLabels: Record<string, string> = {
  SERVICE: "خدمة",
  ACCOMMODATION: "إقامة",
  OPERATING_ROOM: "فتح غرفة عمليات",
  DEVICE: "جهاز",
  GAS: "غاز",
  OTHER: "أخرى"
};

export const insertSalesInvoiceHeaderSchema = createInsertSchema(salesInvoiceHeaders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSalesInvoiceLineSchema = createInsertSchema(salesInvoiceLines).omit({ id: true, createdAt: true });

export type InsertSalesInvoiceHeader = z.infer<typeof insertSalesInvoiceHeaderSchema>;
export type SalesInvoiceHeader = typeof salesInvoiceHeaders.$inferSelect;
export type InsertSalesInvoiceLine = z.infer<typeof insertSalesInvoiceLineSchema>;
export type SalesInvoiceLine = typeof salesInvoiceLines.$inferSelect;

export type SalesInvoiceLineWithItem = SalesInvoiceLine & {
  item?: Item;
};

export type SalesInvoiceWithDetails = SalesInvoiceHeader & {
  warehouse?: Warehouse;
  lines?: SalesInvoiceLineWithItem[];
};

export const salesInvoiceStatusLabels: Record<string, string> = {
  draft: "مسودة",
  finalized: "نهائي",
  collected: "مُحصّل",
  cancelled: "ملغي",
};

export const customerTypeLabels: Record<string, string> = {
  cash: "نقدي",
  credit: "آجل",
  contract: "تعاقد",
};

export const insertPatientInvoiceHeader = insertPatientInvoiceHeaderSchema;
export type InsertPatientInvoiceHeader = z.infer<typeof insertPatientInvoiceHeaderSchema>;
export type PatientInvoiceHeader = typeof patientInvoiceHeaders.$inferSelect;

export type InsertPatientInvoiceLine = z.infer<typeof insertPatientInvoiceLineSchema>;
export type PatientInvoiceLine = typeof patientInvoiceLines.$inferSelect;

export type InsertPatientInvoicePayment = z.infer<typeof insertPatientInvoicePaymentSchema>;
export type PatientInvoicePayment = typeof patientInvoicePayments.$inferSelect;

export type PatientInvoiceLineWithDetails = PatientInvoiceLine & {
  service?: Service;
  item?: Item;
};

export type PatientInvoiceWithDetails = PatientInvoiceHeader & {
  department?: Department;
  lines?: PatientInvoiceLineWithDetails[];
  payments?: PatientInvoicePayment[];
};

export const patientInvoiceStatusLabels: Record<string, string> = {
  draft: "مسودة",
  finalized: "نهائي",
  cancelled: "ملغي",
};

export const patientTypeLabels: Record<string, string> = {
  cash: "نقدي",
  contract: "تعاقد",
};

export const lineTypeLabels: Record<string, string> = {
  service: "خدمة",
  drug: "دواء",
  consumable: "مستهلكات",
  equipment: "أجهزة",
};

export const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  bank_transfer: "تحويل بنكي",
  insurance: "تأمين",
};

// سجل المرضى
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 11 }),
  nationalId: varchar("national_id", { length: 14 }),
  age: integer("age"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("idx_patients_name").on(table.fullName),
  phoneIdx: index("idx_patients_phone").on(table.phone),
  nationalIdIdx: index("idx_patients_national_id").on(table.nationalId),
}));

export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// سجل الأطباء
export const doctors = pgTable("doctors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  specialty: text("specialty"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("idx_doctors_name").on(table.name),
}));

export const insertDoctorSchema = createInsertSchema(doctors).omit({ id: true, createdAt: true });
export type InsertDoctor = z.infer<typeof insertDoctorSchema>;
export type Doctor = typeof doctors.$inferSelect;

export type InsertPharmacy = z.infer<typeof insertPharmacySchema>;
export type Pharmacy = typeof pharmacies.$inferSelect;

export type InsertCashierShift = z.infer<typeof insertCashierShiftSchema>;
export type CashierShift = typeof cashierShifts.$inferSelect;

export type InsertCashierReceipt = z.infer<typeof insertCashierReceiptSchema>;
export type CashierReceipt = typeof cashierReceipts.$inferSelect;

export type InsertCashierRefundReceipt = z.infer<typeof insertCashierRefundReceiptSchema>;
export type CashierRefundReceipt = typeof cashierRefundReceipts.$inferSelect;

export type InsertCashierAuditLog = z.infer<typeof insertCashierAuditLogSchema>;
export type CashierAuditLogEntry = typeof cashierAuditLog.$inferSelect;

export const cashierShiftStatusLabels: Record<string, string> = {
  open: "مفتوحة",
  closed: "مغلقة",
};

// إقامات المرضى
export const admissions = pgTable("admissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  admissionNumber: varchar("admission_number", { length: 30 }).notNull().unique(),
  patientId: varchar("patient_id").references(() => patients.id),
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone"),
  admissionDate: date("admission_date").notNull(),
  dischargeDate: date("discharge_date"),
  status: admissionStatusEnum("status").notNull().default("active"),
  doctorName: text("doctor_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  admNumIdx: index("idx_adm_number").on(table.admissionNumber),
  patientIdx: index("idx_adm_patient").on(table.patientName),
  statusIdx: index("idx_adm_status").on(table.status),
  dateIdx: index("idx_adm_date").on(table.admissionDate),
}));

export const insertAdmissionSchema = createInsertSchema(admissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdmission = z.infer<typeof insertAdmissionSchema>;
export type Admission = typeof admissions.$inferSelect;

// إعدادات ربط الحسابات بالعمليات
export const accountMappings = pgTable("account_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionType: text("transaction_type").notNull(),
  lineType: text("line_type").notNull(),
  debitAccountId: varchar("debit_account_id").references(() => accounts.id),
  creditAccountId: varchar("credit_account_id").references(() => accounts.id),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  txTypeIdx: index("idx_acct_map_tx_type").on(table.transactionType),
  uniqueMapping: uniqueIndex("idx_acct_map_unique").on(table.transactionType, table.lineType),
}));

export const insertAccountMappingSchema = createInsertSchema(accountMappings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccountMapping = z.infer<typeof insertAccountMappingSchema>;
export type AccountMapping = typeof accountMappings.$inferSelect;

export const transactionTypeLabels: Record<string, string> = {
  sales_invoice: "فاتورة مبيعات",
  patient_invoice: "فاتورة مريض",
  receiving: "استلام مورد",
  purchase_invoice: "فاتورة مشتريات",
  cashier_collection: "تحصيل كاشير",
  cashier_refund: "مرتجع كاشير",
  warehouse_transfer: "تحويلات مخزنية",
};

export const mappingLineTypeLabels: Record<string, string> = {
  revenue_services: "إيرادات خدمات",
  revenue_drugs: "إيرادات أدوية",
  revenue_consumables: "إيرادات مستهلكات",
  revenue_equipment: "إيرادات أجهزة",
  revenue_general: "إيرادات عامة",
  cogs: "تكلفة بضاعة مباعة",
  inventory: "المخزون",
  cash: "الصندوق / النقدية",
  receivables: "ذمم مدينة",
  payables: "ذمم دائنة (موردين)",
  returns: "مردودات",
  expense_general: "مصروفات عامة",
};

export const sourceTypeLabels: Record<string, string> = {
  sales_invoice: "فاتورة مبيعات",
  patient_invoice: "فاتورة مريض",
  receiving: "استلام مورد",
  purchase_invoice: "فاتورة مشتريات",
  cashier_collection: "تحصيل كاشير",
  cashier_refund: "مرتجع كاشير",
  warehouse_transfer: "تحويلات مخزنية",
  manual: "يدوي",
};
