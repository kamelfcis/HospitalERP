import { db } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import {
  services,
  departments,
  items,
  patients,
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
} from "@shared/schema";
import type {
  PatientInvoiceWithDetails,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getNextPatientInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const result = await db.select({ max: sql<string>`COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)` }).from(patientInvoiceHeaders);
    return (parseInt(result[0]?.max || "0") || 0) + 1;
  },

  async getNextPaymentRefNumber(this: DatabaseStorage, offset: number = 0): Promise<string> {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
      FROM patient_invoice_payments
      WHERE reference_number LIKE 'RCP-%'
    `);
    const maxNum = parseInt(((result.rows[0] as Record<string, unknown>).max_num as string | null | undefined) || "0") || 0;
    return `RCP-${String(maxNum + 1 + offset).padStart(6, "0")}`;
  },

  async getPatientInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: PatientInvoiceWithDetails[]; total: number}> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(patientInvoiceHeaders.status, filters.status as "draft" | "finalized" | "cancelled"));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${patientInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(gte(patientInvoiceHeaders.invoiceDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(patientInvoiceHeaders.invoiceDate, filters.dateTo));
    if (filters.patientName) conditions.push(ilike(patientInvoiceHeaders.patientName, `%${filters.patientName}%`));
    if (filters.doctorName) conditions.push(ilike(patientInvoiceHeaders.doctorName, `%${filters.doctorName}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(patientInvoiceHeaders).where(where);
    const total = Number(countResult?.count || 0);

    const data = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(where)
      .orderBy(desc(patientInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: data.map(r => ({ ...r.header, department: r.department })) as unknown as PatientInvoiceWithDetails[],
      total,
    };
  },

  async getPatientInvoice(this: DatabaseStorage, id: string): Promise<PatientInvoiceWithDetails | undefined> {
    const [headerRow] = await db.select({
      header:           patientInvoiceHeaders,
      department:       departments,
      patientCode:      patients.patientCode,
      admDoctorName:    admissions.doctorName,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .leftJoin(patients,    eq(patientInvoiceHeaders.patientId,    patients.id))
      .leftJoin(admissions,  eq(patientInvoiceHeaders.admissionId,  admissions.id))
      .where(eq(patientInvoiceHeaders.id, id));

    if (!headerRow) return undefined;

    const [lines, payments, aptCtxRes] = await Promise.all([
      db.select({
        line:    patientInvoiceLines,
        service: services,
        item:    items,
      })
        .from(patientInvoiceLines)
        .leftJoin(services, eq(patientInvoiceLines.serviceId, services.id))
        .leftJoin(items,    eq(patientInvoiceLines.itemId,    items.id))
        .where(eq(patientInvoiceLines.headerId, id))
        .orderBy(asc(patientInvoiceLines.sortOrder)),

      db.select()
        .from(patientInvoicePayments)
        .where(eq(patientInvoicePayments.headerId, id))
        .orderBy(asc(patientInvoicePayments.createdAt)),

      db.execute(sql`
        SELECT
          ca.id           AS opd_appointment_id,
          ca.status       AS opd_apt_status,
          ca.payment_type AS opd_payment_type,
          cl.name_ar      AS opd_clinic_name,
          dr.name         AS opd_doctor_name,
          dp.name_ar      AS opd_department_name
        FROM clinic_appointments ca
        LEFT JOIN clinic_clinics cl ON cl.id = ca.clinic_id
        LEFT JOIN doctors        dr ON dr.id = ca.doctor_id
        LEFT JOIN departments    dp ON dp.id = cl.department_id
        WHERE ca.invoice_id = ${id}
        LIMIT 1
      `),
    ]);

    const aptRow = (aptCtxRes.rows as Array<Record<string, unknown>>)[0] ?? null;

    const effectiveDoctorName =
      headerRow.header.doctorName ||
      headerRow.admDoctorName ||
      null;

    return {
      ...headerRow.header,
      doctorName:  effectiveDoctorName,
      patientCode: headerRow.patientCode || null,
      department:  headerRow.department  || undefined,
      lines:       lines.map(l => ({ ...l.line, service: l.service || undefined, item: l.item || undefined })),
      payments,
      opdContext: aptRow ? {
        appointmentId:  String(aptRow.opd_appointment_id),
        aptStatus:      String(aptRow.opd_apt_status   ?? ""),
        paymentType:    String(aptRow.opd_payment_type  ?? ""),
        clinicName:     aptRow.opd_clinic_name     ? String(aptRow.opd_clinic_name)     : null,
        doctorName:     aptRow.opd_doctor_name     ? String(aptRow.opd_doctor_name)     : null,
        departmentName: aptRow.opd_department_name ? String(aptRow.opd_department_name) : null,
      } : null,
    };
  },
};

export default methods;
