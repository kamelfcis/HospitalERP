/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  oversell.ts — الصرف بدون رصيد (Oversell) وتسوية التكلفة المؤجلة
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ┌──────────────────────────────────┬──────────────────────────────────────────┐
 *  │ الجدول                           │ الغرض                                    │
 *  ├──────────────────────────────────┼──────────────────────────────────────────┤
 *  │ pending_stock_allocations        │ أسطر فواتير بدون خصم مخزون فعلي         │
 *  │ oversell_resolution_batches      │ دفعات التسوية — تجمع عمليات الخصم       │
 *  │ oversell_cost_resolutions        │ سطور التسوية — ربط بالدفعات والتكلفة    │
 *  └──────────────────────────────────┴──────────────────────────────────────────┘
 *
 *  العلاقات:
 *    pending_stock_allocations — مرجع لسطر الفاتورة والصنف والمخزن
 *    oversell_resolution_batches — مرجع للمخزن وحركة المخزون وقيد اليومية
 *    oversell_cost_resolutions → oversell_resolution_batches, pending_stock_allocations
 *
 *  لا يستورد من ملفات schema أخرى (مراجع varchar فقط — لتجنب الدوران)
 *  لا يُستورد بواسطة ملفات schema أخرى
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { pgTable, varchar, text, decimal, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// pending_stock_allocations
// One row per invoice line that was finalized WITHOUT actual stock deduction
// (because allow_oversell = true on the item and stock was insufficient).
// ─────────────────────────────────────────────────────────────────────────────
export const pendingStockAllocations = pgTable("pending_stock_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Source
  invoiceId:    varchar("invoice_id").notNull(),
  invoiceLineId: varchar("invoice_line_id").notNull(),
  itemId:       varchar("item_id").notNull(),
  warehouseId:  varchar("warehouse_id").notNull(),
  // Quantity still pending (minor units)
  qtyMinorPending:  decimal("qty_minor_pending",  { precision: 18, scale: 6 }).notNull(),
  qtyMinorOriginal: decimal("qty_minor_original", { precision: 18, scale: 6 }).notNull(),
  // Status lifecycle
  // pending → partially_resolved | fully_resolved | cancelled
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  // Human-readable reason supplied by the user at finalize time
  reason: text("reason"),
  // Snapshot of what was available at finalize time
  qtyMinorAvailableAtFinalize: decimal("qty_minor_available_at_finalize", { precision: 18, scale: 6 }).default("0"),
  // Who / when
  createdBy:   varchar("created_by"),
  resolvedBy:  varchar("resolved_by"),
  resolvedAt:  timestamp("resolved_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  invoiceIdx:    index("idx_psa_invoice").on(t.invoiceId),
  itemIdx:       index("idx_psa_item").on(t.itemId),
  statusIdx:     index("idx_psa_status").on(t.status),
  lineUnique:    unique("uq_psa_line").on(t.invoiceLineId),
}));

export const insertPendingStockAllocationSchema = createInsertSchema(pendingStockAllocations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPendingStockAllocation = z.infer<typeof insertPendingStockAllocationSchema>;
export type PendingStockAllocation = typeof pendingStockAllocations.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// oversell_resolution_batches
// A resolution batch groups one or more lot-level deductions that fully or
// partially resolve a set of pending_stock_allocations.
// Created by the Resolution Engine when a pharmacist runs the resolve action.
// ─────────────────────────────────────────────────────────────────────────────
export const oversellResolutionBatches = pgTable("oversell_resolution_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull(),
  resolvedBy:  varchar("resolved_by").notNull(),
  resolvedAt:  timestamp("resolved_at").notNull().defaultNow(),
  notes:       text("notes"),
  // Movement header created in stock_movement_headers to record the actual lot deductions
  stockMovementHeaderId: varchar("stock_movement_header_id"),
  journalEntryId: varchar("journal_entry_id"),
  journalStatus: varchar("journal_status", { length: 30 }).default("none"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  warehouseIdx: index("idx_orb_warehouse").on(t.warehouseId),
  resolvedIdx:  index("idx_orb_resolved_at").on(t.resolvedAt),
}));

export const insertOversellResolutionBatchSchema = createInsertSchema(oversellResolutionBatches).omit({ id: true, createdAt: true });
export type InsertOversellResolutionBatch = z.infer<typeof insertOversellResolutionBatchSchema>;
export type OversellResolutionBatch = typeof oversellResolutionBatches.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// oversell_cost_resolutions
// Line-level record linking a pending_stock_allocation to a batch and
// capturing the actual lot deducted, quantity resolved, and COGS captured.
// ─────────────────────────────────────────────────────────────────────────────
export const oversellCostResolutions = pgTable("oversell_cost_resolutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId:               varchar("batch_id").notNull().references(() => oversellResolutionBatches.id),
  pendingAllocationId:   varchar("pending_allocation_id").notNull().references(() => pendingStockAllocations.id),
  invoiceId:             varchar("invoice_id").notNull(),
  invoiceLineId:         varchar("invoice_line_id").notNull(),
  itemId:                varchar("item_id").notNull(),
  lotId:                 varchar("lot_id"),
  warehouseId:           varchar("warehouse_id").notNull(),
  qtyMinorResolved:      decimal("qty_minor_resolved", { precision: 18, scale: 6 }).notNull(),
  unitCost:              decimal("unit_cost",           { precision: 18, scale: 6 }).notNull(),
  totalCost:             decimal("total_cost",          { precision: 18, scale: 2 }).notNull(),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  batchIdx:  index("idx_ocr_batch").on(t.batchId),
  pendIdx:   index("idx_ocr_pending").on(t.pendingAllocationId),
  invIdx:    index("idx_ocr_invoice").on(t.invoiceId),
  itemIdx:   index("idx_ocr_item").on(t.itemId),
}));

export const insertOversellCostResolutionSchema = createInsertSchema(oversellCostResolutions).omit({ id: true, createdAt: true });
export type InsertOversellCostResolution = z.infer<typeof insertOversellCostResolutionSchema>;
export type OversellCostResolution = typeof oversellCostResolutions.$inferSelect;
