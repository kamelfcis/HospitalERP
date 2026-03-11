import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";

export function registerPatientsRoutes(app: Express) {
  // ==================== Patients API ====================

  app.get("/api/patients", async (req, res) => {
    try {
      const search = req.query.search as string;
      const list = search ? await storage.searchPatients(search) : await storage.getPatients();
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/stats", async (req, res) => {
    try {
      const { search, dateFrom, dateTo, deptId } = req.query as Record<string, string>;
      const list = await storage.getPatientStats({ search, dateFrom, dateTo, deptId });
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id", async (req, res) => {
    try {
      const p = await storage.getPatient(req.params.id as string);
      if (!p) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id/journey", requireAuth, async (req, res) => {
    try {
      const data = await storage.getPatientTimeline(req.params.id as string);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patients/:id/timeline", requireAuth, async (req, res) => {
    try {
      const data = await storage.getPatientTimeline(req.params.id as string);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patients/:id/previous-consultations", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "5"));
      const consultations = await storage.getPatientPreviousConsultations(req.params.id as string, limit);
      res.json(consultations);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patient-invoices/:id/transfers", requireAuth, async (req, res) => {
    try {
      const transfers = await storage.getDoctorTransfers(req.params.id as string);
      res.json(transfers);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-invoices/:id/transfer-to-doctor",
    requireAuth,
    checkPermission("patient_invoices.transfer_doctor"),
    async (req, res) => {
    try {
      const { doctorName, amount, clientRequestId, notes } = req.body;
      if (!doctorName || !amount || !clientRequestId) {
        return res.status(400).json({ message: "doctorName وamount وclientRequestId مطلوبة" });
      }
      const transfer = await storage.transferToDoctorPayable({
        invoiceId: req.params.id as string,
        doctorName,
        amount: String(amount),
        clientRequestId,
        notes,
      });
      res.status(201).json(transfer);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  // ==================== Doctor Settlements ====================

  app.get("/api/doctor-settlements", requireAuth, async (req, res) => {
    try {
      const { doctorName } = req.query;
      const data = await storage.getDoctorSettlements(doctorName ? { doctorName: String(doctorName) } : undefined);
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-settlements/outstanding", requireAuth, async (req, res) => {
    try {
      const { doctorName } = req.query;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const data = await storage.getDoctorOutstandingTransfers(String(doctorName));
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctor-settlements",
    requireAuth,
    checkPermission("doctor_settlements.create"),
    async (req, res) => {
    try {
      const { doctorName, paymentDate, amount, paymentMethod, settlementUuid, notes, allocations } = req.body;
      if (!doctorName || !paymentDate || !amount || !settlementUuid) {
        return res.status(400).json({ message: "doctorName وpaymentDate وamount وsettlementUuid مطلوبة" });
      }
      const settlement = await storage.createDoctorSettlement({
        doctorName,
        paymentDate,
        amount: String(amount),
        paymentMethod: paymentMethod || "cash",
        settlementUuid,
        notes,
        allocations,
      });
      res.status(201).json(settlement);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post("/api/patients", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const p = await storage.createPatient(req.body);
      res.status(201).json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const p = await storage.updatePatient(req.params.id as string, req.body);
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      await storage.deletePatient(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ==================== Doctors API ====================

  app.get("/api/doctors/balances", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getDoctorBalances());
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-statement", requireAuth, async (req, res) => {
    try {
      const { doctorName, dateFrom, dateTo } = req.query as Record<string, string>;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      res.json(await storage.getDoctorStatement({ doctorName, dateFrom, dateTo }));
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors", async (req, res) => {
    try {
      const search = req.query.search as string;
      const includeInactive = req.query.includeInactive === "true";
      const list = search ? await storage.searchDoctors(search) : await storage.getDoctors(includeInactive);
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors/:id", async (req, res) => {
    try {
      const d = await storage.getDoctor(req.params.id as string);
      if (!d) return res.status(404).json({ message: "طبيب غير موجود" });
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_CREATE), async (req, res) => {
    try {
      const d = await storage.createDoctor(req.body);
      res.status(201).json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      const d = await storage.updateDoctor(req.params.id as string, req.body);
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      await storage.deleteDoctor(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
      res.status(500).json({ message: _em });
    }
  });

}
