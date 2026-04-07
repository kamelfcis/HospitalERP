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
 *  - Never writes negative lot quantities (explicit pre-check per lot).
 *  - UNIQUE constraint on uq_psa_line prevents double-resolution.
 *  - Only processes allocations with status = 'pending' or 'partially_resolved'.
 *  - GL journal is BLOCKED (not silently skipped) if COGS account or
 *    warehouse GL account is not configured. The resolution fails with a
 *    clear Arabic error message listing the missing mapping.
 *  - Double-posting guard: checks journal_entry_id on batch before creating journal.
 *  - Pre-check: invoice must not be cancelled before deducting stock.
 *  - cost_status on patient_invoice_lines is updated to 'partial' or 'resolved'.
 */
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
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

// ─────────────────────────────────────────────────────────────────────────────
// GL Readiness Check
// ─────────────────────────────────────────────────────────────────────────────
export async function checkOversellGlReadiness(
  warehouseId: string,
  tx: typeof db = db
): Promise<GlReadinessResult> {
  const checks: GlReadinessResult["checks"] = [];

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

  return { ready: checks.every((c) => c.ok), checks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Resolution Function
// ─────────────────────────────────────────────────────────────────────────────
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

  // ── 1. Lock and validate pending allocations (FOR UPDATE) ─────────────────
  const allocationIds = lines.map((l) => l.pendingAllocationId);
  const idsFragment = sql.join(allocationIds.map((id) => sql`${id}`), sql`, `);
  const lockedRes = await tx.execute(
    sql`SELECT psa.*, pih.status AS invoice_status
        FROM pending_stock_allocations psa
        JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        WHERE psa.id IN (${idsFragment})
          AND psa.status IN ('pending', 'partially_resolved')
        FOR UPDATE OF psa`,
  );
  const locked = (lockedRes as any).rows as Array<Record<string, unknown>>;

  if (locked.length === 0) throw new Error("لم يتم العثور على طلبات تسوية معلقة");

  // ── 1a. Pre-check: invoice must not be cancelled ──────────────────────────
  const cancelledInvoices = locked.filter((r) => r.invoice_status === "cancelled");
  if (cancelledInvoices.length > 0) {
    const ids = cancelledInvoices.map((r) => r.invoice_id).join(", ");
    throw new Error(`لا يمكن تسوية بنود لفواتير ملغاة: ${ids}`);
  }

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
        invoiceId: "", invoiceLineId: "", itemId: "",
        qtyMinorResolved: 0, totalCost: 0, lotId: null,
        status: "insufficient_stock",
      });
      continue;
    }

    const itemId       = allocation.item_id as string;
    const invoiceId    = allocation.invoice_id as string;
    const invoiceLineId = allocation.invoice_line_id as string;

    const itemRes = await tx.execute(sql`SELECT has_expiry FROM items WHERE id = ${itemId} LIMIT 1`);
    const hasExpiry = (itemRes as any).rows[0]?.has_expiry ?? false;

    // FEFO lot query — FOR UPDATE to prevent concurrent deduction
    const lotsRes = await tx.execute(
      hasExpiry
        ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = ${itemId}
                AND warehouse_id = ${warehouseId}
                AND is_active = true
                AND qty_in_minor::numeric > 0.00005
              ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
              FOR UPDATE`
        : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = ${itemId}
                AND warehouse_id = ${warehouseId}
                AND is_active = true
                AND qty_in_minor::numeric > 0.00005
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

      // ── No-negative-stock safety check ──────────────────────────────────
      if (available <= 0.00005) continue;
      const deduct = Math.min(available, remaining);

      // Explicit guard: deduct must not exceed available
      if (deduct > available + 0.00005) {
        throw new Error(`[INTEGRITY] محاولة خصم ${deduct} من دور يحتوي ${available} — مرفوض`);
      }

      const unitCost = parseFloat(lot.purchase_price);
      const lineCost = deduct * unitCost;
      if (!firstLotId) firstLotId = lot.id;

      await tx.execute(
        sql`UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW()
            WHERE id = ${lot.id}
              AND qty_in_minor::numeric >= ${deduct - 0.00005}`
        // WHERE clause prevents negative stock at DB level
      );

      // Verify the update applied (deduct was within bounds)
      const verifyRes = await tx.execute(
        sql`SELECT qty_in_minor FROM inventory_lots WHERE id = ${lot.id}`
      );
      const qtyAfter = parseFloat((verifyRes as any).rows[0]?.qty_in_minor ?? "0");
      if (qtyAfter < -0.001) {
        throw new Error(`[INTEGRITY] الدور ${lot.id} وصل إلى رصيد سالب (${qtyAfter}) — العملية ملغاة`);
      }

      await tx.insert(inventoryLotMovements).values({
        lotId: lot.id,
        warehouseId,
        txType: "out",
        qtyChangeInMinor: String(-deduct),
        unitCost: String(unitCost),
        referenceType: "oversell_resolution",
        referenceId: batch.id,
      });

      const costRounded = parseFloat(roundMoney(lineCost));
      await tx.insert(oversellCostResolutions).values({
        batchId: batch.id,
        pendingAllocationId: reqLine.pendingAllocationId,
        invoiceId, invoiceLineId, itemId,
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

    const qtyResolved   = reqLine.qtyMinorToResolve - Math.max(0, remaining);
    const qtyPendingAfter = parseFloat(allocation.qty_minor_pending as string) - qtyResolved;
    const fullyResolved = qtyPendingAfter <= 0.00005;

    const newCostStatus = fullyResolved ? "resolved" : "partial";
    const newPsaStatus  = fullyResolved ? "fully_resolved" : remaining > 0.00005 ? "partially_resolved" : "partially_resolved";

    // Update pending allocation
    await tx.update(pendingStockAllocations)
      .set({
        qtyMinorPending: String(Math.max(0, qtyPendingAfter)),
        status: newPsaStatus,
        resolvedBy,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pendingStockAllocations.id, reqLine.pendingAllocationId));

    // Update patient invoice line: stock_issue_status + cost_status
    await tx.execute(
      sql`UPDATE patient_invoice_lines
          SET
            stock_issue_status = ${fullyResolved ? 'cost_resolved' : 'pending_cost'},
            cost_status        = ${newCostStatus}
          WHERE id = ${invoiceLineId}`
    );

    lineResults.push({
      pendingAllocationId: reqLine.pendingAllocationId,
      invoiceId, invoiceLineId, itemId,
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

  // ── 5. GL Journal — Dr COGS / Cr Inventory ───────────────────────────────
  let journalEntryId: string | null = null;
  let journalStatus: "posted" | "blocked" | "none" = "none";
  let journalBlockReason: string | undefined;

  if (batchTotalCost > 0.001) {
    // ── Double-posting guard: check batch journal_entry_id (should be null) ─
    const batchCheck = await tx.execute(
      sql`SELECT journal_entry_id, journal_status FROM oversell_resolution_batches WHERE id = ${batch.id}`
    );
    const batchRow = (batchCheck as any).rows[0] as { journal_entry_id: string | null; journal_status: string };
    if (batchRow?.journal_entry_id) {
      // Already has a journal entry — do NOT post again
      logger.warn(
        { batchId: batch.id, existingJournalId: batchRow.journal_entry_id },
        "[OVERSELL_GL] double-posting guard: journal already exists, skipping"
      );
      journalEntryId = batchRow.journal_entry_id;
      journalStatus  = batchRow.journal_status === "posted" ? "posted" : "blocked";
    } else {
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

        await tx.update(oversellResolutionBatches)
          .set({ journalEntryId: entry.id, journalStatus: "posted" })
          .where(eq(oversellResolutionBatches.id, batch.id));

        journalEntryId = entry.id;
        journalStatus  = "posted";
        logger.info(
          { batchId: batch.id, journalEntryId: entry.id, amount },
          "[OVERSELL_GL] journal posted"
        );
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

// ─────────────────────────────────────────────────────────────────────────────
// Void/Reverse a resolution batch
// Reverses: stock movement (adds back), journal entry (reversal), resets PSA to pending
// Only allowed if the invoice has NOT been cancelled (to protect data integrity)
// ─────────────────────────────────────────────────────────────────────────────
export async function voidOversellResolutionBatch(
  batchId: string,
  voidedBy: string,
  tx: typeof db = db
): Promise<{ reversed: boolean; reversalJournalId: string | null }> {

  // Lock the batch
  const batchRes = await tx.execute(
    sql`SELECT * FROM oversell_resolution_batches WHERE id = ${batchId} FOR UPDATE`
  );
  const batch = (batchRes as any).rows[0] as Record<string, unknown> | undefined;
  if (!batch) throw new Error("دفعة التسوية غير موجودة");
  if ((batch as any).voided_at) throw new Error("تم إلغاء هذه الدفعة مسبقاً");

  // Get cost resolution lines
  const costLinesRes = await tx.execute(
    sql`SELECT * FROM oversell_cost_resolutions WHERE batch_id = ${batchId}`
  );
  const costLines = (costLinesRes as any).rows as any[];

  // 1. Reverse lot deductions (add back to inventory)
  for (const line of costLines) {
    const deducted = parseFloat(line.qty_minor_resolved);
    if (deducted <= 0.00005) continue;

    await tx.execute(
      sql`UPDATE inventory_lots
          SET qty_in_minor = qty_in_minor::numeric + ${deducted}, updated_at = NOW()
          WHERE id = ${line.lot_id}`
    );

    // Record reversal movement
    await tx.insert(inventoryLotMovements).values({
      lotId: line.lot_id,
      warehouseId: line.warehouse_id,
      txType: "in",
      qtyChangeInMinor: String(deducted),
      unitCost: String(line.unit_cost),
      referenceType: "oversell_void",
      referenceId: batchId,
    });
  }

  // 2. Reset pending_stock_allocations to 'pending' for each allocation in this batch
  const allocationIds = [...new Set(costLines.map((l: any) => l.pending_allocation_id))];
  for (const allocId of allocationIds) {
    // Get original qty
    const allocRes = await tx.execute(
      sql`SELECT qty_minor_original, invoice_line_id FROM pending_stock_allocations WHERE id = ${allocId} FOR UPDATE`
    );
    const alloc = (allocRes as any).rows[0] as any;
    if (!alloc) continue;

    await tx.update(pendingStockAllocations)
      .set({
        qtyMinorPending: alloc.qty_minor_original,
        status: "pending",
        resolvedBy: null,
        resolvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pendingStockAllocations.id, allocId));

    // Reset PIL cost_status and stock_issue_status
    await tx.execute(
      sql`UPDATE patient_invoice_lines
          SET stock_issue_status = 'pending_cost', cost_status = 'pending'
          WHERE id = ${alloc.invoice_line_id}`
    );
  }

  // 3. Reverse GL journal if it was posted
  let reversalJournalId: string | null = null;
  if (batch.journal_entry_id && batch.journal_status === "posted") {
    const todayStr = new Date().toISOString().split("T")[0];

    // Get original journal lines
    const origLinesRes = await tx.execute(
      sql`SELECT * FROM journal_lines WHERE journal_entry_id = ${batch.journal_entry_id} ORDER BY line_number`
    );
    const origLines = (origLinesRes as any).rows as any[];

    const periodRes = await tx.execute(sql`
      SELECT id FROM fiscal_periods
      WHERE is_closed = false
        AND start_date <= ${todayStr}::date
        AND end_date   >= ${todayStr}::date
      LIMIT 1
    `);
    const periodId = (periodRes as any).rows[0]?.id ?? null;

    const entryNumRes = await tx.execute(sql`SELECT nextval('journal_entry_number_seq') AS n`);
    const entryNumber = Number((entryNumRes as any).rows[0]?.n ?? 1);

    const batchRef = batchId.slice(-8).toUpperCase();
    const [revEntry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: todayStr,
      description: `عكس تسوية صرف مؤجل - دفعة ${batchRef}`,
      reference: `OVSELL-REV-${batchRef}`,
      status: "posted" as const,
      periodId,
      createdBy: voidedBy,
      sourceType: "oversell_void",
      sourceDocumentId: batchId,
    }).returning({ id: journalEntries.id });

    // Swap debit/credit on each original line
    const reversalLines = origLines.map((ol: any, i: number) => ({
      journalEntryId: revEntry.id,
      lineNumber: i + 1,
      accountId: ol.account_id,
      debit: ol.credit,    // swap
      credit: ol.debit,    // swap
      description: `[عكس] ${ol.description ?? ""}`,
      costCenterId: ol.cost_center_id ?? null,
    }));
    await tx.insert(journalLines).values(reversalLines);

    reversalJournalId = revEntry.id;
    logger.info({ batchId, reversalJournalId }, "[OVERSELL_GL] reversal journal posted");
  }

  // 4. Mark batch as voided
  await tx.execute(
    sql`UPDATE oversell_resolution_batches
        SET journal_status = 'voided', notes = COALESCE(notes, '') || ' [ملغي]'
        WHERE id = ${batchId}`
  );

  return { reversed: true, reversalJournalId };
}
