import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { logger } from "../lib/logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";
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
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";

const salesJournalCoreMethods = {
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
            await db.update(salesInvoiceHeaders).set({
              journalStatus: "posted",
              journalError: null,
            }).where(eq(salesInvoiceHeaders.id, inv.id));
            succeeded++;
            console.log(`[JOURNAL_RETRY] Invoice #${inv.invoiceNumber} - journal already posted, header synced`);
          } else if (existing.length > 0) {
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

    if (invoice.customerType === "credit") {
      const creditReceivablesMapping = mappingMap.get("receivables_credit");
      if (creditReceivablesMapping?.debitAccountId) {
        debitAccountId = creditReceivablesMapping.debitAccountId;
      }
    }

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

    const grossRevenue = roundMoney(revenueDrugs + revenueSupplies);

    const isContract = invoice.customerType === "contract";
    const patientShareTotal = parseFloat((invoice as any).patientShareTotal || "0");
    const companyShareTotal = parseFloat((invoice as any).companyShareTotal || "0");
    const sharesSum = roundMoney(patientShareTotal + companyShareTotal);
    const canSplitAR = isContract && sharesSum > 0.001;

    let contractEffectiveVat = -1;

    if (canSplitAR) {
      const patientARMapping = mappingMap.get("pharmacy_patient_receivable");
      const companyARMapping = mappingMap.get("pharmacy_contract_receivable");

      const rawTaxAmount = parseFloat(invoice.totalTaxAmount || "0");
      if (rawTaxAmount > 0.001 && grossRevenue > 0.001) {
        contractEffectiveVat = parseFloat(roundMoney(rawTaxAmount * (sharesSum / grossRevenue)));
      } else {
        contractEffectiveVat = 0;
      }
      const patientVatShare: number = (sharesSum > 0.001 && patientShareTotal > 0.001)
        ? parseFloat(roundMoney(contractEffectiveVat * (patientShareTotal / sharesSum)))
        : 0;
      const companyVatShare: number = parseFloat(roundMoney(contractEffectiveVat - patientVatShare));

      const missingPatientMapping = !patientARMapping?.debitAccountId && patientShareTotal > 0.001;
      const missingCompanyMapping = !companyARMapping?.debitAccountId && companyShareTotal > 0.001;
      if (missingPatientMapping || missingCompanyMapping) {
        await logAcctEvent({
          sourceType:   "sales_invoice",
          sourceId:     invoiceId,
          eventType:    "contract_ar_split_fallback",
          status:       "completed",
          errorMessage: [
            `[تحذير] فاتورة تعاقد رُحِّلت باستخدام حساب الذمم الافتراضي بدل حسابات التعاقد المخصصة.`,
            missingPatientMapping ? `• pharmacy_patient_receivable: غير مُعيَّن (حصة مريض ${patientShareTotal.toFixed(2)} ج.م رُحِّلت على الذمم العامة).` : "",
            missingCompanyMapping ? `• pharmacy_contract_receivable: غير مُعيَّن (حصة شركة ${companyShareTotal.toFixed(2)} ج.م رُحِّلت على الذمم العامة).` : "",
            `الحل: أضف الحسابين في صفحة ربط الحسابات (Account Mappings) تحت تصنيف الصيدلية.`,
          ].filter(Boolean).join("\n"),
        });
      }

      const totalPatientAR: number = parseFloat(roundMoney(patientShareTotal + patientVatShare));
      if (totalPatientAR > 0.001) {
        const acct = patientARMapping?.debitAccountId || debitAccountId;
        journalLineData.push({
          journalEntryId: "", lineNumber: lineNum++, accountId: acct,
          debit: totalPatientAR.toFixed(2), credit: "0",
          description: `ذمة مريض — ${invoice.customerName || "عميل عقد"}`,
        });
      }
      const totalCompanyAR: number = parseFloat(roundMoney(companyShareTotal + companyVatShare));
      if (totalCompanyAR > 0.001) {
        const acct = companyARMapping?.debitAccountId || debitAccountId;
        journalLineData.push({
          journalEntryId: "", lineNumber: lineNum++, accountId: acct,
          debit: totalCompanyAR.toFixed(2), credit: "0",
          description: `ذمة شركة تأمين — ${(invoice as any).contractCompany || "شركة"}`,
        });
      }

      const contractDiscountAmount: number = parseFloat(roundMoney(grossRevenue - sharesSum));
      if (contractDiscountAmount > 0.01) {
        const discountMapping = mappingMap.get("discount_allowed");
        if (discountMapping?.debitAccountId) {
          journalLineData.push({
            journalEntryId: "",
            lineNumber: lineNum++,
            accountId: discountMapping.debitAccountId,
            debit: contractDiscountAmount.toFixed(2),
            credit: "0",
            description: "خصم تعاقدي — مخفضات الإيراد",
          });
        } else {
          await logAcctEvent({
            sourceType:   "sales_invoice",
            sourceId:     invoiceId,
            eventType:    "contract_discount_account_missing",
            status:       "completed",
            errorMessage: [
              `[تحذير] فاتورة تعاقد بها خصم تعاقدي (${contractDiscountAmount.toFixed(2)} ج.م) لكن لم يُعيَّن حساب discount_allowed.`,
              `• القيد سيُنشأ غير متوازن إذا لم يُحدَّد حساب الخصم.`,
              `الحل: أضف ربط discount_allowed في صفحة ربط الحسابات تحت فواتير المبيعات.`,
            ].join("\n"),
          });
        }
      }
    } else {
      if (isContract && netTotal > 0) {
        await logAcctEvent({
          sourceType:   "sales_invoice",
          sourceId:     invoiceId,
          eventType:    "contract_ar_no_split",
          status:       "completed",
          errorMessage: [
            `[تحذير] فاتورة تعاقد رُحِّلت على حساب الذمم العام دون تقسيم حصص.`,
            `• صافي الفاتورة: ${netTotal.toFixed(2)} ج.م`,
            `• مجموع الحصص المسجّلة: ${sharesSum.toFixed(2)} ج.م (مريض ${patientShareTotal.toFixed(2)} + شركة ${companyShareTotal.toFixed(2)})`,
            `السبب: الحصص لم تُحسب بعد (sharesSum = 0) — يرجى إعادة اعتماد الفاتورة بعد إعداد قواعد التغطية.`,
          ].join("\n"),
        });
      }
      if (debitAccountId && netTotal > 0) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: debitAccountId,
          debit: String(netTotal.toFixed(2)),
          credit: "0",
          description: isContract ? "ذمم تعاقد — بانتظار تقسيم الحصص" : "مدينون - في انتظار التحصيل",
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
    }

    const totalCogs = cogsDrugs + cogsSupplies;
    const hasInventoryAccount = !!inventoryAccountId;

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

    {
      const totalTaxAmount = parseFloat(invoice.totalTaxAmount || "0");
      if (totalTaxAmount > 0.001) {
        const vatOutputMapping = mappingMap.get("vat_output");
        if (!vatOutputMapping?.creditAccountId) {
          throw new Error(
            `الفاتورة تحمل ضريبة قيمة مضافة (${totalTaxAmount.toFixed(2)} ج.م) لكن لم يُعيَّن حساب vat_output في ربط حسابات فواتير المبيعات — يرجى إضافة ربط الحساب من صفحة ربط الحسابات قبل استخدام ميزة الضريبة`
          );
        }

        if (contractEffectiveVat >= 0) {
          if (contractEffectiveVat > 0.001) {
            journalLineData.push({
              journalEntryId: "",
              lineNumber: lineNum++,
              accountId: vatOutputMapping.creditAccountId,
              debit: "0",
              credit: String(contractEffectiveVat.toFixed(2)),
              description: "ضريبة القيمة المضافة — مخرجات (تعاقد)",
            });
          }
        } else {
          journalLineData.push({
            journalEntryId: "",
            lineNumber: lineNum++,
            accountId: vatOutputMapping.creditAccountId,
            debit: "0",
            credit: String(totalTaxAmount.toFixed(2)),
            description: "ضريبة القيمة المضافة — مخرجات",
          });
        }
      }
    }

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

    const initialStatus =
      invoice.customerType === "delivery" || invoice.customerType === "credit"
        ? "posted"
        : "draft";

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

    const linesWithEntryId = await resolveCostCenters(
      journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }))
    );

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
      await tx.execute(sql`SELECT id FROM sales_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`);
      const result = await this.buildSalesJournalLines(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies, tx);
      if (!result) return null;
      return this.insertJournalEntry(tx, invoiceId, invoice, result.journalLineData, result.totalDebits, result.totalCredits);
    });
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
      .select({ invoiceDate: salesInvoiceHeaders.invoiceDate, warehouseId: salesInvoiceHeaders.warehouseId, pharmacyId: salesInvoiceHeaders.pharmacyId })
      .from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.id, invoiceId));

    if (!invoice) return { ready: false, critical: ["الفاتورة غير موجودة"], warnings: [] };

    const critical: string[] = [];
    const warnings: string[] = [];

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

    const mappings: AccountMapping[] = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId, invoice.pharmacyId);
    const map = new Map<string, AccountMapping>(
      mappings.map((m) => [m.lineType, m] as [string, AccountMapping]),
    );

    if (!map.get("receivables")?.debitAccountId) {
      critical.push('حساب المدينون "receivables" غير معرّف — افتح إعدادات الربط المحاسبي');
    }

    const hasRevenue =
      map.get("revenue_drugs")?.creditAccountId ||
      map.get("revenue_consumables")?.creditAccountId ||
      map.get("revenue_general")?.creditAccountId;
    if (!hasRevenue) {
      warnings.push("لم يُعيَّن حساب الإيرادات — لن يُسجَّل إيراد في القيد");
    }

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

export default salesJournalCoreMethods;
