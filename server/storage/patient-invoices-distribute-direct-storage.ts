import { db } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import {
  items,
  patientInvoiceHeaders,
  patientInvoiceLines,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  InsertPatientInvoiceHeader,
  InsertPatientInvoiceLine,
  PatientInvoiceLine,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { _convertLineToSmallest } from "./patient-invoices-distribute-storage";

const methods = {
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

        if (!item) {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const { distQty, distUnitPrice, distUnitLevel } = _convertLineToSmallest(
          origQty, origUnitPrice, origLevel, item
        );
        return { ...line, distQty, distUnitPrice, distUnitLevel };
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
