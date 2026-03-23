import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  salesInvoiceStatusEnum, customerTypeEnum,
  patientInvoiceStatusEnum, patientTypeEnum, patientInvoiceLineTypeEnum, paymentMethodEnum,
  unitLevelEnum
} from "./enums";
import { items, warehouses, departments, pharmacies } from "./inventory";
import { accounts, costCenters } from "./finance";
import { users } from "./users";
import { companies } from "./companies";

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

// ─── Pharmacy Credit Customers — عملاء الآجل ─────────────────────────────────
export const pharmacyCreditCustomers = pgTable("pharmacy_credit_customers", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:      text("name").notNull(),
  phone:     varchar("phone", { length: 30 }),
  notes:     text("notes"),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  nameIdx:     index("idx_pcc_name").on(t.name),
  pharmacyIdx: index("idx_pcc_pharmacy").on(t.pharmacyId),
}));

export const insertPharmacyCreditCustomerSchema = createInsertSchema(pharmacyCreditCustomers).omit({ id: true, createdAt: true });
export type InsertPharmacyCreditCustomer = z.infer<typeof insertPharmacyCreditCustomerSchema>;
export type PharmacyCreditCustomer = typeof pharmacyCreditCustomers.$inferSelect;

export const salesInvoiceHeaders = pgTable("sales_invoice_headers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: integer("invoice_number").notNull().unique(),
  invoiceDate: date("invoice_date").notNull(),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  customerType: customerTypeEnum("customer_type").notNull().default("cash"),
  customerId: varchar("customer_id").references(() => pharmacyCreditCustomers.id),
  customerName: text("customer_name"),
  contractCompany: text("contract_company"),
  // ── Contract FK fields (nullable — Phase 1 foundation) ───────────────────
  companyId:   varchar("company_id").references(() => companies.id),
  contractId:  varchar("contract_id"),
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
  clinicOrderId: varchar("clinic_order_id"),
  journalStatus: text("journal_status").default("none"),
  journalError: text("journal_error"),
  journalRetries: integer("journal_retries").default(0),
  // ── Cashier ownership (concurrency control + visual display) ───────────────
  claimedByShiftId: varchar("claimed_by_shift_id"),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("idx_sales_inv_date").on(table.invoiceDate),
  statusIdx: index("idx_sales_inv_status").on(table.status),
  isReturnIdx: index("idx_sales_inv_is_return").on(table.isReturn),
  pharmacyIdx: index("idx_sales_inv_pharmacy").on(table.pharmacyId),
  journalStatusIdx: index("idx_sales_inv_journal_status").on(table.journalStatus),
  originalInvoiceIdx: index("idx_sales_inv_original_invoice_id").on(table.originalInvoiceId),
  claimedByShiftIdx: index("idx_sales_inv_claimed_shift").on(table.claimedByShiftId),
  pharmacyStatusIdx: index("idx_sales_inv_pharmacy_status").on(table.pharmacyId, table.status),
  statusJournalIdx: index("idx_sales_inv_status_journal").on(table.status, table.journalStatus),
  companyIdx:       index("idx_sales_inv_company").on(table.companyId),
  contractIdx:      index("idx_sales_inv_contract").on(table.contractId),
  customerIdx:      index("idx_sales_inv_customer").on(table.customerId),
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
  // ── Contract fields (nullable — Phase 1 foundation, populated in Phase 2) ─
  companyId:          varchar("company_id").references(() => companies.id),
  contractId:         varchar("contract_id"),
  companyShareAmount: decimal("company_share_amount", { precision: 18, scale: 2 }),
  patientShareAmount: decimal("patient_share_amount", { precision: 18, scale: 2 }),
  coverageStatus:     text("coverage_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  invoiceItemIdx:  index("idx_sales_lines_inv_item").on(table.invoiceId, table.itemId),
  itemIdx:         index("idx_sales_lines_item").on(table.itemId),
  returnCheckIdx:  index("idx_sales_lines_return_check").on(table.invoiceId, table.itemId, table.lotId),
  companyIdx:      index("idx_sales_lines_company").on(table.companyId),
  contractIdx:     index("idx_sales_lines_contract").on(table.contractId),
}));

