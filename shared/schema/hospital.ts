import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, date, index, uniqueIndex, pgSequence } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { admissionStatusEnum, cashierShiftStatusEnum } from "./enums";
import { users } from "./users";
import { accounts } from "./finance";
import { departments, pharmacies, warehouses, inventoryLots } from "./inventory";
import { salesInvoiceHeaders, services, patientInvoiceHeaders } from "./invoicing";
import { companies } from "./companies";

// ── تسلسل ترقيم إيصالات تسليم الدرج — يضمن ترقيماً قوياً للمحاسبة ──────────
export const handoverReceiptNumSeq = pgSequence("handover_receipt_num_seq", { startWith: 1, increment: 1 });

// ─── المرضى ────────────────────────────────────────────────────────────────

export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientCode: varchar("patient_code", { length: 20 }).unique(),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 20 }),
  nationalId: varchar("national_id", { length: 20 }),
  age: integer("age"),
  gender: varchar("gender", { length: 10 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // ── Normalized fields for dedup matching ──────────────────────────────────
  normalizedFullName: text("normalized_full_name"),
  normalizedPhone: varchar("normalized_phone", { length: 20 }),
  normalizedNationalId: varchar("normalized_national_id", { length: 20 }),
  // ── Merge tracking ─────────────────────────────────────────────────────────
  mergedIntoPatientId: varchar("merged_into_patient_id"),
  mergedAt: timestamp("merged_at"),
  mergedByUserId: varchar("merged_by_user_id"),
  mergeReason: text("merge_reason"),
}, (table) => ({
  nameIdx: index("idx_patients_name").on(table.fullName),
  phoneIdx: index("idx_patients_phone").on(table.phone),
  nationalIdIdx: index("idx_patients_national_id").on(table.nationalId),
  normNameIdx: index("idx_patients_norm_name").on(table.normalizedFullName),
  normPhoneIdx: index("idx_patients_norm_phone").on(table.normalizedPhone),
  normNidIdx: index("idx_patients_norm_nid").on(table.normalizedNationalId),
}));

// ─── سجل دمج المرضى ──────────────────────────────────────────────────────────
export const patientMergeAudit = pgTable("patient_merge_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  masterPatientId: varchar("master_patient_id").notNull(),
  mergedPatientId: varchar("merged_patient_id").notNull(),
  mergedByUserId: varchar("merged_by_user_id").notNull(),
  mergedAt: timestamp("merged_at").notNull().defaultNow(),
  reason: text("reason"),
  movedInvoiceCount: integer("moved_invoice_count").notNull().default(0),
  movedAdmissionCount: integer("moved_admission_count").notNull().default(0),
  movedAppointmentCount: integer("moved_appointment_count").notNull().default(0),
  rawSnapshotJson: text("raw_snapshot_json"),
}, (table) => ({
  masterIdx: index("idx_pma_master").on(table.masterPatientId),
  mergedIdx: index("idx_pma_merged").on(table.mergedPatientId),
}));

// ─── أسماء بديلة / كودات قديمة ───────────────────────────────────────────────
export const patientAliases = pgTable("patient_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  aliasType: varchar("alias_type", { length: 30 }).notNull(),
  aliasValue: text("alias_value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  patientIdx: index("idx_pal_patient").on(table.patientId),
  valueIdx: index("idx_pal_value").on(table.aliasValue),
}));

export const doctors = pgTable("doctors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  specialty: text("specialty"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("idx_doctors_name").on(table.name),
}));

// ─── الكاشير ───────────────────────────────────────────────────────────────

