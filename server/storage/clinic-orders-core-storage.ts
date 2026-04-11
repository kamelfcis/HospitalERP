import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";
import { addLinesToVisitInvoice } from "../services/encounter-routing";

const methods = {
  async getClinicOrders(this: DatabaseStorage, filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string; clinicIds?: string[] }): Promise<Array<Record<string, unknown>>> {
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

  async getAppointmentOrderTracking(this: DatabaseStorage, appointmentId: string): Promise<{
    totalService: number;
    executedService: number;
    pendingService: number;
    totalPharmacy: number;
    executedPharmacy: number;
    pendingPharmacy: number;
    orders: Array<Record<string, unknown>>;
  }> {
    const rows = await db.execute(sql`
      SELECT
        id,
        order_type,
        status,
        executed_at,
        executed_invoice_id,
        service_name_manual,
        drug_name,
        target_name,
        created_at,
        CASE
          WHEN order_type = 'service'  THEN COALESCE(NULLIF(TRIM(service_name_manual), ''), 'Unnamed order')
          WHEN order_type = 'pharmacy' THEN COALESCE(NULLIF(TRIM(drug_name), ''), 'Unnamed order')
          ELSE 'Unnamed order'
        END AS display_name
      FROM clinic_orders
      WHERE appointment_id = ${appointmentId}
        AND status != 'cancelled'
      ORDER BY order_type, created_at
    `);

    const orders = rows.rows as Array<Record<string, unknown>>;

    for (const o of orders) {
      if (o.status === 'executed' && !o.executed_at) {
        console.warn(`[clinic-orders] status mismatch: order ${o.id} has status=executed but executed_at IS NULL — trusting status`);
      }
    }

    const totalService    = orders.filter(o => o.order_type === 'service').length;
    const executedService = orders.filter(o => o.order_type === 'service'  && o.status === 'executed').length;
    const pendingService  = orders.filter(o => o.order_type === 'service'  && o.status === 'pending').length;
    const totalPharmacy    = orders.filter(o => o.order_type === 'pharmacy').length;
    const executedPharmacy = orders.filter(o => o.order_type === 'pharmacy' && o.status === 'executed').length;
    const pendingPharmacy  = orders.filter(o => o.order_type === 'pharmacy' && o.status === 'pending').length;

    return { totalService, executedService, pendingService, totalPharmacy, executedPharmacy, pendingPharmacy, orders };
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

      LEFT JOIN (
        SELECT consultation_id, COALESCE(SUM(cd.quantity * cd.unit_price), 0) AS total
        FROM clinic_consultation_drugs cd
        GROUP BY consultation_id
      ) drugs_agg ON drugs_agg.consultation_id = c.id

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

  async getConsultationsByPatientName(
    this: DatabaseStorage,
    patientName: string,
    limit: number = 5,
    offset: number = 0,
    excludeAppointmentId?: string | null,
    clinicIds?: string[] | null
  ): Promise<{ data: Array<Record<string, unknown>>; hasMore: boolean }> {
    const normalizedName = patientName.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) {
      return { data: [], hasMore: false };
    }

    const clinicCond =
      clinicIds && clinicIds.length > 0
        ? sql`AND a.clinic_id = ANY(${clinicIds}::varchar[])`
        : sql``;

    const excludeCond = excludeAppointmentId
      ? sql`AND a.id != ${excludeAppointmentId}`
      : sql``;

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
        d.name  AS doctor_name,
        cl.name_ar AS clinic_name,
        COALESCE(drugs_agg.drugs, '[]'::json) AS drugs,
        COALESCE(orders_agg.service_count, 0)  AS service_count,
        COALESCE(orders_agg.pharmacy_count, 0) AS pharmacy_count
      FROM clinic_consultations c
      JOIN clinic_appointments a  ON a.id  = c.appointment_id
      JOIN doctors          d  ON d.id  = a.doctor_id
      JOIN clinic_clinics   cl ON cl.id = a.clinic_id
      LEFT JOIN (
        SELECT consultation_id,
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
        SELECT consultation_id,
               COUNT(*) FILTER (WHERE order_type = 'service')  AS service_count,
               COUNT(*) FILTER (WHERE order_type = 'pharmacy') AS pharmacy_count
        FROM clinic_orders
        WHERE status != 'cancelled'
        GROUP BY consultation_id
      ) orders_agg ON orders_agg.consultation_id = c.id
      WHERE LOWER(TRIM(a.patient_name)) = LOWER(TRIM(${normalizedName}))
        ${clinicCond}
        ${excludeCond}
      ORDER BY COALESCE(a.appointment_date, c.created_at::date) DESC, c.created_at DESC
      LIMIT ${fetchLimit}
      OFFSET ${offset}
    `);

    const all = rows.rows as Array<Record<string, unknown>>;
    const hasMore = all.length > limit;
    return { data: hasMore ? all.slice(0, limit) : all, hasMore };
  },

  async getGroupedClinicOrders(
    this: DatabaseStorage,
    filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string; clinicIds?: string[] }
  ): Promise<Array<Record<string, unknown>>> {
    const flat = await this.getClinicOrders(filters);

    const groupMap = new Map<string, {
      groupKey: string;
      appointmentId: string;
      orderType: string;
      targetType: string;
      targetId: string | null;
      targetName: string | null;
      patientName: string;
      doctorId: string;
      doctorName: string;
      appointmentDate: string | null;
      lines: Array<Record<string, unknown>>;
      latestCreatedAt: string | null;
    }>();

    for (const row of flat) {
      const appointmentId = row.appointment_id as string;
      const orderType     = row.order_type as string;
      const targetKey     = (row.target_id as string | null) || (row.target_name as string | null) || "";
      const groupKey      = `${appointmentId}_${orderType}_${targetKey}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          appointmentId,
          orderType,
          targetType:      (row.target_type as string) ?? "",
          targetId:        (row.target_id  as string | null) ?? null,
          targetName:      (row.target_name as string | null) ?? null,
          patientName:     (row.appt_patient_name as string) || (row.patient_name as string) || "",
          doctorId:        (row.doctor_id   as string) ?? "",
          doctorName:      (row.doctor_name as string) ?? "",
          appointmentDate: (row.appointment_date as string | null) ?? null,
          lines:           [],
          latestCreatedAt: null,
        });
      }

      const grp = groupMap.get(groupKey)!;
      grp.lines.push(row);

      const rowTs = row.created_at as string | null;
      if (rowTs && (!grp.latestCreatedAt || rowTs > grp.latestCreatedAt)) {
        grp.latestCreatedAt = rowTs;
      }
    }

    const result = Array.from(groupMap.values()).map(grp => {
      const nonCancelled = grp.lines.filter(l => l.status !== "cancelled");
      const pendingCount  = grp.lines.filter(l => l.status === "pending").length;
      const executedCount = grp.lines.filter(l => l.status === "executed").length;
      const cancelledCount = grp.lines.filter(l => l.status === "cancelled").length;
      const totalCount    = grp.lines.length;

      const allExecuted = nonCancelled.length > 0 && nonCancelled.every(l => l.status === "executed");
      const allPending  = nonCancelled.length > 0 && nonCancelled.every(l => l.status === "pending");
      const groupStatus = allExecuted ? "executed" : allPending ? "pending" : "mixed";

      return {
        group_key:        grp.groupKey,
        appointment_id:   grp.appointmentId,
        order_type:       grp.orderType,
        target_type:      grp.targetType,
        target_id:        grp.targetId,
        target_name:      grp.targetName,
        patient_name:     grp.patientName,
        doctor_id:        grp.doctorId,
        doctor_name:      grp.doctorName,
        appointment_date: grp.appointmentDate,
        total_count:      totalCount,
        pending_count:    pendingCount,
        executed_count:   executedCount,
        cancelled_count:  cancelledCount,
        group_status:     groupStatus,
        latest_created_at: grp.latestCreatedAt,
        lines:            grp.lines,
      };
    });

    result.sort((a, b) => {
      const aTs = (a.latest_created_at as string) ?? "";
      const bTs = (b.latest_created_at as string) ?? "";
      return bTs.localeCompare(aTs);
    });

    return result;
  },
};

export default methods;
