import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { logReadAccess } from "./patients-crud";

export function registerPatientInquiryGridRoutes(app: Express) {

  app.get("/api/patient-inquiry", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);

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

      let clinicId: string | null = (req.query.clinicId as string) || null;
      if (!scope.isFullAccess && scope.allowedClinicIds.length > 0) {
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
      const scope = await storage.getUserOperationalScope(req.session.userId!);

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
