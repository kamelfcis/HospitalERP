import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  transferLines,
  transferLineAllocations,
  journalEntries,
  journalLines,
  fiscalPeriods,
} from "@shared/schema";
import { logAcctEvent } from "../lib/accounting-event-logger";
import type { TransferAllocation } from "./transfers-post-allocate";
import type { DatabaseStorage } from "./index";

export async function recordLineMovements(
  tx: any,
  transfer: any,
  line: any,
  allocations: TransferAllocation[],
): Promise<void> {
  for (const alloc of allocations) {
    await tx.execute(sql`
      UPDATE inventory_lots 
      SET qty_in_minor = qty_in_minor::numeric - ${alloc.allocatedQty.toFixed(4)}::numeric,
          updated_at = NOW()
      WHERE id = ${alloc.lotId}
    `);

    await tx.insert(inventoryLotMovements).values({
      lotId: alloc.lotId,
      warehouseId: transfer.sourceWarehouseId,
      txType: "out" as const,
      txDate: new Date(),
      qtyChangeInMinor: (-alloc.allocatedQty).toFixed(4),
      unitCost: alloc.unitCost,
      referenceType: "transfer",
      referenceId: transfer.id,
    } as any);

    const rawDestLots = await tx.execute(sql`
      SELECT * FROM inventory_lots
      WHERE item_id = ${line.itemId}
        AND warehouse_id = ${transfer.destinationWarehouseId}
        AND is_active = true
        AND purchase_price::numeric = ${alloc.unitCost}::numeric
        AND ${alloc.expiryMonth != null ? sql`expiry_month = ${alloc.expiryMonth}` : sql`expiry_month IS NULL`}
        AND ${alloc.expiryYear != null ? sql`expiry_year = ${alloc.expiryYear}` : sql`expiry_year IS NULL`}
        AND ${alloc.expiryDate ? sql`expiry_date = ${alloc.expiryDate}` : sql`expiry_date IS NULL`}
      FOR UPDATE
    `);
    const existingDestLots = (rawDestLots as any).rows ?? [];

    let destLotId: string;

    if (existingDestLots.length > 0) {
      destLotId = existingDestLots[0].id;
      const allocSalePrice = parseFloat(alloc.lotSalePrice || "0");
      const existingSalePrice = parseFloat((existingDestLots[0] as any).sale_price || "0");
      const destSalePrice = allocSalePrice > 0 ? alloc.lotSalePrice : (existingSalePrice > 0 ? (existingDestLots[0] as any).sale_price : "0");
      await tx.execute(sql`
        UPDATE inventory_lots 
        SET qty_in_minor = qty_in_minor::numeric + ${alloc.allocatedQty.toFixed(4)}::numeric,
            sale_price = ${destSalePrice},
            updated_at = NOW()
        WHERE id = ${destLotId}
      `);
    } else {
      const item = { hasExpiry: alloc.expiryDate != null || alloc.expiryMonth != null };
      const [newLot] = await tx.insert(inventoryLots).values({
        itemId: line.itemId,
        warehouseId: transfer.destinationWarehouseId,
        expiryDate: item.hasExpiry ? (alloc.expiryDate || null) : null,
        expiryMonth: item.hasExpiry ? (alloc.expiryMonth || null) : null,
        expiryYear: item.hasExpiry ? (alloc.expiryYear || null) : null,
        receivedDate: transfer.transferDate,
        purchasePrice: alloc.unitCost,
        salePrice: alloc.lotSalePrice || "0",
        qtyInMinor: alloc.allocatedQty.toFixed(4),
        isActive: true,
      }).returning();
      destLotId = newLot.id;
    }

    await tx.insert(inventoryLotMovements).values({
      lotId: destLotId,
      warehouseId: transfer.destinationWarehouseId,
      txType: "in" as const,
      txDate: new Date(),
      qtyChangeInMinor: alloc.allocatedQty.toFixed(4),
      unitCost: alloc.unitCost,
      referenceType: "transfer",
      referenceId: transfer.id,
    } as any);

    await tx.insert(transferLineAllocations).values({
      lineId: line.id,
      sourceLotId: alloc.lotId,
      expiryDate: alloc.expiryDate || null,
      qtyOutInMinor: alloc.allocatedQty.toFixed(4),
      purchasePrice: alloc.unitCost,
      destinationLotId: destLotId,
    });
  }
}

