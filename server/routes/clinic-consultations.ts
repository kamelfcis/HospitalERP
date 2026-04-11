import type { Express } from "express";
import { storage } from "../storage";
import {
  requireAuth,
  checkPermission,
} from "./_shared";
import {
  resolveClinicScope,
  clinicAllowed,
} from "../lib/clinic-scope";
import { snakeToCamel } from "./clinic-utils";

export function registerClinicConsultationRoutes(app: Express) {

  app.get("/api/clinic-consultations/:appointmentId", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const clinicId = await storage.getAppointmentClinicId(req.params.appointmentId as string);
        if (clinicId) {
          const allowedIds = await storage.getUserClinicIds(userId);
          if (!allowedIds.includes(clinicId)) {
            return res.status(403).json({ message: "غير مصرح لك بالوصول لهذا الكشف" });
          }
        }
      }
      const data = await storage.getConsultationByAppointment(req.params.appointmentId as string);
      if (!data) return res.status(404).json({ message: "الموعد غير موجود" });
      const camelData = snakeToCamel(data);
      if (camelData.drugs) camelData.drugs = snakeToCamel(camelData.drugs);
      if (camelData.serviceOrders) camelData.serviceOrders = snakeToCamel(camelData.serviceOrders);
      res.json(camelData);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-consultations", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const { appointmentId, chiefComplaint, diagnosis, notes,
              subjectiveSummary, objectiveSummary, assessmentSummary, planSummary, followUpPlan,
              followUpAfterDays, followUpReason, suggestedFollowUpDate,
              drugs, serviceOrders } = req.body;
      if (!appointmentId) return res.status(400).json({ message: "appointmentId مطلوب" });
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const clinicId = await storage.getAppointmentClinicId(appointmentId);
        if (clinicId) {
          const allowedIds = await storage.getUserClinicIds(userId);
          if (!allowedIds.includes(clinicId)) {
            return res.status(403).json({ message: "غير مصرح لك بالكشف في هذه العيادة" });
          }
        }
      }
      const result = await storage.saveConsultation({
        appointmentId,
        chiefComplaint, diagnosis, notes,
        subjectiveSummary, objectiveSummary, assessmentSummary, planSummary, followUpPlan,
        followUpAfterDays: followUpAfterDays ?? null,
        followUpReason: followUpReason ?? null,
        suggestedFollowUpDate: suggestedFollowUpDate ?? null,
        createdBy: userId,
        drugs: drugs || [],
        serviceOrders: serviceOrders || [],
      });
      storage.lockIntake(appointmentId).catch(() => {});
      res.json(snakeToCamel(result));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-favorite-drugs", requireAuth, async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      if (!doctorId) return res.json([]);
      const clinicId = (req.query.clinicId as string) || null;
      const favorites = await storage.getDoctorFavoriteDrugs(doctorId, clinicId);
      res.json(snakeToCamel(favorites));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-favorite-drugs", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      if (!doctorId) return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
      const { itemId, drugName, defaultDose, defaultFrequency, defaultDuration, clinicId } = req.body;
      if (!drugName?.trim()) return res.status(400).json({ message: "اسم الدواء مطلوب" });
      const fav = await storage.addFavoriteDrug({ doctorId, clinicId: clinicId || null, itemId: itemId || null, drugName: drugName.trim(), defaultDose, defaultFrequency, defaultDuration });
      res.status(201).json(snakeToCamel(fav));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/clinic-favorite-drugs/:id", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      if (!doctorId) return res.status(404).json({ message: "لم يتم ربط حسابك بطبيب" });
      await storage.removeFavoriteDrug(req.params.id as string, doctorId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-frequent-drugs", requireAuth, async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      if (!doctorId) return res.json([]);
      const minCount = parseInt(req.query.minCount as string) || 2;
      const clinicId = (req.query.clinicId as string) || null;
      const drugs = await storage.getFrequentDrugsNotInFavorites(doctorId, minCount, clinicId);
      res.json(snakeToCamel(drugs));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic/consultations/by-name", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms  = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("doctor.consultation")) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const rawName     = typeof req.query.patientName === "string" ? req.query.patientName : "";
      const patientName = rawName.trim().replace(/\s+/g, " ");
      if (patientName.length < 2) {
        return res.status(400).json({ message: "patientName مطلوب ولا يقل عن حرفين" });
      }

      const limit      = Math.min(parseInt(String(req.query.limit  || "5")),  20);
      const offset     = Math.max(parseInt(String(req.query.offset || "0")),   0);
      const excludeId  = typeof req.query.excludeId === "string" ? req.query.excludeId : null;

      const scope         = await resolveClinicScope(userId, perms);
      const allowedClinicIds = scope.all ? null : scope.clinicIds;

      const result = await storage.getConsultationsByPatientName(
        patientName, limit, offset, excludeId, allowedClinicIds
      );
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-service-doctor-prices/:serviceId", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getServiceDoctorPrices(req.params.serviceId as string);
      res.json(snakeToCamel(rows));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-service-doctor-prices", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const { serviceId, doctorId, price } = req.body;
      if (!serviceId || !doctorId) return res.status(400).json({ message: "serviceId و doctorId مطلوبان" });
      const row = await storage.upsertServiceDoctorPrice(serviceId, doctorId, parseFloat(price) || 0);
      res.json(snakeToCamel(row));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/clinic-service-doctor-prices/:id", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      await storage.deleteServiceDoctorPrice(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-doctor-statement", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      const isAdmin = perms.includes("clinic.view_all");
      const isDoctor = perms.includes("doctor.view_statement");

      if (!isAdmin && !isDoctor) {
        return res.status(403).json({ message: "لا تملك صلاحية لعرض كشف الحساب" });
      }

      const myDoctorId = await storage.getUserDoctorId(userId);
      let doctorId = req.query.doctorId as string;
      const clinicId = req.query.clinicId as string;

      if (!isAdmin) {
        doctorId = myDoctorId || '';
        if (!doctorId) return res.status(403).json({ message: "حسابك غير مربوط بطبيب" });
      } else {
        if (!doctorId) doctorId = '';
      }

      const from = (req.query.from as string) || new Date().toISOString().slice(0, 10);
      const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
      const rows = await storage.getClinicDoctorStatement(doctorId || null, from, to, isAdmin ? (clinicId || null) : null);
      res.json(snakeToCamel(rows));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-opd/dashboard/doctor", requireAuth, async (req, res) => {
    try {
      const perms = await storage.getUserEffectivePermissions(req.session.userId!);
      const canConsult  = perms.includes("doctor.consultation");
      const isAdmin     = perms.includes("clinic.view_all");
      if (!canConsult && !isAdmin) {
        return res.status(403).json({ message: "ليس لديك صلاحية الوصول إلى لوحة الطبيب" });
      }

      let doctorId: string | null = null;
      if (isAdmin && req.query.doctorId) {
        doctorId = String(req.query.doctorId);
      } else {
        doctorId = await storage.getUserDoctorId(req.session.userId!);
      }

      if (!doctorId) {
        return res.json({ noDoctorLinked: true });
      }

      const dateParam = typeof req.query.date === "string" ? req.query.date : null;
      const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);

      const data = await storage.getDoctorDailySummary(doctorId, date);
      res.json(data);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-opd/dashboard/secretary", requireAuth, async (req, res) => {
    try {
      const perms  = await storage.getUserEffectivePermissions(req.session.userId!);
      const isAdmin = perms.includes("clinic.view_all");
      const canView = isAdmin || perms.includes("clinic.view_own");
      if (!canView) {
        return res.status(403).json({ message: "ليس لديك صلاحية الوصول إلى لوحة الاستقبال" });
      }

      const clinicId = typeof req.query.clinicId === "string" ? req.query.clinicId : null;
      if (!clinicId) {
        return res.status(400).json({ message: "clinicId مطلوب" });
      }

      if (!isAdmin) {
        const assignedClinics = await storage.getUserClinicIds(req.session.userId!);
        if (!assignedClinics.includes(clinicId)) {
          return res.status(403).json({ message: "ليس لديك صلاحية الوصول إلى هذه العيادة" });
        }
      }

      const dateParam = typeof req.query.date === "string" ? req.query.date : null;
      const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);

      const data = await storage.getSecretaryDailySummary(clinicId, date);
      res.json(data);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
