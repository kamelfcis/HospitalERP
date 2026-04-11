import { db } from "../db";
import { eq, and, sql, or, asc, ilike } from "drizzle-orm";
import {
  doctors,
  type Doctor,
  type InsertDoctor,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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

};

export default methods;
