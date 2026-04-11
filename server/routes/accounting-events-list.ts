import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerAccountingEventsListRoutes(app: Express) {
  app.get(
    "/api/accounting/events",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const { status, sourceType, eventType, limit = "50", offset = "0" } = req.query as Record<string, string>;

        const conditions: string[] = [];
        if (status)     conditions.push(`status = '${status.replace(/'/g, "''")}'`);
        if (sourceType) conditions.push(`source_type = '${sourceType.replace(/'/g, "''")}'`);
        if (eventType === "contract_warnings") {
          conditions.push(`event_type IN ('contract_ar_split_fallback','contract_ar_no_split')`);
        } else if (eventType && eventType !== "all") {
          conditions.push(`event_type = '${eventType.replace(/'/g, "''")}'`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim   = Math.min(parseInt(limit)  || 50, 200);
        const off   = parseInt(offset) || 0;

        const [rowsRaw, countRaw] = await Promise.all([
          db.execute(sql.raw(`
            SELECT id, event_type, source_type, source_id, status,
                   error_message, attempt_count, last_attempted_at, next_retry_at,
                   journal_entry_id, created_at, updated_at, posted_by_user
            FROM accounting_event_log
            ${where}
            ORDER BY created_at DESC
            LIMIT ${lim} OFFSET ${off}
          `)),
          db.execute(sql.raw(`SELECT COUNT(*) AS total FROM accounting_event_log ${where}`)),
        ]);

        const events = (rowsRaw as any).rows;
        const total  = parseInt((countRaw as any).rows[0]?.total || "0");

        return res.json({ events, total, limit: lim, offset: off });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ message: msg });
      }
    }
  );

  app.get(
    "/api/accounting/events/summary",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (_req, res) => {
      try {
        const raw = await db.execute(sql`
          SELECT
            status,
            source_type,
            COUNT(*)::int AS count
          FROM accounting_event_log
          GROUP BY status, source_type
          ORDER BY status, source_type
        `);
        return res.json({ rows: (raw as any).rows });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ message: msg });
      }
    }
  );
}
