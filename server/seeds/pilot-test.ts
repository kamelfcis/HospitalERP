/**
 * Pilot-test seed data — بيانات تجريبية لاختبار تحويلات المخازن
 *
 * يُستدعى فقط من route بيئة التطوير: POST /api/seed/pilot-test
 * لا علاقة له بمنطق الإنتاج في transfers-storage.ts
 */
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  warehouses,
  items,
  inventoryLots,
  type Warehouse,
} from "@shared/schema";

export async function runPilotTestSeed(): Promise<{
  warehouses: { id: string; warehouseCode: string; nameAr: string }[];
  items: Record<string, unknown>[];
  lots: Record<string, unknown>[];
}> {
  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };

  return await db.transaction(async (tx) => {
    const warehouseDefs = [
      { warehouseCode: "WH-PH-IN", nameAr: "صيدلية داخلية" },
      { warehouseCode: "WH-OR", nameAr: "مخزن العمليات" },
    ];

    const createdWarehouses: Warehouse[] = [];
    for (const whDef of warehouseDefs) {
      const [existing] = await tx.select().from(warehouses).where(eq(warehouses.warehouseCode, whDef.warehouseCode));
      if (existing) {
        createdWarehouses.push(existing);
      } else {
        const [inserted] = await tx.insert(warehouses).values(whDef).returning();
        createdWarehouses.push(inserted);
      }
    }

    const whPhIn = createdWarehouses.find((w) => w.warehouseCode === "WH-PH-IN")!;

    const itemDefs = [
      {
        itemCode: "TEST-DRUG-1",
        category: "drug" as const,
        hasExpiry: true,
        nameAr: "باراسيتامول 500mg تجريبي",
        majorUnitName: "علبة",
        minorUnitName: "شريط",
        majorToMinor: "10",
        purchasePriceLast: "100",
        salePriceCurrent: "150",
      },
      {
        itemCode: "TEST-DRUG-2",
        category: "drug" as const,
        hasExpiry: true,
        nameAr: "أموكسيسيلين 250mg تجريبي",
        majorUnitName: "علبة",
        minorUnitName: "قرص",
        majorToMinor: "20",
        purchasePriceLast: "200",
        salePriceCurrent: "300",
      },
      {
        itemCode: "TEST-SUP-1",
        category: "supply" as const,
        hasExpiry: false,
        nameAr: "قفازات طبية تجريبي",
        majorUnitName: "علبة",
        minorUnitName: "قطعة",
        majorToMinor: "50",
        purchasePriceLast: "30",
        salePriceCurrent: "45",
      },
    ];

    const createdItems: Record<string, unknown>[] = [];
    for (const itemDef of itemDefs) {
      const [existing] = await tx.select().from(items).where(eq(items.itemCode, itemDef.itemCode));
      if (existing) {
        createdItems.push(existing as Record<string, unknown>);
      } else {
        const [inserted] = await tx.insert(items).values(itemDef).returning();
        createdItems.push(inserted as Record<string, unknown>);
      }
    }

    const drug1 = createdItems.find((i) => (i as { itemCode: string }).itemCode === "TEST-DRUG-1")!;
    const drug2 = createdItems.find((i) => (i as { itemCode: string }).itemCode === "TEST-DRUG-2")!;
    const sup1  = createdItems.find((i) => (i as { itemCode: string }).itemCode === "TEST-SUP-1")!;

    const lotDefs = [
      {
        itemId: (drug1 as { id: string }).id,
        warehouseId: whPhIn.id,
        expiryDate: formatDate(addDays(today, 30)),
        receivedDate: formatDate(addDays(today, -5)),
        purchasePrice: "100.0000",
        qtyInMinor: "50.0000",
        label: "TEST-DRUG-1 LotA",
      },
      {
        itemId: (drug1 as { id: string }).id,
        warehouseId: whPhIn.id,
        expiryDate: formatDate(addDays(today, 90)),
        receivedDate: formatDate(addDays(today, -3)),
        purchasePrice: "105.0000",
        qtyInMinor: "100.0000",
        label: "TEST-DRUG-1 LotB",
      },
      {
        itemId: (drug1 as { id: string }).id,
        warehouseId: whPhIn.id,
        expiryDate: formatDate(addDays(today, -10)),
        receivedDate: formatDate(addDays(today, -60)),
        purchasePrice: "95.0000",
        qtyInMinor: "200.0000",
        label: "TEST-DRUG-1 LotExpired",
      },
      {
        itemId: (drug2 as { id: string }).id,
        warehouseId: whPhIn.id,
        expiryDate: formatDate(addDays(today, 60)),
        receivedDate: formatDate(addDays(today, -7)),
        purchasePrice: "200.0000",
        qtyInMinor: "40.0000",
        label: "TEST-DRUG-2 Lot1",
      },
      {
        itemId: (sup1 as { id: string }).id,
        warehouseId: whPhIn.id,
        expiryDate: null as string | null,
        receivedDate: formatDate(addDays(today, -10)),
        purchasePrice: "30.0000",
        qtyInMinor: "500.0000",
        label: "TEST-SUP-1 Lot1",
      },
    ];

    const createdLots: Record<string, unknown>[] = [];
    for (const lotDef of lotDefs) {
      const { label, ...lotData } = lotDef;

      const expiryCondition =
        lotData.expiryDate === null
          ? sql`${inventoryLots.expiryDate} IS NULL`
          : eq(inventoryLots.expiryDate, lotData.expiryDate);

      const [existing] = await tx.select().from(inventoryLots).where(
        and(
          eq(inventoryLots.itemId, lotData.itemId),
          eq(inventoryLots.warehouseId, lotData.warehouseId),
          expiryCondition,
          eq(inventoryLots.purchasePrice, lotData.purchasePrice),
        ),
      );

      if (existing) {
        const [updated] = await tx
          .update(inventoryLots)
          .set({ qtyInMinor: lotData.qtyInMinor })
          .where(eq(inventoryLots.id, existing.id))
          .returning();
        createdLots.push({ ...updated, label } as Record<string, unknown>);
      } else {
        const [inserted] = await tx.insert(inventoryLots).values(lotData).returning();
        createdLots.push({ ...inserted, label } as Record<string, unknown>);
      }
    }

    return {
      warehouses: createdWarehouses.map((w) => ({ id: w.id, warehouseCode: w.warehouseCode, nameAr: w.nameAr })),
      items: createdItems.map((i) => {
        const item = i as { id: string; itemCode: string; nameAr: string };
        return { id: item.id, itemCode: item.itemCode, nameAr: item.nameAr };
      }),
      lots: createdLots.map((l) => {
        const lot = l as { id: string; label: string; itemId: string; warehouseId: string; expiryDate: string | null; qtyInMinor: string };
        return { id: lot.id, label: lot.label, itemId: lot.itemId, warehouseId: lot.warehouseId, expiryDate: lot.expiryDate, qtyInMinor: lot.qtyInMinor };
      }),
    };
  });
}
