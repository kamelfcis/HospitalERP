import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { convertQtyToMinor } from "../inventory-helpers";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  pendingStockAllocations,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { getSetting } from "../settings-cache";

const finalizeMethods = {

  async finalizePatientInvoice(this: DatabaseStorage, id: string, expectedVersion?: number, oversellReason?: string): Promise<PatientInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as Record<string, unknown>;
      if (!locked) throw new Error("فاتورة المريض غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");

      if (expectedVersion != null && locked.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const dbLines = await tx.select().from(patientInvoiceLines)
        .where(and(eq(patientInvoiceLines.headerId, id), eq(patientInvoiceLines.isVoid, false)));
      const dbPayments = await tx.select().from(patientInvoicePayments)
        .where(eq(patientInvoicePayments.headerId, id));

      const warehouseId = locked.warehouse_id as string | null;
      if (warehouseId) {
        const inventoryLineTypes = new Set(["drug", "consumable"]);
        const invLines = dbLines.filter(l => inventoryLineTypes.has(l.lineType) && l.itemId);

        if (invLines.length > 0) {
          const invItemIds = Array.from(new Set(invLines.map(l => l.itemId!)));
          const invItemRows = await tx.execute(
            sql`SELECT id, name_ar, has_expiry, allow_oversell, major_to_medium, major_to_minor, medium_to_minor FROM items WHERE id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})`
          );
          const invItemMap: Record<string, any> = {};
          for (const row of invItemRows.rows as Array<Record<string, unknown>>) invItemMap[row.id as string] = row;

          const deferredEnabled = getSetting("enable_deferred_cost_issue") === "true";

          const stockBalanceRes = await tx.execute(
            sql`SELECT item_id, SUM(qty_in_minor::numeric) as avail
                FROM inventory_lots
                WHERE item_id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                GROUP BY item_id`
          );
          const stockBalanceMap: Record<string, number> = {};
          for (const row of stockBalanceRes.rows as any[]) {
            stockBalanceMap[row.item_id as string] = parseFloat(row.avail ?? "0");
          }
          const itemClaimedMap: Record<string, number> = {};

          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();

          const stockLines: Array<{
            lineIdx: number; itemId: string; qtyMinor: number;
            hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
          }> = [];

          const oversellLines: Array<{
            lineId: string; itemId: string; qtyMinorPending: number;
            qtyMinorAvailableAtFinalize: number;
          }> = [];

          for (let li = 0; li < invLines.length; li++) {
            const line = invLines[li];
            const item = invItemMap[line.itemId!];
            if (!item) continue;

            if (item.has_expiry && line.expiryMonth && line.expiryYear) {
              if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
                throw new Error(`الصنف "${item.name_ar}" - لا يمكن صرف دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
              }
            }

            const qty = parseFloat(line.quantity);
            const unitLevel = line.unitLevel || "minor";
            const qtyMinor = convertQtyToMinor(qty, unitLevel, {
              nameAr: String(item.name_ar ?? ''),
              majorToMedium: item.major_to_medium != null ? String(item.major_to_medium) : null,
              majorToMinor: item.major_to_minor != null ? String(item.major_to_minor) : null,
              mediumToMinor: item.medium_to_minor != null ? String(item.medium_to_minor) : null,
            });

            const totalAvail = stockBalanceMap[line.itemId!] ?? 0;
            const alreadyClaimed = itemClaimedMap[line.itemId!] ?? 0;
            const netAvail = totalAvail - alreadyClaimed;

            if (deferredEnabled && item.allow_oversell === true && netAvail < qtyMinor - 0.00005) {
              const availableForThisLine = Math.max(0, netAvail);
              itemClaimedMap[line.itemId!] = alreadyClaimed + availableForThisLine;

              oversellLines.push({
                lineId: line.id,
                itemId: line.itemId!,
                qtyMinorPending: qtyMinor - availableForThisLine,
                qtyMinorAvailableAtFinalize: totalAvail,
              });

              if (availableForThisLine > 0.00005) {
                stockLines.push({
                  lineIdx: li,
                  itemId: line.itemId!,
                  qtyMinor: availableForThisLine,
                  hasExpiry: !!item.has_expiry,
                  expiryMonth: line.expiryMonth,
                  expiryYear: line.expiryYear,
                });
              }

              await tx.execute(
                sql`UPDATE patient_invoice_lines
                    SET stock_issue_status = 'pending_cost',
                        cost_status        = 'pending',
                        oversell_reason    = ${(line as any).oversellReason ?? null}
                    WHERE id = ${line.id}`
              );
            } else {
              itemClaimedMap[line.itemId!] = alreadyClaimed + qtyMinor;
              stockLines.push({
                lineIdx: li,
                itemId: line.itemId!,
                qtyMinor,
                hasExpiry: !!item.has_expiry,
                expiryMonth: line.expiryMonth,
                expiryYear: line.expiryYear,
              });
            }
          }

          if (stockLines.length > 0) {
            await this.allocateStockInTx(tx, {
              operationType: "patient_finalize",
              referenceType: "patient_invoice",
              referenceId: id,
              warehouseId,
              lines: stockLines,
            });
          }

          if (oversellLines.length > 0) {
            if (!oversellReason || oversellReason.trim() === "") {
              throw new Error("سبب الصرف بدون رصيد (oversellReason) إجباري عند وجود بنود مؤجلة التكلفة");
            }
            const userId = (locked.created_by as string) ?? null;
            const now = new Date();
            await tx.insert(pendingStockAllocations)
              .values(oversellLines.map(ol => ({
                invoiceId:                   id,
                invoiceLineId:               ol.lineId,
                itemId:                      ol.itemId,
                warehouseId,
                qtyMinorPending:             String(ol.qtyMinorPending),
                qtyMinorOriginal:            String(ol.qtyMinorPending),
                status:                      "pending" as const,
                reason:                      oversellReason.trim(),
                qtyMinorAvailableAtFinalize: String(ol.qtyMinorAvailableAtFinalize),
                createdBy:                   userId,
              })))
              .onConflictDoUpdate({
                target: pendingStockAllocations.invoiceLineId,
                set: {
                  qtyMinorPending: sql`excluded.qty_minor_pending`,
                  status:          "pending",
                  updatedAt:       now,
                },
              });
            console.log(JSON.stringify({
              event:     "OVERSELL_DEFERRED",
              timestamp: new Date().toISOString(),
              source:    "patient_invoice_finalize",
              invoiceId: id,
              userId,
              reason:    oversellReason,
              lineCount: oversellLines.length,
              lines: oversellLines.map(ol => ({
                itemId:                   ol.itemId,
                lineId:                   ol.lineId,
                qtyMinorPending:          ol.qtyMinorPending,
                qtyMinorAvailableAtFinalize: ol.qtyMinorAvailableAtFinalize,
              })),
            }));
          }
        }
      }

      const recomputedTotals = this.computeInvoiceTotals(dbLines as unknown as Record<string, unknown>[], dbPayments as unknown as Record<string, unknown>[]);
      const newVersion = ((locked as Record<string, unknown>).version as number || 1) + 1;

      const [updated] = await tx.update(patientInvoiceHeaders).set({
        ...recomputedTotals,
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        version: newVersion,
      }).where(and(
        eq(patientInvoiceHeaders.id, id),
        eq(patientInvoiceHeaders.status, 'draft')
      )).returning();

      if (!updated) throw new Error("الفاتورة ليست مسودة");
      return updated;
    });

    return result;
  },

  async deletePatientInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const invoice = lockResult.rows?.[0] as Record<string, unknown>;
      if (!invoice) throw new Error("فاتورة المريض غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled" as "cancelled",
        version: ((invoice as Record<string, unknown>).version as number | null | undefined || 1) + 1,
        notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
      }).where(eq(patientInvoiceHeaders.id, id));
      return true;
    });
  },
};

export default finalizeMethods;
