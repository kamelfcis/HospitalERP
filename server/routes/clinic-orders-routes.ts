import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  requireAuth,
  checkPermission,
  clinicOrdersClients,
  broadcastClinicOrdersUpdate,
} from "./_shared";
import {
  resolveClinicScope,
  clinicAllowed,
  getOrderClinicId,
  getAppointmentClinicId,
} from "../lib/clinic-scope";
import { snakeToCamel } from "./clinic-utils";

export function registerClinicOrdersRoutes(app: Express) {

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

      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        filters.clinicIds = scope.clinicIds;
      }

      const orders = await storage.getClinicOrders(filters);
      res.json(snakeToCamel(orders));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-orders/appointment/:appointmentId", requireAuth, async (req, res) => {
    try {
      const userId  = req.session.userId!;
      const role    = req.session.role!;
      const perms   = await storage.getUserEffectivePermissions(userId);
      const isAdmin = role === "admin" || role === "owner";
      const canView = perms.includes("doctor_orders.view") || isAdmin;
      if (!canView) return res.status(403).json({ message: "لا تملك صلاحية لعرض الطلبات" });

      const appointmentId = req.params.appointmentId as string;

      const apptClinicId = await getAppointmentClinicId(appointmentId);
      if (!apptClinicId) return res.status(404).json({ message: "الموعد غير موجود" });

      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all && !clinicAllowed(scope, apptClinicId)) {
        return res.status(403).json({ message: "غير مصرح لك بالوصول لهذا الموعد" });
      }

      const tracking = await storage.getAppointmentOrderTracking(appointmentId);
      res.json({
        totalService:    tracking.totalService,
        executedService: tracking.executedService,
        pendingService:  tracking.pendingService,
        totalPharmacy:    tracking.totalPharmacy,
        executedPharmacy: tracking.executedPharmacy,
        pendingPharmacy:  tracking.pendingPharmacy,
        orders: snakeToCamel(tracking.orders),
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/clinic-orders/grouped", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const role   = req.session.role!;
      const perms  = await storage.getUserEffectivePermissions(userId);
      const canViewOrders   = perms.includes("doctor_orders.view");
      const canViewPharmacy = perms.includes("clinic.pharmacy_orders");
      const isAdmin = role === "admin" || role === "owner";

      if (!canViewOrders && !canViewPharmacy && !isAdmin) {
        return res.status(403).json({ message: "لا تملك صلاحية" });
      }

      const filters: { targetType?: string; status?: string; targetId?: string; clinicIds?: string[] } = {};

      if (canViewPharmacy && !isAdmin && !canViewOrders) {
        filters.targetType = "pharmacy";
        const userRow = await db.execute(sql`SELECT pharmacy_id FROM users WHERE id = ${userId}`);
        const pharmacyId = (userRow as any).rows?.[0]?.pharmacy_id as string | null;
        if (pharmacyId) filters.targetId = pharmacyId;
      }

      if (req.query.targetType as string) filters.targetType = req.query.targetType as string;
      if (req.query.status    as string) filters.status     = req.query.status    as string;
      if (req.query.targetId  as string) filters.targetId   = req.query.targetId  as string;

      if (!filters.targetType && req.query.orderType) {
        if (req.query.orderType === "pharmacy") filters.targetType = "pharmacy";
        else if (req.query.orderType === "service") filters.targetType = "department";
      }

      const scope = await resolveClinicScope(userId, perms);
      if (!scope.all) {
        filters.clinicIds = scope.clinicIds;
      }

      const groups = await storage.getGroupedClinicOrders(filters);

      const camelGroups = groups.map((g: Record<string, unknown>) => ({
        groupKey:        g.group_key,
        appointmentId:   g.appointment_id,
        orderType:       g.order_type,
        targetType:      g.target_type,
        targetId:        g.target_id,
        targetName:      g.target_name,
        patientName:     g.patient_name,
        doctorId:        g.doctor_id,
        doctorName:      g.doctor_name,
        appointmentDate: g.appointment_date,
        totalCount:      g.total_count,
        pendingCount:    g.pending_count,
        executedCount:   g.executed_count,
        cancelledCount:  g.cancelled_count,
        groupStatus:     g.group_status,
        latestCreatedAt: g.latest_created_at,
        lines:           snakeToCamel(g.lines as Array<Record<string, unknown>>),
      }));

      res.json(camelGroups);
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
      const { patientName, patientPhone, patientId, doctorId, doctorName, departmentId,
        orderType, contractName, treasuryId, services, discountPercent,
        discountAmount, notes, clinicOrderIds,
        visitGroupId,
        visitId,
      } = req.body;

      if (!patientName || !departmentId || !services?.length) {
        return res.status(400).json({ message: "اسم المريض والقسم والخدمات مطلوبة" });
      }

      const _vgRaw = typeof visitGroupId === 'string' ? visitGroupId.trim() : "";
      const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (_vgRaw && !_UUID_RE.test(_vgRaw)) {
        return res.status(400).json({ message: "visit_group_id يجب أن يكون UUID صالحاً أو فارغاً" });
      }
      const safeVisitGroupId: string | undefined = _vgRaw || undefined;

      const hasDiscount = (discountPercent && parseFloat(discountPercent) > 0) || (discountAmount && parseFloat(discountAmount) > 0);
      if (hasDiscount) {
        const userPerms = await storage.getUserEffectivePermissions(req.session.userId!);
        if (!userPerms.includes("dept_services.discount")) {
          return res.status(403).json({ message: "ليس لديك صلاحية إضافة خصم على خدمات الأقسام" });
        }
      }

      const result = await storage.saveDeptServiceOrder({
        patientName, patientPhone, patientId, doctorId, doctorName, departmentId,
        orderType: orderType || 'cash', contractName, treasuryId,
        services, discountPercent, discountAmount, notes,
        userId: req.session.userId!, clinicOrderIds,
        visitGroupId: safeVisitGroupId,
        visitId: visitId || undefined,
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
