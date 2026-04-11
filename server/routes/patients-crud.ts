import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { resolveClinicScope } from "../lib/clinic-scope";
import { findOrCreatePatient } from "../lib/find-or-create-patient";

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

export { logReadAccess };

export function registerPatientsCrudRoutes(app: Express) {

  app.get("/api/patients", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const search = req.query.search as string;
      const limitParam = parseInt(String(req.query.limit || "200"));
      const limit = Math.min(Math.max(1, isNaN(limitParam) ? 200 : limitParam), 500);

      const list = search
        ? await storage.searchPatients(search)
        : await storage.getPatients(limit);

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

  app.get("/api/patient-scope", requireAuth, async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);
      res.json(scope);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patients/stats", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { search, dateFrom, dateTo, statusFilter } = req.query as Record<string, string>;
      const page     = parseInt(String(req.query.page     || "1"))  || 1;
      const pageSize = parseInt(String(req.query.pageSize || "50")) || 50;
      const scope    = await storage.getUserOperationalScope(req.session.userId!);

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

      const result = await storage.getPatientStats({ search, dateFrom, dateTo, deptIds, statusFilter, page, pageSize });
      return res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/duplicate-candidates", requireAuth, checkPermission(PERMISSIONS.PATIENTS_MERGE), async (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "50"));
      const list = await storage.getPatientDuplicateCandidatesList(Math.min(limit, 200));
      res.json(list);
    } catch (error: unknown) {
      res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/patients/autocomplete", requireAuth, async (req, res) => {
    try {
      const search = (req.query.search as string || "").trim();
      if (!search) return res.json([]);
      const list = await storage.searchPatients(search);
      res.json(list.slice(0, 15));
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/patients/:id", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

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

  app.get("/api/patients/:id/journey", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);
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

  app.get("/api/patients/:id/timeline", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);
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

  app.get("/api/patients/:id/previous-consultations", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const scope = await storage.getUserOperationalScope(userId);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذا المريض" });
      }

      const inScope = await storage.checkPatientInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

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

  app.post("/api/patients/:id/merge", requireAuth, checkPermission(PERMISSIONS.PATIENTS_MERGE), async (req, res) => {
    try {
      const { duplicatePatientId, reason } = req.body;
      if (!duplicatePatientId) return res.status(400).json({ message: "duplicatePatientId مطلوب" });
      if (!reason || !String(reason).trim()) return res.status(400).json({ message: "reason (سبب الدمج) مطلوب" });

      const masterId = req.params.id as string;
      await storage.mergePatients(masterId, String(duplicatePatientId), String(reason), req.session.userId!);

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

  app.post("/api/patients/find-or-create", requireAuth, async (req, res) => {
    try {
      const { fullName, phone } = req.body;
      if (!fullName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      const result = await findOrCreatePatient(fullName.trim(), phone || null);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
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
}
