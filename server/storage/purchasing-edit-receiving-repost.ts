import { eq, sql } from "drizzle-orm";
import {
  convertPriceToMinor as convertPriceToMinorUnit,
  convertQtyToMinor,
  QTY_MINOR_TOLERANCE,
} from "../inventory-helpers";
import {
  items,
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  suppliers,
  purchaseTransactions,
} from "@shared/schema";

export async function repostActiveLines(
  tx: any,
  header: any,
  activeLines: {
    itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string;
    purchasePrice: string; lineTotal: string; batchNumber?: string;
    expiryDate?: string; expiryMonth?: number; expiryYear?: number;
    salePrice?: string; bonusQty?: string; bonusQtyInMinor?: string;
  }[],
  id: string,
): Promise<void> {
  const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplierId!));
  const supplierName = sup?.nameAr || sup?.nameEn || null;

  for (const line of activeLines) {
    const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
    if (!item) continue;

    const serverQty   = convertQtyToMinor(parseFloat(line.qtyEntered), line.unitLevel || 'minor', item);
    const storedQty   = parseFloat(line.qtyInMinor);
    if (Math.abs(serverQty - storedQty) > QTY_MINOR_TOLERANCE) {
      throw new Error(`الصنف "${item.nameAr}" — الكمية المحسوبة (${serverQty.toFixed(4)}) تختلف عن المخزّنة (${storedQty.toFixed(4)})`);
    }
    const serverBonus = convertQtyToMinor(parseFloat(line.bonusQty || "0"), line.unitLevel || 'minor', item);
    const storedBonus = parseFloat(line.bonusQtyInMinor || "0");
    if (Math.abs(serverBonus - storedBonus) > QTY_MINOR_TOLERANCE) {
      throw new Error(`الصنف "${item.nameAr}" — كمية المجانية (${serverBonus.toFixed(4)}) تختلف عن المخزّنة (${storedBonus.toFixed(4)})`);
    }
    const qtyMinor = serverQty + serverBonus;
    if (qtyMinor <= 0) continue;

    if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear))
      throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);

    const costPerMinor    = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
    const costPerMinorStr = costPerMinor.toFixed(4);
    const lotSalePrice    = line.salePrice || "0";

    let existingLots: any[] = [];
    if (line.expiryMonth && line.expiryYear) {
      const rawLots = await tx.execute(
        sql`SELECT * FROM inventory_lots
            WHERE item_id = ${line.itemId} AND warehouse_id = ${header.warehouseId}
              AND expiry_month = ${line.expiryMonth} AND expiry_year = ${line.expiryYear}
            FOR UPDATE`
      );
      existingLots = (rawLots as any).rows ?? [];
    } else {
      const rawLots = await tx.execute(
        sql`SELECT * FROM inventory_lots
            WHERE item_id = ${line.itemId} AND warehouse_id = ${header.warehouseId}
              AND expiry_month IS NULL
            FOR UPDATE`
      );
      existingLots = (rawLots as any).rows ?? [];
    }

    let lotId: string;
    if (existingLots.length > 0) {
      const lot    = existingLots[0] as any;
      const newQty = parseFloat(lot.qty_in_minor) + qtyMinor;
      await tx.update(inventoryLots).set({
        qtyInMinor: newQty.toFixed(4),
        purchasePrice: costPerMinorStr,
        salePrice: lotSalePrice,
        updatedAt: new Date(),
      }).where(eq(inventoryLots.id, lot.id));
      lotId = lot.id;
    } else {
      const [newLot] = await tx.insert(inventoryLots).values({
        itemId: line.itemId,
        warehouseId: header.warehouseId!,
        expiryDate: line.expiryDate || null,
        expiryMonth: line.expiryMonth || null,
        expiryYear: line.expiryYear || null,
        receivedDate: header.receiveDate,
        purchasePrice: costPerMinorStr,
        salePrice: lotSalePrice,
        qtyInMinor: qtyMinor.toFixed(4),
      }).returning();
      lotId = newLot.id;
    }

    await tx.insert(inventoryLotMovements).values({
      lotId,
      warehouseId: header.warehouseId!,
      txType: 'in',
      qtyChangeInMinor: qtyMinor.toFixed(4),
      unitCost: costPerMinorStr,
      referenceType: 'receiving',
      referenceId: id,
    });

    await tx.insert(purchaseTransactions).values({
      itemId: line.itemId,
      txDate: header.receiveDate,
      supplierName,
      qty: line.qtyEntered || line.qtyInMinor,
      unitLevel: (line.unitLevel || 'minor') as "major" | "medium" | "minor",
      purchasePrice: line.purchasePrice,
      salePriceSnapshot: line.salePrice || null,
      total: (parseFloat(line.qtyInMinor) * costPerMinor).toFixed(2),
      bonusQty: line.bonusQty || '0',
      supplierInvoiceNo: header.supplierInvoiceNo || null,
    });

    const updateFields: Partial<typeof items.$inferSelect> = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
    if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
    await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
  }
}

export async function resolveGlAccounts(
  tx: any,
  header: any,
): Promise<{ inventoryGlAccountId: string | null; apAccountId: string | null }> {
  const [wh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr })
    .from(warehouses).where(eq(warehouses.id, header.warehouseId!));
  const inventoryGlAccountId = wh?.glAccountId ?? null;

  const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplierId!));
  let apAccountId = (sup as any)?.glAccountId ?? null;
  if (!apAccountId && sup) {
    const supplierType = (sup as any)?.supplierType || "drugs";
    const payablesLT   = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";
    const apMappingRes = await tx.execute(sql`
      SELECT credit_account_id FROM account_mappings
      WHERE transaction_type = 'purchase_invoice'
        AND line_type = ${payablesLT}
        AND is_active = true
        AND warehouse_id IS NULL
      LIMIT 1
    `);
    apAccountId = (apMappingRes as any).rows[0]?.credit_account_id ?? null;
  }

  return { inventoryGlAccountId, apAccountId };
}
