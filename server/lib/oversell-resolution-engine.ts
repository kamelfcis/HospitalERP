/**
 * oversell-resolution-engine.ts
 * ─────────────────────────────
 * Resolves pending_stock_allocations by performing real FEFO lot deductions,
 * recording the cost to oversell_cost_resolutions, and generating a GL journal
 * entry using accounts from the Account Mappings screen (oversell_resolution tx type).
 *
 * Entry point: resolveOversellBatch()
 *
 * SAFETY INVARIANTS:
 *  - Runs entirely inside one DB transaction (tx passed from caller).
 *  - Never writes negative lot quantities.
 *  - UNIQUE constraint on uq_psa_line prevents double-resolution.
 *  - Only processes allocations with status = 'pending'.
 *  - GL journal is BLOCKED (not silently skipped) if COGS account or
 *    warehouse GL account is not configured. The resolution fails with a
 *    clear Arabic error message listing the missing mapping.
 */
import { db } from "../db";
import { sql, eq, inArray } from "drizzle-orm";
import {
  pendingStockAllocations,
  oversellResolutionBatches,
  oversellCostResolutions,
  stockMovementHeaders,
  inventoryLotMovements,
  journalEntries,
  journalLines,
} from "@shared/schema";
import { roundMoney } from "../finance-helpers";
import { resolveCostCenters } from "./cost-center-resolver";
import { logger } from "./logger";

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
  journalEntryId: string | null;
  journalStatus: "posted" | "blocked" | "none";
  journalBlockReason?: string;
  lines: ResolvedLineResult[];
}

export interface GlReadinessResult {
  ready: boolean;
  checks: {
    key: string;
    label: string;
    ok: boolean;
    accountCode?: string;
    accountName?: string;
    message?: string;
  }[];
}

/**
 * Check if all required GL accounts are configured for oversell_resolution.
 * Returns a detailed readiness report.
 * Can run inside or outside a transaction.
 */
