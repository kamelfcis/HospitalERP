import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  cashierReceipts,
  cashierRefundReceipts,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const MAX_SHIFT_HOURS = 24;

const totalsMethods = {

  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<{
    totalCollected: string;
    totalRefunded: string;
    totalDeferred: string;
    collectCount: number;
    refundCount: number;
    deferredCount: number;
    openingCash: string;
    netCash: string;
    netCollected: string;
    hoursOpen: number;
    isStale: boolean;
    creditCollected: string;
    creditCount: number;
    supplierPaid: string;
    supplierPaidCount: number;
    deliveryCollected: string;
    deliveryCollectedCount: number;
  }> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const deferredRes = await db.execute(sql`
      SELECT COALESCE(SUM(sih.net_total), 0)::text AS total, COUNT(*)::int AS count
      FROM sales_invoice_headers sih
      LEFT JOIN warehouses w ON w.id = sih.warehouse_id
      JOIN cashier_shifts cs ON cs.id = ${shiftId}
      WHERE sih.is_return = false
        AND sih.customer_type = 'credit'
        AND sih.status IN ('finalized', 'collected')
        AND sih.created_at >= cs.opened_at
        AND (cs.closed_at IS NULL OR sih.created_at <= cs.closed_at)
        AND (
              (cs.unit_type = 'pharmacy'   AND sih.pharmacy_id = cs.pharmacy_id)
           OR (cs.unit_type = 'department' AND w.department_id = cs.department_id)
        )
    `);
    const deferredRow = (deferredRes as any).rows[0];

    const creditRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM customer_receipts
      WHERE shift_id = ${shiftId}
    `);
    const creditRow = (creditRes as any).rows[0];

    const supplierPaidRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM supplier_payments
      WHERE shift_id = ${shiftId}
    `);
    const supplierPaidRow = (supplierPaidRes as any).rows[0];

    const deliveryCollectedRes = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS count
      FROM delivery_receipts
      WHERE shift_id = ${shiftId}
    `);
    const deliveryCollectedRow = (deliveryCollectedRes as any).rows[0];

    const durationRes = await db.execute(sql`
      SELECT opening_cash, status,
             EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600 AS hours_open
      FROM cashier_shifts WHERE id = ${shiftId}
    `);
    const shiftRow = (durationRes as any).rows[0];

    const totalCollected   = collectResult?.total || "0";
    const totalRefunded    = refundResult?.total  || "0";
    const totalDeferred    = deferredRow?.total   || "0";
    const deferredCount    = parseInt(deferredRow?.count || "0", 10);
    const creditCollected  = creditRow?.total     || "0";
    const creditCount      = parseInt(creditRow?.count || "0", 10);
    const supplierPaid          = supplierPaidRow?.total         || "0";
    const supplierPaidCount     = parseInt(supplierPaidRow?.count     || "0", 10);
    const deliveryCollected     = deliveryCollectedRow?.total    || "0";
    const deliveryCollectedCount = parseInt(deliveryCollectedRow?.count || "0", 10);
    const openingCash           = shiftRow?.opening_cash         || "0";
    const hoursOpen             = parseFloat(shiftRow?.hours_open || "0");
    const isStale               = hoursOpen > MAX_SHIFT_HOURS || shiftRow?.status === "stale";
    const netCash               = (
      parseFloat(openingCash) +
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded) -
      parseFloat(supplierPaid)
    ).toFixed(2);
    const netCollected          = (
      parseFloat(totalCollected) +
      parseFloat(creditCollected) +
      parseFloat(deliveryCollected) -
      parseFloat(totalRefunded)
    ).toFixed(2);

    return {
      openingCash,
      totalCollected,
      totalDeferred,
      collectCount:  collectResult?.count || 0,
      totalRefunded,
      refundCount:   refundResult?.count  || 0,
      deferredCount,
      creditCollected,
      creditCount,
      supplierPaid,
      supplierPaidCount,
      deliveryCollected,
      deliveryCollectedCount,
      netCash,
      netCollected,
      hoursOpen,
      isStale,
    };
  },

  async getCashierReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    return receipt || null;
  },

  async getCashierRefundReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    return receipt || null;
  },

  async markReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    if (!receipt) throw new Error("الإيصال غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("الإيصال مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierReceipts.id, receiptId)).returning();
    return updated;
  },

  async markRefundReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    if (!receipt) throw new Error("إيصال المرتجع غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("إيصال المرتجع مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierRefundReceipts).set({
      printedAt:     new Date(),
      printCount:    (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierRefundReceipts.id, receiptId)).returning();
    return updated;
  },
};

export default totalsMethods;
