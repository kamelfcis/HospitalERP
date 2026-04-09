/*
 * ═══════════════════════════════════════════════════════════════
 *  hospital-cashier.ts — Pharmacy, Cashier & Drawer Routes
 *  الصيدليات والكاشير وكلمات سر الأدراج
 * ═══════════════════════════════════════════════════════════════
 *
 *  المسارات:
 *   GET/POST /api/pharmacies           — قائمة الصيدليات
 *   GET      /api/cashier/sse/:id      — SSE stream للفواتير الفورية
 *   GET/POST /api/drawer-passwords     — كلمات سر أدراج الخزنة
 *   GET/POST /api/cashier/shift/*      — فتح/إغلاق الوردية
 *   GET      /api/cashier/units        — وحدات الكاشير المتاحة
 *   POST     /api/cashier/collect      — تحصيل الفواتير نقداً
 *   POST     /api/cashier/refund       — استرداد فواتير مرتجعة
 *   GET/POST /api/cashier/receipts     — إيصالات الطباعة
 * ═══════════════════════════════════════════════════════════════
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users, cashierAuditLog } from "@shared/schema";
import { requireAuth, checkPermission, checkAnyPermission, sseClients, broadcastToUnit } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { logger } from "../lib/logger";

// ── مساعد: التحقق من ملكية الوردية ──────────────────────────────────────
//  القاعدة 5: الملكية إلزامية افتراضياً — bypass المشرف يُسجَّل في audit
async function assertShiftOwnership(
  shiftId: string,
  userId: string,
  userFullName: string,
  isAdminOrSupervisor: boolean,
): Promise<void> {
  const shift = await storage.getShiftById(shiftId);
  if (!shift) throw Object.assign(new Error("الوردية غير موجودة"), { status: 404 });

  if (shift.cashierId === userId) return; // صاحب الوردية — مسموح دائماً

  if (!isAdminOrSupervisor) {
    throw Object.assign(
      new Error("هذه الوردية لا تخصك — لا يمكنك تنفيذ هذه العملية"),
      { status: 403 },
    );
  }

  // المشرف/الأدمن — bypass مسموح لكن يجب تسجيله
  await db.insert(cashierAuditLog).values({
    shiftId,
    action:      "supervisor_override",
    entityType:  "shift",
    entityId:    shiftId,
    details:     `تدخل مشرف بواسطة ${userFullName} على وردية ${shift.cashierName}`,
    performedBy: userFullName,
  });
}

export function registerCashierRoutes(app: Express) {
  // ── Pharmacies ──────────────────────────────────────────────
  app.get("/api/pharmacies", requireAuth, async (_req, res) => {
    try { res.json(await storage.getPharmacies()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/pharmacies/:id", requireAuth, async (req, res) => {
    try {
      const p = await storage.getPharmacy(req.params.id as string);
      if (!p) return res.status(404).json({ message: "الصيدلية غير موجودة" });
      res.json(p);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/pharmacies", requireAuth, checkPermission(PERMISSIONS.PHARMACIES_MANAGE), async (req, res) => {
    try { res.json(await storage.createPharmacy(req.body)); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  // ── SSE: تحديثات الفواتير الفورية ──────────────────────────
  // الاسم :pharmacyId محافظ عليه للتوافق — لكنه يحمل unitId الفعلي (pharmacyId أو departmentId)
  // TODO (security): يستخدم SSE بروتوكول خاص — يحتاج تحليل منفصل لأفضل آلية للمصادقة (session cookies vs. token)
  app.get("/api/cashier/sse/:pharmacyId", (req, res) => {
    const unitId = req.params.pharmacyId;

    // no-transform يُخبر compression middleware بعدم ضغط هذه الاستجابة
    // X-Accel-Buffering: no يُخبر nginx بعدم تخزين الـ stream مؤقتاً
    res.writeHead(200, {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sseWrite = (data: string) => {
      res.write(data);
      (res as any).flush?.();
    };

    sseWrite(`event: connected\ndata: ${JSON.stringify({ unitId })}\n\n`);
    logger.debug({ unitId }, "[SSE] cashier client connected");

    if (!sseClients.has(unitId)) sseClients.set(unitId, new Set());
    sseClients.get(unitId)!.add(res);

    const keepAlive = setInterval(() => {
      try { sseWrite(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      const clients = sseClients.get(unitId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(unitId);
      }
      logger.debug({ unitId }, "[SSE] cashier client disconnected");
    });
  });

  // ── Drawer Passwords — تتطلب صلاحية ربط الحسابات ──────────
  app.get("/api/drawer-passwords", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (_req, res) => {
    try { res.json(await storage.getDrawersWithPasswordStatus()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/drawer-passwords/set", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      if (!password || password.length < 4) return res.status(400).json({ message: "كلمة السر يجب أن تكون 4 أحرف على الأقل" });
      await storage.setDrawerPassword(glAccountId, await bcrypt.hash(password, 10));
      res.json({ success: true, message: "تم تعيين كلمة السر بنجاح" });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/drawer-passwords/validate", async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      const hash = await storage.getDrawerPassword(glAccountId);
      if (!hash) return res.json({ valid: true, hasPassword: false });
      if (!await bcrypt.compare(password || "", hash)) return res.status(401).json({ message: "كلمة السر غير صحيحة" });
      res.json({ valid: true, hasPassword: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/drawer-passwords/:glAccountId", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const removed = await storage.removeDrawerPassword(req.params.glAccountId as string);
      if (!removed) return res.status(404).json({ message: "لا توجد كلمة سر لهذه الخزنة" });
      res.json({ success: true, message: "تم إزالة كلمة السر" });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  // ── Cashier API ─────────────────────────────────────────────
  app.get("/api/cashier/units", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId;
      const [pharms, depts] = await Promise.all([storage.getPharmacies(), storage.getDepartments()]);
      const activePharms = pharms.filter((p) => p.isActive);
      const activeDepts  = depts.filter((d) => d.isActive);
      if (!userId) return res.json({ pharmacies: activePharms, departments: activeDepts });
      const scope = await storage.getUserOperationalScope(userId);
      if (scope.isFullAccess) return res.json({ pharmacies: activePharms, departments: activeDepts, isFullAccess: true });
      res.json({
        pharmacies: activePharms.filter((p) => scope.allowedPharmacyIds.includes(p.id)),
        departments: activeDepts.filter((d) => scope.allowedDepartmentIds.includes(d.id)),
        isFullAccess: false,
      });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/staff", requireAuth, async (_req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id, username, full_name AS "fullName" FROM users WHERE is_active = true ORDER BY full_name`);
      res.json(rows.rows);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/my-open-shift", requireAuth, async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId;
      if (!cashierId) return res.json(null);
      // getMyOpenShift auto-marks stale shifts (duration-based, SQL-side)
      const shift = await storage.getMyOpenShift(cashierId) || null;
      res.json(shift);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/my-cashier-gl-account", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId;
      if (!userId) return res.json(null);
      res.json(await storage.getUserCashierGlAccount(userId) || null);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/cashier/shift/open", requireAuth, checkPermission(PERMISSIONS.CASHIER_OPEN_SHIFT), async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId;
      if (!cashierId) return res.status(401).json({ message: "يجب تسجيل الدخول" });
      const { openingCash, unitType, pharmacyId, departmentId, drawerPassword } = req.body;
      if (!unitType || !["pharmacy", "department"].includes(unitType)) return res.status(400).json({ message: "يجب تحديد نوع الوحدة" });
      if (unitType === "pharmacy" && !pharmacyId) return res.status(400).json({ message: "يجب اختيار الصيدلية" });
      if (unitType === "department" && !departmentId) return res.status(400).json({ message: "يجب اختيار القسم" });

      const userGlAccount = await storage.getUserCashierGlAccount(cashierId);
      if (!userGlAccount) return res.status(400).json({ message: "لم يتم تحديد حساب خزنة لهذا المستخدم — تواصل مع المدير لتعيين حساب الخزنة" });

      const scope = await storage.getUserOperationalScope(cashierId);
      if (!scope.isFullAccess) {
        const selectedId = unitType === "pharmacy" ? pharmacyId : departmentId;
        const allowed = unitType === "pharmacy"
          ? scope.allowedPharmacyIds.includes(selectedId)
          : scope.allowedDepartmentIds.includes(selectedId);
        if (!allowed) return res.status(403).json({ message: "ليس لديك صلاحية فتح وردية لهذه الوحدة" });
      }

      const passwordHash = await storage.getDrawerPassword(userGlAccount.glAccountId);
      if (passwordHash) {
        if (!drawerPassword) return res.status(401).json({ message: "كلمة سر الخزنة مطلوبة" });
        if (!await bcrypt.compare(drawerPassword, passwordHash)) return res.status(401).json({ message: "كلمة سر الخزنة غير صحيحة" });
      }

      const [userRow] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, cashierId));
      const shift = await storage.openCashierShift(cashierId, userRow?.fullName || cashierId, openingCash || "0", unitType, pharmacyId, departmentId, userGlAccount.glAccountId);
      res.json(shift);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("مفتوحة")) return res.status(409).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/cashier/shift/active", requireAuth, async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId || "cashier-1";
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.json(null);
      res.json(await storage.getActiveShift(cashierId, unitType, unitId));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/my-shifts", requireAuth, async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId || "cashier-1";
      res.json(await storage.getMyOpenShifts(cashierId));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/shift/:shiftId/validate-close", requireAuth, async (req, res) => {
    try { res.json(await storage.validateShiftClose(req.params.shiftId as string)); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/cashier/shift/:shiftId/close", requireAuth, checkPermission(PERMISSIONS.CASHIER_OPEN_SHIFT), async (req, res) => {
    const shiftId = req.params.shiftId as string;
    const userId  = (req.session as { userId?: string }).userId!;
    try {
      const { closingCash } = req.body;
      if (closingCash === undefined) return res.status(400).json({ message: "المبلغ النقدي الفعلي مطلوب" });

      // ── جلب بيانات المستخدم ──────────────────────────────────────────
      const [userRow] = await db.select({
        fullName: users.fullName,
        role:     users.role,
      }).from(users).where(eq(users.id, userId));

      const fullName            = userRow?.fullName || userId;
      const isAdminOrSupervisor = !!(userRow?.role === "admin" || userRow?.role === "owner");

      // ── القاعدة 5: التحقق من الملكية — bypass مشرف يُسجَّل ──────────
      await assertShiftOwnership(shiftId, userId, fullName, isAdminOrSupervisor);

      // ── فحص النطاق (Scope Check) ─────────────────────────────────────
      //    مكمّل لـ assertShiftOwnership:
      //    - الأدمن/المالك: isFullAccess = true → يمر دائماً
      //    - المستخدم العادي (مالك الوردية): يتحقق أن صيدلية الوردية ضمن نطاقه
      //      (defense-in-depth في حالة تغيّر النطاق بعد فتح الوردية)
      if (!isAdminOrSupervisor) {
        const shiftRecord = await storage.getShiftById(shiftId);
        if (shiftRecord?.pharmacyId) {
          const scope = await storage.getUserOperationalScope(userId);
          if (!scope.isFullAccess && !scope.allowedPharmacyIds.includes(shiftRecord.pharmacyId)) {
            logger.warn({ shiftId, userId, pharmacyId: shiftRecord.pharmacyId }, "[SHIFT_CLOSE] scope violation blocked");
            return res.status(403).json({ message: "الوردية خارج نطاق الصيدلية المسموح بها لك" });
          }
        }
      }

      // ── التحقق المسبق الإلزامي (BLOCKING) ───────────────────────────
      //    يتحقق من: فترة مالية مفتوحة، حساب العهدة (12127)،
      //    حساب GL الكاشير، وحساب الفروق إن وُجد فرق.
      //    يرمي 422 بالرسالة العربية الدقيقة عند أي فشل.
      let preflight: Awaited<ReturnType<typeof storage.preflightShiftClose>>;
      try {
        preflight = await storage.preflightShiftClose(shiftId, closingCash);
      } catch (preflightErr: any) {
        const msg  = preflightErr instanceof Error ? preflightErr.message : String(preflightErr);
        const code = preflightErr?.status || 422;
        logger.warn({
          event:     "SHIFT_CLOSE_BLOCKED",
          shiftId,
          cashierId: userId,
          reason:    msg,
          code:      preflightErr?.code,
          timestamp: new Date().toISOString(),
        }, "[SHIFT_CLOSE] محجوب بواسطة التحقق المسبق");
        return res.status(code).json({ message: msg });
      }

      // ── إغلاق الوردية + قيد GL في transaction واحدة (ذرية) ──────────
      const closedShift = await storage.closeCashierShift(
        shiftId,
        closingCash,
        userId,
        fullName,
        isAdminOrSupervisor,
        {
          periodId:           preflight.periodId,
          custodianAccountId: preflight.custodianAccountId,
          varianceAccountId:  preflight.varianceAccountId,
        },
      );

      res.json(closedShift);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = e?.status || 500;
      logger.error({ event: "SHIFT_CLOSE_ERROR", shiftId, userId, err: msg }, "[SHIFT_CLOSE] خطأ");
      if (code === 422) return res.status(422).json({ message: msg });
      if (code === 403) return res.status(403).json({ message: msg });
      if (code === 404) return res.status(404).json({ message: msg });
      if (msg.includes("معلق") || msg.includes("معلّق") || msg.includes("مغلق") || msg.includes("منتهية")) {
        return res.status(409).json({ message: msg });
      }
      res.status(code === 500 ? 500 : code).json({ message: msg });
    }
  });

  app.get("/api/cashier/shift/:shiftId/totals", requireAuth, async (req, res) => {
    try { res.json(await storage.getShiftTotals(req.params.shiftId as string)); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/pending-sales", requireAuth, async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.status(400).json({ message: "يجب تحديد الوحدة" });
      res.json(await storage.getPendingSalesInvoices(unitType, unitId, req.query.search as string | undefined));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/pending-returns", requireAuth, async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.status(400).json({ message: "يجب تحديد الوحدة" });
      res.json(await storage.getPendingReturnInvoices(unitType, unitId, req.query.search as string | undefined));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/invoice/:id/details", requireAuth, async (req, res) => {
    try {
      const details = await storage.getSalesInvoiceDetails(req.params.id as string);
      if (!details) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(details);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/cashier/collect", requireAuth, checkPermission(PERMISSIONS.CASHIER_COLLECT), async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;
      const { shiftId, invoiceIds, collectedBy, paymentDate } = req.body;
      if (!shiftId || !invoiceIds?.length || !collectedBy) return res.status(400).json({ message: "بيانات التحصيل غير مكتملة" });

      // القاعدة 5: ملكية الوردية إلزامية
      const [userRow] = await db.select({ fullName: users.fullName, role: users.role })
        .from(users).where(eq(users.id, userId));
      const fullName           = userRow?.fullName || userId;
      const isAdminOrSupervisor = !!(userRow?.role === "admin" || userRow?.role === "owner");
      await assertShiftOwnership(shiftId, userId, fullName, isAdminOrSupervisor);

      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);
      const result = await storage.collectInvoices(shiftId, invoiceIds, collectedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "collect", newValues: JSON.stringify({ invoiceIds, collectedBy }) });
      const shift = await storage.getShiftById(shiftId);
      const unitKey = shift?.pharmacyId || shift?.departmentId;
      if (unitKey) broadcastToUnit(unitKey, "invoice_collected", { invoiceIds, shiftId });
      res.json(result);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = e?.status || 500;
      if (msg.includes("الفترة المحاسبية"))                                                     return res.status(403).json({ message: msg });
      if (msg.includes("محصّلة") || msg.includes("نهائي") || msg.includes("محجوزة"))          return res.status(409).json({ message: msg });
      if (msg.includes("منتهية الصلاحية") || msg.includes("ليست مفتوحة") || msg.includes("مفتوح")) return res.status(409).json({ message: msg });
      if (code === 403) return res.status(403).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/cashier/refund", requireAuth, checkPermission(PERMISSIONS.CASHIER_REFUND), async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;
      const { shiftId, invoiceIds, refundedBy, paymentDate } = req.body;
      if (!shiftId || !invoiceIds?.length || !refundedBy) return res.status(400).json({ message: "بيانات الصرف غير مكتملة" });

      // القاعدة 5: ملكية الوردية إلزامية
      const [userRow] = await db.select({ fullName: users.fullName, role: users.role })
        .from(users).where(eq(users.id, userId));
      const fullName           = userRow?.fullName || userId;
      const isAdminOrSupervisor = !!(userRow?.role === "admin" || userRow?.role === "owner");
      await assertShiftOwnership(shiftId, userId, fullName, isAdminOrSupervisor);

      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);
      const result = await storage.refundInvoices(shiftId, invoiceIds, refundedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "refund", newValues: JSON.stringify({ invoiceIds, refundedBy }) });
      const shift = await storage.getShiftById(shiftId);
      const unitKey = shift?.pharmacyId || shift?.departmentId;
      if (unitKey) broadcastToUnit(unitKey, "invoice_refunded", { invoiceIds, shiftId });
      res.json(result);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = e?.status || 500;
      if (msg.includes("الفترة المحاسبية"))                           return res.status(403).json({ message: msg });
      if (msg.includes("رصيد الخزنة غير كافٍ"))                       return res.status(422).json({ message: msg });
      if (msg.includes("مصروف") || msg.includes("نهائي") || msg.includes("محجوز")) return res.status(409).json({ message: msg });
      if (msg.includes("منتهية الصلاحية") || msg.includes("ليست مفتوحة") || msg.includes("مفتوح")) return res.status(409).json({ message: msg });
      if (code === 403) return res.status(403).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/cashier/receipts/:id/print", requireAuth, async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      res.json(await storage.markReceiptPrinted(req.params.id as string, printedBy, reprintReason));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("مطبوع مسبقاً")) return res.status(409).json({ message: msg });
      if (msg.includes("غير موجود")) return res.status(404).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/cashier/refund-receipts/:id/print", requireAuth, async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      res.json(await storage.markRefundReceiptPrinted(req.params.id as string, printedBy, reprintReason));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("مطبوع مسبقاً")) return res.status(409).json({ message: msg });
      if (msg.includes("غير موجود")) return res.status(404).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/cashier/receipts/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.getCashierReceipt(req.params.id as string);
      if (!r) return res.status(404).json({ message: "الإيصال غير موجود" });
      res.json(r);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/refund-receipts/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.getCashierRefundReceipt(req.params.id as string);
      if (!r) return res.status(404).json({ message: "إيصال المرتجع غير موجود" });
      res.json(r);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  // ── Treasuries ──────────────────────────────────────────────
  app.get("/api/treasuries", requireAuth, checkAnyPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW, PERMISSIONS.PATIENT_PAYMENTS), async (req, res) => {
    try { res.json(await storage.getTreasuries()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/summary", requireAuth, checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW), async (req, res) => {
    try { res.json(await storage.getTreasuriesSummary()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/treasuries", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      if (!name || !glAccountId) return res.status(400).json({ message: "الاسم والحساب مطلوبان" });
      res.status(201).json(await storage.createTreasury({ name, glAccountId, isActive: isActive ?? true, notes }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.patch("/api/treasuries/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      res.json(await storage.updateTreasury(req.params.id as string, { name, glAccountId, isActive, notes }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/treasuries/:id", requireAuth, checkPermission(PERMISSIONS.SETTINGS_ACCOUNT_MAPPINGS), async (req, res) => {
    try { await storage.deleteTreasury(req.params.id as string); res.json({ ok: true }); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/mine", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;

      // 1) تحقق من user_treasuries أولاً
      const assigned = await storage.getUserTreasury(userId);
      if (assigned) return res.json(assigned);

      // 2) Fallback: إذا لم تُعيَّن خزنة ثابتة، استخدم خزنة الوردية النشطة للكاشير
      const shift = await storage.getMyOpenShift(userId) as
        { glAccountId?: string | null; id?: string; openedAt?: string } | null;
      if (shift?.glAccountId) {
        // ابحث عن الخزنة التي تحمل نفس الـ GL account
        const rows = await db.execute(sql`
          SELECT t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
                 a.code AS gl_account_code, a.name AS gl_account_name
          FROM   treasuries t
          JOIN   accounts   a ON a.id = t.gl_account_id
          WHERE  t.gl_account_id = ${shift.glAccountId}
            AND  t.is_active = true
          LIMIT 1
        `);
        if (rows.rows.length > 0) {
          const r = rows.rows[0] as Record<string, unknown>;
          return res.json({
            id:            r.id,
            name:          r.name,
            glAccountId:   r.gl_account_id,
            isActive:      r.is_active,
            notes:         r.notes,
            createdAt:     r.created_at,
            glAccountCode: r.gl_account_code,
            glAccountName: r.gl_account_name,
          });
        }

        // 3) Fallback أعمق: الـ GL account موجود لكن لا توجد خزنة مرتبطة به —
        //    نُعيد بيانات الحساب مباشرةً (يكفي لـ selectedGlAccountId)
        const glRows = await db.execute(sql`
          SELECT id, code, name FROM accounts WHERE id = ${shift.glAccountId} LIMIT 1
        `);
        if (glRows.rows.length > 0) {
          const g = glRows.rows[0] as Record<string, unknown>;
          return res.json({
            id:            `shift-${shift.id}`,
            name:          String(g.name),
            glAccountId:   shift.glAccountId,
            isActive:      true,
            notes:         null,
            createdAt:     shift.openedAt,
            glAccountCode: String(g.code),
            glAccountName: String(g.name),
          });
        }
      }

      res.json(null);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/treasuries/:id/statement", requireAuth, checkPermission(PERMISSIONS.CASHIER_HANDOVER_VIEW), async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      const page     = parseInt(String(req.query.page     || "1"))   || 1;
      const pageSize = parseInt(String(req.query.pageSize || "100")) || 100;
      res.json(await storage.getTreasuryStatement({ treasuryId: req.params.id as string, dateFrom, dateTo, page, pageSize }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/user-treasuries", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try { res.json(await storage.getAllUserTreasuries()); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/user-treasuries", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try {
      const { userId, treasuryId } = req.body;
      if (!userId || !treasuryId) return res.status(400).json({ message: "userId و treasuryId مطلوبان" });
      await storage.assignUserTreasury(userId, treasuryId);
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/user-treasuries/:userId", requireAuth, checkPermission(PERMISSIONS.USERS_EDIT), async (req, res) => {
    try { await storage.removeUserTreasury(req.params.userId as string); res.json({ ok: true }); }
    catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });
}
