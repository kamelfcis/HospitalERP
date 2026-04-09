import { db } from "../db";
import { sql } from "drizzle-orm";

export interface EncounterLineSummary {
  id: string;
  lineType: string;
  serviceId: string | null;
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  totalPrice: string;
  sortOrder: number;
  sourceType: string | null;
  sourceId: string | null;
  notes: string | null;
  businessClassification: string | null;
  createdAt: string;
}

export interface EncounterSummary {
  id: string;
  encounterType: string;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  parentEncounterId: string | null;
  startedAt: string;
  endedAt: string | null;
  metadata: Record<string, unknown> | null;
  lines: EncounterLineSummary[];
  totals: {
    gross: number;
    discount: number;
    net: number;
    lineCount: number;
  };
}

export interface PaymentSummary {
  id: string;
  amount: string;
  paymentMethod: string;
  treasuryId: string | null;
  treasuryName: string | null;
  notes: string | null;
  paymentDate: string;
  createdAt: string;
}

export interface VisitInvoiceSummary {
  visit: {
    id: string;
    visitNumber: string;
    patientId: string;
    patientName: string;
    visitType: string;
    status: string;
    departmentId: string | null;
    departmentName: string | null;
    admissionId: string | null;
    createdAt: string;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    isFinalClosed: boolean;
    invoiceDate: string;
    version: number;
  } | null;
  encounters: EncounterSummary[];
  unlinkedLines: EncounterLineSummary[];
  totals: {
    gross: number;
    discount: number;
    net: number;
    paid: number;
    remaining: number;
    lineCount: number;
    encounterCount: number;
  };
  departmentBreakdown: Array<{
    departmentId: string | null;
    departmentName: string | null;
    gross: number;
    discount: number;
    net: number;
    lineCount: number;
  }>;
  classificationBreakdown: Array<{
    classification: string | null;
    gross: number;
    discount: number;
    net: number;
    lineCount: number;
  }>;
  payments: PaymentSummary[];
  readiness: {
    hasInvoice: boolean;
    allLinesHaveEncounter: boolean;
    totalsMatch: boolean;
    isFullyPaid: boolean;
    canFinalize: boolean;
    issues: string[];
  };
}

