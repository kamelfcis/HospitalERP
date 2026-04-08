import { db, pool } from "../db";
import { eq, and, sql, or, asc, ilike, ne, isNull } from "drizzle-orm";
import {
  patients,
  doctors,
  admissions,
  clinicAppointments,
  patientMergeAudit,
  patientAliases,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  doctorTransfers,
  doctorSettlementAllocations,
  type Patient,
  type PatientSearchResult,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type PatientInvoiceHeader,
} from "@shared/schema";
import {
  normalizePatientIdentity,
  scoreCandidateMatch,
  scoreToStatus,
  statusToRecommendedAction,
  DEDUP_BLOCK_THRESHOLD,
  DEDUP_WARN_THRESHOLD,
  normalizeArabicName,
  type DuplicateCandidate,
  type DuplicateCheckResult,
} from "../services/patient-dedup";
import type { DatabaseStorage } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation Core — دالة مشتركة بين admission و visit_group
// ─────────────────────────────────────────────────────────────────────────────
// تحذير: لا تستدعِ هذه الدالة مباشرة من الـ routes. استخدم الـ wrapper methods.
// ─────────────────────────────────────────────────────────────────────────────

type ConsolidationMode =
  | { kind: 'admission';   admissionId:   string }
  | { kind: 'visit_group'; visitGroupId:  string };

/**
 * _consolidateInvoicesCore
 * ─────────────────────────────────────────────────────────────────────────────
 * الدالة المشتركة للتجميع. تقبل Drizzle transaction و mode.
 * كلتا حالتَي (admission / visit_group) تستخدمان نفس منطق التجميع.
 *
 * Safety guarantees:
 * - لا تجمع فاتورة is_consolidated=true ضمن المصادر (تمنع double-counting)
 * - تحذف الفاتورة المجمعة القديمة لنفس الـ reference قبل إنشاء الجديدة
 *   (TODO: يمكن تحسينه مستقبلاً إلى soft-update لتجنب فقدان تعديلات يدوية)
 * - تحافظ على source_type/source_id لكل بند (Phase-1 traceability)
 * - لا تخلط visit_group مع admission في نفس المجمعة
 */
