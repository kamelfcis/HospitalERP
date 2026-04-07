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
import { resolveOversellBatch, checkOversellGlReadiness } from "../lib/oversell-resolution-engine";
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
