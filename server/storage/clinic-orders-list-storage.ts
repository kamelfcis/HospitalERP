import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

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
