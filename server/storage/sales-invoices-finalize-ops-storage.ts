import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { convertQtyToMinor, QTY_MINOR_TOLERANCE } from "../inventory-helpers";
import { generateClaimsForSalesInvoice } from "../lib/contract-claim-generator";
import { evaluateContractForService } from "../lib/contract-rule-evaluator";
import {
  items,
  users,
  contracts,
  contractCoverageRules,
  salesInvoiceHeaders,
  salesInvoiceLines,
  salesTransactions,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async finalizeSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceHeader> {
    let cogsDrugs = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;
    let capturedJournalEntryId: string | null = null;
    let isContractInvoice = false;

    const finalResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM sales_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      if (invoice.createdBy) {
        const [creator] = await tx
          .select({ maxDiscountPct: users.maxDiscountPct })
          .from(users)
          .where(eq(users.id, invoice.createdBy));
        const maxPct = creator?.maxDiscountPct ? parseFloat(String(creator.maxDiscountPct)) : null;
        const usedPct = parseFloat(invoice.discountPercent || "0");
        if (maxPct !== null && usedPct > maxPct) {
          const err: any = new Error(`الخصم المُدخل (${usedPct}%) يتجاوز الحد المسموح به لهذا المستخدم (${maxPct}%). يرجى مراجعة المشرف أو تخفيض الخصم.`);
          err.httpStatus = 422;
          throw err;
        }
      }

      isContractInvoice = invoice.customerType === "contract" && !!(invoice.contractId);
      if (isContractInvoice) {
        const [contractRow] = await tx
          .select({
            id:                 contracts.id,
            companyCoveragePct: contracts.companyCoveragePct,
            isActive:           contracts.isActive,
            startDate:          contracts.startDate,
            endDate:            contracts.endDate,
          })
          .from(contracts)
          .where(eq(contracts.id, invoice.contractId as string));
        if (!contractRow) throw new Error("العقد المرتبط بالفاتورة غير موجود");

        const coverageRules = await tx
          .select()
          .from(contractCoverageRules)
          .where(
            and(
              eq(contractCoverageRules.contractId, invoice.contractId as string),
              eq(contractCoverageRules.isActive, true),
            )
          )
          .orderBy(contractCoverageRules.priority);

        const linesForShares = await tx
          .select({ id: salesInvoiceLines.id, lineTotal: salesInvoiceLines.lineTotal, itemId: salesInvoiceLines.itemId })
          .from(salesInvoiceLines)
          .where(eq(salesInvoiceLines.invoiceId, id));

        const shareLineItemIds = [...new Set(linesForShares.map(l => l.itemId).filter(Boolean) as string[])];
        const shareItemRows = shareLineItemIds.length > 0
          ? await tx.select({ id: items.id, category: items.category }).from(items).where(inArray(items.id, shareLineItemIds))
          : [];
        const shareItemCategoryMap = new Map(shareItemRows.map(i => [i.id, i.category]));

        const evalDate = String(invoice.invoiceDate ?? new Date().toISOString().split('T')[0]);
        let pSum = 0;
        let cSum = 0;

        for (const l of linesForShares) {
          const lineTotal    = parseFloat(String(l.lineTotal || "0"));
          const itemCategory = shareItemCategoryMap.get(l.itemId) ?? null;

          const evalResult = evaluateContractForService({
            contract: {
              id:                 contractRow.id,
              companyCoveragePct: String(contractRow.companyCoveragePct ?? "100"),
              isActive:           contractRow.isActive,
              startDate:          String(contractRow.startDate),
              endDate:            String(contractRow.endDate),
            },
            rules:           coverageRules as any,
            serviceId:       null,
            departmentId:    null,
            serviceCategory: null,
            itemId:          l.itemId,
            itemCategory,
            listPrice:       String(lineTotal),
            evaluationDate:  evalDate,
          });

          const cShare = parseFloat(evalResult.companyShareAmount);
          const pShare = parseFloat(evalResult.patientShareAmount);

          await tx.update(salesInvoiceLines)
            .set({
              companyShareAmount: String(cShare),
              patientShareAmount: String(pShare),
              coverageStatus:     evalResult.coverageStatus,
            })
            .where(eq(salesInvoiceLines.id, l.id));

          cSum += cShare;
          pSum += pShare;
        }

        const newPatientShareTotal = parseFloat(pSum.toFixed(2));
        const newCompanyShareTotal = parseFloat(cSum.toFixed(2));

        await tx.update(salesInvoiceHeaders)
          .set({
            patientShareTotal: String(newPatientShareTotal) as any,
            companyShareTotal:  String(newCompanyShareTotal)  as any,
          })
          .where(eq(salesInvoiceHeaders.id, id));

        (invoice as any).patientShareTotal = String(newPatientShareTotal);
        (invoice as any).companyShareTotal  = String(newCompanyShareTotal);
      }

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const uniqueItemIds = [...new Set(lines.map(l => l.itemId).filter(Boolean) as string[])];
      const allItemRows = uniqueItemIds.length > 0
        ? await tx.select().from(items).where(inArray(items.id, uniqueItemIds))
        : [];
      const itemMap: Record<string, any> = Object.fromEntries(allItemRows.map(i => [i.id, i]));

      const stockLines: Array<{
        lineIdx: number; itemId: string; qtyMinor: number;
        hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
      }> = [];

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        if ((line as any).lineType === "service" || !line.itemId) {
          revenueDrugs += parseFloat(line.lineTotal);
          continue;
        }

        const item = itemMap[line.itemId];
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);

        if (item.category === "service") {
          revenueDrugs += parseFloat(line.lineTotal);
          continue;
        }

        const isConsumable = (line as any).lineType === "consumable";

        if (!isConsumable && item.hasExpiry && !line.expiryMonth) {
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية`);
        }
        if (item.hasExpiry && line.expiryMonth && line.expiryYear) {
          if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
            throw new Error(`الصنف "${item.nameAr}" - لا يمكن بيع دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
          }
        }

        const serverQtyMinor = convertQtyToMinor(parseFloat(line.qty), line.unitLevel || 'minor', item);
        const storedQtyMinor = parseFloat(line.qtyInMinor);
        if (Math.abs(serverQtyMinor - storedQtyMinor) > QTY_MINOR_TOLERANCE) {
          throw new Error(`الصنف "${item.nameAr}" — الكمية المحسوبة على الخادم (${serverQtyMinor.toFixed(4)}) تختلف عن المخزّنة (${storedQtyMinor.toFixed(4)}) بفارق يتجاوز التسامح (${QTY_MINOR_TOLERANCE}). يرجى إعادة إنشاء الفاتورة.`);
        }

        stockLines.push({
          lineIdx: li,
          itemId: line.itemId,
          qtyMinor: serverQtyMinor,
          hasExpiry: !!item.hasExpiry,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
        });
      }

      const { lineResults } = await this.allocateStockInTx(tx, {
        operationType: "sales_finalize",
        referenceType: "sales_invoice",
        referenceId: id,
        warehouseId: invoice.warehouseId,
        lines: stockLines,
      });

      for (const lr of lineResults) {
        const item = itemMap[lr.itemId];
        const line = lines[lr.lineIdx];
        const lineRevenue = parseFloat(line.lineTotal);

        if (item.category === "drug") {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        } else if (item.category === "supply") {
          cogsSupplies += lr.totalCost;
          revenueSupplies += lineRevenue;
        } else {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        }

        await tx.insert(salesTransactions).values({
          itemId: line.itemId,
          txDate: invoice.invoiceDate,
          qty: line.qtyInMinor,
          unitLevel: "minor",
          salePrice: line.salePrice,
          total: line.lineTotal,
        });
      }

      let journalStatus: string = "pending";
      let journalError: string | null = null;

      try {
        await tx.execute(sql`SAVEPOINT journal_attempt`);
        const journalResult = await this.generateSalesInvoiceJournalInTx(tx, id, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
        await tx.execute(sql`RELEASE SAVEPOINT journal_attempt`);
        journalStatus = "posted";
        if (journalResult && typeof (journalResult as any).id === "string") {
          capturedJournalEntryId = (journalResult as any).id;
        }
      } catch (journalErr: any) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT journal_attempt`);
        journalStatus = "failed";
        journalError = journalErr.message || "خطأ غير معروف في إنشاء القيد المحاسبي";
        logAcctEvent({
          sourceType:   "sales_invoice",
          sourceId:     id,
          eventType:    "sales_invoice_journal_finalize",
          status:       "failed",
          errorMessage: journalError,
        }).catch(() => {});
      }

      await tx.update(salesInvoiceHeaders).set({
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        journalStatus,
        journalError,
        claimStatus: isContractInvoice ? ("generating" as any) : undefined,
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });

    if (finalResult && (finalResult as any).journalStatus === "posted") {
      logAcctEvent({
        sourceType:     "sales_invoice",
        sourceId:       id,
        eventType:      "sales_invoice_journal_finalize",
        status:         "completed",
        journalEntryId: capturedJournalEntryId,
      }).catch(() => {});
    }

    if (isContractInvoice) {
      generateClaimsForSalesInvoice(id).catch(err => {
        console.warn("[finalizeSalesInvoice] claim generation failed (non-fatal):", err?.message);
      });
    }

    return finalResult;
  },
};

export default methods;
