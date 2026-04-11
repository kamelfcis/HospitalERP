import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  InsertPatientInvoiceHeader,
  InsertPatientInvoiceLine,
  InsertPatientInvoicePayment,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { parseMoney, roundMoney } from "../finance-helpers";

const createMethods = {

  async createPatientInvoice(this: DatabaseStorage, header: Partial<InsertPatientInvoiceHeader>, lines: Partial<InsertPatientInvoiceLine>[], payments: Partial<InsertPatientInvoicePayment>[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(patientInvoiceHeaders).values({ ...header, version: 1 } as InsertPatientInvoiceHeader).returning();

      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l, i) => ({ ...l, headerId: created.id, sortOrder: i }) as unknown as import("@shared/schema").InsertPatientInvoiceLine)
        );
      }

      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p) => ({ ...p, headerId: created.id }) as unknown as import("@shared/schema").InsertPatientInvoicePayment));
      }

      const totals = this.computeInvoiceTotals(lines as unknown as Record<string, unknown>[], payments as unknown as Record<string, unknown>[]);
      await tx.update(patientInvoiceHeaders).set(totals).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  },

  async updatePatientInvoice(this: DatabaseStorage, id: string, header: Partial<InsertPatientInvoiceHeader>, lines: Partial<InsertPatientInvoiceLine>[], payments: Partial<InsertPatientInvoicePayment>[], expectedVersion?: number): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as Record<string, unknown>;
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      if (expectedVersion != null && existing.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const newVersion = ((existing.version as number | null | undefined) || 1) + 1;

      const oldLines = await tx.select().from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.headerId, id));

      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, id));
      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l, i) => ({ ...l, headerId: id, sortOrder: i }) as unknown as import("@shared/schema").InsertPatientInvoiceLine));
      }

      await tx.delete(patientInvoicePayments).where(eq(patientInvoicePayments.headerId, id));
      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p) => ({ ...p, headerId: id }) as unknown as import("@shared/schema").InsertPatientInvoicePayment));
      }

      const totals = this.computeInvoiceTotals(lines as unknown as Record<string, unknown>[], payments as unknown as Record<string, unknown>[]);
      const existingHeaderDiscount = parseMoney((existing as Record<string, unknown>).header_discount_amount as string | null | undefined ?? "0");
      const adjustedNetAmount = roundMoney(parseMoney(totals.netAmount) - existingHeaderDiscount);
      await tx.update(patientInvoiceHeaders).set({
        ...header,
        ...totals,
        netAmount: adjustedNetAmount,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(patientInvoiceHeaders.id, id));

      const oldStayLines = oldLines.filter((l) => l.sourceType === "STAY_ENGINE");
      const newStayLines = lines.filter((l) => l.sourceType === "STAY_ENGINE");

      const oldStayMap = new Map(oldStayLines.map(l => [l.sourceId, l]));
      const newStayMap = new Map(newStayLines.map(l => [l.sourceId, l]));

      const stayAuditValues: Array<{
        tableName: string; recordId: string; action: string;
        oldValues?: string; newValues?: string;
      }> = [];

      for (const ns of newStayLines) {
        const match = oldStayMap.get(ns.sourceId!);
        if (match && (String(match.quantity) !== String(ns.quantity) || String(match.unitPrice) !== String(ns.unitPrice) || String(match.totalPrice) !== String(ns.totalPrice))) {
          stayAuditValues.push({
            tableName: "patient_invoice_lines", recordId: id, action: "stay_edit",
            oldValues: JSON.stringify({ sourceId: match.sourceId, quantity: match.quantity, unitPrice: match.unitPrice, totalPrice: match.totalPrice }),
            newValues: JSON.stringify({ sourceId: ns.sourceId, quantity: ns.quantity, unitPrice: ns.unitPrice, totalPrice: ns.totalPrice }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${ns.sourceId} qty ${match.quantity} → ${ns.quantity}`);
        }
      }
      for (const os of oldStayLines) {
        if (!newStayMap.has(os.sourceId!)) {
          stayAuditValues.push({
            tableName: "patient_invoice_lines", recordId: id, action: "stay_void",
            oldValues: JSON.stringify({ sourceId: os.sourceId, quantity: os.quantity, totalPrice: os.totalPrice }),
            newValues: JSON.stringify({ removed: true }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${os.sourceId} REMOVED`);
        }
      }
      if (stayAuditValues.length > 0) {
        await tx.insert(auditLog).values(stayAuditValues as any);
      }

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      return result;
    });
  },

};

export default createMethods;
