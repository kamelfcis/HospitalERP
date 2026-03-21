/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Schema — جداول العقود والمنتسبين وقواعد التغطية والمطالبات
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يستورد من:
 *    - companies.ts  (companies)
 *    - invoicing.ts  (priceLists)
 *    - hospital.ts   (patients)
 *
 *  لا يستورد من هذا الملف أي من الجداول العليا لتجنّب الاستيراد الدائري.
 *
 *  العلاقات:
 *    contracts             → companies, priceLists
 *    contractMembers       → contracts, patients
 *    contractCoverageRules → contracts
 *    contractClaimBatches  → companies, contracts
 *    contractClaimLines    → contractClaimBatches, contractMembers
 *                            patientInvoiceLineId / salesInvoiceLineId: varchar only (no FK — circular import gap)
 *
 *  ── Circular Import Gap (Phase 3 — documented) ──────────────────────────
 *  contractClaimLines.patientInvoiceLineId / salesInvoiceLineId cannot be
 *  declared as Drizzle .references() because invoicing.ts already imports
 *  contracts.ts indirectly. DB-level FK can be added via raw ALTER TABLE if
 *  needed. All values are validated at route layer before insert.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, text, varchar, decimal, boolean, integer,
  timestamp, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { companies } from "./companies";
import { priceLists } from "./invoicing";
import { patients } from "./hospital";

// ─── العقود (Contracts) ────────────────────────────────────────────────────

export const contracts = pgTable("contracts", {
  id:                 varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId:          varchar("company_id").notNull().references(() => companies.id),
  contractNumber:     text("contract_number").notNull().unique(),
  contractName:       text("contract_name").notNull(),
  basePriceListId:    varchar("base_price_list_id").references(() => priceLists.id),
  companyCoveragePct: decimal("company_coverage_pct", { precision: 5, scale: 2 }).default("100"),
  startDate:          date("start_date").notNull(),
  endDate:            date("end_date").notNull(),
  isActive:           boolean("is_active").notNull().default(true),
  notes:              text("notes"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  companyIdx:         index("idx_contracts_company").on(table.companyId),
  contractNumIdx:     index("idx_contracts_number").on(table.contractNumber),
  priceListIdx:       index("idx_contracts_price_list").on(table.basePriceListId),
  startDateIdx:       index("idx_contracts_start").on(table.startDate),
  endDateIdx:         index("idx_contracts_end").on(table.endDate),
  activeIdx:          index("idx_contracts_active").on(table.isActive),
  companyActiveIdx:   index("idx_contracts_company_active").on(table.companyId, table.isActive),
}));

// ─── المنتسبون (Contract Members) ─────────────────────────────────────────

export const contractMembers = pgTable("contract_members", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId:       varchar("contract_id").notNull().references(() => contracts.id),
  patientId:        varchar("patient_id").references(() => patients.id),
  memberCardNumber: text("member_card_number").notNull(),
  employeeNumber:   text("employee_number"),
  nationalId:       text("national_id"),
  memberNameAr:     text("member_name_ar").notNull(),
  memberNameEn:     text("member_name_en"),
  relationType:     text("relation_type").notNull().default("primary"),
  memberClass:      text("member_class"),
  annualLimit:      decimal("annual_limit", { precision: 18, scale: 2 }),
  startDate:        date("start_date").notNull(),
  endDate:          date("end_date").notNull(),
  isActive:         boolean("is_active").notNull().default(true),
  notes:            text("notes"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contractIdx:          index("idx_cm_contract").on(table.contractId),
  patientIdx:           index("idx_cm_patient").on(table.patientId),
  cardNumIdx:           index("idx_cm_card_number").on(table.memberCardNumber),
  nationalIdIdx:        index("idx_cm_national_id").on(table.nationalId),
  startDateIdx:         index("idx_cm_start").on(table.startDate),
  endDateIdx:           index("idx_cm_end").on(table.endDate),
  activeIdx:            index("idx_cm_active").on(table.isActive),
  uniqueCardPerContract: uniqueIndex("idx_cm_unique_card").on(table.contractId, table.memberCardNumber),
}));

// ─── نوع قاعدة التغطية ────────────────────────────────────────────────────

export const coverageRuleTypeEnum = pgEnum("coverage_rule_type", [
  "include_service",
  "exclude_service",
  "include_dept",
  "exclude_dept",
  "discount_pct",
  "fixed_price",
  "approval_required",
  "global_discount",
]);

// ─── قواعد التغطية (Coverage Rules) ───────────────────────────────────────

