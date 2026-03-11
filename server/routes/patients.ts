import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";

export function registerPatientsRoutes(app: Express) {
  // ==================== Patients API ====================

  // Patient list / autocomplete search — needs PATIENTS_VIEW
  app.get("/api/patients", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const search = req.query.search as string;
      const list = search ? await storage.searchPatients(search) : await storage.getPatients();
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Scope endpoint — requireAuth only (every logged-in user needs their own scope)
  app.get("/api/patient-scope", requireAuth, async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);
      res.json(scope);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Patient stats grid (patients/index page) — PATIENTS_VIEW + dept scope
  app.get("/api/patients/stats", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { search, dateFrom, dateTo } = req.query as Record<string, string>;
      const scope = await storage.getUserCashierScope(req.session.userId!);

      let deptIds: string[] | undefined;
      if (!scope.isFullAccess) {
        if (scope.allowedDepartmentIds.length === 0) {
          return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
        }
        deptIds = scope.allowedDepartmentIds;
      } else {
        const adminDeptId = req.query.deptId as string | undefined;
        if (adminDeptId) deptIds = [adminDeptId];
      }

      const list = await storage.getPatientStats({ search, dateFrom, dateTo, deptIds });
      return res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  // Single patient record — PATIENTS_VIEW
  app.get("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const p = await storage.getPatient(req.params.id as string);
      if (!p) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Patient journey / timeline — PATIENTS_VIEW
  app.get("/api/patients/:id/journey", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const data = await storage.getPatientTimeline(req.params.id as string);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patients/:id/timeline", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const data = await storage.getPatientTimeline(req.params.id as string);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Previous consultations — used by clinic module; PATIENTS_VIEW covers it
  app.get("/api/patients/:id/previous-consultations", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "5"));
      const consultations = await storage.getPatientPreviousConsultations(req.params.id as string, limit);
      res.json(consultations);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Doctor transfer records on an invoice — PATIENT_INVOICES_VIEW
  app.get("/api/patient-invoices/:id/transfers", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const transfers = await storage.getDoctorTransfers(req.params.id as string);
      res.json(transfers);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-invoices/:id/transfer-to-doctor",
    requireAuth,
    checkPermission(PERMISSIONS.PATIENT_INVOICES_TRANSFER_DOCTOR),
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

  // Settlement list — DOCTORS_VIEW (financial doctor data)
  app.get("/api/doctor-settlements", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const { doctorName } = req.query;
      const data = await storage.getDoctorSettlements(doctorName ? { doctorName: String(doctorName) } : undefined);
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Outstanding transfers for settlement — DOCTORS_VIEW
  app.get("/api/doctor-settlements/outstanding", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const { doctorName } = req.query;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const data = await storage.getDoctorOutstandingTransfers(String(doctorName));
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctor-settlements",
    requireAuth,
    checkPermission(PERMISSIONS.DOCTOR_SETTLEMENTS_CREATE),
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
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      const p = await storage.updatePatient(req.params.id as string, req.body);
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_EDIT), async (req, res) => {
    try {
      await storage.deletePatient(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ==================== Doctors API ====================

  // Doctor payable balances — DOCTORS_VIEW
  app.get("/api/doctors/balances", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      res.json(await storage.getDoctorBalances());
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Doctor account statement — DOCTOR_VIEW_STATEMENT (designed for this purpose)
  app.get("/api/doctor-statement", requireAuth, checkPermission(PERMISSIONS.DOCTOR_VIEW_STATEMENT), async (req, res) => {
    try {
      const { doctorName, dateFrom, dateTo } = req.query as Record<string, string>;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      res.json(await storage.getDoctorStatement({ doctorName, dateFrom, dateTo }));
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Doctor list / search — DOCTORS_VIEW
  app.get("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const search = req.query.search as string;
      const includeInactive = req.query.includeInactive === "true";
      const list = search ? await storage.searchDoctors(search) : await storage.getDoctors(includeInactive);
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Single doctor record — DOCTORS_VIEW
  app.get("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const d = await storage.getDoctor(req.params.id as string);
      if (!d) return res.status(404).json({ message: "طبيب غير موجود" });
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_CREATE), async (req, res) => {
    try {
      const d = await storage.createDoctor(req.body);
      res.status(201).json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      const d = await storage.updateDoctor(req.params.id as string, req.body);
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      await storage.deleteDoctor(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // ==================== Patient Inquiry ====================

  app.get("/api/patient-inquiry", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);

      // R6: restricted user with no allowed depts → 403
      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
      }

      // forcedDeptIds: null = full access, string[] = restricted to those depts
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      // Full-access optional dept filter from query
      const adminDeptFilter = scope.isFullAccess ? ((req.query.deptId as string) || null) : null;

      const {
        clinicId = null,
        dateFrom = null,
        dateTo   = null,
        search   = null,
      } = req.query as Record<string, string>;

      const result = await storage.getPatientInquiry(
        { adminDeptFilter, clinicId, dateFrom, dateTo, search },
        forcedDeptIds,
      );

      return res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-inquiry/lines", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);

      // R6: restricted user with no allowed depts → 403
      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
      }

      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      const {
        patientId   = null,
        patientName = null,
        lineType    = null,
      } = req.query as Record<string, string>;

      if (!patientId && !patientName) {
        return res.status(400).json({ message: "يجب تحديد المريض (patientId أو patientName)" });
      }

      const lines = await storage.getPatientInquiryLines(
        { patientId, patientName },
        forcedDeptIds,
        lineType,
      );

      return res.json(lines);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

}
