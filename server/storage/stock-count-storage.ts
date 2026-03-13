/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Stock Count Storage — تخزين بيانات جرد الأصناف
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  الطبقة المسؤولة عن جميع عمليات CRUD لجرد الأصناف:
 *  ─────────────────────────────────────────────────
 *  createStockCountSession      — إنشاء جلسة جرد جديدة
 *  getStockCountSessions        — قائمة الجلسات (مع pagination)
 *  getStockCountSessionWithLines — جلسة مع سطورها الكاملة
 *  updateStockCountHeader       — تعديل رأس الجلسة (draft فقط)
 *  cancelStockCountSession      — إلغاء جلسة draft
 *  upsertStockCountLines        — bulk upsert للسطور
 *  deleteStockCountLine         — حذف سطر واحد
 *  deleteZeroLines              — حذف السطور ذات الرصيد صفر
 *  loadItemsForSession          — تحميل أصناف المستودع من inventory_lots
 *  postStockCountSession        — ترحيل الجرد (ذري: lots + movements + journal + audit)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { sql, and, eq, lte, gte, isNull, isNotNull, or, not, inArray, asc, desc } from "drizzle-orm";
import {
  stockCountSessions,
  stockCountLines,
  inventoryLots,
  inventoryLotMovements,
  items,
  warehouses,
  type StockCountSession,
  type StockCountLine,
} from "@shared/schema";
import {
  journalEntries,
  journalLines,
  accountMappings,
  fiscalPeriods,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { auditLog } from "../route-helpers";

// ── رقم تسلسلي لجلسات الجرد ─────────────────────────────────────────────────
async function getNextSessionNumber(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(MAX(session_number), 0) + 1 AS next FROM stock_count_sessions
  `);
  return Number((result as any).rows[0].next);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StockCountLineRow extends StockCountLine {
  itemCode:   string;
  itemNameAr: string;
  itemCategory: string;
}

export interface StockCountSessionWithLines extends StockCountSession {
  lines:         StockCountLineRow[];
  warehouseName: string;
}

export interface LoadedItem {
  itemId:         string;
  itemCode:       string;
  itemNameAr:     string;
  itemCategory:   string;
  lotId:          string | null;
  expiryDate:     string | null;
  systemQtyMinor: string;
  unitCost:       string;
  alreadyCounted: boolean;
}

export interface LoadItemsOpts {
  includeAll?:             boolean;
  itemNameQ?:              string;
  itemCategory?:           string;
  itemCode?:               string;
  barcode?:                string;
  acrossSessionsOnDate?:   boolean;  // check all sessions in same warehouse/date scope
  limit?:                  number;   // default 200
}

export interface UpsertCountLine {
  itemId:          string;
  lotId:           string | null;
  expiryDate:      string | null;
  systemQtyMinor:  string;
  countedQtyMinor: string;
  unitCost:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Storage methods object (merged onto DatabaseStorage.prototype)
// ─────────────────────────────────────────────────────────────────────────────

const stockCountStorage = {

  // ── createStockCountSession ────────────────────────────────────────────────
  async createStockCountSession(
    this: DatabaseStorage,
    data: { warehouseId: string; countDate: string; notes?: string; createdBy: string }
  ): Promise<StockCountSession> {
    const sessionNumber = await getNextSessionNumber();
    const [session] = await db.insert(stockCountSessions).values({
      sessionNumber,
      warehouseId: data.warehouseId,
      countDate:   data.countDate,
      notes:       data.notes ?? null,
      createdBy:   data.createdBy,
      status:      "draft",
    }).returning();
    return session;
  },

  // ── getStockCountSessions ──────────────────────────────────────────────────
  async getStockCountSessions(
    this: DatabaseStorage,
    opts: { warehouseId?: string; status?: string; page?: number; pageSize?: number }
  ): Promise<{ sessions: (StockCountSession & { warehouseName: string })[]; total: number }> {
    const page     = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, opts.pageSize ?? 20);
    const offset   = (page - 1) * pageSize;

    const rows = await db.execute(sql`
      SELECT
        s.*,
        w.name_ar AS warehouse_name,
        COUNT(cl.id)::int                              AS line_count,
        COALESCE(SUM(cl.difference_value::numeric), 0) AS total_difference_value
      FROM stock_count_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      LEFT JOIN stock_count_lines cl ON cl.session_id = s.id
      WHERE 1=1
        ${opts.warehouseId ? sql`AND s.warehouse_id = ${opts.warehouseId}` : sql``}
        ${opts.status      ? sql`AND s.status = ${opts.status}`           : sql``}
      GROUP BY s.id, w.name_ar
      ORDER BY s.session_number DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const countRows = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM stock_count_sessions s
      WHERE 1=1
        ${opts.warehouseId ? sql`AND s.warehouse_id = ${opts.warehouseId}` : sql``}
        ${opts.status      ? sql`AND s.status = ${opts.status}`           : sql``}
    `);

    const raws    = (rows as any).rows as any[];
    const sessions = raws.map((r: any) => ({
      id:                   r.id,
      sessionNumber:        r.session_number,
      warehouseId:          r.warehouse_id,
      countDate:            r.count_date,
      status:               r.status,
      notes:                r.notes,
      createdBy:            r.created_by,
      createdAt:            r.created_at,
      postedBy:             r.posted_by,
      postedAt:             r.posted_at,
      journalEntryId:       r.journal_entry_id,
      warehouseName:        r.warehouse_name,
      lineCount:            Number(r.line_count ?? 0),
      totalDifferenceValue: String(r.total_difference_value ?? "0"),
    }));

    const total = Number((countRows as any).rows[0]?.total ?? 0);
    return { sessions, total };
  },

  // ── getStockCountSessionWithLines ──────────────────────────────────────────
  async getStockCountSessionWithLines(
    this: DatabaseStorage,
    id: string
  ): Promise<StockCountSessionWithLines | null> {
    const sessionRows = await db.execute(sql`
      SELECT s.*, w.name_ar AS warehouse_name
      FROM stock_count_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.id = ${id}
    `);
    const sRaw = (sessionRows as any).rows[0];
    if (!sRaw) return null;

    const lineRows = await db.execute(sql`
      SELECT
        l.*,
        i.item_code,
        i.name_ar   AS item_name_ar,
        i.category  AS item_category
      FROM stock_count_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.session_id = ${id}
      ORDER BY i.name_ar, l.expiry_date ASC NULLS LAST
    `);

    const lines = ((lineRows as any).rows as any[]).map((r: any) => ({
      id:              r.id,
      sessionId:       r.session_id,
      itemId:          r.item_id,
      lotId:           r.lot_id,
      expiryDate:      r.expiry_date,
      systemQtyMinor:  r.system_qty_minor,
      countedQtyMinor: r.counted_qty_minor,
      differenceMinor: r.difference_minor,
      unitCost:        r.unit_cost,
      differenceValue: r.difference_value,
      createdAt:       r.created_at,
      updatedAt:       r.updated_at,
      itemCode:        r.item_code,
      itemNameAr:      r.item_name_ar,
      itemCategory:    r.item_category,
    }));

    return {
      id:             sRaw.id,
      sessionNumber:  sRaw.session_number,
      warehouseId:    sRaw.warehouse_id,
      countDate:      sRaw.count_date,
      status:         sRaw.status,
      notes:          sRaw.notes,
      createdBy:      sRaw.created_by,
      createdAt:      sRaw.created_at,
      postedBy:       sRaw.posted_by,
      postedAt:       sRaw.posted_at,
      journalEntryId: sRaw.journal_entry_id,
      warehouseName:  sRaw.warehouse_name,
      lines,
    };
  },

  // ── updateStockCountHeader ─────────────────────────────────────────────────
  async updateStockCountHeader(
    this: DatabaseStorage,
    id: string,
    data: { countDate?: string; notes?: string }
  ): Promise<StockCountSession> {
    const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, id));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن تعديل جلسة مُرحَّلة أو مُلغاة");

    const updates: Record<string, any> = {};
    if (data.countDate !== undefined) updates.countDate = data.countDate;
    if (data.notes     !== undefined) updates.notes     = data.notes;

    const [updated] = await db.update(stockCountSessions)
      .set(updates)
      .where(eq(stockCountSessions.id, id))
      .returning();
    return updated;
  },

  // ── cancelStockCountSession ────────────────────────────────────────────────
  async cancelStockCountSession(this: DatabaseStorage, id: string): Promise<void> {
    const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, id));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن إلغاء جلسة مُرحَّلة");
    await db.update(stockCountSessions)
      .set({ status: "cancelled" })
      .where(eq(stockCountSessions.id, id));
  },

  // ── upsertStockCountLines ──────────────────────────────────────────────────
  async upsertStockCountLines(
    this: DatabaseStorage,
    sessionId: string,
    lines: UpsertCountLine[]
  ): Promise<StockCountLine[]> {
    const [session] = await db.select().from(stockCountSessions).where(eq(stockCountSessions.id, sessionId));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن تعديل جلسة مُرحَّلة أو مُلغاة");
    if (lines.length === 0) return [];

    const results: StockCountLine[] = [];

    for (const line of lines) {
      const diff  = parseFloat(line.countedQtyMinor) - parseFloat(line.systemQtyMinor);
      const value = diff * parseFloat(line.unitCost);

      const existing = await db.select({ id: stockCountLines.id })
        .from(stockCountLines)
        .where(and(
          eq(stockCountLines.sessionId, sessionId),
          eq(stockCountLines.itemId,    line.itemId),
          line.lotId ? eq(stockCountLines.lotId, line.lotId) : isNull(stockCountLines.lotId)
        ))
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db.update(stockCountLines).set({
          expiryDate:      line.expiryDate ?? null,
          systemQtyMinor:  line.systemQtyMinor,
          countedQtyMinor: line.countedQtyMinor,
          differenceMinor: diff.toFixed(4),
          unitCost:        line.unitCost,
          differenceValue: value.toFixed(2),
          updatedAt:       new Date(),
        })
        .where(eq(stockCountLines.id, existing[0].id))
        .returning();
        results.push(updated);
      } else {
        const [inserted] = await db.insert(stockCountLines).values({
          sessionId,
          itemId:          line.itemId,
          lotId:           line.lotId ?? null,
          expiryDate:      line.expiryDate ?? null,
          systemQtyMinor:  line.systemQtyMinor,
          countedQtyMinor: line.countedQtyMinor,
          differenceMinor: diff.toFixed(4),
          unitCost:        line.unitCost,
          differenceValue: value.toFixed(2),
        }).returning();
        results.push(inserted);
      }
    }

    return results;
  },

  // ── deleteStockCountLine ───────────────────────────────────────────────────
  async deleteStockCountLine(this: DatabaseStorage, lineId: string): Promise<void> {
    await db.delete(stockCountLines).where(eq(stockCountLines.id, lineId));
  },

  // ── deleteZeroLines ────────────────────────────────────────────────────────
  async deleteZeroLines(this: DatabaseStorage, sessionId: string): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM stock_count_lines
      WHERE session_id = ${sessionId}
        AND ABS(system_qty_minor::numeric)  = 0
        AND ABS(counted_qty_minor::numeric) = 0
    `);
    return Number((result as any).rowCount ?? 0);
  },

  // ── loadItemsForSession ────────────────────────────────────────────────────
  async loadItemsForSession(
    this: DatabaseStorage,
    warehouseId: string,
    sessionId: string,
    opts: LoadItemsOpts
  ): Promise<LoadedItem[]> {
    const lim = Math.min(opts.limit ?? 200, 500);

    // For cross-session uncounted check, look at all sessions for same warehouse+date
    const sessionRaw = opts.acrossSessionsOnDate
      ? await db.execute(sql`SELECT count_date FROM stock_count_sessions WHERE id = ${sessionId}`)
      : null;
    const countDate = sessionRaw ? (sessionRaw as any).rows[0]?.count_date : null;

    const rows = await db.execute(sql`
      SELECT
        i.id             AS item_id,
        i.item_code,
        i.name_ar        AS item_name_ar,
        i.category       AS item_category,
        l.id             AS lot_id,
        l.expiry_date,
        l.qty_in_minor   AS system_qty_minor,
        l.purchase_price AS unit_cost,
        CASE WHEN cl.id IS NOT NULL THEN TRUE ELSE FALSE END AS already_counted
      FROM inventory_lots l
      JOIN items i ON i.id = l.item_id
      ${opts.barcode ? sql`
        JOIN item_barcodes ib ON ib.item_id = i.id AND ib.barcode_value = ${opts.barcode}
      ` : sql``}
      LEFT JOIN stock_count_lines cl
        ON cl.item_id = l.item_id
        AND cl.lot_id = l.id
        AND ${opts.acrossSessionsOnDate && countDate ? sql`cl.session_id IN (
              SELECT id FROM stock_count_sessions
              WHERE warehouse_id = ${warehouseId}
                AND count_date   = ${countDate}::date
              )` : sql`cl.session_id = ${sessionId}`}
      WHERE l.warehouse_id = ${warehouseId}
        AND l.is_active    = TRUE
        ${!opts.includeAll ? sql`AND l.qty_in_minor > 0` : sql``}
        ${opts.itemNameQ  ? sql`AND (i.name_ar ILIKE ${'%' + opts.itemNameQ + '%'} OR i.item_code ILIKE ${'%' + opts.itemNameQ + '%'})` : sql``}
        ${opts.itemCode   ? sql`AND i.item_code ILIKE ${opts.itemCode + '%'}` : sql``}
        ${opts.itemCategory ? sql`AND i.category::text = ${opts.itemCategory}` : sql``}
      ORDER BY i.name_ar, l.expiry_year ASC NULLS LAST, l.expiry_month ASC NULLS LAST
      LIMIT ${lim}
    `);

    return ((rows as any).rows as any[]).map((r: any) => ({
      itemId:         r.item_id,
      itemCode:       r.item_code,
      itemNameAr:     r.item_name_ar,
      itemCategory:   r.item_category,
      lotId:          r.lot_id,
      expiryDate:     r.expiry_date,
      systemQtyMinor: String(r.system_qty_minor ?? "0"),
      unitCost:       String(r.unit_cost ?? "0"),
      alreadyCounted: Boolean(r.already_counted),
    }));
  },

  // ── lookupBarcodeForSession ────────────────────────────────────────────────
  // بحث بالباركود داخل مستودع الجلسة — يُعيد الـ lots مع علامة "في الجلسة"
  async lookupBarcodeForSession(
    this: DatabaseStorage,
    barcode: string,
    warehouseId: string,
    sessionId: string
  ): Promise<LoadedItem[]> {
    const rows = await db.execute(sql`
      SELECT
        i.id             AS item_id,
        i.item_code,
        i.name_ar        AS item_name_ar,
        i.category       AS item_category,
        l.id             AS lot_id,
        l.expiry_date,
        l.qty_in_minor   AS system_qty_minor,
        l.purchase_price AS unit_cost,
        CASE WHEN cl.id IS NOT NULL THEN TRUE ELSE FALSE END AS already_counted
      FROM item_barcodes ib
      JOIN items i ON i.id = ib.item_id
      LEFT JOIN inventory_lots l
        ON l.item_id     = i.id
        AND l.warehouse_id = ${warehouseId}
        AND l.is_active  = TRUE
        AND l.qty_in_minor > 0
      LEFT JOIN stock_count_lines cl
        ON cl.session_id = ${sessionId}
        AND cl.item_id   = i.id
        AND cl.lot_id    = l.id
      WHERE ib.barcode_value = ${barcode}
      ORDER BY l.expiry_year ASC NULLS LAST, l.expiry_month ASC NULLS LAST
    `);

    return ((rows as any).rows as any[]).map((r: any) => ({
      itemId:         r.item_id,
      itemCode:       r.item_code,
      itemNameAr:     r.item_name_ar,
      itemCategory:   r.item_category,
      lotId:          r.lot_id,
      expiryDate:     r.expiry_date,
      systemQtyMinor: String(r.system_qty_minor ?? "0"),
      unitCost:       String(r.unit_cost ?? "0"),
      alreadyCounted: Boolean(r.already_counted),
    }));
  },

  // ── postStockCountSession ──────────────────────────────────────────────────
  // الترحيل الذري الكامل:
  //  1. التحقق من حالة الجلسة
  //  2. التحقق من الفترة المحاسبية
  //  3. منع التكرار (جرد مُرحَّل آخر لنفس المستودع + اليوم)
  //  4. تسوية lots
  //  5. توليد inventory_lot_movements
  //  6. توليد journal_entry واحد
  //  7. تحديث الجلسة → posted
  //  8. scheduleInventorySnapshotRefresh()
  async postStockCountSession(
    this: DatabaseStorage,
    sessionId: string,
    userId: string
  ): Promise<StockCountSession> {
    const result = await db.transaction(async (tx) => {

      // ── 1. قفل الجلسة وقراءة بياناتها ──────────────────────────────────
      const sessionRaw = await tx.execute(sql`
        SELECT s.*, w.gl_account_id AS wh_gl_account_id, w.name_ar AS wh_name
        FROM stock_count_sessions s
        JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.id = ${sessionId}
        FOR UPDATE
      `);
      const s = (sessionRaw as any).rows[0];
      if (!s) throw new Error("جلسة الجرد غير موجودة");
      if (s.status !== "draft") throw new Error(`لا يمكن ترحيل جلسة بحالة "${s.status}"`);

      // ── 2. التحقق من الفترة المحاسبية ───────────────────────────────────
      const whHasGL = !!s.wh_gl_account_id;
      const linesWithDiff = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM stock_count_lines
        WHERE session_id = ${sessionId} AND ABS(difference_minor::numeric) > 0.0001
      `);
      const hasDifferences = Number((linesWithDiff as any).rows[0]?.cnt ?? 0) > 0;

      let periodId: string | null = null;
      if (whHasGL && hasDifferences) {
        const periodRaw = await tx.execute(sql`
          SELECT id FROM fiscal_periods
          WHERE start_date <= ${s.count_date}::date
            AND end_date   >= ${s.count_date}::date
            AND is_closed = FALSE
          LIMIT 1
        `);
        const period = (periodRaw as any).rows[0];
        if (!period) {
          throw new Error(
            `لا توجد فترة محاسبية مفتوحة لتاريخ الجرد (${s.count_date}). ` +
            `افتح فترة محاسبية مناسبة أو غيّر تاريخ الجرد.`
          );
        }
        periodId = period.id;
      }

      // ── 3. منع التكرار ───────────────────────────────────────────────────
      const dupRaw = await tx.execute(sql`
        SELECT id FROM stock_count_sessions
        WHERE warehouse_id = ${s.warehouse_id}
          AND count_date   = ${s.count_date}::date
          AND status       = 'posted'
          AND id          <> ${sessionId}
        LIMIT 1
      `);
      if ((dupRaw as any).rows.length > 0) {
        throw new Error(
          `يوجد جرد مُرحَّل لنفس المستودع في تاريخ ${s.count_date}. ` +
          `لا يمكن ترحيل جردين لنفس المستودع في يوم واحد.`
        );
      }

      // ── 4+5. تسوية lots وتسجيل حركات ────────────────────────────────────
      const lineRaw = await tx.execute(sql`
        SELECT l.*, i.name_ar AS item_name
        FROM stock_count_lines l
        JOIN items i ON i.id = l.item_id
        WHERE l.session_id = ${sessionId}
          AND ABS(l.difference_minor::numeric) > 0.0001
      `);
      const diffLines = (lineRaw as any).rows as any[];

      for (const line of diffLines) {
        const diff     = parseFloat(line.difference_minor);
        const absDiff  = Math.abs(diff);
        const isSurplus  = diff > 0;

        if (line.lot_id) {
          // ── سطر له lot محدد → تسوية مباشرة ─────────────────────────────
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${diff.toFixed(4)}::numeric,
                updated_at   = NOW()
            WHERE id = ${line.lot_id}
          `);
          await tx.insert(inventoryLotMovements).values({
            lotId:             line.lot_id,
            warehouseId:       s.warehouse_id,
            txDate:            new Date(s.count_date),
            txType:            "adj" as const,
            qtyChangeInMinor:  line.difference_minor,
            unitCost:          line.unit_cost,
            referenceType:     "stock_count",
            referenceId:       sessionId,
          });
        } else {
          // ── سطر بدون lot → FEFO للنقص أو تسوية آخر lot للفائض ──────────
          if (isSurplus) {
            // أضف للـ lot الأحدث استلاماً في المستودع
            const latestLotRaw = await tx.execute(sql`
              SELECT id FROM inventory_lots
              WHERE item_id     = ${line.item_id}
                AND warehouse_id = ${s.warehouse_id}
                AND is_active   = TRUE
              ORDER BY received_date DESC, created_at DESC
              LIMIT 1
            `);
            const targetLotId = (latestLotRaw as any).rows[0]?.id;
            if (targetLotId) {
              await tx.execute(sql`
                UPDATE inventory_lots
                SET qty_in_minor = qty_in_minor + ${absDiff.toFixed(4)}::numeric,
                    updated_at   = NOW()
                WHERE id = ${targetLotId}
              `);
              await tx.insert(inventoryLotMovements).values({
                lotId:            targetLotId,
                warehouseId:      s.warehouse_id,
                txDate:           new Date(s.count_date),
                txType:           "adj" as const,
                qtyChangeInMinor: absDiff.toFixed(4),
                unitCost:         line.unit_cost,
                referenceType:    "stock_count",
                referenceId:      sessionId,
              });
            }
          } else {
            // FEFO: احذف من أقدم lot أولاً
            let remaining = absDiff;
            const fefoLotsRaw = await tx.execute(sql`
              SELECT id, qty_in_minor FROM inventory_lots
              WHERE item_id     = ${line.item_id}
                AND warehouse_id = ${s.warehouse_id}
                AND is_active   = TRUE
                AND qty_in_minor > 0
              ORDER BY expiry_year ASC NULLS FIRST,
                       expiry_month ASC NULLS FIRST,
                       received_date ASC
              FOR UPDATE
            `);
            for (const lot of (fefoLotsRaw as any).rows as any[]) {
              if (remaining <= 0) break;
              const available = parseFloat(lot.qty_in_minor);
              const deduct    = Math.min(remaining, available);
              await tx.execute(sql`
                UPDATE inventory_lots
                SET qty_in_minor = qty_in_minor - ${deduct.toFixed(4)}::numeric,
                    updated_at   = NOW()
                WHERE id = ${lot.id}
              `);
              await tx.insert(inventoryLotMovements).values({
                lotId:            lot.id,
                warehouseId:      s.warehouse_id,
                txDate:           new Date(s.count_date),
                txType:           "adj" as const,
                qtyChangeInMinor: (-deduct).toFixed(4),
                unitCost:         line.unit_cost,
                referenceType:    "stock_count",
                referenceId:      sessionId,
              });
              remaining -= deduct;
            }
          }
        }
      }

      // ── 6. القيد المحاسبي ─────────────────────────────────────────────────
      let journalEntryId: string | null = null;

      if (whHasGL && hasDifferences && periodId) {
        // حساب إجمالي الفوائض والعجز
        const totalsRaw = await tx.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN difference_minor::numeric > 0 THEN ABS(difference_value::numeric) ELSE 0 END), 0) AS surplus_value,
            COALESCE(SUM(CASE WHEN difference_minor::numeric < 0 THEN ABS(difference_value::numeric) ELSE 0 END), 0) AS shortage_value
          FROM stock_count_lines
          WHERE session_id = ${sessionId}
        `);
        const totals    = (totalsRaw as any).rows[0];
        const surplusVal = parseFloat(totals.surplus_value);
        const shortageVal = parseFloat(totals.shortage_value);

        if (surplusVal > 0 || shortageVal > 0) {
          // حسابات الفوائض والعجز من account_mappings
          const mappingsRaw = await tx.execute(sql`
            SELECT line_type, debit_account_id, credit_account_id
            FROM account_mappings
            WHERE transaction_type = 'stock_count_adjustment' AND is_active = TRUE
          `);
          const mappings: Record<string, { debitAccountId?: string; creditAccountId?: string }> = {};
          for (const m of (mappingsRaw as any).rows as any[]) {
            mappings[m.line_type] = {
              debitAccountId:  m.debit_account_id,
              creditAccountId: m.credit_account_id,
            };
          }

          const gainMapping  = mappings["stock_gain"];
          const lossMapping  = mappings["stock_loss"];

          if (!gainMapping?.creditAccountId && surplusVal > 0) {
            throw new Error(
              `لا يوجد حساب دائن (إيراد فوائض الجرد) مُعرَّف في ربط الحسابات ` +
              `(نوع: stock_count_adjustment | نوع السطر: stock_gain). ` +
              `يرجى إضافة الربط في صفحة "ربط الحسابات".`
            );
          }
          if (!lossMapping?.debitAccountId && shortageVal > 0) {
            throw new Error(
              `لا يوجد حساب مدين (خسائر عجز الجرد) مُعرَّف في ربط الحسابات ` +
              `(نوع: stock_count_adjustment | نوع السطر: stock_loss). ` +
              `يرجى إضافة الربط في صفحة "ربط الحسابات".`
            );
          }

          // بناء سطور القيد
          const jLines: any[] = [];
          let lineNum = 1;

          if (surplusVal > 0) {
            jLines.push({
              lineNumber:  lineNum++,
              accountId:   s.wh_gl_account_id,
              debit:       surplusVal.toFixed(2),
              credit:      "0.00",
              description: `فوائض جرد مخزن — جلسة #${s.session_number}`,
            });
            jLines.push({
              lineNumber:  lineNum++,
              accountId:   gainMapping!.creditAccountId,
              debit:       "0.00",
              credit:      surplusVal.toFixed(2),
              description: `إيراد فوائض جرد — جلسة #${s.session_number}`,
            });
          }

          if (shortageVal > 0) {
            jLines.push({
              lineNumber:  lineNum++,
              accountId:   lossMapping!.debitAccountId,
              debit:       shortageVal.toFixed(2),
              credit:      "0.00",
              description: `خسائر عجز جرد — جلسة #${s.session_number}`,
            });
            jLines.push({
              lineNumber:  lineNum++,
              accountId:   s.wh_gl_account_id,
              debit:       "0.00",
              credit:      shortageVal.toFixed(2),
              description: `عجز مخزن — جلسة #${s.session_number}`,
            });
          }

          const totalDebit  = (surplusVal + shortageVal).toFixed(2);
          const totalCredit = totalDebit;

          const entryNumber = await this.getNextEntryNumber();
          const [entry] = await tx.insert(journalEntries).values({
            entryNumber,
            entryDate:        s.count_date,
            periodId,
            description:      `قيد جرد مخزني — ${s.wh_name} — جلسة #${s.session_number}`,
            reference:        `SC-${s.session_number}`,
            sourceType:       "stock_count",
            sourceDocumentId: sessionId,
            status:           "posted" as const,
            totalDebit,
            totalCredit,
          }).returning();

          await tx.insert(journalLines).values(
            jLines.map((l) => ({
              journalEntryId: entry.id,
              lineNumber:     l.lineNumber,
              accountId:      l.accountId,
              costCenterId:   null,
              debit:          l.debit,
              credit:         l.credit,
              description:    l.description,
            }))
          );

          journalEntryId = entry.id;
          console.log(`[STOCK_COUNT] Journal posted: #${entryNumber}, surplus=${surplusVal}, shortage=${shortageVal}`);
        }
      }

      // ── 7. تحديث الجلسة → posted ─────────────────────────────────────────
      const [updated] = await tx.update(stockCountSessions)
        .set({
          status:         "posted",
          postedBy:       userId,
          postedAt:       new Date(),
          journalEntryId: journalEntryId ?? undefined,
        })
        .where(eq(stockCountSessions.id, sessionId))
        .returning();

      console.log(`[STOCK_COUNT] Session #${s.session_number} posted by ${userId}`);
      return updated;
    });

    // ── 8. Audit + Snapshot refresh ──────────────────────────────────────────
    auditLog({
      tableName: "stock_count_sessions",
      recordId:  result.id,
      action:    "post",
      userId,
      newValues: {
        sessionNumber:  result.sessionNumber,
        warehouseId:    result.warehouseId,
        countDate:      result.countDate,
        journalEntryId: result.journalEntryId,
        postedBy:       userId,
      },
    }).catch(() => {});

    scheduleInventorySnapshotRefresh("stock_count_post");

    return result;
  },

};

export default stockCountStorage;
