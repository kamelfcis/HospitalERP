import { db } from "../db";
import type { DrizzleTransaction } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { convertQtyToMinor } from "../inventory-helpers";
import {
  items,
  warehouses,
  salesInvoiceHeaders,
  salesInvoiceLines,
  inventoryLots,
} from "@shared/schema";
import type {
  SalesInvoiceHeader,
  InsertSalesInvoiceHeader,
  InsertSalesInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney } from "../finance-helpers";
import { computeLineTax, computeInvoiceTaxTotals, type LineTaxResult } from "../services/pharmacy-sales-tax-service";
import type { TaxType } from "../lib/tax/pharmacy-vat-engine";
import { logger } from "../lib/logger";


const methods = {

  async expandLinesFEFO(this: DatabaseStorage, tx: DrizzleTransaction, warehouseId: string, rawLines: Partial<InsertSalesInvoiceLine>[]): Promise<Partial<InsertSalesInvoiceLine>[]> {
    const expanded: Partial<InsertSalesInvoiceLine>[] = [];
    for (const line of rawLines) {
      if (!line.itemId) { expanded.push(line); continue; }
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

      {
        const epsilon = 0.0001;
        for (const rawLine of lines) {
          if (!rawLine.itemId) continue;
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

      const uniqueItemIds = [...new Set(expandedLines.map(l => l.itemId).filter(Boolean) as string[])];
      const allItemRows = uniqueItemIds.length > 0
        ? await tx.select().from(items).where(inArray(items.id, uniqueItemIds))
        : [];
      const itemMap = new Map(allItemRows.map(i => [i.id, i]));

      const uniqueLotIds = [...new Set(expandedLines.map(l => l.lotId).filter(Boolean) as string[])];
      const allLotRows = uniqueLotIds.length > 0
        ? await tx.select({ id: inventoryLots.id, salePrice: inventoryLots.salePrice }).from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIds))
        : [];
      const lotMap = new Map(allLotRows.map(l => [l.id, l]));

      let subtotal = 0;
      const processedLines: { line: Partial<InsertSalesInvoiceLine>; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number; taxResult: LineTaxResult }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty || "0") || 0;

        if ((line as any).lineType === "service" || !(line.itemId)) {
          const salePrice = parseFloat(String(line.salePrice || "0")) || 0;
          const lineTotal = parseFloat((salePrice * 1).toFixed(2));
          const taxResult = computeLineTax({ qty: 1, salePrice, taxType: null, taxRate: 0, pricesIncludeTax: false });
          subtotal += lineTotal;
          processedLines.push({ line, qty: 1, salePrice, qtyInMinor: 1, lineTotal, taxResult });
          continue;
        }

        if ((line as any).lineType === "consumable") {
          const qty = parseFloat(line.qty || "0") || 0;
          const item = itemMap.get(line.itemId!);
          const qtyInMinor = item ? convertQtyToMinor(qty, line.unitLevel || "major", item) : qty;
          const taxResult = computeLineTax({ qty, salePrice: 0, taxType: null, taxRate: 0, pricesIncludeTax: false });
          processedLines.push({ line, qty, salePrice: 0, qtyInMinor, lineTotal: 0, taxResult });
          continue;
        }

        const item = itemMap.get(line.itemId!);

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

      const invoiceTaxTotals = computeInvoiceTaxTotals(processedLines.map(p => p.taxResult));
      const pricesIncludeTaxForHeader = processedLines.length > 0
        ? (processedLines[0].line as any)?.pricesIncludeTax ?? false
        : false;

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
        patientId: (header as any).patientId || null,
        patientAssignedAt: (header as any).patientId ? new Date() : null,
        patientAssignedBy: (header as any).patientId ? ((header as any).createdBy || null) : null,
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
          lineType: (line as any).lineType || "item",
          itemId: line.itemId || null,
          serviceId: (line as any).serviceId || null,
          serviceDescription: (line as any).serviceDescription || null,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
          companyId:          invoice.customerType === "contract" ? (invoice.companyId || null) : null,
          contractId:         invoice.customerType === "contract" ? (invoice.contractId || null) : null,
          contractMemberId:   invoice.customerType === "contract" ? ((invoice as any).contractMemberId || null) : null,
          companyShareAmount: invoice.customerType === "contract" ? (String((line as any).companyShareAmount || "0") || null) : null,
          patientShareAmount: invoice.customerType === "contract" ? (String((line as any).patientShareAmount || "0") || null) : null,
          coverageStatus:     invoice.customerType === "contract" ? ("covered" as any) : null,
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
};

export default methods;
