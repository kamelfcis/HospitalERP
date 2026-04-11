import { db } from "../db";
import { sql, eq, isNull, and } from "drizzle-orm";
import {
  stockCountSessions,
  stockCountLines,
  type StockCountLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

export interface LoadedItem {
  itemId:         string;
  itemCode:       string;
  itemNameAr:     string;
  itemNameEn:     string | null;
  itemCategory:   string;
  lotId:          string | null;
  expiryDate:     string | null;
  systemQtyMinor: string;
  unitCost:       string;
  alreadyCounted: boolean;
  majorUnitName:  string | null;
  mediumUnitName: string | null;
  minorUnitName:  string | null;
  majorToMedium:  string | null;
  majorToMinor:   string | null;
  mediumToMinor:  string | null;
}

export interface LoadItemsOpts {
  includeAll?:              boolean;
  itemNameQ?:               string;
  itemCategory?:            string;
  itemCode?:                string;
  barcode?:                 string;
  excludeCountedSinceDate?: string;
  limit?:                   number;
}

export interface UpsertCountLine {
  itemId:          string;
  lotId:           string | null;
  expiryDate:      string | null;
  systemQtyMinor:  string;
  countedQtyMinor: string;
  unitCost:        string;
}

const stockCountLinesStorage = {

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
      let serverUnitCost = "0";
      if (line.lotId) {
        const lotRaw = await db.execute(sql`
          SELECT purchase_price, warehouse_id
          FROM inventory_lots
          WHERE id = ${line.lotId}
          LIMIT 1
        `);
        const lot = (lotRaw as any).rows[0];
        if (!lot) throw new Error(`الـ lot المحدد غير موجود (id: ${line.lotId})`);
        if (lot.warehouse_id !== session.warehouseId) {
          throw new Error(
            `الـ lot المحدد (${line.lotId}) لا ينتمي لمستودع الجلسة. ` +
            `لا يُسمح بإضافة أصناف من مستودع آخر.`
          );
        }
        serverUnitCost = String(lot.purchase_price ?? "0");
      } else {
        const priceRaw = await db.execute(sql`
          SELECT purchase_price FROM inventory_lots
          WHERE item_id     = ${line.itemId}
            AND warehouse_id = ${session.warehouseId}
            AND is_active   = TRUE
          ORDER BY received_date DESC, created_at DESC
          LIMIT 1
        `);
        const pr = (priceRaw as any).rows[0];
        serverUnitCost = pr ? String(pr.purchase_price ?? "0") : "0";
      }

      const diff  = parseFloat(line.countedQtyMinor) - parseFloat(line.systemQtyMinor);
      const value = diff * parseFloat(serverUnitCost);

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
          unitCost:        serverUnitCost,
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
          unitCost:        serverUnitCost,
          differenceValue: value.toFixed(2),
        }).returning();
        results.push(inserted);
      }
    }

    return results;
  },

  async deleteStockCountLine(this: DatabaseStorage, lineId: string): Promise<void> {
    const lineRaw = await db.execute(sql`
      SELECT s.status FROM stock_count_lines l
      JOIN stock_count_sessions s ON s.id = l.session_id
      WHERE l.id = ${lineId}
    `);
    const row = (lineRaw as any).rows[0];
    if (!row) throw new Error("السطر غير موجود");
    if (row.status !== "draft") throw new Error("لا يمكن حذف سطور من جلسة مُرحَّلة أو مُلغاة");
    await db.delete(stockCountLines).where(eq(stockCountLines.id, lineId));
  },

  async deleteZeroLines(this: DatabaseStorage, sessionId: string): Promise<number> {
    const [session] = await db.select({ status: stockCountSessions.status })
      .from(stockCountSessions).where(eq(stockCountSessions.id, sessionId));
    if (!session) throw new Error("جلسة الجرد غير موجودة");
    if (session.status !== "draft") throw new Error("لا يمكن حذف سطور من جلسة مُرحَّلة أو مُلغاة");

    const result = await db.execute(sql`
      DELETE FROM stock_count_lines
      WHERE session_id = ${sessionId}
        AND ABS(system_qty_minor::numeric)  = 0
        AND ABS(counted_qty_minor::numeric) = 0
    `);
    return Number((result as any).rowCount ?? 0);
  },

  async loadItemsForSession(
    this: DatabaseStorage,
    warehouseId: string,
    sessionId: string,
    opts: LoadItemsOpts
  ): Promise<LoadedItem[]> {
    const lim = Math.min(opts.limit ?? 200, 500);

    const rows = await db.execute(sql`
      SELECT
        i.id               AS item_id,
        i.item_code,
        i.name_ar          AS item_name_ar,
        i.name_en          AS item_name_en,
        i.category         AS item_category,
        i.major_unit_name,
        i.medium_unit_name,
        i.minor_unit_name,
        i.major_to_medium,
        i.major_to_minor,
        i.medium_to_minor,
        l.id               AS lot_id,
        l.expiry_date,
        l.qty_in_minor     AS system_qty_minor,
        l.purchase_price   AS unit_cost,
        CASE WHEN cl.id IS NOT NULL THEN TRUE ELSE FALSE END AS already_counted
      FROM inventory_lots l
      JOIN items i ON i.id = l.item_id
      ${opts.barcode ? sql`
        JOIN item_barcodes ib ON ib.item_id = i.id AND ib.barcode_value = ${opts.barcode}
      ` : sql``}
      LEFT JOIN stock_count_lines cl
        ON cl.item_id   = l.item_id
        AND cl.lot_id   = l.id
        AND cl.session_id IN (
          SELECT id FROM stock_count_sessions
          WHERE warehouse_id = ${warehouseId}
            AND status       = 'posted'
            ${opts.excludeCountedSinceDate
              ? sql`AND count_date >= ${opts.excludeCountedSinceDate}::date`
              : sql`AND id = ${sessionId}`}
        )
      WHERE l.warehouse_id = ${warehouseId}
        AND l.is_active    = TRUE
        ${!opts.includeAll ? sql`AND l.qty_in_minor > 0` : sql``}
        ${opts.itemNameQ  ? sql`AND (i.name_ar ILIKE ${'%' + opts.itemNameQ + '%'} OR i.name_en ILIKE ${'%' + opts.itemNameQ + '%'})` : sql``}
        ${opts.itemCode   ? sql`AND i.item_code ILIKE ${opts.itemCode + '%'}` : sql``}
        ${opts.itemCategory ? sql`AND i.category::text = ${opts.itemCategory}` : sql``}
      ORDER BY i.name_ar, l.expiry_year ASC NULLS LAST, l.expiry_month ASC NULLS LAST
      LIMIT ${lim}
    `);

    return ((rows as any).rows as any[]).map((r: any) => ({
      itemId:         r.item_id,
      itemCode:       r.item_code,
      itemNameAr:     r.item_name_ar,
      itemNameEn:     r.item_name_en ?? null,
      itemCategory:   r.item_category,
      lotId:          r.lot_id,
      expiryDate:     r.expiry_date,
      systemQtyMinor: String(r.system_qty_minor ?? "0"),
      unitCost:       String(r.unit_cost ?? "0"),
      alreadyCounted: Boolean(r.already_counted),
      majorUnitName:  r.major_unit_name  ?? null,
      mediumUnitName: r.medium_unit_name ?? null,
      minorUnitName:  r.minor_unit_name  ?? null,
      majorToMedium:  r.major_to_medium  != null ? String(r.major_to_medium)  : null,
      majorToMinor:   r.major_to_minor   != null ? String(r.major_to_minor)   : null,
      mediumToMinor:  r.medium_to_minor  != null ? String(r.medium_to_minor)  : null,
    }));
  },

  async lookupBarcodeForSession(
    this: DatabaseStorage,
    barcode: string,
    warehouseId: string,
    sessionId: string
  ): Promise<LoadedItem[]> {
    const rows = await db.execute(sql`
      SELECT
        i.id               AS item_id,
        i.item_code,
        i.name_ar          AS item_name_ar,
        i.name_en          AS item_name_en,
        i.category         AS item_category,
        i.major_unit_name,
        i.medium_unit_name,
        i.minor_unit_name,
        i.major_to_medium,
        i.major_to_minor,
        i.medium_to_minor,
        l.id               AS lot_id,
        l.expiry_date,
        l.qty_in_minor     AS system_qty_minor,
        l.purchase_price   AS unit_cost,
        CASE WHEN cl.id IS NOT NULL THEN TRUE ELSE FALSE END AS already_counted
      FROM item_barcodes ib
      JOIN items i ON i.id = ib.item_id
      LEFT JOIN inventory_lots l
        ON l.item_id       = i.id
        AND l.warehouse_id = ${warehouseId}
        AND l.is_active    = TRUE
        AND l.qty_in_minor > 0
      LEFT JOIN stock_count_lines cl
        ON cl.session_id   = ${sessionId}
        AND cl.item_id     = i.id
        AND cl.lot_id      = l.id
      WHERE ib.barcode_value = ${barcode}
      ORDER BY l.expiry_year ASC NULLS LAST, l.expiry_month ASC NULLS LAST
    `);

    return ((rows as any).rows as any[]).map((r: any) => ({
      itemId:         r.item_id,
      itemCode:       r.item_code,
      itemNameAr:     r.item_name_ar,
      itemNameEn:     r.item_name_en ?? null,
      itemCategory:   r.item_category,
      lotId:          r.lot_id,
      expiryDate:     r.expiry_date,
      systemQtyMinor: String(r.system_qty_minor ?? "0"),
      unitCost:       String(r.unit_cost ?? "0"),
      alreadyCounted: Boolean(r.already_counted),
      majorUnitName:  r.major_unit_name  ?? null,
      mediumUnitName: r.medium_unit_name ?? null,
      minorUnitName:  r.minor_unit_name  ?? null,
      majorToMedium:  r.major_to_medium  != null ? String(r.major_to_medium)  : null,
      majorToMinor:   r.major_to_minor   != null ? String(r.major_to_minor)   : null,
      mediumToMinor:  r.medium_to_minor  != null ? String(r.medium_to_minor)  : null,
    }));
  },

};

export default stockCountLinesStorage;
