import { Express } from "express";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";

export function registerOversellStatusQueryRoutes(app: Express) {

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

  app.get("/api/oversell/gl-readiness", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
      const warehouseId = req.query.warehouseId as string | undefined;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const readiness = await (await import("../lib/oversell-resolution-engine")).checkOversellGlReadiness(warehouseId);
      res.json(readiness);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

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

  app.get("/api/oversell/integrity", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const orphansRes = await db.execute(sql`
        SELECT psa.id, psa.invoice_id, psa.status, pih.status AS invoice_status
        FROM pending_stock_allocations psa
        JOIN patient_invoice_headers pih ON pih.id = psa.invoice_id
        WHERE psa.status IN ('pending', 'partially_resolved')
          AND pih.status = 'cancelled'
      `);
      const orphans = orphansRes.rows;

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
}
