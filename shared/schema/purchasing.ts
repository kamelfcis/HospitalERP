import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { receivingStatusEnum, purchaseInvoiceStatusEnum, unitLevelEnum } from "./enums";
import { items, warehouses } from "./inventory";

export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  phone: text("phone"),
  taxId: varchar("tax_id", { length: 30 }),
  address: text("address"),
  supplierType: text("supplier_type").notNull().default("drugs"),
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

// Insert schemas
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertReceivingHeaderSchema = createInsertSchema(receivingHeaders).omit({ id: true, receivingNumber: true, createdAt: true, updatedAt: true, postedAt: true, convertedToInvoiceId: true, convertedAt: true, correctionOfId: true, correctedById: true, correctionStatus: true });
export const insertReceivingLineSchema = createInsertSchema(receivingLines).omit({ id: true, createdAt: true });
export const insertPurchaseInvoiceHeaderSchema = createInsertSchema(purchaseInvoiceHeaders).omit({ id: true, invoiceNumber: true, createdAt: true, updatedAt: true, approvedAt: true, approvedBy: true });
export const insertPurchaseInvoiceLineSchema = createInsertSchema(purchaseInvoiceLines).omit({ id: true, createdAt: true });

// Types
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

// Extended types
export type ReceivingLineWithItem = ReceivingLine & {
  item?: import("./inventory").Item;
};

export type ReceivingHeaderWithDetails = ReceivingHeader & {
  supplier?: Supplier;
  warehouse?: import("./inventory").Warehouse;
  lines?: ReceivingLineWithItem[];
};

export type PurchaseInvoiceLineWithItem = PurchaseInvoiceLine & {
  item?: import("./inventory").Item;
};

export type PurchaseInvoiceWithDetails = PurchaseInvoiceHeader & {
  supplier?: Supplier;
  warehouse?: import("./inventory").Warehouse;
  receiving?: ReceivingHeader;
  lines?: PurchaseInvoiceLineWithItem[];
};

// Labels
export const receivingStatusLabels: Record<string, string> = {
  draft: "مسودة",
  posted: "مُرحّل",
  posted_qty_only: "مُرحّل (كمية فقط)",
};

export const correctionStatusLabels: Record<string, string> = {
  corrected: "مُصحَّح",
  correction: "تصحيح",
};

export const purchaseInvoiceStatusLabels: Record<string, string> = {
  draft: "مسودة",
  approved_costed: "مُعتمد ومُسعّر"
};
