import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  requireAuth,
  checkPermission,
} from "./_shared";

function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

export function registerClinicRoutes(app: Express) {

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
      const { nameAr, departmentId, defaultPharmacyId, consultationServiceId } = req.body;
      if (!nameAr?.trim()) return res.status(400).json({ message: "اسم العيادة مطلوب" });
      const clinic = await storage.createClinic({ nameAr: nameAr.trim(), departmentId, defaultPharmacyId, consultationServiceId });
      res.status(201).json(snakeToCamel(clinic));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/clinic-clinics/:id", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const clinic = await storage.updateClinic(req.params.id, req.body);
      res.json(snakeToCamel(clinic));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-clinics/:id/schedules", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id)) {
          return res.status(403).json({ message: "غير مصرح لهذه العيادة" });
        }
      }
      const schedules = await storage.getDoctorSchedules(req.params.id);
      res.json(snakeToCamel(schedules));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-clinics/:id/schedules", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const schedule = await storage.upsertDoctorSchedule({ clinicId: req.params.id, ...req.body });
      res.status(201).json(snakeToCamel(schedule));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-clinics/:id/appointments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role!;
      const perms = await storage.getUserEffectivePermissions(userId);
      const canViewAll = perms.includes("clinic.view_all");
      const canViewOwn = perms.includes("clinic.view_own");
      if (!canViewAll && !canViewOwn) return res.status(403).json({ message: "لا تملك صلاحية" });

      if (!canViewAll) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id)) {
          return res.status(403).json({ message: "غير مصرح لهذه العيادة" });
        }
      }

      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const appointments = await storage.getClinicAppointments(req.params.id, date);
      res.json(snakeToCamel(appointments));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-clinics/:id/appointments", requireAuth, checkPermission("clinic.book"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id)) {
          return res.status(403).json({ message: "غير مصرح لك بالحجز في هذه العيادة" });
        }
      }
      const data = { ...req.body, clinicId: req.params.id, createdBy: userId };
      if (!data.patientName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      if (!data.doctorId) return res.status(400).json({ message: "الطبيب مطلوب" });
      if (!data.appointmentDate) return res.status(400).json({ message: "تاريخ الموعد مطلوب" });
      const appointment = await storage.createAppointment(data);
      res.status(201).json(snakeToCamel(appointment));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/clinic-appointments/:id/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.book") && !perms.includes("doctor.consultation")) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      if (!perms.includes("clinic.view_all")) {
        const clinicId = await storage.getAppointmentClinicId(req.params.id);
        if (clinicId) {
          const allowedIds = await storage.getUserClinicIds(userId);
          if (!allowedIds.includes(clinicId)) {
            return res.status(403).json({ message: "غير مصرح لك بالتعامل مع هذا الموعد" });
          }
        }
      }
      const { status } = req.body;
      const validStatuses = ['waiting', 'in_consultation', 'done', 'cancelled'];
      if (!validStatuses.includes(status)) return res.status(400).json({ message: "حالة غير صحيحة" });
      await storage.updateAppointmentStatus(req.params.id, status);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-my-doctor", requireAuth, async (req, res) => {
    try {
      const doctorId = await storage.getUserDoctorId(req.session.userId!);
      res.json({ doctorId });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-user-doctor/:userId", requireAuth, checkPermission("clinic.manage"), async (req, res) => {
    try {
      const doctorId = await storage.getUserAssignedDoctorId(req.params.userId);
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
      await storage.removeUserDoctorAssignment(req.params.userId);
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
      const clinicIds = await storage.getUserClinicIds(req.params.userId);
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

  app.get("/api/clinic-consultations/:appointmentId", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const clinicId = await storage.getAppointmentClinicId(req.params.appointmentId);
        if (clinicId) {
          const allowedIds = await storage.getUserClinicIds(userId);
          if (!allowedIds.includes(clinicId)) {
            return res.status(403).json({ message: "غير مصرح لك بالوصول لهذا الكشف" });
          }
        }
      }
      const data = await storage.getConsultationByAppointment(req.params.appointmentId);
      if (!data) return res.status(404).json({ message: "الموعد غير موجود" });
      const camelData = snakeToCamel(data);
      if (camelData.drugs) camelData.drugs = snakeToCamel(camelData.drugs);
      if (camelData.serviceOrders) camelData.serviceOrders = snakeToCamel(camelData.serviceOrders);
      res.json(camelData);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-consultations", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const { appointmentId, chiefComplaint, diagnosis, notes, drugs, serviceOrders } = req.body;
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
        createdBy: userId,
        drugs: drugs || [],
        serviceOrders: serviceOrders || [],
      });
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
      await storage.removeFavoriteDrug(req.params.id, doctorId);
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

  app.get("/api/clinic-orders", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role!;
      const perms = await storage.getUserEffectivePermissions(userId);
      const canViewOrders = perms.includes("doctor_orders.view");
      const canViewPharmacy = perms.includes("clinic.pharmacy_orders");
      const isAdmin = role === 'admin' || role === 'owner';

      if (!canViewOrders && !canViewPharmacy && !isAdmin) {
        return res.status(403).json({ message: "لا تملك صلاحية" });
      }

      const filters: any = {};

      if (canViewPharmacy && !isAdmin && !canViewOrders) {
        filters.targetType = 'pharmacy';
        const userRow = await db.execute(sql`SELECT pharmacy_id FROM users WHERE id = ${userId}`);
        const pharmacyId = (userRow.rows[0] as any)?.pharmacy_id;
        if (pharmacyId) filters.targetId = pharmacyId;
      }

      if (req.query.targetType) filters.targetType = req.query.targetType as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.targetId) filters.targetId = req.query.targetId as string;

      const orders = await storage.getClinicOrders(filters);
      res.json(snakeToCamel(orders));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-orders/:id", requireAuth, async (req, res) => {
    try {
      const perms = await storage.getUserEffectivePermissions(req.session.userId!);
      const canView = perms.includes("doctor_orders.view") || perms.includes("clinic.pharmacy_orders") || perms.includes("dept_services.create");
      if (!canView) return res.status(403).json({ message: "لا تملك صلاحية لهذا الإجراء" });
      const order = await storage.getClinicOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "الأمر غير موجود" });
      res.json(snakeToCamel(order));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-orders/:id/execute", requireAuth, checkPermission("doctor_orders.execute"), async (req, res) => {
    try {
      const result = await storage.executeClinicOrder(req.params.id, req.session.userId!);
      res.json(snakeToCamel(result));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/clinic-orders/:id/cancel", requireAuth, checkPermission("doctor_orders.execute"), async (req, res) => {
    try {
      await storage.cancelClinicOrder(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-service-doctor-prices/:serviceId", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getServiceDoctorPrices(req.params.serviceId);
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
      await storage.deleteServiceDoctorPrice(req.params.id);
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

  app.post("/api/dept-service-orders/check-duplicate", requireAuth, checkPermission("dept_services.create"), async (req, res) => {
    try {
      const { patientName, serviceIds, date } = req.body;
      if (!patientName || !serviceIds?.length) return res.json([]);
      const dupes = await storage.checkDeptServiceDuplicate(patientName, serviceIds, date || new Date().toISOString().slice(0, 10));
      res.json(snakeToCamel(dupes));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/dept-service-orders", requireAuth, checkPermission("dept_services.create"), async (req, res) => {
    try {
      const { patientName, patientPhone, doctorId, doctorName, departmentId,
        orderType, contractName, treasuryId, services, discountPercent,
        discountAmount, notes, clinicOrderIds } = req.body;

      if (!patientName || !departmentId || !services?.length) {
        return res.status(400).json({ message: "اسم المريض والقسم والخدمات مطلوبة" });
      }

      const hasDiscount = (discountPercent && parseFloat(discountPercent) > 0) || (discountAmount && parseFloat(discountAmount) > 0);
      if (hasDiscount) {
        const userPerms = await storage.getUserEffectivePermissions(req.session.userId!);
        if (!userPerms.includes("dept_services.discount")) {
          return res.status(403).json({ message: "ليس لديك صلاحية إضافة خصم على خدمات الأقسام" });
        }
      }

      const result = await storage.saveDeptServiceOrder({
        patientName, patientPhone, doctorId, doctorName, departmentId,
        orderType: orderType || 'cash', contractName, treasuryId,
        services, discountPercent, discountAmount, notes,
        userId: req.session.userId!, clinicOrderIds,
      });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/dept-service-orders/batch", requireAuth, checkPermission("dept_services.batch"), async (req, res) => {
    try {
      const { patients, doctorId, doctorName, departmentId,
        orderType, contractName, treasuryId, services,
        discountPercent, discountAmount, notes } = req.body;

      if (!patients?.length || !departmentId || !services?.length) {
        return res.status(400).json({ message: "المرضى والقسم والخدمات مطلوبة" });
      }

      const hasDiscount = (discountPercent && parseFloat(discountPercent) > 0) || (discountAmount && parseFloat(discountAmount) > 0);
      if (hasDiscount) {
        const userPerms = await storage.getUserEffectivePermissions(req.session.userId!);
        if (!userPerms.includes("dept_services.discount")) {
          return res.status(403).json({ message: "ليس لديك صلاحية إضافة خصم على خدمات الأقسام" });
        }
      }

      const result = await storage.saveDeptServiceOrderBatch({
        patients, doctorId, doctorName, departmentId,
        orderType: orderType || 'cash', contractName, treasuryId,
        services, discountPercent, discountAmount, notes,
        userId: req.session.userId!,
      });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
}
