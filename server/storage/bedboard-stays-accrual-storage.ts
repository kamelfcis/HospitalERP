import { db } from "../db";
import { getSetting } from "../settings-cache";
import { eq, and, sql } from "drizzle-orm";
import { buildStayLineSQL } from "../lib/stay-engine";
import {
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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
      JOIN patient_invoice_headers pih ON pih.id = s.invoice_id
      WHERE s.status = 'ACTIVE'
        AND pih.status = 'draft'
        AND COALESCE(pih.is_final_closed, false) = false
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

};

export default methods;
