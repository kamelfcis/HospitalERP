import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { buildStayLineSQL } from "../lib/stay-engine";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  staySegments,
  beds,
  auditLog,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
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
};

export default methods;
