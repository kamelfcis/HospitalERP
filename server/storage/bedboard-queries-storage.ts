import { db } from "../db";
import { sql } from "drizzle-orm";
import { beds, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { DatabaseStorage } from "./index";

const methods = {
  async getBedBoard(this: DatabaseStorage, departmentIds?: string[]) {
    if (departmentIds !== undefined && departmentIds.length === 0) {
      return [];
    }

    const deptFilter = departmentIds
      ? sql`AND (f.department_id = ANY(ARRAY[${sql.join(departmentIds.map(d => sql`${d}`), sql`, `)}]::text[]))`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        f.id   AS floor_id,   f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
        f.department_id AS floor_dept_id,
        d.name_ar AS floor_dept_name,
        r.id   AS room_id,    r.name_ar AS room_name_ar,  r.room_number, r.sort_order AS room_sort,
        r.service_id AS room_service_id,
        svc.name_ar AS room_service_name_ar, svc.base_price AS room_service_price,
        b.id   AS bed_id,     b.bed_number, b.status,
        b.current_admission_id,
        a.patient_name, a.admission_number
      FROM floors f
      JOIN rooms r  ON r.floor_id = f.id
      LEFT JOIN services svc ON svc.id = r.service_id
      LEFT JOIN departments d ON d.id = f.department_id
      JOIN beds  b  ON b.room_id  = r.id
      LEFT JOIN admissions a ON a.id = b.current_admission_id
      WHERE 1=1 ${deptFilter}
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);

    const floorsMap = new Map<string, any>();
    for (const row of result.rows as Array<Record<string, unknown>>) {
      if (!floorsMap.has(row.floor_id as string)) {
        floorsMap.set(row.floor_id as string, {
          id: row.floor_id, nameAr: row.floor_name_ar, sortOrder: row.floor_sort,
          departmentId: row.floor_dept_id || null,
          departmentName: row.floor_dept_name || null,
          rooms: new Map<string, any>(),
        });
      }
      const floor = floorsMap.get(row.floor_id as string);
      if (!floor.rooms.has(row.room_id as string)) {
        floor.rooms.set(row.room_id as string, {
          id: row.room_id, nameAr: row.room_name_ar, roomNumber: row.room_number,
          serviceId: row.room_service_id || null,
          serviceNameAr: row.room_service_name_ar || null,
          servicePrice: row.room_service_price || null,
          sortOrder: row.room_sort, beds: [],
        });
      }
      floor.rooms.get(row.room_id as string).beds.push({
        id: row.bed_id, bedNumber: row.bed_number, status: row.status,
        currentAdmissionId: row.current_admission_id,
        patientName: row.patient_name || undefined,
        admissionNumber: row.admission_number || undefined,
        roomId: row.room_id,
        createdAt: null, updatedAt: null,
      });
    }

    return Array.from(floorsMap.values()).map(f => ({
      ...f,
      rooms: Array.from(f.rooms.values()),
    }));
  },

  async getAvailableBeds(this: DatabaseStorage) {
    const result = await db.execute(sql`
      SELECT b.id, b.bed_number, b.status, b.room_id, b.current_admission_id,
             b.created_at, b.updated_at,
             r.name_ar AS room_name_ar, r.id AS room_id_ref,
             f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
             r.service_id AS room_service_id,
             s.name_ar   AS room_service_name_ar,
             s.base_price AS room_service_price
      FROM beds b
      JOIN rooms r  ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
      WHERE b.status = 'EMPTY'
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      bedNumber: row.bed_number,
      status: row.status,
      roomId: row.room_id,
      currentAdmissionId: row.current_admission_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      roomNameAr: row.room_name_ar,
      floorNameAr: row.floor_name_ar,
      roomServiceId: row.room_service_id ?? null,
      roomServiceNameAr: row.room_service_name_ar ?? null,
      roomServicePrice: row.room_service_price ? String(row.room_service_price) : null,
    }));
  },

  async setBedStatus(this: DatabaseStorage, bedId: string, status: string) {
    return await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as Record<string, unknown>;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status === "OCCUPIED" && status !== "OCCUPIED") {
        throw new Error("لا يمكن تغيير حالة سرير مشغول");
      }

      const [updated] = await tx.update(beds).set({
        status,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "status_change",
        newValues: JSON.stringify({ from: bed.status, to: status }),
      });

      return updated;
    });
  },
};

export default methods;
