import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientVisits,
  encounters,
  type Encounter,
} from "@shared/schema";

interface RoutedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  isNew: boolean;
}

export async function findOrCreateDraftInvoice(params: {
  visitId: string;
  patientId?: string | null;
  patientName: string;
  patientPhone?: string | null;
  departmentId?: string | null;
  warehouseId?: string | null;
  doctorName?: string | null;
  patientType?: "cash" | "contract";
  contractName?: string | null;
}, txCtx?: any): Promise<RoutedInvoice> {
  const q = txCtx ?? db;

  const existing = await q.select({
    id: patientInvoiceHeaders.id,
    invoiceNumber: patientInvoiceHeaders.invoiceNumber,
  }).from(patientInvoiceHeaders)
    .where(and(
      eq(patientInvoiceHeaders.visitId, params.visitId),
      eq(patientInvoiceHeaders.status, "draft"),
    ))
    .orderBy(patientInvoiceHeaders.createdAt)
    .limit(1);

  if (existing.length > 0) {
    return { invoiceId: existing[0].id, invoiceNumber: existing[0].invoiceNumber, isNew: false };
  }

  const cntRes = await q.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
  const seq = parseInt((cntRes.rows[0] as Record<string, unknown>)?.cnt as string ?? "0") + 1;
  const invoiceNumber = `PI-${String(seq).padStart(6, "0")}`;

  let warehouseId = params.warehouseId ?? null;
  if (!warehouseId && params.departmentId) {
    const whRes = await q.execute(
      sql`SELECT id FROM warehouses WHERE department_id = ${params.departmentId} LIMIT 1`
    );
    warehouseId = (whRes.rows[0] as Record<string, unknown>)?.id as string ?? null;
  }
  if (!warehouseId) {
    const whRes = await q.execute(sql`SELECT id FROM warehouses ORDER BY created_at LIMIT 1`);
    warehouseId = (whRes.rows[0] as Record<string, unknown>)?.id as string ?? null;
  }

  const [invoice] = await q.insert(patientInvoiceHeaders).values({
    invoiceNumber,
    patientName: params.patientName,
    patientPhone: params.patientPhone || "",
    patientId: params.patientId ?? null,
    visitId: params.visitId,
    departmentId: params.departmentId ?? null,
    warehouseId,
    doctorName: params.doctorName ?? null,
    patientType: params.patientType ?? "cash",
    contractName: params.contractName ?? null,
    status: "draft",
    invoiceDate: new Date().toISOString().split("T")[0] as unknown as Date,
    totalAmount: "0",
    discountAmount: "0",
    netAmount: "0",
    paidAmount: "0",
    version: 1,
  } as any).returning();

  console.log(`[ENCOUNTER_ROUTING] created draft invoice ${invoiceNumber} for visit ${params.visitId}`);

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, isNew: true };
}

export async function addLinesToVisitInvoice(params: {
  visitId: string;
  patientName: string;
  patientPhone?: string | null;
  patientId?: string | null;
  departmentId?: string | null;
  warehouseId?: string | null;
  doctorName?: string | null;
  patientType?: "cash" | "contract";
  contractName?: string | null;
  encounterType: "surgery" | "icu" | "ward" | "nursery" | "clinic" | "lab" | "radiology";
  encounterDoctorId?: string | null;
  encounterMetadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  lines: Array<{
    lineType: "service" | "drug" | "consumable" | "equipment";
    serviceId?: string | null;
    itemId?: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    discountAmount?: number;
    totalPrice?: number;
    sourceType?: string | null;
    sourceId?: string | null;
    sortOrder?: number;
    notes?: string | null;
  }>;
}): Promise<{ invoiceId: string; invoiceNumber: string; encounterId: string; isNewInvoice: boolean }> {
  return await db.transaction(async (tx) => {
    const routed = await findOrCreateDraftInvoice({
      visitId: params.visitId,
      patientId: params.patientId,
      patientName: params.patientName,
      patientPhone: params.patientPhone,
      departmentId: params.departmentId,
      warehouseId: params.warehouseId,
      doctorName: params.doctorName,
      patientType: params.patientType,
      contractName: params.contractName,
    }, tx);

    const [encounter] = await tx.insert(encounters).values({
      visitId: params.visitId,
      departmentId: params.departmentId ?? null,
      encounterType: params.encounterType,
      status: "active",
      doctorId: params.encounterDoctorId ?? null,
      startedAt: new Date(),
      metadata: params.encounterMetadata ?? null,
      createdBy: params.createdBy ?? null,
    } as any).returning();

    console.log(`[ENCOUNTER] created ${encounter.id} type=${params.encounterType} visit=${params.visitId}`);

    const existingMax = await tx.execute(
      sql`SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM patient_invoice_lines WHERE header_id = ${routed.invoiceId} AND is_void = false`
    );
    let sortBase = parseInt((existingMax.rows[0] as Record<string, unknown>)?.max_sort as string ?? "0") + 1;

    for (const line of params.lines) {
      const discPct = line.discountPercent ?? 0;
      const gross = line.quantity * line.unitPrice;
      const discAmt = line.discountAmount ?? (discPct > 0 ? gross * discPct / 100 : 0);
      const total = line.totalPrice ?? Math.max(gross - discAmt, 0);

      await tx.execute(sql`
        INSERT INTO patient_invoice_lines
          (header_id, line_type, service_id, item_id, description, quantity, unit_price,
           discount_percent, discount_amount, total_price, unit_level,
           sort_order, source_type, source_id, encounter_id, notes)
        VALUES
          (${routed.invoiceId}, ${line.lineType}, ${line.serviceId ?? null}, ${line.itemId ?? null},
           ${line.description}, ${String(line.quantity)}, ${String(line.unitPrice)},
           ${String(discPct)}, ${String(discAmt)}, ${String(total)}, 'minor',
           ${sortBase}, ${line.sourceType ?? null}, ${line.sourceId ?? null},
           ${encounter.id}, ${line.notes ?? null})
      `);
      sortBase++;
    }

    const totalsRes = await tx.execute(sql`
      SELECT
        COALESCE(SUM(total_price::numeric), 0) AS total,
        COALESCE(SUM(discount_amount::numeric), 0) AS discount
      FROM patient_invoice_lines
      WHERE header_id = ${routed.invoiceId} AND is_void = false
    `);
    const totals = totalsRes.rows[0] as Record<string, unknown>;
    const totalAmount = String(totals.total ?? "0");
    const discountAmount = String(totals.discount ?? "0");
    const netAmount = String(parseFloat(totalAmount) - parseFloat(discountAmount));

    const paidRes = await tx.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS paid
      FROM patient_invoice_payments
      WHERE header_id = ${routed.invoiceId}
    `);
    const paidAmount = String((paidRes.rows[0] as Record<string, unknown>)?.paid ?? "0");

    await tx.update(patientInvoiceHeaders).set({
      totalAmount,
      discountAmount,
      netAmount,
      paidAmount,
      updatedAt: new Date(),
    }).where(eq(patientInvoiceHeaders.id, routed.invoiceId));

    console.log(`[ENCOUNTER_ROUTING] added ${params.lines.length} line(s) to invoice ${routed.invoiceNumber} encounter=${encounter.id} type=${params.encounterType}`);

    return {
      invoiceId: routed.invoiceId,
      invoiceNumber: routed.invoiceNumber,
      encounterId: encounter.id,
      isNewInvoice: routed.isNew,
    };
  });
}
