import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission } from "./_shared";
import { broadcastPatientInvoiceUpdate } from "./_sse";
import { generatePatientInvoiceGL } from "../lib/patient-invoice-gl-generator";
import { logger } from "../lib/logger";

export function registerFinalCloseRoute(app: Express) {

  app.post("/api/patient-invoices/:id/final-close", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any)?.userId as string | undefined;

      const invRes = await db.execute(sql`
        SELECT pih.id, pih.patient_id, pih.status, pih.is_consolidated, pih.admission_id,
               pih.net_amount, pih.paid_amount, pih.is_final_closed,
               pih.patient_type, pih.contract_id, pih.company_id,
               COALESCE((
                 SELECT SUM(dt.amount::numeric) FROM doctor_transfers dt WHERE dt.invoice_id = pih.id
               ), 0)::text AS doctor_transferred_amount
        FROM patient_invoice_headers pih WHERE pih.id = ${id}
      `);
      const inv = invRes.rows[0] as Record<string,unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (inv.is_final_closed) return res.status(409).json({ message: "الفاتورة مغلقة نهائياً بالفعل" });
      if (inv.status === "cancelled") return res.status(409).json({ message: "لا يمكن إغلاق فاتورة ملغاة" });
      if (inv.status !== "finalized") return res.status(409).json({ message: "يجب اعتماد الفاتورة أولاً قبل الإغلاق النهائي" });

      const netAmount             = parseFloat(String(inv.net_amount  || 0));
      const paidAmount            = parseFloat(String(inv.paid_amount || 0));
      const doctorTransferred     = parseFloat(String(inv.doctor_transferred_amount || 0));
      const isContractPatient     = !!(inv.contract_id || inv.company_id);
      const isInpatient           = !!(inv.admission_id);

      if (isContractPatient) {
        const claimRes = await db.execute(sql`
          SELECT COALESCE(SUM(company_share_amount::numeric), 0)::text AS total_company_share
          FROM contract_claim_lines
          WHERE invoice_header_id = ${id}
        `);
        const claimCompanyShare = parseFloat(String((claimRes.rows[0] as Record<string,unknown>)?.total_company_share || "0"));

        let coveredAmount: number;

        if (claimCompanyShare > 0.01) {
          coveredAmount = paidAmount + claimCompanyShare;
        } else {
          const lineShareRes = await db.execute(sql`
            SELECT
              COALESCE(SUM(company_share_amount::numeric), 0)::text AS line_company_share,
              COALESCE(SUM(patient_share_amount::numeric), 0)::text AS line_patient_share,
              COALESCE(SUM(CASE WHEN company_share_amount IS NULL AND patient_share_amount IS NULL
                                THEN total_price::numeric ELSE 0 END), 0)::text AS unassigned_amount
            FROM patient_invoice_lines
            WHERE header_id = ${id} AND COALESCE(is_void, false) = false
          `);
          const lineCompanyShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_company_share  || "0"));
          const linePatientShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_patient_share  || "0"));
          const unassignedAmount  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.unassigned_amount   || "0"));

          if (lineCompanyShare > 0.01 || linePatientShare > 0.01) {
            coveredAmount = paidAmount + lineCompanyShare + unassignedAmount;
          } else {
            coveredAmount = netAmount;
          }
        }

        if (coveredAmount < netAmount - 0.01) {
          const companyPortion = coveredAmount - paidAmount;
          const remaining = netAmount - coveredAmount;
          return res.status(409).json({
            message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي ${remaining.toFixed(2)} ج.م غير مغطى (المدفوع من المريض: ${paidAmount.toFixed(2)} + نصيب الشركة: ${companyPortion.toFixed(2)} من أصل ${netAmount.toFixed(2)})`,
          });
        }
      } else {
        // الفاتورة النقدية: الرصيد = صافي - مدفوع - محوّل لمديونية طبيب
        const outstanding = netAmount - paidAmount - doctorTransferred;
        if (outstanding > 0.01) {
          const hint = doctorTransferred > 0
            ? ` (مدفوع: ${paidAmount.toFixed(2)} + محوّل للطبيب: ${doctorTransferred.toFixed(2)} من أصل ${netAmount.toFixed(2)})`
            : "";
          return res.status(409).json({ message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي: ${outstanding.toFixed(2)} ج.م${hint}` });
        }
      }

      if (inv.admission_id) {
        const draftRes = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM patient_invoice_headers
          WHERE admission_id = ${inv.admission_id as string}
            AND id != ${id}
            AND status = 'draft'
            AND is_consolidated = false
        `);
        const draftCount = parseInt(String((draftRes.rows[0] as Record<string,unknown>)?.cnt ?? "0"));
        if (draftCount > 0) {
          return res.status(409).json({ message: `يوجد ${draftCount} فاتورة/فواتير في حالة مسودة مرتبطة بهذه الإقامة — يرجى إنهاؤها أولاً` });
        }
      }

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET is_final_closed = true, final_closed_at = NOW(), final_closed_by = ${userId || null}, updated_at = NOW()
        WHERE id = ${id}
      `);

      // توليد القيد المحاسبي للفواتير الداخلية هنا (عند الحفظ النهائي فقط)
      if (isInpatient) {
        generatePatientInvoiceGL(id)
          .catch(err => logger.warn({ err: err.message, invoiceId: id }, "[GL] inpatient invoice final-close GL generation"));
      }

      const patientId = String(inv.patient_id ?? "");
      if (patientId) {
        broadcastPatientInvoiceUpdate(patientId, "invoice_final_closed", { invoiceId: id, ts: Date.now() });
      }

      Promise.resolve().then(() => {
        auditLog({
          tableName: "patient_invoice_headers",
          recordId: id,
          action: "final_close",
          userId,
          newValues: { isFinalClosed: true, closedAt: new Date().toISOString() },
        }).catch(() => {});
      });

      return res.json({ success: true, message: "تم الإغلاق النهائي للفاتورة بنجاح" });
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
