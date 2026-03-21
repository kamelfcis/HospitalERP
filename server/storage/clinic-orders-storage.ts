/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Clinic Orders Storage — الطلبات والأسعار وطلبات الخدمات
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - الأدوية المفضلة للطبيب (Doctor Favorite Drugs)
 *  - طلبات العيادة (Clinic Orders)
 *  - كشف حساب الطبيب (Doctor Statement)
 *  - أسعار الخدمات للأطباء (Service Doctor Prices)
 *  - طلبات خدمات الأقسام (Dept Service Orders)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage, DeptServiceOrderInput, DeptServiceBatchInput } from "./index";

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

  async getClinicOrders(this: DatabaseStorage, filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string; clinicIds?: string[] }): Promise<Array<Record<string, unknown>>> {
    // Build conditions using parameterized sql template literals — no sql.raw injection.
    const baseCond = sql`(cl.consultation_service_id IS NULL OR o.service_id IS DISTINCT FROM cl.consultation_service_id)`;

    const targetTypeCond = filters.targetType
      ? sql`AND o.target_type = ${filters.targetType}`
      : sql``;
    const statusCond = filters.status
      ? sql`AND o.status = ${filters.status}`
      : sql``;
    const targetIdCond = filters.targetId
      ? sql`AND o.target_id = ${filters.targetId}`
      : sql``;
    const doctorIdCond = filters.doctorId
      ? sql`AND o.doctor_id = ${filters.doctorId}`
      : sql``;

    // Clinic scope: restrict to allowed clinics when provided (non-empty array = scoped)
    const clinicIdsCond =
      filters.clinicIds && filters.clinicIds.length > 0
        ? sql`AND a.clinic_id = ANY(${filters.clinicIds}::varchar[])`
        : sql``;

    const rows = await db.execute(sql`
      SELECT o.*,
             d.name AS doctor_name, d.specialty AS doctor_specialty,
             s.name_ar AS service_name_ar, s.base_price AS service_price,
             s.department_id AS service_department_id,
             i.name_ar AS item_name_ar,
             a.appointment_date, a.appointment_time, a.turn_number,
             a.patient_name AS appt_patient_name,
             COALESCE(o.target_name, dep.name_ar) AS resolved_target_name,
             dep.code AS department_code
      FROM clinic_orders o
      JOIN doctors d ON d.id = o.doctor_id
      JOIN clinic_appointments a ON a.id = o.appointment_id
      JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN services s ON s.id = o.service_id
      LEFT JOIN departments dep ON o.target_type = 'department'
        AND dep.id = COALESCE(NULLIF(o.target_id, ''), s.department_id)
      LEFT JOIN items i ON i.id = o.item_id
      WHERE ${baseCond}
        ${targetTypeCond}
        ${statusCond}
        ${targetIdCond}
        ${doctorIdCond}
        ${clinicIdsCond}
      ORDER BY o.created_at DESC
    `);
    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      target_name: (r.resolved_target_name as string) ?? (r.target_name as string),
    }));
  },

  async getClinicOrder(this: DatabaseStorage, id: string): Promise<Record<string, unknown> | null> {
    const rows = await db.execute(sql`
      SELECT o.*,
             d.name AS doctor_name,
             s.name_ar AS service_name_ar, s.base_price AS service_price,
             i.name_ar AS item_name_ar,
             i.major_unit_name, i.medium_unit_name, i.minor_unit_name,
             i.major_to_minor, i.medium_to_minor, i.major_to_medium,
             i.sale_price_current, i.has_expiry,
             a.appointment_date, a.patient_name AS appt_patient_name
      FROM clinic_orders o
      JOIN doctors d ON d.id = o.doctor_id
      JOIN clinic_appointments a ON a.id = o.appointment_id
      LEFT JOIN services s ON s.id = o.service_id
      LEFT JOIN items i ON i.id = o.item_id
      WHERE o.id = ${id}
    `);
    return (rows.rows[0] as Record<string, unknown>) ?? null;
  },

  async executeClinicOrder(this: DatabaseStorage, orderId: string, userId: string): Promise<{ invoiceId: string }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(`
        SELECT o.*, s.base_price AS service_price, s.name_ar AS service_name_ar,
               a.patient_id, a.patient_name, a.doctor_id
        FROM clinic_orders o
        JOIN clinic_appointments a ON a.id = o.appointment_id
        LEFT JOIN services s ON s.id = o.service_id
        WHERE o.id = $1 AND o.status = 'pending'
        FOR UPDATE
      `, [orderId]);

      if (!orderRes.rows.length) throw new Error("الأمر غير موجود أو تم تنفيذه مسبقاً");
      const order = orderRes.rows[0] as Record<string, unknown>;

      const unitPrice = parseFloat((order.unit_price as string) ?? '0') || parseFloat((order.service_price as string) ?? '0') || 0;
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
        `تنفيذ أمر طبيب: ${(order.service_name_ar as string) ?? (order.service_name_manual as string) ?? ''}`
      ]);
      const invoiceId = invRes.rows[0].id;

      await client.query(`
        INSERT INTO patient_invoice_lines
          (invoice_id, line_type, service_id, service_name, unit_price, quantity, total_price, notes)
        VALUES ($1,'service',$2,$3,$4,1,$4,NULL)
      `, [invoiceId, order.service_id ?? null, (order.service_name_ar as string) ?? (order.service_name_manual as string) ?? '', totalAmount]);

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

  async getClinicDoctorStatement(this: DatabaseStorage, doctorId: string | null, dateFrom: string, dateTo: string, clinicId?: string | null): Promise<Array<Record<string, unknown>>> {
    const doctorFilter = doctorId ? sql`AND a.doctor_id = ${doctorId}` : sql``;
    const clinicFilter = clinicId ? sql`AND a.clinic_id = ${clinicId}` : sql``;
    const rows = await db.execute(sql`
      SELECT
        a.id AS appointment_id,
        a.appointment_date,
        a.turn_number,
        a.patient_name,
        a.status AS appointment_status,
        cl.name_ar AS clinic_name,
        cl.secretary_fee_type,
        cl.secretary_fee_value,
        d.name AS doctor_name,
        COALESCE(sdp_fee.price, s_fee.base_price, 0)    AS consultation_fee,
        COALESCE(drugs_agg.total, 0)                     AS drugs_total,
        COALESCE(svc_by_dept.details, '[]'::json)        AS services_by_department,
        COALESCE(exec_agg.total_orders, 0)               AS total_orders,
        COALESCE(exec_agg.executed_orders, 0)            AS executed_orders,
        COALESCE(exec_agg.pending_orders, 0)             AS pending_orders,
        COALESCE(exec_agg.total_service_orders, 0)       AS total_service_orders,
        COALESCE(exec_agg.executed_service_orders, 0)    AS executed_service_orders,
        COALESCE(exec_agg.total_pharmacy_orders, 0)      AS total_pharmacy_orders,
        COALESCE(exec_agg.executed_pharmacy_orders, 0)   AS executed_pharmacy_orders
      FROM clinic_appointments a
      LEFT JOIN clinic_consultations c ON c.appointment_id = a.id
      LEFT JOIN clinic_clinics cl ON cl.id = a.clinic_id
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN services s_fee ON s_fee.id = cl.consultation_service_id
      LEFT JOIN clinic_service_doctor_prices sdp_fee
        ON sdp_fee.service_id = cl.consultation_service_id AND sdp_fee.doctor_id = a.doctor_id

      -- أدوية الاستشارة: مجمَّعة مسبقاً بدلاً من LATERAL per-row
      LEFT JOIN (
        SELECT consultation_id, COALESCE(SUM(cd.quantity * cd.unit_price), 0) AS total
        FROM clinic_consultation_drugs cd
        GROUP BY consultation_id
      ) drugs_agg ON drugs_agg.consultation_id = c.id

      -- خدمات الموعد مجمَّعة حسب القسم (مرحلتان بدلاً من LATERAL):
      --   1) inner_agg: GROUP BY (appointment_id, department_id) → totals per dept
      --   2) svc_by_dept: json_agg per appointment_id → JSON array
      -- فلتر consultation_service_id مُنقول داخل الـ subquery عبر JOIN إضافي على clinic_clinics
      LEFT JOIN (
        SELECT
          inner_agg.appointment_id,
          COALESCE(
            json_agg(json_build_object(
              'departmentId',   inner_agg.department_id,
              'departmentName', inner_agg.dept_name,
              'total',          inner_agg.dept_total
            )),
            '[]'::json
          ) AS details
        FROM (
          SELECT
            co.appointment_id,
            COALESCE(dep.id,      '__none__')   AS department_id,
            COALESCE(dep.name_ar, 'بدون قسم')  AS dept_name,
            SUM(
              CASE WHEN co.service_id IS NOT NULL
                   THEN COALESCE(co.unit_price, sv.base_price, 0) * COALESCE(co.quantity, 1)
                   ELSE COALESCE(co.unit_price, 0) * COALESCE(co.quantity, 1)
              END
            ) AS dept_total
          FROM clinic_orders co
          JOIN clinic_appointments ca ON ca.id = co.appointment_id
          JOIN clinic_clinics cc ON cc.id = ca.clinic_id
          LEFT JOIN services sv ON sv.id = co.service_id
          LEFT JOIN departments dep ON dep.id = sv.department_id
          WHERE co.order_type = 'service'
            AND co.status != 'cancelled'
            AND (cc.consultation_service_id IS NULL
                 OR co.service_id IS DISTINCT FROM cc.consultation_service_id)
          GROUP BY co.appointment_id, dep.id, dep.name_ar
        ) inner_agg
        GROUP BY inner_agg.appointment_id
      ) svc_by_dept ON svc_by_dept.appointment_id = a.id

      -- إحصاءات التنفيذ: مجمَّعة مسبقاً بدلاً من LATERAL per-row
      LEFT JOIN (
        SELECT
          eo.appointment_id,
          COUNT(*)::int                                                                        AS total_orders,
          COUNT(*) FILTER (WHERE eo.status = 'executed')::int                                AS executed_orders,
          COUNT(*) FILTER (WHERE eo.status = 'pending')::int                                 AS pending_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'service'  AND eo.status != 'cancelled')::int AS total_service_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'service'  AND eo.status = 'executed')::int   AS executed_service_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'pharmacy' AND eo.status != 'cancelled')::int AS total_pharmacy_orders,
          COUNT(*) FILTER (WHERE eo.order_type = 'pharmacy' AND eo.status = 'executed')::int   AS executed_pharmacy_orders
        FROM clinic_orders eo
        WHERE eo.status != 'cancelled'
        GROUP BY eo.appointment_id
      ) exec_agg ON exec_agg.appointment_id = a.id

      WHERE a.appointment_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
        AND a.status IN ('in_consultation', 'done')
        ${doctorFilter}
        ${clinicFilter}
      ORDER BY a.appointment_date DESC, a.turn_number
    `);
    return rows.rows as Array<Record<string, unknown>>;
  },

  async getServiceDoctorPrices(this: DatabaseStorage, serviceId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await db.execute(sql`
      SELECT sdp.*, d.name AS doctor_name, d.specialty
      FROM clinic_service_doctor_prices sdp
      JOIN doctors d ON d.id = sdp.doctor_id
      WHERE sdp.service_id = ${serviceId}
      ORDER BY d.name
    `);
    return rows.rows as Array<Record<string, unknown>>;
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

  async saveDeptServiceOrder(this: DatabaseStorage, data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE');

      const numRes = await client.query(`SELECT COALESCE(MAX(CASE WHEN invoice_number ~ '^[0-9]+$' THEN invoice_number::int ELSE 0 END), 0) + 1 AS next_num FROM patient_invoice_headers`);
      const invoiceNumber = String(numRes.rows[0].next_num);

      const totalAmount = data.services.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
      const discountAmount = data.discountAmount ?? (data.discountPercent ? totalAmount * data.discountPercent / 100 : 0);
      const netAmount = Math.max(totalAmount - discountAmount, 0);
      const paidAmount = data.orderType === 'cash' ? netAmount : 0;

      const invRes = await client.query(`
        INSERT INTO patient_invoice_headers
          (invoice_number, invoice_date, patient_name, patient_phone,
           department_id, doctor_name, patient_type, contract_name,
           total_amount, discount_amount, header_discount_amount, header_discount_percent,
           net_amount, paid_amount, status, notes, version)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, 'finalized', $13, 1)
        RETURNING id
      `, [
        invoiceNumber, data.patientName, data.patientPhone ?? null,
        data.departmentId, data.doctorName ?? null,
        data.orderType, data.contractName ?? null,
        totalAmount.toFixed(2), discountAmount.toFixed(2),
        data.discountPercent ?? 0, netAmount.toFixed(2), paidAmount.toFixed(2),
        data.notes ?? null,
      ]);
      const invoiceId = invRes.rows[0].id;

      for (let i = 0; i < data.services.length; i++) {
        const svc = data.services[i];
        await client.query(`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description, quantity, unit_price, total_price, sort_order)
          VALUES ($1, 'service', $2, $3, $4, $5, $6, $7)
        `, [invoiceId, svc.serviceId, svc.serviceName, svc.quantity, svc.unitPrice.toFixed(2), (svc.quantity * svc.unitPrice).toFixed(2), i]);
      }

      if (data.orderType === 'cash' && data.treasuryId && netAmount > 0) {
        await client.query(`
          INSERT INTO patient_invoice_payments (header_id, amount, payment_method, treasury_id, notes)
          VALUES ($1, $2, 'cash', $3, 'سداد تلقائي من شاشة خدمات القسم')
        `, [invoiceId, netAmount.toFixed(2), data.treasuryId]);
        await client.query(`
          INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
          VALUES ($1, 'in', $2, $3, 'patient_invoice', $4, CURRENT_DATE)
        `, [data.treasuryId, netAmount.toFixed(2),
            `تحصيل خدمات قسم - فاتورة ${invoiceNumber} - ${data.patientName}`, invoiceId]);
      }

      const today = new Date();
      const tYear = today.getFullYear();
      const tMonth = today.getMonth() + 1;

      const whRes = await client.query(`
        SELECT w.id FROM warehouses w WHERE w.department_id = $1 AND w.is_active = true LIMIT 1
      `, [data.departmentId]);
      const warehouseId = whRes.rows[0]?.id;

      if (warehouseId) {
        for (const svc of data.services) {
          const consumRes = await client.query(`
            SELECT sc.item_id, sc.quantity AS consume_qty, sc.unit_level,
                   i.major_to_minor, i.medium_to_minor, i.name_ar
            FROM service_consumables sc
            JOIN items i ON i.id = sc.item_id
            WHERE sc.service_id = $1
          `, [svc.serviceId]);

          for (const cons of consumRes.rows as Array<Record<string, unknown>>) {
            const consumeQty = parseFloat(cons.consume_qty as string) * svc.quantity;
            let qtyInMinor: number;
            if (cons.unit_level === 'major') {
              qtyInMinor = consumeQty * parseFloat(cons.major_to_minor as string || '1');
            } else if (cons.unit_level === 'medium') {
              qtyInMinor = consumeQty * parseFloat(cons.medium_to_minor as string || '1');
            } else {
              qtyInMinor = consumeQty;
            }

            const lotsRes = await client.query(`
              SELECT id, qty_in_minor, purchase_price, expiry_date, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = $1 AND warehouse_id = $2 AND is_active = true
                AND qty_in_minor::numeric > 0
                AND (expiry_year IS NULL OR expiry_year > $3 OR (expiry_year = $3 AND expiry_month >= $4))
              ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
            `, [cons.item_id, warehouseId, tYear, tMonth]);

            let remaining = qtyInMinor;
            for (const lot of lotsRes.rows as Array<Record<string, unknown>>) {
              if (remaining <= 0) break;
              const available = parseFloat(lot.qty_in_minor as string);
              const deducted = Math.min(available, remaining);

              await client.query(`
                UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - $1::numeric, updated_at = NOW()
                WHERE id = $2
              `, [deducted.toFixed(4), lot.id]);

              await client.query(`
                INSERT INTO inventory_lot_movements
                  (lot_id, warehouse_id, tx_type, tx_date, qty_change_in_minor, unit_cost, reference_type, reference_id)
                VALUES ($1, $2, 'out', NOW(), $3, $4, 'dept_service', $5)
              `, [lot.id, warehouseId, (-deducted).toFixed(4), lot.purchase_price, invoiceId]);

              remaining -= deducted;
            }
          }
        }
      }

      if (data.clinicOrderIds?.length) {
        for (const orderId of data.clinicOrderIds) {
          await client.query(`
            UPDATE clinic_orders SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
            WHERE id = $3 AND status = 'pending'
          `, [invoiceId, data.userId, orderId]);
        }
      }

      await client.query(`
        INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
        VALUES ('patient_invoice_headers', $1, 'dept_service_create', $2, $3)
      `, [invoiceId, JSON.stringify({
        department: data.departmentId, patientName: data.patientName,
        doctor: data.doctorName, orderType: data.orderType,
        services: data.services.map(s => s.serviceName), total: netAmount,
      }), data.userId]);

      await client.query('COMMIT');
      return { invoiceId, invoiceNumber: parseInt(invoiceNumber) };
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async saveDeptServiceOrderBatch(this: DatabaseStorage, data: DeptServiceBatchInput): Promise<{ results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> }> {
    const results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> = [];
    for (const patient of data.patients) {
      try {
        const result = await this.saveDeptServiceOrder({
          patientName: patient.patientName,
          patientPhone: patient.patientPhone,
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          departmentId: data.departmentId,
          orderType: data.orderType,
          contractName: data.contractName,
          treasuryId: data.treasuryId,
          services: data.services,
          discountPercent: data.discountPercent,
          discountAmount: data.discountAmount,
          notes: data.notes,
          userId: data.userId,
        });
        results.push({ patientName: patient.patientName, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber });
      } catch (err: unknown) {
        const _em = err instanceof Error ? err.message : String(err);
        results.push({ patientName: patient.patientName, error: _em });
      }
    }
    return { results };
  },

  async checkDeptServiceDuplicate(this: DatabaseStorage, patientName: string, serviceIds: string[], date: string): Promise<Array<{ serviceName: string; invoiceNumber: number }>> {
    if (!serviceIds.length) return [];
    const placeholders = serviceIds.map((_, i) => `$${i + 3}`).join(',');
    const res = await pool.query(`
      SELECT DISTINCT l.description AS service_name, h.invoice_number
      FROM patient_invoice_headers h
      JOIN patient_invoice_lines l ON l.header_id = h.id
      WHERE h.patient_name = $1
        AND h.invoice_date = $2
        AND h.status != 'cancelled'
        AND l.service_id IN (${placeholders})
    `, [patientName, date, ...serviceIds]);
    return res.rows.map((r: any) => ({ serviceName: r.service_name, invoiceNumber: r.invoice_number }));
  },
};

export default methods;
