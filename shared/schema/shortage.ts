/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  كشكول النواقص — Shortage Notebook Schema
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  جدولان:
 *
 *  shortage_events   — سجل أحداث (append-only event log)
 *    كل ضغطة Alt+S تسجّل صفاً. يحفظ التاريخ الكامل: من طلب، متى، من أي مخزن/شاشة.
 *
 *  shortage_agg      — ملخّص مُجمَّع (primary key = item_id)
 *    يُحدَّث بـ UPSERT عند كل حدث جديد. هو مصدر الـ query الرئيسي لشاشة التحليل.
 *    أداء O(1) للقراءة بدون GROUP BY على الأحداث الخام.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  pgTable, varchar, text, integer, boolean,
  timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Shortage Events — سجل أحداث النواقص ─────────────────────────────────────
export const shortageEvents = pgTable("shortage_events", {
  id:           varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId:       varchar("item_id").notNull(),         // FK → items.id
  warehouseId:  varchar("warehouse_id"),              // المخزن الذي أبلغ عن النقص
  requestedBy:  varchar("requested_by").notNull(),    // FK → users.id
  sourceScreen: varchar("source_screen", { length: 50 }).notNull().default("manual"),
  // قيم sourceScreen: 'sales_invoice' | 'patient_invoice' | 'manual'
  notes:        text(),
  requestedAt:  timestamp("requested_at").notNull().defaultNow(),
}, (t) => ({
  // لفحص التكرار في آخر N ثانية — الأهم في الـ debounce check
  idxItemUser:  index("idx_shortage_events_item_user").on(t.itemId, t.requestedBy, t.requestedAt),
  idxRequestAt: index("idx_shortage_events_requested_at").on(t.requestedAt),
  idxWarehouse: index("idx_shortage_events_warehouse").on(t.warehouseId, t.requestedAt),
}));

// ── Shortage Agg — الملخّص المُجمَّع (صف واحد لكل صنف) ──────────────────────
export const shortageAgg = pgTable("shortage_agg", {
  itemId:                varchar("item_id").primaryKey(), // FK → items.id
  requestCount:          integer("request_count").notNull().default(0),
  recentRequestCount:    integer("recent_request_count").notNull().default(0),
  // recent = آخر 7 أيام — يُحدَّث في الـ UPSERT من shortage_events
  firstRequestedAt:      timestamp("first_requested_at").notNull(),
  lastRequestedAt:       timestamp("last_requested_at").notNull(),
  // requesting_warehouse_ids: مصفوفة المخازن التي أبلغت عن هذا النقص
  // تُستخدم في منطق available_elsewhere
  requestingWarehouseIds: text("requesting_warehouse_ids").notNull().default("[]"),
  // JSON array string: '["wh-id-1","wh-id-2"]'
  isResolved:            boolean("is_resolved").notNull().default(false),
  resolvedAt:            timestamp("resolved_at"),
  resolvedBy:            varchar("resolved_by"),
  refreshedAt:           timestamp("refreshed_at").notNull().defaultNow(),
}, (t) => ({
  idxCountDesc:    index("idx_shortage_agg_count_desc").on(t.requestCount),
  idxLastAt:       index("idx_shortage_agg_last_at").on(t.lastRequestedAt),
  idxResolved:     index("idx_shortage_agg_resolved").on(t.isResolved, t.lastRequestedAt),
}));

// ── Types ─────────────────────────────────────────────────────────────────────
export type ShortageEvent = typeof shortageEvents.$inferSelect;
export type ShortageAgg   = typeof shortageAgg.$inferSelect;
