/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Schema — جداول العقود والمنتسبين
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
 *    contracts       → companies, priceLists
 *    contractMembers → contracts, patients
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, decimal, boolean,
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

// ─── Schemas & Types ──────────────────────────────────────────────────────

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertContractMemberSchema = createInsertSchema(contractMembers).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Contract             = typeof contracts.$inferSelect;
export type InsertContract       = z.infer<typeof insertContractSchema>;
export type ContractMember       = typeof contractMembers.$inferSelect;
export type InsertContractMember = z.infer<typeof insertContractMemberSchema>;

// ─── Labels ───────────────────────────────────────────────────────────────

export const relationTypeLabels: Record<string, string> = {
  primary: "منتسب رئيسي",
  spouse:  "زوج/زوجة",
  child:   "ابن/ابنة",
  parent:  "والد/والدة",
  other:   "أخرى",
};