export const cashierShifts = pgTable("cashier_shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cashierId: varchar("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  unitType: varchar("unit_type", { length: 20 }).notNull().default("pharmacy"),
  pharmacyId: varchar("pharmacy_id").references(() => pharmacies.id),
  departmentId: varchar("department_id").references(() => departments.id),
  glAccountId: varchar("gl_account_id").references(() => accounts.id),
  status: cashierShiftStatusEnum("status").notNull().default("open"),
  openingCash: decimal("opening_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  closingCash: decimal("closing_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  expectedCash: decimal("expected_cash", { precision: 18, scale: 2 }).notNull().default("0"),
  variance: decimal("variance", { precision: 18, scale: 2 }).notNull().default("0"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  // ── Day-boundary & stale tracking ─────────────────────────────────────────
  businessDate: date("business_date"),
  closedBy: varchar("closed_by"),
  staleAt: timestamp("stale_at"),
  staleReason: text("stale_reason"),
  handoverReceiptNumber: integer("handover_receipt_number"),
}, (table) => ({
  cashierIdx: index("idx_cashier_shifts_cashier").on(table.cashierId),
  statusIdx: index("idx_cashier_shifts_status").on(table.status),
  openedAtIdx: index("idx_cashier_shifts_opened").on(table.openedAt),
  pharmacyIdx: index("idx_cashier_shifts_pharmacy").on(table.pharmacyId),
  businessDateIdx: index("idx_cashier_shifts_biz_date").on(table.businessDate),
  pharmacyStatusIdx: index("idx_cashier_shifts_pharmacy_status").on(table.pharmacyId, table.status),
}));

export const cashierTransferLog = pgTable("cashier_transfer_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromShiftId: varchar("from_shift_id").notNull().references(() => cashierShifts.id),
  toShiftId: varchar("to_shift_id").notNull().references(() => cashierShifts.id),
  invoiceIds: text("invoice_ids").notNull(),
  transferredAt: timestamp("transferred_at").notNull().defaultNow(),
  transferredBy: text("transferred_by").notNull(),
  reason: text("reason"),
}, (table) => ({
  fromShiftIdx: index("idx_cashier_transfer_from").on(table.fromShiftId),
  toShiftIdx: index("idx_cashier_transfer_to").on(table.toShiftId),
}));

export const cashierReceipts = pgTable("cashier_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: integer("receipt_number").notNull(),
  shiftId: varchar("shift_id").notNull().references(() => cashierShifts.id),
  invoiceId: varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paymentDate: varchar("payment_date", { length: 10 }),
  collectedBy: text("collected_by").notNull(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  printedAt: timestamp("printed_at"),
  printCount: integer("print_count").notNull().default(0),
  lastPrintedBy: text("last_printed_by"),
  reprintReason: text("reprint_reason"),
}, (table) => ({
  shiftIdx: index("idx_cashier_receipts_shift").on(table.shiftId),
  invoiceUniq: uniqueIndex("idx_cashier_receipts_invoice_unique").on(table.invoiceId),
  receiptNumIdx: index("idx_cashier_receipts_number").on(table.receiptNumber),
}));

export const cashierRefundReceipts = pgTable("cashier_refund_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: integer("receipt_number").notNull(),
  shiftId: varchar("shift_id").notNull().references(() => cashierShifts.id),
  invoiceId: varchar("invoice_id").notNull().references(() => salesInvoiceHeaders.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paymentDate: varchar("payment_date", { length: 10 }),
  refundedBy: text("refunded_by").notNull(),
  refundedAt: timestamp("refunded_at").notNull().defaultNow(),
  printedAt: timestamp("printed_at"),
  printCount: integer("print_count").notNull().default(0),
  lastPrintedBy: text("last_printed_by"),
  reprintReason: text("reprint_reason"),
}, (table) => ({
  shiftIdx: index("idx_cashier_refunds_shift").on(table.shiftId),
  invoiceUniq: uniqueIndex("idx_cashier_refunds_invoice_unique").on(table.invoiceId),
  receiptNumIdx: index("idx_cashier_refunds_number").on(table.receiptNumber),
}));

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
  shiftActionIdx: index("idx_cashier_audit_shift_action").on(table.shiftId, table.action),
}));

// ─── أنواع العمليات ────────────────────────────────────────────────────────

export const SURGERY_CATEGORIES = ["major", "medium", "minor", "skilled", "simple"] as const;
export type SurgeryCategory = (typeof SURGERY_CATEGORIES)[number];

export const surgeryCategoryLabels: Record<SurgeryCategory, string> = {
  major:   "كبرى",
  medium:  "متوسطة",
  minor:   "صغرى",
  skilled: "ذات مهارة",
  simple:  "بسيطة",
};

