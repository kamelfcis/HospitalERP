import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import { logAcctEvent, updateAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import {
  salesInvoiceHeaders,
  journalEntries,
  journalLines,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { getCollectibleAmount } from "../lib/cashier-collection-amount";

const salesJournalCashierMethods = {
  async completeSalesJournalsWithCash(
    this: DatabaseStorage,
    invoiceIds: string[], cashGlAccountId: string | null, _pharmacyId: string
  ): Promise<void> {
    let cashAccountId = cashGlAccountId;
    if (!cashAccountId) {
      const cashMappings = await this.getMappingsForTransaction("cashier_collection", null);
      const cashMapping = cashMappings.find(m => m.lineType === "cash");
      if (cashMapping?.debitAccountId) {
        cashAccountId = cashMapping.debitAccountId;
      }
    }
    if (!cashAccountId) {
      logger.error("[completeSalesJournalsWithCash] no cash GL account found — logging blocked events");
      for (const invoiceId of invoiceIds) {
        await logAcctEvent({
          sourceType:   "cashier_collection",
          sourceId:     invoiceId,
          eventType:    "cashier_collection_complete",
          status:       "blocked",
          errorMessage: "لا يوجد حساب خزنة نقدية مُعرَّف — يرجى إضافة ربط الحسابات (cashier_collection / cash)",
        });
      }
      return;
    }

    for (const invoiceId of invoiceIds) {
      const eventId = await logAcctEvent({
        sourceType: "cashier_collection",
        sourceId:   invoiceId,
        eventType:  "cashier_collection_complete",
        status:     "pending",
      });

      try {
        const [invoice] = await db.select({
          warehouseId: salesInvoiceHeaders.warehouseId,
          pharmacyId: salesInvoiceHeaders.pharmacyId,
          isReturn: salesInvoiceHeaders.isReturn,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        const invoiceReceivableIds = new Set<string>();
        const mappings = await this.getMappingsForTransaction("sales_invoice", invoice?.warehouseId ?? null, invoice?.pharmacyId ?? null);
        for (const m of mappings) {
          if (m.lineType === "receivables" && m.debitAccountId) {
            invoiceReceivableIds.add(m.debitAccountId);
          }
        }

        if (invoiceReceivableIds.size === 0) {
          if (eventId) await updateAcctEvent(eventId, "completed", { errorMessage: "لا توجد أرصدة مدينة (receivables) في خريطة الحسابات — لا يلزم إكمال" });
          continue;
        }

        const [existingEntry] = await db.select().from(journalEntries)
          .where(and(
            eq(journalEntries.sourceType, "sales_invoice"),
            eq(journalEntries.sourceDocumentId, invoiceId)
          ));

        if (!existingEntry) {
          if (eventId) await updateAcctEvent(eventId, "blocked", { errorMessage: "لا يوجد قيد مرتبط بالفاتورة — journal_status=failed سابق؟" });
          continue;
        }
        if (existingEntry.status === "posted") {
          if (eventId) await updateAcctEvent(eventId, "completed", { journalEntryId: existingEntry.id });
          continue;
        }

        const existingLines = await db.select().from(journalLines)
          .where(eq(journalLines.journalEntryId, existingEntry.id))
          .orderBy(asc(journalLines.lineNumber));

        const receivablesLine = existingLines.find(l =>
          invoiceReceivableIds.has(l.accountId) &&
          (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0)
        );

        if (receivablesLine) {
          const isReturn = invoice?.isReturn || false;
          const desc = isReturn ? "نقدية مرتجع - تم الصرف" : "نقدية مبيعات - تم التحصيل";
          const entryDesc = isReturn ? "(تم صرف المرتجع)" : "(تم التحصيل)";

          await db.update(journalLines).set({
            accountId: cashAccountId,
            description: desc,
          }).where(eq(journalLines.id, receivablesLine.id));

          await db.update(journalEntries).set({
            description: `${existingEntry.description} ${entryDesc}`,
            status: "posted",
          }).where(eq(journalEntries.id, existingEntry.id));
        }

        if (eventId) await updateAcctEvent(eventId, "completed", { journalEntryId: existingEntry.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ invoiceId, err: msg }, "[completeSalesJournalsWithCash] per-invoice completion failed");
        if (eventId) {
          await updateAcctEvent(eventId, "failed", { errorMessage: msg });
        } else {
          await logAcctEvent({
            sourceType:   "cashier_collection",
            sourceId:     invoiceId,
            eventType:    "cashier_collection_complete",
            status:       "failed",
            errorMessage: msg,
          });
        }
      }
    }
  },

  async createCashierCollectionJournals(
    this: DatabaseStorage,
    invoiceIds: string[],
    cashGlAccountOverride: string | null,
    pharmacyId: string,
  ): Promise<void> {
    const ccMappings = await this.getMappingsForTransaction("cashier_collection", null);
    const cashMapping = ccMappings.find(m => m.lineType === "cash");

    const effectiveDebitId  = cashGlAccountOverride || cashMapping?.debitAccountId || null;
    const effectiveCreditId = cashMapping?.creditAccountId || null;
    const hasPhase4Path     = !!(effectiveDebitId && effectiveCreditId);

    if (!hasPhase4Path) {
      const legacyMsg = "استُخدم المسار القديم (legacy): لا يوجد حساب خزنة للوردية ولا ربط cashier_collection/cash مكتمل — " +
        "عرِّف creditAccountId في /account-mappings أو تأكد أن الوردية مرتبطة بحساب GL";
      logger.warn("[CASHIER_COLLECTION] " + legacyMsg);
      for (const invoiceId of invoiceIds) {
        await logAcctEvent({
          sourceType:   "cashier_collection",
          sourceId:     invoiceId,
          eventType:    "cashier_collection_journal",
          status:       "needs_retry",
          errorMessage: legacyMsg,
        });
      }
      return this.completeSalesJournalsWithCash(invoiceIds, cashGlAccountOverride, pharmacyId);
    }

    if (cashGlAccountOverride) {
      logger.info({ cashGlAccountOverride }, "[CASHIER_COLLECTION] Using shift treasury GL for debit (dynamic)");
    } else {
      logger.warn({ debitFromMapping: cashMapping?.debitAccountId }, "[CASHIER_COLLECTION] Shift has no GL account — using static mapping debit (fallback)");
    }

    for (const invoiceId of invoiceIds) {
      const eventId = await logAcctEvent({
        sourceType: "cashier_collection",
        sourceId:   invoiceId,
        eventType:  "cashier_collection_journal",
        status:     "pending",
      });

      try {
        const [invoice] = await db.select({
          netTotal:         salesInvoiceHeaders.netTotal,
          patientShareTotal: salesInvoiceHeaders.patientShareTotal,
          customerType:     salesInvoiceHeaders.customerType,
          invoiceNumber:    salesInvoiceHeaders.invoiceNumber,
          invoiceDate:      salesInvoiceHeaders.invoiceDate,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        if (!invoice) {
          if (eventId) await updateAcctEvent(eventId, "blocked", { errorMessage: "الفاتورة غير موجودة في قاعدة البيانات" });
          continue;
        }

        const collectible = getCollectibleAmount(invoice);
        if (collectible <= 0) {
          if (eventId) await updateAcctEvent(eventId, "completed", { errorMessage: "المبلغ صفر — لا يلزم قيد تحصيل" });
          continue;
        }

        const entry = await this.generateJournalEntry({
          sourceType:       "cashier_collection",
          sourceDocumentId: invoiceId,
          reference:        `COL-${invoice.invoiceNumber}`,
          description:      `قيد تحصيل فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
          entryDate:        invoice.invoiceDate,
          lines:            [{ lineType: "cash", amount: collectible.toFixed(2) }],
          dynamicAccountOverrides: {
            cash: { debitAccountId: effectiveDebitId },
          },
        });

        await db.update(journalEntries)
          .set({ status: "posted" })
          .where(and(
            eq(journalEntries.sourceType, "sales_invoice"),
            eq(journalEntries.sourceDocumentId, invoiceId),
            eq(journalEntries.status, "draft"),
          ));

        if (entry) {
          const lineCount = entry ? 1 : 0;
          const drTotal = collectible;
          const crTotal = collectible;

          await db.update(journalEntries)
            .set({ status: "posted" })
            .where(and(
              eq(journalEntries.id, entry.id),
              eq(journalEntries.status, "draft"),
            ));

          logger.info(
            { entryId: entry.id, ref: entry.reference, dr: drTotal, cr: crTotal, lines: lineCount },
            "[CASHIER_COLLECTION] journal posted ✓"
          );
        }

        const fallbackNote = !cashGlAccountOverride
          ? `[تحذير] لم يُعيَّن حساب GL للوردية — تم استخدام حساب الخزنة الاحتياطي (${effectiveDebitId}) من الربط الثابت بدلاً من خزنة الوردية الفعلية`
          : null;

        if (eventId) {
          if (entry) {
            await updateAcctEvent(eventId, "completed", {
              journalEntryId: entry.id,
              errorMessage:   fallbackNote,
            });
          } else {
            const [existing] = await db.select({ id: journalEntries.id })
              .from(journalEntries)
              .where(and(
                eq(journalEntries.sourceType, "cashier_collection"),
                eq(journalEntries.sourceDocumentId, invoiceId)
              ));
            await updateAcctEvent(eventId, "completed", {
              journalEntryId: existing?.id ?? null,
              errorMessage:   existing
                ? (fallbackNote ?? "القيد موجود مسبقاً (idempotent — لا حاجة لإعادة الإنشاء)")
                : "تم تجاوز إنشاء القيد — تحقق من إعدادات الربط المحاسبي",
            });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ invoiceId, err: msg }, "[CASHIER_COLLECTION] createCashierCollectionJournals: per-invoice failure");

        try {
          await db.update(journalEntries)
            .set({ status: "failed" })
            .where(and(
              eq(journalEntries.sourceType, "cashier_collection"),
              eq(journalEntries.sourceDocumentId, invoiceId),
              eq(journalEntries.status, "draft"),
            ));
        } catch (_markErr) {
        }

        if (eventId) {
          await updateAcctEvent(eventId, "failed", { errorMessage: msg });
        } else {
          await logAcctEvent({
            sourceType:   "cashier_collection",
            sourceId:     invoiceId,
            eventType:    "cashier_collection_journal",
            status:       "failed",
            errorMessage: msg,
          });
        }
      }
    }
  },
};

export default salesJournalCashierMethods;
