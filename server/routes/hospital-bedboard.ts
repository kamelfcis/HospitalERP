/*
 * ═══════════════════════════════════════════════════════════════
 *  hospital-bedboard.ts — Bed Board & Stay Engine Routes
 *  لوحة الأسرة ومحرك الإقامة
 * ═══════════════════════════════════════════════════════════════
 *
 *  المسارات:
 *   GET  /api/bed-board/events       — SSE stream لتحديثات الأسرة
 *   GET  /api/bed-board              — حالة كل الأسرة
 *   GET  /api/beds/available         — الأسرة الفارغة
 *   POST /api/beds/:id/admit         — قبول مريض في سرير
 *   POST /api/beds/:id/transfer      — نقل مريض لسرير آخر
 *   POST /api/beds/:id/discharge     — تسجيل خروج (يتحقق من الفاتورة)
 *   POST /api/beds/:id/status        — تغيير حالة السرير (صيانة/تنظيف)
 *
 *   GET  /api/admissions/:id/segments          — قطاعات الإقامة
 *   POST /api/admissions/:id/segments          — فتح قطاع إقامة جديد
 *   POST /api/admissions/:id/segments/:id/close — إغلاق قطاع إقامة
 *   POST /api/admissions/:id/transfer          — تحويل قطاع الإقامة
 *   POST /api/stay/accrue                      — احتساب رسوم الإقامة
 *
 *  الحماية: requireAuth + checkHospitalAccess على كل endpoint
 * ═══════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { storage } from "../storage";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { bedBoardClients, broadcastBedBoardUpdate, requireAuth, checkHospitalAccess, checkPermission, capSseForVercel } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { findOrCreatePatient } from "../lib/find-or-create-patient";
import { logger } from "../lib/logger";

export function registerBedBoardRoutes(app: Express) {
  // ── SSE stream ──────────────────────────────────────────────
  app.get("/api/bed-board/events", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.BED_BOARD_VIEW), (req, res) => {
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

    const dispose = capSseForVercel(req, res, () => {
      clearInterval(keepAlive);
      bedBoardClients.delete(res);
    });
    req.on("close", dispose);
  });

  app.get("/api/bed-board", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.BED_BOARD_VIEW), async (req, res) => {
    try {
      const userId = (req.session as { userId?: string }).userId!;
      const scope = await storage.getUserOperationalScope(userId);
      const departmentIds = scope.isFullAccess ? undefined : scope.allowedDepartmentIds;
      res.json(await storage.getBedBoard(departmentIds));
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/beds/available", requireAuth, checkHospitalAccess, async (_req, res) => {
    try {
      res.json(await storage.getAvailableBeds());
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/beds/admission-companies", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_CREATE), async (req, res) => {
    try {
      const companies = await storage.getCompanies({ isActive: true });
      res.json(companies);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ";
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/beds/member-lookup", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_CREATE), async (req, res) => {
    try {
      const rawCard = (req.query.cardNumber as string | undefined)?.trim() ?? "";
      if (rawCard.length < 3) {
        return res.status(400).json({ message: "رقم البطاقة قصير جداً — أدخل 3 أحرف على الأقل" });
      }
      const resolvedDate = new Date().toISOString().slice(0, 10);
      const result = await storage.lookupMemberByCard(rawCard, resolvedDate);
      if (!result) {
        return res.status(404).json({ message: "لم يُعثر على بطاقة منتسب نشطة بهذا الرقم" });
      }
      res.json({
        memberId:         result.member.id,
        memberCardNumber: result.member.memberCardNumber,
        memberName:       result.member.memberNameAr,
        contractId:       result.contract.id,
        contractName:     result.contract.contractName,
        companyId:        result.company.id,
        companyName:      result.company.nameAr,
        coverageUntil:    result.member.endDate,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message ?? "خطأ في البحث" });
    }
  });

  app.post("/api/beds/:id/admit", requireAuth, checkHospitalAccess, checkPermission(PERMISSIONS.ADMISSIONS_CREATE), async (req, res) => {
    try {
      const { patientName, patientPhone, patientId, nationalId, dateOfBirth, age, departmentId, serviceId, doctorName, notes, paymentType, insuranceCompany, surgeryTypeId, contractMemberId, isPackage } = req.body;
      if (!patientName?.trim()) return res.status(400).json({ message: "اسم المريض مطلوب" });
      if (paymentType === "contract" && !contractMemberId) {
        return res.status(400).json({ message: "رقم كارنيه المنتسب مطلوب لمرضى التعاقد" });
      }
      if (doctorName !== undefined && typeof doctorName === "string") {
        logger.info({ event: "BED_ADMIT_DOCTOR", doctorName, bedId: req.params.id }, "[BED_ADMIT] doctor_name received");
      }
      let resolvedPatientId: string | undefined = patientId || undefined;
      if (!resolvedPatientId) {
        const pt = await findOrCreatePatient(patientName.trim(), patientPhone || null);
        resolvedPatientId = pt.id;
      }
      if (resolvedPatientId) {
        const patientUpdates: Record<string, any> = {};
        if (nationalId) patientUpdates.nationalId = nationalId;
        if (dateOfBirth) patientUpdates.dateOfBirth = dateOfBirth;
        if (age != null && age !== '') patientUpdates.age = parseInt(String(age), 10);
        if (Object.keys(patientUpdates).length > 0) {
          try { await storage.updatePatient(resolvedPatientId, patientUpdates); } catch {}
        }
      }
      const result = await storage.admitPatientToBed({
        bedId: req.params.id as string,
        patientName: patientName.trim(),
        patientPhone: patientPhone || undefined,
        patientId: resolvedPatientId,
        departmentId: departmentId || undefined,
        serviceId: serviceId || undefined,
        doctorName: doctorName || undefined,
        notes: notes || undefined,
        paymentType: paymentType || undefined,
        insuranceCompany: insuranceCompany || undefined,
        surgeryTypeId: surgeryTypeId || undefined,
        contractMemberId: contractMemberId || undefined,
        isPackage: isPackage ?? false,
      });
      broadcastBedBoardUpdate();
      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.status(201).json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("غير فارغ") ? 409 : 400).json({ message: msg });
    }
  });

  app.post("/api/beds/:id/transfer", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const { targetBedId, newServiceId, newInvoiceId } = req.body;
      if (!targetBedId) return res.status(400).json({ message: "targetBedId مطلوب" });
      const result = await storage.transferPatientBed({
        sourceBedId: req.params.id as string,
        targetBedId,
        newServiceId: newServiceId || undefined,
        newInvoiceId: newInvoiceId || undefined,
      });
      broadcastBedBoardUpdate();
      res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("غير موجود") ? 404 : 409).json({ message: msg });
    }
  });

  app.post("/api/beds/:id/discharge", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const { force } = req.body || {};
      const bedId = req.params.id as string;

      if (force) {
        const FORCE_ROLES = ["owner", "admin", "accounts_manager"];
        const sessionRole = (req.session as { role?: string })?.role;
        if (!sessionRole || !FORCE_ROLES.includes(sessionRole)) {
          return res.status(403).json({ message: "ليس لديك صلاحية تجاوز شرط الخروج", code: "FORBIDDEN" });
        }
      }

      const bedRes = await db.execute(sql`SELECT b.current_admission_id FROM beds b WHERE b.id = ${bedId}`);
      const bedRow = bedRes.rows[0] as { current_admission_id: string | null } | undefined;
      if (!bedRow) return res.status(404).json({ message: "السرير غير موجود" });
      if (!bedRow.current_admission_id) return res.status(409).json({ message: "لا يوجد مريض في هذا السرير" });

      const invRes = await db.execute(sql`
        SELECT id, status, net_amount, paid_amount
        FROM patient_invoice_headers
        WHERE admission_id = ${bedRow.current_admission_id}
        ORDER BY created_at DESC LIMIT 1
      `);
      const inv = invRes.rows[0] as { status: string; net_amount: string; paid_amount: string } | undefined;

      if (!inv) {
        if (!force) return res.status(400).json({ message: "المريض لم يصدر له فاتورة بعد", code: "NO_INVOICE" });
      } else if (inv.status !== "finalized") {
        if (!force) return res.status(400).json({ message: "لا يمكن تسجيل خروج المريض — الفاتورة لم تُعتمد بعد", code: "INVOICE_NOT_FINALIZED" });
      }

      const result = await storage.dischargeFromBed(bedId);
      broadcastBedBoardUpdate();
      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("غير موجود") ? 404 : 409).json({ message: msg });
    }
  });

  app.post("/api/beds/:id/status", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["EMPTY", "NEEDS_CLEANING", "MAINTENANCE"].includes(status)) {
        return res.status(400).json({ message: "حالة غير صالحة" });
      }
      const bed = await storage.setBedStatus(req.params.id as string, status);
      broadcastBedBoardUpdate();
      res.json(bed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مشغول") ? 409 : 400).json({ message: msg });
    }
  });

  // ── Stay Engine ──────────────────────────────────────────────
  app.get("/api/admissions/:id/segments", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      res.json(await storage.getStaySegments(req.params.id as string));
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admissions/:id/segments", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const { serviceId, invoiceId, notes } = req.body;
      if (!invoiceId) return res.status(400).json({ message: "invoiceId مطلوب" });
      const seg = await storage.openStaySegment({
        admissionId: req.params.id as string,
        serviceId: serviceId || undefined,
        invoiceId,
        notes: notes || undefined,
      });
      res.status(201).json(seg);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("نشط") ? 409 : 400).json({ message: msg });
    }
  });

  app.post("/api/admissions/:id/segments/:segmentId/close", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      res.json(await storage.closeStaySegment(req.params.segmentId as string));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مغلق") ? 409 : 400).json({ message: msg });
    }
  });

  app.post("/api/admissions/:id/transfer", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      const { oldSegmentId, newServiceId, newInvoiceId, notes } = req.body;
      if (!oldSegmentId) return res.status(400).json({ message: "oldSegmentId مطلوب" });
      if (!newInvoiceId)  return res.status(400).json({ message: "newInvoiceId مطلوب" });
      const seg = await storage.transferStaySegment({
        admissionId: req.params.id as string,
        oldSegmentId,
        newServiceId: newServiceId || undefined,
        newInvoiceId,
        notes: notes || undefined,
      });
      res.status(201).json(seg);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("غير موجود") || msg.includes("غير نشط") ? 404 : 400).json({ message: msg });
    }
  });

  app.post("/api/stay/accrue", requireAuth, checkHospitalAccess, async (req, res) => {
    try {
      res.json(await storage.accrueStayLines());
    } catch (e: unknown) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });
}
