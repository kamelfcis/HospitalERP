import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, desc, and, sql, or, asc, gte, lte, ilike, inArray } from "drizzle-orm";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { convertQtyToMinor, QTY_MINOR_TOLERANCE } from "../inventory-helpers";
import { generateClaimsForSalesInvoice } from "../lib/contract-claim-generator";
import {
  items,
  warehouses,
  users,
  contracts,
  salesInvoiceHeaders,
  salesInvoiceLines,
  salesTransactions,
  inventoryLots,
  inventoryLotMovements,
  stockMovementHeaders,
  stockMovementAllocations,
  journalEntries,
  journalLines,
  fiscalPeriods,
  accountMappings,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  SalesInvoiceWithDetails,
  SalesInvoiceLineWithItem,
  JournalEntry,
  InsertJournalLine,
  AccountMapping,
  InsertSalesInvoiceHeader,
  InsertSalesInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";


const methods = {
  async allocateStockInTx(
    this: DatabaseStorage,
    tx: DrizzleTransaction,
    params: {
      operationType: string;
      referenceType: string;
      referenceId: string;
      warehouseId: string;
      lines: Array<{
        lineIdx: number;
        itemId: string;
        qtyMinor: number;
        hasExpiry: boolean;
        expiryMonth?: number | null;
        expiryYear?: number | null;
      }>;
      createdBy?: string;
    }
  ): Promise<{ movementHeaderId: string; lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> }> {
    const { operationType, referenceType, referenceId, warehouseId, lines, createdBy } = params;

    const existingResult = await tx.execute(
      sql`SELECT id FROM stock_movement_headers WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} LIMIT 1`
    );
    if (existingResult.rows?.length > 0) {
      const movementHeaderId = (existingResult.rows[0] as Record<string, unknown>).id as string;
      const allocRows = await tx.execute(
        sql`SELECT alloc_key, cost_allocated FROM stock_movement_allocations WHERE movement_header_id = ${movementHeaderId}`
      );
      const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = lines.map(l => ({
        lineIdx: l.lineIdx,
        itemId: l.itemId,
        totalCost: (allocRows.rows as Array<Record<string, unknown>>)
          .filter((r) => (r.alloc_key as string).startsWith(`line:${l.lineIdx}:`))
          .reduce((s, r) => s + parseFloat(r.cost_allocated as string), 0),
      }));
      return { movementHeaderId, lineResults };
    }

    const [movHeader] = await tx.insert(stockMovementHeaders).values({
      operationType,
      referenceType,
      referenceId,
      warehouseId,
      totalCost: "0",
      status: "posted",
      createdBy: createdBy || null,
    }).returning();
    const movementHeaderId = movHeader.id;

    const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = [];
    let movementTotalCost = 0;

    for (const line of lines) {
      const { lineIdx, itemId, qtyMinor, hasExpiry, expiryMonth, expiryYear } = line;
      if (qtyMinor <= 0) {
        lineResults.push({ lineIdx, itemId, totalCost: 0 });
        continue;
      }

      const specificExpiry = hasExpiry && expiryMonth && expiryYear;
      const lotsResult = await tx.execute(
        specificExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                  AND expiry_month = ${expiryMonth}
                  AND expiry_year = ${expiryYear}
                ORDER BY expiry_year ASC, expiry_month ASC, received_date ASC
                FOR UPDATE`
          : hasExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
                FOR UPDATE`
          : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE`
      );
      const lots = lotsResult.rows as any[];

      let remaining = qtyMinor;
      let lotSeq = 0;
      const rawAllocs: Array<{ lotId: string; allocKey: string; qty: number; unitCost: number; rawCost: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0.00005) break;
        const available = parseFloat(lot.qty_in_minor);
        const deduct = Math.min(available, remaining);
        const unitCostNum = parseFloat(lot.purchase_price);

        rawAllocs.push({
          lotId: lot.id,
          allocKey: `line:${lineIdx}:lot:${lot.id}:seq:${lotSeq}`,
          qty: deduct,
          unitCost: unitCostNum,
          rawCost: deduct * unitCostNum,
        });

        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW() WHERE id = ${lot.id}`
        );

        await tx.insert(inventoryLotMovements).values({
          lotId: lot.id,
          warehouseId,
          txType: "out",
          qtyChangeInMinor: String(-deduct),
          unitCost: String(unitCostNum),
          referenceType,
          referenceId,
        });

        remaining -= deduct;
        lotSeq++;
      }

      if (remaining > 0.00005) {
        const itemRow = await tx.execute(sql`SELECT name_ar FROM items WHERE id = ${itemId} LIMIT 1`);
        const nameAr = (itemRow.rows[0] as any)?.name_ar || itemId;
        throw new Error(`رصيد غير كاف للصنف "${nameAr}" - النقص: ${remaining.toFixed(4)}`);
      }

      const totalRawCost = rawAllocs.reduce((s, a) => s + a.rawCost, 0);
      const totalCostRounded = parseFloat(roundMoney(totalRawCost));
      let allocatedSoFar = 0;

      for (let i = 0; i < rawAllocs.length; i++) {
        const a = rawAllocs[i];
        const isLast = i === rawAllocs.length - 1;
        const costAllocated = isLast
          ? parseFloat((totalCostRounded - allocatedSoFar).toFixed(2))
          : parseFloat(roundMoney(a.rawCost));

        const sourceId = `${movementHeaderId}:${referenceId}:${a.allocKey}`;

        await tx.insert(stockMovementAllocations).values({
          movementHeaderId,
          lotId: a.lotId,
          allocKey: a.allocKey,
          qtyAllocatedMinor: String(a.qty),
          unitCost: String(a.unitCost),
          costAllocated: String(costAllocated),
          sourceType: "STOCK_MOVEMENT_ALLOC",
          sourceId,
        });

        allocatedSoFar += costAllocated;
      }

      lineResults.push({ lineIdx, itemId, totalCost: totalCostRounded });
      movementTotalCost += totalCostRounded;
    }

    await tx.update(stockMovementHeaders).set({
      totalCost: roundMoney(movementTotalCost),
    }).where(eq(stockMovementHeaders.id, movementHeaderId));

    return { movementHeaderId, lineResults };
  },

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

      // ── فحص حد الخصم (maxDiscountPct) ────────────────────────────────────
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

      // ── حساب حصص التعاقد (من السيرفر — يتجاهل ما أرسله العميل) ──────────
      isContractInvoice = invoice.customerType === "contract" && !!(invoice.contractId);
      if (isContractInvoice) {
        // تحميل نسبة تغطية الشركة من جدول العقود
        const [contractRow] = await tx
          .select({ companyCoveragePct: contracts.companyCoveragePct })
          .from(contracts)
          .where(eq(contracts.id, invoice.contractId as string));

        const companyCoveragePct = contractRow?.companyCoveragePct
          ? parseFloat(String(contractRow.companyCoveragePct))
          : 100;

        // جلب السطور للحساب
        const linesForShares = await tx
          .select({ id: salesInvoiceLines.id, lineTotal: salesInvoiceLines.lineTotal })
          .from(salesInvoiceLines)
          .where(eq(salesInvoiceLines.invoiceId, id));

        let pSum = 0;
        let cSum = 0;

        // حساب وتحديث كل سطر — N+1 write: مسموح به (business action per-line)
        for (const l of linesForShares) {
          const lineTotal   = parseFloat(String(l.lineTotal || "0"));
          const cShare      = parseFloat((lineTotal * companyCoveragePct / 100).toFixed(2));
          const pShare      = parseFloat((lineTotal - cShare).toFixed(2));
          await tx.update(salesInvoiceLines)
            .set({ companyShareAmount: String(cShare), patientShareAmount: String(pShare) })
            .where(eq(salesInvoiceLines.id, l.id));
          cSum += cShare;
          pSum += pShare;
        }

        const newPatientShareTotal = parseFloat(pSum.toFixed(2));
        const newCompanyShareTotal = parseFloat(cSum.toFixed(2));

        // تحديث الإجماليات على الهيدر في الـ transaction
        await tx.update(salesInvoiceHeaders)
          .set({
            patientShareTotal: String(newPatientShareTotal) as any,
            companyShareTotal:  String(newCompanyShareTotal)  as any,
          })
          .where(eq(salesInvoiceHeaders.id, id));

        // تحديث المتغير المحلي لاستخدامه في بناء القيد المحاسبي
        (invoice as any).patientShareTotal = String(newPatientShareTotal);
        (invoice as any).companyShareTotal  = String(newCompanyShareTotal);
      }

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // batch-fetch كل الأصناف قبل الـ loop (N+1 fix)
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
        const item = itemMap[line.itemId];
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);

        if (item.category === "service") {
          revenueDrugs += parseFloat(line.lineTotal);
          continue;
        }

        if (item.hasExpiry && !line.expiryMonth) {
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية`);
        }
        if (item.hasExpiry && line.expiryMonth && line.expiryYear) {
          if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
            throw new Error(`الصنف "${item.nameAr}" - لا يمكن بيع دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
          }
        }

        // ── T04: إعادة التحقق من الكميات على الخادم ──────────────────────────
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
        // إطلاق مطالبات التعاقد — يُعيَّن هنا، ويُكمَّل خارج الـ transaction
        claimStatus: isContractInvoice ? ("generating" as any) : undefined,
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });

    // GAP 1 FIX: log "completed" after successful finalize (outside tx so never rolled back)
    if (finalResult && (finalResult as any).journalStatus === "posted") {
      logAcctEvent({
        sourceType:     "sales_invoice",
        sourceId:       id,
        eventType:      "sales_invoice_journal_finalize",
        status:         "completed",
        journalEntryId: capturedJournalEntryId,
      }).catch(() => {});
    }

    // ── إطلاق توليد المطالبات (fire-and-forget) للفواتير العقدية ──────────
    if (isContractInvoice) {
      generateClaimsForSalesInvoice(id).catch(err => {
        // non-fatal — الفشل لا يؤثر على الفاتورة المُعتمَدة
        console.warn("[finalizeSalesInvoice] claim generation failed (non-fatal):", err?.message);
      });
    }

    return finalResult;
  },
};

export default methods;
