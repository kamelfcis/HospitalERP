import { eq, sql } from "drizzle-orm";
import {
  convertPriceToMinor as convertPriceToMinorUnit,
  convertQtyToMinor,
  QTY_MINOR_TOLERANCE,
} from "../inventory-helpers";
import {
  items,
  inventoryLots,
  receivingHeaders,
  receivingLines,
} from "@shared/schema";

export async function reverseOldLotsAndDeleteLines(
  tx: any,
  id: string,
): Promise<void> {
  const oldMovementsRes = await tx.execute(
    sql`SELECT lot_id, qty_change_in_minor FROM inventory_lot_movements
        WHERE reference_type = 'receiving' AND reference_id = ${id}
        FOR UPDATE`
  );
  const oldMovements = (oldMovementsRes as any).rows as { lot_id: string; qty_change_in_minor: string }[];

  const lotReverseMap = new Map<string, number>();
  for (const mv of oldMovements) {
    const prev = lotReverseMap.get(mv.lot_id) || 0;
    lotReverseMap.set(mv.lot_id, prev + parseFloat(mv.qty_change_in_minor));
  }

  for (const [lotId, qtyToReverse] of Array.from(lotReverseMap.entries())) {
    const lotRows = await tx.execute(
      sql`SELECT id, qty_in_minor, item_id FROM inventory_lots WHERE id = ${lotId} FOR UPDATE`
    );
    const lot = (lotRows as any).rows[0] as { id: string; qty_in_minor: string; item_id: string } | undefined;
    if (!lot) continue;
    const currentQty = parseFloat(lot.qty_in_minor);
    if (currentQty - qtyToReverse < -QTY_MINOR_TOLERANCE) {
      const [item] = await tx.select({ nameAr: items.nameAr }).from(items).where(eq(items.id, lot.item_id));
      throw new Error(
        `لا يمكن التعديل: الصنف "${item?.nameAr || lot.item_id}" تم بيع أو صرف جزء من كميته.\n` +
        `الرصيد الحالي: ${currentQty.toFixed(2)} | الكمية المستلمة أصلاً: ${qtyToReverse.toFixed(2)}`
      );
    }
    const newQty = Math.max(0, currentQty - qtyToReverse);
    await tx.execute(
      sql`UPDATE inventory_lots SET qty_in_minor = ${newQty.toFixed(4)}, updated_at = NOW() WHERE id = ${lotId}`
    );
  }

  await tx.execute(
    sql`DELETE FROM inventory_lot_movements WHERE reference_type = 'receiving' AND reference_id = ${id}`
  );

  await tx.delete(receivingLines).where(eq(receivingLines.receivingId, id));
}

export async function insertNewReceivingLines(
  tx: any,
  id: string,
  newLines: {
    itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string;
    purchasePrice: string; lineTotal: string; batchNumber?: string;
    expiryDate?: string; expiryMonth?: number; expiryYear?: number;
    salePrice?: string; salePriceHint?: string; notes?: string;
    isRejected?: boolean; rejectionReason?: string;
    bonusQty?: string; bonusQtyInMinor?: string;
  }[],
): Promise<{ totalQty: number; totalCost: number }> {
  let totalQty = 0;
  let totalCost = 0;
  for (const line of newLines) {
    const lt  = parseFloat(line.lineTotal) || 0;
    const qty = parseFloat(line.qtyInMinor) || 0;
    totalQty += qty;
    totalCost += lt;
    let resolvedUnitLevel = line.unitLevel;
    if (!resolvedUnitLevel || resolvedUnitLevel.trim() === '') {
      const [li] = await tx.select().from(items).where(eq(items.id, line.itemId));
      resolvedUnitLevel = li?.majorUnitName ? 'major' : 'minor';
    }
    await tx.insert(receivingLines).values({
      receivingId: id,
      itemId: line.itemId,
      unitLevel: resolvedUnitLevel as "major" | "medium" | "minor",
      qtyEntered: line.qtyEntered,
      qtyInMinor: line.qtyInMinor,
      purchasePrice: line.purchasePrice,
      lineTotal: line.lineTotal,
      batchNumber: line.batchNumber || null,
      expiryDate: line.expiryDate || null,
      expiryMonth: line.expiryMonth || null,
      expiryYear: line.expiryYear || null,
      salePrice: line.salePrice || null,
      salePriceHint: line.salePriceHint || null,
      notes: line.notes || null,
      isRejected: line.isRejected || false,
      rejectionReason: line.rejectionReason || null,
      bonusQty: line.bonusQty || "0",
      bonusQtyInMinor: line.bonusQtyInMinor || "0",
    });
  }
  return { totalQty, totalCost };
}
