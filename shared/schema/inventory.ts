import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex, pgSequence } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { itemCategoryEnum, unitLevelEnum, lotTxTypeEnum, transferStatusEnum } from "./enums";
import { users } from "./users";
import { accounts, costCenters, journalEntries } from "./finance";

// ── Sequences managed outside Drizzle but declared here to prevent drizzle-kit from dropping them ──
export const patientCodeSeq              = pgSequence("patient_code_seq",              { startWith: 1, increment: 1 });
export const stockCountSessionNumberSeq  = pgSequence("stock_count_session_number_seq", { startWith: 1, increment: 1 });

export const itemFormTypes = pgTable("item_form_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const itemUoms = pgTable("item_uoms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  allowFractionalSale: boolean("allow_fractional_sale").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  // ── ضريبة القيمة المضافة — الصيدلية فقط (nullable — آمن للبيانات القائمة) ─
  taxType: text("tax_type"),         // 'exempt' | 'taxable' | 'zero_rated' | null
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 2 }),
  pharmacyPricesIncludeTax: boolean("pharmacy_prices_include_tax").default(false),
  // ── تصنيف تجاري مستقل عن category — لا يؤثر على FEFO أو المحاسبة ─────────
  businessClassification: varchar("business_classification"),
  // ── إعدادات الصرف بدون رصيد ─────────────────────────────────────────────
  allowOversell: boolean("allow_oversell").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx:  index("idx_items_category").on(table.category),
  nameArIdx:    index("idx_items_name_ar").on(table.nameAr),
  formTypeIdx:  index("idx_items_form_type").on(table.formTypeId),
  isActiveIdx:  index("idx_items_is_active").on(table.isActive),
  bizClassIdx:  index("idx_items_biz_class").on(table.businessClassification),
}));

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
  bonusQty: decimal("bonus_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  supplierInvoiceNo: text("supplier_invoice_no"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  itemIdx: index("idx_purchase_tx_item").on(table.itemId),
  dateIdx: index("idx_purchase_tx_date").on(table.txDate),
}));

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

export const userClinics = pgTable("user_clinics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clinicId: varchar("clinic_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueUserClinic: uniqueIndex("idx_user_clinics_unique").on(table.userId, table.clinicId),
}));

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
  glAccountId: varchar("gl_account_id").references(() => accounts.id),
  costCenterId: varchar("cost_center_id").references(() => costCenters.id),
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
  provisionalPurchasePrice: decimal("provisional_purchase_price", { precision: 18, scale: 4 }),
  costingStatus: text("costing_status").notNull().default("provisional"),
  costedAt: timestamp("costed_at"),
  costSourceType: text("cost_source_type"),
  costSourceId: varchar("cost_source_id"),
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
  /* فهرس لاستعلام الاقتراح الذكي في التحويلات المخزنية */
  warehouseTxTypeRefDateIdx: index("idx_lot_movements_wh_txtype_ref_date")
    .on(table.warehouseId, table.txType, table.referenceType, table.txDate),
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

