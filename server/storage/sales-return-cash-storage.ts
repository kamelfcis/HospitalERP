import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { logAcctEvent, updateAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import {
  salesInvoiceHeaders,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const salesReturnCashMethods = {
  async completeSalesReturnWithCash(
    this: DatabaseStorage,
    invoiceIds: string[],
    cashGlAccountId: string | null,
  ): Promise<void> {
    let cashAccountId = cashGlAccountId;
    if (!cashAccountId) {
      const ccMappings = await this.getMappingsForTransaction("cashier_collection", null);
      const cashM = ccMappings.find(m => m.lineType === "cash");
      cashAccountId = cashM?.debitAccountId || null;
    }
    if (!cashAccountId) {
      logger.error("[SALES_RETURN] no cash GL account found for Phase-2");
      for (const invoiceId of invoiceIds) {
        await logAcctEvent({
          sourceType: "sales_return", sourceId: invoiceId,
          eventType: "sales_return_cash_blocked",
          status: "blocked",
          errorMessage: "لا يوجد حساب خزنة — عرِّف ربط cashier_collection/cash أو تأكد من GL الوردية",
        });
      }
      return;
    }

    for (const invoiceId of invoiceIds) {
      const eventId = await logAcctEvent({
        sourceType: "sales_return", sourceId: invoiceId,
        eventType:  "sales_return_cash_posted",
        status:     "pending",
      });

      try {
        const [inv] = await db.select({
          invoiceNumber: salesInvoiceHeaders.invoiceNumber,
          isReturn:      salesInvoiceHeaders.isReturn,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        if (!inv?.isReturn) {
          await updateAcctEvent(eventId, "blocked", { errorMessage: "الفاتورة ليست مرتجعاً" });
          continue;
        }

        const [existingEntry] = await db.select().from(journalEntries)
          .where(and(
            eq(journalEntries.sourceType, "sales_return"),
            eq(journalEntries.sourceDocumentId, invoiceId),
          ));

        if (!existingEntry) {
          await updateAcctEvent(eventId, "blocked", { errorMessage: "لا يوجد قيد مرحلة 1 للمرتجع — تأكد من إعداد ربط الحسابات" });
          continue;
        }

        if (existingEntry.status === "posted") {
          logger.info({ invoiceId, entryId: existingEntry.id },
            "[SALES_RETURN] Phase-2 guard: journal already posted — skipping (idempotent)");
          await updateAcctEvent(eventId, "completed", { journalEntryId: existingEntry.id,
            errorMessage: "القيد مرحّل مسبقاً — تم تجاهل التكرار (idempotent guard)" });
          continue;
        }

        const modeRes2 = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'returns_mode' LIMIT 1`);
        const returnsMode2: string = ((modeRes2 as any).rows?.[0] as any)?.value ?? "reverse_original";
        const forceReverse2 = returnsMode2 !== "separate_accounts";

        let receivablesAccountId: string | null = null;
        if (forceReverse2) {
          const siM = await this.getMappingsForTransaction("sales_invoice", null, null);
          receivablesAccountId = siM.find(m => m.lineType === "receivables")?.debitAccountId || null;
        } else {
          const retM = await this.getMappingsForTransaction("sales_return", null, null);
          receivablesAccountId = retM.find(m => m.lineType === "receivables")?.creditAccountId || null;
        }

        const existingLines = await db.select().from(journalLines)
          .where(eq(journalLines.journalEntryId, existingEntry.id));

        let swapped = false;
        for (const jl of existingLines) {
          const isReceivablesLine =
            (receivablesAccountId && jl.accountId === receivablesAccountId) ||
            (jl.description?.includes("في انتظار صرف المرتجع"));

          if (isReceivablesLine && parseFloat(jl.credit || "0") > 0) {
            await db.update(journalLines).set({
              accountId:   cashAccountId!,
              description: "خزنة — تم صرف المرتجع",
            }).where(eq(journalLines.id, jl.id));
            swapped = true;
            break;
          }
        }

        if (!swapped) {
          await updateAcctEvent(eventId, "blocked", {
            errorMessage: "لم يُعثر على سطر المدينون في قيد المرحلة الأولى — القيد لن يُرحَّل",
          });
          continue;
        }

        const [bal] = await db.select({
          dr: sql<string>`COALESCE(SUM(debit::numeric),0)::text`,
          cr: sql<string>`COALESCE(SUM(credit::numeric),0)::text`,
        }).from(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));

        const drTot = parseFloat(bal?.dr ?? "0");
        const crTot = parseFloat(bal?.cr ?? "0");
        if (Math.abs(drTot - crTot) > 0.01) {
          throw new Error(`[GUARD] قيد المرتجع ${existingEntry.reference} غير متوازن: مدين=${drTot} ≠ دائن=${crTot}`);
        }

        await db.update(journalEntries).set({
          status:      "posted",
          description: `${existingEntry.description?.replace("بانتظار الصرف", "")} (تم صرف المرتجع)`,
          totalDebit:  String(drTot.toFixed(2)),
          totalCredit: String(crTot.toFixed(2)),
        }).where(and(
          eq(journalEntries.id, existingEntry.id),
          eq(journalEntries.status, "draft"),
        ));

        await updateAcctEvent(eventId, "completed", { journalEntryId: existingEntry.id });
        logger.info({ invoiceId, entryId: existingEntry.id },
          "[SALES_RETURN] Phase-2 journal posted ✓");

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ invoiceId, err: msg }, "[SALES_RETURN] completeSalesReturnWithCash: per-invoice failure");
        if (eventId) await updateAcctEvent(eventId, "failed", { errorMessage: msg });
      }
    }
  },
};

export default salesReturnCashMethods;
