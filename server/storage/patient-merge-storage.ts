import { db } from "../db";
import { eq, and, sql, or, asc, ilike, ne, isNull } from "drizzle-orm";
import {
  patients,
} from "@shared/schema";
import {
  normalizePatientIdentity,
  scoreCandidateMatch,
  scoreToStatus,
  statusToRecommendedAction,
  type DuplicateCandidate,
  type DuplicateCheckResult,
} from "../services/patient-dedup";
import type { DatabaseStorage } from "./index";

const methods = {

  async checkPatientDuplicateCandidates(
    this: DatabaseStorage,
    input: { fullName?: string | null; phone?: string | null; nationalId?: string | null; age?: number | null },
    excludePatientId?: string,
  ): Promise<DuplicateCheckResult> {
    const norm = normalizePatientIdentity(input);

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

    const impact = await this.getPatientMergeImpact(masterPatientId, duplicatePatientId);

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE patient_invoice_headers
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      await tx.execute(sql`
        UPDATE admissions
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      await tx.execute(sql`
        UPDATE clinic_appointments
        SET patient_id = ${masterPatientId}
        WHERE patient_id = ${duplicatePatientId}
      `);

      const dupPatient = impact.duplicatePatient as { patient_code?: string | null; full_name?: string };
      if (dupPatient.patient_code) {
        await tx.execute(sql`
          INSERT INTO patient_aliases(patient_id, alias_type, alias_value)
          VALUES (${masterPatientId}, 'merged_from_code', ${dupPatient.patient_code})
          ON CONFLICT DO NOTHING
        `);
      }

      await tx.execute(sql`
        UPDATE patients
        SET merged_into_patient_id = ${masterPatientId},
            merged_at = now(),
            merged_by_user_id = ${userId},
            merge_reason = ${reason},
            is_active = false
        WHERE id = ${duplicatePatientId}
      `);

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

  async getPatientDuplicateCandidatesList(
    this: DatabaseStorage,
    limit = 50,
  ): Promise<Array<{ patientA: Record<string, unknown>; patientB: Record<string, unknown>; matchReason: string; score: number }>> {
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

};

export default methods;
