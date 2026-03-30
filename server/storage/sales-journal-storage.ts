import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and, sql, asc, gte, lte, inArray } from "drizzle-orm";
import { logAcctEvent, updateAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import {
  items,
  warehouses,
  salesInvoiceHeaders,
  salesInvoiceLines,
  inventoryLots,
  inventoryLotMovements,
  journalEntries,
  journalLines,
  fiscalPeriods,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
  InsertSalesInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

const methods = {
  async regenerateJournalForInvoice(this: DatabaseStorage, invoiceId: string): Promise<JournalEntry | null> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!invoice || !["finalized", "collected"].includes(invoice.status)) return null;

    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId));
    let cogsDrugs = 0, cogsSupplies = 0, revenueDrugs = 0, revenueSupplies = 0;

    if (lines.length > 0) {
      const uniqueItemIds = Array.from(new Set(lines.map(l => l.itemId).filter((id): id is string => !!id)));
      const allItems = uniqueItemIds.length > 0
        ? await db.select().from(items).where(inArray(items.id, uniqueItemIds))
        : [];
      const itemMap = new Map(allItems.map(i => [i.id, i]));

      const allMovements = await db.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, "sales_invoice"),
          eq(inventoryLotMovements.referenceId, invoiceId)
        ));

      const uniqueLotIds = Array.from(new Set(allMovements.map(m => m.lotId).filter((id): id is string => !!id)));
      const allLots = uniqueLotIds.length > 0
        ? await db.select().from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
        : [];
      const lotMap = new Map(allLots.map(l => [l.id, l]));

      for (const line of lines) {
        const item = itemMap.get(line.itemId!);
        if (!item) continue;
        const lineRevenue = parseFloat(line.lineTotal);
        if (item.category === "service") {
          revenueDrugs += lineRevenue;
          continue;
        }

        let lineCost = 0;
        for (const mov of allMovements) {
          const lot = lotMap.get(mov.lotId);
          if (lot && lot.itemId === line.itemId) {
            lineCost += Math.abs(parseFloat(mov.qtyChangeInMinor || "0")) * parseFloat(mov.unitCost || "0");
          }
        }

        if (item.category === "drug") {
          cogsDrugs += lineCost;
          revenueDrugs += lineRevenue;
        } else if (item.category === "supply") {
          cogsSupplies += lineCost;
          revenueSupplies += lineRevenue;
        } else {
          cogsDrugs += lineCost;
          revenueDrugs += lineRevenue;
        }
      }
    }

    try {
      const entry = await this.generateSalesInvoiceJournal(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
      if (entry) {
        await db.update(salesInvoiceHeaders).set({
          journalStatus: "posted",
          journalError: null,
          journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
        }).where(eq(salesInvoiceHeaders.id, invoiceId));
      }
      return entry;
    } catch (err: unknown) {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "failed",
        journalError: err instanceof Error ? err.message : String(err),
        journalRetries: sql`COALESCE(journal_retries, 0) + 1`,
      }).where(eq(salesInvoiceHeaders.id, invoiceId));
      throw err;
    }
  },

  /*
   * syncInvoiceHeaderJournalStatus — centralised header↔journal_entries sync
   * ─────────────────────────────────────────────────────────────────────────
   * Derives the header `journal_status` from the ACTUAL `journal_entries.status`
   * so the two never diverge.  Call this anywhere you need to be sure the header
   * reflects ground truth.
   *
   * Mapping:
   *   journal_entries.status = 'posted'           → header = 'posted'
   *   journal_entries.status = 'draft' | 'failed' → header unchanged (collection will post)
   *   no journal_entries row at all               → header = 'failed' (if header was 'posted')
   *
   * Returns the resolved actual status ('posted' | 'draft' | 'failed' | 'missing').
   */
  async syncInvoiceHeaderJournalStatus(this: DatabaseStorage, invoiceId: string): Promise<string> {
    const [entry] = await db.select({
      status: journalEntries.status,
    }).from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ))
      .limit(1);

    const actualStatus = entry?.status ?? "missing";

    if (actualStatus === "posted") {
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "posted",
        journalError: null,
      }).where(and(
        eq(salesInvoiceHeaders.id, invoiceId),
        sql`journal_status != 'posted'`
      ));
    } else if (actualStatus === "missing") {
      // If header claims posted but no entry exists, correct to failed
      await db.update(salesInvoiceHeaders).set({
        journalStatus: "failed",
        journalError: "قيد مالي مفقود — أعد توليد القيد من شاشة أحداث المحاسبة",
      }).where(and(
        eq(salesInvoiceHeaders.id, invoiceId),
        eq(salesInvoiceHeaders.journalStatus, "posted")
      ));
    }
    return actualStatus;
  },

  async retryFailedJournals(this: DatabaseStorage): Promise<{ attempted: number, succeeded: number, failed: number }> {
    const failedInvoices = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      journalRetries: salesInvoiceHeaders.journalRetries,
    }).from(salesInvoiceHeaders)
      .where(and(
        eq(salesInvoiceHeaders.status, "finalized"),
        eq(salesInvoiceHeaders.journalStatus, "failed")
      ))
      .limit(20);

    let succeeded = 0, failed = 0;

    for (const inv of failedInvoices) {
      try {
        const entry = await this.regenerateJournalForInvoice(inv.id);
        if (entry) {
          succeeded++;
          console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal posted successfully (attempt ${(inv.journalRetries || 0) + 1})`);
        } else {
          const existing = await db.select().from(journalEntries)
            .where(and(
              eq(journalEntries.sourceType, "sales_invoice"),
              eq(journalEntries.sourceDocumentId, inv.id)
            )).limit(1);
          if (existing.length > 0 && existing[0].status === "posted") {
            // STRUCTURAL GUARD: only sync header to 'posted' if actual journal entry is posted
            await db.update(salesInvoiceHeaders).set({
              journalStatus: "posted",
              journalError: null,
            }).where(eq(salesInvoiceHeaders.id, inv.id));
            succeeded++;
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal already posted, header synced`);
          } else if (existing.length > 0) {
            // Entry exists but not yet posted (still draft) — do not change header, collection will post it
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal exists but status=${existing[0].status}, skipping header update`);
          } else {
            failed++;
            console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - could not generate journal (null result)`);
          }
        }
      } catch (err: unknown) {
        failed++;
        console.error(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - still failing: ${(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err))}`);
      }
    }

    return { attempted: failedInvoices.length, succeeded, failed };
  },

  /**
   * buildSalesJournalLines — بنّاء سطور القيد المحاسبي لفاتورة مبيعات (معيار IFRS)
   *
   * المسار الإنتاجي: generateSalesInvoiceJournalInTx → buildSalesJournalLines → insertJournalEntry
   *
   * هيكل القيد الناتج (مدين / دائن):
   * ┌─────────────────────────────────────────────────────────────────┐
   * │  مدين   │ المدينون (receivables)         = صافي الفاتورة        │
   * │  مدين   │ خصم مسموح (discount_allowed)   = قيمة الخصم (إن وجد) │
   * │  مدين   │ تكلفة أدوية (cogs_drugs)       = FIFO cost أدوية     │
   * │  مدين   │ تكلفة مستلزمات (cogs_supplies) = FIFO cost مستلزمات  │
   * ├─────────────────────────────────────────────────────────────────┤
   * │  دائن   │ إيراد أدوية (revenue_drugs)    = إيراد أدوية          │
   * │  دائن   │ إيراد مستلزمات (revenue_*)     = إيراد مستلزمات       │
   * │  دائن   │ مخزون (inventory/warehouseGL)  = إجمالي تكلفة البضاعة│
   * └─────────────────────────────────────────────────────────────────┘
   *
   * ملاحظات:
   * - إذا وُجد قيد سابق لنفس invoiceId: تُرجع null (idempotent)
   * - الدالة لا تُدرج القيد — تُرجع السطور فقط لـ insertJournalEntry
   * - queryCtx: يقبل db (خارج transaction) أو DrizzleTransaction (داخل transaction)
   * - إذا لم يُعيَّن حساب إيرادات: السطر يُحذف (تحذير في checkJournalReadiness)
   * - throws: إذا لم يُعيَّن حساب المدينون — هذا الخطأ الوحيد الذي يوقف التنفيذ
   */
  async buildSalesJournalLines(
    this: DatabaseStorage,
    invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number,
    queryCtx: typeof db | DrizzleTransaction = db
  ): Promise<{ journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number } | null> {
    const existingEntries = await queryCtx.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return null;

    const mappings = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId, invoice.pharmacyId);
    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const discountValue = parseFloat(invoice.discountValue || "0");
    const netTotal = parseFloat(invoice.netTotal || "0");

    const receivablesMapping = mappingMap.get("receivables");
    let debitAccountId: string | null = receivablesMapping?.debitAccountId || null;

    if (!debitAccountId) {
      throw new Error("لم يتم تعيين حساب المدينون (receivables) في ربط حسابات فواتير المبيعات");
    }

    let inventoryAccountId: string | null = null;
    if (invoice.warehouseId) {
      const [wh] = await queryCtx.select().from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      if (wh?.glAccountId) {
        inventoryAccountId = wh.glAccountId;
      }
    }
    if (!inventoryAccountId) {
      const invMapping = mappingMap.get("inventory");
      if (invMapping?.creditAccountId) {
        inventoryAccountId = invMapping.creditAccountId;
      }
    }

    const journalLineData: InsertJournalLine[] = [];
    let lineNum = 1;

    if (debitAccountId && netTotal > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: debitAccountId,
        debit: String(netTotal.toFixed(2)),
        credit: "0",
        description: "مدينون - في انتظار التحصيل",
      });
    }

    const discountMapping = mappingMap.get("discount_allowed");
    if (discountMapping?.debitAccountId && discountValue > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: discountMapping.debitAccountId,
        debit: String(discountValue.toFixed(2)),
        credit: "0",
        description: "خصم مسموح به",
      });
    }

    const totalCogs = cogsDrugs + cogsSupplies;
    const hasInventoryAccount = !!inventoryAccountId;

    // C-FIX: Durable audit entry when COGS/inventory lines are skipped.
    // The journal will still be BALANCED (receivables Dr = revenue Cr) and POSTED
    // successfully, but without COGS entries. This event makes the omission visible
    // in the Accounting Events UI so it is auditable and not a silent gap.
    if (!hasInventoryAccount && totalCogs > 0.001) {
      await logAcctEvent({
        sourceType:   "sales_invoice",
        sourceId:     invoiceId,
        eventType:    "sales_invoice_cogs_skipped",
        status:       "completed",
        errorMessage: `[تحذير] تم إهمال سطور تكلفة البضاعة (${totalCogs.toFixed(2)} ج.م) — لم يُعيَّن حساب GL للمخزن/الصيدلية ولا حساب مخزون احتياطي في ربط الحسابات. القيد سيُنشأ متوازناً (مدينون = إيرادات) لكن بدون قيود التكلفة. أضف حساب GL للمخزن في إعدادات المستودع أو أضف ربط "مخزون" في /account-mappings لتفعيل قيود التكلفة.`,
      });
    }

    if (hasInventoryAccount) {
      const cogsDrugsMapping = mappingMap.get("cogs_drugs");
      if (cogsDrugsMapping?.debitAccountId && cogsDrugs > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsDrugs.toFixed(2)),
          credit: "0",
          description: "تكلفة أدوية مباعة",
        });
      }

      const cogsSuppliesMapping = mappingMap.get("cogs_supplies");
      const cogsGeneralMapping = mappingMap.get("cogs");
      if (cogsSuppliesMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsSuppliesMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsGeneralMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsGeneralMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsDrugsMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      }
    }

    const revenueDrugsMapping = mappingMap.get("revenue_drugs");
    const revenueSuppliesMapping = mappingMap.get("revenue_consumables");
    const revenueGeneralMapping = mappingMap.get("revenue_general");

    if (revenueDrugsMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    }

    if (revenueSuppliesMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueSuppliesMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueDrugsMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    }

    // VAT: ضريبة القيمة المضافة غير مفعّلة حالياً — الربط محجوز للاستخدام المستقبلي

    if (hasInventoryAccount && totalCogs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: inventoryAccountId!,
        debit: "0",
        credit: String(totalCogs.toFixed(2)),
        description: "مخزون مباع",
      });
    }

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      throw new Error(`القيد غير متوازن: مدين=${totalDebits.toFixed(2)} دائن=${totalCredits.toFixed(2)}`);
    }

    return { journalLineData, totalDebits, totalCredits };
  },

  async insertJournalEntry(
    this: DatabaseStorage,
    tx: DrizzleTransaction, invoiceId: string, invoice: SalesInvoiceHeader,
    journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number
  ): Promise<JournalEntry> {
    const [period] = await tx.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, invoice.invoiceDate),
        gte(fiscalPeriods.endDate, invoice.invoiceDate),
        eq(fiscalPeriods.isClosed, false)
      ))
      .limit(1);

    const entryNumber = await this.getNextEntryNumber();

    // فواتير التوصيل المنزلي: القيد يُرسَل فوراً (posted) لأن الذمم تثبت عند الإنشاء
    // أما فواتير الكاشير العادية: تبدأ مسودة وتُرسَل عند تحصيل الكاشير
    const initialStatus = invoice.customerType === "delivery" ? "posted" : "draft";

    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: invoice.invoiceDate,
      reference: `SI-${invoice.invoiceNumber}`,
      description: `قيد فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
      status: initialStatus,
      periodId: period?.id || null,
      sourceType: "sales_invoice",
      sourceDocumentId: invoiceId,
      totalDebit: String(totalDebits.toFixed(2)),
      totalCredit: String(totalCredits.toFixed(2)),
    }).returning();

    const linesWithEntryId = journalLineData.map((l, idx) => ({
      ...l,
      journalEntryId: entry.id,
      lineNumber: idx + 1,
    }));

    await tx.insert(journalLines).values(linesWithEntryId);
    return entry;
  },

  async generateSalesInvoiceJournalInTx(
    this: DatabaseStorage,
    tx: DrizzleTransaction, invoiceId: string, invoice: SalesInvoiceHeader,
    cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournalInTx for invoice ${invoiceId}`);
    const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
    if (!result) return null;
    return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
  },

  async generateSalesInvoiceJournal(
    this: DatabaseStorage,
    invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournal for invoice ${invoiceId}`);
    return db.transaction(async (tx) => {
      // قفل الفاتورة أولاً لمنع استدعاءين متزامنين ينشئان قيدين مكررين
      await tx.execute(sql`SELECT id FROM sales_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`);
      // الفحص والإنشاء داخل نفس الـ transaction — لا يمكن لـ call آخر أن يمر الفحص في نفس الوقت
      const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
      if (!result) return null;
      return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
    });
  },

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

  /**
   * createCashierCollectionJournals — المسار الجديد (Phase 4)
   *
   * يُنشئ قيداً محاسبياً مستقلاً لكل عملية تحصيل كاشير، بدلاً من تعديل القيد الأصلي.
   *
   * هيكل القيد الناتج:
   * ┌─────────────────────────────────────────────────────────────────┐
   * │  مدين   │ الخزنة / النقدية (cash.debitAccountId)               │
   * │  دائن   │ مقاصة المدينين  (cash.creditAccountId)               │
   * └─────────────────────────────────────────────────────────────────┘
   *
   * الشرط:
   * - يجب أن يكون cashier_collection / cash مُعرَّفاً بحسابَي مدين ودائن في account_mappings
   * - إذا لم يُعرَّف الربط: يتراجع إلى completeSalesJournalsWithCash (التوافق مع الإصدارات القديمة)
   *
   * الضمانات:
   * - idempotent: لا يُنشئ قيدين لنفس الفاتورة (generateJournalEntry يفحص مسبقاً)
   * - القيد الأصلي (sales_invoice) لا يُلمَس أبداً
   * - يُسجِّل كل عملية في accounting_event_log بـ event_type = "cashier_collection_journal"
   */
  async createCashierCollectionJournals(
    this: DatabaseStorage,
    invoiceIds: string[],
    cashGlAccountOverride: string | null,
    pharmacyId: string,
  ): Promise<void> {
    const ccMappings = await this.getMappingsForTransaction("cashier_collection", null);
    const cashMapping = ccMappings.find(m => m.lineType === "cash");

    // ── Dynamic account resolution (Phase 4+) ─────────────────────────────────
    // Debit  = shift's actual treasury GL account (dynamic — different per cashier)
    //          falls back to cashMapping.debitAccountId (static config) if shift has no GL
    // Credit = mapped receivable_clear / cashMapping.creditAccountId (always static)
    //
    // Activation rule (much more permissive than old "hasFullMapping"):
    //   - We need a credit account from the mapping AND
    //   - at least one debit source: shift GL or static mapping debit
    const effectiveDebitId  = cashGlAccountOverride || cashMapping?.debitAccountId || null;
    const effectiveCreditId = cashMapping?.creditAccountId || null;
    const hasPhase4Path     = !!(effectiveDebitId && effectiveCreditId);

    if (!hasPhase4Path) {
      // Neither shift GL nor static mapping provides a full Dr+Cr pair — fall back to legacy path
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

    // Log which debit source is being used (useful for audit visibility)
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
          netTotal:      salesInvoiceHeaders.netTotal,
          invoiceNumber: salesInvoiceHeaders.invoiceNumber,
          invoiceDate:   salesInvoiceHeaders.invoiceDate,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        if (!invoice) {
          if (eventId) await updateAcctEvent(eventId, "blocked", { errorMessage: "الفاتورة غير موجودة في قاعدة البيانات" });
          continue;
        }

        const netTotal = parseFloat(invoice.netTotal || "0");
        if (netTotal <= 0) {
          if (eventId) await updateAcctEvent(eventId, "completed", { errorMessage: "المبلغ صفر — لا يلزم قيد تحصيل" });
          continue;
        }

        const entry = await this.generateJournalEntry({
          sourceType:       "cashier_collection",
          sourceDocumentId: invoiceId,
          reference:        `COL-${invoice.invoiceNumber}`,
          description:      `قيد تحصيل فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
          entryDate:        invoice.invoiceDate,
          lines:            [{ lineType: "cash", amount: String(netTotal.toFixed(2)) }],
          // ─── Dynamic resolution: inject shift treasury as debit override ────
          // This ensures each cashier's own GL account is debited, not a generic
          // static treasury account. The credit side (receivable clearing) still
          // comes from the static mapping (cashMapping.creditAccountId).
          dynamicAccountOverrides: {
            cash: { debitAccountId: effectiveDebitId },
          },
        });

        // A-FIX: Resolve status inconsistency.
        // invoice.journal_status = "posted" (set at finalize = "journal was created").
        // journal_entries.status on the sales journal was "draft" because the old path
        // mutated it later. Now that Phase 4 creates a separate collection journal,
        // post the sales journal here so both statuses say "posted" with consistent meaning.
        await db.update(journalEntries)
          .set({ status: "posted" })
          .where(and(
            eq(journalEntries.sourceType, "sales_invoice"),
            eq(journalEntries.sourceDocumentId, invoiceId),
            eq(journalEntries.status, "draft"),
          ));

        // C-FIX + HARDENING: Post the cashier_collection journal with full guards.
        //
        // Safeguards applied here (per hardening spec A-D):
        //   A) Pre-post balance verification — query stored lines from DB and
        //      assert debit == credit before touching status. Throws on violation.
        //   B) DB-level dedup index (idx_je_cashier_collection_dedup) enforces at
        //      the postgres layer; app-level check in generateJournalEntry is the
        //      first guard; this ensures no race-condition duplicates slip through.
        //   C) Safe posting — WHERE status='draft' prevents double-posting.
        //      If already 'posted': resolved immediately (idempotent). If 'failed':
        //      error is thrown so the outer catch can re-log it.
        //   D) On any failure in this block the outer try/catch marks the audit
        //      event 'failed' and, if the journal exists but is still draft,
        //      marks it 'failed' in the DB so it is visible to operators.
        if (entry) {
          const currentStatus = entry.status;

          if (currentStatus === "posted") {
            // Already posted (idempotent re-run) — nothing to do
            logger.info({ entryId: entry.id }, "[CASHIER_COLLECTION] journal already posted, skipping");
          } else if (currentStatus !== "draft") {
            throw new Error(`[GUARD-C] قيد التحصيل ${entry.reference} في حالة غير متوقعة: "${currentStatus}" — رُفض الترحيل`);
          } else {
            // GUARD A: Verify stored lines are balanced before posting
            const [lineBalance] = await db
              .select({
                lineCount:   sql<number>`COUNT(*)::int`,
                totalDebit:  sql<string>`COALESCE(SUM(debit::numeric), 0)::text`,
                totalCredit: sql<string>`COALESCE(SUM(credit::numeric), 0)::text`,
              })
              .from(journalLines)
              .where(eq(journalLines.journalEntryId, entry.id));

            const lineCount = Number(lineBalance?.lineCount ?? 0);
            const drTotal   = parseFloat(lineBalance?.totalDebit  ?? "0");
            const crTotal   = parseFloat(lineBalance?.totalCredit ?? "0");

            if (lineCount === 0) {
              throw new Error(`[GUARD-A] قيد التحصيل ${entry.reference} لا يحتوي على سطور — رُفض الترحيل`);
            }
            if (Math.abs(drTotal - crTotal) > 0.01) {
              throw new Error(
                `[GUARD-A] قيد التحصيل ${entry.reference} غير متوازن: ` +
                `مدين=${drTotal.toFixed(2)} ≠ دائن=${crTotal.toFixed(2)} — رُفض الترحيل`
              );
            }

            // GUARD C: Post only if still draft
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
        }

        // B-FIX: Durable traceability when static fallback debit is used.
        // When the cashier shift has no GL account, the static mapping debitAccountId
        // is used instead of the real shift treasury. This is noted durably in every
        // completed event so it is visible in the Accounting Events UI.
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

        // GUARD D: Mark the journal entry itself as 'failed' in the DB so it is
        // clearly visible to operators in the journal entries screen, not silently
        // left as 'draft'. Only touches draft entries — never overwrites a posted one.
        try {
          await db.update(journalEntries)
            .set({ status: "failed" })
            .where(and(
              eq(journalEntries.sourceType, "cashier_collection"),
              eq(journalEntries.sourceDocumentId, invoiceId),
              eq(journalEntries.status, "draft"),
            ));
        } catch (_markErr) {
          // Best-effort — do not shadow the original error
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

  // ═══════════════════════════════════════════════════════════════════════════
  // مردودات المبيعات — قيد على مرحلتين
  //
  // م1 — generateSalesReturnJournal (عند إنشاء المرتجع):
  //   مدين: إيراد أدوية / مستلزمات    ← عكس الإيراد
  //   مدين: مخزون (GL المخزن)          ← رجوع البضاعة
  //   دائن: مدينون (وسيط)              ← يُستبدل بالخزنة في م2
  //   دائن: تكلفة أدوية / مستلزمات    ← عكس التكلفة
  //
  // م2 — completeSalesReturnWithCash (عند صرف الكاشير):
  //   يُستبدل "مدينون دائن" → "خزنة دائن" ← فلوس خارجة من الخزنة
  // ═══════════════════════════════════════════════════════════════════════════

  async generateSalesReturnJournal(
    this: DatabaseStorage,
    returnId: string,
  ): Promise<void> {
    // ── الحماية من التكرار ─────────────────────────────────────────────────
    const existing = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_return"),
        eq(journalEntries.sourceDocumentId, returnId),
      ));
    if (existing.length > 0) {
      logger.info({ returnId }, "[SALES_RETURN] journal already exists — skipping");
      return;
    }

    // ── جلب بيانات فاتورة المرتجع ──────────────────────────────────────────
    const [header] = await db.select().from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.id, returnId));
    if (!header || !header.isReturn) {
      logger.warn({ returnId }, "[SALES_RETURN] header not found or not a return — skipping");
      return;
    }

    const lines = await db.select().from(salesInvoiceLines)
      .where(eq(salesInvoiceLines.invoiceId, returnId));
    if (lines.length === 0) {
      logger.warn({ returnId }, "[SALES_RETURN] no lines found — skipping");
      return;
    }

    // ── حساب التكلفة من سعر الشراء في الدُّفعات ───────────────────────────
    const uniqueItemIds = [...new Set(lines.map(l => l.itemId).filter((id): id is string => !!id))];
    const allItems = uniqueItemIds.length > 0
      ? await db.select().from(items).where(inArray(items.id, uniqueItemIds))
      : [];
    const itemMap = new Map(allItems.map(i => [i.id, i]));

    const uniqueLotIds = [...new Set(lines.map(l => l.lotId).filter((id): id is string => !!id))];
    const allLots = uniqueLotIds.length > 0
      ? await db.select().from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
      : [];
    const lotMap = new Map(allLots.map(l => [l.id, l]));

    let cogsDrugs    = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;

    for (const ln of lines) {
      const item   = itemMap.get(ln.itemId!);
      const lot    = ln.lotId ? lotMap.get(ln.lotId) : null;
      const lineRev = parseFloat(ln.lineTotal || "0");

      if (item?.category === "service") { revenueDrugs += lineRev; continue; }

      const unitCost = lot ? parseFloat(lot.purchasePrice || "0") : 0;
      const qtyMinor = Math.abs(parseFloat(ln.qtyInMinor || "0"));
      const lineCost = qtyMinor * unitCost;

      if (item?.category === "drug") {
        cogsDrugs    += lineCost;
        revenueDrugs += lineRev;
      } else if (item?.category === "supply") {
        cogsSupplies    += lineCost;
        revenueSupplies += lineRev;
      } else {
        cogsDrugs    += lineCost;
        revenueDrugs += lineRev;
      }
    }

    const netTotal    = parseFloat(header.netTotal || "0");
    const discountVal = parseFloat(header.discountValue?.toString() || "0");
    const totalCogs   = cogsDrugs + cogsSupplies;

    // ── قراءة returns_mode من الإعدادات ──────────────────────────────────────
    // reverse_original (الافتراضي): عكس القيد الأصلي على نفس حسابات sales_invoice
    // separate_accounts: استخدام ربط حسابات sales_return المستقلة
    const modeRes = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'returns_mode' LIMIT 1`);
    const returnsMode: string = ((modeRes as any).rows?.[0] as any)?.value ?? "reverse_original";
    const forceReverseOriginal = returnsMode !== "separate_accounts";

    // ── جلب ربط حسابات مردود المبيعات ────────────────────────────────────
    // في reverse_original: نستخدم دائماً sales_invoice مع عكس الأدوار (لا حسابات مردود منفصلة)
    // في separate_accounts: نحاول sales_return أولاً ثم نسقط على sales_invoice
    const retMappings = forceReverseOriginal
      ? []
      : await this.getMappingsForTransaction("sales_return", header.warehouseId, header.pharmacyId);
    const retMM = new Map(retMappings.map(m => [m.lineType, m]));

    // sales_invoice mappings: تُستخدم دائماً في reverse_original أو كـ fallback
    const siMappings = (forceReverseOriginal || retMappings.length === 0)
      ? await this.getMappingsForTransaction("sales_invoice", header.warehouseId, header.pharmacyId)
      : [];
    const siMM = new Map(siMappings.map(m => [m.lineType, m]));
    const useFallback = forceReverseOriginal || retMappings.length === 0;

    // حساب المدينين (دائن في المرتجع = مدين في البيع)
    const receivablesCreditId =
      retMM.get("receivables")?.creditAccountId ||
      (useFallback ? siMM.get("receivables")?.debitAccountId : null) ||
      null;

    // إيراد الأدوية (مدين في المرتجع = دائن في البيع)
    const revDrugsCreditId =
      retMM.get("revenue_drugs")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_drugs")?.creditAccountId : null) ||
      null;

    // إيراد المستلزمات والعام
    const revSuppliesDebitId =
      retMM.get("revenue_consumables")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_consumables")?.creditAccountId : null) ||
      null;
    const revGeneralDebitId =
      retMM.get("revenue_general")?.debitAccountId ||
      (useFallback ? siMM.get("revenue_general")?.creditAccountId : null) ||
      null;

    // COGS (دائن في المرتجع = مدين في البيع)
    const cogsDrugsDebitId =
      retMM.get("cogs_drugs")?.creditAccountId ||
      (useFallback ? siMM.get("cogs_drugs")?.debitAccountId : null) ||
      null;
    const cogsSuppliesDebitId =
      retMM.get("cogs_supplies")?.creditAccountId ||
      (useFallback ? siMM.get("cogs_supplies")?.debitAccountId : null) ||
      null;

    // حساب الخصم — دائن في المرتجع (عكس مدين الخصم في البيع الأصلي)
    const discountAllowedCreditId =
      retMM.get("discount_allowed")?.debitAccountId ||
      (useFallback ? siMM.get("discount_allowed")?.debitAccountId : null) ||
      null;

    if (!receivablesCreditId) {
      await logAcctEvent({
        sourceType: "sales_return", sourceId: returnId,
        eventType: "sales_return_journal_blocked",
        status: "blocked",
        errorMessage: "حساب المدينون (receivables) غير مُعرَّف في ربط حسابات فواتير المبيعات — يرجى الضبط من /account-mappings",
      });
      return;
    }

    // ── حساب مخزون (GL المخزن) ─────────────────────────────────────────────
    let inventoryAccountId: string | null = null;
    if (header.warehouseId) {
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, header.warehouseId));
      inventoryAccountId = wh?.glAccountId || null;
    }
    if (!inventoryAccountId) {
      const invM = (useFallback ? siMM : retMM).get("inventory");
      inventoryAccountId = invM?.debitAccountId || null;
    }

    // ── بناء سطور القيد ────────────────────────────────────────────────────
    const jLines: InsertJournalLine[] = [];
    let ln = 1;

    // مدين: إيراد أدوية (عكس)
    const effRevDrugsId = revDrugsCreditId || revGeneralDebitId;
    if (effRevDrugsId && revenueDrugs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effRevDrugsId,
        debit: revenueDrugs.toFixed(2), credit: "0", description: "عكس إيراد أدوية — مردود مبيعات" });
    }

    // مدين: إيراد مستلزمات (عكس)
    const effRevSuppId = revSuppliesDebitId || revGeneralDebitId || revDrugsCreditId;
    if (effRevSuppId && revenueSupplies > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effRevSuppId,
        debit: revenueSupplies.toFixed(2), credit: "0", description: "عكس إيراد مستلزمات — مردود مبيعات" });
    }

    // مدين: مخزون (رجوع البضاعة — GL المخزن)
    if (inventoryAccountId && totalCogs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: inventoryAccountId,
        debit: totalCogs.toFixed(2), credit: "0", description: "استعادة مخزون — مردود مبيعات" });
    }

    // دائن: مدينون (وسيط — يُستبدل بالخزنة عند الصرف)
    if (netTotal > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: receivablesCreditId,
        debit: "0", credit: netTotal.toFixed(2), description: "مدينون — في انتظار صرف المرتجع" });
    }

    // دائن: عكس خصم مسموح به (يوازن الفرق بين الإيراد والصافي)
    if (discountAllowedCreditId && discountVal > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: discountAllowedCreditId,
        debit: "0", credit: discountVal.toFixed(2), description: "عكس خصم مسموح به — مردود مبيعات" });
    }

    // دائن: تكلفة أدوية (عكس)
    const effCogsDrugsId = cogsDrugsDebitId;
    if (effCogsDrugsId && cogsDrugs > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effCogsDrugsId,
        debit: "0", credit: cogsDrugs.toFixed(2), description: "عكس تكلفة أدوية — مردود مبيعات" });
    }

    // دائن: تكلفة مستلزمات (عكس)
    const effCogsSupplId = cogsSuppliesDebitId || cogsDrugsDebitId;
    if (effCogsSupplId && cogsSupplies > 0.001) {
      jLines.push({ journalEntryId: "", lineNumber: ln++, accountId: effCogsSupplId,
        debit: "0", credit: cogsSupplies.toFixed(2), description: "عكس تكلفة مستلزمات — مردود مبيعات" });
    }

    if (jLines.length === 0) {
      logger.warn({ returnId }, "[SALES_RETURN] no journal lines built — check account mappings");
      return;
    }

    const totalDebits  = jLines.reduce((s, l) => s + parseFloat(l.debit  || "0"), 0);
    const totalCredits = jLines.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);

    // ── جلب الفترة المالية ─────────────────────────────────────────────────
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, header.invoiceDate),
        gte(fiscalPeriods.endDate,   header.invoiceDate),
        eq(fiscalPeriods.isClosed,   false),
      )).limit(1);

    const entryNumber = await this.getNextEntryNumber();

    const [entry] = await db.insert(journalEntries).values({
      entryNumber,
      entryDate:        header.invoiceDate,
      reference:        `RET-${header.invoiceNumber}`,
      description:      `قيد مردود مبيعات رقم ${header.invoiceNumber} (مرحلة 1 — بانتظار الصرف)`,
      status:           "draft",
      periodId:         period?.id || null,
      sourceType:       "sales_return",
      sourceDocumentId: returnId,
      totalDebit:       String(totalDebits.toFixed(2)),
      totalCredit:      String(totalCredits.toFixed(2)),
    }).returning();

    await db.insert(journalLines).values(
      jLines.map((l, i) => ({ ...l, journalEntryId: entry.id, lineNumber: i + 1 }))
    );

    await db.update(salesInvoiceHeaders)
      .set({ journalStatus: "posted" })
      .where(eq(salesInvoiceHeaders.id, returnId));

    await logAcctEvent({
      sourceType: "sales_return", sourceId: returnId,
      eventType:  "sales_return_journal_created",
      status:     "completed",
      journalEntryId: entry.id,
    });

    logger.info({ returnId, entryId: entry.id, dr: totalDebits, cr: totalCredits },
      "[SALES_RETURN] Phase-1 journal created ✓");
  },

  // ── م2: صرف الكاشير — استبدال المدينون دائن بالخزنة ─────────────────────
  async completeSalesReturnWithCash(
    this: DatabaseStorage,
    invoiceIds: string[],
    cashGlAccountId: string | null,
  ): Promise<void> {
    // جلب حساب الخزنة (من الوردية أو من الربط)
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
        // جلب معلومات الفاتورة
        const [inv] = await db.select({
          invoiceNumber: salesInvoiceHeaders.invoiceNumber,
          isReturn:      salesInvoiceHeaders.isReturn,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        if (!inv?.isReturn) {
          await updateAcctEvent(eventId, "blocked", { errorMessage: "الفاتورة ليست مرتجعاً" });
          continue;
        }

        // جلب القيد المرحلة الأولى
        const [existingEntry] = await db.select().from(journalEntries)
          .where(and(
            eq(journalEntries.sourceType, "sales_return"),
            eq(journalEntries.sourceDocumentId, invoiceId),
          ));

        if (!existingEntry) {
          await updateAcctEvent(eventId, "blocked", { errorMessage: "لا يوجد قيد مرحلة 1 للمرتجع — تأكد من إعداد ربط الحسابات" });
          continue;
        }

        // ── Phase-2 idempotency guard ─────────────────────────────────────────
        // Journal posted = Phase-2 already completed (صرف المرتجع نقداً تم مسبقاً).
        // هذا يحمي من double-journal في حالة retry أو استدعاء مزدوج.
        if (existingEntry.status === "posted") {
          logger.info({ invoiceId, entryId: existingEntry.id },
            "[SALES_RETURN] Phase-2 guard: journal already posted — skipping (idempotent)");
          await updateAcctEvent(eventId, "completed", { journalEntryId: existingEntry.id,
            errorMessage: "القيد مرحّل مسبقاً — تم تجاهل التكرار (idempotent guard)" });
          continue;
        }

        // جلب حساب المدينون — يعتمد على returns_mode
        // في reverse_original: المدينون = debitAccountId في sales_invoice
        // في separate_accounts: المدينون = creditAccountId في sales_return
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

        // إيجاد سطر المدينون (دائن) واستبداله بالخزنة
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

        // تحقق من التوازن قبل الترحيل
        const [bal] = await db.select({
          dr: sql<string>`COALESCE(SUM(debit::numeric),0)::text`,
          cr: sql<string>`COALESCE(SUM(credit::numeric),0)::text`,
        }).from(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));

        const drTot = parseFloat(bal?.dr ?? "0");
        const crTot = parseFloat(bal?.cr ?? "0");
        if (Math.abs(drTot - crTot) > 0.01) {
          throw new Error(`[GUARD] قيد المرتجع ${existingEntry.reference} غير متوازن: مدين=${drTot} ≠ دائن=${crTot}`);
        }

        // ترحيل القيد
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

  async deleteSalesInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
    await db.update(salesInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(salesInvoiceHeaders.id, id));
    return true;
  },

  async checkJournalReadiness(
    this: DatabaseStorage,
    invoiceId: string,
  ): Promise<{ ready: boolean; critical: string[]; warnings: string[] }> {
    const [invoice] = await db
      .select({ invoiceDate: salesInvoiceHeaders.invoiceDate, warehouseId: salesInvoiceHeaders.warehouseId })
      .from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.id, invoiceId));

    if (!invoice) return { ready: false, critical: ["الفاتورة غير موجودة"], warnings: [] };

    const critical: string[] = [];
    const warnings: string[] = [];

    // 1. Fiscal period — same logic as assertPeriodOpen
    const [closedPeriod] = await db
      .select({ name: fiscalPeriods.name })
      .from(fiscalPeriods)
      .where(
        and(
          lte(fiscalPeriods.startDate, invoice.invoiceDate),
          gte(fiscalPeriods.endDate, invoice.invoiceDate),
          eq(fiscalPeriods.isClosed, true),
        ),
      )
      .limit(1);

    if (closedPeriod) {
      critical.push(`الفترة المحاسبية "${closedPeriod.name}" مغلقة — يجب تغيير تاريخ الفاتورة`);
    }

    // 2. Account mappings for this warehouse
    const mappings: AccountMapping[] = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId, invoice.pharmacyId);
    const map = new Map<string, AccountMapping>(
      mappings.map((m) => [m.lineType, m] as [string, AccountMapping]),
    );

    // Critical: receivables — the only hard throw in the journal generator
    if (!map.get("receivables")?.debitAccountId) {
      critical.push('حساب المدينون "receivables" غير معرّف — افتح إعدادات الربط المحاسبي');
    }

    // Warning: at least one revenue account
    const hasRevenue =
      map.get("revenue_drugs")?.creditAccountId ||
      map.get("revenue_consumables")?.creditAccountId ||
      map.get("revenue_general")?.creditAccountId;
    if (!hasRevenue) {
      warnings.push("لم يُعيَّن حساب الإيرادات — لن يُسجَّل إيراد في القيد");
    }

    // Warning: inventory / COGS
    let whHasGlAccount = false;
    if (invoice.warehouseId) {
      const [wh] = await db
        .select({ glAccountId: warehouses.glAccountId })
        .from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      whHasGlAccount = !!wh?.glAccountId;
    }
    if (!whHasGlAccount && !map.get("inventory")?.creditAccountId) {
      warnings.push("حساب المخزون غير معرّف — لن تُسجَّل تكلفة البضاعة في القيد");
    }

    return { ready: critical.length === 0, critical, warnings };
  },
};

export default methods;
