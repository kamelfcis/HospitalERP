import { and, eq, asc, sql } from "drizzle-orm";
import { inventoryLots } from "@shared/schema";

export interface TransferAllocation {
  lotId: string;
  expiryDate: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  allocatedQty: number;
  unitCost: string;
  lotSalePrice: string;
}

export async function computeLineAllocations(
  tx: any,
  transfer: any,
  line: any,
  item: any,
): Promise<TransferAllocation[]> {
  const requiredQty = parseFloat(line.qtyInMinor);
  if (requiredQty <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر: ${item.nameAr}`);

  let remaining = requiredQty;
  const allocations: TransferAllocation[] = [];

  if (item.hasExpiry && line.selectedExpiryMonth && line.selectedExpiryYear) {
    const selMonth = line.selectedExpiryMonth;
    const selYear = line.selectedExpiryYear;
    const selectedLots = await tx.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, line.itemId),
        eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        eq(inventoryLots.expiryMonth, selMonth),
        eq(inventoryLots.expiryYear, selYear)
      ))
      .orderBy(asc(inventoryLots.receivedDate))
      .for("update");

    for (const lot of selectedLots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        expiryMonth: lot.expiryMonth,
        expiryYear: lot.expiryYear,
        allocatedQty: allocated,
        unitCost: lot.purchasePrice,
        lotSalePrice: lot.salePrice || "0",
      });
      remaining -= allocated;
    }
  } else if (item.hasExpiry && line.selectedExpiryDate) {
    const selectedLots = await tx.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, line.itemId),
        eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        sql`${inventoryLots.expiryDate} = ${line.selectedExpiryDate}`
      ))
      .orderBy(asc(inventoryLots.receivedDate))
      .for("update");

    for (const lot of selectedLots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        expiryMonth: lot.expiryMonth,
        expiryYear: lot.expiryYear,
        allocatedQty: allocated,
        unitCost: lot.purchasePrice,
        lotSalePrice: lot.salePrice || "0",
      });
      remaining -= allocated;
    }
  }

  if (remaining > 0) {
    const transferDateParsed = new Date(transfer.transferDate);
    const tMonth = transferDateParsed.getMonth() + 1;
    const tYear = transferDateParsed.getFullYear();

    const expiryCondition = item.hasExpiry
      ? sql`(
          ${inventoryLots.expiryMonth} IS NULL
          OR ${inventoryLots.expiryYear} IS NULL
          OR (${inventoryLots.expiryYear} > ${tYear}
              OR (${inventoryLots.expiryYear} = ${tYear}
                  AND ${inventoryLots.expiryMonth} >= ${tMonth}))
        )`
      : and(
          sql`${inventoryLots.expiryMonth} IS NULL`,
          sql`${inventoryLots.expiryYear} IS NULL`
        );

    const alreadyUsedLotIds = allocations.map(a => a.lotId);

    const fefoLots = await tx.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, line.itemId),
        eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        expiryCondition,
        ...(alreadyUsedLotIds.length > 0
          ? [sql`${inventoryLots.id} NOT IN (${sql.join(alreadyUsedLotIds.map(id => sql`${id}`), sql`, `)})`]
          : [])
      ))
      .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth), asc(inventoryLots.receivedDate))
      .for("update");

    for (const lot of fefoLots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        expiryMonth: lot.expiryMonth,
        expiryYear: lot.expiryYear,
        allocatedQty: allocated,
        unitCost: lot.purchasePrice,
        lotSalePrice: lot.salePrice || "0",
      });
      remaining -= allocated;
    }
  }

  if (remaining > 0) {
    throw new Error(`الكمية غير متاحة للصنف: ${item.nameAr} - المطلوب: ${requiredQty} - المتاح: ${(requiredQty - remaining).toFixed(0)} (بالوحدة الصغرى)`);
  }

  return allocations;
}
