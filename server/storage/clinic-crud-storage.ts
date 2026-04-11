import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
  async getClinics(this: DatabaseStorage, userId: string, role: string): Promise<Array<Record<string, unknown>>> {
    const isAdmin = role === 'admin' || role === 'owner';
    if (isAdmin) {
      const rows = await db.execute(sql`
        SELECT c.*, d.name_ar AS department_name,
               w.name_ar AS pharmacy_name,
               sv.name_ar AS consultation_service_name,
               sv.base_price AS consultation_service_base_price,
               tr.name AS treasury_name
        FROM clinic_clinics c
        LEFT JOIN departments d ON d.id = c.department_id
        LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
        LEFT JOIN services sv ON sv.id = c.consultation_service_id
        LEFT JOIN treasuries tr ON tr.id = c.treasury_id
        ORDER BY c.name_ar
      `);
      return rows.rows as Array<Record<string, unknown>>;
    }
    const rows = await db.execute(sql`
      SELECT DISTINCT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name,
             sv.base_price AS consultation_service_base_price,
             tr.name AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN treasuries tr ON tr.id = c.treasury_id
      WHERE c.id IN (
        SELECT clinic_id FROM clinic_user_clinic_assignments WHERE user_id = ${userId}
        UNION
        SELECT clinic_id FROM user_clinics WHERE user_id = ${userId}
      )
      ORDER BY c.name_ar
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async getClinicById(this: DatabaseStorage, id: string): Promise<Record<string, unknown> | null> {
    const rows = await db.execute(sql`
      SELECT c.*, d.name_ar AS department_name,
             w.name_ar AS pharmacy_name,
             sv.name_ar AS consultation_service_name,
             sv.base_price AS consultation_service_base_price,
             tr.name AS treasury_name
      FROM clinic_clinics c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN warehouses w ON w.id = c.default_pharmacy_id
      LEFT JOIN services sv ON sv.id = c.consultation_service_id
      LEFT JOIN treasuries tr ON tr.id = c.treasury_id
      WHERE c.id = ${id}
    `);
    return (rows.rows[0] as Record<string, unknown>) ?? null;
  },

  async createClinic(this: DatabaseStorage, data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string; consultationServiceId?: string; treasuryId?: string; secretaryFeeType?: string; secretaryFeeValue?: number }): Promise<Record<string, unknown>> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_clinics (name_ar, department_id, default_pharmacy_id, consultation_service_id, treasury_id, secretary_fee_type, secretary_fee_value)
      VALUES (${data.nameAr}, ${data.departmentId ?? null}, ${data.defaultPharmacyId ?? null}, ${data.consultationServiceId ?? null}, ${data.treasuryId ?? null}, ${data.secretaryFeeType ?? null}, ${data.secretaryFeeValue ?? 0})
      RETURNING *
    `);
    return rows.rows[0] as Record<string, unknown>;
  },

  async updateClinic(this: DatabaseStorage, id: string, data: Partial<{ nameAr: string; departmentId: string; defaultPharmacyId: string; consultationServiceId: string; treasuryId: string; secretaryFeeType: string; secretaryFeeValue: number; isActive: boolean }>): Promise<Record<string, unknown> | null> {
    const updates = [];
    if (data.nameAr !== undefined) updates.push(sql`name_ar = ${data.nameAr}`);
    if (data.departmentId !== undefined) updates.push(sql`department_id = ${data.departmentId || null}`);
    if (data.defaultPharmacyId !== undefined) updates.push(sql`default_pharmacy_id = ${data.defaultPharmacyId || null}`);
    if (data.consultationServiceId !== undefined) updates.push(sql`consultation_service_id = ${data.consultationServiceId || null}`);
    if (data.treasuryId !== undefined) updates.push(sql`treasury_id = ${data.treasuryId || null}`);
    if (data.secretaryFeeType !== undefined) updates.push(sql`secretary_fee_type = ${data.secretaryFeeType || null}`);
    if (data.secretaryFeeValue !== undefined) updates.push(sql`secretary_fee_value = ${data.secretaryFeeValue ?? 0}`);
    if (data.isActive !== undefined) updates.push(sql`is_active = ${data.isActive}`);
    if (updates.length === 0) return this.getClinicById(id);
    const setClauses = updates.reduce((acc, clause, i) => i === 0 ? clause : sql`${acc}, ${clause}`);
    await db.execute(sql`UPDATE clinic_clinics SET ${setClauses} WHERE id = ${id}`);
    return this.getClinicById(id);
  },

  async getUserClinicIds(this: DatabaseStorage, userId: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT clinic_id FROM (
        SELECT clinic_id FROM clinic_user_clinic_assignments WHERE user_id = ${userId}
        UNION
        SELECT clinic_id FROM user_clinics WHERE user_id = ${userId}
      ) combined
    `);
    return (rows.rows as Array<{ clinic_id: string }>).map(r => r.clinic_id);
  },

  async assignUserToClinic(this: DatabaseStorage, userId: string, clinicId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO clinic_user_clinic_assignments (user_id, clinic_id)
      VALUES (${userId}, ${clinicId})
      ON CONFLICT (user_id, clinic_id) DO NOTHING
    `);
  },

  async removeUserFromClinic(this: DatabaseStorage, userId: string, clinicId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM clinic_user_clinic_assignments WHERE user_id = ${userId} AND clinic_id = ${clinicId}
    `);
  },
};

export default methods;
