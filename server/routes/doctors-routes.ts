import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerDoctorsRoutes(app: Express) {

  app.get("/api/patient-invoices/:id/transfers", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض هذه الفاتورة" });
      }

      const inScope = await storage.checkInvoiceInScope(req.params.id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض هذه الفاتورة" });

      const transfers = await storage.getDoctorTransfers(req.params.id);
      res.json(transfers);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-invoices/:id/transfer-to-doctor",
    requireAuth,
    checkPermission(PERMISSIONS.PATIENT_INVOICES_TRANSFER_DOCTOR),
    async (req, res) => {
    try {
      const { doctorName, amount, clientRequestId, notes } = req.body;
      if (!doctorName || !amount || !clientRequestId) {
        return res.status(400).json({ message: "doctorName وamount وclientRequestId مطلوبة" });
      }
      const transfer = await storage.transferToDoctorPayable({
        invoiceId: req.params.id as string,
        doctorName,
        amount: String(amount),
        clientRequestId,
        notes,
      });
      res.status(201).json(transfer);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/doctor-settlements", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const doctorName = req.query.doctorName ? String(req.query.doctorName) : undefined;
      const dateFrom   = req.query.dateFrom   ? String(req.query.dateFrom)   : undefined;
      const dateTo     = req.query.dateTo     ? String(req.query.dateTo)     : undefined;
      const page       = parseInt(String(req.query.page     || "1"))  || 1;
      const pageSize   = parseInt(String(req.query.pageSize || "50")) || 50;
      const result     = await storage.getDoctorSettlements({ doctorName, dateFrom, dateTo, page, pageSize });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-settlements/outstanding", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const { doctorName } = req.query;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const data = await storage.getDoctorOutstandingTransfers(String(doctorName));
      res.json(data);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctor-settlements",
    requireAuth,
    checkPermission(PERMISSIONS.DOCTOR_SETTLEMENTS_CREATE),
    async (req, res) => {
    try {
      const { doctorName, paymentDate, amount, paymentMethod, settlementUuid, notes, allocations } = req.body;
      if (!doctorName || !paymentDate || !amount || !settlementUuid) {
        return res.status(400).json({ message: "doctorName وpaymentDate وamount وsettlementUuid مطلوبة" });
      }
      const settlement = await storage.createDoctorSettlement({
        doctorName,
        paymentDate,
        amount: String(amount),
        paymentMethod: paymentMethod || "cash",
        settlementUuid,
        notes,
        allocations,
      });
      res.status(201).json(settlement);
    } catch (error: unknown) {
      const code = (error as { statusCode?: number }).statusCode ?? 500;
      res.status(code).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/doctor-settlements/opd-deductions", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const doctorName = String(req.query.doctorName || "").trim();
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      const rows = await db.execute(sql`
        SELECT
          COALESCE(SUM(ca.doctor_deduction_amount), 0)::text AS "totalOpdDeductions",
          COUNT(*) FILTER (WHERE ca.doctor_deduction_amount > 0) AS "deductionCount"
        FROM clinic_appointments ca
        JOIN doctors d ON d.id = ca.doctor_id
        WHERE d.name = ${doctorName}
          AND ca.accounting_posted_revenue = true
          AND ca.doctor_deduction_amount > 0
      `);
      const row = rows.rows[0] as { totalOpdDeductions: string; deductionCount: string } | undefined;
      res.json({
        totalOpdDeductions: row?.totalOpdDeductions ?? "0",
        deductionCount: parseInt(row?.deductionCount ?? "0", 10),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/doctors/balances", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      res.json(await storage.getDoctorBalances());
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctor-statement", requireAuth, checkPermission(PERMISSIONS.DOCTOR_VIEW_STATEMENT), async (req, res) => {
    try {
      const { doctorName, dateFrom, dateTo } = req.query as Record<string, string>;
      if (!doctorName) return res.status(400).json({ message: "doctorName مطلوب" });
      res.json(await storage.getDoctorStatement({ doctorName, dateFrom, dateTo }));
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors/profitability", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      let dateFilter = sql``;
      if (dateFrom) dateFilter = sql`${dateFilter} AND h.invoice_date >= ${dateFrom}`;
      if (dateTo) dateFilter = sql`${dateFilter} AND h.invoice_date <= ${dateTo}`;

      const result = await db.execute(sql`
        SELECT
          d.id AS doctor_id,
          d.name AS doctor_name,
          d.specialty,
          d.financial_mode,
          COALESCE(SUM(CASE WHEN l.line_type != 'doctor_cost' AND NOT COALESCE(l.is_void, false) THEN CAST(COALESCE(l.total_price, '0') AS numeric) ELSE 0 END), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN l.line_type = 'doctor_cost' AND NOT COALESCE(l.is_void, false) THEN CAST(COALESCE(l.total_price, '0') AS numeric) ELSE 0 END), 0) AS total_doctor_cost,
          COUNT(DISTINCT h.id) AS invoice_count
        FROM doctors d
        LEFT JOIN patient_invoice_headers h ON h.doctor_id = d.id AND h.status = 'finalized' ${dateFilter}
        LEFT JOIN patient_invoice_lines l ON l.header_id = h.id
        GROUP BY d.id, d.name, d.specialty, d.financial_mode
        ORDER BY d.name
      `);
      const rows = (result.rows || []).map((r: any) => ({
        doctorId: r.doctor_id,
        doctorName: r.doctor_name,
        specialty: r.specialty,
        financialMode: r.financial_mode,
        totalRevenue: String(r.total_revenue ?? "0"),
        totalDoctorCost: String(r.total_doctor_cost ?? "0"),
        margin: String(Number(r.total_revenue ?? 0) - Number(r.total_doctor_cost ?? 0)),
        invoiceCount: Number(r.invoice_count ?? 0),
      }));
      res.json(rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const search = req.query.search as string;
      const includeInactive = req.query.includeInactive === "true";
      const list = search ? await storage.searchDoctors(search) : await storage.getDoctors(includeInactive);
      res.json(list);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_VIEW), async (req, res) => {
    try {
      const d = await storage.getDoctor(req.params.id as string);
      if (!d) return res.status(404).json({ message: "طبيب غير موجود" });
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/doctors", requireAuth, checkPermission(PERMISSIONS.DOCTORS_CREATE), async (req, res) => {
    try {
      const d = await storage.createDoctor(req.body);
      res.status(201).json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.patch("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      const d = await storage.updateDoctor(req.params.id as string, req.body);
      res.json(d);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.delete("/api/doctors/:id", requireAuth, checkPermission(PERMISSIONS.DOCTORS_EDIT), async (req, res) => {
    try {
      await storage.deleteDoctor(req.params.id as string);
      res.json({ success: true });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
