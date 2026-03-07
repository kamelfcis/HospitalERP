/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoices Distribution Storage — توزيع فواتير المرضى
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - التوزيع على مرضى متعددين (distributePatientInvoice)
 *  - التوزيع المباشر (distributePatientInvoiceDirect)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import {
  services,
  departments,
  items,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  PatientInvoiceWithDetails,
  InsertPatientInvoiceHeader,
  InsertPatientInvoiceLine,
  InsertPatientInvoicePayment,
  PatientInvoiceLine,
  PatientInvoicePayment,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {
  async distributePatientInvoice(this: DatabaseStorage, sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${sourceId} FOR UPDATE`);
      const source = lockResult.rows?.[0] as Record<string, unknown>;
      if (!source) throw new Error("فاتورة المصدر غير موجودة");
      if (source.status !== "draft") throw new Error("لا يمكن توزيع فاتورة نهائية");

      const sourceLines = await tx.select().from(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, sourceId)).orderBy(asc(patientInvoiceLines.sortOrder));
      if (sourceLines.length === 0) throw new Error("الفاتورة لا تحتوي على بنود");

      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter(l => l.itemId).map(l => l.itemId!)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as Record<string, unknown>)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: source.invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: source.patientType,
          departmentId: source.departmentId,
          warehouseId: source.warehouseId,
          doctorName: source.doctorName,
          contractName: source.contractName,
          notes: source.notes,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        } as unknown as InsertPatientInvoiceHeader).returning();

        const newLines: Partial<InsertPatientInvoiceLine>[] = [];

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li] as PatientInvoiceLine & { serviceType?: string; distUnitLevel: string; distQty: number; distUnitPrice: number };
          const totalQty = cl.distQty;

          if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
          let share: number;
          if (pi === numPatients - 1) {
            share = +(totalQty - allocatedSoFar[li]).toFixed(4);
          } else {
            const intQty = Math.round(totalQty);
            const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
            if (isInt && intQty >= numPatients) {
              const baseShare = Math.floor(intQty / numPatients);
              const remainder = intQty - baseShare * numPatients;
              share = pi < remainder ? baseShare + 1 : baseShare;
            } else {
              share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
            }
          }
          allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId,
            itemId: cl.itemId,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId,
            expiryMonth: cl.expiryMonth,
            expiryYear: cl.expiryYear,
            priceSource: cl.priceSource,
            doctorName: cl.doctorName,
            nurseName: cl.nurseName,
            notes: cl.notes,
            sortOrder: cl.sortOrder,
            sourceType: "dist_from_invoice",
            sourceId: `${sourceId}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines as unknown as import("@shared/schema").InsertPatientInvoiceLine[]);
          const totals = this.computeInvoiceTotals(newLines as unknown as Record<string, unknown>[], []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled",
        notes: `[توزيع على ${numPatients} مرضى]`,
        version: (parseInt(String(source.version)) || 1) + 1,
      }).where(eq(patientInvoiceHeaders.id, sourceId));

      return createdInvoices;
    });
  },

  async distributePatientInvoiceDirect(this: DatabaseStorage, data: {
    patients: { name: string; phone?: string }[];
    lines: PatientInvoiceLine[];
    invoiceDate: string;
    departmentId?: string | null;
    warehouseId?: string | null;
    doctorName?: string | null;
    patientType?: string;
    contractName?: string | null;
    notes?: string | null;
  }): Promise<PatientInvoiceHeader[]> {
    const { patients, lines: sourceLines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = data;
    if (sourceLines.length === 0) throw new Error("لا توجد بنود للتوزيع");

    return await db.transaction(async (tx) => {
      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter((l) => l.itemId).map((l) => l.itemId)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as Record<string, unknown>)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: (patientType || "cash") as "contract" | "cash",
          departmentId: departmentId || null,
          warehouseId: warehouseId || null,
          doctorName: doctorName || null,
          contractName: contractName || null,
          notes: notes || null,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        } as unknown as InsertPatientInvoiceHeader).returning();

        const newLines: Partial<InsertPatientInvoiceLine>[] = [];

        const DIRECT_SOURCE_TYPES = new Set(["STAY_ENGINE", "OR_ROOM"]);
        const DIRECT_SERVICE_TYPES = new Set(["ACCOMMODATION", "OPERATING_ROOM"]);
        const isDirectLine = (cl: PatientInvoiceLine & { serviceType?: string }) =>
          DIRECT_SOURCE_TYPES.has(cl.sourceType ?? "") || DIRECT_SERVICE_TYPES.has(cl.serviceType ?? "");

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li] as PatientInvoiceLine & { serviceType?: string; distUnitLevel: string; distQty: number; distUnitPrice: number };
          const totalQty = cl.distQty;

          let share: number;
          if (isDirectLine(cl)) {
            share = totalQty;
          } else {
            if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
            if (pi === numPatients - 1) {
              share = +(totalQty - allocatedSoFar[li]).toFixed(4);
            } else {
              const intQty = Math.round(totalQty);
              const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
              if (isInt && intQty >= numPatients) {
                const baseShare = Math.floor(intQty / numPatients);
                const remainder = intQty - baseShare * numPatients;
                share = pi < remainder ? baseShare + 1 : baseShare;
              } else {
                share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
              }
            }
            allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);
          }

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId || null,
            itemId: cl.itemId || null,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId || null,
            expiryMonth: cl.expiryMonth || null,
            expiryYear: cl.expiryYear || null,
            priceSource: cl.priceSource || null,
            doctorName: cl.doctorName || null,
            nurseName: cl.nurseName || null,
            notes: cl.notes || null,
            sortOrder: cl.sortOrder || 0,
            sourceType: isDirectLine(cl) ? (cl.sourceType || cl.serviceType) : "dist_direct",
            sourceId: isDirectLine(cl) && cl.sourceId
              ? `${cl.sourceId}:p${pi}`
              : `${invoiceDate}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines as unknown as import("@shared/schema").InsertPatientInvoiceLine[]);
          const totals = this.computeInvoiceTotals(newLines as unknown as Record<string, unknown>[], []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      return createdInvoices;
    });
  },
};

export default methods;
