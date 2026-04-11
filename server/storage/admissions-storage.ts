import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  type Admission,
  type InsertAdmission,
  type PatientInvoiceHeader,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

type ConsolidationMode =
  | { kind: 'admission';   admissionId:   string }
  | { kind: 'visit_group'; visitGroupId:  string };

async function _consolidateInvoicesCore(
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

const methods = {

  async getAdmissions(this: DatabaseStorage, filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string; page?: number; pageSize?: number }): Promise<any[] | { data: any[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const paginate = filters?.page !== undefined;
    const page     = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const conds: any[] = [];
    if (filters?.status) conds.push(sql`a.status = ${filters.status}`);

    if (filters?.dateFrom) {
      conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    } else if (paginate && !filters?.dateTo) {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      conds.push(sql`a.admission_date >= ${d30.toISOString().slice(0, 10)}`);
    }
    if (filters?.dateTo) conds.push(sql`a.admission_date <= ${filters.dateTo}`);

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    if (filters?.deptId) {
      conds.push(sql`COALESCE(a.department_id, rpt.department_id) = ${filters.deptId}`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const limitClause = paginate
      ? sql`LIMIT ${pageSize} OFFSET ${offset}`
      : sql``;

    const countCol = paginate
      ? sql`, COUNT(*) OVER() AS total_count`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(rpt.net_amount,   0)                    AS total_net_amount,
        COALESCE(rpt.total_paid,   0)                    AS total_paid_amount,
        COALESCE(inv_latest.total_transferred, 0)        AS total_transferred_amount,
        inv_latest.latest_invoice_number                 AS latest_invoice_number,
        inv_latest.latest_invoice_id                     AS latest_invoice_id,
        inv_latest.latest_invoice_status                 AS latest_invoice_status,
        rpt.department_id                                AS latest_invoice_dept_id,
        rpt.department_name                              AS latest_invoice_dept_name,
        COALESCE(vg_cnt.visit_group_count, 0)            AS visit_group_count,
        pv.visit_number                                  AS visit_number
        ${countCol}
      FROM admissions a
      LEFT JOIN patient_visits pv ON pv.admission_id = a.id AND pv.visit_type = 'inpatient'
      LEFT JOIN rpt_patient_visit_summary rpt
        ON rpt.source_type = 'admission' AND rpt.source_id = a.id
      LEFT JOIN (
        SELECT
          pih.admission_id,
          (ARRAY_AGG(pih.invoice_number ORDER BY pih.created_at DESC))[1]  AS latest_invoice_number,
          (ARRAY_AGG(pih.id             ORDER BY pih.created_at DESC))[1]  AS latest_invoice_id,
          (ARRAY_AGG(pih.status         ORDER BY pih.created_at DESC))[1]  AS latest_invoice_status,
          COALESCE(SUM(dt_agg.dt_total), 0)                                AS total_transferred
        FROM patient_invoice_headers pih
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pih.id
        WHERE pih.status != 'cancelled'
          AND pih.admission_id IS NOT NULL
          AND pih.is_consolidated = false
        GROUP BY pih.admission_id
      ) inv_latest ON inv_latest.admission_id = a.id
      LEFT JOIN (
        SELECT
          admission_id,
          COUNT(DISTINCT visit_group_id) AS visit_group_count
        FROM patient_invoice_headers
        WHERE admission_id IS NOT NULL
          AND is_consolidated = false
          AND visit_group_id IS NOT NULL
        GROUP BY admission_id
      ) vg_cnt ON vg_cnt.admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
      ${limitClause}
    `);

    const rawRows = result.rows as any[];

    if (!paginate) {
      return rawRows.map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
      );
    }

    const total = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const data  = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });
    return { data, total, page, pageSize };
  },

  async getAdmission(this: DatabaseStorage, id: string): Promise<Admission | undefined> {
    const [a] = await db.select().from(admissions).where(eq(admissions.id, id));
    return a;
  },

  async createAdmission(this: DatabaseStorage, data: InsertAdmission): Promise<Admission> {
    const maxNumResult = await db.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(admission_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM admissions`);
    const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

    const [a] = await db.insert(admissions).values({
      ...data,
      admissionNumber: data.admissionNumber || String(nextNum),
    }).returning();
    return a;
  },

  async updateAdmission(this: DatabaseStorage, id: string, data: Partial<InsertAdmission>): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async dischargeAdmission(this: DatabaseStorage, id: string): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      status: "discharged",
      dischargeDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async getAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader[]> {
    return await db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.admissionId, admissionId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },

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

  async getPatientInquiry(
    this: DatabaseStorage,
    filters: {
      adminDeptFilter?: string | null;
      clinicId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      search?: string | null;
    },
    forcedDeptIds: string[] | null,
  ): Promise<{ rows: Record<string, unknown>[]; count: number; limit: number; hasMore: boolean }> {

    const LIMIT = 200;
    const esc = (s: string) => s.replace(/'/g, "''");

    let deptClause: string;
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    } else if (filters.adminDeptFilter) {
      deptClause = `AND pih.department_id = '${esc(filters.adminDeptFilter)}'`;
    } else {
      deptClause = "";
    }

    let clinicClause = "";
    if (filters.clinicId) {
      const safeClinic = esc(filters.clinicId);
      clinicClause = `AND EXISTS (
        SELECT 1 FROM clinic_appointments ca
        WHERE (
          (pih.patient_id IS NOT NULL AND ca.patient_id = pih.patient_id)
          OR (pih.patient_id IS NULL AND ca.patient_name = pih.patient_name)
        )
        AND ca.clinic_id = '${safeClinic}'
      )`;
    }

    let dateClause = "";
    if (filters.dateFrom) {
      dateClause += ` AND pih.invoice_date >= '${esc(filters.dateFrom)}'::date`;
    }
    if (filters.dateTo) {
      dateClause += ` AND pih.invoice_date <= '${esc(filters.dateTo)}'::date`;
    }

    let searchClause = "";
    if (filters.search?.trim()) {
      const term = `%${esc(filters.search.trim().replace(/%/g, "\\%"))}%`;
      searchClause = `AND (pih.patient_name ILIKE '${term}' OR pih.patient_phone ILIKE '${term}')`;
    }

    const result = await db.execute(sql.raw(`
      WITH filtered_invoices AS (
        SELECT
          pih.id,
          COALESCE(pih.patient_id, 'anon:' || pih.patient_name) AS uid,
          pih.patient_id,
          pih.patient_name,
          pih.patient_phone,
          pih.department_id,
          pih.invoice_date,
          pih.net_amount::numeric          AS net_amount,
          pih.paid_amount::numeric         AS paid_amount,
          (pih.net_amount - pih.paid_amount)::numeric AS outstanding
        FROM patient_invoice_headers pih
        WHERE pih.status != 'cancelled'
          ${deptClause}
          ${clinicClause}
          ${dateClause}
          ${searchClause}
      ),
      invoice_totals AS (
        SELECT
          uid,
          patient_id,
          patient_name,
          patient_phone,
          department_id,
          COUNT(id)          AS invoice_count,
          SUM(net_amount)    AS total_net,
          SUM(paid_amount)   AS total_paid,
          SUM(outstanding)   AS total_outstanding,
          MAX(invoice_date)  AS last_invoice_date
        FROM filtered_invoices
        GROUP BY uid, patient_id, patient_name, patient_phone, department_id
      ),
      line_totals AS (
        SELECT
          fi.uid,
          COALESCE(SUM(CASE WHEN pil.line_type = 'service'    AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS services_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'drug'       AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS drugs_total,
          COALESCE(SUM(CASE WHEN pil.line_type = 'consumable' AND NOT pil.is_void THEN pil.total_price::numeric END), 0) AS consumables_total
        FROM filtered_invoices fi
        JOIN patient_invoice_lines pil ON pil.header_id = fi.id
        GROUP BY fi.uid
      )
      SELECT
        it.uid,
        it.patient_id,
        p.patient_code,
        COALESCE(p.full_name, it.patient_name) AS patient_name,
        COALESCE(p.phone, it.patient_phone)    AS patient_phone,
        it.department_id,
        d.name_ar                              AS dept_name,
        it.invoice_count,
        COALESCE(lt.services_total,    0)      AS services_total,
        COALESCE(lt.drugs_total,       0)      AS drugs_total,
        COALESCE(lt.consumables_total, 0)      AS consumables_total,
        it.total_net,
        it.total_paid,
        it.total_outstanding,
        it.last_invoice_date
      FROM invoice_totals it
      LEFT JOIN patients    p  ON p.id  = it.patient_id
      LEFT JOIN departments d  ON d.id  = it.department_id
      LEFT JOIN line_totals lt ON lt.uid = it.uid
      ORDER BY it.last_invoice_date DESC NULLS LAST
      LIMIT ${LIMIT + 1}
    `));

    const all = result.rows as Record<string, unknown>[];
    const hasMore = all.length > LIMIT;
    const rows = hasMore ? all.slice(0, LIMIT) : all;

    return { rows, count: rows.length, limit: LIMIT, hasMore };
  },

  async getPatientInquiryLines(
    this: DatabaseStorage,
    patientKey: { patientId?: string | null; patientName?: string | null },
    forcedDeptIds: string[] | null,
    lineType?: string | null,
  ): Promise<Record<string, unknown>[]> {

    const esc = (s: string) => s.replace(/'/g, "''");

    let patientClause: string;
    if (patientKey.patientId) {
      patientClause = `pih.patient_id = '${esc(patientKey.patientId)}'`;
    } else if (patientKey.patientName) {
      patientClause = `(pih.patient_id IS NULL AND pih.patient_name = '${esc(patientKey.patientName)}')`;
    } else {
      return [];
    }

    let deptClause = "";
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    }

    let lineTypeClause = "";
    if (lineType && ["service", "drug", "consumable"].includes(lineType)) {
      lineTypeClause = `AND pil.line_type = '${lineType}'`;
    }

    const result = await db.execute(sql.raw(`
      SELECT
        pil.id               AS line_id,
        pil.line_type,
        pil.description,
        pil.quantity,
        pil.unit_price,
        pil.total_price,
        pih.invoice_number,
        pih.invoice_date,
        pih.status           AS invoice_status,
        pih.department_id,
        d.name_ar            AS dept_name
      FROM patient_invoice_lines pil
      JOIN patient_invoice_headers pih ON pih.id = pil.header_id
      LEFT JOIN departments d ON d.id = pih.department_id
      WHERE pih.status != 'cancelled'
        AND NOT pil.is_void
        AND ${patientClause}
        ${deptClause}
        ${lineTypeClause}
      ORDER BY pih.invoice_date DESC, pil.created_at DESC
    `));

    return result.rows as Record<string, unknown>[];
  },

};

export default methods;