export const contractCoverageRules = pgTable("contract_coverage_rules", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId:      varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  ruleName:        text("rule_name").notNull(),
  ruleType:        coverageRuleTypeEnum("rule_type").notNull(),
  serviceId:       varchar("service_id"),
  departmentId:    varchar("department_id"),
  serviceCategory: text("service_category"),
  discountPct:     decimal("discount_pct", { precision: 5, scale: 2 }),
  fixedPrice:      decimal("fixed_price", { precision: 18, scale: 2 }),
  priority:        integer("priority").notNull().default(10),
  isActive:        boolean("is_active").notNull().default(true),
  notes:           text("notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contractIdx:  index("idx_ccr_contract").on(table.contractId),
  serviceIdx:   index("idx_ccr_service").on(table.serviceId),
  deptIdx:      index("idx_ccr_dept").on(table.departmentId),
  priorityIdx:  index("idx_ccr_priority").on(table.contractId, table.priority),
  activeIdx:    index("idx_ccr_active").on(table.contractId, table.isActive),
}));

// ─── دفعات المطالبات (Claim Batches) ──────────────────────────────────────

export const claimBatchStatusEnum = pgEnum("claim_batch_status", [
  "draft",       // تجميع — يمكن الإضافة إليها
  "submitted",   // مُرسَلة للشركة — مقفلة للإضافة
  "responded",   // الشركة أجابت (قبول / رفض جزئي / كلي)
  "settled",     // تمت التسوية المالية
  "cancelled",   // ملغاة
]);

export const contractClaimBatches = pgTable("contract_claim_batches", {
  id:                varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId:         varchar("company_id").notNull().references(() => companies.id),
  contractId:        varchar("contract_id").notNull().references(() => contracts.id),
  batchNumber:       text("batch_number").notNull().unique(),
  batchDate:         date("batch_date").notNull(),
  status:            claimBatchStatusEnum("status").notNull().default("draft"),
  submittedAt:       timestamp("submitted_at"),
  submittedBy:       varchar("submitted_by"),
  companyReferenceNo: text("company_reference_no"),
  totalClaimed:      decimal("total_claimed",      { precision: 18, scale: 2 }).notNull().default("0"),
  totalApproved:     decimal("total_approved",     { precision: 18, scale: 2 }).notNull().default("0"),
  totalRejected:     decimal("total_rejected",     { precision: 18, scale: 2 }).notNull().default("0"),
  totalSettled:      decimal("total_settled",      { precision: 18, scale: 2 }).notNull().default("0"),
  totalOutstanding:  decimal("total_outstanding",  { precision: 18, scale: 2 }).notNull().default("0"),
  totalVariance:     decimal("total_variance",     { precision: 18, scale: 2 }).notNull().default("0"),
  totalWriteoff:     decimal("total_writeoff",     { precision: 18, scale: 2 }).notNull().default("0"),
  notes:             text("notes"),
  journalEntryId:    varchar("journal_entry_id"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  companyIdx:    index("idx_ccb_company").on(table.companyId),
  contractIdx:   index("idx_ccb_contract").on(table.contractId),
  statusIdx:     index("idx_ccb_status").on(table.status),
  batchDateIdx:  index("idx_ccb_batch_date").on(table.batchDate),
  companyStatusIdx: index("idx_ccb_company_status").on(table.companyId, table.status),
}));

// ─── سطور المطالبات (Claim Lines) ─────────────────────────────────────────

export const claimLineStatusEnum = pgEnum("claim_line_status", [
  "pending",   // في انتظار رد الشركة
  "approved",  // موافق عليه
  "rejected",  // مرفوض
  "settled",   // تمت التسوية
]);

export const contractClaimLines = pgTable("contract_claim_lines", {
  id:                   varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId:              varchar("batch_id").notNull().references(() => contractClaimBatches.id, { onDelete: "cascade" }),
  // No Drizzle FK on these — circular import gap (documented above)
  patientInvoiceLineId: varchar("patient_invoice_line_id"),
  salesInvoiceLineId:   varchar("sales_invoice_line_id"),
  invoiceHeaderId:      varchar("invoice_header_id").notNull(),
  contractMemberId:     varchar("contract_member_id").references(() => contractMembers.id),
  serviceDescription:   text("service_description").notNull(),
  serviceDate:          date("service_date").notNull(),
  listPrice:            decimal("list_price",         { precision: 18, scale: 2 }).notNull(),
  contractPrice:        decimal("contract_price",     { precision: 18, scale: 2 }).notNull(),
  companyShareAmount:   decimal("company_share_amount", { precision: 18, scale: 2 }).notNull(),
  patientShareAmount:   decimal("patient_share_amount", { precision: 18, scale: 2 }).notNull(),
  approvedAmount:       decimal("approved_amount",    { precision: 18, scale: 2 }),
  status:               claimLineStatusEnum("status").notNull().default("pending"),
  rejectionReason:      text("rejection_reason"),
  approvedAt:           timestamp("approved_at"),
  settledAt:            timestamp("settled_at"),
  journalEntryId:       varchar("journal_entry_id"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  batchIdx:          index("idx_ccl_batch").on(table.batchId),
  // UNIQUE on patientInvoiceLineId (nullable — PostgreSQL excludes NULLs automatically):
  // prevents same patient invoice line from entering claims twice across all batches
  uniquePatientLine: uniqueIndex("idx_ccl_unique_patient_line").on(table.patientInvoiceLineId),
  salesLineIdx:      index("idx_ccl_sales_line").on(table.salesInvoiceLineId),
  invoiceHeaderIdx:  index("idx_ccl_invoice_header").on(table.invoiceHeaderId),
  memberIdx:         index("idx_ccl_member").on(table.contractMemberId),
  statusIdx:         index("idx_ccl_status").on(table.status),
  serviceDateIdx:    index("idx_ccl_service_date").on(table.serviceDate),
}));

