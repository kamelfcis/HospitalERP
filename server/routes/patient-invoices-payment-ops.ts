import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission } from "./_shared";
import { resolveBusinessClassificationWithMeta } from "@shared/resolve-business-classification";
import { assertNotFinalClosed } from "./patient-invoices-crud-queries";
import { broadcastPatientInvoiceUpdate } from "./_sse";

export function registerPaymentOpsRoutes(app: Express) {
  app.post("/api/patient-invoices/:id/add-payment", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const userId = (req.session as any)?.userId as string | undefined;
      const { amount, paymentMethod, treasuryId, paymentDate, notes } = req.body as {
        amount: number;
        paymentMethod: string;
        treasuryId?: string;
        paymentDate?: string;
        notes?: string;
      };

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ message: "المبلغ يجب أن يكون أكبر من صفر" });
      }
      const validMethods = ["cash", "card", "bank_transfer", "insurance"];
      if (paymentMethod && !validMethods.includes(paymentMethod)) {
        return res.status(400).json({ message: "طريقة الدفع غير صحيحة" });
      }

      const invRes = await db.execute(sql`
        SELECT id, patient_id, status, is_final_closed, net_amount, paid_amount
        FROM patient_invoice_headers
        WHERE id = ${invoiceId}
        FOR UPDATE
      `);
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (inv.is_final_closed) return res.status(409).json({ message: "لا يمكن إضافة دفعة على فاتورة مغلقة نهائيًا" });
      if (inv.status !== "draft") return res.status(409).json({ message: "إضافة الدفعات تتم على الفواتير في حالة مسودة فقط" });

      const refRes = await db.execute(sql`
        SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
        FROM patient_invoice_payments WHERE reference_number LIKE 'RCP-%'
      `);
      const maxRef = parseInt(((refRes.rows[0] as Record<string, unknown>).max_num as string | null) || "0") || 0;
      const referenceNumber = `RCP-${String(maxRef + 1).padStart(6, "0")}`;

      const actualDate = paymentDate || new Date().toISOString().split("T")[0];

      const paymentInsert = await db.execute(sql`
        INSERT INTO patient_invoice_payments (id, header_id, payment_date, amount, payment_method, treasury_id, reference_number, notes, created_at)
        VALUES (gen_random_uuid(), ${invoiceId}, ${actualDate}, ${Number(amount)}, ${paymentMethod || "cash"}, ${treasuryId || null}, ${referenceNumber}, ${notes || null}, NOW())
        RETURNING id
      `);
      const paymentId = (paymentInsert.rows[0] as Record<string, unknown>).id as string;

      // تسجيل حركة الخزنة
      if (treasuryId) {
        await db.execute(sql`
          INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
          VALUES (${treasuryId}, 'in', ${Number(amount)}, ${"استلام دفعة مريض — " + referenceNumber}, 'patient_invoice_payment', ${paymentId}, ${actualDate})
          ON CONFLICT (source_type, source_id, treasury_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL DO NOTHING
        `);
      }

      const sumRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS total_paid
        FROM patient_invoice_payments
        WHERE header_id = ${invoiceId}
      `);
      const totalPaid = parseFloat(((sumRes.rows[0] as Record<string, unknown>).total_paid as string) || "0");

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET paid_amount = ${totalPaid},
            version    = version + 1,
            updated_at = NOW()
        WHERE id = ${invoiceId}
      `);

      await auditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "add_payment",
        userId,
        newValues: JSON.stringify({ amount, paymentMethod, treasuryId, paymentDate: actualDate, referenceNumber }),
      });

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});

      const patientId = String(inv.patient_id ?? "");
      if (patientId) {
        broadcastPatientInvoiceUpdate(patientId, "payment_added", { invoiceId, amount, ts: Date.now() });
      }

      const updated = await storage.getPatientInvoice(invoiceId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/patient-invoices/:id", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      await assertNotFinalClosed(req.params.id as string);
      const reason = req.body?.reason as string | undefined;
      await storage.deletePatientInvoice(req.params.id as string, reason);
      res.json({ success: true });
    } catch (error: unknown) {
      if ((error as any).statusCode === 409) return res.status(409).json({ message: error instanceof Error ? error.message : String(error) });
      const msg = error instanceof Error ? error.message : String(error);
      if (msg?.includes("نهائية")) return res.status(409).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/admin/backfill-business-classification", requireAuth, async (req, res) => {
    try {
      const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;

      const rows = await db.execute(sql`
        SELECT
          pil.id,
          pil.line_type,
          pil.source_type,
          pil.service_id,
          pil.item_id,
          s.business_classification AS svc_biz_class,
          s.service_type            AS svc_type,
          i.business_classification AS item_biz_class
        FROM patient_invoice_lines pil
        LEFT JOIN services s ON s.id = pil.service_id
        LEFT JOIN items    i ON i.id = pil.item_id
        WHERE pil.business_classification IS NULL
          AND pil.is_void = false
        ORDER BY pil.created_at
      `);

      const lines = rows.rows as Array<{
        id: string;
        line_type: string;
        source_type: string | null;
        service_id: string | null;
        item_id: string | null;
        svc_biz_class: string | null;
        svc_type: string | null;
        item_biz_class: string | null;
      }>;

      let updated = 0;
      let fallbacks = 0;
      const preview: Array<{ id: string; lineType: string; resolved: string; usedFallback: boolean; fallbackReason?: string }> = [];

      for (const row of lines) {
        const { result, usedFallback, fallbackReason } = resolveBusinessClassificationWithMeta({
          lineType:                      row.line_type as "service" | "drug" | "consumable" | "equipment",
          sourceType:                    row.source_type,
          serviceId:                     row.service_id,
          serviceBusinessClassification: row.svc_biz_class,
          serviceType:                   row.svc_type,
          itemBusinessClassification:    row.item_biz_class,
          itemId:                        row.item_id,
        });

        if (usedFallback) {
          fallbacks++;
          logger.warn({ id: row.id, lineType: row.line_type, fallbackReason }, "[BACKFILL] fallback classification");
        }

        if (dryRun) {
          preview.push({ id: row.id, lineType: row.line_type, resolved: result, usedFallback, fallbackReason });
        } else {
          await db.execute(sql`
            UPDATE patient_invoice_lines
            SET business_classification = ${result}
            WHERE id = ${row.id}
              AND business_classification IS NULL
          `);
          updated++;
        }
      }

      if (dryRun) {
        logger.info({ total: lines.length, fallbacks }, "[BACKFILL] dry-run preview complete");
        return res.json({
          dryRun: true, total: lines.length, fallbacks, preview,
          message: `معاينة: ${lines.length} بند سيتم تحديثه — منها ${fallbacks} بند بـ fallback`,
        });
      }

      logger.info({ updated, fallbacks }, "[BACKFILL] business_classification backfill complete");
      res.json({
        success: true, updated, fallbacks,
        message: `تم تحديث ${updated} بند — منها ${fallbacks} بند استُخدم فيه الاشتقاق التلقائي`,
      });
    } catch (err: unknown) {
      logger.error({ err }, "[BACKFILL] business_classification backfill failed");
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
