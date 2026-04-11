import { db } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import {
  salesInvoiceHeaders,
  salesInvoiceLines,
  warehouses,
  items,
  users,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getPendingSalesInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, false),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
      sql`${salesInvoiceHeaders.customerType} NOT IN ('credit', 'delivery')`,
      sql`(${salesInvoiceHeaders.customerType} != 'contract' OR COALESCE(CAST(${salesInvoiceHeaders.patientShareTotal} AS numeric), 0) > 0)`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      contractCompany:     salesInvoiceHeaders.contractCompany,
      patientShareTotal:   salesInvoiceHeaders.patientShareTotal,
      companyShareTotal:   salesInvoiceHeaders.companyShareTotal,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const creatorIdSet = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds = Array.from(creatorIdSet);
    const nameMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const userRows = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds));
      for (const row of userRows) {
        nameMap.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s)) ||
        (r.createdBy && r.createdBy.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  async getPendingReturnInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, true),
      sql`NOT EXISTS (SELECT 1 FROM cashier_receipts        cr  WHERE cr.invoice_id  = ${salesInvoiceHeaders.id})`,
      sql`NOT EXISTS (SELECT 1 FROM cashier_refund_receipts crr WHERE crr.invoice_id = ${salesInvoiceHeaders.id})`,
    ];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const filtered = await db.select({
      id:                  salesInvoiceHeaders.id,
      invoiceNumber:       salesInvoiceHeaders.invoiceNumber,
      invoiceDate:         salesInvoiceHeaders.invoiceDate,
      customerType:        salesInvoiceHeaders.customerType,
      customerName:        salesInvoiceHeaders.customerName,
      subtotal:            salesInvoiceHeaders.subtotal,
      discountValue:       salesInvoiceHeaders.discountValue,
      netTotal:            salesInvoiceHeaders.netTotal,
      createdBy:           salesInvoiceHeaders.createdBy,
      originalInvoiceId:   salesInvoiceHeaders.originalInvoiceId,
      status:              salesInvoiceHeaders.status,
      createdAt:           salesInvoiceHeaders.createdAt,
      claimedByShiftId:    salesInvoiceHeaders.claimedByShiftId,
      claimedAt:           salesInvoiceHeaders.claimedAt,
      warehouseName:       warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const creatorIdSet2 = new Set(filtered.map(r => r.createdBy).filter((v): v is string => !!v));
    const creatorIds2 = Array.from(creatorIdSet2);
    const nameMap2 = new Map<string, string>();
    if (creatorIds2.length > 0) {
      const userRows2 = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
        .from(users)
        .where(inArray(users.id, creatorIds2));
      for (const row of userRows2) {
        nameMap2.set(row.id, row.fullName || row.username || "");
      }
    }
    const enriched = filtered.map(r => ({
      ...r,
      pharmacistName: (r.createdBy ? nameMap2.get(r.createdBy) || null : null),
    }));

    if (search) {
      const s = search.toLowerCase();
      return enriched.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s))
      );
    }
    return enriched;
  },

  async getSalesInvoiceDetails(this: DatabaseStorage, invoiceId: string): Promise<any> {
    const [header] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!header) return null;

    const lines = await db.select({
      id:        salesInvoiceLines.id,
      lineNo:    salesInvoiceLines.lineNo,
      itemId:    salesInvoiceLines.itemId,
      unitLevel: salesInvoiceLines.unitLevel,
      qty:       salesInvoiceLines.qty,
      salePrice: salesInvoiceLines.salePrice,
      lineTotal: salesInvoiceLines.lineTotal,
      itemName:  items.nameAr,
      itemCode:  items.itemCode,
    })
    .from(salesInvoiceLines)
    .leftJoin(items, eq(salesInvoiceLines.itemId, items.id))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.lineNo));

    let pharmacistName: string | null = null;
    if (header.createdBy) {
      const [userRow] = await db.select({ fullName: users.fullName, username: users.username })
        .from(users)
        .where(eq(users.id, header.createdBy));
      if (userRow) pharmacistName = userRow.fullName || userRow.username || null;
    }
    const invoiceDateTime = header.createdAt ? header.createdAt.toISOString() : null;

    return { ...header, lines, pharmacistName, invoiceDateTime };
  },
};

export default methods;
