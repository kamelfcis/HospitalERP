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
    if (!invoice || invoice.status !== "finalized") return null;

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
          if (existing.length > 0) {
            await db.update(salesInvoiceHeaders).set({
              journalStatus: "posted",
              journalError: null,
            }).where(eq(salesInvoiceHeaders.id, inv.id));
            succeeded++;
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal already exists, marked as posted`);
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

    const mappings = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId);
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

    const [entry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: invoice.invoiceDate,
      reference: `SI-${invoice.invoiceNumber}`,
      description: `قيد فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
      status: "draft",
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
          isReturn: salesInvoiceHeaders.isReturn,
        }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

        const invoiceReceivableIds = new Set<string>();
        const mappings = await this.getMappingsForTransaction("sales_invoice", invoice?.warehouseId ?? null);
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
    const mappings: AccountMapping[] = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId);
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
