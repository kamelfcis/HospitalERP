// ACCOUNTING_PENDING: Oversell resolution → resolves deferred cost allocations by
//   crediting stock accounts. GL impact handled via patient invoice journal on finalization.
//   Resolution batches track cost but do NOT generate standalone GL entries.

/**
 * oversell.ts — API routes for Deferred Cost Issue (الصرف بدون رصيد)
 *
 * GET  /api/oversell/pending         — list pending_stock_allocations (paginated, filterable)
 * GET  /api/oversell/pending/:id     — single allocation details
 * POST /api/oversell/preview         — dry-run: shows which lots would be used + cost estimate
 * POST /api/oversell/resolve         — execute resolution (real lot deductions)
 * GET  /api/oversell/history         — resolved batches (recent N)
 * GET  /api/oversell/stats           — dashboard counters
 */

import { Express } from "express";
import { sql } from "drizzle-orm";
import { eq, and, inArray } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { pendingStockAllocations, oversellResolutionBatches, oversellCostResolutions } from "@shared/schema";
import { resolveOversellBatch, checkOversellGlReadiness, voidOversellResolutionBatch } from "../lib/oversell-resolution-engine";
import { clearOversellFlagCache } from "../lib/oversell-guard";

export function registerOversellRoutes(app: Express) {

  // ── GET /api/oversell/stats ────────────────────────────────────────────────
  app.get("/api/oversell/stats", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const statsRes = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')            AS pending_count,
          COUNT(*) FILTER (WHERE status = 'partially_resolved') AS partial_count,
          COUNT(*) FILTER (WHERE status = 'fully_resolved')     AS resolved_count,
          COUNT(*) FILTER (WHERE status = 'pending' OR status = 'partially_resolved') AS active_count,
          COALESCE(SUM(qty_minor_pending::numeric) FILTER (WHERE status IN ('pending','partially_resolved')), 0) AS total_qty_minor_pending
        FROM pending_stock_allocations
      `);
      const row = statsRes.rows[0] as Record<string, unknown>;
      res.json({
        pendingCount:  parseInt(String(row.pending_count ?? 0)),
        partialCount:  parseInt(String(row.partial_count ?? 0)),
        resolvedCount: parseInt(String(row.resolved_count ?? 0)),
        activeCount:   parseInt(String(row.active_count ?? 0)),
        totalQtyMinorPending: parseFloat(String(row.total_qty_minor_pending ?? 0)),
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/gl-readiness ────────────────────────────────────────
  // Returns readiness for GL journal generation: COGS account mapped? Warehouse GL set?
  app.get("/api/oversell/gl-readiness", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const warehouseId = req.query.warehouseId as string | undefined;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const readiness = await checkOversellGlReadiness(warehouseId);
      res.json(readiness);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/pending ──────────────────────────────────────────────
  app.get("/api/oversell/pending", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const status   = (req.query.status as string)    || "pending,partially_resolved";
      const itemId   = req.query.itemId   as string | undefined;
      const warehouseId = req.query.warehouseId as string | undefined;
      const page     = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit    = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset   = (page - 1) * limit;

      const statusList = status.split(",").map(s => s.trim()).filter(Boolean);

      let whereClause = sql`psa.status IN (${sql.join(statusList.map(s => sql`${s}`), sql`, `)})`;
      if (itemId) whereClause = sql`${whereClause} AND psa.item_id = ${itemId}`;
      if (warehouseId) whereClause = sql`${whereClause} AND psa.warehouse_id = ${warehouseId}`;

      const rows = await db.execute(sql`
        SELECT
          psa.*,
          i.name_ar    AS item_name,
          i.barcode    AS item_barcode,
          i.unit_name  AS item_unit,
          i.minor_unit_name AS item_minor_unit,
          w.name       AS warehouse_name,
          pih.invoice_number,
          pih.patient_name,
          COALESCE((
            SELECT SUM(il.qty_in_minor::numeric)
            FROM inventory_lots il
            WHERE il.item_id = psa.item_id
              AND il.warehouse_id = psa.warehouse_id
              AND il.is_active = true
              AND il.qty_in_minor::numeric > 0
          ), 0) AS current_stock_minor
        FROM pending_stock_allocations psa
        JOIN items          i   ON i.id = psa.item_id
        JOIN warehouses     w   ON w.id = psa.warehouse_id
        LEFT JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        WHERE ${whereClause}
        ORDER BY psa.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      const countRes = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM pending_stock_allocations psa
        WHERE ${whereClause}
      `);
      const total = parseInt(String((countRes.rows[0] as any)?.total ?? 0));

      res.json({
        data: rows.rows,
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/pending/:id ──────────────────────────────────────────
  app.get("/api/oversell/pending/:id", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await db.execute(sql`
        SELECT psa.*,
               i.name_ar  AS item_name,
               i.barcode  AS item_barcode,
               w.name     AS warehouse_name,
               pih.invoice_number,
               pih.patient_name
        FROM pending_stock_allocations psa
        JOIN items     i   ON i.id = psa.item_id
        JOIN warehouses w  ON w.id = psa.warehouse_id
        LEFT JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        WHERE psa.id = ${id}
      `);
      if (!rows.rows.length) return res.status(404).json({ message: "لم يتم العثور على السجل" });
      res.json(rows.rows[0]);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── POST /api/oversell/preview ─────────────────────────────────────────────
  // Dry-run — returns available lots and estimated cost without making changes
  app.post("/api/oversell/preview", requireAuth, checkPermission(PERMISSIONS.OVERSELL_MANAGE), async (req, res) => {
    try {
      const { allocationId } = req.body as { allocationId: string };
      if (!allocationId) return res.status(400).json({ message: "allocationId مطلوب" });

      const allocRes = await db.execute(sql`
        SELECT * FROM pending_stock_allocations WHERE id = ${allocationId} LIMIT 1
      `);
      const alloc = allocRes.rows[0] as Record<string, unknown> | undefined;
      if (!alloc) return res.status(404).json({ message: "السجل غير موجود" });

      const itemId     = alloc.item_id as string;
      const warehouseId = alloc.warehouse_id as string;
      const qtyPending = parseFloat(String(alloc.qty_minor_pending ?? 0));

      const itemRes = await db.execute(sql`SELECT has_expiry FROM items WHERE id = ${itemId} LIMIT 1`);
      const hasExpiry = (itemRes.rows[0] as any)?.has_expiry ?? false;

      const lotsRes = await db.execute(
        hasExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
                FROM inventory_lots
                WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId}
                  AND is_active = true AND qty_in_minor::numeric > 0
                ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC`
          : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year
                FROM inventory_lots
                WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId}
                  AND is_active = true AND qty_in_minor::numeric > 0
                ORDER BY received_date ASC, created_at ASC`
      );

      const lots = lotsRes.rows as any[];
      let remaining = qtyPending;
      let totalCost = 0;
      const preview: Array<{ lotId: string; qtyToDeduct: number; unitCost: number; lineCost: number; expiryMonth?: number; expiryYear?: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0.00005) break;
        const avail = parseFloat(lot.qty_in_minor);
        const deduct = Math.min(avail, remaining);
        const unitCost = parseFloat(lot.purchase_price);
        const lineCost = deduct * unitCost;
        preview.push({ lotId: lot.id, qtyToDeduct: deduct, unitCost, lineCost, expiryMonth: lot.expiry_month, expiryYear: lot.expiry_year });
        totalCost += lineCost;
        remaining -= deduct;
      }

      res.json({
        allocationId,
        qtyPending,
        qtyCanResolve: qtyPending - Math.max(0, remaining),
        qtyShortfall: Math.max(0, remaining),
        estimatedCost: totalCost,
        fullyResolvable: remaining <= 0.00005,
        lots: preview,
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── POST /api/oversell/resolve ─────────────────────────────────────────────
  app.post("/api/oversell/resolve", requireAuth, checkPermission(PERMISSIONS.OVERSELL_MANAGE), async (req, res) => {
    try {
      const userId = (req.session as any).userId as string;
      const { warehouseId, notes, lines } = req.body as {
        warehouseId: string;
        notes?: string;
        lines: Array<{ pendingAllocationId: string; qtyMinorToResolve: number }>;
      };

      if (!warehouseId || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "warehouseId و lines مطلوبان" });
      }

      const result = await db.transaction(async (tx) => {
        return resolveOversellBatch(
          { warehouseId, resolvedBy: userId, notes, lines },
          tx as any
        );
      });

      res.json({ success: true, ...result });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/history ──────────────────────────────────────────────
  app.get("/api/oversell/history", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
      const rows = await db.execute(sql`
        SELECT orb.*, u.username AS resolved_by_name
        FROM oversell_resolution_batches orb
        LEFT JOIN users u ON u.id = orb.resolved_by
        ORDER BY orb.resolved_at DESC
        LIMIT ${limit}
      `);
      res.json(rows.rows);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── POST /api/oversell/cancel-allocation/:id ──────────────────────────────
  // Cancel a pending (unresolved) allocation.
  // Resets the PIL stock_issue_status back to 'normal' and cost_status to NULL.
  // Use for: invoice return before resolution, data correction.
  app.post("/api/oversell/cancel-allocation/:id", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };
      const userId = (req.session as any).userId as string;

      await db.transaction(async (tx) => {
        // Lock the allocation
        const allocRes = await tx.execute(
          sql`SELECT * FROM pending_stock_allocations WHERE id = ${id} FOR UPDATE`
        );
        const alloc = allocRes.rows?.[0] as Record<string, unknown> | undefined;
        if (!alloc) throw new Error("السجل غير موجود");
        if (alloc.status === "fully_resolved") {
          throw new Error("لا يمكن إلغاء بند مسوّى بالكامل — استخدم إلغاء الدفعة");
        }
        if (alloc.status === "cancelled") {
          throw new Error("تم إلغاء هذا البند مسبقاً");
        }

        // Mark allocation as cancelled
        await tx.execute(
          sql`UPDATE pending_stock_allocations
              SET status = 'cancelled',
                  resolved_by = ${userId},
                  resolved_at = NOW(),
                  updated_at  = NOW()
              WHERE id = ${id}`
        );

        // Reset PIL to normal state
        await tx.execute(
          sql`UPDATE patient_invoice_lines
              SET stock_issue_status = 'normal',
                  cost_status        = NULL,
                  oversell_reason    = COALESCE(oversell_reason, '') || ${reason ? ` [ملغي: ${reason}]` : ' [ملغي]'}
              WHERE id = ${alloc.invoice_line_id}`
        );
      });

      res.json({ success: true, id, status: "cancelled" });
    } catch (err: unknown) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── POST /api/oversell/void-batch/:id ─────────────────────────────────────
  // Void a fully resolved batch: reverses stock + GL journal, resets PSA to pending.
  // Use for: returns after resolution, accounting correction.
  app.post("/api/oversell/void-batch/:id", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId as string;

      const result = await db.transaction(async (tx) => {
        return voidOversellResolutionBatch(id, userId, tx as any);
      });

      res.json({ success: true, batchId: id, ...result });
    } catch (err: unknown) {
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/integrity ────────────────────────────────────────────
  // Returns integrity report: orphan allocations, mismatched statuses, etc.
  app.get("/api/oversell/integrity", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      // Orphan PSAs: allocation exists but invoice is cancelled
      const orphansRes = await db.execute(sql`
        SELECT psa.id, psa.invoice_id, psa.status, pih.status AS invoice_status
        FROM pending_stock_allocations psa
        JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        WHERE psa.status IN ('pending', 'partially_resolved')
          AND pih.status = 'cancelled'
      `);
      const orphans = orphansRes.rows;

      // Mismatch: PIL says cost_resolved but PSA still pending
      const mismatchRes = await db.execute(sql`
        SELECT psa.id AS psa_id, psa.status AS psa_status,
               pil.id AS pil_id, pil.stock_issue_status, pil.cost_status
        FROM pending_stock_allocations psa
        JOIN patient_invoice_lines pil ON pil.id = psa.invoice_line_id
        WHERE (
          (psa.status IN ('pending','partially_resolved') AND pil.stock_issue_status = 'cost_resolved')
          OR
          (psa.status = 'fully_resolved' AND pil.stock_issue_status = 'pending_cost')
        )
        LIMIT 50
      `);
      const mismatches = mismatchRes.rows;

      // Resolution batches with posted journal but missing journal_entry in journal_entries
      const orphanJournalsRes = await db.execute(sql`
        SELECT orb.id AS batch_id, orb.journal_entry_id, orb.journal_status
        FROM oversell_resolution_batches orb
        LEFT JOIN journal_entries je ON je.id = orb.journal_entry_id
        WHERE orb.journal_status = 'posted'
          AND je.id IS NULL
      `);
      const orphanJournals = orphanJournalsRes.rows;

      res.json({
        orphanAllocations: orphans,
        statusMismatches: mismatches,
        orphanJournalLinks: orphanJournals,
        clean: orphans.length === 0 && mismatches.length === 0 && orphanJournals.length === 0,
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── PATCH /api/oversell/toggle-item ────────────────────────────────────────
  // Quick toggle for allow_oversell on an item (requires OVERSELL_APPROVE)
  app.patch("/api/oversell/toggle-item/:itemId", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { itemId } = req.params;
      const { allowOversell } = req.body as { allowOversell: boolean };
      if (typeof allowOversell !== "boolean") return res.status(400).json({ message: "allowOversell (boolean) مطلوب" });

      await db.execute(sql`UPDATE items SET allow_oversell = ${allowOversell}, updated_at = NOW() WHERE id = ${itemId}`);
      clearOversellFlagCache();
      res.json({ success: true, itemId, allowOversell });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/daily-report ────────────────────────────────────────
  // Operational control report: pending oversell grouped by user / department / item.
  // Also returns KPI (oversell ratio) and age-distribution alert.
  app.get("/api/oversell/daily-report", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      // ── Summary + ratio ───────────────────────────────────────────────────
      const summaryRes = await db.execute(sql`
        SELECT
          COUNT(*)           FILTER (WHERE status IN ('pending','partially_resolved')) AS active_count,
          COUNT(*)           FILTER (WHERE status = 'pending')                        AS pending_count,
          COUNT(*)           FILTER (WHERE status = 'partially_resolved')             AS partial_count,
          COUNT(*)           FILTER (WHERE status = 'fully_resolved')                 AS resolved_count,
          COALESCE(SUM(qty_minor_pending::numeric)  FILTER (WHERE status IN ('pending','partially_resolved')), 0) AS pending_qty,
          COALESCE(SUM(qty_minor_original::numeric) FILTER (WHERE status = 'fully_resolved'), 0)                  AS resolved_qty,
          COALESCE(SUM(qty_minor_original::numeric), 0) AS total_original_qty
        FROM pending_stock_allocations
      `);
      const s = summaryRes.rows[0] as any;
      const pendingQty    = parseFloat(s.pending_qty   || "0");
      const resolvedQty   = parseFloat(s.resolved_qty  || "0");
      const totalOriginal = parseFloat(s.total_original_qty || "0");
      const oversellRatio = totalOriginal > 0
        ? parseFloat(((pendingQty / totalOriginal) * 100).toFixed(1))
        : 0;

      // ── Age distribution ──────────────────────────────────────────────────
      const ageRes = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS within_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '48 hours'
                              AND created_at <  NOW() - INTERVAL '24 hours') AS within_48h,
          COUNT(*) FILTER (WHERE created_at <  NOW() - INTERVAL '48 hours') AS over_48h
        FROM pending_stock_allocations
        WHERE status IN ('pending', 'partially_resolved')
      `);
      const age = ageRes.rows[0] as any;

      // ── By item ───────────────────────────────────────────────────────────
      const byItemRes = await db.execute(sql`
        SELECT
          psa.item_id,
          i.name_ar        AS item_name,
          i.barcode        AS item_barcode,
          COUNT(*)         AS pending_count,
          SUM(psa.qty_minor_pending::numeric) AS pending_qty,
          SUM(psa.qty_minor_original::numeric) AS original_qty
        FROM pending_stock_allocations psa
        JOIN items i ON i.id = psa.item_id
        WHERE psa.status IN ('pending', 'partially_resolved')
        GROUP BY psa.item_id, i.name_ar, i.barcode
        ORDER BY pending_qty DESC
        LIMIT 20
      `);

      // ── By user (created_by) ──────────────────────────────────────────────
      const byUserRes = await db.execute(sql`
        SELECT
          psa.created_by,
          COALESCE(u.username, psa.created_by, 'غير محدد') AS username,
          COUNT(*)         AS pending_count,
          SUM(psa.qty_minor_pending::numeric) AS pending_qty
        FROM pending_stock_allocations psa
        LEFT JOIN users u ON u.id = psa.created_by
        WHERE psa.status IN ('pending', 'partially_resolved')
        GROUP BY psa.created_by, u.username
        ORDER BY pending_count DESC
        LIMIT 20
      `);

      // ── By department ──────────────────────────────────────────────────────
      const byDeptRes = await db.execute(sql`
        SELECT
          pih.department_id,
          COALESCE(d.name, 'غير محدد') AS department_name,
          COUNT(psa.id)   AS pending_count,
          SUM(psa.qty_minor_pending::numeric) AS pending_qty
        FROM pending_stock_allocations psa
        JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        LEFT JOIN departments d ON d.id = pih.department_id
        WHERE psa.status IN ('pending', 'partially_resolved')
        GROUP BY pih.department_id, d.name
        ORDER BY pending_count DESC
        LIMIT 20
      `);

      // ── Alert threshold check ─────────────────────────────────────────────
      const thresholdRes = await db.execute(sql`
        SELECT value FROM system_settings WHERE key = 'oversell_alert_threshold' LIMIT 1
      `);
      const threshold = parseInt((thresholdRes.rows[0] as any)?.value ?? "5");
      const over48hCount = parseInt(age.over_48h || "0");
      const activeCount  = parseInt(s.active_count || "0");
      const alertTriggered = activeCount > threshold || over48hCount > 0;

      res.json({
        reportDate: new Date().toISOString(),
        summary: {
          activeCount,
          pendingCount:  parseInt(s.pending_count  || "0"),
          partialCount:  parseInt(s.partial_count  || "0"),
          resolvedCount: parseInt(s.resolved_count || "0"),
          pendingQty,
          resolvedQty,
          totalOriginal,
          oversellRatio,
        },
        alertThreshold: threshold,
        alertTriggered,
        ageDistribution: {
          within24h: parseInt(age.within_24h || "0"),
          within48h: parseInt(age.within_48h || "0"),
          over48h: over48hCount,
        },
        byItem:       byItemRes.rows,
        byUser:       byUserRes.rows,
        byDepartment: byDeptRes.rows,
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── PATCH /api/oversell/alert-threshold ───────────────────────────────────
  app.patch("/api/oversell/alert-threshold", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { threshold } = req.body as { threshold: number };
      if (typeof threshold !== "number" || threshold < 1) {
        return res.status(400).json({ message: "threshold يجب أن يكون رقماً موجباً" });
      }
      await db.execute(sql`
        INSERT INTO system_settings (key, value) VALUES ('oversell_alert_threshold', ${String(threshold)})
        ON CONFLICT (key) DO UPDATE SET value = ${String(threshold)}
      `);
      res.json({ success: true, threshold });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/oversell/go-live-checklist ───────────────────────────────────
  // Live checks for production readiness: account mappings, feature flag, permissions, etc.
  app.get("/api/oversell/go-live-checklist", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const checks: Array<{
        key: string; label: string; ok: boolean; detail?: string; action?: string;
      }> = [];

      // 1. Feature flag status
      const flagRes = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`);
      const flagEnabled = (flagRes.rows[0] as any)?.value === 'true';
      checks.push({
        key: "feature_flag",
        label: "تفعيل الخاصية (Feature Flag)",
        ok: flagEnabled,
        detail: flagEnabled ? "مفعّل" : "معطّل — يجب التفعيل قبل الاستخدام",
        action: flagEnabled ? undefined : "فعّل من الإعدادات",
      });

      // 2. COGS account mapping
      const cogsMappingRes = await db.execute(sql`
        SELECT am.debit_account_id, a.code, a.name
        FROM account_mappings am
        LEFT JOIN accounts a ON a.id = am.debit_account_id
        WHERE am.transaction_type = 'oversell_resolution' AND am.line_type = 'cogs'
          AND am.is_active = true AND am.warehouse_id IS NULL AND am.pharmacy_id IS NULL
        LIMIT 1
      `);
      const cogsRow = cogsMappingRes.rows[0] as any;
      checks.push({
        key: "cogs_mapping",
        label: "ربط حساب تكلفة البضاعة المباعة (COGS)",
        ok: !!cogsRow?.debit_account_id,
        detail: cogsRow?.debit_account_id ? `${cogsRow.code} - ${cogsRow.name}` : "غير مربوط",
        action: cogsRow?.debit_account_id ? undefined : "اذهب إلى إدارة الحسابات ← تسوية الصرف المؤجل",
      });

      // 3. At least one warehouse with GL account
      const glWarehouseRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM warehouses WHERE gl_account_id IS NOT NULL
      `);
      const glWarehouses = parseInt((glWarehouseRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "warehouse_gl",
        label: "حساب GL للمستودع (مستودع واحد على الأقل)",
        ok: glWarehouses > 0,
        detail: glWarehouses > 0 ? `${glWarehouses} مستودع(ات) بحساب GL` : "لا يوجد مستودع مربوط بحساب GL",
        action: glWarehouses > 0 ? undefined : "اذهب إلى إعدادات المستودعات وحدد حساب GL",
      });

      // 4. OVERSELL_MANAGE permission assigned to a group
      const permRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM permission_group_permissions
        WHERE permission_key = 'oversell.manage'
      `);
      const permCount = parseInt((permRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "permission_manage",
        label: "صلاحية إدارة التسوية (oversell.manage) مُعيَّنة",
        ok: permCount > 0,
        detail: permCount > 0 ? `معيّنة لـ ${permCount} مجموعة` : "غير معيّنة لأي مجموعة",
        action: permCount > 0 ? undefined : "اذهب إلى إدارة مجموعات الصلاحيات",
      });

      // 5. OVERSELL_APPROVE permission assigned
      const approvePermRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM permission_group_permissions
        WHERE permission_key = 'oversell.approve'
      `);
      const approvePermCount = parseInt((approvePermRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "permission_approve",
        label: "صلاحية الموافقة (oversell.approve) مُعيَّنة",
        ok: approvePermCount > 0,
        detail: approvePermCount > 0 ? `معيّنة لـ ${approvePermCount} مجموعة` : "غير معيّنة",
        action: approvePermCount > 0 ? undefined : "اذهب إلى إدارة مجموعات الصلاحيات",
      });

      // 6. No active pending allocations (clean start)
      const pendingRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM pending_stock_allocations WHERE status IN ('pending','partially_resolved')
      `);
      const pendingCount = parseInt((pendingRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "no_pending",
        label: "لا توجد بنود معلقة حالياً (نقطة انطلاق نظيفة)",
        ok: pendingCount === 0,
        detail: pendingCount === 0
          ? "نظيف — لا بنود معلقة"
          : `${pendingCount} بند معلق — يجب التسوية أو الإلغاء`,
        action: pendingCount > 0 ? "تسوية البنود المعلقة" : undefined,
      });

      // 7. Open fiscal period exists
      const periodRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM fiscal_periods
        WHERE is_closed = false AND start_date <= NOW()::date AND end_date >= NOW()::date
      `);
      const openPeriods = parseInt((periodRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "open_period",
        label: "فترة مالية مفتوحة وسارية",
        ok: openPeriods > 0,
        detail: openPeriods > 0 ? "يوجد فترة مالية مفتوحة" : "لا توجد فترة مالية مفتوحة — القيد لن يُنشأ",
        action: openPeriods > 0 ? undefined : "أنشئ أو افتح فترة مالية",
      });

      // 8. At least one item with allow_oversell = true
      const itemsRes = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM items WHERE allow_oversell = true
      `);
      const oversellItems = parseInt((itemsRes.rows[0] as any)?.cnt ?? "0");
      checks.push({
        key: "items_configured",
        label: "أصناف مُفعَّل عليها الصرف بدون رصيد",
        ok: oversellItems > 0,
        detail: oversellItems > 0
          ? `${oversellItems} صنف مُفعَّل`
          : "لا يوجد صنف مُفعَّل — فعّل الخاصية على الأصناف من كارت الصنف",
        action: oversellItems > 0 ? undefined : "اذهب إلى كارت الصنف وفعّل خاصية الصرف بدون رصيد",
      });

      const allGreen = checks.every(c => c.ok);
      res.json({ checks, allGreen, checkedAt: new Date().toISOString() });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── GET /api/settings/deferred-cost-issue ─────────────────────────────────
  app.get("/api/settings/deferred-cost-issue", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const r = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`);
      res.json({ enabled: (r.rows[0] as any)?.value === 'true' });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── PATCH /api/settings/deferred-cost-issue ────────────────────────────────
  app.patch("/api/settings/deferred-cost-issue", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== "boolean") return res.status(400).json({ message: "enabled (boolean) مطلوب" });
      await db.execute(sql`
        INSERT INTO system_settings (key, value) VALUES ('enable_deferred_cost_issue', ${enabled ? 'true' : 'false'})
        ON CONFLICT (key) DO UPDATE SET value = ${enabled ? 'true' : 'false'}
      `);
      clearOversellFlagCache();
      res.json({ success: true, enabled });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
