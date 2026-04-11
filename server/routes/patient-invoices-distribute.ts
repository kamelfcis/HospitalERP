import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission } from "./_shared";
import { assertNotFinalClosed } from "./patient-invoices-crud-queries";

export function registerDistributeRoutes(app: Express) {
  app.post("/api/patient-invoices/:id/distribute", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      await assertNotFinalClosed(req.params.id as string);
      const { patients } = req.body;
      if (!Array.isArray(patients) || patients.length < 2) {
        return res.status(400).json({ message: "يجب تحديد مريضين على الأقل" });
      }
      for (const p of patients) {
        if (!p.name || !p.name.trim()) {
          return res.status(400).json({ message: "يجب إدخال اسم كل مريض" });
        }
      }
      const result = await storage.distributePatientInvoice(req.params.id as string, patients);
      const userId = (req.session as any)?.userId as string | undefined;
      Promise.resolve().then(() => {
        const ids = result.map((inv: Record<string, unknown>) => inv.id as string).join(",");
        auditLog({ tableName: "patient_invoice_headers", recordId: req.params.id as string, action: "distribute", userId, newValues: { createdInvoiceIds: ids, patientCount: patients.length } }).catch(() => {});
      });
      res.json({ invoices: result });
    } catch (error: unknown) {
      if ((error as any).statusCode === 409) return res.status(409).json({ message: error instanceof Error ? error.message : String(error) });
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("نهائية") || msg.includes("غير موجودة") || msg.includes("لا تحتوي")) {
        return res.status(409).json({ message: msg });
      }
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/patient-invoices/distribute-direct", requireAuth, checkPermission(PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try {
      const { patients, lines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = req.body;
      if (!Array.isArray(patients) || patients.length < 2) {
        return res.status(400).json({ message: "يجب تحديد مريضين على الأقل" });
      }
      for (const p of patients) {
        if (!p.name || !p.name.trim()) {
          return res.status(400).json({ message: "يجب إدخال اسم كل مريض" });
        }
      }
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "لا توجد بنود للتوزيع" });
      }
      const result = await storage.distributePatientInvoiceDirect({
        patients, lines, invoiceDate: invoiceDate || new Date().toISOString().split("T")[0],
        departmentId, warehouseId, doctorName, patientType, contractName, notes,
      });
      const userId = (req.session as any)?.userId as string | undefined;
      Promise.resolve().then(() => {
        const ids = result.map((inv: Record<string, unknown>) => inv.id as string).join(",");
        auditLog({ tableName: "patient_invoice_headers", recordId: ids, action: "distribute_direct", userId, newValues: { createdInvoiceIds: ids, patientCount: patients.length } }).catch(() => {});
      });
      res.json({ invoices: result });
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/patient-invoices/:id/clinical-info", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_EDIT), async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const userId = (req.session as any)?.userId as string | undefined;
      const { diagnosis, notes } = req.body as { diagnosis?: string; notes?: string };

      const invRes = await db.execute(sql`
        SELECT id, status, is_final_closed, diagnosis, notes
        FROM patient_invoice_headers
        WHERE id = ${invoiceId}
        FOR UPDATE
      `);
      const inv = invRes.rows[0] as Record<string, unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });

      const oldDiagnosis = inv.diagnosis;
      const oldNotes = inv.notes;

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET diagnosis  = ${diagnosis !== undefined ? diagnosis : inv.diagnosis},
            notes      = ${notes !== undefined ? notes : inv.notes},
            updated_at = NOW()
        WHERE id = ${invoiceId}
      `);

      await auditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "clinical_info_update",
        userId,
        oldValues: JSON.stringify({ diagnosis: oldDiagnosis, notes: oldNotes }),
        newValues: JSON.stringify({ diagnosis, notes }),
      });

      const updated = await storage.getPatientInvoice(invoiceId);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
