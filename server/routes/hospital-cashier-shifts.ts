import type { Express } from "express";
import { storage }     from "../storage";
import { requireAuth, checkPermission, broadcastToUnit } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { logger }      from "../lib/logger";
import {
  resolveShiftActor,
  assertShiftOwnership,
  openShiftFlow,
} from "../services/hospital-cashier-shift-service";
import { assertMappingsComplete } from "../lib/mapping-completeness";

export function registerCashierShiftRoutes(app: Express) {
  app.get("/api/cashier/my-open-shift", requireAuth, async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId;
      if (!cashierId) return res.json(null);
      res.json(await storage.getMyOpenShift(cashierId) || null);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/cashier/shift/open", requireAuth, checkPermission(PERMISSIONS.CASHIER_OPEN_SHIFT), async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId;
      if (!cashierId) return res.status(401).json({ message: "يجب تسجيل الدخول" });

      const { openingCash, unitType, pharmacyId, departmentId, drawerPassword } = req.body;
      if (!unitType || !["pharmacy", "department"].includes(unitType)) return res.status(400).json({ message: "يجب تحديد نوع الوحدة" });
      if (unitType === "pharmacy"  && !pharmacyId)  return res.status(400).json({ message: "يجب اختيار الصيدلية" });
      if (unitType === "department" && !departmentId) return res.status(400).json({ message: "يجب اختيار القسم" });

      const shift = await openShiftFlow({ cashierId, openingCash, unitType, pharmacyId, departmentId, drawerPassword });
      res.json(shift);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = (e?.status as number) || 500;
      if (msg.includes("مفتوحة")) return res.status(409).json({ message: msg });
      res.status(code).json({ message: msg });
    }
  });

  app.get("/api/cashier/shift/active", requireAuth, async (req, res) => {
    try {
      const cashierId = (req.session as { userId?: string }).userId || "cashier-1";
      const unitType  = (req.query.unitType as string) || "pharmacy";
      const unitId    = req.query.unitId as string;
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

      const actor = await resolveShiftActor(userId);
      await assertShiftOwnership(shiftId, userId, actor.fullName, actor.isAdminOrSupervisor);

      if (!actor.isAdminOrSupervisor) {
        const shiftRecord = await storage.getShiftById(shiftId);
        if (shiftRecord?.pharmacyId) {
          const scope = await storage.getUserOperationalScope(userId);
          if (!scope.isFullAccess && !scope.allowedPharmacyIds.includes(shiftRecord.pharmacyId)) {
            logger.warn({ shiftId, userId, pharmacyId: shiftRecord.pharmacyId }, "[SHIFT_CLOSE] scope violation blocked");
            return res.status(403).json({ message: "الوردية خارج نطاق الصيدلية المسموح بها لك" });
          }
        }
      }

      // ── فحص ربط الحسابات قبل الإقفال ─────────────────────────────────────
      await assertMappingsComplete("cashier_shift_close");

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

      const closedShift = await storage.closeCashierShift(
        shiftId,
        closingCash,
        userId,
        actor.fullName,
        actor.isAdminOrSupervisor,
        {
          periodId:           preflight.periodId,
          custodianAccountId: preflight.custodianAccountId,
          varianceAccountId:  preflight.varianceAccountId,
        },
      );

      res.json(closedShift);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = (e?.status as number) || 500;
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

  app.get("/api/cashier/pending-sales", requireAuth, async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId   = req.query.unitId as string;
      if (!unitId) return res.status(400).json({ message: "يجب تحديد الوحدة" });
      res.json(await storage.getPendingSalesInvoices(unitType, unitId, req.query.search as string | undefined));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.get("/api/cashier/pending-returns", requireAuth, async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId   = req.query.unitId as string;
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

      const actor = await resolveShiftActor(userId);
      await assertShiftOwnership(shiftId, userId, actor.fullName, actor.isAdminOrSupervisor);

      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);
      const result = await storage.collectInvoices(shiftId, invoiceIds, collectedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "collect", newValues: JSON.stringify({ invoiceIds, collectedBy }) });

      const shift   = await storage.getShiftById(shiftId);
      const unitKey = shift?.pharmacyId || shift?.departmentId;
      if (unitKey) broadcastToUnit(unitKey, "invoice_collected", { invoiceIds, shiftId });
      res.json(result);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = (e?.status as number) || 500;
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

      const actor = await resolveShiftActor(userId);
      await assertShiftOwnership(shiftId, userId, actor.fullName, actor.isAdminOrSupervisor);

      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);
      const result = await storage.refundInvoices(shiftId, invoiceIds, refundedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "refund", newValues: JSON.stringify({ invoiceIds, refundedBy }) });

      const shift   = await storage.getShiftById(shiftId);
      const unitKey = shift?.pharmacyId || shift?.departmentId;
      if (unitKey) broadcastToUnit(unitKey, "invoice_refunded", { invoiceIds, shiftId });
      res.json(result);
    } catch (e: any) {
      const msg  = e instanceof Error ? e.message : String(e);
      const code = (e?.status as number) || 500;
      if (msg.includes("الفترة المحاسبية"))                           return res.status(403).json({ message: msg });
      if (msg.includes("رصيد الخزنة غير كافٍ"))                       return res.status(422).json({ message: msg });
      if (msg.includes("مصروف") || msg.includes("نهائي") || msg.includes("محجوز")) return res.status(409).json({ message: msg });
      if (msg.includes("منتهية الصلاحية") || msg.includes("ليست مفتوحة") || msg.includes("مفتوح")) return res.status(409).json({ message: msg });
      if (code === 403) return res.status(403).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });
}
