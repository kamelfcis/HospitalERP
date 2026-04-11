import { db } from "../db";
import { eq, and, sql, or, asc, ilike } from "drizzle-orm";
import {
  patients,
  type Patient,
  type PatientSearchResult,
  type InsertPatient,
} from "@shared/schema";
import {
  normalizePatientIdentity,
  normalizeArabicName,
} from "../services/patient-dedup";
import { pool } from "../db";
import type { DatabaseStorage } from "./index";

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
        ilike(patients.patientCode, pattern),
      );
    });

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

    const registeredNorm = new Set(registered.map(p => normalizeArabicName(p.fullName).toLowerCase()));

    const walkInWhere: string[] = ["a.patient_id IS NULL"];
    const walkInParams: string[] = [];
    for (const token of tokens) {
      const normToken = normalizeArabicName(token);
      const idx1 = walkInParams.length + 1;
      walkInParams.push(`%${token}%`);
      const idx2 = walkInParams.length + 1;
      walkInParams.push(`%${normToken}%`);
      walkInWhere.push(`(a.patient_name ILIKE $${idx1} OR TRANSLATE(REPLACE(REPLACE(REPLACE(REPLACE(a.patient_name, 'أ','ا'), 'إ','ا'), 'آ','ا'), 'ة','ه'), 'ى','ي') ILIKE $${idx2})`);
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
      .filter(r => !registeredNorm.has(normalizeArabicName(r.full_name).toLowerCase()))
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

};

export default methods;