// ─── طلبات الموافقة (Contract Approvals) ─────────────────────────────────
//
// Phase 4: تحوّل approval_required من علامة سلبية إلى سير عمل تشغيلي فعال.
// جدول contractApprovals هو مصدر الحقيقة؛ حقل approvalStatus على السطر
// حالة مخزَّنة (cached state) تُزامَن مع آخر قرار في هذا الجدول.

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",    // في انتظار القرار
  "approved",   // موافق عليه
  "rejected",   // مرفوض
  "cancelled",  // ملغى
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "full_approval",    // موافقة كاملة على المبلغ المطلوب
  "partial_approval", // موافقة جزئية
  "rejection",        // رفض
]);

export const contractApprovals = pgTable("contract_approvals", {
  id:                   varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // No FK — circular import gap (documented same as claim lines)
  patientInvoiceLineId: varchar("patient_invoice_line_id"),
  contractId:           varchar("contract_id").notNull().references(() => contracts.id),
  contractMemberId:     varchar("contract_member_id").references(() => contractMembers.id),
  serviceId:            varchar("service_id"),
  approvalStatus:       approvalStatusEnum("approval_status").notNull().default("pending"),
  approvalDecision:     approvalDecisionEnum("approval_decision"),
  requestedAmount:      decimal("requested_amount", { precision: 18, scale: 2 }).notNull(),
  approvedAmount:       decimal("approved_amount",  { precision: 18, scale: 2 }),
  rejectionReason:      text("rejection_reason"),
  serviceDescription:   text("service_description"),
  requestedAt:          timestamp("requested_at").notNull().defaultNow(),
  requestedBy:          varchar("requested_by"),
  decidedAt:            timestamp("decided_at"),
  decidedBy:            varchar("decided_by"),
  notes:                text("notes"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  patientLineIdx:        index("idx_ca_patient_line").on(table.patientInvoiceLineId),
  contractIdx:           index("idx_ca_contract").on(table.contractId),
  approvalStatusIdx:     index("idx_ca_status").on(table.approvalStatus),
  requestedAtIdx:        index("idx_ca_requested_at").on(table.requestedAt),
  contractStatusIdx:     index("idx_ca_contract_status").on(table.contractId, table.approvalStatus),
  // Composite for fast pending approval queue
  pendingIdx:            index("idx_ca_pending").on(table.approvalStatus, table.contractId, table.requestedAt),
  // DB-level partial unique: only ONE pending approval per patient invoice line
  // Multiple cancelled/rejected rows are allowed — partial WHERE ensures no conflict
  uniquePendingLine:     uniqueIndex("idx_ca_unique_pending_line")
                           .on(table.patientInvoiceLineId)
                           .where(sql`approval_status = 'pending' AND patient_invoice_line_id IS NOT NULL`),
}));

// ─── تسويات المطالبات (Claim Settlements) Phase 5 ────────────────────────

export const contractClaimSettlements = pgTable("contract_claim_settlements", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId:          varchar("batch_id").notNull().references(() => contractClaimBatches.id, { onDelete: "restrict" }),
  settlementDate:   date("settlement_date").notNull(),
  settledAmount:    decimal("settled_amount",  { precision: 18, scale: 2 }).notNull(),
  bankAccountId:    varchar("bank_account_id"),
  referenceNumber:  text("reference_number"),
  notes:            text("notes"),
  journalEntryId:   varchar("journal_entry_id"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  batchIdx:           index("idx_ccs_batch").on(table.batchId),
  settleDateIdx:      index("idx_ccs_settle_date").on(table.settlementDate),
  batchDateIdx:       index("idx_ccs_batch_date").on(table.batchId, table.settlementDate),
}));

