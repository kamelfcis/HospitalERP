import type { Express, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  requireAuth,
  checkPermission,
  clinicSseClients,
  broadcastToClinic,
} from "./_shared";
import {
  resolveClinicScope,
  clinicAllowed,
  getAppointmentClinicId,
} from "../lib/clinic-scope";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import { snakeToCamel, sseClinicEndpoint } from "./clinic-utils";

export function registerClinicAppointmentRoutes(app: Express) {

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

      if (canConsult && !canViewAll) {
        const doctorId = await storage.getUserDoctorId(userId);
        if (!doctorId) {
          return res.json({ appointments: [], noDoctorLinked: true });
        }
        const appointments = await storage.getClinicAppointments(req.params.id as string, date, doctorId);
        return res.json({ appointments: snakeToCamel(appointments) });
      }

      const appointments = await storage.getClinicAppointments(req.params.id as string, date);
      res.json(snakeToCamel(appointments));
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
        companyId, contractId, contractMemberId,
        visitId,
      } = req.body;
      if (!patientName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      if (!doctorId) return res.status(400).json({ message: "الطبيب مطلوب" });
      if (!appointmentDate) return res.status(400).json({ message: "تاريخ الموعد مطلوب" });

      let resolvedPatientId: string | undefined = patientId || undefined;
      if (!resolvedPatientId) {
        const ptRecord = await findOrCreatePatient(patientName.trim(), patientPhone || null);
        resolvedPatientId = ptRecord.id;
      }

      const pt = (paymentType || 'CASH').toUpperCase();

      if (contractMemberId) {
        if (!contractId || !companyId) {
          return res.status(400).json({ message: "بيانات العقد غير مكتملة — يجب توفير companyId و contractId مع contractMemberId" });
        }
        const chainCheck = await db.execute(
          sql`SELECT cm.id FROM contract_members cm
              JOIN contracts ct ON ct.id = cm.contract_id
              WHERE cm.id = ${contractMemberId}
                AND cm.contract_id = ${contractId}
                AND ct.company_id = ${companyId}
              LIMIT 1`
        );
        if (!(chainCheck as any).rows?.length) {
          return res.status(400).json({ message: "بيانات العقد غير متطابقة — المنتسب لا ينتمي للعقد أو الشركة المحددة" });
        }
      }

      if (pt === 'CONTRACT' && !contractMemberId) {
        return res.status(400).json({ message: "يجب تحديد بطاقة المنتسب لحجوزات التعاقد" });
      }

      const appointment = await storage.createAppointment({
        clinicId: req.params.id as string,
        createdBy: userId,
        patientName: patientName.trim(),
        patientId: resolvedPatientId, patientPhone, doctorId, appointmentDate, appointmentTime, notes,
        paymentType: pt,
        insuranceCompany: insuranceCompany || undefined,
        payerReference: payerReference || undefined,
        companyId: companyId || undefined,
        contractId: contractId || undefined,
        contractMemberId: contractMemberId || undefined,
        visitId: visitId || undefined,
      });
      broadcastToClinic(req.params.id as string, "appointment_changed", { ts: Date.now() });
      res.status(201).json(snakeToCamel(appointment));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/clinic-appointments/:id/cancel-refund", requireAuth, checkPermission("clinic.book"), async (req, res) => {
    try {
      const userId = req.session.userId!;
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

  app.patch("/api/clinic-appointments/:id/service-delivered", requireAuth, checkPermission("doctor.consultation"), async (req, res) => {
    try {
      const userId = req.session.userId!;
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
}
