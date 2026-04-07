/**
 * oversell-resolution-engine.ts
 * ─────────────────────────────
 * Resolves pending_stock_allocations by performing real FEFO lot deductions
 * and recording the cost to oversell_cost_resolutions.
 *
 * Entry point: resolveOversellBatch()
 *
 * SAFETY INVARIANTS:
 *  - Runs entirely inside one DB transaction (tx passed from caller).
 *  - Never writes negative lot quantities.
 *  - UNIQUE constraint on uq_psa_line prevents double-resolution.
 *  - Only processes allocations with status = 'pending'.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq, inArray } from "drizzle-orm";
import {
  pendingStockAllocations,
  oversellResolutionBatches,
  oversellCostResolutions,
  stockMovementHeaders,
  inventoryLotMovements,
} from "@shared/schema";
import { roundMoney } from "../finance-helpers";

export interface ResolveLine {
  pendingAllocationId: string;
  /** how many minor-unit to resolve in this run — can be partial */
  qtyMinorToResolve: number;
}

export interface ResolveBatchParams {
  warehouseId: string;
  resolvedBy: string;
  notes?: string;
  lines: ResolveLine[];
}

export interface ResolvedLineResult {
  pendingAllocationId: string;
  invoiceId: string;
  invoiceLineId: string;
  itemId: string;
  qtyMinorResolved: number;
  totalCost: number;
  lotId: string | null;
  status: "fully_resolved" | "partially_resolved" | "insufficient_stock";
}

export interface ResolveBatchResult {
  batchId: string;
  stockMovementHeaderId: string | null;
  lines: ResolvedLineResult[];
}

/**
 * Resolve a batch of pending oversell allocations.
 * Must be called inside a DB transaction if the caller already has one.
 */
