/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  finance.ts — المالية والمحاسبة العامة
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ┌──────────────────────────┬────────────────────────────────────────────────┐
 *  │ الجدول                   │ الغرض                                          │
 *  ├──────────────────────────┼────────────────────────────────────────────────┤
 *  │ journal_entry_number_seq │ تسلسل أرقام القيود — يمنع التكرار             │
 *  │ fiscal_periods           │ الفترات المالية                                │
 *  │ cost_centers             │ مراكز التكلفة (شجري)                          │
 *  │ accounts                 │ دليل الحسابات (شجري)                          │
 *  │ user_account_scopes      │ نطاق رؤية الحسابات لكل مستخدم                 │
 *  │ journal_templates        │ نماذج القيود المحاسبية                         │
 *  │ journal_entries          │ ⚠ Core Accounting — قيود اليومية العامة        │
 *  │ journal_lines            │ ⚠ Core Accounting — سطور القيود               │
 *  │ template_lines           │ سطور نماذج القيود                              │
 *  │ audit_log                │ سجل التدقيق العام                              │
 *  │ account_mappings         │ ⚠ Core Accounting — ربط أنواع العمليات بالحسابات│
 *  │ accounting_event_log     │ سجل أحداث المحاسبة (نجاح/فشل/إعادة محاولة)    │
 *  └──────────────────────────┴────────────────────────────────────────────────┘
 *
 *  ⚠ Core Accounting — DO NOT MODIFY without accounting review
 *    journal_entries, journal_lines, account_mappings
 *
 *  العلاقات:
 *    accounts.parentId → accounts.id (شجري)
 *    cost_centers.parentId → cost_centers.id (شجري)
 *    journal_entries → fiscal_periods, users
 *    journal_lines → journal_entries, accounts, cost_centers
 *    account_mappings → accounts (debit/credit)
 *    user_account_scopes → users, accounts
 *
 *  يُستورد من: enums.ts, users.ts
 *  يُستورد بواسطة: inventory.ts, invoicing.ts, hospital.ts, companies.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex, pgSequence } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { accountTypeEnum, journalStatusEnum, mappingLineTypeEnum, transactionTypeEnum } from "./enums";
import { users } from "./users";

// ── تسلسل أرقام القيود اليومية — يضمن عدم التكرار تحت التزامن ──────────────
export const journalEntryNumberSeq = pgSequence("journal_entry_number_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
});

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

export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  parentId: varchar("parent_id").references((): any => accounts.id, { onDelete: "set null" }),
  level: integer("level").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  requiresCostCenter: boolean("requires_cost_center").notNull().default(false),
  defaultCostCenterId: varchar("default_cost_center_id").references((): any => costCenters.id, { onDelete: "set null" }),
  description: text("description"),
  openingBalance: decimal("opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  parentIdx: index("idx_accounts_parent").on(table.parentId),
  typeIdx: index("idx_accounts_type").on(table.accountType),
}));

export const userAccountScopes = pgTable("user_account_scopes", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  uniqueUserAccount: uniqueIndex("idx_user_account_scopes_unique").on(table.userId, table.accountId),
  userIdx:           index("idx_user_account_scopes_user").on(table.userId),
  accountIdx:        index("idx_user_account_scopes_account").on(table.accountId),
}));

export const journalTemplates = pgTable("journal_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  sourceEntryType: text("source_entry_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("idx_journal_entries_date").on(table.entryDate),
  statusIdx: index("idx_journal_entries_status").on(table.status),
  periodIdx: index("idx_journal_entries_period").on(table.periodId),
}));

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

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableName: text("table_name").notNull(),
  recordId: varchar("record_id").notNull(),
  action: text("action").notNull(),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  userId: varchar("user_id").references(() => users.id),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tableRecordIdx: index("idx_audit_log_table_record").on(table.tableName, table.recordId),
  createdAtIdx: index("idx_audit_log_created_at").on(table.createdAt),
}));

export const accountMappings = pgTable("account_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionType: text("transaction_type").notNull(),
  lineType: text("line_type").notNull(),
  debitAccountId: varchar("debit_account_id").references(() => accounts.id),
  creditAccountId: varchar("credit_account_id").references(() => accounts.id),
  warehouseId: varchar("warehouse_id"),
  pharmacyId: varchar("pharmacy_id"),
  departmentId: varchar("department_id"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  txTypeIdx: index("idx_acct_map_tx_type").on(table.transactionType),
}));

// ── سجل أحداث المحاسبة (General Accounting Event Log) ──────────────────────
export const accountingEventLog = pgTable("accounting_event_log", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType:       text("event_type").notNull(),
  sourceType:      text("source_type"),
  sourceId:        text("source_id"),
  appointmentId:   text("appointment_id"),
  postedByUser:    text("posted_by_user"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  status:          text("status").notNull().default("success"),
  errorMessage:    text("error_message"),
  attemptCount:    integer("attempt_count").notNull().default(1),
  lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }).notNull().defaultNow(),
  nextRetryAt:     timestamp("next_retry_at", { withTimezone: true }),
  journalEntryId:  varchar("journal_entry_id"),
}, (t) => [
  index("idx_ael_appointment_id").on(t.appointmentId),
  index("idx_ael_event_type").on(t.eventType),
  index("idx_ael_source").on(t.sourceType, t.sourceId),
  index("idx_ael_status").on(t.status),
  uniqueIndex("idx_ael_dedup").on(t.eventType, t.sourceType, t.sourceId),
]);

