/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Companies Schema — جدول شركات التأمين والتعاقد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ملف مستقل لا يستورد من invoicing.ts أو hospital.ts لتجنّب
 *  الاستيراد الدائري (circular import). يستورد فقط من finance.ts.
 *
 *  العلاقات:
 *    companies → accounts (glAccountId)  [أحادية الاتجاه]
 *    contracts → companies               [في contracts.ts]
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, decimal,
  boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { accounts } from "./finance";

// ─── الشركات (Companies) ──────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id:                       varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code:                     varchar("code", { length: 30 }).notNull().unique(),
  nameAr:                   text("name_ar").notNull(),
  nameEn:                   text("name_en"),
  companyType:              text("company_type").notNull().default("contract"),
  isActive:                 boolean("is_active").notNull().default(true),
  phone:                    text("phone"),
  email:                    text("email"),
  address:                  text("address"),
  taxId:                    text("tax_id"),
  glAccountId:              varchar("gl_account_id").references(() => accounts.id),
  defaultPaymentTermsDays:  integer("default_payment_terms_days"),
  creditLimit:              decimal("credit_limit", { precision: 18, scale: 2 }),
  notes:                    text("notes"),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx:      index("idx_companies_code").on(table.code),
  nameArIdx:    index("idx_companies_name_ar").on(table.nameAr),
  typeIdx:      index("idx_companies_type").on(table.companyType),
  activeIdx:    index("idx_companies_active").on(table.isActive),
  glAcctIdx:    index("idx_companies_gl_account").on(table.glAccountId),
}));

// ─── Schemas & Types ──────────────────────────────────────────────────────

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Company       = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

// ─── Labels ───────────────────────────────────────────────────────────────

export const companyTypeLabels: Record<string, string> = {
  insurance: "تأمين",
  contract:  "تعاقد",
  both:      "تأمين وتعاقد",
};
