import type { Express, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  requireAuth,
  checkPermission,
  clinicSseClients,
  broadcastToClinic,
  clinicOrdersClients,
  broadcastClinicOrdersUpdate,
} from "./_shared";
import {
  resolveClinicScope,
  clinicAllowed,
  getOrderClinicId,
} from "../lib/clinic-scope";

function snakeToCamel(obj: unknown): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  const result: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = record[key];
  }
  return result;
}

function sseClinicEndpoint(res: Response, clinicId: string) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  return res;
}

export function registerClinicRoutes(app: Express) {

  // ── SSE: تحديثات مواعيد العيادة لحظياً ──────────────────────────────────────
  app.get("/api/clinic/sse/:clinicId", requireAuth, async (req, res) => {
    const clinicId = req.params.clinicId as string;
    const userId = req.session.userId!;

    // GAP-01: verify the user is allowed to observe this clinic's stream
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

  // ── SSE: تحديثات أوامر الكلينك لحظياً ──────────────────────────────────────
  app.get("/api/clinic-orders/sse", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    clinicOrdersClients.add(res);

    const keepAlive = setInterval(() => {
      try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      clinicOrdersClients.delete(res);
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

  app.get("/api/clinic-clinics/:id/appointments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      const canViewAll = perms.includes("clinic.view_all");
      const canViewOwn = perms.includes("clinic.view_own");
      const canConsult = perms.includes("doctor.consultation");
      if (!canViewAll && !canViewOwn && !canConsult) return res.status(403).json({ message: "لا تملك صلاحية" });

      if (!canViewAll) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id as string)) {
          return res.status(403).json({ message: "غير مصرح لهذه العيادة" });
        }
      }

      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

      // ── فلترة قائمة المواعيد حسب الدور ──────────────────────────────────────
      // الأطباء: يرون مواعيدهم فقط — يجب أن يكون للمستخدم سجل طبيب مرتبط
      if (canConsult && !canViewAll) {
        const doctorId = await storage.getUserDoctorId(userId);
        if (!doctorId) {
          // لا يوجد طبيب مرتبط → أعِد قائمة فارغة مع تحذير
          return res.json({ appointments: [], noDoctorLinked: true });
        }
        const appointments = await storage.getClinicAppointments(req.params.id as string, date, doctorId);
        return res.json({ appointments: snakeToCamel(appointments) });
      }

      // الاستقبال والإدارة: يرون جميع المواعيد (بدون فلتر طبيب)
      const appointments = await storage.getClinicAppointments(req.params.id as string, date);
      res.json(snakeToCamel(appointments));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-clinics/:id/appointments", requireAuth, checkPermission("clinic.book"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.view_all")) {
        const allowedIds = await storage.getUserClinicIds(userId);
        if (!allowedIds.includes(req.params.id as string)) {
          return res.status(403).json({ message: "غير مصرح لك بالحجز في هذه العيادة" });
        }
      }
      const {
        patientName, patientId, patientPhone,
        doctorId, appointmentDate, appointmentTime, notes,
        paymentType, insuranceCompany, payerReference,
      } = req.body;
      if (!patientName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      if (!doctorId) return res.status(400).json({ message: "الطبيب مطلوب" });
      if (!appointmentDate) return res.status(400).json({ message: "تاريخ الموعد مطلوب" });
      const appointment = await storage.createAppointment({
        clinicId: req.params.id as string,
        createdBy: userId,
        patientName: patientName.trim(),
        patientId, patientPhone, doctorId, appointmentDate, appointmentTime, notes,
        paymentType: paymentType || 'CASH',
        insuranceCompany: insuranceCompany || undefined,
        payerReference: payerReference || undefined,
      });
      broadcastToClinic(req.params.id as string, "appointment_changed", { ts: Date.now() });
      res.status(201).json(snakeToCamel(appointment));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // رد مبلغ موعد عيادة نقدي وإلغاؤه
  app.post("/api/clinic-appointments/:id/cancel-refund", requireAuth, checkPermission("clinic.book"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      // GAP-07: verify clinic membership before allowing cancel/refund
      const perms = await storage.getUserEffectivePermissions(userId);
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        const clinicId = await storage.getAppointmentClinicId(req.params.id as string);
        if (clinicId && !clinicAllowed(scope, clinicId)) {
          return res.status(403).json({ message: "غير مصرح لك بالتعامل مع هذا الموعد" });
        }
      }
      const { refundAmount, cancelAppointment, refundReason } = req.body;
      const result = await storage.cancelAndRefundAppointment(
        req.params.id as string,
        userId,
        refundAmount !== undefined ? parseFloat(refundAmount) : undefined,
        cancelAppointment !== undefined ? Boolean(cancelAppointment) : undefined,
        refundReason ? String(refundReason) : undefined
      );
      const clinicId = await storage.getAppointmentClinicId(req.params.id as string);
      if (clinicId) broadcastToClinic(clinicId, "appointment_changed", { ts: Date.now() });
      res.json({ ok: true, ...result });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/clinic-appointments/:id/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      if (!perms.includes("clinic.book") && !perms.includes("doctor.consultation")) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      if (!perms.includes("clinic.view_all")) {
        const clinicId = await storage.getAppointmentClinicId(req.params.id as string);
        if (clinicId) {
          const allowedIds = await storage.getUserClinicIds(userId);
          if (!allowedIds.includes(clinicId)) {
            return res.status(403).json({ message: "غير مصرح لك بالتعامل مع هذا الموعد" });
          }
        }
      }
      const { status } = req.body;
      const validStatuses = ['waiting', 'in_consultation', 'done', 'cancelled', 'no_show'];
      if (!validStatuses.includes(status)) return res.status(400).json({ message: "حالة غير صحيحة" });
      await storage.updateAppointmentStatus(req.params.id as string, status);
      const clinicIdForBroadcast = await storage.getAppointmentClinicId(req.params.id as string);
      if (clinicIdForBroadcast) broadcastToClinic(clinicIdForBroadcast, "appointment_changed", { ts: Date.now() });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // تحديث حالة تسليم الخدمة (service_delivered) — يُفعّل الاعتراف بالإيراد إذا كان الموعد منتهياً
  app.patch("/api/clinic-appointments/:id/service-delivered", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      // GAP-06: verify clinic membership (same pattern as PATCH /status)
      const perms = await storage.getUserEffectivePermissions(userId);
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        const clinicId = await storage.getAppointmentClinicId(req.params.id as string);
        if (clinicId && !clinicAllowed(scope, clinicId)) {
          return res.status(403).json({ message: "غير مصرح لك بالتعامل مع هذا الموعد" });
        }
      }
      const { serviceDelivered } = req.body;
      const aptId = req.params.id as string;
      await db.execute(sql`
        UPDATE clinic_appointments
        SET service_delivered = ${Boolean(serviceDelivered)}
        WHERE id = ${aptId}
      `);
      // If the appointment is already 'done' and advance was posted but revenue was not,
      // trigger revenue recognition now (idempotent — safe to re-call)
      if (Boolean(serviceDelivered)) {
        const rows = await db.execute(sql`
          SELECT status, accounting_posted_advance, accounting_posted_revenue
          FROM clinic_appointments WHERE id = ${aptId}
        `);
        const apt = rows.rows[0] as { status: string; accounting_posted_advance: boolean; accounting_posted_revenue: boolean } | undefined;
        if (apt && apt.status === 'done' && apt.accounting_posted_advance && !apt.accounting_posted_revenue) {
          await storage.updateAppointmentStatus(aptId, 'done');
        }
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // سجل القيود المحاسبية الكامل لموعد معين
  app.get("/api/appointments/:id/accounting", requireAuth, checkPermission("clinic.view_all"), async (req, res) => {
    try {
      const aptId = req.params.id as string;

      const journalRows = await db.execute(sql`
        SELECT
          je.id, je.entry_number, je.entry_date, je.description,
          je.source_entry_type, je.status AS journal_status,
          je.total_debit, je.total_credit,
          json_agg(
            json_build_object(
              'lineNumber', jl.line_number,
              'accountCode', a.code,
              'accountName', a.name,
              'debit',       jl.debit,
              'credit',      jl.credit
            ) ORDER BY jl.line_number
          ) AS lines
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.source_type = 'clinic_appointment'
          AND je.source_document_id = ${aptId}
        GROUP BY je.id
        ORDER BY je.entry_number
      `);

      const eventLogRows = await db.execute(sql`
        SELECT id, event_type, status, error_message, created_at, posted_by_user
        FROM accounting_event_log
        WHERE appointment_id = ${aptId}
        ORDER BY created_at
      `);

      const aptRows = await db.execute(sql`
        SELECT gross_amount, paid_amount, remaining_amount,
               doctor_deduction_amount, service_delivered,
               refund_amount, refund_reason,
               accounting_posted_advance, accounting_posted_revenue
        FROM clinic_appointments WHERE id = ${aptId}
      `);

      res.json({
        appointment: aptRows.rows[0] ?? null,
        journalEntries: journalRows.rows,
        eventLog: eventLogRows.rows,
      });
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
        createdBy: userId,
        drugs: drugs || [],
        serviceOrders: serviceOrders || [],
      });
      // Lock the intake once a consultation record is created — fire and forget
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

      const filters: { targetType?: string; status?: string; targetId?: string; clinicIds?: string[] } = {};

      if (canViewPharmacy && !isAdmin && !canViewOrders) {
        filters.targetType = 'pharmacy';
        const userRow = await db.execute(sql`SELECT pharmacy_id FROM users WHERE id = ${userId}`);
        const pharmacyId = (userRow.rows[0] as { pharmacy_id: string | null } | undefined)?.pharmacy_id;
        if (pharmacyId) filters.targetId = pharmacyId;
      }

      if (req.query.targetType as string) filters.targetType = req.query.targetType as string;
      if (req.query.status as string) filters.status = req.query.status as string;
      if (req.query.targetId as string) filters.targetId = req.query.targetId as string;

      // GAP-02: restrict list to the user's allowed clinics
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        filters.clinicIds = scope.clinicIds;
      }

      const orders = await storage.getClinicOrders(filters);
      res.json(snakeToCamel(orders));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-orders/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const perms = await storage.getUserEffectivePermissions(userId);
      const canView = perms.includes("doctor_orders.view") || perms.includes("clinic.pharmacy_orders") || perms.includes("dept_services.create");
      if (!canView) return res.status(403).json({ message: "لا تملك صلاحية لهذا الإجراء" });
      const order = await storage.getClinicOrder(req.params.id as string);
      if (!order) return res.status(404).json({ message: "الأمر غير موجود" });
      // GAP-03: verify the order belongs to an allowed clinic
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        const orderClinicId = await getOrderClinicId(req.params.id as string);
        if (orderClinicId && !clinicAllowed(scope, orderClinicId)) {
          return res.status(403).json({ message: "غير مصرح لك بالوصول لهذا الأمر" });
        }
      }
      res.json(snakeToCamel(order));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/clinic-orders/:id/execute", requireAuth, checkPermission("doctor_orders.execute"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      // GAP-04: verify the order belongs to an allowed clinic
      const perms = await storage.getUserEffectivePermissions(userId);
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        const orderClinicId = await getOrderClinicId(req.params.id as string);
        if (orderClinicId && !clinicAllowed(scope, orderClinicId)) {
          return res.status(403).json({ message: "غير مصرح لك بتنفيذ هذا الأمر" });
        }
      }
      const result = await storage.executeClinicOrder(req.params.id as string, userId);
      broadcastClinicOrdersUpdate();
      res.json(snakeToCamel(result));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/clinic-orders/:id/cancel", requireAuth, checkPermission("doctor_orders.execute"), async (req, res) => {
    try {
      const userId = req.session.userId!;
      // GAP-05: verify the order belongs to an allowed clinic
      const perms = await storage.getUserEffectivePermissions(userId);
      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        const orderClinicId = await getOrderClinicId(req.params.id as string);
        if (orderClinicId && !clinicAllowed(scope, orderClinicId)) {
          return res.status(403).json({ message: "غير مصرح لك بإلغاء هذا الأمر" });
        }
      }
      await storage.cancelClinicOrder(req.params.id as string);
      broadcastClinicOrdersUpdate();
      res.json({ ok: true });
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