export const insertAccountingEventLogSchema = createInsertSchema(accountingEventLog).omit({ id: true, createdAt: true, updatedAt: true, lastAttemptedAt: true });
export type InsertAccountingEventLog = z.infer<typeof insertAccountingEventLogSchema>;
export type AccountingEventLog = typeof accountingEventLog.$inferSelect;

// Insert schemas
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
export const insertAccountMappingSchema = createInsertSchema(accountMappings).omit({ id: true, createdAt: true, updatedAt: true });

// Types
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

export type InsertAccountMapping = z.infer<typeof insertAccountMappingSchema>;
export type AccountMapping = typeof accountMappings.$inferSelect;

// Extended types
export type JournalEntryWithLines = JournalEntry & {
  lines: (JournalLine & {
    account?: Account;
    costCenter?: CostCenter;
  })[];
  createdByUser?: import("./users").User;
  postedByUser?: import("./users").User;
  period?: FiscalPeriod;
};

export type AccountWithChildren = Account & {
  children?: AccountWithChildren[];
};

export type CostCenterWithChildren = CostCenter & {
  children?: CostCenterWithChildren[];
};

// Labels
export const accountTypeLabels: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات"
};

export const journalStatusLabels: Record<string, string> = {
  draft:    "مسودة",
  posted:   "مُرحّل",
  reversed: "ملغي",
  failed:   "فشل",
};

export const transactionTypeLabels: Record<string, string> = {
  sales_invoice:             "فاتورة مبيعات",
  sales_return:              "مردود مبيعات",
  patient_invoice:           "فاتورة مريض",
  receiving:                 "استلام مورد",
  purchase_invoice:          "فاتورة مشتريات",
  cashier_collection:        "تحصيل كاشير",
  cashier_refund:            "مرتجع كاشير",
  warehouse_transfer:        "تحويلات مخزنية",
  doctor_payable_settlement: "تسوية مستحقات الطبيب",
  doctor_transfer:           "تحويل مديونية لطبيب",
  stock_count_adjustment:    "تسوية جرد مخزني",
  supplier_payment:          "سداد موردين",
  cashier_shift_close:       "إغلاق وردية كاشير",
  contract_settlement:       "تسوية مطالبات تأمين",
  oversell_resolution:       "تسوية الصرف المؤجل التكلفة",
};

export const mappingLineTypeLabels: Record<string, string> = {
  // Purchase invoice (explicit Dr/Cr sides — see purchase journal logic)
  inventory:            "مخزون",
  vat_input:            "ضريبة ق.م.أ - مدخلات",
  discount_earned:      "خصم مكتسب",
  payables:             "ذمم موردين",
  payables_drugs:       "ذمم موردين - أدوية",
  payables_consumables: "ذمم موردين - مستلزمات",
  // Sales invoice — حسابات المدينين
  receivables_credit:   "ذمم مدينة - آجل فقط",
  // Sales invoice (generic path: each mapping produces Dr + Cr)
  revenue_drugs:        "إيراد أدوية",
  revenue_consumables:  "إيراد مستلزمات",
  revenue_general:      "إيراد عام",
  cogs_drugs:           "تكلفة مبيعات أدوية",
  cogs_supplies:        "تكلفة مبيعات مستلزمات",
  cogs:                 "تكلفة البضاعة المباعة",
  discount_allowed:     "خصم مسموح",
  vat_output:           "ضريبة ق.م.أ - مخرجات",
  returns:              "مرتجعات مبيعات",
  // Patient invoice
  cash:                 "نقدية",
  receivables:          "ذمم مدينة",
  revenue_services:     "إيراد خدمات",
  revenue_gas:          "إيراد غازات",
  revenue_surgery:      "إيراد عمليات",
  revenue_equipment:    "إيراد أجهزة",
  revenue_admin:        "إيراد خدمات إدارية",
  doctor_cost:          "تكلفة طبيب",
  // Receiving
  payable:              "ذمم دائنة",
  // Cashier
  revenue:              "إيراد",
  discount:             "خصم",
  tax:                  "ضريبة",
  receivable_clear:     "تصفية ذمم مدينة",
  // Doctor settlement
  doctor_payable:       "مستحقات طبيب",
  payable_transfer:     "تحويل ذمة مريض لطبيب",
  // Stock count adjustment
  stock_gain:           "إيراد فوائض الجرد",
  stock_loss:           "خسائر عجز الجرد",
  // Supplier payment
  ap_settlement:        "تسوية ذمم موردين (دفع)",
  // Contract pharmacy receivables (Phase 2)
  pharmacy_patient_receivable:  "ذمم مرضى أفراد - صيدلية",
  pharmacy_contract_receivable: "ذمم شركات تأمين طبي",
  // Cashier shift close
  treasury:             "حساب عهدة أمين الخزنة",
  // Contract settlement (Phase 6)
  ar_insurance:         "ذمم شركات التأمين (دائن عند التسوية)",
  bank_settlement:      "بنك / صندوق التحصيل (مدين عند الاستلام)",
  rejection_loss:       "خسارة مطالبات مرفوضة",
  contract_discount_exp:"خصم تعاقد مسموح",
  price_diff_expense:   "فرق سعر",
  rounding_adjustment:  "تسوية تقريب",
  // Generic
  other:                "أخرى",
};
