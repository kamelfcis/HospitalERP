import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";
import { addLinesToVisitInvoice } from "../services/encounter-routing";

const methods = {
  async executeClinicOrder(this: DatabaseStorage, orderId: string, userId: string): Promise<{ invoiceId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(`
        SELECT o.*, s.base_price AS service_price, s.name_ar AS service_name_ar,
               a.patient_id, a.patient_name, a.doctor_id, a.visit_id,
               a.patient_phone
        FROM clinic_orders o
        JOIN clinic_appointments a ON a.id = o.appointment_id
        LEFT JOIN services s ON s.id = o.service_id
        WHERE o.id = $1 AND o.status IN ('pending', 'executing')
        FOR UPDATE
      `, [orderId]);

      if (!orderRes.rows.length) throw new Error("الأمر غير موجود أو تم تنفيذه مسبقاً");
      const order = orderRes.rows[0] as Record<string, unknown>;

      const unitPrice = parseFloat((order.unit_price as string) ?? '0') || parseFloat((order.service_price as string) ?? '0') || 0;
      const serviceName = (order.service_name_ar as string) ?? (order.service_name_manual as string) ?? '';
      let invoiceId: string;

      if (order.visit_id) {
        await client.query(`
          UPDATE clinic_orders SET status = 'executing' WHERE id = $1
        `, [orderId]);
        await client.query('COMMIT');

        const routeResult = await addLinesToVisitInvoice({
          visitId: order.visit_id as string,
          patientName: order.patient_name as string,
          patientPhone: (order.patient_phone as string) ?? undefined,
          patientId: (order.patient_id as string) ?? undefined,
          encounterType: (order.target_type === 'pharmacy' ? 'clinic' : 'lab') as any,
          encounterDoctorId: (order.doctor_id as string) ?? undefined,
          createdBy: userId,
          encounterMetadata: { source: 'clinic_order', orderId },
          lines: [{
            lineType: 'service' as const,
            serviceId: (order.service_id as string) ?? undefined,
            description: serviceName,
            quantity: 1,
            unitPrice,
            sourceType: 'clinic_order',
            sourceId: orderId,
          }],
        });

        invoiceId = routeResult.invoiceId;

        await client.query('BEGIN');
      } else {
        const totalAmount = unitPrice.toFixed(2);
        const invNumRes = await client.query(`SELECT COALESCE(MAX(invoice_number), 0) + 1 AS next_num FROM patient_invoice_headers`);
        const invoiceNumber = invNumRes.rows[0].next_num;

        const invRes = await client.query(`
          INSERT INTO patient_invoice_headers
            (invoice_number, patient_id, patient_name, admission_id,
             doctor_id, status, invoice_date,
             total_amount, net_amount, paid_amount, discount_amount,
             created_by, notes)
          VALUES ($1,$2,$3,NULL,$4,'finalized',CURRENT_DATE,$5,$5,0,0,$6,$7)
          RETURNING id
        `, [
          invoiceNumber, order.patient_id ?? null, order.patient_name,
          order.doctor_id ?? null, totalAmount, userId,
          `تنفيذ أمر طبيب: ${serviceName}`
        ]);
        invoiceId = invRes.rows[0].id;

        await client.query(`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description, unit_price, quantity, total_price, notes)
          VALUES ($1,'service',$2,$3,$4,1,$4,NULL)
        `, [invoiceId, order.service_id ?? null, serviceName, totalAmount]);
      }

      await client.query(`
        UPDATE clinic_orders
        SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
        WHERE id = $3
      `, [invoiceId, userId, orderId]);

      await client.query('COMMIT');
      return { invoiceId };
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async cancelClinicOrder(this: DatabaseStorage, orderId: string): Promise<void> {
    await db.execute(sql`UPDATE clinic_orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending'`);
  },

  async upsertServiceDoctorPrice(this: DatabaseStorage, serviceId: string, doctorId: string, price: number): Promise<Record<string, unknown>> {
    const rows = await db.execute(sql`
      INSERT INTO clinic_service_doctor_prices (service_id, doctor_id, price)
      VALUES (${serviceId}, ${doctorId}, ${price})
      ON CONFLICT (service_id, doctor_id) DO UPDATE SET price = EXCLUDED.price
      RETURNING *
    `);
    return rows.rows[0] as Record<string, unknown>;
  },

  async deleteServiceDoctorPrice(this: DatabaseStorage, id: string): Promise<void> {
    await db.execute(sql`DELETE FROM clinic_service_doctor_prices WHERE id = ${id}`);
  },

  async getDoctorServicePrice(this: DatabaseStorage, serviceId: string, doctorId: string): Promise<number | null> {
    const rows = await db.execute(sql`
      SELECT price FROM clinic_service_doctor_prices
      WHERE service_id = ${serviceId} AND doctor_id = ${doctorId}
    `);
    if (rows.rows.length > 0) return parseFloat(String((rows.rows[0] as { price: string }).price));
    return null;
  },
};

export default methods;
