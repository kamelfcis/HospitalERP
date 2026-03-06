import type { Express, Response } from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users, floors, rooms, beds } from "@shared/schema";
import {
  requireAuth,
  checkPermission,
  sseClients,
  bedBoardClients,
  broadcastToPharmacy,
  broadcastBedBoardUpdate,
  addFormattedNumber,
} from "./_shared";

export function registerHospitalRoutes(app: Express, httpServer: Server) {
  // ==================== Bed Board ====================

  app.get("/api/bed-board/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    bedBoardClients.add(res);

    const keepAlive = setInterval(() => {
      try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      bedBoardClients.delete(res);
    });
  });

  app.get("/api/bed-board", async (_req, res) => {
    try {
      const data = await storage.getBedBoard();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/beds/available", async (_req, res) => {
    try {
      const data = await storage.getAvailableBeds();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/beds/:id/admit", async (req, res) => {
    try {
      const { patientName, patientPhone, departmentId, serviceId, doctorName, notes, paymentType, insuranceCompany, surgeryTypeId } = req.body;
      if (!patientName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      const result = await storage.admitPatientToBed({
        bedId: req.params.id,
        patientName: patientName.trim(),
        patientPhone: patientPhone || undefined,
        departmentId: departmentId || undefined,
        serviceId: serviceId || undefined,
        doctorName: doctorName || undefined,
        notes: notes || undefined,
        paymentType: paymentType || undefined,
        insuranceCompany: insuranceCompany || undefined,
        surgeryTypeId: surgeryTypeId || undefined,
      });
      broadcastBedBoardUpdate();
      res.status(201).json(result);
    } catch (error: any) {
      const code = error.message?.includes("غير فارغ") ? 409 : 400;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/beds/:id/transfer", async (req, res) => {
    try {
      const { targetBedId, newServiceId, newInvoiceId } = req.body;
      if (!targetBedId) return res.status(400).json({ message: "targetBedId مطلوب" });
      const result = await storage.transferPatientBed({
        sourceBedId: req.params.id,
        targetBedId,
        newServiceId: newServiceId || undefined,
        newInvoiceId: newInvoiceId || undefined,
      });
      broadcastBedBoardUpdate();
      res.json(result);
    } catch (error: any) {
      const code = error.message?.includes("غير موجود") ? 404 : 409;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/beds/:id/discharge", async (req, res) => {
    try {
      const { force } = req.body || {};
      const bedId = req.params.id;

      if (force) {
        const FORCE_ROLES = ["owner", "admin", "accounts_manager"];
        const sessionRole = (req.session as any)?.role;
        if (!sessionRole || !FORCE_ROLES.includes(sessionRole)) {
          return res.status(403).json({
            message: "ليس لديك صلاحية تجاوز شرط الخروج",
            code: "FORBIDDEN",
          });
        }
      }

      const bedRes = await db.execute(sql`
        SELECT b.current_admission_id FROM beds b WHERE b.id = ${bedId}
      `);
      const bedRow = bedRes.rows[0] as any;
      if (!bedRow) return res.status(404).json({ message: "السرير غير موجود" });
      if (!bedRow.current_admission_id) return res.status(409).json({ message: "لا يوجد مريض في هذا السرير" });

      const invRes = await db.execute(sql`
        SELECT id, status, net_amount, paid_amount
        FROM patient_invoice_headers
        WHERE admission_id = ${bedRow.current_admission_id}
        ORDER BY created_at DESC LIMIT 1
      `);
      const inv = invRes.rows[0] as any;

      if (!inv) {
        if (!force) {
          return res.status(400).json({
            message: "المريض لم يصدر له فاتورة بعد",
            code: "NO_INVOICE",
          });
        }
      } else if (inv.status !== "finalized") {
        if (!force) {
          return res.status(400).json({
            message: "لا يمكن تسجيل خروج المريض — الفاتورة لم تُعتمد بعد",
            code: "INVOICE_NOT_FINALIZED",
          });
        }
      }

      const result = await storage.dischargeFromBed(bedId);
      broadcastBedBoardUpdate();
      res.json(result);
    } catch (error: any) {
      const code = error.message?.includes("غير موجود") ? 404 : 409;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/beds/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const ALLOWED = ["EMPTY", "NEEDS_CLEANING", "MAINTENANCE"];
      if (!ALLOWED.includes(status)) return res.status(400).json({ message: "حالة غير صالحة" });
      const bed = await storage.setBedStatus(req.params.id, status);
      broadcastBedBoardUpdate();
      res.json(bed);
    } catch (error: any) {
      const code = error.message?.includes("مشغول") ? 409 : 400;
      res.status(code).json({ message: error.message });
    }
  });

  // ==================== Stay Engine ====================

  app.get("/api/admissions/:id/segments", async (req, res) => {
    try {
      const segments = await storage.getStaySegments(req.params.id);
      res.json(segments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admissions/:id/segments", async (req, res) => {
    try {
      const { serviceId, invoiceId, notes } = req.body;
      if (!invoiceId) return res.status(400).json({ message: "invoiceId مطلوب" });
      const seg = await storage.openStaySegment({
        admissionId: req.params.id,
        serviceId: serviceId || undefined,
        invoiceId,
        notes: notes || undefined,
      });
      res.status(201).json(seg);
    } catch (error: any) {
      const code = error.message?.includes("نشط") ? 409 : 400;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/admissions/:id/segments/:segmentId/close", async (req, res) => {
    try {
      const seg = await storage.closeStaySegment(req.params.segmentId);
      res.json(seg);
    } catch (error: any) {
      const code = error.message?.includes("مغلق") ? 409 : 400;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/admissions/:id/transfer", async (req, res) => {
    try {
      const { oldSegmentId, newServiceId, newInvoiceId, notes } = req.body;
      if (!oldSegmentId) return res.status(400).json({ message: "oldSegmentId مطلوب" });
      if (!newInvoiceId) return res.status(400).json({ message: "newInvoiceId مطلوب" });
      const seg = await storage.transferStaySegment({
        admissionId: req.params.id,
        oldSegmentId,
        newServiceId: newServiceId || undefined,
        newInvoiceId,
        notes: notes || undefined,
      });
      res.status(201).json(seg);
    } catch (error: any) {
      const code = error.message?.includes("غير موجود") || error.message?.includes("غير نشط") ? 404 : 400;
      res.status(code).json({ message: error.message });
    }
  });

  app.post("/api/stay/accrue", async (req, res) => {
    try {
      const result = await storage.accrueStayLines();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Pharmacy API ====================

  app.get("/api/pharmacies", async (_req, res) => {
    try {
      const list = await storage.getPharmacies();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pharmacies/:id", async (req, res) => {
    try {
      const pharmacy = await storage.getPharmacy(req.params.id);
      if (!pharmacy) return res.status(404).json({ message: "الصيدلية غير موجودة" });
      res.json(pharmacy);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pharmacies", async (req, res) => {
    try {
      const pharmacy = await storage.createPharmacy(req.body);
      res.json(pharmacy);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SSE for Real-time Invoice Updates ====================

  app.get("/api/cashier/sse/:pharmacyId", (req, res) => {
    const { pharmacyId } = req.params;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ pharmacyId })}\n\n`);

    if (!sseClients.has(pharmacyId)) {
      sseClients.set(pharmacyId, new Set());
    }
    sseClients.get(pharmacyId)!.add(res);

    const keepAlive = setInterval(() => {
      try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      const clients = sseClients.get(pharmacyId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(pharmacyId);
      }
    });
  });

  // ==================== Drawer Passwords API ====================

  app.get("/api/drawer-passwords", async (_req, res) => {
    try {
      const drawers = await storage.getDrawersWithPasswordStatus();
      res.json(drawers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/drawer-passwords/set", async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      if (!password || password.length < 4) return res.status(400).json({ message: "كلمة السر يجب أن تكون 4 أحرف على الأقل" });
      const hash = await bcrypt.hash(password, 10);
      await storage.setDrawerPassword(glAccountId, hash);
      res.json({ success: true, message: "تم تعيين كلمة السر بنجاح" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/drawer-passwords/validate", async (req, res) => {
    try {
      const { glAccountId, password } = req.body;
      if (!glAccountId) return res.status(400).json({ message: "يجب تحديد حساب الخزنة" });
      const hash = await storage.getDrawerPassword(glAccountId);
      if (!hash) {
        return res.json({ valid: true, hasPassword: false });
      }
      const valid = await bcrypt.compare(password || "", hash);
      if (!valid) return res.status(401).json({ message: "كلمة السر غير صحيحة" });
      res.json({ valid: true, hasPassword: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/drawer-passwords/:glAccountId", async (req, res) => {
    try {
      const removed = await storage.removeDrawerPassword(req.params.glAccountId);
      if (!removed) return res.status(404).json({ message: "لا توجد كلمة سر لهذه الخزنة" });
      res.json({ success: true, message: "تم إزالة كلمة السر" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Cashier API ====================

  app.get("/api/cashier/units", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const [pharms, depts] = await Promise.all([storage.getPharmacies(), storage.getDepartments()]);
      const activePharms = pharms.filter((p: any) => p.isActive);
      const activeDepts = depts.filter((d: any) => d.isActive);

      if (!userId) return res.json({ pharmacies: activePharms, departments: activeDepts });

      const scope = await storage.getUserCashierScope(userId);
      if (scope.isFullAccess) {
        return res.json({ pharmacies: activePharms, departments: activeDepts, isFullAccess: true });
      }

      res.json({
        pharmacies: activePharms.filter((p: any) => scope.allowedPharmacyIds.includes(p.id)),
        departments: activeDepts.filter((d: any) => scope.allowedDepartmentIds.includes(d.id)),
        isFullAccess: false,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/staff", async (req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id, username, full_name AS "fullName" FROM users WHERE is_active = true ORDER BY full_name`);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/my-open-shift", async (req, res) => {
    try {
      const cashierId = (req.session as any).userId;
      if (!cashierId) return res.json(null);
      const shift = await storage.getMyOpenShift(cashierId);
      res.json(shift || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/my-cashier-gl-account", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.json(null);
      const account = await storage.getUserCashierGlAccount(userId);
      res.json(account || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/shift/open", async (req, res) => {
    try {
      const cashierId = (req.session as any).userId;
      if (!cashierId) return res.status(401).json({ message: "يجب تسجيل الدخول" });

      const { openingCash, unitType, pharmacyId, departmentId, drawerPassword } = req.body;
      if (!unitType || !["pharmacy", "department"].includes(unitType)) return res.status(400).json({ message: "يجب تحديد نوع الوحدة" });
      if (unitType === "pharmacy" && !pharmacyId) return res.status(400).json({ message: "يجب اختيار الصيدلية" });
      if (unitType === "department" && !departmentId) return res.status(400).json({ message: "يجب اختيار القسم" });

      const userGlAccount = await storage.getUserCashierGlAccount(cashierId);
      if (!userGlAccount) return res.status(400).json({ message: "لم يتم تحديد حساب خزنة لهذا المستخدم — تواصل مع المدير لتعيين حساب الخزنة" });

      const scope = await storage.getUserCashierScope(cashierId);
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
        const valid = await bcrypt.compare(drawerPassword, passwordHash);
        if (!valid) return res.status(401).json({ message: "كلمة سر الخزنة غير صحيحة" });
      }

      const [userRow] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, cashierId));
      const cashierName = userRow?.fullName || cashierId;

      const shift = await storage.openCashierShift(cashierId, cashierName, openingCash || "0", unitType, pharmacyId, departmentId, userGlAccount.glAccountId);
      res.json(shift);
    } catch (error: any) {
      if (error.message?.includes("مفتوحة")) return res.status(409).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/shift/active", async (req, res) => {
    try {
      const cashierId = (req.session as any).userId || "cashier-1";
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.json(null);
      const shift = await storage.getActiveShift(cashierId, unitType, unitId);
      res.json(shift);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/my-shifts", async (req, res) => {
    try {
      const cashierId = (req.session as any).userId || "cashier-1";
      const shifts = await storage.getMyOpenShifts(cashierId);
      res.json(shifts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/shift/:shiftId/validate-close", async (req, res) => {
    try {
      const result = await storage.validateShiftClose(req.params.shiftId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/shift/:shiftId/close", async (req, res) => {
    try {
      const { closingCash } = req.body;
      if (closingCash === undefined) return res.status(400).json({ message: "المبلغ النقدي الفعلي مطلوب" });
      const shift = await storage.closeCashierShift(req.params.shiftId, closingCash);
      res.json(shift);
    } catch (error: any) {
      if (error.message?.includes("معلق") || error.message?.includes("مغلق")) return res.status(409).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/shift/:shiftId/totals", async (req, res) => {
    try {
      const totals = await storage.getShiftTotals(req.params.shiftId);
      res.json(totals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/pending-sales", async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.status(400).json({ message: "يجب تحديد الوحدة" });
      const search = req.query.search as string | undefined;
      const invoices = await storage.getPendingSalesInvoices(unitType, unitId, search);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/pending-returns", async (req, res) => {
    try {
      const unitType = (req.query.unitType as string) || "pharmacy";
      const unitId = req.query.unitId as string;
      if (!unitId) return res.status(400).json({ message: "يجب تحديد الوحدة" });
      const search = req.query.search as string | undefined;
      const invoices = await storage.getPendingReturnInvoices(unitType, unitId, search);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/invoice/:id/details", async (req, res) => {
    try {
      const details = await storage.getSalesInvoiceDetails(req.params.id);
      if (!details) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      res.json(details);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/collect", async (req, res) => {
    try {
      const { shiftId, invoiceIds, collectedBy, paymentDate } = req.body;
      if (!shiftId || !invoiceIds?.length || !collectedBy) {
        return res.status(400).json({ message: "بيانات التحصيل غير مكتملة" });
      }
      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);

      const result = await storage.collectInvoices(shiftId, invoiceIds, collectedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "collect", newValues: JSON.stringify({ invoiceIds, collectedBy }) });
      const shift = await storage.getShiftById(shiftId);
      if (shift?.pharmacyId) {
        broadcastToPharmacy(shift.pharmacyId, "invoice_collected", { invoiceIds });
      }
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes("الفترة المحاسبية")) return res.status(403).json({ message: error.message });
      if (error.message?.includes("محصّلة") || error.message?.includes("مفتوحة") || error.message?.includes("نهائي")) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/refund", async (req, res) => {
    try {
      const { shiftId, invoiceIds, refundedBy, paymentDate } = req.body;
      if (!shiftId || !invoiceIds?.length || !refundedBy) {
        return res.status(400).json({ message: "بيانات الصرف غير مكتملة" });
      }
      const txnDate = paymentDate || new Date().toISOString().split("T")[0];
      await storage.assertPeriodOpen(txnDate);

      const result = await storage.refundInvoices(shiftId, invoiceIds, refundedBy, txnDate);
      await storage.createAuditLog({ tableName: "cashier_receipts", recordId: shiftId, action: "refund", newValues: JSON.stringify({ invoiceIds, refundedBy }) });
      const shift = await storage.getShiftById(shiftId);
      if (shift?.pharmacyId) {
        broadcastToPharmacy(shift.pharmacyId, "invoice_refunded", { invoiceIds });
      }
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes("الفترة المحاسبية")) return res.status(403).json({ message: error.message });
      if (error.message?.includes("رصيد الخزنة غير كافٍ")) return res.status(422).json({ message: error.message });
      if (error.message?.includes("مصروف") || error.message?.includes("مفتوحة") || error.message?.includes("نهائي")) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/receipts/:id/print", async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      const receipt = await storage.markReceiptPrinted(req.params.id, printedBy, reprintReason);
      res.json(receipt);
    } catch (error: any) {
      if (error.message?.includes("مطبوع مسبقاً")) return res.status(409).json({ message: error.message });
      if (error.message?.includes("غير موجود")) return res.status(404).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/cashier/refund-receipts/:id/print", async (req, res) => {
    try {
      const { printedBy, reprintReason } = req.body;
      if (!printedBy) return res.status(400).json({ message: "اسم الطابع مطلوب" });
      const receipt = await storage.markRefundReceiptPrinted(req.params.id, printedBy, reprintReason);
      res.json(receipt);
    } catch (error: any) {
      if (error.message?.includes("مطبوع مسبقاً")) return res.status(409).json({ message: error.message });
      if (error.message?.includes("غير موجود")) return res.status(404).json({ message: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/receipts/:id", async (req, res) => {
    try {
      const receipt = await storage.getCashierReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ message: "الإيصال غير موجود" });
      res.json(receipt);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/cashier/refund-receipts/:id", async (req, res) => {
    try {
      const receipt = await storage.getCashierRefundReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ message: "إيصال المرتجع غير موجود" });
      res.json(receipt);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Room Management ====================

  app.get("/api/rooms", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT r.id, r.name_ar, r.room_number, r.service_id, r.floor_id,
               s.name_ar AS service_name_ar, s.base_price AS service_price,
               f.name_ar AS floor_name_ar
        FROM rooms r
        JOIN floors f ON f.id = r.floor_id
        LEFT JOIN services s ON s.id = r.service_id
        ORDER BY f.sort_order, r.sort_order
      `);
      res.json(result.rows.map((r: any) => ({
        id: r.id, nameAr: r.name_ar, roomNumber: r.room_number,
        serviceId: r.service_id || null, floorId: r.floor_id, floorNameAr: r.floor_name_ar,
        serviceNameAr: r.service_name_ar || null, servicePrice: r.service_price || null,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/rooms/:id", async (req, res) => {
    try {
      const { serviceId } = req.body;
      await db.execute(sql`
        UPDATE rooms SET service_id = ${serviceId || null} WHERE id = ${req.params.id}
      `);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Floors CRUD ====================

  app.get("/api/floors", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT f.id, f.name_ar, f.sort_order,
               COUNT(r.id)::int AS room_count,
               (SELECT COUNT(*)::int FROM beds b JOIN rooms r2 ON r2.id = b.room_id WHERE r2.floor_id = f.id) AS bed_count
        FROM floors f
        LEFT JOIN rooms r ON r.floor_id = f.id
        GROUP BY f.id
        ORDER BY f.sort_order, f.name_ar
      `);
      res.json(result.rows.map((r: any) => ({
        id: r.id, nameAr: r.name_ar, sortOrder: r.sort_order,
        roomCount: r.room_count, bedCount: r.bed_count,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/floors", async (req, res) => {
    try {
      const { nameAr, sortOrder } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الدور مطلوب" });
      const result = await db.insert(floors).values({
        nameAr, sortOrder: sortOrder ?? 0,
      }).returning();
      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/floors/:id", async (req, res) => {
    try {
      const { nameAr, sortOrder } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الدور مطلوب" });
      const result = await db.update(floors).set({
        nameAr, sortOrder: sortOrder ?? 0,
      }).where(eq(floors.id, req.params.id)).returning();
      if (result.length === 0) return res.status(404).json({ message: "الدور غير موجود" });
      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/floors/:id", async (req, res) => {
    try {
      const occupiedBeds = await db.execute(sql`
        SELECT b.id FROM beds b
        JOIN rooms r ON r.id = b.room_id
        WHERE r.floor_id = ${req.params.id} AND b.status = 'OCCUPIED'
        LIMIT 1
      `);
      if (occupiedBeds.rows.length > 0) {
        return res.status(400).json({ message: "لا يمكن حذف الدور: يوجد أسرّة مشغولة" });
      }
      await db.delete(floors).where(eq(floors.id, req.params.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Rooms CRUD ====================

  app.post("/api/rooms", async (req, res) => {
    try {
      const { floorId, nameAr, roomNumber, serviceId } = req.body;
      if (!floorId || !nameAr) return res.status(400).json({ message: "الدور واسم الغرفة مطلوبان" });
      const result = await db.insert(rooms).values({
        floorId, nameAr, roomNumber: roomNumber || null, serviceId: serviceId || null,
      }).returning();
      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rooms/:id", async (req, res) => {
    try {
      const { nameAr, roomNumber, serviceId } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الغرفة مطلوب" });
      await db.execute(sql`
        UPDATE rooms SET name_ar = ${nameAr}, room_number = ${roomNumber || null},
        service_id = ${serviceId || null} WHERE id = ${req.params.id}
      `);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/rooms/:id", async (req, res) => {
    try {
      const occupiedBeds = await db.execute(sql`
        SELECT b.id FROM beds b
        WHERE b.room_id = ${req.params.id} AND b.status = 'OCCUPIED'
        LIMIT 1
      `);
      if (occupiedBeds.rows.length > 0) {
        return res.status(400).json({ message: "لا يمكن حذف الغرفة: يوجد أسرّة مشغولة" });
      }
      await db.delete(rooms).where(eq(rooms.id, req.params.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Beds CRUD ====================

  app.post("/api/beds", async (req, res) => {
    try {
      const { roomId, bedNumber } = req.body;
      if (!roomId || !bedNumber) return res.status(400).json({ message: "الغرفة ورقم السرير مطلوبان" });
      const result = await db.insert(beds).values({
        roomId, bedNumber, status: "EMPTY",
      }).returning();
      res.json(result[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/beds/:id", async (req, res) => {
    try {
      const bedRes = await db.execute(sql`SELECT status FROM beds WHERE id = ${req.params.id}`);
      if (bedRes.rows.length === 0) return res.status(404).json({ message: "السرير غير موجود" });
      if ((bedRes.rows[0] as any).status === "OCCUPIED") {
        return res.status(400).json({ message: "لا يمكن حذف سرير مشغول" });
      }
      await db.delete(beds).where(eq(beds.id, req.params.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== Treasuries ====================

  app.get("/api/treasuries", requireAuth, async (req, res) => {
    try {
      const list = await storage.getTreasuries();
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/treasuries/summary", requireAuth, async (req, res) => {
    try {
      const list = await storage.getTreasuriesSummary();
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/treasuries", requireAuth, async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      if (!name || !glAccountId) return res.status(400).json({ message: "الاسم والحساب مطلوبان" });
      const row = await storage.createTreasury({ name, glAccountId, isActive: isActive ?? true, notes });
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/treasuries/:id", requireAuth, async (req, res) => {
    try {
      const { name, glAccountId, isActive, notes } = req.body;
      const row = await storage.updateTreasury(req.params.id, { name, glAccountId, isActive, notes });
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/treasuries/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteTreasury(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/treasuries/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const treasury = await storage.getUserTreasury(user.id);
      res.json(treasury);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/treasuries/:id/statement", requireAuth, async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      const stmt = await storage.getTreasuryStatement({ treasuryId: req.params.id, dateFrom, dateTo });
      res.json(stmt);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/user-treasuries", requireAuth, async (req, res) => {
    try {
      const list = await storage.getAllUserTreasuries();
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/user-treasuries", requireAuth, async (req, res) => {
    try {
      const { userId, treasuryId } = req.body;
      if (!userId || !treasuryId) return res.status(400).json({ message: "userId و treasuryId مطلوبان" });
      await storage.assignUserTreasury(userId, treasuryId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/user-treasuries/:userId", requireAuth, async (req, res) => {
    try {
      await storage.removeUserTreasury(req.params.userId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
