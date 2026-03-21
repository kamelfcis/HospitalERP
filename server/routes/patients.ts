import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { resolveClinicScope } from "../lib/clinic-scope";

// ─── Fire-and-forget audit logger ────────────────────────────────────────────
// Logs sensitive read access without blocking the response.
function logReadAccess(opts: {
  userId: string;
  endpoint: string;
  ipAddress?: string | null;
  filters?: Record<string, unknown>;
  rowCount?: number;
}) {
  storage.createAuditLog({
    tableName: "patients",
    recordId: opts.endpoint,
    action: "read_access",
    newValues: JSON.stringify({ filters: opts.filters ?? {}, rowCount: opts.rowCount }),
    userId: opts.userId,
    ipAddress: opts.ipAddress ?? null,
  }).catch(() => { /* silenced — audit failure must never break the response */ });
}

export function registerPatientsRoutes(app: Express) {
  // ==================== Patients API ====================

  // Patient list / autocomplete search — PATIENTS_VIEW required
  // Pagination: default 200 for full list, search already capped at 50
  app.get("/api/patients", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const search = req.query.search as string;
      const limitParam = parseInt(String(req.query.limit || "200"));
      const limit = Math.min(Math.max(1, isNaN(limitParam) ? 200 : limitParam), 500);

      const list = search
        ? await storage.searchPatients(search)
        : await storage.getPatients(limit);

      // Audit log for list access (fire-and-forget)
      logReadAccess({
        userId: req.session.userId!,
        endpoint: "/api/patients",
        ipAddress: req.ip,
        filters: { search: search || null, limit },
        rowCount: list.length,
      });

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
      const page     = parseInt(String(req.query.page     || "1"))  || 1;
      const pageSize = parseInt(String(req.query.pageSize || "50")) || 50;
      const scope    = await storage.getUserCashierScope(req.session.userId!);

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

      const result = await storage.getPatientStats({ search, dateFrom, dateTo, deptIds, page, pageSize });
      return res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  // GET /api/patients/duplicate-candidates — must be before /:id wildcard
  app.get("/api/patients/duplicate-candidates", requireAuth, checkPermission(PERMISSIONS.PATIENTS_MERGE), async (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "50"));
      const list = await storage.getPatientDuplicateCandidatesList(Math.min(limit, 200));
      res.json(list);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Single patient record — PATIENTS_VIEW + dept scope check (prevent ID enumeration)
  app.get("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

      // Scope gate: restricted users may only see patients with an invoice in their depts
      const inScope = await storage.checkPatientInScope(req.params.id, forcedDeptIds);
      if (!inScope) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });
      }

      const p = await storage.getPatient(req.params.id);
      if (!p) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(p);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  // Patient journey — PATIENTS_VIEW + dept scope check
  app.get("/api/patients/:id/journey", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

      const inScope = await storage.checkPatientInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      const data = await storage.getPatientTimeline(req.params.id);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Patient timeline — PATIENTS_VIEW + dept scope check
  app.get("/api/patients/:id/timeline", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

      const inScope = await storage.checkPatientInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      const data = await storage.getPatientTimeline(req.params.id);
      if (!data) return res.status(404).json({ message: "مريض غير موجود" });
      res.json(data);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Previous consultations — PATIENTS_VIEW + dept scope check
  app.get("/api/patients/:id/previous-consultations", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const scope = await storage.getUserCashierScope(userId);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

      const inScope = await storage.checkPatientInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      // GAP-09: filter returned consultations to the requesting user's allowed clinics
      const perms = await storage.getUserEffectivePermissions(userId);
      const clinicScope = await resolveClinicScope(userId, perms);
      const allowedClinicIds = clinicScope.all ? null : clinicScope.clinicIds;

      const limit = Math.min(parseInt(String(req.query.limit || "5")), 20);
      const offset = Math.max(parseInt(String(req.query.offset || "0")), 0);
      const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId : null;
      const result = await storage.getPatientPreviousConsultations(req.params.id, limit, allowedClinicIds, offset, excludeId);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Doctor transfer records — PATIENT_INVOICES_VIEW + invoice dept scope check
  app.get("/api/patient-invoices/:id/transfers", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذه الفاتورة" });
      }

      const inScope = await storage.checkInvoiceInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض هذه الفاتورة" });

      const transfers = await storage.getDoctorTransfers(req.params.id);
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

  app.get("/api/doctor-settlements", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const doctorName = req.query.doctorName ? String(req.query.doctorName) : undefined;
      const dateFrom   = req.query.dateFrom   ? String(req.query.dateFrom)   : undefined;
      const dateTo     = req.query.dateTo     ? String(req.query.dateTo)     : undefined;
      const page       = parseInt(String(req.query.page     || "1"))  || 1;
      const pageSize   = parseInt(String(req.query.pageSize || "50")) || 50;
      const result     = await storage.getDoctorSettlements({ doctorName, dateFrom, dateTo, page, pageSize });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

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

  // GET /api/doctor-settlements/opd-deductions?doctorName=... — مجموع خصومات الأطباء من مواعيد العيادات
  app.get("/api/doctor-settlements/opd-deductions", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const doctorName = String(req.query.doctorName || "").trim();
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const rows = await db.execute(sql`
        SELECT
          COALESCE(SUM(ca.doctor_deduction_amount), 0)::text AS "totalOpdDeductions",
          COUNT(*) FILTER (WHERE ca.doctor_deduction_amount > 0) AS "deductionCount"
        FROM clinic_appointments ca
        JOIN doctors d ON d.id = ca.doctor_id
        WHERE d.name = ${doctorName}
          AND ca.accounting_posted_revenue = true
          AND ca.doctor_deduction_amount > 0
      `);
      const row = rows.rows[0] as { totalOpdDeductions: string; deductionCount: string } | undefined;
      res.json({
        totalOpdDeductions: row?.totalOpdDeductions ?? "0",
        deductionCount: parseInt(row?.deductionCount ?? "0", 10),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================== Duplicate Prevention API ====================

  // POST /api/patients/check-duplicates — callable without creating a patient
  // Returns scored candidates and duplicate status (none/warning/block)
  app.post("/api/patients/check-duplicates", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const { fullName, phone, nationalId, age, excludePatientId } = req.body;
      const result = await storage.checkPatientDuplicateCandidates(
        { fullName, phone, nationalId, age },
        excludePatientId,
      );
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // POST /api/patients/:id/merge-preview — dry run: shows what will move (no DB change)
  app.post("/api/patients/:id/merge-preview", requireAuth, checkPermission(PERMISSIONS.PATIENTS_MERGE), async (req, res) => {
    try {
      const { duplicatePatientId } = req.body;
      if (!duplicatePatientId) return res.status(400).json({ message: "duplicatePatientId مطلوب" });
      const impact = await storage.getPatientMergeImpact(req.params.id as string, String(duplicatePatientId));
      res.json(impact);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // POST /api/patients/:id/merge — execute governed merge (transactional, audited)
  app.post("/api/patients/:id/merge", requireAuth, checkPermission(PERMISSIONS.PATIENTS_MERGE), async (req, res) => {
    try {
      const { duplicatePatientId, reason } = req.body;
      if (!duplicatePatientId) return res.status(400).json({ message: "duplicatePatientId مطلوب" });
      if (!reason || !String(reason).trim()) return res.status(400).json({ message: "reason (سبب الدمج) مطلوب" });

      const masterId = req.params.id as string;
      await storage.mergePatients(masterId, String(duplicatePatientId), String(reason), req.session.userId!);

      // Audit log the merge action
      storage.createAuditLog({
        tableName: "patients",
        recordId: masterId,
        action: "merge",
        newValues: JSON.stringify({ masterPatientId: masterId, duplicatePatientId, reason }),
        userId: req.session.userId!,
        ipAddress: req.ip ?? null,
      }).catch(() => {});

      res.json({ success: true });
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== Patient CRUD ====================

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

  app.get("/api/doctors/balances", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      res.json(await storage.getDoctorBalances());
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

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

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
      }

      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;
      const adminDeptFilter = scope.isFullAccess ? ((req.query.deptId as string) || null) : null;

      const {
        dateFrom = null,
        dateTo   = null,
        search   = null,
      } = req.query as Record<string, string>;

      // clinic scope: if user has allowedClinicIds, ignore client-supplied clinicId and use forced
      let clinicId: string | null = (req.query.clinicId as string) || null;
      if (!scope.isFullAccess && scope.allowedClinicIds.length > 0) {
        // single clinic → auto-force; multiple clinics → allow client to pick from allowed list
        const requestedClinic = clinicId;
        if (requestedClinic && scope.allowedClinicIds.includes(requestedClinic)) {
          clinicId = requestedClinic;
        } else {
          clinicId = scope.allowedClinicIds.length === 1 ? scope.allowedClinicIds[0] : null;
        }
      }

      const result = await storage.getPatientInquiry(
        { adminDeptFilter, clinicId, dateFrom, dateTo, search },
        forcedDeptIds,
      );

      // Audit log (fire-and-forget)
      logReadAccess({
        userId: req.session.userId!,
        endpoint: "/api/patient-inquiry",
        ipAddress: req.ip,
        filters: { deptId: adminDeptFilter, clinicId, dateFrom, dateTo, search },
        rowCount: result.count,
      });

      return res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-inquiry/lines", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserCashierScope(req.session.userId!);

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

      // Audit log (fire-and-forget)
      logReadAccess({
        userId: req.session.userId!,
        endpoint: "/api/patient-inquiry/lines",
        ipAddress: req.ip,
        filters: { patientId, patientName, lineType },
        rowCount: lines.length,
      });

      return res.json(lines);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

}
