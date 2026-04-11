import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  type PatientInvoiceHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

type ConsolidationMode =
  | { kind: 'admission';   admissionId:   string }
  | { kind: 'visit_group'; visitGroupId:  string };

export async function _consolidateInvoicesCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  mode: ConsolidationMode,
  patientName: string,
  patientPhone: string | null,
  doctorName: string | null,
  notesLabel: string,
): Promise<PatientInvoiceHeader> {
  await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);

  const sourceFilter =
    mode.kind === 'admission'
      ? eq(patientInvoiceHeaders.admissionId, mode.admissionId)
      : eq(patientInvoiceHeaders.visitGroupId, mode.visitGroupId);

  const invoices = await tx.select().from(patientInvoiceHeaders)
    .where(and(sourceFilter, eq(patientInvoiceHeaders.isConsolidated, false)))
    .orderBy(asc(patientInvoiceHeaders.createdAt));

  if (invoices.length === 0) throw new Error("لا توجد فواتير لتجميعها");

  if (mode.kind === 'visit_group') {
    const registeredIds = (invoices as PatientInvoiceHeader[])
      .map(i => (i as PatientInvoiceHeader & { patientId?: string | null }).patientId)
      .filter((id): id is string => Boolean(id));
    const uniquePatientIds = new Set(registeredIds);
    if (uniquePatientIds.size > 1) {
      throw new Error("لا يمكن تجميع فواتير تخص مرضى مختلفين في نفس المجموعة");
    }
  }

  const existingConsolidated = await tx.select().from(patientInvoiceHeaders)
    .where(and(sourceFilter, eq(patientInvoiceHeaders.isConsolidated, true)));

  if (existingConsolidated.length > 0) {
    for (const ec of existingConsolidated) {
      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, ec.id));
      await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, ec.id));
    }
  }

  const maxNumResult = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
    FROM patient_invoice_headers
  `);
  const nextNum = (parseInt(String((maxNumResult.rows[0] as { max_num: string })?.max_num || "0")) || 0) + 1;

  const totalAmount   = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.totalAmount), 0);
  const discountAmount= invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.discountAmount), 0);
  const netAmount     = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.netAmount), 0);
  const paidAmount    = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.paidAmount), 0);

  const uniqueSourceIds = [...new Set(invoices.map((i: PatientInvoiceHeader) => i.id))];

  const consolidatedValues: Record<string, unknown> = {
    invoiceNumber:   String(nextNum),
    invoiceDate:     new Date().toISOString().split("T")[0],
    patientName,
    patientPhone,
    patientType:     invoices[0].patientType,
    isConsolidated:  true,
    sourceInvoiceIds: JSON.stringify(uniqueSourceIds),
    doctorName,
    notes:           notesLabel,
    status:          "draft",
    totalAmount:     String(+totalAmount.toFixed(2)),
    discountAmount:  String(+discountAmount.toFixed(2)),
    netAmount:       String(+netAmount.toFixed(2)),
    paidAmount:      String(+paidAmount.toFixed(2)),
  };

  if (mode.kind === 'admission') {
    consolidatedValues.admissionId = mode.admissionId;
  } else {
    consolidatedValues.visitGroupId = mode.visitGroupId;
  }

  const [consolidated] = await tx.insert(patientInvoiceHeaders).values(consolidatedValues).returning();

  let sortOrder = 0;
  for (const inv of invoices) {
    const lines = await tx.select().from(patientInvoiceLines)
      .where(eq(patientInvoiceLines.headerId, inv.id))
      .orderBy(asc(patientInvoiceLines.sortOrder));

    if (lines.length === 0) continue;

    const newLines = lines.map((l: typeof patientInvoiceLines.$inferSelect) => ({
      headerId:        consolidated.id,
      lineType:        l.lineType,
      serviceId:       l.serviceId,
      itemId:          l.itemId,
      description:     l.description,
      quantity:        l.quantity,
      unitPrice:       l.unitPrice,
      discountPercent: l.discountPercent,
      discountAmount:  l.discountAmount,
      totalPrice:      l.totalPrice,
      unitLevel:       l.unitLevel,
      lotId:           l.lotId,
      expiryMonth:     l.expiryMonth,
      expiryYear:      l.expiryYear,
      priceSource:     l.priceSource,
      doctorName:      l.doctorName,
      nurseName:       l.nurseName,
      businessClassification: l.businessClassification,
      notes: l.notes
        ? `[${inv.invoiceNumber}] ${l.notes}`
        : `[فاتورة ${inv.invoiceNumber}]`,
      sortOrder: sortOrder++,
      sourceType: l.sourceType ?? "dept_service_invoice",
      sourceId:   l.sourceId   ?? inv.id,
    }));

    await tx.insert(patientInvoiceLines).values(newLines);
  }

  const [finalHeader] = await tx.select().from(patientInvoiceHeaders)
    .where(eq(patientInvoiceHeaders.id, consolidated.id));
  return finalHeader;
}

const consolidationMethods = {

  async consolidateAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [admission] = await tx.select().from(admissions).where(eq(admissions.id, admissionId));
      if (!admission) throw new Error("الإقامة غير موجودة");

      return _consolidateInvoicesCore(
        tx,
        { kind: 'admission', admissionId },
        admission.patientName,
        admission.patientPhone ?? null,
        admission.doctorName   ?? null,
        `فاتورة مجمعة - إقامة رقم ${admission.admissionNumber}`,
      );
    });
  },

  async consolidateVisitGroupInvoices(this: DatabaseStorage, visitGroupId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [firstInvoice] = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.visitGroupId, visitGroupId),
          eq(patientInvoiceHeaders.isConsolidated, false),
        ))
        .orderBy(asc(patientInvoiceHeaders.createdAt))
        .limit(1);

      if (!firstInvoice) throw new Error("لا توجد فواتير لهذه المجموعة");

      return _consolidateInvoicesCore(
        tx,
        { kind: 'visit_group', visitGroupId },
        firstInvoice.patientName,
        firstInvoice.patientPhone ?? null,
        firstInvoice.doctorName   ?? null,
        `فاتورة مجمعة - زيارة ${visitGroupId.slice(0, 8)}`,
      );
    });
  },

  async getVisitGroupInvoices(this: DatabaseStorage, visitGroupId: string): Promise<PatientInvoiceHeader[]> {
    return db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.visitGroupId, visitGroupId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },
};

export default consolidationMethods;
