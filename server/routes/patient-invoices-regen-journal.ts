/**
 * إعادة توليد قيد GL لفاتورة مريض معتمدة — force-regen
 * POST /api/patient-invoices/:id/regen-journal
 *
 * الحالات المدعومة:
 *   • القيد موجود  (posted)   → يُحذف ويُعاد توليده بالحسابات الحالية
 *   • القيد لم يُنشأ          → يُنشأ كأول مرة
 *   • القيد في needs_retry    → إعادة المحاولة بالمنطق الكامل
 *
 * الاستخدام: بعد تغيير دليل الحسابات أو ربط الحسابات (account_mappings)
 */
import type { Express } from "express";
import { requireAuth, checkPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { storage } from "../storage";
import { generatePatientInvoiceGL } from "../lib/patient-invoice-gl-generator";

export function registerPatientInvoiceRegenJournalRoute(app: Express) {
  app.post(
    "/api/patient-invoices/:id/regen-journal",
    requireAuth,
    checkPermission(PERMISSIONS.JOURNAL_POST),
    async (req, res) => {
      try {
        const invoiceId = req.params.id as string;
        const forceRegen = req.body?.force !== false;

        const invoice = await storage.getPatientInvoice(invoiceId);
        if (!invoice) {
          return res.status(404).json({ message: "فاتورة المريض غير موجودة" });
        }
        if (invoice.status !== "finalized") {
          return res.status(409).json({
            message: "القيد يُنشأ للفواتير المعتمدة فقط — الفاتورة في حالة: " + invoice.status,
          });
        }

        const result = await generatePatientInvoiceGL(invoiceId, forceRegen);

        if (result.ok) {
          return res.json({
            success: true,
            journalEntryId: result.entry.id,
            message: forceRegen
              ? "تم حذف القيد القديم وإعادة توليد قيد جديد بالحسابات الحالية"
              : "تم توليد القيد بنجاح",
          });
        }

        return res.status(422).json({
          success: false,
          message: result.reason,
          hint: "راجع ربط الحسابات في /account-mappings ثم أعد المحاولة",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ message: msg });
      }
    },
  );
}
