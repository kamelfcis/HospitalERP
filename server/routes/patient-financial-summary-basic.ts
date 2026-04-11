import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPatientFinancialSummaryBasicRoutes(app: Express) {

  app.get("/api/patients/:id/financial-summary", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;

      const pharmResult = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                    AS invoice_count,
          COALESCE(SUM(net_total::numeric),  0)::numeric                  AS total_amount,
          COALESCE(SUM(
            CASE WHEN customer_type = 'cash' THEN net_total::numeric ELSE 0 END
          ), 0)::numeric                                                   AS total_paid,
          COALESCE(SUM(
            CASE WHEN customer_type <> 'cash' AND status = 'finalized'
            THEN net_total::numeric ELSE 0 END
          ), 0)::numeric                                                   AS total_outstanding,
          MAX(invoice_date)                                                AS last_invoice_date
        FROM sales_invoice_headers
        WHERE patient_id = ${id}
          AND status IN ('draft','finalized')
          AND COALESCE(is_return, false) = false
      `);

      const patInvResult = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                      AS invoice_count,
          COALESCE(SUM(total_amount::numeric),   0)::numeric                AS total_amount,
          COALESCE(SUM(paid_amount::numeric),    0)::numeric                AS total_paid,
          COALESCE(SUM(total_amount::numeric - COALESCE(paid_amount::numeric, 0)), 0)::numeric
                                                                            AS total_outstanding,
          MAX(invoice_date)                                                  AS last_invoice_date
        FROM patient_invoice_headers
        WHERE patient_id = ${id}
          AND status = 'finalized'
      `);

      const admResult = await db.execute(sql`
        SELECT COUNT(*)::int AS admission_count, MAX(admission_date) AS last_admission
        FROM admissions WHERE patient_id = ${id}
      `);

      const ph = (pharmResult as any).rows[0] || {};
      const pi = (patInvResult as any).rows[0] || {};
      const adm = (admResult as any).rows[0] || {};

      const totalAmount      = (parseFloat(ph.total_amount      || "0") + parseFloat(pi.total_amount      || "0"));
      const totalPaid        = (parseFloat(ph.total_paid        || "0") + parseFloat(pi.total_paid        || "0"));
      const totalOutstanding = (parseFloat(ph.total_outstanding || "0") + parseFloat(pi.total_outstanding || "0"));
      const invoiceCount     = (parseInt(ph.invoice_count || "0") + parseInt(pi.invoice_count || "0"));

      const lastDates = [ph.last_invoice_date, pi.last_invoice_date, adm.last_admission].filter(Boolean);
      const lastInteraction = lastDates.length ? lastDates.sort().reverse()[0] : null;

      return res.json({
        totalAmount:      parseFloat(totalAmount.toFixed(2)),
        totalPaid:        parseFloat(totalPaid.toFixed(2)),
        totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
        invoiceCount,
        admissionCount:   parseInt(adm.admission_count || "0"),
        lastInteraction,
        breakdown: {
          pharmacy: {
            invoiceCount: parseInt(ph.invoice_count || "0"),
            totalAmount:  parseFloat(parseFloat(ph.total_amount  || "0").toFixed(2)),
            totalPaid:    parseFloat(parseFloat(ph.total_paid    || "0").toFixed(2)),
            outstanding:  parseFloat(parseFloat(ph.total_outstanding || "0").toFixed(2)),
            lastDate:     ph.last_invoice_date || null,
          },
          medical: {
            invoiceCount: parseInt(pi.invoice_count || "0"),
            totalAmount:  parseFloat(parseFloat(pi.total_amount  || "0").toFixed(2)),
            totalPaid:    parseFloat(parseFloat(pi.total_paid    || "0").toFixed(2)),
            outstanding:  parseFloat(parseFloat(pi.total_outstanding || "0").toFixed(2)),
            lastDate:     pi.last_invoice_date || null,
          },
        },
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });
}
