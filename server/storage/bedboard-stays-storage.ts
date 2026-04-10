/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Bedboard Stays Storage — مقاطع الإقامة وأنواع الجراحات
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - مقاطع الإقامة (Stay Segments: open/close/transfer/accrue)
 *  - أنواع الجراحة (Surgery Types CRUD)
 *  - أسعار فئات الجراحة (Surgery Category Prices)
 *  - ربط نوع الجراحة بالفاتورة (updateInvoiceSurgeryType)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { getSetting } from "../settings-cache";
import { eq, and, sql, asc, ilike } from "drizzle-orm";
import { buildStayLineSQL } from "../lib/stay-engine";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
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

  /**
   * ══════════════════════════════════════════════════════════════════
   *  accrueStayLines — احتساب رسوم الإقامة اليومية (Stay Engine)
   * ══════════════════════════════════════════════════════════════════
   *
   *  ماذا تفعل؟
   *   تُنفَّذ بشكل دوري (cron أو يدوي) لإضافة سطور الرسوم اليومية
   *   لفواتير المرضى النزلاء في المستشفى.
   *
   *  طريقة الاحتساب — وضعان:
   *
   *  ① hours_24 (الوضع الافتراضي)
   *   - رسوم يوم كامل عن كل 24 ساعة منذ تاريخ الدخول
   *   - اليوم الأول يُحتسب فور الدخول (n=0)
   *   - الصيغة: floor((now - startedAt) / 86400000) + 1 يوم
   *
   *  ② hotel_noon
   *   - رسوم يوم عن اليوم الأول (من وقت الدخول لظهر اليوم التالي)
   *   - ثم رسوم يوم كامل عن كل يوم يمر بعد الظهر (12:00 UTC)
   *   - النمط الفندقي المعتاد: Check-in في أي وقت، Check-out قبل الظهر
   *
   *  الـ Idempotency (الحماية من التكرار):
   *   كل سطر له source_id فريد بالصيغة:
   *   `{invoiceId}:{segmentId}:{bucketKey}`
   *   الـ UPSERT يمنع إضافة نفس اليوم مرتين حتى لو نُفِّذت الدالة مرتين.
   *
   *  الـ Transfer Handling:
   *   عند نقل المريض لسرير آخر، اليوم الأول من القطاع الجديد قد يكون
   *   مغطى بالفعل — يتم تخطيه إذا وُجد سطر transfer مرتبط.
   *
   *  تحذيرات:
   *   - تستخدم FOR UPDATE على فاتورة المريض لمنع race conditions
   *   - فشل قطاع واحد لا يوقف معالجة باقي القطاعات
   * ══════════════════════════════════════════════════════════════════
   */
  async accrueStayLines(this: DatabaseStorage): Promise<{ segmentsProcessed: number; linesUpserted: number }> {
    const activeResult = await db.execute(sql`
      SELECT s.id, s.admission_id, s.invoice_id, s.service_id, s.started_at,
             s.rate_per_day, COALESCE(srv.name_ar, 'إقامة') AS service_name_ar
      FROM stay_segments s
      LEFT JOIN services srv ON s.service_id = srv.id
      WHERE s.status = 'ACTIVE'
    `);
    const segments = activeResult.rows as unknown as Array<{
      id: string;
      admission_id: string;
      invoice_id: string;
      service_id: string | null;
      started_at: string;
      rate_per_day: string;
      service_name_ar: string;
    }>;
    let totalLinesUpserted = 0;

    for (const seg of segments) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM patient_invoice_headers WHERE id = ${seg.invoice_id} FOR UPDATE`
          );

          const billingMode = getSetting("stay_billing_mode", "hours_24");
          const startedAt = new Date(seg.started_at);
          const now = new Date();

          type BucketEntry = { key: string; desc: string };
          const bucketEntries: BucketEntry[] = [];

          if (billingMode === "hotel_noon") {
            const firstNoon = new Date(startedAt);
            firstNoon.setUTCHours(12, 0, 0, 0);
            if (startedAt.getTime() >= firstNoon.getTime()) {
              firstNoon.setUTCDate(firstNoon.getUTCDate() + 1);
            }
            const startDateStr = startedAt.toISOString().split("T")[0];
            bucketEntries.push({ key: `noon:${startDateStr}`, desc: `${seg.service_name_ar} – ${startDateStr}` });

            const cur = new Date(firstNoon);
            while (cur.getTime() <= now.getTime()) {
              const dateStr = cur.toISOString().split("T")[0];
              bucketEntries.push({ key: `noon:${dateStr}`, desc: `${seg.service_name_ar} – ${dateStr}` });
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          } else {
            const elapsedMs        = now.getTime() - startedAt.getTime();
            const periodsCompleted = Math.max(0, Math.floor(elapsedMs / 86_400_000));

            for (let n = 0; n <= periodsCompleted; n++) {
              const periodStart = new Date(startedAt.getTime() + n * 86_400_000);
              const dateStr     = periodStart.toISOString().split("T")[0];
              bucketEntries.push({ key: dateStr, desc: `${seg.service_name_ar} – يوم ${n + 1}` });
            }
          }

          const rateStr = String(parseFloat(seg.rate_per_day) || 0);
          let linesInserted = 0;

          const transferCheckResult = await tx.execute(sql`
            SELECT source_id FROM patient_invoice_lines
            WHERE header_id = ${seg.invoice_id}
              AND source_type = 'STAY_ENGINE'
              AND source_id LIKE ${'transfer:' + seg.invoice_id + ':' + seg.id + ':%'}
              AND is_void = false
            LIMIT 1
          `);
          const hasTransferLine = (transferCheckResult.rows?.length || 0) > 0;

          for (let bi = 0; bi < bucketEntries.length; bi++) {
            const { key: bucketKey, desc: description } = bucketEntries[bi];

            if (bi === 0 && hasTransferLine) continue;

            const sourceId = `${seg.invoice_id}:${seg.id}:${bucketKey}`;

            const upsertResult = await tx.execute(buildStayLineSQL({
              invoiceId:   seg.invoice_id,
              serviceId:   seg.service_id,
              description,
              ratePerDay:  rateStr,
              sourceId,
              sortOrder:   0,
            }));
            if ((upsertResult.rowCount || 0) > 0) linesInserted++;
          }

          if (linesInserted > 0) {
            const dbLines = await tx.select().from(patientInvoiceLines)
              .where(and(eq(patientInvoiceLines.headerId, (seg.invoice_id as string)), eq(patientInvoiceLines.isVoid, false)));
            const dbPayments = await tx.select().from(patientInvoicePayments)
              .where(eq(patientInvoicePayments.headerId, (seg.invoice_id as string)));
            const totals = this.computeInvoiceTotals(dbLines as unknown as Record<string, unknown>[], dbPayments as unknown as Record<string, unknown>[]);

            await tx.update(patientInvoiceHeaders).set({
              ...totals,
              updatedAt: new Date(),
            }).where(eq(patientInvoiceHeaders.id, (seg.invoice_id as string)));

            await tx.insert(auditLog).values({
              tableName: "patient_invoice_headers",
              recordId: seg.invoice_id,
              action: "stay_accrual",
              newValues: JSON.stringify({ segmentId: seg.id, linesInserted, buckets: bucketEntries.length }),
            });

            console.log(`[STAY_ENGINE] Accrued ${linesInserted} line(s) for segment ${seg.id} → invoice ${seg.invoice_id}`);
          }

          totalLinesUpserted += linesInserted;
        });
      } catch (err: unknown) {
        const _em = err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
        console.error(`[STAY_ENGINE] Segment ${seg.id} accrual failed:`, _em);
      }
    }

    return { segmentsProcessed: segments.length, linesUpserted: totalLinesUpserted };
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
