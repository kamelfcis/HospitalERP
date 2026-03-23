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

  // ===== Supplier Financial Fields (Phase 1 additions) =====
  // paymentMode: طريقة الدفع الافتراضية — cash | credit | mixed
  paymentMode: text("payment_mode").notNull().default("cash"),
  // creditLimit: الحد الائتماني بالجنيه — null = بلا حد
  creditLimit: decimal("credit_limit", { precision: 18, scale: 2 }),
  // defaultPaymentTerms: أيام الاستحقاق الافتراضية — null = غير محدد
  defaultPaymentTerms: integer("default_payment_terms"),
  // contactPerson: الشخص المسؤول لدى المورد
  contactPerson: text("contact_person"),
  // openingBalance: الرصيد الافتتاحي — master data فقط، لا يولّد قيود تلقائياً
  openingBalance: decimal("opening_balance", { precision: 18, scale: 2 }).default("0"),

  // ===== Supplier Account Linkage =====
  // glAccountId: حساب ذمم مورد خاص — OPTIONAL OVERRIDE لنموذج AP المجمّع
  // إذا كان محدداً → يُستخدم بدلاً من payables_drugs/payables_consumables في القيود
  // إذا كان null    → يعود النظام للنموذج المجمّع الحالي (الـ fallback الدائم)
  glAccountId: varchar("gl_account_id"),
}, (table) => ({
  codeIdx:   index("idx_suppliers_code").on(table.code),
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
  journalStatus: text("journal_status").default("none"),
  journalError: text("journal_error"),
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

// ===== Insert Schemas =====

// insertSupplierSchema: validates all supplier fields with safe coercion for financial inputs
export const insertSupplierSchema = createInsertSchema(suppliers)
  .omit({ id: true, createdAt: true })
  .extend({
    // ===== Supplier Financial Field Validation =====
    paymentMode: z.enum(["cash", "credit", "mixed"]).default("cash"),
    creditLimit: z.coerce.number().nonnegative("الحد الائتماني يجب أن يكون صفراً أو أكبر").optional().nullable(),
    defaultPaymentTerms: z.coerce.number().int().nonnegative("أيام السداد يجب أن تكون صفراً أو أكبر").optional().nullable(),
    openingBalance: z.coerce.number().optional().nullable(),
    // ===== Supplier Account Linkage Validation =====
    // glAccountId is optional — null means use grouped AP fallback
    glAccountId: z.string().optional().nullable(),
    contactPerson: z.string().optional().nullable(),
  });
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

// ─── Supplier Payments ──────────────────────────────────────────────────────
// رأس السداد: كل عملية دفع للمورد (قد تشمل عدة فواتير)
export const supplierPayments = pgTable("supplier_payments", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId:    varchar("supplier_id").notNull().references(() => suppliers.id),
  paymentDate:   date("payment_date").notNull(),
  totalAmount:   decimal("total_amount", { precision: 18, scale: 2 }).notNull(),
  reference:     varchar("reference", { length: 100 }),
  notes:         text("notes"),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull().default("bank"),
  createdBy:     varchar("created_by"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  supplierIdx: index("idx_sp_supplier").on(t.supplierId),
  dateIdx:     index("idx_sp_date").on(t.paymentDate),
}));

// سطور السداد: توزيع المبلغ على الفواتير
export const supplierPaymentLines = pgTable("supplier_payment_lines", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId:   varchar("payment_id").notNull().references(() => supplierPayments.id, { onDelete: "cascade" }),
  invoiceId:   varchar("invoice_id").notNull().references(() => purchaseInvoiceHeaders.id),
  amountPaid:  decimal("amount_paid", { precision: 18, scale: 2 }).notNull(),
}, (t) => ({
  paymentIdx: index("idx_spl_payment").on(t.paymentId),
  invoiceIdx: index("idx_spl_invoice").on(t.invoiceId),
}));

// Schemas & Types
export const insertSupplierPaymentSchema = createInsertSchema(supplierPayments).omit({ id: true, createdAt: true });
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type SupplierPaymentLine = typeof supplierPaymentLines.$inferSelect;

// Virtual type for invoice-with-payment-status
export type SupplierInvoicePaymentRow = {
  invoiceId:          string;
  invoiceNumber:      number;
  supplierInvoiceNo:  string;
  receivingNumber:    number | null;
  invoiceDate:        string;
  netPayable:         string;
  totalPaid:          string;
  remaining:          string;
};

// Labels
export const receivingStatusLabels: Record<string, string> = {
  draft: "مسودة",
  posted: "مُرحّل",
  posted_qty_only: "مُرحّل (كمية فقط)",
  posted_costed: "مُرحّل ومُسعَّر",
  cancelled: "ملغى",
};

export const correctionStatusLabels: Record<string, string> = {
  corrected: "مُصحَّح",
  correction: "تصحيح",
};

export const purchaseInvoiceStatusLabels: Record<string, string> = {
  draft: "مسودة",
  approved_costed: "مُعتمد ومُسعّر"
};