// ─── Customer Receipts — تحصيل الآجل ────────────────────────────────────────
export const customerReceipts = pgTable("customer_receipts", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: integer("receipt_number").notNull().default(0),
  customerId:    varchar("customer_id").notNull().references(() => pharmacyCreditCustomers.id),
  receiptDate:   date("receipt_date").notNull(),
  totalAmount:   decimal("total_amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull().default("cash"),
  reference:     varchar("reference", { length: 100 }),
  notes:         text("notes"),
  createdBy:     varchar("created_by"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  customerIdx: index("idx_cr_customer").on(t.customerId),
  dateIdx:     index("idx_cr_date").on(t.receiptDate),
}));

export const customerReceiptLines = pgTable("customer_receipt_lines", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptId:  varchar("receipt_id").notNull().references(() => customerReceipts.id, { onDelete: "cascade" }),
  invoiceId:  varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id),
  amountPaid: decimal("amount_paid", { precision: 18, scale: 2 }).notNull(),
}, (t) => ({
  receiptIdx: index("idx_crl_receipt").on(t.receiptId),
  invoiceIdx: index("idx_crl_invoice").on(t.invoiceId),
}));

export const insertCustomerReceiptSchema = createInsertSchema(customerReceipts).omit({ id: true, createdAt: true });
export type InsertCustomerReceipt = z.infer<typeof insertCustomerReceiptSchema>;
export type CustomerReceipt = typeof customerReceipts.$inferSelect;
export type CustomerReceiptLine = typeof customerReceiptLines.$inferSelect;

export type CustomerCreditInvoiceRow = {
  invoiceId:     string;
  invoiceNumber: number;
  invoiceDate:   string;
  netTotal:      string;
  totalPaid:     string;
  remaining:     string;
};

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
  patientId: varchar("patient_id"),
  isConsolidated: boolean("is_consolidated").notNull().default(false),
  sourceInvoiceIds: text("source_invoice_ids"),
  doctorName: text("doctor_name"),
  contractName: text("contract_name"),
  // ── Contract FK fields (nullable — Phase 1 foundation) ───────────────────
  companyId:        varchar("company_id").references(() => companies.id),
  contractId:       varchar("contract_id"),
  contractMemberId: varchar("contract_member_id"),
  notes: text("notes"),
  status: patientInvoiceStatusEnum("status").notNull().default("draft"),
  totalAmount: decimal("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  headerDiscountPercent: decimal("header_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  headerDiscountAmount: decimal("header_discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  netAmount: decimal("net_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  finalizedAt: timestamp("finalized_at"),
  version: integer("version").notNull().default(1),
  journalStatus: text("journal_status").default("none"),
  journalError: text("journal_error"),
  // claimStatus tracks fire-and-forget claim generation visibility (null = not a contract invoice)
  claimStatus: text("claim_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  invoiceNumIdx: index("idx_pat_inv_number").on(table.invoiceNumber),
  dateIdx: index("idx_pat_inv_date").on(table.invoiceDate),
  patientIdx: index("idx_pat_inv_patient").on(table.patientName),
  doctorIdx: index("idx_pat_inv_doctor").on(table.doctorName),
  statusIdx: index("idx_pat_inv_status").on(table.status),
  admissionIdx: index("idx_pat_inv_admission").on(table.admissionId),
  patientIdIdx: index("idx_pat_inv_patient_id").on(table.patientId),
  admissionStatusIdx: index("idx_pat_inv_admission_status").on(table.admissionId, table.status),
  companyIdx:       index("idx_pat_inv_company").on(table.companyId),
  contractIdx:      index("idx_pat_inv_contract").on(table.contractId),
  contractMemberIdx: index("idx_pat_inv_contract_member").on(table.contractMemberId),
}));

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
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  isVoid: boolean("is_void").notNull().default(false),
  voidedAt: timestamp("voided_at"),
  voidedBy: varchar("voided_by").references(() => users.id),
  voidReason: text("void_reason"),
  // ── Contract line fields (nullable — Phase 1 declares; Phase 2 populates) ─
  companyId:          varchar("company_id").references(() => companies.id),
  contractId:         varchar("contract_id"),
  contractMemberId:   varchar("contract_member_id"),
  contractRuleId:     varchar("contract_rule_id"),
  listPrice:          decimal("list_price", { precision: 18, scale: 2 }),
  contractPrice:      decimal("contract_price", { precision: 18, scale: 2 }),
  companyShareAmount: decimal("company_share_amount", { precision: 18, scale: 2 }),
  patientShareAmount: decimal("patient_share_amount", { precision: 18, scale: 2 }),
  coverageStatus:     text("coverage_status"),
  approvalStatus:     text("approval_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  headerIdx:         index("idx_pat_line_header").on(table.headerId),
  typeIdx:           index("idx_pat_line_type").on(table.lineType),
  sourceIdx:         index("idx_pat_line_source").on(table.sourceType, table.sourceId),
  companyIdx:        index("idx_pat_line_company").on(table.companyId),
  contractIdx:       index("idx_pat_line_contract").on(table.contractId),
  contractMemberIdx: index("idx_pat_line_contract_member").on(table.contractMemberId),
}));