export async function createTransferGlJournal(
  tx: any,
  storage: DatabaseStorage,
  transfer: any,
  transferId: string,
  totalCost: number,
): Promise<void> {
  if (totalCost <= 0) return;

  const [existingJournal] = await tx.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.sourceType, "warehouse_transfer"),
      eq(journalEntries.sourceDocumentId, transferId)
    ))
    .limit(1);

  if (existingJournal) {
    console.log(`[GL] Transfer journal already exists for transfer ${transferId}, skipping.`);
    return;
  }

  const [srcWh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr, costCenterId: warehouses.costCenterId })
    .from(warehouses).where(eq(warehouses.id, transfer.sourceWarehouseId));
  const [destWh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr, costCenterId: warehouses.costCenterId })
    .from(warehouses).where(eq(warehouses.id, transfer.destinationWarehouseId));

  const srcHasGL  = !!srcWh?.glAccountId;
  const destHasGL = !!destWh?.glAccountId;

  if (!srcHasGL && !destHasGL) {
    await logAcctEvent({
      sourceType:   "warehouse_transfer",
      sourceId:     transferId,
      eventType:    "warehouse_transfer_journal_skipped",
      status:       "needs_retry",
      errorMessage: `تخطي القيد المحاسبي: كلا المستودعين (${srcWh?.nameAr ?? transfer.sourceWarehouseId} ← ${destWh?.nameAr ?? transfer.destinationWarehouseId}) غير مرتبطَين بحساب GL. أضف حساب GL لكل مستودع من إعدادات المستودعات لتفعيل التتبع المالي.`,
    });
    return;
  }

  if (srcHasGL !== destHasGL) {
    const missingWh   = !srcHasGL ? srcWh?.nameAr  : destWh?.nameAr;
    const configuredWh= srcHasGL  ? srcWh?.nameAr  : destWh?.nameAr;
    throw new Error(
      `لا يمكن ترحيل التحويل: المستودع "${missingWh}" ليس له حساب مخزون GL، ` +
      `في حين أن "${configuredWh}" مُتابَع محاسبياً. ` +
      `هذا الإعداد ناقص ويسبب خللاً في ميزان المراجعة. ` +
      `الحل: أضف حساب GL للمستودع "${missingWh}" من إعدادات المستودعات، ` +
      `أو أزل حساب GL من "${configuredWh}" إذا لم يكن مطلوباً.`
    );
  }

  const [period] = await tx.select({ id: fiscalPeriods.id })
    .from(fiscalPeriods)
    .where(and(
      lte(fiscalPeriods.startDate, transfer.transferDate),
      gte(fiscalPeriods.endDate, transfer.transferDate),
      eq(fiscalPeriods.isClosed, false)
    ))
    .limit(1);

  if (!period) {
    throw new Error(
      `لا يمكن ترحيل التحويل: كلا المستودعين (${srcWh.nameAr} و${destWh.nameAr}) ` +
      `مُتابَعان محاسبياً، لكن لا توجد فترة محاسبية مفتوحة لتاريخ التحويل (${transfer.transferDate}). ` +
      `افتح فترة محاسبية لهذا التاريخ أو غيّر تاريخ التحويل إلى فترة مفتوحة.`
    );
  }

  const entryNumber = await storage.getNextEntryNumber();
  const amount = totalCost.toFixed(2);
  const desc   = `قيد تحويل مخزني ${transfer.transferNumber} — من ${srcWh.nameAr} إلى ${destWh.nameAr}`;

  const [entry] = await tx.insert(journalEntries).values({
    entryNumber,
    entryDate:        transfer.transferDate,
    periodId:         period.id,
    description:      desc,
    reference:        `TRF-${transfer.transferNumber}`,
    sourceType:       "warehouse_transfer",
    sourceDocumentId: transferId,
    status:           "posted" as const,
    totalDebit:       amount,
    totalCredit:      amount,
  }).returning();

  await tx.insert(journalLines).values([
    {
      journalEntryId: entry.id,
      lineNumber:     1,
      accountId:      destWh.glAccountId!,
      costCenterId:   destWh.costCenterId ?? null,
      debit:          amount,
      credit:         "0.00",
      description:    `تحويل وارد — ${destWh.nameAr}`,
    },
    {
      journalEntryId: entry.id,
      lineNumber:     2,
      accountId:      srcWh.glAccountId!,
      costCenterId:   srcWh.costCenterId ?? null,
      debit:          "0.00",
      credit:         amount,
      description:    `تحويل صادر — ${srcWh.nameAr}`,
    },
  ]);

  await logAcctEvent({
    sourceType:   "warehouse_transfer",
    sourceId:     transferId,
    eventType:    "warehouse_transfer_journal",
    status:       "completed",
    journalEntryId: entry.id,
  });
}
