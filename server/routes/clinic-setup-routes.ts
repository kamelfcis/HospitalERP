import type { Express } from "express";
import { storage } from "../storage";
import {
  requireAuth,
  checkPermission,
  clinicSseClients,
} from "./_shared";
import {
  resolveClinicScope,
  clinicAllowed,
} from "../lib/clinic-scope";
import { snakeToCamel, sseClinicEndpoint } from "./clinic-utils";

export function registerClinicSetupRoutes(app: Express) {
  app.get("/api/clinic/sse/:clinicId", requireAuth, async (req, res) => {
    const clinicId = req.params.clinicId as string;
    const userId = req.session.userId!;

    const perms = await storage.getUserEffectivePermissions(userId);
    const scope = await resolveClinicScope(userId, perms);
    if (!clinicAllowed(scope, clinicId)) {
      res.status(403).json({ message: "غير مصرح لك بمتابعة هذه العيادة" });
      return;
    }

    sseClinicEndpoint(res, clinicId);

    if (!clinicSseClients.has(clinicId)) clinicSseClients.set(clinicId, new Set());
    clinicSseClients.get(clinicId)!.add(res);

    const keepAlive = setInterval(() => {
      try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      const clients = clinicSseClients.get(clinicId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) clinicSseClients.delete(clinicId);
      }
    });
  });

  app.get("/api/clinic-clinics", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all") && !perms.includes("clinic.view_own")) {
        return res.status(403).json({ message: "لا تملك صلاحية" });
      }
      const clinics = await storage.getClinics(userId, role);
      res.json(snakeToCamel(clinics));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-clinics", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const { nameAr, departmentId, defaultPharmacyId, consultationServiceId, treasuryId } = req.body;
      if (!nameAr?.trim()) return res.status(400).json({ message: "اسم العيادة مطلوب" });
      const clinic = await storage.createClinic({ nameAr: nameAr.trim(), departmentId, defaultPharmacyId, consultationServiceId, treasuryId });
      res.status(201).json(snakeToCamel(clinic));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/clinic-clinics/:id", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const clinic = await storage.updateClinic(req.params.id as string, req.body);
      res.json(snakeToCamel(clinic));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-clinics/:id/schedules", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id as string)) {
          return res.status(403).json({ message: "غير مصرح لهذه العيادة" });
        }
      }
      const schedules = await storage.getDoctorSchedules(req.params.id as string);
      res.json(snakeToCamel(schedules));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-clinics/:id/schedules", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const schedule = await storage.upsertDoctorSchedule({ clinicId: req.params.id as string, ...req.body });
      res.status(201).json(snakeToCamel(schedule));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-opd/member-lookup", requireAuth, checkPermission("clinic.book"), async (req, res) => {
    try {
      const rawCard = (req.query.cardNumber as string | undefined)?.trim() ?? "";
      if (rawCard.length < 3) {
        return res.status(400).json({ message: "رقم البطاقة قصير جداً — أدخل 3 أحرف على الأقل" });
      }
      const rawDate = req.query.date as string | undefined;
      const resolvedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : new Date().toISOString().slice(0, 10);

      const result = await storage.lookupMemberByCard(rawCard, resolvedDate);
      if (!result) {
        return res.status(404).json({ message: "لم يُعثر على بطاقة منتسب نشطة بهذا الرقم للتاريخ المحدد" });
      }
      res.json({
        memberId:        result.member.id,
        memberCardNumber: result.member.memberCardNumber,
        memberName:      result.member.memberNameAr,
        contractId:      result.contract.id,
        contractName:    result.contract.contractName,
        companyId:       result.company.id,
        companyName:     result.company.nameAr,
        coverageUntil:   result.member.endDate,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message ?? "خطأ في البحث" });
    }
  });

  app.get("/api/clinic-my-doctor", requireAuth, async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      res.json({ doctorId });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-user-doctor/:userId", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const doctorId = await storage.getUserAssignedDoctorId(req.params.userId as string);
      res.json({ doctorId });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-user-doctor", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const { userId, doctorId } = req.body;
      if (!userId || !doctorId) return res.status(400).json({ message: "userId و doctorId مطلوبان" });
      await storage.assignUserToDoctor(userId, doctorId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/clinic-user-doctor/:userId", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      await storage.removeUserDoctorAssignment(req.params.userId as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-user-clinic", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const { userId, clinicId } = req.body;
      if (!userId || !clinicId) return res.status(400).json({ message: "userId و clinicId مطلوبان" });
      await storage.assignUserToClinic(userId, clinicId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-user-clinic/:userId", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const clinicIds = await storage.getUserClinicIds(req.params.userId as string);
      res.json(clinicIds);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/clinic-user-clinic", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const { userId, clinicId } = req.body;
      if (!userId || !clinicId) return res.status(400).json({ message: "userId و clinicId مطلوبان" });
      await storage.removeUserFromClinic(userId, clinicId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
