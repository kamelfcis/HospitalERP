import { db } from "../db";
import { eq, and, sql, asc, ilike } from "drizzle-orm";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  staySegments,
  surgeryTypes,
  surgeryCategoryPrices,
  type StaySegment,
  type SurgeryType,
  type InsertSurgeryType,
  type SurgeryCategoryPrice,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getStaySegments(this: DatabaseStorage, admissionId: string): Promise<StaySegment[]> {
    const result = await db.execute(
      sql`SELECT * FROM stay_segments WHERE admission_id = ${admissionId} ORDER BY started_at ASC`
    );
    return result.rows as unknown as StaySegment[];
  },

  async openStaySegment(this: DatabaseStorage, params: {
    admissionId: string;
    serviceId?: string;
    invoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      const admResult = await tx.execute(sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`);
      const admission = admResult.rows?.[0] as Record<string, unknown> | undefined;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      const activeCheck = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${params.admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      if ((activeCheck.rows?.length || 0) > 0) {
        throw new Error("يوجد قطاع إقامة نشط بالفعل – استخدم تحويل الإقامة لتغيير الخدمة");
      }

      let ratePerDay = "0";
      if (params.serviceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.serviceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as Record<string, unknown>)?.base_price ?? "0");
      }

      const [seg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.serviceId || null,
        invoiceId: params.invoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();
      return seg;
    });
  },

  async closeStaySegment(this: DatabaseStorage, segmentId: string): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${segmentId} FOR UPDATE`
      );
      const seg = lockResult.rows?.[0] as Record<string, unknown> | undefined;
      if (!seg) throw new Error("القطاع غير موجود");
      if (seg.status === "CLOSED") throw new Error("القطاع مغلق بالفعل");

      const [updated] = await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, segmentId)).returning();
      return updated;
    });
  },

  async transferStaySegment(this: DatabaseStorage, params: {
    admissionId: string;
    oldSegmentId: string;
    newServiceId?: string;
    newInvoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      const admResult = await tx.execute(
        sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`
      );
      const admission = admResult.rows?.[0] as Record<string, unknown> | undefined;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      const segResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${params.oldSegmentId} AND admission_id = ${params.admissionId} FOR UPDATE`
      );
      const oldSeg = segResult.rows?.[0] as Record<string, unknown> | undefined;
      if (!oldSeg) throw new Error("القطاع المصدر غير موجود");
      if (oldSeg.status !== "ACTIVE") throw new Error("القطاع المصدر ليس نشطاً");

      await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, params.oldSegmentId));

      let ratePerDay = "0";
      if (params.newServiceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as Record<string, unknown>)?.base_price ?? "0");
      }

      const [newSeg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.newServiceId || null,
        invoiceId: params.newInvoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();

      return newSeg;
    });
  },

  async getSurgeryTypes(this: DatabaseStorage, search?: string): Promise<SurgeryType[]> {
    if (search) {
      return db.select().from(surgeryTypes)
        .where(ilike(surgeryTypes.nameAr, `%${search}%`))
        .orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
    }
    return db.select().from(surgeryTypes).orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
  },

  async createSurgeryType(this: DatabaseStorage, data: InsertSurgeryType): Promise<SurgeryType> {
    const [row] = await db.insert(surgeryTypes).values(data).returning();
    return row;
  },

  async updateSurgeryType(this: DatabaseStorage, id: string, data: Partial<InsertSurgeryType>): Promise<SurgeryType> {
    const [row] = await db.update(surgeryTypes).set(data).where(eq(surgeryTypes.id, id)).returning();
    if (!row) throw new Error("نوع العملية غير موجود");
    return row;
  },

  async deleteSurgeryType(this: DatabaseStorage, id: string): Promise<void> {
    const linked = await db.execute(
      sql`SELECT id FROM admissions WHERE surgery_type_id = ${id} LIMIT 1`
    );
    if (linked.rows.length > 0) throw new Error("لا يمكن حذف نوع العملية — مرتبط بقبول مريض");
    await db.delete(surgeryTypes).where(eq(surgeryTypes.id, id));
  },

  async getSurgeryCategoryPrices(this: DatabaseStorage): Promise<SurgeryCategoryPrice[]> {
    return db.select().from(surgeryCategoryPrices).orderBy(asc(surgeryCategoryPrices.category));
  },

  async upsertSurgeryCategoryPrice(this: DatabaseStorage, category: string, price: string, serviceId?: string | null, packageServiceId?: string | null): Promise<SurgeryCategoryPrice> {
    const set: Record<string, unknown> = { price };
    if (serviceId !== undefined) set.serviceId = serviceId;
    if (packageServiceId !== undefined) set.packageServiceId = packageServiceId;
    const vals: any = { category, price };
    if (serviceId !== undefined) vals.serviceId = serviceId;
    if (packageServiceId !== undefined) vals.packageServiceId = packageServiceId;
    const [row] = await db.insert(surgeryCategoryPrices)
      .values(vals)
      .onConflictDoUpdate({ target: surgeryCategoryPrices.category, set })
      .returning();
    return row;
  },

  async updateInvoiceSurgeryType(this: DatabaseStorage, invoiceId: string, surgeryTypeId: string | null, isPackage: boolean = false): Promise<void> {
    await db.transaction(async (tx) => {
      const hdrRes = await tx.execute(
        sql`SELECT * FROM patient_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`
      );
      const hdr = hdrRes.rows[0] as Record<string, unknown>;
      if (!hdr) throw new Error("الفاتورة غير موجودة");
      if (hdr.status === "finalized") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.execute(
        sql`DELETE FROM patient_invoice_lines WHERE header_id = ${invoiceId} AND source_type = 'OR_ROOM'`
      );

      await tx.execute(
        sql`UPDATE patient_invoice_headers SET is_package = ${isPackage} WHERE id = ${invoiceId}`
      );

      if (surgeryTypeId) {
        const stRes = await tx.execute(
          sql`SELECT st.id, st.name_ar, st.category, scp.price,
                     scp.service_id, scp.package_service_id
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as Record<string, unknown>;
        if (!st) throw new Error("نوع العملية غير موجود أو غير نشط");

        const linkedServiceId = isPackage
          ? (st.package_service_id as string | null)
          : (st.service_id as string | null);

        let price = parseFloat((st.price as string | null) || "0");
        let desc = isPackage
          ? `باكدج عملية — ${st.name_ar}`
          : `فتح غرفة عمليات — ${st.name_ar}`;

        if (linkedServiceId) {
          const svcRes = await tx.execute(
            sql`SELECT base_price, name_ar FROM services WHERE id = ${linkedServiceId} LIMIT 1`
          );
          const svc = svcRes.rows[0] as Record<string, unknown> | undefined;
          if (svc) {
            price = parseFloat((svc.base_price as string | null) || String(price));
            desc = `${svc.name_ar} — ${st.name_ar}`;
          }
        }

        await tx.execute(
          sql`INSERT INTO patient_invoice_lines
              (header_id, line_type, service_id, description, quantity, unit_price, discount_percent, discount_amount, total_price, unit_level, sort_order, source_type, source_id, business_classification)
              VALUES
              (${invoiceId}, 'service', ${linkedServiceId}, ${desc}, '1', ${String(price)}, '0', '0', ${String(price)}, 'minor', 5, 'OR_ROOM', ${`or_room:${invoiceId}:${surgeryTypeId}`}, 'medical_service')`
        );

        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = ${surgeryTypeId} WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      } else {
        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = NULL WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      }

      const linesRes = await tx.execute(
        sql`SELECT unit_price, quantity, discount_percent FROM patient_invoice_lines WHERE header_id = ${invoiceId}`
      );
      let total = 0;
      let disc = 0;
      for (const l of linesRes.rows as Array<Record<string, unknown>>) {
        const gross = parseFloat(l.unit_price as string) * parseFloat(l.quantity as string);
        const d = gross * parseFloat((l.discount_percent as string | null) || "0") / 100;
        total += gross; disc += d;
      }
      const net = Math.round((total - disc) * 100) / 100;
      await tx.execute(
        sql`UPDATE patient_invoice_headers
            SET total_amount = ${String(Math.round(total * 100) / 100)},
                discount_amount = ${String(Math.round(disc * 100) / 100)},
                net_amount = ${String(net)}
            WHERE id = ${invoiceId}`
      );
    });
  },

};

export default methods;
