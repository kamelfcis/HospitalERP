import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  stockMovementHeaders,
  stockMovementAllocations,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";


const methods = {
  async allocateStockInTx(
    this: DatabaseStorage,
    tx: DrizzleTransaction,
    params: {
      operationType: string;
      referenceType: string;
      referenceId: string;
      warehouseId: string;
      lines: Array<{
        lineIdx: number;
        itemId: string;
        qtyMinor: number;
        hasExpiry: boolean;
        expiryMonth?: number | null;
        expiryYear?: number | null;
      }>;
      createdBy?: string;
    }
  ): Promise<{ movementHeaderId: string; lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> }> {
    const { operationType, referenceType, referenceId, warehouseId, lines, createdBy } = params;

    const existingResult = await tx.execute(
      sql`SELECT id FROM stock_movement_headers WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} LIMIT 1`
    );
    if (existingResult.rows?.length > 0) {
      const movementHeaderId = (existingResult.rows[0] as Record<string, unknown>).id as string;
      const allocRows = await tx.execute(
        sql`SELECT alloc_key, cost_allocated FROM stock_movement_allocations WHERE movement_header_id = ${movementHeaderId}`
      );
      const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = lines.map(l => ({
        lineIdx: l.lineIdx,
        itemId: l.itemId,
        totalCost: (allocRows.rows as Array<Record<string, unknown>>)
          .filter((r) => (r.alloc_key as string).startsWith(`line:${l.lineIdx}:`))
          .reduce((s, r) => s + parseFloat(r.cost_allocated as string), 0),
      }));
      return { movementHeaderId, lineResults };
    }

    const [movHeader] = await tx.insert(stockMovementHeaders).values({
      operationType,
      referenceType,
      referenceId,
      warehouseId,
      totalCost: "0",
      status: "posted",
      createdBy: createdBy || null,
    }).returning();
    const movementHeaderId = movHeader.id;

    const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = [];
    let movementTotalCost = 0;

    for (const line of lines) {
      const { lineIdx, itemId, qtyMinor, hasExpiry, expiryMonth, expiryYear } = line;
      if (qtyMinor <= 0) {
        lineResults.push({ lineIdx, itemId, totalCost: 0 });
        continue;
      }

      const specificExpiry = hasExpiry && expiryMonth && expiryYear;
      const lotsResult = await tx.execute(
        specificExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                  AND expiry_month = ${expiryMonth}
                  AND expiry_year = ${expiryYear}
                ORDER BY expiry_year ASC, expiry_month ASC, received_date ASC
                FOR UPDATE`
          : hasExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
                FOR UPDATE`
          : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE`
      );
      const lots = lotsResult.rows as any[];

      let remaining = qtyMinor;
      let lotSeq = 0;
      const rawAllocs: Array<{ lotId: string; allocKey: string; qty: number; unitCost: number; rawCost: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0.00005) break;
        const available = parseFloat(lot.qty_in_minor);
        const deduct = Math.min(available, remaining);
        const unitCostNum = parseFloat(lot.purchase_price);

        rawAllocs.push({
          lotId: lot.id,
          allocKey: `line:${lineIdx}:lot:${lot.id}:seq:${lotSeq}`,
          qty: deduct,
          unitCost: unitCostNum,
          rawCost: deduct * unitCostNum,
        });

        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW() WHERE id = ${lot.id}`
        );

        await tx.insert(inventoryLotMovements).values({
          lotId: lot.id,
          warehouseId,
          txType: "out",
          qtyChangeInMinor: String(-deduct),
          unitCost: String(unitCostNum),
          referenceType,
          referenceId,
        });

        remaining -= deduct;
        lotSeq++;
      }

      if (remaining > 0.00005) {
        const itemRow = await tx.execute(sql`SELECT name_ar FROM items WHERE id = ${itemId} LIMIT 1`);
        const nameAr = (itemRow.rows[0] as any)?.name_ar || itemId;
        throw new Error(`رصيد غير كاف للصنف "${nameAr}" - النقص: ${remaining.toFixed(4)}`);
      }

      const totalRawCost = rawAllocs.reduce((s, a) => s + a.rawCost, 0);
      const totalCostRounded = parseFloat(roundMoney(totalRawCost));
      let allocatedSoFar = 0;

      for (let i = 0; i < rawAllocs.length; i++) {
        const a = rawAllocs[i];
        const isLast = i === rawAllocs.length - 1;
        const costAllocated = isLast
          ? parseFloat((totalCostRounded - allocatedSoFar).toFixed(2))
          : parseFloat(roundMoney(a.rawCost));

        const sourceId = `${movementHeaderId}:${referenceId}:${a.allocKey}`;

        await tx.insert(stockMovementAllocations).values({
          movementHeaderId,
          lotId: a.lotId,
          allocKey: a.allocKey,
          qtyAllocatedMinor: String(a.qty),
          unitCost: String(a.unitCost),
          costAllocated: String(costAllocated),
          sourceType: "STOCK_MOVEMENT_ALLOC",
          sourceId,
        });

        allocatedSoFar += costAllocated;
      }

      lineResults.push({ lineIdx, itemId, totalCost: totalCostRounded });
      movementTotalCost += totalCostRounded;
    }

    await tx.update(stockMovementHeaders).set({
      totalCost: roundMoney(movementTotalCost),
    }).where(eq(stockMovementHeaders.id, movementHeaderId));

    return { movementHeaderId, lineResults };
  },
};

export default methods;
