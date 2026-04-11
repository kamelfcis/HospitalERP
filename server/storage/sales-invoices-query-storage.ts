import { db } from "../db";
import { eq, desc, and, sql, or, asc, ilike } from "drizzle-orm";
import {
  items,
  warehouses,
  users,
  salesInvoiceHeaders,
  salesInvoiceLines,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  SalesInvoiceWithDetails,
  SalesInvoiceLineWithItem,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";


const methods = {

  async getNextSalesInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(salesInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getSalesInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; claimStatus?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: (SalesInvoiceHeader & { warehouse?: { nameAr: string }, pharmacistName: string | null, itemCount: number })[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}> {
    const conditions: Array<any> = [];
    if (filters.status && filters.status !== "all") {
      const statuses = filters.status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(salesInvoiceHeaders.status, statuses[0] as any));
      } else {
        const VALID_STATUSES = ["draft", "finalized", "collected", "cancelled"];
        const safe = statuses.filter(s => VALID_STATUSES.includes(s));
        if (safe.length > 0) {
          const placeholders = safe.map(s => `'${s}'`).join(", ");
          conditions.push(sql`${salesInvoiceHeaders.status}::text IN (${sql.raw(placeholders)})`);
        }
      }
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${salesInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.customerType && filters.customerType !== "all") conditions.push(eq(salesInvoiceHeaders.customerType, filters.customerType as any));
    if (filters.pharmacistId && filters.pharmacistId !== "all") conditions.push(eq(salesInvoiceHeaders.createdBy, filters.pharmacistId));
    if (filters.warehouseId && filters.warehouseId !== "all") conditions.push(eq(salesInvoiceHeaders.warehouseId, filters.warehouseId));
    if (filters.claimStatus && filters.claimStatus !== "all") {
      if (filters.claimStatus === "none") {
        conditions.push(sql`${salesInvoiceHeaders.claimStatus} IS NULL`);
      } else {
        conditions.push(sql`${salesInvoiceHeaders.claimStatus} = ${filters.claimStatus}`);
      }
    }
    if (filters.search) {
      const searchTerm = filters.search.replace(/^SI-/i, '').trim();
      conditions.push(or(
        ilike(salesInvoiceHeaders.customerName, `%${filters.search}%`),
        sql`${salesInvoiceHeaders.invoiceNumber}::text LIKE ${`%${searchTerm}%`}`
      ));
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.subtotal}::numeric), 0)`,
      discountValue: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.discountValue}::numeric), 0)`,
      netTotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.netTotal}::numeric), 0)`,
    }).from(salesInvoiceHeaders).where(whereClause);

    const rows = await db.select({
      h: salesInvoiceHeaders,
      warehouseNameAr: warehouses.nameAr,
      pharmacistName: users.fullName,
      itemCount: sql<number>`COUNT(DISTINCT ${salesInvoiceLines.id})`,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .leftJoin(users, eq(salesInvoiceHeaders.createdBy, users.id))
    .leftJoin(salesInvoiceLines, eq(salesInvoiceLines.invoiceId, salesInvoiceHeaders.id))
    .where(whereClause)
    .groupBy(salesInvoiceHeaders.id, warehouses.nameAr, users.fullName)
    .orderBy(desc(salesInvoiceHeaders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

    const data = rows.map(r => ({
      ...r.h,
      warehouse: r.warehouseNameAr ? { nameAr: r.warehouseNameAr } : undefined,
      pharmacistName: r.pharmacistName || null,
      itemCount: Number(r.itemCount) || 0,
    }));

    return {
      data,
      total: Number(agg.count),
      totals: {
        subtotal: Number(agg.subtotal),
        discountValue: Number(agg.discountValue),
        netTotal: Number(agg.netTotal),
      },
    };
  },

  async getSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceWithDetails | undefined> {
    const headerRows = await db
      .select({ header: salesInvoiceHeaders, warehouse: warehouses })
      .from(salesInvoiceHeaders)
      .leftJoin(warehouses, eq(warehouses.id, salesInvoiceHeaders.warehouseId))
      .where(eq(salesInvoiceHeaders.id, id))
      .limit(1);
    if (!headerRows.length) return undefined;
    const { header: h, warehouse: wh } = headerRows[0];

    const lineRows = await db
      .select({ line: salesInvoiceLines, item: items })
      .from(salesInvoiceLines)
      .leftJoin(items, eq(items.id, salesInvoiceLines.itemId))
      .where(eq(salesInvoiceLines.invoiceId, id))
      .orderBy(asc(salesInvoiceLines.lineNo));

    const linesWithItems: SalesInvoiceLineWithItem[] = lineRows.map(r => ({
      ...r.line,
      item: r.item ?? undefined,
    }));

    return { ...h, warehouse: wh ?? undefined, lines: linesWithItems };
  },
};

export default methods;