export async function resolveOversellBatch(
  params: ResolveBatchParams,
  tx: typeof db = db
): Promise<ResolveBatchResult> {
  const { warehouseId, resolvedBy, notes, lines } = params;

  if (lines.length === 0) throw new Error("لا توجد بنود للتسوية");

  // ── 1. Lock and validate pending allocations ─────────────────────────────
  const allocationIds = lines.map((l) => l.pendingAllocationId);
  const idsFragment = sql.join(allocationIds.map((id) => sql`${id}`), sql`, `);
  const lockedRes = await tx.execute(
    sql`SELECT * FROM pending_stock_allocations
        WHERE id IN (${idsFragment})
          AND status IN ('pending', 'partially_resolved')
        FOR UPDATE`,
  );
  const locked = lockedRes.rows as Array<Record<string, unknown>>;

  if (locked.length === 0) throw new Error("لم يتم العثور على طلبات تسوية معلقة");

  // ── 2. Create resolution batch ───────────────────────────────────────────
  const [batch] = await tx.insert(oversellResolutionBatches).values({
    warehouseId,
    resolvedBy,
    resolvedAt: new Date(),
    notes: notes ?? null,
    stockMovementHeaderId: null,
  }).returning();

  // ── 3. Create stock movement header ─────────────────────────────────────
  const [movHeader] = await tx.insert(stockMovementHeaders).values({
    operationType: "oversell_resolution",
    referenceType: "oversell_batch",
    referenceId: batch.id,
    warehouseId,
    totalCost: "0",
    status: "posted",
    createdBy: resolvedBy,
  }).returning();

  await tx.update(oversellResolutionBatches)
    .set({ stockMovementHeaderId: movHeader.id })
    .where(eq(oversellResolutionBatches.id, batch.id));

  // ── 4. Process each line — FEFO lot deduction ────────────────────────────
  const lineResults: ResolvedLineResult[] = [];
  let batchTotalCost = 0;

  for (const reqLine of lines) {
    const allocation = locked.find((r) => r.id === reqLine.pendingAllocationId);
    if (!allocation) {
      lineResults.push({
        pendingAllocationId: reqLine.pendingAllocationId,
        invoiceId: "",
        invoiceLineId: "",
        itemId: "",
        qtyMinorResolved: 0,
        totalCost: 0,
        lotId: null,
        status: "insufficient_stock",
      });
      continue;
    }

    const itemId = allocation.item_id as string;
    const invoiceId = allocation.invoice_id as string;
    const invoiceLineId = allocation.invoice_line_id as string;

    // Get item metadata for expiry flag
    const itemRes = await tx.execute(sql`SELECT has_expiry FROM items WHERE id = ${itemId} LIMIT 1`);
    const hasExpiry = (itemRes.rows[0] as any)?.has_expiry ?? false;

    // FEFO lot query
    const lotsRes = await tx.execute(
      hasExpiry
        ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = ${itemId}
                AND warehouse_id = ${warehouseId}
                AND is_active = true
                AND qty_in_minor::numeric > 0
              ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
              FOR UPDATE`
        : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = ${itemId}
                AND warehouse_id = ${warehouseId}
                AND is_active = true
                AND qty_in_minor::numeric > 0
              ORDER BY received_date ASC, created_at ASC
              FOR UPDATE`
    );
    const lots = lotsRes.rows as any[];

    let remaining = reqLine.qtyMinorToResolve;
    let totalCost = 0;
    let firstLotId: string | null = null;

    for (const lot of lots) {
      if (remaining <= 0.00005) break;
      const available = parseFloat(lot.qty_in_minor);
      const deduct = Math.min(available, remaining);
      const unitCost = parseFloat(lot.purchase_price);
      const lineCost = deduct * unitCost;

      if (!firstLotId) firstLotId = lot.id;

      // Deduct from lot
      await tx.execute(
        sql`UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW()
            WHERE id = ${lot.id}`
      );

      // Record movement
      await tx.insert(inventoryLotMovements).values({
        lotId: lot.id,
        warehouseId,
        txType: "out",
        qtyChangeInMinor: String(-deduct),
        unitCost: String(unitCost),
        referenceType: "oversell_resolution",
        referenceId: batch.id,
      });

      // Record cost resolution line
      const costRounded = parseFloat(roundMoney(lineCost));
      await tx.insert(oversellCostResolutions).values({
        batchId: batch.id,
        pendingAllocationId: reqLine.pendingAllocationId,
        invoiceId,
        invoiceLineId,
        itemId,
        lotId: lot.id,
        warehouseId,
        qtyMinorResolved: String(deduct),
        unitCost: String(unitCost),
        totalCost: String(costRounded),
      });

      totalCost += costRounded;
      batchTotalCost += costRounded;
      remaining -= deduct;
    }

    const qtyResolved = reqLine.qtyMinorToResolve - Math.max(0, remaining);
    const qtyPendingAfter = parseFloat(allocation.qty_minor_pending as string) - qtyResolved;
    const fullyResolved = qtyPendingAfter <= 0.00005;

    // Update pending allocation status
    await tx.update(pendingStockAllocations)
      .set({
        qtyMinorPending: String(Math.max(0, qtyPendingAfter)),
        status: fullyResolved ? "fully_resolved" : "partially_resolved",
        resolvedBy,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pendingStockAllocations.id, reqLine.pendingAllocationId));

    // Update patient invoice line stock_issue_status
    if (fullyResolved) {
      await tx.execute(
        sql`UPDATE patient_invoice_lines
            SET stock_issue_status = 'cost_resolved'
            WHERE id = ${invoiceLineId}`
      );
    }

    lineResults.push({
      pendingAllocationId: reqLine.pendingAllocationId,
      invoiceId,
      invoiceLineId,
      itemId,
      qtyMinorResolved: qtyResolved,
      totalCost,
      lotId: firstLotId,
      status: fullyResolved
        ? "fully_resolved"
        : remaining > 0.00005
          ? "insufficient_stock"
          : "partially_resolved",
    });
  }

  // Update movement header total cost
  await tx.execute(
    sql`UPDATE stock_movement_headers SET total_cost = ${roundMoney(batchTotalCost)} WHERE id = ${movHeader.id}`
  );

  return {
    batchId: batch.id,
    stockMovementHeaderId: movHeader.id,
    lines: lineResults,
  };
}
