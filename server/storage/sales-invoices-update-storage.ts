import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
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


const methods = {

  async updateSalesInvoice(this: DatabaseStorage, id: string, header: Partial<InsertSalesInvoiceHeader>, lines: Partial<InsertSalesInvoiceLine>[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

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

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId ?? invoice.warehouseId, lines);

      const uniqueItemIdsU = [...new Set(expandedLines.map(l => l.itemId).filter(Boolean) as string[])];
      const allItemRowsU = uniqueItemIdsU.length > 0
        ? await tx.select().from(items).where(inArray(items.id, uniqueItemIdsU))
        : [];
      const itemMapU = new Map(allItemRowsU.map(i => [i.id, i]));

      const uniqueLotIdsU = [...new Set(expandedLines.map(l => l.lotId).filter(Boolean) as string[])];
      const allLotRowsU = uniqueLotIdsU.length > 0
        ? await tx.select({ id: inventoryLots.id, salePrice: inventoryLots.salePrice }).from(inventoryLots).where(inArray(inventoryLots.id, uniqueLotIdsU))
        : [];
      const lotMapU = new Map(allLotRowsU.map(l => [l.id, l]));

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
          const qtyC = parseFloat(line.qty || "0") || 0;
          const itemC = itemMapU.get(line.itemId!);
          const qtyInMinorC = itemC ? convertQtyToMinor(qtyC, line.unitLevel || "major", itemC) : qtyC;
          const taxResultC = computeLineTax({ qty: qtyC, salePrice: 0, taxType: null, taxRate: 0, pricesIncludeTax: false });
          processedLines.push({ line, qty: qtyC, salePrice: 0, qtyInMinor: qtyInMinorC, lineTotal: 0, taxResult: taxResultC });
          continue;
        }

        const item = itemMapU.get(line.itemId!);

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

      const invoiceTaxTotals = computeInvoiceTaxTotals(processedLines.map(p => p.taxResult));

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
        patientId: (header as any).patientId !== undefined ? ((header as any).patientId || null) : (invoice as any).patientId,
        patientAssignedAt: (() => {
          const newPid = (header as any).patientId !== undefined ? ((header as any).patientId || null) : (invoice as any).patientId;
          const oldPid = (invoice as any).patientId || null;
          if (newPid && !oldPid) return new Date();
          return (invoice as any).patientAssignedAt ?? null;
        })(),
        patientAssignedBy: (() => {
          const newPid = (header as any).patientId !== undefined ? ((header as any).patientId || null) : (invoice as any).patientId;
          const oldPid = (invoice as any).patientId || null;
          if (newPid && !oldPid) return (header as any).createdBy || null;
          return (invoice as any).patientAssignedBy ?? null;
        })(),
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