export async function checkOversellGlReadiness(
  warehouseId: string,
  tx: typeof db = db
): Promise<GlReadinessResult> {
  const checks: GlReadinessResult["checks"] = [];

  // ── 1. COGS account from account_mappings ────────────────────────────────
  const cogsMappingRes = await tx.execute(sql`
    SELECT am.debit_account_id, a.code, a.name
    FROM account_mappings am
    LEFT JOIN accounts a ON a.id = am.debit_account_id
    WHERE am.transaction_type = 'oversell_resolution'
      AND am.line_type = 'cogs'
      AND am.is_active = true
      AND am.warehouse_id IS NULL
      AND am.pharmacy_id IS NULL
    LIMIT 1
  `);
  const cogsRow = (cogsMappingRes as any).rows?.[0];
  const cogsAccountId = cogsRow?.debit_account_id ?? null;

  checks.push({
    key: "cogs_account",
    label: "حساب تكلفة البضاعة المباعة (COGS)",
    ok: !!cogsAccountId,
    accountCode: cogsRow?.code ?? undefined,
    accountName: cogsRow?.name ?? undefined,
    message: cogsAccountId
      ? undefined
      : "يجب ربط حساب COGS في شاشة إدارة الحسابات ← تسوية الصرف المؤجل التكلفة ← تكلفة البضاعة المباعة",
  });

  // ── 2. Warehouse GL account (inventory credit) ───────────────────────────
  const warehouseRes = await tx.execute(sql`
    SELECT w.gl_account_id, a.code, a.name
    FROM warehouses w
    LEFT JOIN accounts a ON a.id = w.gl_account_id
    WHERE w.id = ${warehouseId}
    LIMIT 1
  `);
  const warehouseRow = (warehouseRes as any).rows?.[0];
  const inventoryAccountId = warehouseRow?.gl_account_id ?? null;

  checks.push({
    key: "inventory_account",
    label: "حساب المخزون (GL المخزن)",
    ok: !!inventoryAccountId,
    accountCode: warehouseRow?.code ?? undefined,
    accountName: warehouseRow?.name ?? undefined,
    message: inventoryAccountId
      ? undefined
      : "يجب ربط حساب GL للمخزن في إعدادات المستودع",
  });

  return {
    ready: checks.every((c) => c.ok),
    checks,
  };
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

  // ── 0. GL Readiness pre-check ────────────────────────────────────────────
  const glReadiness = await checkOversellGlReadiness(warehouseId, tx);
  if (!glReadiness.ready) {
    const missing = glReadiness.checks
      .filter((c) => !c.ok)
      .map((c) => c.message)
      .join(" | ");
    throw new Error(`لا يمكن إتمام التسوية: الحسابات المحاسبية غير مكتملة — ${missing}`);
  }

  const cogsAccountId = (await tx.execute(sql`
    SELECT debit_account_id FROM account_mappings
    WHERE transaction_type = 'oversell_resolution' AND line_type = 'cogs'
      AND is_active = true AND warehouse_id IS NULL AND pharmacy_id IS NULL
    LIMIT 1
  `) as any).rows[0]?.debit_account_id as string;

  const inventoryAccountId = (await tx.execute(sql`
    SELECT gl_account_id FROM warehouses WHERE id = ${warehouseId} LIMIT 1
  `) as any).rows[0]?.gl_account_id as string;

  // ── 1. Lock and validate pending allocations ─────────────────────────────
  const allocationIds = lines.map((l) => l.pendingAllocationId);
  const idsFragment = sql.join(allocationIds.map((id) => sql`${id}`), sql`, `);
  const lockedRes = await tx.execute(
    sql`SELECT * FROM pending_stock_allocations
        WHERE id IN (${idsFragment})
          AND status IN ('pending', 'partially_resolved')
        FOR UPDATE`,
  );
  const locked = (lockedRes as any).rows as Array<Record<string, unknown>>;

  if (locked.length === 0) throw new Error("لم يتم العثور على طلبات تسوية معلقة");

  // ── 2. Create resolution batch ───────────────────────────────────────────
  const [batch] = await tx.insert(oversellResolutionBatches).values({
    warehouseId,
    resolvedBy,
    resolvedAt: new Date(),
    notes: notes ?? null,
    stockMovementHeaderId: null,
    journalEntryId: null,
    journalStatus: "none",
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
    const hasExpiry = (itemRes as any).rows[0]?.has_expiry ?? false;

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
    const lots = (lotsRes as any).rows as any[];

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

  // ── 5. GL Journal entry ── Dr COGS / Cr Inventory (warehouse GL) ─────────
  let journalEntryId: string | null = null;
  let journalStatus: "posted" | "blocked" | "none" = "none";
  let journalBlockReason: string | undefined;

  if (batchTotalCost > 0.001) {
    try {
      const entryNumRes = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
      const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);

      const todayStr = new Date().toISOString().split("T")[0];

      const periodRes = await tx.execute(sql`
        SELECT id FROM fiscal_periods
        WHERE is_closed = false
          AND start_date <= ${todayStr}::date
          AND end_date   >= ${todayStr}::date
        LIMIT 1
      `);
      const periodId = (periodRes as any).rows[0]?.id ?? null;

      const batchRef = batch.id.slice(-8).toUpperCase();
      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: todayStr,
        description: `تسوية تكلفة صرف مؤجل - دفعة ${batchRef}`,
        reference: `OVSELL-${batchRef}`,
        status: "posted" as const,
        periodId,
        createdBy: resolvedBy,
        sourceType: "oversell_resolution",
        sourceDocumentId: batch.id,
      }).returning({ id: journalEntries.id });

      const amount = roundMoney(batchTotalCost);

      const rawLines = await resolveCostCenters([
        {
          journalEntryId: entry.id,
          lineNumber: 1,
          accountId: cogsAccountId,
          debit: amount,
          credit: "0",
          description: `تكلفة بضاعة مباعة - صرف مؤجل (${batchRef})`,
        },
        {
          journalEntryId: entry.id,
          lineNumber: 2,
          accountId: inventoryAccountId,
          debit: "0",
          credit: amount,
          description: `خروج مخزون - صرف مؤجل (${batchRef})`,
        },
      ]);
      await tx.insert(journalLines).values(rawLines);

      // Link journal to batch
      await tx.update(oversellResolutionBatches)
        .set({ journalEntryId: entry.id, journalStatus: "posted" })
        .where(eq(oversellResolutionBatches.id, batch.id));

      journalEntryId = entry.id;
      journalStatus = "posted";
      logger.info({ batchId: batch.id, journalEntryId: entry.id, amount }, "[OVERSELL_GL] journal posted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, batchId: batch.id }, "[OVERSELL_GL] journal failed");
      await tx.update(oversellResolutionBatches)
        .set({ journalStatus: "blocked" })
        .where(eq(oversellResolutionBatches.id, batch.id));
      journalStatus = "blocked";
      journalBlockReason = msg;
      throw new Error(`فشل إنشاء القيد المحاسبي: ${msg}`);
    }
  }

  return {
    batchId: batch.id,
    stockMovementHeaderId: movHeader.id,
    journalEntryId,
    journalStatus,
    journalBlockReason,
    lines: lineResults,
  };
}