async function _consolidateInvoicesCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  mode: ConsolidationMode,
  patientName: string,
  patientPhone: string | null,
  doctorName: string | null,
  notesLabel: string,
): Promise<PatientInvoiceHeader> {
  // ── 0. Lock أولاً — يمنع race condition عند تشغيل consolidation متزامن ───
  // الـ LOCK يجب أن يكون أول عملية داخل الـ transaction حتى يكون المسح والإنشاء
  // كلاهما تحت نفس الحماية الكاملة. أي transaction ثانية ستنتظر هنا حتى COMMIT.
  await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);

  // ── 1. بناء شرط الفلتر حسب الـ mode ─────────────────────────────────────
  const sourceFilter =
    mode.kind === 'admission'
      ? eq(patientInvoiceHeaders.admissionId, mode.admissionId)
      : eq(patientInvoiceHeaders.visitGroupId, mode.visitGroupId);

  // ── 2. جلب فواتير المصدر (غير مجمعة فقط) ────────────────────────────────
  const invoices = await tx.select().from(patientInvoiceHeaders)
    .where(and(sourceFilter, eq(patientInvoiceHeaders.isConsolidated, false)))
    .orderBy(asc(patientInvoiceHeaders.createdAt));

  if (invoices.length === 0) throw new Error("لا توجد فواتير لتجميعها");

  // ── 2b. Cross-patient safety — فواتير visit_group يجب أن تكون لنفس المريض
  // نفحص patientId (المرضى المسجلين). إن وُجد أكثر من patient_id مختلف → خطأ.
  // المرضى غير المسجلين (walk-in / null) لا نرفضهم لأن اسم المريض يُؤخذ من أول فاتورة.
  if (mode.kind === 'visit_group') {
    const registeredIds = (invoices as PatientInvoiceHeader[])
      .map(i => (i as PatientInvoiceHeader & { patientId?: string | null }).patientId)
      .filter((id): id is string => Boolean(id));
    const uniquePatientIds = new Set(registeredIds);
    if (uniquePatientIds.size > 1) {
      throw new Error("لا يمكن تجميع فواتير تخص مرضى مختلفين في نفس المجموعة");
    }
  }

  // ── 3. حذف الفاتورة المجمعة القديمة إن وجدت ─────────────────────────────
  // ⚠️ الحذف والإعادة هو السلوك الحالي المورّث من admission consolidation.
  // الآن هو آمن تماماً لأن LOCK حصل قبله مباشرة في الخطوة 0.
  const existingConsolidated = await tx.select().from(patientInvoiceHeaders)
    .where(and(sourceFilter, eq(patientInvoiceHeaders.isConsolidated, true)));

  if (existingConsolidated.length > 0) {
    for (const ec of existingConsolidated) {
      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, ec.id));
      await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, ec.id));
    }
  }

  // ── 4. رقم الفاتورة الجديد (LOCK مأخوذ بالفعل من الخطوة 0) ───────────────
  const maxNumResult = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
    FROM patient_invoice_headers
  `);
  const nextNum = (parseInt(String((maxNumResult.rows[0] as { max_num: string })?.max_num || "0")) || 0) + 1;

  // ── 5. تجميع المبالغ ──────────────────────────────────────────────────────
  const totalAmount   = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.totalAmount), 0);
  const discountAmount= invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.discountAmount), 0);
  const netAmount     = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.netAmount), 0);
  const paidAmount    = invoices.reduce((s: number, inv: PatientInvoiceHeader) => s + parseFloat(inv.paidAmount), 0);

  // ── 6. إنشاء الفاتورة المجمعة ────────────────────────────────────────────
  // sourceInvoiceIds: مصفوفة unique بدون تكرار (safety guard)
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

  // ربط الفاتورة المجمعة بنفس reference المصدر
  if (mode.kind === 'admission') {
    consolidatedValues.admissionId = mode.admissionId;
  } else {
    consolidatedValues.visitGroupId = mode.visitGroupId;
  }

  const [consolidated] = await tx.insert(patientInvoiceHeaders).values(consolidatedValues).returning();

  // ── 7. نسخ البنود مع الحفاظ على source_type/source_id ───────────────────
  // - STAY_ENGINE: يُحفظ كما هو (source_type='STAY_ENGINE')
  // - dept_service_invoice: يُحفظ كما هو
  // - null (بيانات قديمة): نُعيّن source_type='dept_service_invoice' + source_id=inv.id
  //   لأننا عند التجميع نعرف يقيناً الفاتورة المصدر لكل بند
  let sortOrder = 0;
  for (const inv of invoices) {
    const lines = await tx.select().from(patientInvoiceLines)
      .where(eq(patientInvoiceLines.headerId, inv.id))
      .orderBy(asc(patientInvoiceLines.sortOrder));

    if (lines.length === 0) continue;

    // Batch insert بدلاً من loop (أداء أفضل + لا N+1 داخلي)
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
      // ── Phase-1 Traceability: حفظ مصدر كل بند ──────────────────────────
      // إن كان البند يحمل source موجود (مثل STAY_ENGINE) → نحتفظ به
      // إن كان null (بيانات قديمة) → نُعيّن المصدر من الفاتورة الأصلية
      sourceType: l.sourceType ?? "dept_service_invoice",
      sourceId:   l.sourceId   ?? inv.id,
    }));

    await tx.insert(patientInvoiceLines).values(newLines);
  }

  // ── 8. إعادة الفاتورة المجمعة النهائية ───────────────────────────────────
  const [finalHeader] = await tx.select().from(patientInvoiceHeaders)
    .where(eq(patientInvoiceHeaders.id, consolidated.id));
  return finalHeader;
}

// ─────────────────────────────────────────────────────────────────────────────

const methods = {

  async getPatients(this: DatabaseStorage, limit = 200): Promise<Patient[]> {
    return db.select().from(patients)
      .where(eq(patients.isActive, true))
      .orderBy(asc(patients.fullName))
      .limit(limit);
  },

  async searchPatients(this: DatabaseStorage, search: string): Promise<PatientSearchResult[]> {
    if (!search.trim()) {
      const rows = await this.getPatients();
      return rows.map(p => ({ ...p, isWalkIn: false }));
    }
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern     = token.includes('%') ? token : `%${token}%`;
      const normToken   = normalizeArabicName(token);
      const normPattern = normToken.includes('%') ? normToken : `%${normToken}%`;
      return or(
        ilike(patients.fullName, pattern),
        ilike(patients.normalizedFullName, normPattern),
        ilike(patients.phone, pattern),
        ilike(patients.nationalId, pattern),
      );
    });

    // 1. البحث في ملفات المرضى المسجلين (بما فيهم غير النشطين)
    const registered = await db.select({
      id:          patients.id,
      patientCode: patients.patientCode,
      fullName:    patients.fullName,
      phone:       patients.phone,
      nationalId:  patients.nationalId,
      age:         patients.age,
      isActive:    patients.isActive,
      createdAt:   patients.createdAt,
    }).from(patients)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(patients.fullName))
      .limit(40);

    const registeredLower = new Set(registered.map(p => p.fullName.trim().toLowerCase()));

    // 2. البحث في أسماء الإقامات غير المرتبطة بملف مريض (walk-in)
    const walkInWhere: string[] = ["a.patient_id IS NULL"];
    const walkInParams: string[] = [];
    for (const token of tokens) {
      const idx = walkInParams.length + 1;
      walkInParams.push(`%${token}%`);
      walkInWhere.push(`a.patient_name ILIKE $${idx}`);
    }
    const walkInSql = `
      SELECT DISTINCT ON (LOWER(TRIM(a.patient_name)))
        a.patient_name AS full_name,
        a.patient_phone AS phone
      FROM admissions a
      WHERE ${walkInWhere.join(" AND ")}
      ORDER BY LOWER(TRIM(a.patient_name))
      LIMIT 10
    `;
    const { rows: walkInRows } = await pool.query(walkInSql, walkInParams);

    const walkIns: PatientSearchResult[] = (walkInRows as { full_name: string; phone: string | null }[])
      .filter(r => !registeredLower.has(r.full_name.trim().toLowerCase()))
      .map(r => ({
        id:          "",
        patientCode: null,
        fullName:    r.full_name,
        phone:       r.phone ?? null,
        nationalId:  null,
        age:         null,
        isActive:    false,
        createdAt:   new Date(),
        isWalkIn:    true,
      }));

    return [
      ...registered.map(p => ({ ...p, isWalkIn: false })),
      ...walkIns,
    ];
  },

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptIds?: string[]; page?: number; pageSize?: number }): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    const page     = Math.max(1, filters?.page     ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters?.pageSize ?? 50));
    const offset   = (page - 1) * pageSize;

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);

    let effectiveDateFrom = filters?.dateFrom;
    let effectiveDateTo   = filters?.dateTo;
    if (!hasDateFilter) {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      effectiveDateFrom = d90.toISOString().slice(0, 10);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // فلتر rpt_patient_visit_summary:
    //   - r.visit_date بدلاً من pih.invoice_date:
    //     للفواتير المستقلة: visit_date = invoice_date (مطابق للسابق)
    //     للإقامات: visit_date = admission_date (تغيير معلوم: "متى بدأت الزيارة")
    //   - r.department_id: مُخزَّن مُسبقاً ويشمل fallback من المخزن للفواتير المستقلة
    // ─────────────────────────────────────────────────────────────────────────
    // r.invoice_count > 0: استبعاد الإقامات التي ليس لها أي فواتير (يحافظ على
    // السلوك القديم الذي كان يجمّع من patient_invoice_headers مباشرةً)
    const rptConds: string[] = ["r.invoice_count > 0"];
    if (effectiveDateFrom) rptConds.push(`r.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   rptConds.push(`r.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      rptConds.push(`r.department_id IN (${ids})`);
    }
    const rptFilter = rptConds.join(" AND ");

    // نفس الشروط لـ li_agg subquery (alias r2)
    const liRptConds: string[] = ["r2.invoice_count > 0"];
    if (effectiveDateFrom) liRptConds.push(`r2.visit_date >= '${effectiveDateFrom}'`);
    if (effectiveDateTo)   liRptConds.push(`r2.visit_date <= '${effectiveDateTo}'`);
    if (filters?.deptIds && filters.deptIds.length > 0) {
      const ids = filters.deptIds.map((d: string) => `'${d.replace(/'/g, "''")}'`).join(", ");
      liRptConds.push(`r2.department_id IN (${ids})`);
    }
    const liRptFilter = liRptConds.join(" AND ");

    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map((t: string) => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM rpt_patient_visit_summary r3` +
            ` WHERE r3.patient_name = p.full_name` +
            ` AND r3.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // الاستعلام النهائي — يجمّع من rpt_patient_visit_summary بدلاً من base tables:
    //   • rpt يغطي الآن جميع الفواتير: admission + patient_invoice (مستقلة)
    //   • لا correlated subquery على doctor_transfers (مُخزَّن في rpt.transferred_total)
    //   • لا ARRAY_AGG — DISTINCT ON على rpt لأحدث زيارة
    //   • مفتاح الترتيب: latest_invoice_created_at DESC, latest_invoice_id DESC
    // ─────────────────────────────────────────────────────────────────────────
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.patient_code,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(SUM(r.service_revenue),    0)   AS services_total,
        COALESCE(SUM(r.drug_revenue),       0)   AS drugs_total,
        COALESCE(SUM(r.consumable_revenue), 0)   AS consumables_total,
        COALESCE(SUM(r.or_room_total),      0)   AS or_room_total,
        COALESCE(SUM(r.stay_revenue),       0)   AS stay_total,
        COALESCE(SUM(r.service_revenue),    0)
          + COALESCE(SUM(r.drug_revenue),       0)
          + COALESCE(SUM(r.consumable_revenue), 0)
          + COALESCE(SUM(r.or_room_total),      0)
          + COALESCE(SUM(r.stay_revenue),       0) AS grand_total,
        COALESCE(SUM(r.total_paid),         0)   AS paid_total,
        COALESCE(SUM(r.transferred_total),  0)   AS transferred_total,
        li.latest_invoice_id,
        li.latest_invoice_number,
        li.latest_invoice_status,
        li.latest_doctor_name,
        COUNT(*) OVER()                          AS total_count
      FROM patients p
      JOIN rpt_patient_visit_summary r ON r.patient_name = p.full_name
      -- أحدث زيارة/فاتورة لكل مريض: DISTINCT ON بدلاً من ARRAY_AGG
      -- الترتيب: latest_invoice_created_at DESC (tie-breaker: latest_invoice_id DESC)
      LEFT JOIN (
        SELECT DISTINCT ON (r2.patient_name)
          r2.patient_name,
          r2.latest_invoice_id,
          r2.latest_invoice_number,
          r2.latest_invoice_status,
          r2.latest_doctor_name
        FROM rpt_patient_visit_summary r2
        WHERE ${sql.raw(liRptFilter)}
        ORDER BY r2.patient_name,
                 r2.latest_invoice_created_at DESC NULLS LAST,
                 r2.latest_invoice_id DESC
      ) li ON li.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
        AND ${sql.raw(rptFilter)}
      GROUP BY p.id, p.patient_code, p.full_name, p.phone, p.national_id, p.age, p.created_at,
               li.latest_invoice_id, li.latest_invoice_number,
               li.latest_invoice_status, li.latest_doctor_name
      ORDER BY p.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const rawRows = result.rows as any[];
    const total   = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0;
    const rows    = rawRows.map(row => {
      const { total_count, ...rest } = row;
      return Object.fromEntries(Object.entries(rest).map(([k, v]) => [toCamel(k), v]));
    });

    return { rows, total, page, pageSize };
  },

  async getPatient(this: DatabaseStorage, id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  },

  async createPatient(this: DatabaseStorage, data: InsertPatient): Promise<Patient> {
    const norm = normalizePatientIdentity(data);
    const [p] = await db.insert(patients).values({
      ...data,
      normalizedFullName: norm.normalizedFullName || null,
      normalizedPhone: norm.normalizedPhone || null,
      normalizedNationalId: norm.normalizedNationalId || null,
    }).returning();
    return p;
  },

  async updatePatient(this: DatabaseStorage, id: string, data: Partial<InsertPatient>): Promise<Patient> {
    return db.transaction(async (tx) => {
      const [old] = await tx.select({ fullName: patients.fullName })
        .from(patients).where(eq(patients.id, id));

      const norm = normalizePatientIdentity(data);
      const normalizedData: Partial<InsertPatient> & {
        normalizedFullName?: string | null;
        normalizedPhone?: string | null;
        normalizedNationalId?: string | null;
      } = { ...data };
      if (data.fullName !== undefined) normalizedData.normalizedFullName = norm.normalizedFullName || null;
      if (data.phone !== undefined) normalizedData.normalizedPhone = norm.normalizedPhone || null;
      if (data.nationalId !== undefined) normalizedData.normalizedNationalId = norm.normalizedNationalId || null;

      const [updated] = await tx.update(patients).set(normalizedData).where(eq(patients.id, id)).returning();

      if (data.fullName && old?.fullName && data.fullName !== old.fullName) {
        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
        await tx.execute(sql`
          UPDATE admissions
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
      }

      return updated;
    });
  },

  async getPatientJourney(this: DatabaseStorage, patientId: string): Promise<Record<string, unknown> | null> {
    return this.getPatientTimeline(patientId);
  },

  async getPatientTimeline(this: DatabaseStorage, patientId: string): Promise<Record<string, unknown> | null> {
    const patientRes = await db.execute(sql`
      SELECT id, patient_code, full_name, phone, national_id, age, created_at
      FROM patients WHERE id = ${patientId}
    `);
    if (!patientRes.rows.length) return null;
    const patient = patientRes.rows[0] as Record<string, unknown>;

    const summaryRes = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM clinic_appointments
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_clinic_visits,
        (SELECT COUNT(*) FROM admissions
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_admissions,
        (SELECT COUNT(*) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))::int AS total_invoices,
        COALESCE((SELECT SUM(net_amount) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})), 0) AS total_billed,
        COALESCE((SELECT SUM(paid_amount) FROM patient_invoice_headers
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})), 0) AS total_paid,
        (SELECT MIN(appointment_date) FROM clinic_appointments
          WHERE patient_id = ${patientId}
             OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})) AS first_visit_date,
        GREATEST(
          (SELECT MAX(appointment_date) FROM clinic_appointments
            WHERE patient_id = ${patientId}
               OR (patient_id IS NULL AND patient_name = ${patient.full_name as string})),
          (SELECT MAX(admission_date) FROM admissions
            WHERE patient_id = ${patientId}
               OR (patient_id IS NULL AND patient_name = ${patient.full_name as string}))
        ) AS last_activity_date
    `);
    const s = summaryRes.rows[0] as Record<string, unknown>;
    const totalBilled = parseFloat(String(s.total_billed || "0"));
    const totalPaid   = parseFloat(String(s.total_paid   || "0"));

    const summary = {
      totalClinicVisits: Number(s.total_clinic_visits) || 0,
      totalAdmissions:   Number(s.total_admissions)    || 0,
      totalInvoices:     Number(s.total_invoices)      || 0,
      totalBilled,
      totalPaid,
      totalOutstanding:  Math.max(0, totalBilled - totalPaid),
      firstVisitDate:    s.first_visit_date   ?? null,
      lastActivityDate:  s.last_activity_date ?? null,
    };

    const clinicRes = await db.execute(sql`
      SELECT
        a.id AS event_id,
        a.appointment_date AS event_date,
        a.turn_number,
        a.status,
        cl.name_ar AS location,
        d.name AS doctor_name,
        c.id AS consultation_id,
        c.chief_complaint,
        c.diagnosis,
        c.notes AS consultation_notes,
        c.consultation_fee,
        c.final_amount AS amount,
        c.payment_status
      FROM clinic_appointments a
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN clinic_consultations c ON c.appointment_id = a.id
      WHERE a.patient_id = ${patientId}
         OR (a.patient_id IS NULL AND a.patient_name = ${patient.full_name as string})
      ORDER BY a.appointment_date DESC, a.turn_number DESC
      LIMIT 100
    `);

    const admissionRes = await db.execute(sql`
      SELECT
        adm.id AS event_id,
        adm.admission_date AS event_date,
        adm.admission_number,
        adm.discharge_date,
        adm.status,
        adm.doctor_name,
        adm.payment_type,
        adm.notes,
        r.name_ar AS room_name,
        f.name_ar AS floor_name
      FROM admissions adm
      LEFT JOIN beds b ON b.current_admission_id = adm.id
      LEFT JOIN rooms r ON r.id = b.room_id
      LEFT JOIN floors f ON f.id = r.floor_id
      WHERE adm.patient_id = ${patientId}
         OR (adm.patient_id IS NULL AND adm.patient_name = ${patient.full_name as string})
      ORDER BY adm.admission_date DESC
      LIMIT 50
    `);

    const invoiceRes = await db.execute(sql`
      SELECT
        pih.id AS event_id,
        pih.invoice_date AS event_date,
        pih.invoice_number,
        pih.net_amount AS amount,
        pih.paid_amount,
        pih.status,
        pih.patient_type,
        pih.admission_id,
        pih.created_at,
        ca.id            AS appointment_id,
        ca.status        AS apt_status,
        ca.payment_type,
        ca.accounting_posted_advance,
        ca.accounting_posted_revenue,
        cl.name_ar       AS clinic_name,
        dr.name          AS doctor_name,
        dp.name_ar       AS department_name
      FROM patient_invoice_headers pih
      LEFT JOIN clinic_appointments ca ON ca.invoice_id = pih.id
      LEFT JOIN clinic_clinics      cl ON cl.id = ca.clinic_id
      LEFT JOIN doctors             dr ON dr.id = ca.doctor_id
      LEFT JOIN departments         dp ON dp.id = cl.department_id
      WHERE (
        pih.patient_id = ${patientId}
        OR (pih.patient_id IS NULL AND pih.patient_name = ${patient.full_name as string})
      )
        AND pih.admission_id IS NULL
      ORDER BY pih.invoice_date DESC
      LIMIT 100
    `);

    const clinicEvents: Array<Record<string, unknown>> = [];
    for (const row of clinicRes.rows as Array<Record<string, unknown>>) {
      const consultId = row.consultation_id as string | null;
      let drugs: Array<Record<string, unknown>> = [];
      let serviceOrders: Array<Record<string, unknown>> = [];

      if (consultId) {
        const drugRows = await db.execute(sql`
          SELECT drug_name, dose, frequency, duration, quantity, unit_level
          FROM clinic_consultation_drugs WHERE consultation_id = ${consultId} ORDER BY line_no
        `);
        drugs = drugRows.rows as Array<Record<string, unknown>>;

        const orderRows = await db.execute(sql`
          SELECT order_type, service_name_manual, target_name, status, executed_at, quantity, unit_price
          FROM clinic_orders WHERE consultation_id = ${consultId} ORDER BY created_at
        `);
        serviceOrders = orderRows.rows as Array<Record<string, unknown>>;
      }

      clinicEvents.push({
        eventType:     "clinic_visit",
        eventId:       row.event_id,
        eventDate:     row.event_date,
        location:      row.location,
        doctorName:    row.doctor_name,
        turnNumber:    row.turn_number,
        status:        row.status,
        consultation:  consultId ? {
          id:              consultId,
          chiefComplaint:  row.chief_complaint,
          diagnosis:       row.diagnosis,
          notes:           row.consultation_notes,
          consultationFee: row.consultation_fee,
          finalAmount:     row.amount,
          paymentStatus:   row.payment_status,
        } : null,
        drugs,
        serviceOrders,
      });
    }

    const admissionEvents = (admissionRes.rows as Array<Record<string, unknown>>).map(row => {
      const room  = row.room_name  ? String(row.room_name)  : null;
      const floor = row.floor_name ? String(row.floor_name) : null;
      const location = [room, floor].filter(Boolean).join(" — ") || null;
      return {
        eventType:       "admission",
        eventId:         row.event_id,
        eventDate:       row.event_date,
        admissionNumber: row.admission_number,
        dischargeDate:   row.discharge_date,
        status:          row.status,
        doctorName:      row.doctor_name,
        location,
        notes:           row.notes,
        paymentType:     row.payment_type,
      };
    });

    const invoiceEvents = (invoiceRes.rows as Array<Record<string, unknown>>).map(row => ({
      eventType:                "invoice",
      eventId:                  row.event_id,
      eventDate:                row.event_date,
      invoiceNumber:            row.invoice_number,
      amount:                   row.amount,
      paidAmount:               row.paid_amount,
      status:                   row.status,
      patientType:              row.patient_type,
      createdAt:                row.created_at,
      appointmentId:            row.appointment_id,
      aptStatus:                row.apt_status,
      paymentType:              row.payment_type,
      accountingPostedAdvance:  row.accounting_posted_advance,
      accountingPostedRevenue:  row.accounting_posted_revenue,
      clinicName:               row.clinic_name,
      doctorName:               row.doctor_name,
      departmentName:           row.department_name,
    }));

    const allEvents = [...clinicEvents, ...admissionEvents, ...invoiceEvents].sort((a, b) => {
      const da = String(a.eventDate || "");
      const db2 = String(b.eventDate || "");
      return db2.localeCompare(da);
    });

    return {
      patient: {
        id:          patient.id,
        patientCode: patient.patient_code,
        fullName:    patient.full_name,
        phone:       patient.phone,
        nationalId:  patient.national_id,
        age:         patient.age,
        createdAt:   patient.created_at,
      },
      summary,
      events: allEvents,
      visits: clinicEvents,
    };
  },

  async getPatientPreviousConsultations(
    this: DatabaseStorage,
    patientId: string,
    limit: number = 5,
    allowedClinicIds?: string[] | null,
    offset: number = 0,
    excludeAppointmentId?: string | null
  ): Promise<{ data: Array<Record<string, unknown>>; hasMore: boolean }> {
    const clinicCond =
      allowedClinicIds && allowedClinicIds.length > 0
        ? sql`AND a.clinic_id = ANY(${allowedClinicIds}::varchar[])`
        : sql``;

    const excludeCond = excludeAppointmentId
      ? sql`AND a.id != ${excludeAppointmentId}`
      : sql``;

    // Fetch limit+1 rows so we can determine hasMore without a separate COUNT query.
    // clinic_consultations has UNIQUE(appointment_id) so at most 1 row per appointment.
    // Order by actual visit date (appointment_date) then by consultation write time (c.created_at)
    // as secondary sort — consistent with safety rules.
    const fetchLimit = limit + 1;

    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.chief_complaint,
        c.diagnosis,
        c.notes,
        c.follow_up_plan,
        c.follow_up_after_days,
        c.follow_up_reason,
        c.suggested_follow_up_date,
        c.consultation_fee,
        c.discount_value,
        c.final_amount,
        c.payment_status,
        c.created_at,
        COALESCE(a.appointment_date::text, c.created_at::date::text) AS visit_date,
        a.turn_number,
        d.name AS doctor_name,
        cl.name_ar AS clinic_name,
        COALESCE(drugs_agg.drugs, '[]'::json) AS drugs,
        COALESCE(orders_agg.service_count, 0) AS service_count,
        COALESCE(orders_agg.pharmacy_count, 0) AS pharmacy_count
      FROM clinic_consultations c
      JOIN clinic_appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN (
        SELECT
          consultation_id,
          json_agg(json_build_object(
            'drug_name', drug_name,
            'dose', dose,
            'frequency', frequency,
            'duration', duration
          ) ORDER BY line_no) AS drugs
        FROM clinic_consultation_drugs
        GROUP BY consultation_id
      ) drugs_agg ON drugs_agg.consultation_id = c.id
      LEFT JOIN (
        SELECT
          consultation_id,
          COUNT(*) FILTER (WHERE order_type = 'service')  AS service_count,
          COUNT(*) FILTER (WHERE order_type = 'pharmacy') AS pharmacy_count
        FROM clinic_orders
        WHERE status != 'cancelled'
        GROUP BY consultation_id
      ) orders_agg ON orders_agg.consultation_id = c.id
      WHERE a.patient_id = ${patientId}
        ${clinicCond}
        ${excludeCond}
      ORDER BY COALESCE(a.appointment_date, c.created_at::date) DESC, c.created_at DESC
      LIMIT ${fetchLimit}
      OFFSET ${offset}
    `);

    const all = rows.rows as Array<Record<string, unknown>>;
    const hasMore = all.length > limit;
    const data = hasMore ? all.slice(0, limit) : all;
    return { data, hasMore };
  },

  async deletePatient(this: DatabaseStorage, id: string): Promise<boolean> {
    const [patient] = await db.select({ fullName: patients.fullName }).from(patients).where(eq(patients.id, id));
    if (!patient) throw new Error("المريض غير موجود");

    const check = await db.execute(sql`
      SELECT COALESCE(SUM(net_amount), 0) AS total
      FROM patient_invoice_headers
      WHERE patient_name = ${patient.fullName}
        AND status != 'cancelled'
    `);
    const total = parseFloat((check.rows[0] as any)?.total ?? "0");
    if (total > 0) {
      throw new Error("لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية");
    }

    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
    return true;
  },

  async getDoctors(this: DatabaseStorage, includeInactive?: boolean): Promise<Doctor[]> {
    if (includeInactive) {
      return db.select().from(doctors).orderBy(asc(doctors.name));
    }
    return db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.name));
  },

  async searchDoctors(this: DatabaseStorage, search: string): Promise<Doctor[]> {
    if (!search.trim()) return this.getDoctors();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(doctors.name, pattern),
        ilike(doctors.specialty, pattern),
      );
    });
    return db.select().from(doctors)
      .where(and(eq(doctors.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(doctors.name))
      .limit(50);
  },

  async getDoctorBalances(this: DatabaseStorage): Promise<{ id: string; name: string; specialty: string | null; totalTransferred: string; totalSettled: string; remaining: string }[]> {
    const res = await db.execute(sql`
      SELECT
        d.id, d.name, d.specialty,
        COALESCE(SUM(DISTINCT dt.amount), 0)::text                              AS total_transferred,
        COALESCE((
          SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
          JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
          WHERE dt2.doctor_name = d.name
        ), 0)::text                                                              AS total_settled,
        (
          COALESCE(SUM(dt.amount), 0) - COALESCE((
            SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
            JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
            WHERE dt2.doctor_name = d.name
          ), 0)
        )::text                                                                  AS remaining
      FROM doctors d
      LEFT JOIN doctor_transfers dt ON dt.doctor_name = d.name
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.specialty
      ORDER BY d.name ASC
    `);
    return (res.rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      totalTransferred: r.total_transferred,
      totalSettled: r.total_settled,
      remaining: r.remaining,
    }));
  },

  async getDoctorStatement(this: DatabaseStorage, params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<any[]> {
    const { doctorName, dateFrom, dateTo } = params;
    const dateFromFilter = dateFrom ? sql`AND dt.transferred_at::date >= ${dateFrom}::date` : sql``;
    const dateToFilter   = dateTo   ? sql`AND dt.transferred_at::date <= ${dateTo}::date`   : sql``;
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining,
        pi.patient_name      AS "patientName",
        pi.invoice_date      AS "invoiceDate",
        pi.net_amount::text  AS "invoiceTotal",
        pi.status            AS "invoiceStatus"
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      LEFT JOIN patient_invoice_headers pi ON pi.id = dt.invoice_id
      WHERE dt.doctor_name = ${doctorName}
      ${dateFromFilter}
      ${dateToFilter}
      GROUP BY dt.id, pi.id, pi.patient_name, pi.invoice_date, pi.net_amount, pi.status
      ORDER BY dt.transferred_at DESC
    `);
    return res.rows as any[];
  },

  async getDoctor(this: DatabaseStorage, id: string): Promise<Doctor | undefined> {
    const [d] = await db.select().from(doctors).where(eq(doctors.id, id));
    return d;
  },

  async createDoctor(this: DatabaseStorage, data: InsertDoctor): Promise<Doctor> {
    const [d] = await db.insert(doctors).values(data).returning();
    return d;
  },

  async updateDoctor(this: DatabaseStorage, id: string, data: Partial<InsertDoctor>): Promise<Doctor> {
    const [d] = await db.update(doctors).set(data).where(eq(doctors.id, id)).returning();
    return d;
  },

  async deleteDoctor(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.update(doctors).set({ isActive: false }).where(eq(doctors.id, id));
    return true;
  },

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
      conds.push(sql`rpt.department_id = ${filters.deptId}`);
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

    // ── جدول rpt يوفر المبالغ المجمَّعة وإسم القسم دون ARRAY_AGG أو DISTINCT ON ──
    // الفواتير المرتبطة مباشرةً فقط (admission_id IS NOT NULL).
    // inv_latest يوفر رقم الفاتورة الأخيرة وحالتها والمبالغ المحوَّلة (doctor_transfers).
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
        rpt.department_name                              AS latest_invoice_dept_name
        ${countCol}
      FROM admissions a
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
        GROUP BY pih.admission_id
      ) inv_latest ON inv_latest.admission_id = a.id
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

  // ── Admission Consolidation — Thin Wrapper ────────────────────────────────
  async consolidateAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      // جلب بيانات المريض من سجل الإقامة لبناء الفاتورة المجمعة
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

  // ── Visit Group Consolidation — Thin Wrapper ──────────────────────────────
  async consolidateVisitGroupInvoices(this: DatabaseStorage, visitGroupId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      // بيانات المريض مشتقة من أول فاتورة في المجموعة (لا جدول visit_groups بعد)
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

  // ── Visit Group Invoices List ─────────────────────────────────────────────
  async getVisitGroupInvoices(this: DatabaseStorage, visitGroupId: string): Promise<PatientInvoiceHeader[]> {
    // يُعيد كل الفواتير (مجمعة وغير مجمعة) المرتبطة بمجموعة الزيارة
    return db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.visitGroupId, visitGroupId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },

  // ==================== Patient Inquiry ====================

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

    // ─── R1/R2/R3: dept isolation ────────────────────────────
    // forcedDeptIds === null  → full access (admin / cashier.all_units)
    // forcedDeptIds = [...]   → restricted to those depts (route guarantees length >= 1)
    let deptClause: string;
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    } else if (filters.adminDeptFilter) {
      deptClause = `AND pih.department_id = '${esc(filters.adminDeptFilter)}'`;
    } else {
      deptClause = "";
    }

    // ─── clinic sub-filter ───────────────────────────────────
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

    // ─── date filters (R11: inclusive full day) ──────────────
    let dateClause = "";
    if (filters.dateFrom) {
      dateClause += ` AND pih.invoice_date >= '${esc(filters.dateFrom)}'::date`;
    }
    if (filters.dateTo) {
      dateClause += ` AND pih.invoice_date <= '${esc(filters.dateTo)}'::date`;
    }

    // ─── search ──────────────────────────────────────────────
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

    // ─── R4: patient matching — id first, then name ───────────
    let patientClause: string;
    if (patientKey.patientId) {
      patientClause = `pih.patient_id = '${esc(patientKey.patientId)}'`;
    } else if (patientKey.patientName) {
      patientClause = `(pih.patient_id IS NULL AND pih.patient_name = '${esc(patientKey.patientName)}')`;
    } else {
      return [];
    }

    // ─── R3/R9: dept isolation ────────────────────────────────
    // forcedDeptIds === null → full access; string[] → restricted (route guarantees length >= 1)
    let deptClause = "";
    if (forcedDeptIds !== null) {
      const ids = forcedDeptIds.map(d => `'${esc(d)}'`).join(", ");
      deptClause = `AND pih.department_id IS NOT NULL AND pih.department_id IN (${ids})`;
    }

    // ─── line type filter ─────────────────────────────────────
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
  // ─── Duplicate Detection & Merge ──────────────────────────────────────────────

  /**
   * Search for duplicate candidates for a given patient input.
   * Returns scored, sorted candidates.
   */
  async checkPatientDuplicateCandidates(
    this: DatabaseStorage,
    input: { fullName?: string | null; phone?: string | null; nationalId?: string | null; age?: number | null },
    excludePatientId?: string,
  ): Promise<DuplicateCheckResult> {
    const norm = normalizePatientIdentity(input);

    // Build OR conditions for the broad candidate search
    const orClauses = [];
    if (norm.normalizedNationalId) {
      orClauses.push(eq(patients.normalizedNationalId, norm.normalizedNationalId));
    }
    if (norm.normalizedPhone) {
      orClauses.push(eq(patients.normalizedPhone, norm.normalizedPhone));
    }
    if (norm.normalizedFullName) {
      const firstToken = norm.normalizedFullName.split(" ")[0];
      if (firstToken) orClauses.push(ilike(patients.normalizedFullName, `%${firstToken}%`));
    }
    if (orClauses.length === 0) {
      return { duplicateStatus: "none", candidates: [], recommendedAction: statusToRecommendedAction("none") };
    }

    const baseConditions = [
      eq(patients.isActive, true),
      isNull(patients.mergedIntoPatientId),
      or(...orClauses)!,
    ];
    if (excludePatientId) baseConditions.push(ne(patients.id, excludePatientId));

    const rows = await db
      .select({
        id: patients.id,
        patientCode: patients.patientCode,
        fullName: patients.fullName,
        phone: patients.phone,
        nationalId: patients.nationalId,
        age: patients.age,
        gender: patients.gender,
        normalizedFullName: patients.normalizedFullName,
        normalizedPhone: patients.normalizedPhone,
        normalizedNationalId: patients.normalizedNationalId,
      })
      .from(patients)
      .where(and(...baseConditions))
      .limit(20);

    const candidates: DuplicateCandidate[] = rows.map(row => {
      const { score, reasons } = scoreCandidateMatch(
        { ...norm, age: input.age ?? null },
        {
          normalizedFullName: row.normalizedFullName,
          normalizedPhone: row.normalizedPhone,
          normalizedNationalId: row.normalizedNationalId,
          age: row.age,
        },
      );
      return {
        patientId: row.id,
        patientCode: row.patientCode,
        fullName: row.fullName,
        phone: row.phone,
        nationalId: row.nationalId,
        age: row.age,
        gender: row.gender,
        score,
        reasons,
      };
    })
    .filter(c => c.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

    const maxScore = candidates.length > 0 ? candidates[0].score : 0;
    const duplicateStatus = scoreToStatus(maxScore);

    return {
      duplicateStatus,
      candidates,
      recommendedAction: statusToRecommendedAction(duplicateStatus),
    };
  },

  /**
   * Preview the impact of merging duplicate into master (dry run, no DB changes).
   */
  async getPatientMergeImpact(
    this: DatabaseStorage,
    masterPatientId: string,
    duplicatePatientId: string,
  ): Promise<{
    masterPatient: Record<string, unknown>;
    duplicatePatient: Record<string, unknown>;
    invoiceCount: number;
    admissionCount: number;
    appointmentCount: number;
  }> {
    const [masterRow, duplicateRow, invoicesRow, admissionsRow, appointmentsRow] = await Promise.all([
      db.execute(sql`SELECT id, patient_code, full_name, phone, national_id, age FROM patients WHERE id = ${masterPatientId}`),
      db.execute(sql`SELECT id, patient_code, full_name, phone, national_id, age FROM patients WHERE id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers WHERE patient_id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM admissions WHERE patient_id = ${duplicatePatientId}`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM clinic_appointments WHERE patient_id = ${duplicatePatientId}`),
    ]);

    if (!masterRow.rows.length) throw Object.assign(new Error("المريض الرئيسي غير موجود"), { statusCode: 404 });
    if (!duplicateRow.rows.length) throw Object.assign(new Error("المريض المكرر غير موجود"), { statusCode: 404 });

    return {
      masterPatient: masterRow.rows[0] as Record<string, unknown>,
      duplicatePatient: duplicateRow.rows[0] as Record<string, unknown>,
      invoiceCount: parseInt(String((invoicesRow.rows[0] as Record<string, unknown>).cnt)) || 0,
      admissionCount: parseInt(String((admissionsRow.rows[0] as Record<string, unknown>).cnt)) || 0,
      appointmentCount: parseInt(String((appointmentsRow.rows[0] as Record<string, unknown>).cnt)) || 0,
    };
  },

  /**
   * Execute a governed patient merge inside a single DB transaction.
   * Moves all related records from duplicate → master, marks duplicate as merged.
   */
  async mergePatients(
    this: DatabaseStorage,
    masterPatientId: string,
    duplicatePatientId: string,
    reason: string,
    userId: string,
  ): Promise<void> {
    if (masterPatientId === duplicatePatientId) {
      throw Object.assign(new Error("لا يمكن دمج مريض مع نفسه"), { statusCode: 400 });
    }

    // Snapshot impact before merge
    const impact = await this.getPatientMergeImpact(masterPatientId, duplicatePatientId);

    await db.transaction(async (tx) => {
      // Move invoices
      await tx.execute(sql`
        UPDATE patient_invoice_headers
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Move admissions
      await tx.execute(sql`
        UPDATE admissions
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Move clinic appointments
      await tx.execute(sql`
        UPDATE clinic_appointments
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      // Save old patient_code as alias on master
      const dupPatient = impact.duplicatePatient as { patient_code?: string | null; full_name?: string };
      if (dupPatient.patient_code) {
        await tx.execute(sql`
          INSERT INTO patient_aliases(patient_id, alias_type, alias_value)
          VALUES (${masterPatientId}, 'merged_from_code', ${dupPatient.patient_code})
          ON CONFLICT DO NOTHING
        `);
      }

      // Mark duplicate as merged
      await tx.execute(sql`
        UPDATE patients
        SET merged_into_patient_id = ${masterPatientId},
            merged_at = now(),
            merged_by_user_id = ${userId},
            merge_reason = ${reason},
            is_active = false
        WHERE id = ${duplicatePatientId}
      `);

      // Write merge audit log
      await tx.execute(sql`
        INSERT INTO patient_merge_audit(
          master_patient_id, merged_patient_id, merged_by_user_id,
          reason, moved_invoice_count, moved_admission_count, moved_appointment_count,
          raw_snapshot_json
        ) VALUES (
          ${masterPatientId}, ${duplicatePatientId}, ${userId},
          ${reason}, ${impact.invoiceCount}, ${impact.admissionCount}, ${impact.appointmentCount},
          ${JSON.stringify({ master: impact.masterPatient, duplicate: impact.duplicatePatient })}
        )
      `);
    });
  },

  /**
   * Get a list of potential duplicate patient groups for the review screen.
   * Groups patients by shared normalized_phone or normalized_national_id,
   * and finds name-similar patients with approximate name matching.
   */
  async getPatientDuplicateCandidatesList(
    this: DatabaseStorage,
    limit = 50,
  ): Promise<Array<{ patientA: Record<string, unknown>; patientB: Record<string, unknown>; matchReason: string; score: number }>> {
    // Phone duplicates
    const phoneDups = await db.execute(sql`
      SELECT
        a.id AS id_a, a.patient_code AS code_a, a.full_name AS name_a,
        a.phone AS phone_a, a.national_id AS nid_a, a.age AS age_a, a.gender AS gender_a,
        b.id AS id_b, b.patient_code AS code_b, b.full_name AS name_b,
        b.phone AS phone_b, b.national_id AS nid_b, b.age AS age_b, b.gender AS gender_b,
        'رقم الهاتف متطابق' AS match_reason, 70 AS score
      FROM patients a
      JOIN patients b ON a.normalized_phone = b.normalized_phone
        AND a.id < b.id
      WHERE a.normalized_phone IS NOT NULL
        AND a.merged_into_patient_id IS NULL
        AND b.merged_into_patient_id IS NULL
        AND a.is_active = true AND b.is_active = true
      LIMIT ${Math.floor(limit / 2)}
    `);

    // National ID duplicates
    const nidDups = await db.execute(sql`
      SELECT
        a.id AS id_a, a.patient_code AS code_a, a.full_name AS name_a,
        a.phone AS phone_a, a.national_id AS nid_a, a.age AS age_a, a.gender AS gender_a,
        b.id AS id_b, b.patient_code AS code_b, b.full_name AS name_b,
        b.phone AS phone_b, b.national_id AS nid_b, b.age AS age_b, b.gender AS gender_b,
        'رقم الهوية متطابق' AS match_reason, 100 AS score
      FROM patients a
      JOIN patients b ON a.normalized_national_id = b.normalized_national_id
        AND a.id < b.id
      WHERE a.normalized_national_id IS NOT NULL
        AND a.merged_into_patient_id IS NULL
        AND b.merged_into_patient_id IS NULL
        AND a.is_active = true AND b.is_active = true
      LIMIT ${Math.floor(limit / 2)}
    `);

    type Row = Record<string, unknown>;
    const mapRow = (r: Row) => ({
      patientA: { id: r.id_a, patientCode: r.code_a, fullName: r.name_a, phone: r.phone_a, nationalId: r.nid_a, age: r.age_a, gender: r.gender_a },
      patientB: { id: r.id_b, patientCode: r.code_b, fullName: r.name_b, phone: r.phone_b, nationalId: r.nid_b, age: r.age_b, gender: r.gender_b },
      matchReason: String(r.match_reason),
      score: Number(r.score),
    });

    return [
      ...(nidDups.rows as Row[]).map(mapRow),
      ...(phoneDups.rows as Row[]).map(mapRow),
    ].sort((a, b) => b.score - a.score);
  },

  // ─── Scope validation helpers (parameterized — no esc() needed) ─────────────

  /**
   * Returns true if a full-access user OR if the patient has at least one
   * non-cancelled invoice whose department_id is within forcedDeptIds.
   * Used by patient detail endpoints to prevent cross-department ID enumeration.
   */
  async checkPatientInScope(
    this: DatabaseStorage,
    patientId: string,
    forcedDeptIds: string[] | null,
  ): Promise<boolean> {
    if (forcedDeptIds === null) return true;
    if (forcedDeptIds.length === 0) return false;

    // Check by patient_id column (most patients have one)
    const byId = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers pih
      WHERE pih.patient_id = ${patientId}
        AND pih.department_id = ANY(${forcedDeptIds}::text[])
        AND pih.status != 'cancelled'
      LIMIT 1
    `);
    if (byId.rows.length > 0) return true;

    // Fallback: match by patient name (older invoices may lack patient_id)
    const byName = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers pih
      JOIN patients p ON p.full_name = pih.patient_name
      WHERE p.id = ${patientId}
        AND pih.department_id = ANY(${forcedDeptIds}::text[])
        AND pih.status != 'cancelled'
      LIMIT 1
    `);
    return byName.rows.length > 0;
  },

  /**
   * Returns true if the invoice belongs to one of forcedDeptIds.
   * Used by /api/patient-invoices/:id/transfers to prevent cross-dept access.
   */
  async checkInvoiceInScope(
    this: DatabaseStorage,
    invoiceId: string,
    forcedDeptIds: string[] | null,
  ): Promise<boolean> {
    if (forcedDeptIds === null) return true;
    if (forcedDeptIds.length === 0) return false;

    const result = await db.execute(sql`
      SELECT 1 FROM patient_invoice_headers
      WHERE id = ${invoiceId}
        AND department_id = ANY(${forcedDeptIds}::text[])
      LIMIT 1
    `);
    return result.rows.length > 0;
  },

};

export default methods;
