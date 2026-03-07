/**
 * Pharmacy sales demo seed — بيانات عرض تجريبية للصيدلية
 *
 * يُستدعى فقط من route بيئة التطوير: POST /api/seed/pharmacy-sales-demo
 * لا علاقة له بمنطق الإنتاج في invoicing routes
 */
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  warehouses,
  items,
  itemBarcodes,
  inventoryLots,
} from "@shared/schema";

export async function runPharmacyDemoSeed(): Promise<{
  warehouseId: string;
  items: Record<string, unknown>[];
}> {
  const today = new Date().toISOString().split("T")[0];

  const demoItems = [
    { code: "DEMO-DRUG-001", nameAr: "أموكسيسيلين 500مجم",       nameEn: "Amoxicillin 500mg",      price: "150", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-002", nameAr: "باراسيتامول 500مجم",        nameEn: "Paracetamol 500mg",       price: "80",  category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-003", nameAr: "أوميبرازول 20مجم",          nameEn: "Omeprazole 20mg",         price: "200", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-004", nameAr: "ميتفورمين 850مجم",          nameEn: "Metformin 850mg",         price: "120", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-005", nameAr: "أملوديبين 5مجم",            nameEn: "Amlodipine 5mg",          price: "180", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-006", nameAr: "سيبروفلوكساسين 500مجم",    nameEn: "Ciprofloxacin 500mg",     price: "250", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-007", nameAr: "ديكلوفيناك 50مجم",         nameEn: "Diclofenac 50mg",         price: "90",  category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-008", nameAr: "أزيثروميسين 250مجم",        nameEn: "Azithromycin 250mg",      price: "300", category: "drug"   as const, hasExpiry: true  },
    { code: "DEMO-DRUG-009", nameAr: "شاش طبي",                   nameEn: "Medical Gauze",           price: "50",  category: "supply" as const, hasExpiry: false },
    { code: "DEMO-DRUG-010", nameAr: "قطن طبي",                   nameEn: "Medical Cotton",          price: "40",  category: "supply" as const, hasExpiry: false },
  ];

  const barcodes = [
    "6901234560001", "6901234560002", "6901234560003", "6901234560004", "6901234560005",
    "6901234560006", "6901234560007", "6901234560008", "6901234560009", "6901234560010",
  ];

  const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.warehouseCode, "WH-PHARM")).limit(1);
  let warehouseId: string;
  if (existingWarehouse) {
    warehouseId = existingWarehouse.id;
  } else {
    const [newWarehouse] = await db.insert(warehouses).values({
      warehouseCode: "WH-PHARM",
      nameAr: "صيدلية رئيسية",
    }).returning();
    warehouseId = newWarehouse.id;
  }

  const resultItems: Record<string, unknown>[] = [];

  for (let i = 0; i < demoItems.length; i++) {
    const demo = demoItems[i];
    const barcode = barcodes[i];

    const [existingItem] = await db.select().from(items).where(eq(items.itemCode, demo.code)).limit(1);
    let itemId: string;
    if (existingItem) {
      itemId = existingItem.id;
    } else {
      const [newItem] = await db.insert(items).values({
        itemCode: demo.code,
        nameAr: demo.nameAr,
        nameEn: demo.nameEn,
        category: demo.category,
        hasExpiry: demo.hasExpiry,
        salePriceCurrent: demo.price,
        purchasePriceLast: "0",
        isToxic: false,
        majorUnitName: "علبة",
        mediumUnitName: "شريط",
        minorUnitName: "قرص",
        majorToMedium: "10",
        mediumToMinor: "10",
        majorToMinor: "100",
      }).returning();
      itemId = newItem.id;
    }

    await db.insert(itemBarcodes).values({
      itemId,
      barcodeValue: barcode,
      barcodeType: "EAN13",
      isActive: true,
    }).onConflictDoNothing();

    const createdLots: Record<string, unknown>[] = [];

    const existingLots = await db.select().from(inventoryLots)
      .where(and(eq(inventoryLots.itemId, itemId), eq(inventoryLots.warehouseId, warehouseId)))
      .limit(1);

    if (existingLots.length > 0) {
      const allLots = await db.select().from(inventoryLots)
        .where(and(eq(inventoryLots.itemId, itemId), eq(inventoryLots.warehouseId, warehouseId)));
      createdLots.push(...allLots as Record<string, unknown>[]);
    } else {
      if (demo.hasExpiry) {
        const isFirstItem = demo.code === "DEMO-DRUG-001";
        const lotConfigs = [
          { expiryMonth: 3,  expiryYear: 2026, qtyInMinor: isFirstItem ? "5" : "50" },
          { expiryMonth: 6,  expiryYear: 2026, qtyInMinor: isFirstItem ? "5" : "50" },
          { expiryMonth: 12, expiryYear: 2026, qtyInMinor: "200" },
        ];
        for (const lot of lotConfigs) {
          const expiryDate = `${lot.expiryYear}-${String(lot.expiryMonth).padStart(2, "0")}-01`;
          const [newLot] = await db.insert(inventoryLots).values({
            itemId,
            warehouseId,
            expiryDate,
            expiryMonth: lot.expiryMonth,
            expiryYear: lot.expiryYear,
            receivedDate: today,
            purchasePrice: "1.00",
            qtyInMinor: lot.qtyInMinor,
            isActive: true,
          }).returning();
          createdLots.push(newLot as Record<string, unknown>);
        }
      } else {
        const [newLot] = await db.insert(inventoryLots).values({
          itemId,
          warehouseId,
          receivedDate: today,
          purchasePrice: "1.00",
          qtyInMinor: "500",
          isActive: true,
        }).returning();
        createdLots.push(newLot as Record<string, unknown>);
      }
    }

    resultItems.push({
      id: itemId,
      code: demo.code,
      nameAr: demo.nameAr,
      barcode,
      hasExpiry: demo.hasExpiry,
      salePriceCurrent: demo.price,
      lots: createdLots,
    });
  }

  return { warehouseId, items: resultItems };
}
