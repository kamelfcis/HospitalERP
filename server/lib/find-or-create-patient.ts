/**
 * findOrCreatePatient — البحث عن مريض مسجّل أو إنشاء ملف جديد تلقائياً
 *
 * يُستدعى من جميع نقاط الإدخال (إقامة، موعد عيادة، فاتورة مريض، bedboard …)
 * حتى يكون لكل مريض ملف موحّد في جدول patients.
 *
 * المنطق:
 *   1. بحث حساس لحالة الأحرف (ILIKE) باسم المريض المُنظَّف
 *   2. إذا وُجد سجل → إعادته بدون تعديل
 *   3. إذا لم يوجد → توليد كود مريض تسلسلي (PAT-000001) ثم الإنشاء
 */

import { pool } from "../db";
import { normalizeArabicName } from "../services/patient-dedup";

export interface FoundOrCreatedPatient {
  id: string;
  patientCode: string | null;
  fullName: string;
  phone: string | null;
  isNewlyCreated: boolean;
}

export async function findOrCreatePatient(
  fullName: string,
  phone?: string | null,
): Promise<FoundOrCreatedPatient> {
  const trimmedName = fullName.trim().replace(/\s+/g, " ");
  if (!trimmedName) throw new Error("اسم المريض لا يمكن أن يكون فارغاً");

  const normName = normalizeArabicName(trimmedName);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: found } = await client.query<{
      id: string;
      patient_code: string | null;
      full_name: string;
      phone: string | null;
    }>(
      `SELECT id, patient_code, full_name, phone
       FROM patients
       WHERE LOWER(TRIM(full_name)) = LOWER($1)
          OR normalized_full_name = $2
       LIMIT 1`,
      [trimmedName, normName],
    );

    if (found.length > 0) {
      await client.query("COMMIT");
      return {
        id: found[0].id,
        patientCode: found[0].patient_code,
        fullName: found[0].full_name,
        phone: found[0].phone,
        isNewlyCreated: false,
      };
    }

    const { rows: maxRows } = await client.query<{ max_code: string | null }>(
      `SELECT patient_code AS max_code
       FROM patients
       WHERE patient_code LIKE 'PAT-%'
       ORDER BY patient_code DESC
       LIMIT 1`,
    );
    let nextNum = 1;
    if (maxRows.length > 0 && maxRows[0].max_code) {
      const parsed = parseInt(maxRows[0].max_code.replace("PAT-", ""), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const patientCode = `PAT-${String(nextNum).padStart(6, "0")}`;

    const { rows: created } = await client.query<{
      id: string;
      patient_code: string | null;
      full_name: string;
      phone: string | null;
    }>(
      `INSERT INTO patients (full_name, normalized_full_name, patient_code, phone, is_active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id, patient_code, full_name, phone`,
      [trimmedName, normName, patientCode, phone?.trim() || null],
    );

    await client.query("COMMIT");
    return {
      id: created[0].id,
      patientCode: created[0].patient_code,
      fullName: created[0].full_name,
      phone: created[0].phone,
      isNewlyCreated: true,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
