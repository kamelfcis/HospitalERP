import { sql } from "drizzle-orm";
import { inventoryLotMovements } from "@shared/schema";

export async function applyInventoryAdjustments(
  tx: any,
  session: any,
  diffLines: any[],
  sessionId: string
): Promise<void> {
  for (const line of diffLines) {
    const diff      = parseFloat(line.difference_minor);
    const absDiff   = Math.abs(diff);
    const isSurplus = diff > 0;

    if (line.lot_id) {
      await tx.execute(sql`
        UPDATE inventory_lots
        SET qty_in_minor = qty_in_minor + ${diff.toFixed(4)}::numeric,
            updated_at   = NOW()
        WHERE id = ${line.lot_id}
      `);
      await tx.insert(inventoryLotMovements).values({
        lotId:             line.lot_id,
        warehouseId:       session.warehouse_id,
        txDate:            new Date(session.count_date),
        txType:            "adj" as const,
        qtyChangeInMinor:  line.difference_minor,
        unitCost:          line.unit_cost,
        referenceType:     "stock_count",
        referenceId:       sessionId,
      });

    } else if (isSurplus) {
      const latestLotRaw = await tx.execute(sql`
        SELECT id FROM inventory_lots
        WHERE item_id      = ${line.item_id}
          AND warehouse_id = ${session.warehouse_id}
          AND is_active    = TRUE
        ORDER BY received_date DESC, created_at DESC
        LIMIT 1
        FOR UPDATE
      `);
      const targetLotId = (latestLotRaw as any).rows[0]?.id;
      if (!targetLotId) {
        throw new Error(
          `لا يوجد lot نشط للصنف "${line.item_name}" في المستودع لإضافة الفائض إليه. ` +
          `حدّد lot بشكل صريح عند إدخال سطر الجرد.`
        );
      }
      await tx.execute(sql`
        UPDATE inventory_lots
        SET qty_in_minor = qty_in_minor + ${absDiff.toFixed(4)}::numeric,
            updated_at   = NOW()
        WHERE id = ${targetLotId}
      `);
      await tx.insert(inventoryLotMovements).values({
        lotId:            targetLotId,
        warehouseId:      session.warehouse_id,
        txDate:           new Date(session.count_date),
        txType:           "adj" as const,
        qtyChangeInMinor: absDiff.toFixed(4),
        unitCost:         line.unit_cost,
        referenceType:    "stock_count",
        referenceId:      sessionId,
      });

    } else {
      let remaining = absDiff;
      const fefoLotsRaw = await tx.execute(sql`
        SELECT id, qty_in_minor FROM inventory_lots
        WHERE item_id      = ${line.item_id}
          AND warehouse_id = ${session.warehouse_id}
          AND is_active    = TRUE
          AND qty_in_minor > 0
        ORDER BY expiry_year  ASC NULLS FIRST,
                 expiry_month ASC NULLS FIRST,
                 received_date ASC
        FOR UPDATE
      `);
      for (const lot of (fefoLotsRaw as any).rows as any[]) {
        if (remaining <= 0.0001) break;
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
          warehouseId:      session.warehouse_id,
          txDate:           new Date(session.count_date),
          txType:           "adj" as const,
          qtyChangeInMinor: (-deduct).toFixed(4),
          unitCost:         line.unit_cost,
          referenceType:    "stock_count",
          referenceId:      sessionId,
        });
        remaining -= deduct;
      }
      if (remaining > 0.0001) {
        throw new Error(
          `الرصيد الفعلي للصنف "${line.item_name}" في المستودع أقل من العجز المُسجَّل ` +
          `(متبقٍّ بدون تسوية: ${remaining.toFixed(4)}). ` +
          `راجع سطور الجرد أو حدّد lot بشكل صريح.`
        );
      }
    }
  }
}
