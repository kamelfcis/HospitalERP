import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission, checkHospitalAccess } from "./_shared";

export function registerAdmissionsActionsRoutes(app: Express) {

  app.post("/api/admissions/:id/discharge", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const a = await storage.dischargeAdmission(req.params.id as string);
      res.json(a);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/invoices", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const invoices = await storage.getAdmissionInvoices(req.params.id as string);
      res.json(invoices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/admissions/:id/consolidate", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const consolidated = await storage.consolidateAdmissionInvoices(req.params.id as string);
      res.json(consolidated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.get("/api/admissions/:id/report", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const admission = await storage.getAdmission(req.params.id as string);
      if (!admission) return res.status(404).json({ message: "الإقامة غير موجودة" });

      const invoices = await storage.getAdmissionInvoices(req.params.id as string);
      const invoiceDetails = [];
      for (const inv of invoices) {
        if (inv.isConsolidated) continue;
        const detail = await storage.getPatientInvoice(inv.id);
        const dept = inv.departmentId ? await storage.getDepartment(inv.departmentId) : null;
        invoiceDetails.push({
          ...(detail || inv),
          departmentName: dept?.nameAr || "بدون قسم",
        });
      }

      res.json({ admission, invoices: invoiceDetails });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  app.get("/api/visit-groups/:id/invoices", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const visitGroupId = req.params.id?.trim() ?? "";
      if (!visitGroupId) return res.status(400).json({ message: "visit_group_id مطلوب" });
      if (!UUID_RE.test(visitGroupId)) return res.status(400).json({ message: "visit_group_id يجب أن يكون UUID صالحاً" });

      const invoices = await storage.getVisitGroupInvoices(visitGroupId);
      res.json(invoices);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/visit-groups/:id/consolidate", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_MANAGE), async (req, res) => {
    try {
      const visitGroupId = req.params.id?.trim() ?? "";
      if (!visitGroupId) return res.status(400).json({ message: "visit_group_id مطلوب" });
      if (!UUID_RE.test(visitGroupId)) return res.status(400).json({ message: "visit_group_id يجب أن يكون UUID صالحاً" });

      const consolidated = await storage.consolidateVisitGroupInvoices(visitGroupId);
      res.json(consolidated);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });
}
