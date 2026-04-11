import { Express } from "express";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";

export function registerOversellReportQueryRoutes(app: Express) {

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

  app.get("/api/oversell/daily-report", requireAuth, checkPermission(PERMISSIONS.OVERSELL_VIEW), async (req, res) => {
    try {
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

  app.get("/api/oversell/go-live-checklist", requireAuth, checkPermission(PERMISSIONS.OVERSELL_APPROVE), async (req, res) => {
    try {
      const checks: Array<{
        key: string; label: string; ok: boolean; detail?: string; action?: string;
      }> = [];

      const flagRes = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`);
      const flagEnabled = (flagRes.rows[0] as any)?.value === 'true';
      checks.push({
        key: "feature_flag",
        label: "تفعيل الخاصية (Feature Flag)",
        ok: flagEnabled,
        detail: flagEnabled ? "مفعّل" : "معطّل — يجب التفعيل قبل الاستخدام",
        action: flagEnabled ? undefined : "فعّل من الإعدادات",
      });

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
}