export const patientInvoicePayments = pgTable("patient_invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headerId: varchar("header_id").notNull().references(() => patientInvoiceHeaders.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  treasuryId: varchar("treasury_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  headerIdx: index("idx_pat_pay_header").on(table.headerId),
}));

// Insert schemas
export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceListSchema = createInsertSchema(priceLists).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceListItemSchema = createInsertSchema(priceListItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPriceAdjustmentLogSchema = createInsertSchema(priceAdjustmentsLog).omit({ id: true, createdAt: true });
export const insertServiceConsumableSchema = createInsertSchema(serviceConsumables).omit({ id: true });
export const insertSalesInvoiceHeaderSchema = createInsertSchema(salesInvoiceHeaders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSalesInvoiceLineSchema = createInsertSchema(salesInvoiceLines).omit({ id: true, createdAt: true });
export const insertPatientInvoiceHeaderSchema = createInsertSchema(patientInvoiceHeaders).omit({ id: true, createdAt: true, updatedAt: true, finalizedAt: true, version: true });
export const insertPatientInvoiceLineSchema = createInsertSchema(patientInvoiceLines).omit({ id: true, createdAt: true, isVoid: true, voidedAt: true, voidedBy: true, voidReason: true });
export const insertPatientInvoicePaymentSchema = createInsertSchema(patientInvoicePayments).omit({ id: true, createdAt: true });

// Types
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

export type InsertSalesInvoiceHeader = z.infer<typeof insertSalesInvoiceHeaderSchema>;
export type SalesInvoiceHeader = typeof salesInvoiceHeaders.$inferSelect;

export type InsertSalesInvoiceLine = z.infer<typeof insertSalesInvoiceLineSchema>;
export type SalesInvoiceLine = typeof salesInvoiceLines.$inferSelect;

export const insertPatientInvoiceHeader = insertPatientInvoiceHeaderSchema;
export type InsertPatientInvoiceHeader = z.infer<typeof insertPatientInvoiceHeaderSchema>;
export type PatientInvoiceHeader = typeof patientInvoiceHeaders.$inferSelect;

export type InsertPatientInvoiceLine = z.infer<typeof insertPatientInvoiceLineSchema>;
export type PatientInvoiceLine = typeof patientInvoiceLines.$inferSelect;

export type InsertPatientInvoicePayment = z.infer<typeof insertPatientInvoicePaymentSchema>;
export type PatientInvoicePayment = typeof patientInvoicePayments.$inferSelect;

// Extended types
export type ServiceConsumableWithItem = ServiceConsumable & {
  item?: import("./inventory").Item;
};

export type ServiceWithDepartment = Service & {
  department?: import("./inventory").Department;
  revenueAccount?: import("./finance").Account;
  costCenter?: import("./finance").CostCenter;
};

export type PriceListItemWithService = PriceListItem & {
  service?: Service & { department?: import("./inventory").Department };
};

export type SalesInvoiceLineWithItem = SalesInvoiceLine & {
  item?: import("./inventory").Item;
};

export type SalesInvoiceWithDetails = SalesInvoiceHeader & {
  warehouse?: import("./inventory").Warehouse;
  lines?: SalesInvoiceLineWithItem[];
};

export type PatientInvoiceLineWithDetails = PatientInvoiceLine & {
  service?: Service;
  item?: import("./inventory").Item;
};

export type OpdInvoiceContext = {
  appointmentId:  string;
  aptStatus:      string;
  paymentType:    string;
  clinicName:     string | null;
  doctorName:     string | null;
  departmentName: string | null;
};

export type PatientInvoiceWithDetails = PatientInvoiceHeader & {
  department?: import("./inventory").Department;
  lines?: PatientInvoiceLineWithDetails[];
  payments?: PatientInvoicePayment[];
  opdContext?: OpdInvoiceContext | null;
};

// Labels
export const serviceTypeLabels: Record<string, string> = {
  SERVICE: "خدمة",
  ACCOMMODATION: "إقامة",
  OPERATING_ROOM: "فتح غرفة عمليات",
  DEVICE: "جهاز",
  GAS: "غاز",
  OTHER: "أخرى"
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