export const stockMovementHeaders = pgTable("stock_movement_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operationType: varchar("operation_type", { length: 50 }).notNull(),
  referenceType: varchar("reference_type", { length: 50 }).notNull(),
  referenceId: varchar("reference_id").notNull(),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  totalCost: decimal("total_cost", { precision: 18, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("posted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by"),
}, (table) => ({
  refIdx: index("idx_smh_ref").on(table.referenceType, table.referenceId),
  uniqueRef: uniqueIndex("idx_smh_ref_unique").on(table.referenceType, table.referenceId),
}));

export const stockMovementAllocations = pgTable("stock_movement_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movementHeaderId: varchar("movement_header_id").notNull().references(() => stockMovementHeaders.id, { onDelete: "cascade" }),
  lotId: varchar("lot_id").notNull().references(() => inventoryLots.id),
  allocKey: varchar("alloc_key", { length: 255 }).notNull(),
  qtyAllocatedMinor: decimal("qty_allocated_minor", { precision: 18, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 18, scale: 4 }).notNull(),
  costAllocated: decimal("cost_allocated", { precision: 18, scale: 2 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull().default("STOCK_MOVEMENT_ALLOC"),
  sourceId: varchar("source_id", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  movementIdx: index("idx_sma_movement").on(table.movementHeaderId),
  sourceUniqueIdx: uniqueIndex("idx_sma_source_unique").on(table.sourceId),
}));

// Insert schemas
export const insertItemFormTypeSchema = createInsertSchema(itemFormTypes).omit({ id: true, createdAt: true });
export const insertItemUomSchema = createInsertSchema(itemUoms).omit({ id: true, createdAt: true });
export const insertItemSchema = createInsertSchema(items, {
  majorUnitName: z.string().nullable(),
  mediumUnitName: z.string().nullable(),
  minorUnitName: z.string().nullable(),
  majorToMedium: z.string().nullable(),
  majorToMinor: z.string().nullable(),
  mediumToMinor: z.string().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseTransactionSchema = createInsertSchema(purchaseTransactions).omit({ id: true, createdAt: true });
export const insertSalesTransactionSchema = createInsertSchema(salesTransactions).omit({ id: true, createdAt: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true });
export const insertItemDepartmentPriceSchema = createInsertSchema(itemDepartmentPrices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true, createdAt: true });
export const insertUserDepartmentSchema = createInsertSchema(userDepartments).omit({ id: true, createdAt: true });
export const insertUserWarehouseSchema = createInsertSchema(userWarehouses).omit({ id: true, createdAt: true });
export const insertUserClinicSchema = createInsertSchema(userClinics).omit({ id: true, createdAt: true });
export type UserClinic = typeof userClinics.$inferSelect;
export const insertInventoryLotSchema = createInsertSchema(inventoryLots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInventoryLotMovementSchema = createInsertSchema(inventoryLotMovements).omit({ id: true, createdAt: true });
export const insertItemBarcodeSchema = createInsertSchema(itemBarcodes).omit({ id: true, createdAt: true });
export const insertStoreTransferSchema = createInsertSchema(storeTransfers).omit({ id: true, transferNumber: true, createdAt: true, executedAt: true });
export const insertTransferLineSchema = createInsertSchema(transferLines).omit({ id: true, createdAt: true });
export const insertTransferLineAllocationSchema = createInsertSchema(transferLineAllocations).omit({ id: true, createdAt: true });
export const insertPharmacySchema = createInsertSchema(pharmacies).omit({ id: true, createdAt: true });

// Types
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

export type InsertPharmacy = z.infer<typeof insertPharmacySchema>;
export type Pharmacy = typeof pharmacies.$inferSelect;

export type StockMovementHeader = typeof stockMovementHeaders.$inferSelect;
export type StockMovementAllocation = typeof stockMovementAllocations.$inferSelect;

// Extended types
export type ItemWithFormType = Item & {
  formType?: ItemFormType;
};

export type ItemDepartmentPriceWithDepartment = ItemDepartmentPrice & {
  department?: Department;
};

export type TransferLineWithItem = TransferLine & {
  item?: Item;
};

export type StoreTransferWithDetails = StoreTransfer & {
  sourceWarehouse?: Warehouse;
  destinationWarehouse?: Warehouse;
  lines?: TransferLineWithItem[];
};

// ── جداول جرد الأصناف (Stock Cycle Count) ──────────────────────────────────

export const stockCountSessions = pgTable("stock_count_sessions", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionNumber:  integer("session_number").notNull().unique(),
  warehouseId:    varchar("warehouse_id").notNull().references(() => warehouses.id),
  countDate:      date("count_date").notNull(),
  status:         text("status").notNull().default("draft"),
  notes:          text("notes"),
  createdBy:      varchar("created_by").references(() => users.id),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  postedBy:       varchar("posted_by").references(() => users.id),
  postedAt:       timestamp("posted_at"),
  journalEntryId: varchar("journal_entry_id").references(() => journalEntries.id),
}, (t) => ({
  whDateIdx:      index("idx_stock_count_sessions_wh_date").on(t.warehouseId, t.countDate),
  statusIdx:      index("idx_stock_count_sessions_status").on(t.status),
}));

export const stockCountLines = pgTable("stock_count_lines", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId:       varchar("session_id").notNull().references(() => stockCountSessions.id, { onDelete: "cascade" }),
  itemId:          varchar("item_id").notNull().references(() => items.id),
  lotId:           varchar("lot_id").references(() => inventoryLots.id),
  expiryDate:      date("expiry_date"),
  systemQtyMinor:  decimal("system_qty_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  countedQtyMinor: decimal("counted_qty_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  differenceMinor: decimal("difference_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  unitCost:        decimal("unit_cost", { precision: 18, scale: 4 }).notNull().default("0"),
  differenceValue: decimal("difference_value", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  sessionItemLotUniq: uniqueIndex("idx_stock_count_lines_uniq").on(t.sessionId, t.itemId, t.lotId),
  sessionIdx:         index("idx_stock_count_lines_session").on(t.sessionId),
  itemIdx:            index("idx_stock_count_lines_item").on(t.itemId),
  lotIdx:             index("idx_stock_count_lines_lot").on(t.lotId),
}));

export const insertStockCountSessionSchema = createInsertSchema(stockCountSessions).omit({
  id: true, sessionNumber: true, createdAt: true, postedAt: true,
});
export const insertStockCountLineSchema = createInsertSchema(stockCountLines).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type StockCountSession    = typeof stockCountSessions.$inferSelect;
export type InsertStockCountSession = z.infer<typeof insertStockCountSessionSchema>;
export type StockCountLine       = typeof stockCountLines.$inferSelect;
export type InsertStockCountLine = z.infer<typeof insertStockCountLineSchema>;

export const stockCountStatusLabels: Record<string, string> = {
  draft:     "مسودة",
  posted:    "مُرحَّل",
  cancelled: "مُلغى",
};

// ── جداول الرصيد الافتتاحي للمخزن (Opening Stock) ────────────────────────────

export const openingStockHeaders = pgTable("opening_stock_headers", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id),
  postDate:    date("post_date").notNull(),
  status:      text("status").notNull().default("draft"),
  notes:       text("notes"),
  createdBy:   varchar("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  postedBy:    varchar("posted_by").references(() => users.id),
  postedAt:    timestamp("posted_at"),
  journalEntryId: varchar("journal_entry_id").references(() => journalEntries.id),
}, (t) => ({
  warehouseIdx:  index("idx_opening_stock_headers_wh").on(t.warehouseId),
  statusIdx:     index("idx_opening_stock_headers_status").on(t.status),
}));

export const openingStockLines = pgTable("opening_stock_lines", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headerId:      varchar("header_id").notNull().references(() => openingStockHeaders.id, { onDelete: "cascade" }),
  itemId:        varchar("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
  unitLevel:     unitLevelEnum("unit_level").notNull().default("major"),
  qtyInUnit:     decimal("qty_in_unit",  { precision: 18, scale: 4 }).notNull(),
  qtyInMinor:    decimal("qty_in_minor", { precision: 18, scale: 4 }).notNull().default("0"),
  purchasePrice: decimal("purchase_price", { precision: 18, scale: 4 }).notNull().default("0"),
  salePrice:     decimal("sale_price",     { precision: 18, scale: 2 }).notNull().default("0"),
  batchNo:       text("batch_no"),
  expiryMonth:   integer("expiry_month"),
  expiryYear:    integer("expiry_year"),
  lineNotes:     text("line_notes"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  headerIdx: index("idx_opening_stock_lines_header").on(t.headerId),
  itemIdx:   index("idx_opening_stock_lines_item").on(t.itemId),
}));

export const insertOpeningStockHeaderSchema = createInsertSchema(openingStockHeaders).omit({
  id: true, createdAt: true, postedAt: true,
});
export const insertOpeningStockLineSchema = createInsertSchema(openingStockLines).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type OpeningStockHeader    = typeof openingStockHeaders.$inferSelect;
export type InsertOpeningStockHeader = z.infer<typeof insertOpeningStockHeaderSchema>;
export type OpeningStockLine      = typeof openingStockLines.$inferSelect;
export type InsertOpeningStockLine = z.infer<typeof insertOpeningStockLineSchema>;

// Labels
export const itemCategoryLabels: Record<string, string> = {
  drug: "دواء",
  supply: "مستلزمات",
  service: "خدمة"
};

export const unitLevelLabels: Record<string, string> = {
  major: "وحدة كبرى",
  medium: "وحدة متوسطة",
  minor: "وحدة صغرى"
};

export const transferStatusLabels: Record<string, string> = {
  draft: "مسودة",
  executed: "مُنفّذ"
};