export const surgeryTypes = pgTable("surgery_types", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr:    text("name_ar").notNull(),
  category:  varchar("category", { length: 20 }).notNull(),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const surgeryCategoryPrices = pgTable("surgery_category_prices", {
  category: varchar("category", { length: 20 }).primaryKey(),
  price:    decimal("price", { precision: 12, scale: 2 }).notNull().default("0"),
});

// ─── قبول المرضى ──────────────────────────────────────────────────────────

export const admissions = pgTable("admissions", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  admissionNumber: varchar("admission_number", { length: 30 }).notNull().unique(),
  patientId:      varchar("patient_id").references(() => patients.id),
  patientName:    text("patient_name").notNull(),
  patientPhone:   text("patient_phone"),
  admissionDate:  date("admission_date").notNull(),
  dischargeDate:  date("discharge_date"),
  status:         admissionStatusEnum("status").notNull().default("active"),
  doctorName:     text("doctor_name"),
  notes:          text("notes"),
  paymentType:    varchar("payment_type", { length: 20 }).default("CASH"),
  insuranceCompany: text("insurance_company"),
  surgeryTypeId:  varchar("surgery_type_id").references(() => surgeryTypes.id),
  // ── Contract FK fields (nullable — Phase 1 foundation) ───────────────────
  companyId:        varchar("company_id").references(() => companies.id),
  contractId:       varchar("contract_id"),
  contractMemberId: varchar("contract_member_id"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  admNumIdx:         index("idx_adm_number").on(table.admissionNumber),
  patientIdx:        index("idx_adm_patient").on(table.patientName),
  patientIdIdx:      index("idx_adm_patient_id").on(table.patientId),
  statusIdx:         index("idx_adm_status").on(table.status),
  dateIdx:           index("idx_adm_date").on(table.admissionDate),
  companyIdx:        index("idx_adm_company").on(table.companyId),
  contractIdx:       index("idx_adm_contract").on(table.contractId),
  contractMemberIdx: index("idx_adm_contract_member").on(table.contractMemberId),
}));

// ─── محرك الإقامة ─────────────────────────────────────────────────────────

export const staySegments = pgTable("stay_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  admissionId: varchar("admission_id").notNull().references(() => admissions.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").references(() => services.id),
  invoiceId: varchar("invoice_id").notNull().references(() => patientInvoiceHeaders.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  status: varchar("status", { length: 10 }).notNull().default("ACTIVE"),
  ratePerDay: decimal("rate_per_day", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  admissionIdx: index("idx_stay_seg_admission").on(table.admissionId),
  statusIdx: index("idx_stay_seg_status").on(table.status),
}));

// ─── لوحة الأسرة ──────────────────────────────────────────────────────────

export const floors = pgTable("floors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sortIdx: index("idx_floors_sort").on(table.sortOrder),
}));

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  floorId: varchar("floor_id").notNull().references(() => floors.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  roomNumber: varchar("room_number", { length: 20 }),
  serviceId: varchar("service_id").references(() => services.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  floorIdx: index("idx_rooms_floor").on(table.floorId),
}));

export const beds = pgTable("beds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  bedNumber: varchar("bed_number", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("EMPTY"),
  currentAdmissionId: varchar("current_admission_id").references(() => admissions.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  roomIdx: index("idx_beds_room").on(table.roomId),
  statusIdx: index("idx_beds_status").on(table.status),
}));

// ─── تحويلات الطبيب ────────────────────────────────────────────────────────

export const doctorTransfers = pgTable("doctor_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => patientInvoiceHeaders.id),
  doctorName: text("doctor_name").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  clientRequestId: varchar("client_request_id", { length: 100 }).notNull().unique(),
  transferredAt: timestamp("transferred_at").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  invoiceIdx: index("idx_dt_invoice_fk").on(table.invoiceId),
}));