export async function getVisitInvoiceSummary(visitId: string): Promise<VisitInvoiceSummary> {
  const visitRes = await db.execute(sql`
    SELECT pv.*,
           p.name AS patient_name,
           d.name_ar AS department_name
    FROM patient_visits pv
    LEFT JOIN patients p ON p.id = pv.patient_id
    LEFT JOIN departments d ON d.id = pv.department_id
    WHERE pv.id = ${visitId}
  `);
  if (!visitRes.rows.length) throw Object.assign(new Error("الزيارة غير موجودة"), { statusCode: 404 });
  const v = visitRes.rows[0] as Record<string, unknown>;

  const invoiceRes = await db.execute(sql`
    SELECT id, invoice_number, status, is_final_closed, invoice_date, version, net_amount
    FROM patient_invoice_headers
    WHERE visit_id = ${visitId} AND status IN ('draft', 'finalized')
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `);
  const inv = invoiceRes.rows[0] as Record<string, unknown> | undefined;
  const invoiceId = inv?.id as string | undefined;

  const encountersRes = await db.execute(sql`
    SELECT e.*,
           d.name_ar AS department_name,
           doc.name AS doctor_name
    FROM encounters e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN doctors doc ON doc.id = e.doctor_id
    WHERE e.visit_id = ${visitId}
    ORDER BY e.started_at ASC
  `);

  let allLines: Array<Record<string, unknown>> = [];
  let payments: Array<Record<string, unknown>> = [];

  if (invoiceId) {
    const linesRes = await db.execute(sql`
      SELECT pil.id, pil.line_type, pil.service_id, pil.item_id,
             pil.description, pil.quantity, pil.unit_price,
             pil.discount_percent, pil.discount_amount, pil.total_price,
             pil.sort_order, pil.source_type, pil.source_id,
             pil.encounter_id, pil.notes, pil.business_classification,
             pil.created_at
      FROM patient_invoice_lines pil
      WHERE pil.header_id = ${invoiceId} AND pil.is_void = false
      ORDER BY pil.sort_order, pil.created_at
    `);
    allLines = linesRes.rows as Array<Record<string, unknown>>;

    const paymentsRes = await db.execute(sql`
      SELECT pip.id, pip.amount, pip.payment_method,
             pip.treasury_id, t.name_ar AS treasury_name,
             pip.notes, pip.payment_date, pip.created_at
      FROM patient_invoice_payments pip
      LEFT JOIN treasuries t ON t.id = pip.treasury_id
      WHERE pip.header_id = ${invoiceId}
      ORDER BY pip.created_at ASC
    `);
    payments = paymentsRes.rows as Array<Record<string, unknown>>;
  }

  const encounterMap = new Map<string, EncounterSummary>();
  for (const enc of encountersRes.rows as Array<Record<string, unknown>>) {
    encounterMap.set(enc.id as string, {
      id: enc.id as string,
      encounterType: enc.encounter_type as string,
      status: enc.status as string,
      departmentId: enc.department_id as string | null,
      departmentName: enc.department_name as string | null,
      doctorId: enc.doctor_id as string | null,
      doctorName: enc.doctor_name as string | null,
      parentEncounterId: enc.parent_encounter_id as string | null,
      startedAt: String(enc.started_at),
      endedAt: enc.ended_at ? String(enc.ended_at) : null,
      metadata: enc.metadata as Record<string, unknown> | null,
      lines: [],
      totals: { gross: 0, discount: 0, net: 0, lineCount: 0 },
    });
  }

  const unlinkedLines: EncounterLineSummary[] = [];
  let totalGross = 0, totalDiscount = 0, totalNet = 0;

  for (const line of allLines) {
    const lineSummary: EncounterLineSummary = {
      id: line.id as string,
      lineType: line.line_type as string,
      serviceId: line.service_id as string | null,
      itemId: line.item_id as string | null,
      description: line.description as string,
      quantity: String(line.quantity),
      unitPrice: String(line.unit_price),
      discountPercent: String(line.discount_percent ?? "0"),
      discountAmount: String(line.discount_amount ?? "0"),
      totalPrice: String(line.total_price),
      sortOrder: parseInt(String(line.sort_order ?? "0")),
      sourceType: line.source_type as string | null,
      sourceId: line.source_id as string | null,
      notes: line.notes as string | null,
      businessClassification: line.business_classification as string | null,
      createdAt: String(line.created_at),
    };

    const gross = parseFloat(String(line.total_price ?? "0"));
    const disc = parseFloat(String(line.discount_amount ?? "0"));
    totalGross += gross + disc;
    totalDiscount += disc;
    totalNet += gross;

    const encId = line.encounter_id as string | null;
    if (encId && encounterMap.has(encId)) {
      const enc = encounterMap.get(encId)!;
      enc.lines.push(lineSummary);
      enc.totals.gross += gross + disc;
      enc.totals.discount += disc;
      enc.totals.net += gross;
      enc.totals.lineCount++;
    } else {
      unlinkedLines.push(lineSummary);
    }
  }

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(String(p.amount ?? "0")), 0);

  const deptMap = new Map<string | null, { departmentName: string | null; gross: number; discount: number; net: number; lineCount: number }>();
  const classMap = new Map<string | null, { gross: number; discount: number; net: number; lineCount: number }>();

  for (const line of allLines) {
    const encId = line.encounter_id as string | null;
    const enc = encId ? encounterMap.get(encId) : null;
    const deptId = enc?.departmentId ?? null;
    const deptName = enc?.departmentName ?? null;
    const classification = line.business_classification as string | null;
    const gross = parseFloat(String(line.total_price ?? "0")) + parseFloat(String(line.discount_amount ?? "0"));
    const disc = parseFloat(String(line.discount_amount ?? "0"));
    const net = parseFloat(String(line.total_price ?? "0"));

    if (!deptMap.has(deptId)) deptMap.set(deptId, { departmentName: deptName, gross: 0, discount: 0, net: 0, lineCount: 0 });
    const d = deptMap.get(deptId)!;
    d.gross += gross; d.discount += disc; d.net += net; d.lineCount++;

    if (!classMap.has(classification)) classMap.set(classification, { gross: 0, discount: 0, net: 0, lineCount: 0 });
    const c = classMap.get(classification)!;
    c.gross += gross; c.discount += disc; c.net += net; c.lineCount++;
  }

  const encountersArray = Array.from(encounterMap.values());
  const orphanLines = unlinkedLines.length;
  const allHaveEncounter = orphanLines === 0 && allLines.length > 0;
  const remaining = totalNet - totalPaid;
  const isFullyPaid = remaining <= 0.01;

  const issues: string[] = [];
  if (!inv) issues.push("لا توجد فاتورة مرتبطة بالزيارة");
  if (orphanLines > 0) issues.push(`${orphanLines} بند بدون مقابلة طبية`);
  if (!isFullyPaid && inv) issues.push(`متبقي ${remaining.toFixed(2)} جنيه`);
  if (allLines.length === 0 && inv) issues.push("الفاتورة فارغة بدون بنود");

  return {
    visit: {
      id: v.id as string,
      visitNumber: v.visit_number as string,
      patientId: v.patient_id as string,
      patientName: (v.patient_name as string) ?? "",
      visitType: v.visit_type as string,
      status: v.status as string,
      departmentId: v.department_id as string | null,
      departmentName: v.department_name as string | null,
      admissionId: v.admission_id as string | null,
      createdAt: String(v.created_at),
    },
    invoice: inv ? {
      id: inv.id as string,
      invoiceNumber: inv.invoice_number as string,
      status: inv.status as string,
      isFinalClosed: Boolean(inv.is_final_closed),
      invoiceDate: String(inv.invoice_date),
      version: parseInt(String(inv.version ?? "1")),
    } : null,
    encounters: encountersArray,
    unlinkedLines,
    totals: {
      gross: totalGross,
      discount: totalDiscount,
      net: totalNet,
      paid: totalPaid,
      remaining: Math.max(remaining, 0),
      lineCount: allLines.length,
      encounterCount: encountersArray.length,
    },
    departmentBreakdown: Array.from(deptMap.entries()).map(([deptId, data]) => ({
      departmentId: deptId,
      departmentName: data.departmentName,
      ...data,
    })),
    classificationBreakdown: Array.from(classMap.entries()).map(([classification, data]) => ({
      classification,
      ...data,
    })),
    payments: payments.map(p => ({
      id: p.id as string,
      amount: String(p.amount),
      paymentMethod: p.payment_method as string,
      treasuryId: p.treasury_id as string | null,
      treasuryName: p.treasury_name as string | null,
      notes: p.notes as string | null,
      paymentDate: String(p.payment_date ?? ""),
      createdAt: String(p.created_at),
    })),
    readiness: {
      hasInvoice: !!inv,
      allLinesHaveEncounter: allHaveEncounter,
      totalsMatch: !inv || Math.abs(parseFloat(String(inv.net_amount ?? totalNet)) - totalNet) < 0.01,
      isFullyPaid,
      canFinalize: !!inv && inv.status === "draft" && allHaveEncounter && isFullyPaid && issues.length === 0,
      issues,
    },
  };
}
