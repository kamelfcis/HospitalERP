import { Express } from "express";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { resolveOversellBatch, voidOversellResolutionBatch } from "../lib/oversell-resolution-engine";
import { clearOversellFlagCache } from "../lib/oversell-guard";

export function registerOversellActionRoutes(app: Express) {

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

  app.post("/api/oversell/cancel-allocation/:id", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };
      const userId = (req.session as any).userId as string;

      await db.transaction(async (tx) => {
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

        await tx.execute(
          sql`UPDATE pending_stock_allocations
              SET status = 'cancelled',
                  resolved_by = ${userId},
                  resolved_at = NOW(),
                  updated_at  = NOW()
              WHERE id = ${id}`
        );

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

  app.get("/api/settings/deferred-cost-issue", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const r = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`);
      res.json({ enabled: (r.rows[0] as any)?.value === 'true' });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

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