export const doctorSettlements = pgTable("doctor_settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  doctorName: text("doctor_name").notNull(),
  paymentDate: text("payment_date").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  settlementUuid: varchar("settlement_uuid", { length: 100 }).notNull().unique(),
  glPosted: boolean("gl_posted").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const doctorSettlementAllocations = pgTable("doctor_settlement_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settlementId: varchar("settlement_id").notNull().references(() => doctorSettlements.id),
  transferId: varchar("transfer_id").notNull().references(() => doctorTransfers.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── كلمات سر الخزن ────────────────────────────────────────────────────────

export const drawerPasswords = pgTable("drawer_passwords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  glAccountId: varchar("gl_account_id").notNull().references(() => accounts.id),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  glAccountUniq: uniqueIndex("idx_drawer_passwords_gl_account").on(table.glAccountId),
}));

// ─── الخزن ────────────────────────────────────────────────────────────────

export const treasuries = pgTable("treasuries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  glAccountId: varchar("gl_account_id").notNull().references(() => accounts.id),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userTreasuries = pgTable("user_treasuries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  treasuryId: varchar("treasury_id").notNull().references(() => treasuries.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const treasuryTransactions = pgTable("treasury_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treasuryId: varchar("treasury_id").notNull().references(() => treasuries.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  description: text("description"),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  transactionDate: date("transaction_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  treasuryIdx: index("idx_treasury_txn_treasury").on(table.treasuryId),
  dateIdx:     index("idx_treasury_txn_date").on(table.transactionDate),
  sourceIdx:   uniqueIndex("idx_treasury_txn_source").on(table.sourceType, table.sourceId, table.treasuryId),
}));

// Insert schemas
export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true });
export const insertDoctorSchema = createInsertSchema(doctors).omit({ id: true, createdAt: true });
export const insertCashierShiftSchema = createInsertSchema(cashierShifts).omit({ id: true, openedAt: true, closedAt: true, staleAt: true });
export const insertCashierTransferLogSchema = createInsertSchema(cashierTransferLog).omit({ id: true, transferredAt: true });
export const insertCashierReceiptSchema = createInsertSchema(cashierReceipts).omit({ id: true, collectedAt: true });
export const insertCashierRefundReceiptSchema = createInsertSchema(cashierRefundReceipts).omit({ id: true, refundedAt: true });
export const insertCashierAuditLogSchema = createInsertSchema(cashierAuditLog).omit({ id: true, performedAt: true });
export const insertSurgeryTypeSchema = createInsertSchema(surgeryTypes).omit({ id: true, createdAt: true });
export const insertAdmissionSchema = createInsertSchema(admissions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDrawerPasswordSchema = createInsertSchema(drawerPasswords).omit({ id: true, updatedAt: true });
export const insertTreasurySchema = createInsertSchema(treasuries).omit({ id: true, createdAt: true });
export const insertUserTreasurySchema = createInsertSchema(userTreasuries).omit({ id: true, createdAt: true });
export const insertTreasuryTransactionSchema = createInsertSchema(treasuryTransactions).omit({ id: true, createdAt: true });

// Types
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

export type PatientSearchResult = {
  id:          string;
  patientCode: string | null;
  fullName:    string;
  phone:       string | null;
  nationalId:  string | null;
  age:         number | null;
  isActive:    boolean;
  createdAt:   Date;
  isWalkIn:    boolean;
};

export type InsertDoctor = z.infer<typeof insertDoctorSchema>;
export type Doctor = typeof doctors.$inferSelect;

export type InsertCashierShift = z.infer<typeof insertCashierShiftSchema>;
export type CashierShift = typeof cashierShifts.$inferSelect;

export type InsertCashierReceipt = z.infer<typeof insertCashierReceiptSchema>;
export type CashierReceipt = typeof cashierReceipts.$inferSelect;

export type InsertCashierRefundReceipt = z.infer<typeof insertCashierRefundReceiptSchema>;
export type CashierRefundReceipt = typeof cashierRefundReceipts.$inferSelect;

export type InsertCashierAuditLog = z.infer<typeof insertCashierAuditLogSchema>;
export type CashierAuditLogEntry = typeof cashierAuditLog.$inferSelect;

export type InsertSurgeryType = z.infer<typeof insertSurgeryTypeSchema>;
export type SurgeryType = typeof surgeryTypes.$inferSelect;

export type SurgeryCategoryPrice = typeof surgeryCategoryPrices.$inferSelect;

export type InsertAdmission = z.infer<typeof insertAdmissionSchema>;
export type Admission = typeof admissions.$inferSelect;

export type StaySegment = typeof staySegments.$inferSelect;
export type Floor = typeof floors.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Bed = typeof beds.$inferSelect;

export type DoctorTransfer = typeof doctorTransfers.$inferSelect;
export type DoctorSettlement = typeof doctorSettlements.$inferSelect;
export type DoctorSettlementAllocation = typeof doctorSettlementAllocations.$inferSelect;

export type InsertDrawerPassword = z.infer<typeof insertDrawerPasswordSchema>;
export type DrawerPassword = typeof drawerPasswords.$inferSelect;

export type Treasury = typeof treasuries.$inferSelect;
export type InsertTreasury = z.infer<typeof insertTreasurySchema>;
export type UserTreasury = typeof userTreasuries.$inferSelect;
export type TreasuryTransaction = typeof treasuryTransactions.$inferSelect;

// Labels
export const cashierShiftStatusLabels: Record<string, string> = {
  open: "مفتوحة",
  closed: "مغلقة",
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
