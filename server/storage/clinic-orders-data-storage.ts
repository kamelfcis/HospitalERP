import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
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
};

export default methods;
