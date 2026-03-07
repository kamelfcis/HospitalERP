/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Transfers Core Storage — عمليات التحويل المخزني الأساسية
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - قائمة التحويلات (Get Transfers)
 *  - إنشاء / تعديل / ترحيل / حذف التحويل (CRUD + Post)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, gte, lte, sql, or, ilike, asc } from "drizzle-orm";
import {
  items,
  itemBarcodes,
  inventoryLots,
  inventoryLotMovements,
  warehouses,
  storeTransfers,
  transferLines,
  transferLineAllocations,
  journalEntries,
  journalLines,
  fiscalPeriods,
  type StoreTransfer,
  type InsertStoreTransfer,
  type StoreTransferWithDetails,
  type TransferLineWithItem,
  type InsertJournalLine,
  type JournalEntry,
  type Warehouse,
  type TransferLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getTransfers(this: DatabaseStorage): Promise<StoreTransferWithDetails[]> {
    const transfers = await db.select().from(storeTransfers)
      .where(sql`${storeTransfers.status} != 'cancelled'`)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(100);

    const result: StoreTransferWithDetails[] = [];
    for (const t of transfers) {
      const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
      const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
      const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
      const linesWithItems: TransferLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      result.push({ ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems });
    }
    return result;
  },

  async getTransfer(this: DatabaseStorage, id: string): Promise<StoreTransferWithDetails | undefined> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return undefined;
    const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
    const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
    const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
    const linesWithItems: TransferLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    return { ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems };
  },

  async createDraftTransfer(this: DatabaseStorage, header: InsertStoreTransfer, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(${storeTransfers.transferNumber}), 0)` }).from(storeTransfers);
      const nextNumber = (maxNum?.max || 0) + 1;

      const [transfer] = await tx.insert(storeTransfers).values({
        ...header,
        transferNumber: nextNumber,
        status: "draft" as const,
      }).returning();

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId: transfer.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      return transfer;
    });
  },

  async updateDraftTransfer(this: DatabaseStorage, transferId: string, header: Partial<InsertStoreTransfer>, lines: Array<{ itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }>): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      await tx.update(storeTransfers).set({
        transferDate: header.transferDate,
        sourceWarehouseId: header.sourceWarehouseId,
        destinationWarehouseId: header.destinationWarehouseId,
        notes: header.notes || null,
      }).where(eq(storeTransfers.id, transferId));

      await tx.delete(transferLines).where(eq(transferLines.transferId, transferId));

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      const [updated] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId));
      return updated;
    });
  },

  /**
   * postTransfer — ترحيل تحويل مخزني (المسار الإنتاجي المعتمد الوحيد)
   *
   * التسلسل الكامل داخل transaction واحدة atomically:
   *
   * 1. قفل سجل التحويل FOR UPDATE (منع التعديل المتزامن)
   * 2. التحقق من الحالة (draft فقط)، تطابق المخازن، وجود السطور
   * 3. لكل سطر:
   *    a. جلب الصنف وفحص أنه ليس service
   *    b. حجز دفعات المخزون (FEFO) بقفل FOR UPDATE على inventoryLots
   *       - إذا حدد المستخدم expiryMonth/Year: أولوية للدفعة المحددة ثم FEFO
   *       - إذا حدد selectedExpiryDate: مطابقة تاريخ محددة
   *       - الباقي: FEFO تلقائي (أقرب انتهاء صلاحية + أقدم استلام)
   *    c. خصم الكمية من دفعات المصدر (UPDATE qty_in_minor)
   *    d. إضافة الكمية لدفعات الوجهة (INSERT أو UPDATE)
   *    e. تسجيل حركات المخزون (stockMovementHeaders + stockMovementAllocations)
   *    f. تسجيل حركة الدفعة (transferLineAllocations)
   * 4. تحديث totalCost على كل سطر التحويل
   * 5. تحديث حالة التحويل → "posted"
   * 6. إنشاء القيد المحاسبي داخل نفس المعاملة (ذري):
   *    - يقرأ gl_account_id من جدول warehouses لكل مخزن
   *    - إذا أي مخزن ليس له GL account → تخطي بتسجيل في السجل (بدون خطأ)
   *    - إذا لا توجد فترة محاسبية مفتوحة → تخطي بتسجيل
   *    - مدين: gl_account_id مخزن الوجهة | دائن: gl_account_id مخزن المصدر
   *    - sourceType = "warehouse_transfer" | status = "posted"
   *    - idempotency: لا يُنشأ قيدان لنفس transferId (unique index)
   *
   * @throws إذا الكمية غير كافية في المصدر بعد FEFO
   * @throws إذا التحويل ليس في حالة draft
   */
  async postTransfer(this: DatabaseStorage, transferId: string): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId)).for("update");
    if (!transfer) throw new Error("التحويل غير موجود");
    if (transfer.status !== "draft") throw new Error("لا يمكن ترحيل تحويل غير مسودة");
    if (transfer.sourceWarehouseId === transfer.destinationWarehouseId) throw new Error("مخزن المصدر والوجهة يجب أن يكونا مختلفين");

    const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, transferId));
    if (lines.length === 0) throw new Error("لا توجد سطور في التحويل");
      for (const line of lines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);
        if (item.category === "service") throw new Error(`الخدمات لا يمكن تحويلها: ${item.nameAr}`);

        const requiredQty = parseFloat(line.qtyInMinor);
        if (requiredQty <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر: ${item.nameAr}`);

        let remaining = requiredQty;
        const allocations: { lotId: string; expiryDate: string | null; expiryMonth: number | null; expiryYear: number | null; allocatedQty: number; unitCost: string; lotSalePrice: string }[] = [];

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
            ? and(
                sql`${inventoryLots.expiryMonth} IS NOT NULL`,
                sql`${inventoryLots.expiryYear} IS NOT NULL`,
                sql`(${inventoryLots.expiryYear} > ${tYear} OR (${inventoryLots.expiryYear} = ${tYear} AND ${inventoryLots.expiryMonth} >= ${tMonth}))`
              )
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

          const expiryMatchConditions = [];
          if (alloc.expiryDate) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} = ${alloc.expiryDate}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} IS NULL`);
          }
          if (alloc.expiryMonth != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} = ${alloc.expiryMonth}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
          }
          if (alloc.expiryYear != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} = ${alloc.expiryYear}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} IS NULL`);
          }

          const existingDestLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.destinationWarehouseId),
              eq(inventoryLots.isActive, true),
              ...expiryMatchConditions,
              sql`${inventoryLots.purchasePrice}::numeric = ${alloc.unitCost}::numeric`
            ));

          let destLotId: string;

          if (existingDestLots.length > 0) {
            destLotId = existingDestLots[0].id;
            const allocSalePrice = parseFloat(alloc.lotSalePrice || "0");
            const existingSalePrice = parseFloat(existingDestLots[0].salePrice || "0");
            const destSalePrice = allocSalePrice > 0 ? alloc.lotSalePrice : (existingSalePrice > 0 ? existingDestLots[0].salePrice : "0");
            await tx.execute(sql`
              UPDATE inventory_lots 
              SET qty_in_minor = qty_in_minor::numeric + ${alloc.allocatedQty.toFixed(4)}::numeric,
                  sale_price = ${destSalePrice},
                  updated_at = NOW()
              WHERE id = ${destLotId}
            `);
          } else {
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

      const allAllocations = await tx.select().from(transferLineAllocations)
        .innerJoin(transferLines, eq(transferLineAllocations.lineId, transferLines.id))
        .where(eq(transferLines.transferId, transferId));
      
      let totalCost = 0;
      for (const row of allAllocations) {
        const qty = parseFloat(row.transfer_line_allocations.qtyOutInMinor);
        const cost = parseFloat(row.transfer_line_allocations.purchasePrice);
        totalCost += qty * cost;
      }

      const [updated] = await tx.update(storeTransfers)
        .set({ status: "executed" as const, executedAt: new Date() })
        .where(eq(storeTransfers.id, transferId))
        .returning();

      // ── Step 6: قيد محاسبي ذري داخل نفس الـ tx ──────────────────────────
      // سياسة: Dr مخزن الوجهة / Cr مخزن المصدر — القيمة = تكلفة الدفعات المحوّلة
      // لا يُعاد احتساب سعر الصنف أو الضريبة أو رصيد المورد
      if (totalCost > 0) {
        // Idempotency — unique index على (sourceType, sourceDocumentId) يمنع التكرار في DB
        // لكن نتحقق مسبقاً لتفادي خطأ unique violation داخل الـ tx
        const [existingJournal] = await tx.select({ id: journalEntries.id })
          .from(journalEntries)
          .where(and(
            eq(journalEntries.sourceType, "warehouse_transfer"),
            eq(journalEntries.sourceDocumentId, transferId)
          ))
          .limit(1);

        if (existingJournal) {
          console.log(`[GL] Transfer journal already exists for transfer ${transferId}, skipping.`);
        } else {
          // اقرأ GL account من جدول warehouses مباشرةً
          const [srcWh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr })
            .from(warehouses).where(eq(warehouses.id, transfer.sourceWarehouseId));
          const [destWh] = await tx.select({ glAccountId: warehouses.glAccountId, nameAr: warehouses.nameAr })
            .from(warehouses).where(eq(warehouses.id, transfer.destinationWarehouseId));

          if (!srcWh?.glAccountId || !destWh?.glAccountId) {
            console.log(
              `[GL] Transfer journal SKIPPED — GL account not configured. ` +
              `src=${srcWh?.nameAr ?? transfer.sourceWarehouseId} (${srcWh?.glAccountId ?? "—"}), ` +
              `dest=${destWh?.nameAr ?? transfer.destinationWarehouseId} (${destWh?.glAccountId ?? "—"}). ` +
              `Configure via: إعدادات المستودع → حساب المخزون.`
            );
          } else {
            // فترة محاسبية مفتوحة لتاريخ التحويل
            const [period] = await tx.select({ id: fiscalPeriods.id })
              .from(fiscalPeriods)
              .where(and(
                lte(fiscalPeriods.startDate, transfer.transferDate),
                gte(fiscalPeriods.endDate, transfer.transferDate),
                eq(fiscalPeriods.isClosed, false)
              ))
              .limit(1);

            if (!period) {
              console.log(`[GL] Transfer journal SKIPPED — no open fiscal period for date ${transfer.transferDate}.`);
            } else {
              const entryNumber = await this.getNextEntryNumber();
              const amount = totalCost.toFixed(2);
              const desc = `قيد تحويل مخزني ${transfer.transferNumber} — من ${srcWh.nameAr} إلى ${destWh.nameAr}`;

              const [entry] = await tx.insert(journalEntries).values({
                entryNumber,
                entryDate:        transfer.transferDate,
                periodId:         period.id,
                description:      desc,
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
                  accountId:      destWh.glAccountId,
                  debit:          amount,
                  credit:         "0.00",
                  description:    `تحويل وارد — ${destWh.nameAr}`,
                },
                {
                  journalEntryId: entry.id,
                  lineNumber:     2,
                  accountId:      srcWh.glAccountId,
                  debit:          "0.00",
                  credit:         amount,
                  description:    `تحويل صادر — ${srcWh.nameAr}`,
                },
              ]);

              console.log(`[GL] Transfer journal posted: #${entryNumber}, amount=${amount}, Dr=${destWh.nameAr}, Cr=${srcWh.nameAr}`);
            }
          }
        }
      }

      return updated;
    });
  },

  async deleteTransfer(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return false;
    if (t.status !== "draft") throw new Error("لا يمكن إلغاء تحويل مُرحّل");
    await db.update(storeTransfers).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (t.notes ? `[ملغي] ${t.notes}` : "[ملغي]"),
    }).where(eq(storeTransfers.id, id));
    return true;
  },

};

export default methods;
