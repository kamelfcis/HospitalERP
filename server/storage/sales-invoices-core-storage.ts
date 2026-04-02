import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, desc, and, sql, or, asc, gte, lte, ilike, inArray } from "drizzle-orm";
import { convertQtyToMinor } from "../inventory-helpers";
import {
  items,
  warehouses,
  users,
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
import { computeLineTax, computeInvoiceTaxTotals, type LineTaxResult } from "../services/pharmacy-sales-tax-service";
import type { TaxType } from "../lib/tax/pharmacy-vat-engine";
import { logger } from "../lib/logger";


const methods = {

  async getNextSalesInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(salesInvoiceHeaders);
    return (result?.max || 0) + 1;
  },

  async getSalesInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; claimStatus?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: (SalesInvoiceHeader & { warehouse?: { nameAr: string }, pharmacistName: string | null, itemCount: number })[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}> {
    const conditions: Array<any> = [];
    if (filters.status && filters.status !== "all") {
      // دعم قائمة حالات متعددة مفصولة بفاصلة (مثلاً: "finalized,collected")
      const statuses = filters.status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(salesInvoiceHeaders.status, statuses[0] as any));
      } else {
        conditions.push(inArray(salesInvoiceHeaders.status, statuses as any[]));
      }
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${salesInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.customerType && filters.customerType !== "all") conditions.push(eq(salesInvoiceHeaders.customerType, filters.customerType as any));
    if (filters.pharmacistId && filters.pharmacistId !== "all") conditions.push(eq(salesInvoiceHeaders.createdBy, filters.pharmacistId));
    if (filters.warehouseId && filters.warehouseId !== "all") conditions.push(eq(salesInvoiceHeaders.warehouseId, filters.warehouseId));
    // ── فلتر claimStatus ─────────────────────────────────────────────────────
    if (filters.claimStatus && filters.claimStatus !== "all") {
      if (filters.claimStatus === "none") {
        conditions.push(sql`${salesInvoiceHeaders.claimStatus} IS NULL`);
      } else {
        conditions.push(sql`${salesInvoiceHeaders.claimStatus} = ${filters.claimStatus}`);
      }
    }
    if (filters.search) {
      const searchTerm = filters.search.replace(/^SI-/i, '').trim();
      conditions.push(or(
        ilike(salesInvoiceHeaders.customerName, `%${filters.search}%`),
        sql`${salesInvoiceHeaders.invoiceNumber}::text LIKE ${`%${searchTerm}%`}`
      ));
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.subtotal}::numeric), 0)`,
      discountValue: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.discountValue}::numeric), 0)`,
      netTotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.netTotal}::numeric), 0)`,
    }).from(salesInvoiceHeaders).where(whereClause);

    const rows = await db.select({
      h: salesInvoiceHeaders,
      warehouseNameAr: warehouses.nameAr,
      pharmacistName: users.fullName,
      itemCount: sql<number>`COUNT(DISTINCT ${salesInvoiceLines.id})`,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .leftJoin(users, eq(salesInvoiceHeaders.createdBy, users.id))
    .leftJoin(salesInvoiceLines, eq(salesInvoiceLines.invoiceId, salesInvoiceHeaders.id))
    .where(whereClause)
    .groupBy(salesInvoiceHeaders.id, warehouses.nameAr, users.fullName)
    .orderBy(desc(salesInvoiceHeaders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

    const data = rows.map(r => ({
      ...r.h,
      warehouse: r.warehouseNameAr ? { nameAr: r.warehouseNameAr } : undefined,
      pharmacistName: r.pharmacistName || null,
      itemCount: Number(r.itemCount) || 0,
    }));

    return {
      data,
      total: Number(agg.count),
      totals: {
        subtotal: Number(agg.subtotal),
        discountValue: Number(agg.discountValue),
        netTotal: Number(agg.netTotal),
      },
    };
  },

  async getSalesInvoice(this: DatabaseStorage, id: string): Promise<SalesInvoiceWithDetails | undefined> {
    // استعلام واحد للرأس + المستودع بدلاً من استعلامين
    const headerRows = await db
      .select({ header: salesInvoiceHeaders, warehouse: warehouses })
      .from(salesInvoiceHeaders)
      .leftJoin(warehouses, eq(warehouses.id, salesInvoiceHeaders.warehouseId))
      .where(eq(salesInvoiceHeaders.id, id))
      .limit(1);
    if (!headerRows.length) return undefined;
    const { header: h, warehouse: wh } = headerRows[0];

    // استعلام واحد للسطور + الأصناف بدلاً من N استعلام (كان N+2 وأصبح 2)
    const lineRows = await db
      .select({ line: salesInvoiceLines, item: items })
      .from(salesInvoiceLines)
      .leftJoin(items, eq(items.id, salesInvoiceLines.itemId))
      .where(eq(salesInvoiceLines.invoiceId, id))
      .orderBy(asc(salesInvoiceLines.lineNo));

    const linesWithItems: SalesInvoiceLineWithItem[] = lineRows.map(r => ({
      ...r.line,
      item: r.item ?? undefined,
    }));

    return { ...h, warehouse: wh ?? undefined, lines: linesWithItems };
  },

  /**
   * ══════════════════════════════════════════════════════════════════
   *  expandLinesFEFO — توسيع سطور الفاتورة باستخدام قاعدة FEFO
   *  First-Expired First-Out — الأقدم انتهاءً يُصرف أولاً
   * ══════════════════════════════════════════════════════════════════
   *
   *  ماذا تفعل؟
   *   كل سطر فاتورة يحتوي على صنف + كمية + وحدة.
   *   إذا كان الصنف له تواريخ انتهاء (hasExpiry=true) ولم يُحدَّد
   *   الـ lot يدوياً، تقوم هذه الدالة بـ:
   *     1. تحويل الكمية لأصغر وحدة (minor units)
   *     2. جلب الـ lots المتاحة مرتبة من الأقرب للانتهاء للأبعد
   *     3. تقسيم الكمية المطلوبة على الـ lots بالترتيب (FEFO)
   *     4. إرجاع سطور متعددة — سطر لكل lot تم استخدامه
   *
   *  مثال:
   *   طلب 10 أقراص دواء → lot A فيه 6 (انتهاء يناير) + lot B فيه 8 (انتهاء مارس)
   *   النتيجة: سطرين: 6 من lot A + 4 من lot B
   *
   *  حالات خاصة:
   *   - الصنف بدون hasExpiry → يُمرَّر كما هو بدون تقسيم
   *   - الـ lot محدد يدوياً → لا تقسيم (bypass)
   *   - الكمية المتاحة لا تكفي → يُحتفظ بالسطر الأصلي كاحتياطي
   *     (المرحلة التالية ستفشل بسبب نقص المخزون — عمداً)
   *
   *  تحذيرات:
   *   - تُنفَّذ داخل transaction فقط
   *   - تستخدم FOR UPDATE ضمنياً لأن التحديث يأتي لاحقاً في نفس الـ tx
   * ══════════════════════════════════════════════════════════════════
   */
  async expandLinesFEFO(this: DatabaseStorage, tx: DrizzleTransaction, warehouseId: string, rawLines: Partial<InsertSalesInvoiceLine>[]): Promise<Partial<InsertSalesInvoiceLine>[]> {
    const expanded: Partial<InsertSalesInvoiceLine>[] = [];
    for (const line of rawLines) {
      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId!));
      if (!item || !item.hasExpiry || line.expiryMonth || line.expiryYear) {
        expanded.push(line);
        continue;
      }

      const rawQty = parseFloat(line.qty || "0") || 0;
      const totalMinor = convertQtyToMinor(rawQty, line.unitLevel || "major", item);

      const lots = await tx.select().from(inventoryLots)
        .where(and(
          eq(inventoryLots.itemId, line.itemId!),
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.isActive, true),
          sql`${inventoryLots.qtyInMinor}::numeric > 0`
        ))
        .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

      let remaining = totalMinor;
      const beforeLen = expanded.length;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const available = parseFloat(lot.qtyInMinor);
        const take = Math.min(available, remaining);

        expanded.push({
          ...line,
          unitLevel: "minor",
          qty: String(take),
          salePrice: line.salePrice,
          expiryMonth: lot.expiryMonth,
          expiryYear: lot.expiryYear,
          lotId: lot.id,
        });
        remaining -= take;
      }

      if (expanded.length === beforeLen || remaining > 0) {
        if (remaining === totalMinor) {
          expanded.push(line);
        }
      }
    }
    return expanded;
  },

  async createSalesInvoice(this: DatabaseStorage, header: InsertSalesInvoiceHeader, lines: Partial<InsertSalesInvoiceLine>[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      logger.debug("[CREATE_SALES_INVOICE] started", { lineCount: lines.length, warehouseId: header.warehouseId });
      const nextNum = await this.getNextSalesInvoiceNumber();

      // فحص الكميات الكسرية على مدخل المستخدم الأصلي — قبل توسيع FEFO
      // السبب: بعد FEFO تتحول الوحدات لـ"minor" وقد تنتج كسوراً داخلية طبيعية
      // (مثال: 1 شريط من علبة 2 شريط → 0.5 وحدة داخلياً) وهذا ليس خطأ من المستخدم.
      // الفحص الصحيح: هل أدخل المستخدم كمية كسرية في الوحدة التي اختارها؟
      {
        const epsilon = 0.0001;
        for (const rawLine of lines) {
          const rawQty = parseFloat(rawLine.qty || "0") || 0;
          if (Math.abs(rawQty - Math.round(rawQty)) > epsilon) {
            const [rawItem] = await tx
              .select({ nameAr: items.nameAr, allowFractionalSale: items.allowFractionalSale })
              .from(items)
              .where(eq(items.id, rawLine.itemId!));
            if (rawItem?.allowFractionalSale === false) {
              const err: any = new Error(`الصنف "${rawItem.nameAr}" لا يسمح بالبيع بكميات كسرية`);
              err.httpStatus = 400;
              throw err;
            }
          }
        }
      }

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId!, lines);

      // ── batch-fetch items (N+1 fix) ────────────────────────────────────────
      const uniqueItemIds = [...new Set(expandedLines.map(l => l.itemId).filter(Boolean) as string[])];
      const allItemRows = uniqueItemIds.length > 0
        ? await tx.select().from(items).where(inArray(items.id, uniqueItemIds))
        : [];
      const itemMap = new Map(allItemRows.map(i => [i.id, i]));

      // ── batch-fetch lot prices (N+1 fix) ──────────────────────────────────
      const uniqueLotIds = [...new Set(expandedLines.map(l => l.lotId).filter(Boolean) as string[])];
      const allLotRows = uniqueLotIds.length > 0
        ? await tx.select({ id: inventoryLots.id, salePrice: inventoryLots.salePrice }).from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
        : [];
      const lotMap = new Map(allLotRows.map(l => [l.id, l]));

      let subtotal = 0;
      const processedLines: { line: Partial<InsertSalesInvoiceLine>; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number; taxResult: LineTaxResult }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty || "0") || 0;
        const item = itemMap.get(line.itemId!);

        // ── تسعير النظام: الباكند يُحدّد السعر دائماً — لا يثق بالعميل ──────
        // الأولوية: سعر الدُفعة (lotId) → سعر الصنف الحالي (salePriceCurrent)
        let salePrice = 0;
        if (item) {
          let baseMasterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          if (line.lotId) {
            const lot = lotMap.get(line.lotId);
            const lotPrice = parseFloat(String(lot?.salePrice || "0")) || 0;
            if (lotPrice > 0) baseMasterPrice = lotPrice;
          }
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = baseMasterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = baseMasterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = baseMasterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = baseMasterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = baseMasterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = baseMasterPrice;
            }
          } else {
            salePrice = baseMasterPrice;
          }
        }

        const qtyInMinor = item ? convertQtyToMinor(qty, line.unitLevel || "major", item) : qty;

        // ── حساب الضريبة per-line (snapshot من الصنف) ──────────────────────
        const taxResult = computeLineTax({
          qty,
          salePrice,
          taxType: (item?.taxType as TaxType) ?? null,
          taxRate: parseFloat(item?.defaultTaxRate ?? "0") || 0,
          pricesIncludeTax: item?.pharmacyPricesIncludeTax ?? false,
        });

        const lineTotal = parseFloat(taxResult.lineTotal);
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal, taxResult });
      }

      const discountPercent = parseFloat(header.discountPercent || "0") || 0;
      const discountValue = parseFloat(header.discountValue || "0") || 0;
      const discountType = header.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || null;
      if (!pharmacyId && header.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      // ── إجماليات الضريبة على مستوى الفاتورة ─────────────────────────────
      const invoiceTaxTotals = computeInvoiceTaxTotals(processedLines.map(p => p.taxResult));
      const pricesIncludeTaxForHeader = processedLines.length > 0
        ? (processedLines[0].line as any)?.pricesIncludeTax ?? false
        : false;

      // ── حصص التعاقد على مستوى السطور ────────────────────────────────────
      let headerPatientShareTotal: string | null = null;
      let headerCompanyShareTotal: string | null = null;
      if (header.customerType === "contract" && header.contractId) {
        let pSum = 0, cSum = 0;
        for (const { line } of processedLines) {
          pSum += parseFloat(String((line as any).patientShareAmount || "0")) || 0;
          cSum += parseFloat(String((line as any).companyShareAmount || "0")) || 0;
        }
        if (pSum + cSum > 0.001) {
          headerPatientShareTotal = String(pSum.toFixed(2));
          headerCompanyShareTotal = String(cSum.toFixed(2));
        }
      }

      const [invoice] = await tx.insert(salesInvoiceHeaders).values({
        invoiceNumber: nextNum,
        invoiceDate: header.invoiceDate,
        warehouseId: header.warehouseId,
        pharmacyId,
        customerType: header.customerType || "cash",
        customerName: header.customerName || null,
        customerId: (header.customerType === "credit" && header.customerId) ? header.customerId : null,
        contractCompany: header.contractCompany || null,
        companyId:        (header.customerType === "contract" ? header.companyId || null : null) as any,
        contractId:       (header.customerType === "contract" ? header.contractId || null : null) as any,
        contractMemberId: (header.customerType === "contract" ? (header as any).contractMemberId || null : null) as any,
        patientShareTotal: headerPatientShareTotal as any,
        companyShareTotal:  headerCompanyShareTotal as any,
        status: "draft",
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes || null,
        createdBy: header.createdBy || null,
        clinicOrderId: header.clinicOrderId || null,
        pricesIncludeTax: pricesIncludeTaxForHeader || null,
        totalTaxAmount: invoiceTaxTotals.totalTaxAmount,
        totalNetAmount: invoiceTaxTotals.totalNetAmount,
        totalGrossAmount: invoiceTaxTotals.totalGrossAmount,
      }).returning();

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal, taxResult } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: invoice.id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
          // ── حصص التعاقد per-line ──────────────────────────────────────────
          companyId:          invoice.customerType === "contract" ? (invoice.companyId || null) : null,
          contractId:         invoice.customerType === "contract" ? (invoice.contractId || null) : null,
          contractMemberId:   invoice.customerType === "contract" ? ((invoice as any).contractMemberId || null) : null,
          companyShareAmount: invoice.customerType === "contract" ? (String((line as any).companyShareAmount || "0") || null) : null,
          patientShareAmount: invoice.customerType === "contract" ? (String((line as any).patientShareAmount || "0") || null) : null,
          coverageStatus:     invoice.customerType === "contract" ? ("covered" as any) : null,
          // ── ضريبة القيمة المضافة per-line ────────────────────────────────
          taxType: taxResult.taxType || null,
          taxRate: taxResult.taxRate > 0 ? String(taxResult.taxRate) : null,
          taxAmount: taxResult.taxAmount,
          netUnitPrice: taxResult.netUnitPrice,
          grossUnitPrice: taxResult.grossUnitPrice,
          lineNetAmount: taxResult.lineNetAmount,
          lineGrossAmount: taxResult.lineGrossAmount,
        } as unknown as import("@shared/schema").InsertSalesInvoiceLine);
      }

      return invoice;
    });
  },

  async updateSalesInvoice(this: DatabaseStorage, id: string, header: Partial<InsertSalesInvoiceHeader>, lines: Partial<InsertSalesInvoiceLine>[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

      // فحص الكميات الكسرية على مدخل المستخدم الأصلي — قبل توسيع FEFO
      {
        const epsilon = 0.0001;
        for (const rawLine of lines) {
          const rawQty = parseFloat(rawLine.qty || "0") || 0;
          if (Math.abs(rawQty - Math.round(rawQty)) > epsilon) {
            const [rawItem] = await tx
              .select({ nameAr: items.nameAr, allowFractionalSale: items.allowFractionalSale })
              .from(items)
              .where(eq(items.id, rawLine.itemId!));
            if (rawItem?.allowFractionalSale === false) {
              const err: any = new Error(`الصنف "${rawItem.nameAr}" لا يسمح بالبيع بكميات كسرية`);
              err.httpStatus = 400;
              throw err;
            }
          }
        }
      }

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId ?? invoice.warehouseId, lines);

      // ── batch-fetch items (N+1 fix) ────────────────────────────────────────
      const uniqueItemIdsU = [...new Set(expandedLines.map(l => l.itemId).filter(Boolean) as string[])];
      const allItemRowsU = uniqueItemIdsU.length > 0
        ? await tx.select().from(items).where(inArray(items.id, uniqueItemIdsU))
        : [];
      const itemMapU = new Map(allItemRowsU.map(i => [i.id, i]));

      // ── batch-fetch lot prices (N+1 fix) ──────────────────────────────────
      const uniqueLotIdsU = [...new Set(expandedLines.map(l => l.lotId).filter(Boolean) as string[])];
      const allLotRowsU = uniqueLotIdsU.length > 0
        ? await tx.select({ id: inventoryLots.id, salePrice: inventoryLots.salePrice }).from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIdsU))
        : [];
      const lotMapU = new Map(allLotRowsU.map(l => [l.id, l]));

      let subtotal = 0;
      const processedLines: { line: Partial<InsertSalesInvoiceLine>; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number; taxResult: LineTaxResult }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty || "0") || 0;
        const item = itemMapU.get(line.itemId!);

        // ── تسعير النظام: الباكند يُحدّد السعر دائماً — لا يثق بالعميل ──────
        // الأولوية: سعر الدُفعة (lotId) → سعر الصنف الحالي (salePriceCurrent)
        let salePrice = 0;
        if (item) {
          let baseMasterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          if (line.lotId) {
            const lot = lotMapU.get(line.lotId);
            const lotPrice = parseFloat(String(lot?.salePrice || "0")) || 0;
            if (lotPrice > 0) baseMasterPrice = lotPrice;
          }
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = baseMasterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = baseMasterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = baseMasterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = baseMasterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = baseMasterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = baseMasterPrice;
            }
          } else {
            salePrice = baseMasterPrice;
          }
        }

        const qtyInMinor = item ? convertQtyToMinor(qty, line.unitLevel || "major", item) : qty;

        // ── حساب الضريبة per-line (snapshot من الصنف) ──────────────────────
        const taxResult = computeLineTax({
          qty,
          salePrice,
          taxType: (item?.taxType as TaxType) ?? null,
          taxRate: parseFloat(item?.defaultTaxRate ?? "0") || 0,
          pricesIncludeTax: item?.pharmacyPricesIncludeTax ?? false,
        });

        const lineTotal = parseFloat(taxResult.lineTotal);
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal, taxResult });
      }

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal, taxResult } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
          // ── حصص التعاقد per-line ──────────────────────────────────────────
          companyId:          invoice.customerType === "contract" ? (invoice.companyId || null) : null,
          contractId:         invoice.customerType === "contract" ? (invoice.contractId || null) : null,
          contractMemberId:   invoice.customerType === "contract" ? ((invoice as any).contractMemberId || null) : null,
          companyShareAmount: invoice.customerType === "contract" ? (String((line as any).companyShareAmount || "0") || null) : null,
          patientShareAmount: invoice.customerType === "contract" ? (String((line as any).patientShareAmount || "0") || null) : null,
          coverageStatus:     invoice.customerType === "contract" ? ("covered" as any) : null,
          // ── ضريبة القيمة المضافة per-line ────────────────────────────────
          taxType: taxResult.taxType || null,
          taxRate: taxResult.taxRate > 0 ? String(taxResult.taxRate) : null,
          taxAmount: taxResult.taxAmount,
          netUnitPrice: taxResult.netUnitPrice,
          grossUnitPrice: taxResult.grossUnitPrice,
          lineNetAmount: taxResult.lineNetAmount,
          lineGrossAmount: taxResult.lineGrossAmount,
        } as unknown as import("@shared/schema").InsertSalesInvoiceLine);
      }

      const discountPercent = parseFloat(header.discountPercent || "0") || 0;
      const discountValue = parseFloat(header.discountValue || "0") || 0;
      const discountType = header.discountType || invoice.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || invoice.pharmacyId || null;
      const effectiveWarehouseId = header.warehouseId || invoice.warehouseId;
      if (header.warehouseId && header.warehouseId !== invoice.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      // ── إجماليات الضريبة على مستوى الفاتورة ─────────────────────────────
      const invoiceTaxTotals = computeInvoiceTaxTotals(processedLines.map(p => p.taxResult));

      // ── حصص التعاقد على مستوى السطور (update) ───────────────────────────
      let updatedPatientShareTotal: string | null = null;
      let updatedCompanyShareTotal: string | null = null;
      const effectiveCustomerType = header.customerType || invoice.customerType;
      if (effectiveCustomerType === "contract") {
        let pSum = 0, cSum = 0;
        for (const { line } of processedLines) {
          pSum += parseFloat(String((line as any).patientShareAmount || "0")) || 0;
          cSum += parseFloat(String((line as any).companyShareAmount || "0")) || 0;
        }
        if (pSum + cSum > 0.001) {
          updatedPatientShareTotal = String(pSum.toFixed(2));
          updatedCompanyShareTotal = String(cSum.toFixed(2));
        }
      }

      await tx.update(salesInvoiceHeaders).set({
        invoiceDate: header.invoiceDate || invoice.invoiceDate,
        warehouseId: effectiveWarehouseId,
        pharmacyId,
        customerType: effectiveCustomerType,
        customerName: header.customerName !== undefined ? header.customerName : invoice.customerName,
        customerId: effectiveCustomerType === "credit"
          ? (header.customerId !== undefined ? (header.customerId || null) : invoice.customerId)
          : null,
        contractCompany: header.contractCompany !== undefined ? header.contractCompany : invoice.contractCompany,
        companyId:        effectiveCustomerType === "contract"
          ? ((header as any).companyId !== undefined ? ((header as any).companyId || null) : (invoice.companyId || null))
          : null,
        contractId:       effectiveCustomerType === "contract"
          ? ((header as any).contractId !== undefined ? ((header as any).contractId || null) : (invoice.contractId || null))
          : null,
        contractMemberId: effectiveCustomerType === "contract"
          ? ((header as any).contractMemberId !== undefined ? ((header as any).contractMemberId || null) : ((invoice as any).contractMemberId || null))
          : null,
        patientShareTotal: (updatedPatientShareTotal as any),
        companyShareTotal:  (updatedCompanyShareTotal as any),
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes !== undefined ? header.notes : invoice.notes,
        createdBy: invoice.createdBy || header.createdBy || null,
        totalTaxAmount: invoiceTaxTotals.totalTaxAmount,
        totalNetAmount: invoiceTaxTotals.totalNetAmount,
        totalGrossAmount: invoiceTaxTotals.totalGrossAmount,
        updatedAt: new Date(),
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });
  }
};

export default methods;
