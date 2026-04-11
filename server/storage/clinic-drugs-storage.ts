import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
  async getDoctorFavoriteDrugs(this: DatabaseStorage, doctorId: string, clinicId?: string | null): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT f.*, i.name_ar AS item_name_ar, i.sale_price_current
      FROM clinic_doctor_favorite_drugs f
      LEFT JOIN items i ON i.id = f.item_id
      WHERE f.doctor_id = ${doctorId}
        AND (f.clinic_id IS NULL OR f.clinic_id = ${clinicId ?? null})
      ORDER BY f.sort_order, f.drug_name
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async addFavoriteDrug(this: DatabaseStorage, data: { doctorId: string; clinicId?: string | null; itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }): Promise<Record<string, unknown>> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_doctor_favorite_drugs (doctor_id, clinic_id, item_id, drug_name, default_dose, default_frequency, default_duration)
      VALUES (${data.doctorId}, ${data.clinicId ?? null}, ${data.itemId ?? null}, ${data.drugName}, ${data.defaultDose ?? null}, ${data.defaultFrequency ?? null}, ${data.defaultDuration ?? null})
      RETURNING *
    `);
    return rows.rows[0] as Record<string, unknown>;
  },

  async removeFavoriteDrug(this: DatabaseStorage, id: string, doctorId?: string): Promise<void> {
    if (doctorId) {
      await db.execute(sql`DELETE FROM clinic_doctor_favorite_drugs WHERE id = ${id} AND doctor_id = ${doctorId}`);
    } else {
      await db.execute(sql`DELETE FROM clinic_doctor_favorite_drugs WHERE id = ${id}`);
    }
  },

  async getFrequentDrugsNotInFavorites(this: DatabaseStorage, doctorId: string, minCount: number = 2, clinicId?: string | null): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT cd.item_id, cd.drug_name,
             COUNT(DISTINCT cd.consultation_id)::int AS usage_count
      FROM clinic_consultation_drugs cd
      JOIN clinic_consultations c ON c.id = cd.consultation_id
      JOIN clinic_appointments a ON a.id = c.appointment_id
      WHERE a.doctor_id = ${doctorId}
        AND (${clinicId ?? null}::varchar IS NULL OR a.clinic_id = ${clinicId ?? null})
        AND cd.item_id IS NOT NULL
        AND cd.item_id NOT IN (
          SELECT item_id FROM clinic_doctor_favorite_drugs
          WHERE doctor_id = ${doctorId}
            AND (clinic_id IS NULL OR clinic_id = ${clinicId ?? null})
            AND item_id IS NOT NULL
        )
      GROUP BY cd.item_id, cd.drug_name
      HAVING COUNT(DISTINCT cd.consultation_id) >= ${minCount}
      ORDER BY usage_count DESC
      LIMIT 20
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },
};

export default methods;
