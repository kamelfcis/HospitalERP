/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Bedboard Beds Storage — لوحة الأسرة وإدارة المرضى
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - لوحة الأسرة (getBedBoard)
 *  - الأسرة المتاحة (getAvailableBeds)
 *  - إدخال المريض لسرير (admitPatientToBed)
 *  - نقل المريض بين الأسرة (transferPatientBed)
 *  - إخلاء السرير (dischargeFromBed)
 *  - تحديث حالة السرير (setBedStatus)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { getSetting } from "../settings-cache";
import { normalizeArabicName } from "../services/patient-dedup";
import { eq, and, sql, asc, ilike } from "drizzle-orm";
import { buildStayLineSQL } from "../lib/stay-engine";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  patientVisits,
  staySegments,
  surgeryTypes,
  surgeryCategoryPrices,
  beds,
  auditLog,
  type StaySegment,
  type SurgeryType,
  type InsertSurgeryType,
  type SurgeryCategoryPrice,
  type Bed,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import type { InsertAdmission, InsertPatientInvoiceHeader } from "@shared/schema";

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

  async admitPatientToBed(this: DatabaseStorage, params: {
    bedId: string; patientName: string; patientPhone?: string; patientId?: string;
    departmentId?: string; serviceId?: string; doctorName?: string; notes?: string;
    paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as Record<string, unknown>;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "EMPTY") throw new Error("السرير غير فارغ — يرجى اختيار سرير آخر");

      const cntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM admissions`);
      const seq = parseInt((cntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const admissionNumber = `ADM-${String(seq).padStart(6, "0")}`;

      let resolvedPatientId: string | null = params.patientId || null;

      if (!resolvedPatientId) {
        const normName = normalizeArabicName(params.patientName);
        const existingPatient = await tx.execute(
          sql`SELECT id FROM patients WHERE LOWER(TRIM(full_name)) = LOWER(${params.patientName}) OR normalized_full_name = ${normName} LIMIT 1`
        );
        if (existingPatient.rows.length === 0) {
          const newPat = await tx.execute(sql`
            INSERT INTO patients (id, full_name, normalized_full_name, phone, national_id, age, is_active, created_at)
            VALUES (gen_random_uuid(), ${params.patientName}, ${normName}, ${params.patientPhone || null}, null, null, true, NOW())
            RETURNING id
          `);
          resolvedPatientId = (newPat.rows[0] as Record<string, unknown>).id as string;
        } else {
          resolvedPatientId = (existingPatient.rows[0] as Record<string, unknown>).id as string;
          if (params.patientPhone) {
            await tx.execute(sql`UPDATE patients SET phone = ${params.patientPhone} WHERE id = ${resolvedPatientId}`);
          }
        }
      }

      const [admission] = await tx.insert(admissions).values({
        admissionNumber,
        patientId: resolvedPatientId,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionDate: new Date().toISOString().split("T")[0] as unknown as Date,
        doctorName: params.doctorName || null,
        notes: params.notes || null,
        status: "active" as "active",
        paymentType: (params.paymentType === "contract" ? "contract" : "CASH") as "contract" | "CASH",
        insuranceCompany: params.insuranceCompany || null,
        surgeryTypeId: params.surgeryTypeId || null,
        departmentId: params.departmentId || null,
      } as unknown as InsertAdmission).returning();

      let warehouseId: string | null = null;
      if (params.departmentId) {
        const whRes = await tx.execute(
          sql`SELECT id FROM warehouses WHERE department_id = ${params.departmentId} LIMIT 1`
        );
        warehouseId = ((whRes.rows[0] as Record<string, unknown>)?.id as string | null | undefined) || null;
      }
      if (!warehouseId) {
        const whRes = await tx.execute(sql`SELECT id FROM warehouses ORDER BY created_at LIMIT 1`);
        warehouseId = ((whRes.rows[0] as Record<string, unknown>)?.id as string | null | undefined) || null;
      }
      if (!warehouseId) throw new Error("لا يوجد مخزن متاح — يرجى إنشاء مخزن أولاً");

      // ── إنشاء patient_visit (type=inpatient) ─────────────────────────────────
      const pvCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_visits`);
      const pvSeq = parseInt((pvCntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const visitNumber = `VIS-${String(pvSeq).padStart(6, "0")}`;

      const [patientVisit] = await tx.insert(patientVisits).values({
        visitNumber,
        patientId: resolvedPatientId!,
        visitType: "inpatient",
        departmentId: params.departmentId || null,
        admissionId: admission.id,
        status: "open",
        notes: params.notes || null,
      } as any).returning();
      // ─────────────────────────────────────────────────────────────────────────

      const invCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
      const invSeq = parseInt((invCntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const invoiceNumber = `PI-${String(invSeq).padStart(6, "0")}`;

      const [invoice] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionId: admission.id,
        visitId: patientVisit.id,
        warehouseId,
        departmentId: params.departmentId || null,
        doctorName: admission.doctorName || null,
        patientId: resolvedPatientId,
        patientType: (params.paymentType === "contract" ? "contract" : "cash") as "contract" | "cash",
        contractName: params.paymentType === "contract" ? (params.insuranceCompany || null) : null,
        status: "draft" as "draft",
        invoiceDate: new Date().toISOString().split("T")[0] as unknown as Date,
        totalAmount: "0",
        discountAmount: "0",
        netAmount: "0",
        paidAmount: "0",
        version: 1,
      } as unknown as import("@shared/schema").InsertPatientInvoiceHeader).returning();

      const roomRes = await tx.execute(
        sql`SELECT r.service_id, COALESCE(s.base_price, '0') AS base_price, COALESCE(s.name_ar, 'إقامة') AS service_name_ar
            FROM beds b JOIN rooms r ON r.id = b.room_id
            LEFT JOIN services s ON s.id = r.service_id
            WHERE b.id = ${params.bedId} LIMIT 1`
      );
      const roomRow = roomRes.rows[0] as Record<string, unknown>;
      const effectiveServiceId: string | null = params.serviceId || (roomRow?.service_id as string | null | undefined) || null;
      const ratePerDay = params.serviceId
        ? String(((await tx.execute(sql`SELECT base_price FROM services WHERE id = ${params.serviceId} LIMIT 1`)).rows[0] as Record<string, unknown>)?.base_price ?? "0")
        : String(roomRow?.base_price ?? "0");
      const serviceNameAr: string = String(roomRow?.service_name_ar ?? "إقامة");

      let segmentId: string | undefined;
      if (effectiveServiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId: admission.id,
          serviceId: effectiveServiceId,
          invoiceId: invoice.id,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        segmentId = seg.id;

        const admittedAt = new Date();
        const dateStr = admittedAt.toISOString().split("T")[0];
        const sourceId = `${invoice.id}:${seg.id}:${dateStr}`;
        await tx.execute(buildStayLineSQL({
          invoiceId:   invoice.id,
          serviceId:   effectiveServiceId,
          description: `${serviceNameAr} – يوم 1`,
          ratePerDay,
          sourceId,
          sortOrder:   0,
        }));

        const allLines1 = await tx.select().from(patientInvoiceLines)
          .where(and(eq(patientInvoiceLines.headerId, invoice.id as string), eq(patientInvoiceLines.isVoid, false)));
        const totals1 = this.computeInvoiceTotals(allLines1 as unknown as Record<string, unknown>[], []);
        await tx.update(patientInvoiceHeaders).set({ ...totals1, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoice.id as string));
      }

      if (params.surgeryTypeId) {
        const stRes = await tx.execute(
          sql`SELECT st.name_ar, st.category, COALESCE(scp.price, 0) AS price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${params.surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as Record<string, unknown>;
        if (st) {
          const orPrice = String(parseFloat((st.price as string | null) || "0"));
          const orDesc = `فتح غرفة عمليات — ${st.name_ar}`;
          const orSourceId = `or_room:${invoice.id}:${params.surgeryTypeId}`;
          await tx.execute(sql`
            INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount,
               total_price, unit_level, sort_order, source_type, source_id)
            VALUES
              (${invoice.id}, 'service', ${orDesc}, '1', ${orPrice}, '0', '0',
               ${orPrice}, 'minor', 5, 'OR_ROOM', ${orSourceId})
            ON CONFLICT (source_type, source_id)
              WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
            DO NOTHING
          `);
          const allLines2 = await tx.select().from(patientInvoiceLines)
            .where(and(eq(patientInvoiceLines.headerId, invoice.id as string), eq(patientInvoiceLines.isVoid, false)));
          const totals2 = this.computeInvoiceTotals(allLines2 as unknown as Record<string, unknown>[], []);
          await tx.update(patientInvoiceHeaders).set({ ...totals2, updatedAt: new Date() })
            .where(eq(patientInvoiceHeaders.id, invoice.id as string));
        }
      }

      const [updatedBed] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admission.id,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.bedId,
        action: "admit",
        newValues: JSON.stringify({ admissionId: admission.id, invoiceId: invoice.id, segmentId, visitId: patientVisit.id, visitNumber }),
      });

      return { bed: updatedBed, admissionId: admission.id, invoiceId: invoice.id, segmentId, visitId: patientVisit.id, visitNumber };
    });

    console.log(`[BED_BOARD] Admitted ${params.patientName} → bed ${params.bedId} admission ${result.admissionId} visit ${result.visitNumber}`);
    return result;
  },

  async transferPatientBed(this: DatabaseStorage, params: {
    sourceBedId: string;
    targetBedId: string;
    newServiceId?: string;
    newInvoiceId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      const [id1, id2] = [params.sourceBedId, params.targetBedId].sort();
      await tx.execute(sql`SELECT id FROM beds WHERE id IN (${id1}, ${id2}) FOR UPDATE`);

      const srcRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.sourceBedId}`);
      const src = srcRes.rows[0] as Record<string, unknown>;
      if (!src) throw new Error("سرير المصدر غير موجود");
      if (src.status !== "OCCUPIED") throw new Error("لا يوجد مريض في سرير المصدر");

      const tgtRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.targetBedId}`);
      const tgt = tgtRes.rows[0] as Record<string, unknown>;
      if (!tgt) throw new Error("السرير الهدف غير موجود");
      if (tgt.status !== "EMPTY") throw new Error("السرير الهدف غير فارغ — اختر سريراً آخر");

      const admissionId = src.current_admission_id as string;

      const tgtRoomRes = await tx.execute(sql`
        SELECT r.service_id,
               COALESCE(s.base_price, '0') AS base_price,
               COALESCE(s.name_ar, 'إقامة') AS service_name_ar
        FROM beds b
        JOIN rooms r ON r.id = b.room_id
        LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
        WHERE b.id = ${params.targetBedId}
        LIMIT 1
      `);
      const tgtRoom = tgtRoomRes.rows[0] as Record<string, unknown>;

      const effectiveServiceId: string | null =
        params.newServiceId || (tgtRoom?.service_id as string | null | undefined) || null;
      const ratePerDay = effectiveServiceId
        ? params.newServiceId
          ? String(((await tx.execute(
              sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
            )).rows[0] as Record<string, unknown>)?.base_price ?? "0")
          : String(tgtRoom?.base_price ?? "0")
        : "0";
      const serviceNameAr: string = String(tgtRoom?.service_name_ar ?? "إقامة");

      const activeSegRes = await tx.execute(
        sql`SELECT id, invoice_id FROM stay_segments
            WHERE admission_id = ${admissionId} AND status = 'ACTIVE'
            LIMIT 1`
      );
      const activeSeg = activeSegRes.rows[0] as Record<string, unknown>;

      let invoiceId: string | null = (activeSeg?.invoice_id as string | null | undefined) || params.newInvoiceId || null;

      if (activeSeg) {
        await tx.update(staySegments)
          .set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, activeSeg.id as string));
      }

      let newSegId: string | undefined;
      if (effectiveServiceId && invoiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId,
          serviceId: effectiveServiceId,
          invoiceId: invoiceId!,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        newSegId = seg.id;

        const dateStr = new Date().toISOString().split("T")[0];
        const sourceId = `transfer:${invoiceId}:${seg.id}:${dateStr}`;

        const lineCountRes = await tx.execute(
          sql`SELECT COUNT(*) AS cnt FROM patient_invoice_lines
              WHERE header_id = ${invoiceId}
                AND source_type = 'STAY_ENGINE'
                AND is_void = false`
        );
        const existingCount = parseInt((lineCountRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0");
        const lineDesc = `${serviceNameAr} — إقامة إضافية (تحويل)`;

        await tx.execute(buildStayLineSQL({
          invoiceId:   invoiceId!,
          serviceId:   effectiveServiceId,
          description: lineDesc,
          ratePerDay,
          sourceId,
          sortOrder:   existingCount + 10,
        }));

        const allLines = await tx.select().from(patientInvoiceLines)
          .where(and(
            eq(patientInvoiceLines.headerId, invoiceId),
            eq(patientInvoiceLines.isVoid, false),
          ));
        const totals = this.computeInvoiceTotals(allLines as unknown as Record<string, unknown>[], []);
        await tx.update(patientInvoiceHeaders)
          .set({ ...totals, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId));
      }

      const [updatedSrc] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.sourceBedId)).returning();

      const [updatedTgt] = await tx.update(beds).set({ status: "OCCUPIED", currentAdmissionId: admissionId, updatedAt: new Date() }).where(eq(beds.id, params.targetBedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.sourceBedId,
        action: "transfer",
        newValues: JSON.stringify({
          admissionId,
          targetBedId: params.targetBedId,
          newServiceId: effectiveServiceId,
          invoiceId,
          newSegmentId: newSegId,
        }),
      });

      return {
        sourceBed: updatedSrc,
        targetBed: updatedTgt,
        invoiceId,
        newServiceId: effectiveServiceId,
        ratePerDay,
      };
    });

    console.log(
      `[BED_BOARD] Transfer ${params.sourceBedId} → ${params.targetBedId}` +
      (result.newServiceId ? ` | grade service=${result.newServiceId} rate=${result.ratePerDay}/day` : " | no grade"),
    );
    return result;
  },

  async dischargeFromBed(this: DatabaseStorage, bedId: string) {
    const result = await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as Record<string, unknown>;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "OCCUPIED") throw new Error("لا يوجد مريض في هذا السرير");

      const admissionId = bed.current_admission_id as string;

      const segRes = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      for (const seg of segRes.rows as Array<Record<string, unknown>>) {
        await tx.update(staySegments).set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, seg.id as string));
      }

      await tx.update(admissions).set({
        status: "discharged" as "discharged",
        dischargeDate: new Date().toISOString().split("T")[0],
        updatedAt: new Date(),
      }).where(eq(admissions.id, admissionId));

      const [updatedBed] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "discharge",
        newValues: JSON.stringify({ admissionId }),
      });

      return { bed: updatedBed };
    });

    console.log(`[BED_BOARD] Discharged from bed ${bedId}`);
    return result;
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