export const contractClaimSettlementLines = pgTable("contract_claim_settlement_lines", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settlementId:     varchar("settlement_id").notNull().references(() => contractClaimSettlements.id, { onDelete: "cascade" }),
  claimLineId:      varchar("claim_line_id").notNull().references(() => contractClaimLines.id, { onDelete: "restrict" }),
  settledAmount:    decimal("settled_amount",   { precision: 18, scale: 2 }).notNull(),
  writeOffAmount:   decimal("write_off_amount", { precision: 18, scale: 2 }).default("0"),
  adjustmentReason: text("adjustment_reason"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  settlementIdx:  index("idx_ccsl_settlement").on(table.settlementId),
  claimLineIdx:   index("idx_ccsl_claim_line").on(table.claimLineId),
  // One settlement line per claim line per settlement (allow multiple settlements if partial)
}));

// ─── Schemas & Types ──────────────────────────────────────────────────────

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertContractMemberSchema = createInsertSchema(contractMembers).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertContractCoverageRuleSchema = createInsertSchema(contractCoverageRules).omit({
  id: true, createdAt: true,
});

export const insertClaimBatchSchema = createInsertSchema(contractClaimBatches).omit({
  id: true, createdAt: true, updatedAt: true,
  status: true, submittedAt: true, totalApproved: true, totalRejected: true, journalEntryId: true,
});

export const insertClaimLineSchema = createInsertSchema(contractClaimLines).omit({
  id: true, createdAt: true,
  status: true, approvedAmount: true, rejectionReason: true, approvedAt: true, settledAt: true, journalEntryId: true,
});

export type Contract                  = typeof contracts.$inferSelect;
export type InsertContract            = z.infer<typeof insertContractSchema>;
export type ContractMember            = typeof contractMembers.$inferSelect;
export type InsertContractMember      = z.infer<typeof insertContractMemberSchema>;
export type ContractCoverageRule      = typeof contractCoverageRules.$inferSelect;
export type InsertContractCoverageRule = z.infer<typeof insertContractCoverageRuleSchema>;
export type ContractClaimBatch        = typeof contractClaimBatches.$inferSelect;
export type InsertClaimBatch          = z.infer<typeof insertClaimBatchSchema>;
export type ContractClaimLine         = typeof contractClaimLines.$inferSelect;
export type InsertClaimLine           = z.infer<typeof insertClaimLineSchema>;

// ─── Labels ───────────────────────────────────────────────────────────────

export const relationTypeLabels: Record<string, string> = {
  primary: "منتسب رئيسي",
  spouse:  "زوج/زوجة",
  child:   "ابن/ابنة",
  parent:  "والد/والدة",
  other:   "أخرى",
};

export const coverageRuleTypeLabels: Record<string, string> = {
  include_service:   "تشمل خدمة",
  exclude_service:   "تستثني خدمة",
  include_dept:      "تشمل قسم",
  exclude_dept:      "تستثني قسم",
  discount_pct:      "خصم بنسبة",
  fixed_price:       "سعر ثابت",
  approval_required: "موافقة مسبقة",
  global_discount:   "خصم عام",
};

export const claimBatchStatusLabels: Record<string, string> = {
  draft:     "مسودة",
  submitted: "مُرسَلة",
  responded: "مُجابة",
  settled:   "مُسوَّاة",
  cancelled: "ملغاة",
};

export const claimLineStatusLabels: Record<string, string> = {
  pending:  "معلّق",
  approved: "مقبول",
  rejected: "مرفوض",
  settled:  "مُسوَّى",
};

export const insertContractApprovalSchema = createInsertSchema(contractApprovals).omit({
  id: true, createdAt: true, updatedAt: true,
  approvalStatus: true, approvalDecision: true,
  approvedAmount: true, rejectionReason: true,
  decidedAt: true, decidedBy: true,
});

export type ContractApproval       = typeof contractApprovals.$inferSelect;
export type InsertContractApproval = z.infer<typeof insertContractApprovalSchema>;

// ─── Phase 5 Settlement Types ─────────────────────────────────────────────

export const insertClaimSettlementSchema = createInsertSchema(contractClaimSettlements).omit({
  id: true, createdAt: true, journalEntryId: true,
});
export const insertClaimSettlementLineSchema = createInsertSchema(contractClaimSettlementLines).omit({
  id: true, createdAt: true,
});

export type ContractClaimSettlement      = typeof contractClaimSettlements.$inferSelect;
export type InsertClaimSettlement        = z.infer<typeof insertClaimSettlementSchema>;
export type ContractClaimSettlementLine  = typeof contractClaimSettlementLines.$inferSelect;
export type InsertClaimSettlementLine    = z.infer<typeof insertClaimSettlementLineSchema>;

export const approvalStatusLabels: Record<string, string> = {
  pending:   "في انتظار القرار",
  approved:  "موافق عليه",
  rejected:  "مرفوض",
  cancelled: "ملغى",
};

export const approvalDecisionLabels: Record<string, string> = {
  full_approval:    "موافقة كاملة",
  partial_approval: "موافقة جزئية",
  rejection:        "رفض",
};
