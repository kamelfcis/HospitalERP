/**
 * unit-integrity.ts — تقرير سلامة الوحدات
 *
 * يصنّف الأصناف إلى:
 *  - blocking (أحمر): الصنف لديه وحدة صغرى ولكن majorToMinor = null/0،
 *                     أو وحدة متوسطة ولكن majorToMedium = null/0.
 *                     هذه الحالة تمنع العمليات على هذا الصنف.
 *  - legacy   (أصفر): كبرى + متوسطة بدون صغرى — اتفاقية legacy صحيحة،
 *                     qty_in_minor يُخزَّن بالكبرى — لا حاجة لترحيل.
 *  - ok       (أخضر): الصنف سليم تماماً.
 *
 * ملاحظة: أصناف الخدمات مُستثناة (لا وحدات).
 */

import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
// ملاحظة: هذا التقرير حساس — يُستخدم فقط لتشخيص سلامة البيانات

export function registerUnitIntegrityRoutes(app: Express) {
  app.get(
    "/api/admin/unit-integrity-report",
    requireAuth,
    checkPermission(PERMISSIONS.ITEMS_EDIT),
    async (_req, res) => {
      try {
        const result = await db.execute(sql`
          SELECT
            i.id,
            i.item_code       AS "itemCode",
            i.name_ar         AS "nameAr",
            i.category,
            i.major_unit_name   AS "majorUnitName",
            i.medium_unit_name  AS "mediumUnitName",
            i.minor_unit_name   AS "minorUnitName",
            i.major_to_medium   AS "majorToMedium",
            i.major_to_minor    AS "majorToMinor",
            i.medium_to_minor   AS "mediumToMinor",
            CASE
              -- Blocking: minor with no majorToMinor
              WHEN i.minor_unit_name IS NOT NULL
                AND i.minor_unit_name <> ''
                AND (i.major_to_minor IS NULL OR i.major_to_minor::numeric <= 0)
              THEN 'blocking'
              -- Blocking: medium with no majorToMedium
              WHEN i.medium_unit_name IS NOT NULL
                AND i.medium_unit_name <> ''
                AND (i.major_to_medium IS NULL OR i.major_to_medium::numeric <= 0)
              THEN 'blocking'
              -- Legacy: major+medium without minor (correct, no migration needed)
              WHEN i.medium_unit_name IS NOT NULL
                AND i.medium_unit_name <> ''
                AND (i.minor_unit_name IS NULL OR i.minor_unit_name = '')
              THEN 'legacy'
              ELSE 'ok'
            END AS status
          FROM items i
          WHERE i.category <> 'service'
          ORDER BY
            CASE
              WHEN i.minor_unit_name IS NOT NULL AND i.minor_unit_name <> ''
                AND (i.major_to_minor IS NULL OR i.major_to_minor::numeric <= 0) THEN 1
              WHEN i.medium_unit_name IS NOT NULL AND i.medium_unit_name <> ''
                AND (i.major_to_medium IS NULL OR i.major_to_medium::numeric <= 0) THEN 1
              ELSE 2
            END,
            i.item_code
        `);

        const rows = (result as any).rows as Array<Record<string, unknown>>;

        const blocking = rows.filter(r => r.status === 'blocking');
        const legacy   = rows.filter(r => r.status === 'legacy');
        const ok       = rows.filter(r => r.status === 'ok');

        res.json({
          summary: {
            total:    rows.length,
            blocking: blocking.length,
            legacy:   legacy.length,
            ok:       ok.length,
          },
          blocking,
          legacy,
          ok,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg });
      }
    }
  );
}
