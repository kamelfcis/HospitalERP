import { db } from "../db";
import { getSetting } from "../settings-cache";
import { eq, and, sql, asc, ilike } from "drizzle-orm";
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

            const upsertResult = await tx.execute(sql`
              INSERT INTO patient_invoice_lines
                (header_id, line_type, service_id, description,
                 quantity, unit_price, discount_percent, discount_amount,
                 total_price, unit_level, sort_order, source_type, source_id)
              VALUES
                (${seg.invoice_id}, 'service', ${seg.service_id}, ${description},
                 '1', ${rateStr}, '0', '0',
                 ${rateStr}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
              ON CONFLICT (source_type, source_id)
                WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
              DO NOTHING
            `);
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

  async upsertSurgeryCategoryPrice(this: DatabaseStorage, category: string, price: string): Promise<SurgeryCategoryPrice> {
    const [row] = await db.insert(surgeryCategoryPrices)
      .values({ category, price })
      .onConflictDoUpdate({ target: surgeryCategoryPrices.category, set: { price } })
      .returning();
    return row;
  },

  async updateInvoiceSurgeryType(this: DatabaseStorage, invoiceId: string, surgeryTypeId: string | null): Promise<void> {
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

      if (surgeryTypeId) {
        const stRes = await tx.execute(
          sql`SELECT st.id, st.name_ar, st.category, scp.price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as Record<string, unknown>;
        if (!st) throw new Error("نوع العملية غير موجود أو غير نشط");

        const price = parseFloat((st.price as string | null) || "0");
        const desc = `فتح غرفة عمليات — ${st.name_ar}`;

        await tx.execute(
          sql`INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount, total_price, unit_level, sort_order, source_type, source_id)
              VALUES
              (${invoiceId}, 'service', ${desc}, '1', ${String(price)}, '0', '0', ${String(price)}, 'minor', 5, 'OR_ROOM', ${`or_room:${invoiceId}:${surgeryTypeId}`})`
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

  async getBedBoard(this: DatabaseStorage) {
    const result = await db.execute(sql`
      SELECT
        f.id   AS floor_id,   f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
        r.id   AS room_id,    r.name_ar AS room_name_ar,  r.room_number, r.sort_order AS room_sort,
        r.service_id AS room_service_id,
        svc.name_ar AS room_service_name_ar, svc.base_price AS room_service_price,
        b.id   AS bed_id,     b.bed_number, b.status,
        b.current_admission_id,
        a.patient_name, a.admission_number
      FROM floors f
      JOIN rooms r  ON r.floor_id = f.id
      LEFT JOIN services svc ON svc.id = r.service_id
      JOIN beds  b  ON b.room_id  = r.id
      LEFT JOIN admissions a ON a.id = b.current_admission_id
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);

    const floorsMap = new Map<string, any>();
    for (const row of result.rows as Array<Record<string, unknown>>) {
      if (!floorsMap.has(row.floor_id as string)) {
        floorsMap.set(row.floor_id as string, {
          id: row.floor_id, nameAr: row.floor_name_ar, sortOrder: row.floor_sort,
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
    bedId: string; patientName: string; patientPhone?: string;
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

      const existingPatient = await tx.execute(
        sql`SELECT id FROM patients WHERE full_name = ${params.patientName} AND is_active = true LIMIT 1`
      );
      if (existingPatient.rows.length === 0) {
        await tx.execute(sql`
          INSERT INTO patients (id, full_name, phone, national_id, age, is_active, created_at)
          VALUES (
            gen_random_uuid(),
            ${params.patientName},
            ${params.patientPhone || null},
            null,
            null,
            true,
            NOW()
          )
        `);
      } else if (params.patientPhone) {
        await tx.execute(sql`
          UPDATE patients SET phone = ${params.patientPhone}
          WHERE id = ${(existingPatient.rows[0] as Record<string, unknown>).id as string}
        `);
      }

      const [admission] = await tx.insert(admissions).values({
        admissionNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionDate: new Date().toISOString().split("T")[0] as unknown as Date,
        doctorName: params.doctorName || null,
        notes: params.notes || null,
        status: "active" as "active",
        paymentType: (params.paymentType === "contract" ? "contract" : "CASH") as "contract" | "CASH",
        insuranceCompany: params.insuranceCompany || null,
        surgeryTypeId: params.surgeryTypeId || null,
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

      const invCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
      const invSeq = parseInt((invCntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const invoiceNumber = `PI-${String(invSeq).padStart(6, "0")}`;

      const [invoice] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionId: admission.id,
        warehouseId,
        departmentId: params.departmentId || null,
        doctorName: params.doctorName || null,
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
        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoice.id}, 'service', ${effectiveServiceId}, ${serviceNameAr + " – يوم 1"},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
          DO NOTHING
        `);

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
        newValues: JSON.stringify({ admissionId: admission.id, invoiceId: invoice.id, segmentId }),
      });

      return { bed: updatedBed, admissionId: admission.id, invoiceId: invoice.id, segmentId };
    });

    console.log(`[BED_BOARD] Admitted ${params.patientName} → bed ${params.bedId} admission ${result.admissionId}`);
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

        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoiceId}, 'service', ${effectiveServiceId}, ${lineDesc},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', ${existingCount + 10},
             'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false
              AND source_type IS NOT NULL
              AND source_id IS NOT NULL
          DO NOTHING
        `);

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
