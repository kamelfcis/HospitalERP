import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import {
  receivingHeaders,
  receivingLines,
  type ReceivingHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";
import { reverseOldLotsAndDeleteLines, insertNewReceivingLines } from "./purchasing-edit-receiving-reversal";
import { repostActiveLines, resolveGlAccounts } from "./purchasing-edit-receiving-repost";

const methods = {
  async editPostedReceiving(
    this: DatabaseStorage,
    id: string,
    newLines: {
      itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string;
      purchasePrice: string; lineTotal: string; batchNumber?: string;
      expiryDate?: string; expiryMonth?: number; expiryYear?: number;
      salePrice?: string; salePriceHint?: string; notes?: string;
      isRejected?: boolean; rejectionReason?: string;
      bonusQty?: string; bonusQtyInMinor?: string;
    }[],
  ): Promise<ReceivingHeader> {

    let oldJournalEntryId: string | null = null;
    let resolvedInventoryGlAccountId: string | null = null;
    let resolvedApAccountId: string | null = null;

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      const [header] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted_costed')
        throw new Error('لا يمكن تعديل مستند مُحوَّل لفاتورة شراء — يجب تعديل الفاتورة مباشرة');
      if (header.status !== 'posted_qty_only')
        throw new Error('يمكن تعديل أذونات الاستلام المُرحَّلة فقط (حالة: مرحّل)');
      if (!header.warehouseId) throw new Error('المستودع مطلوب');

      await reverseOldLotsAndDeleteLines(tx, id);
      const { totalQty, totalCost } = await insertNewReceivingLines(tx, id, newLines);

      const { inventoryGlAccountId, apAccountId } = await resolveGlAccounts(tx, header);
      resolvedInventoryGlAccountId = inventoryGlAccountId;
      resolvedApAccountId = apAccountId;

      const activeLines = newLines.filter(l => !l.isRejected);
      await repostActiveLines(tx, header, activeLines, id);

      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
        journalStatus: 'none',
        journalError: null,
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, id));

      const oldJournalRes = await tx.execute(
        sql`SELECT id FROM journal_entries
            WHERE source_type = 'purchase_receiving' AND source_document_id = ${id}
              AND status = 'posted'
            ORDER BY created_at DESC LIMIT 1`
      );
      oldJournalEntryId = (oldJournalRes as any).rows[0]?.id ?? null;

      return (await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, id)))[0];
    });

    if (oldJournalEntryId) {
      try {
        await this.reverseJournalEntry(oldJournalEntryId, null);
      } catch (err) {
        logger.warn({ err, receivingId: id }, "[EDIT_POSTED_RCV] Failed to reverse old GL journal — continuing");
      }
    }

    const recvLines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
    const activeForGL = recvLines.filter(l => !l.isRejected);
    const totalCostForGL = activeForGL.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
    if (totalCostForGL > 0 && resolvedInventoryGlAccountId && resolvedApAccountId) {
      await db.update(receivingHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
      await logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "pending" });

      this.generateJournalEntry({
        sourceType: "purchase_receiving",
        sourceDocumentId: id,
        reference: `RCV-${result.receivingNumber}`,
        description: `قيد استلام مورد رقم ${result.receivingNumber} (معدَّل)`,
        entryDate: result.receiveDate,
        lines: [
          { lineType: "inventory", amount: String(totalCostForGL) },
          { lineType: "payables",  amount: String(totalCostForGL) },
        ],
        dynamicAccountOverrides: {
          inventory: { debitAccountId:  resolvedInventoryGlAccountId ?? undefined },
          payables:  { creditAccountId: resolvedApAccountId ?? undefined },
        },
      }).then(async (entry) => {
        if (entry) {
          await db.update(receivingHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
          logAcctEvent({ sourceType: "purchase_receiving", sourceId: id, eventType: "purchase_receiving_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
        } else {
          await db.update(receivingHeaders).set({ journalStatus: "needs_retry", journalError: "ربط الحسابات غير مكتمل — راجع /account-mappings", updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
        }
      }).catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, receivingId: id }, "[EDIT_POSTED_RCV] Auto journal failed — needs_retry");
        await db.update(receivingHeaders).set({ journalStatus: "needs_retry", journalError: msg, updatedAt: new Date() }).where(eq(receivingHeaders.id, id));
      });
    }

    return result;
  },
};

export default methods;
