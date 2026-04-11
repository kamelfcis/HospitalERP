import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logReadAccess } from "./patients-crud";

export function registerPatientInquiryRoutes(app: Express) {

  app.get("/api/patient-inquiry", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
      }

      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;
      const adminDeptFilter = scope.isFullAccess ? ((req.query.deptId as string) || null) : null;

      const {
        dateFrom = null,
        dateTo   = null,
        search   = null,
      } = req.query as Record<string, string>;

      let clinicId: string | null = (req.query.clinicId as string) || null;
      if (!scope.isFullAccess && scope.allowedClinicIds.length > 0) {
        const requestedClinic = clinicId;
        if (requestedClinic && scope.allowedClinicIds.includes(requestedClinic)) {
          clinicId = requestedClinic;
        } else {
          clinicId = scope.allowedClinicIds.length === 1 ? scope.allowedClinicIds[0] : null;
        }
      }

      const result = await storage.getPatientInquiry(
        { adminDeptFilter, clinicId, dateFrom, dateTo, search },
        forcedDeptIds,
      );

      logReadAccess({
        userId: req.session.userId!,
        endpoint: "/api/patient-inquiry",
        ipAddress: req.ip,
        filters: { deptId: adminDeptFilter, clinicId, dateFrom, dateTo, search },
        rowCount: result.count,
      });

      return res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patient-inquiry/lines", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const scope = await storage.getUserOperationalScope(req.session.userId!);

      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض أي قسم، تواصل مع مدير النظام" });
      }

      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;

      const {
        patientId   = null,
        patientName = null,
        lineType    = null,
      } = req.query as Record<string, string>;

      if (!patientId && !patientName) {
        return res.status(400).json({ message: "يجب تحديد المريض (patientId أو patientName)" });
      }

      const lines = await storage.getPatientInquiryLines(
        { patientId, patientName },
        forcedDeptIds,
        lineType,
      );

      logReadAccess({
        userId: req.session.userId!,
        endpoint: "/api/patient-inquiry/lines",
        ipAddress: req.ip,
        filters: { patientId, patientName, lineType },
        rowCount: lines.length,
      });

      return res.json(lines);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id/financial-summary", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;

      const pharmResult = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                    AS invoice_count,
          COALESCE(SUM(net_total::numeric),  0)::numeric                  AS total_amount,
          COALESCE(SUM(
            CASE WHEN customer_type = 'cash' THEN net_total::numeric ELSE 0 END
          ), 0)::numeric                                                   AS total_paid,
          COALESCE(SUM(
            CASE WHEN customer_type <> 'cash' AND status = 'finalized'
            THEN net_total::numeric ELSE 0 END
          ), 0)::numeric                                                   AS total_outstanding,
          MAX(invoice_date)                                                AS last_invoice_date
        FROM sales_invoice_headers
        WHERE patient_id = ${id}
          AND status IN ('draft','finalized')
          AND COALESCE(is_return, false) = false
      `);

      const patInvResult = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                      AS invoice_count,
          COALESCE(SUM(total_amount::numeric),   0)::numeric                AS total_amount,
          COALESCE(SUM(paid_amount::numeric),    0)::numeric                AS total_paid,
          COALESCE(SUM(total_amount::numeric - COALESCE(paid_amount::numeric, 0)), 0)::numeric
                                                                            AS total_outstanding,
          MAX(invoice_date)                                                  AS last_invoice_date
        FROM patient_invoice_headers
        WHERE patient_id = ${id}
          AND status = 'finalized'
      `);

      const admResult = await db.execute(sql`
        SELECT COUNT(*)::int AS admission_count, MAX(admission_date) AS last_admission
        FROM admissions WHERE patient_id = ${id}
      `);

      const ph = (pharmResult as any).rows[0] || {};
      const pi = (patInvResult as any).rows[0] || {};
      const adm = (admResult as any).rows[0] || {};

      const totalAmount      = (parseFloat(ph.total_amount      || "0") + parseFloat(pi.total_amount      || "0"));
      const totalPaid        = (parseFloat(ph.total_paid        || "0") + parseFloat(pi.total_paid        || "0"));
      const totalOutstanding = (parseFloat(ph.total_outstanding || "0") + parseFloat(pi.total_outstanding || "0"));
      const invoiceCount     = (parseInt(ph.invoice_count || "0") + parseInt(pi.invoice_count || "0"));

      const lastDates = [ph.last_invoice_date, pi.last_invoice_date, adm.last_admission].filter(Boolean);
      const lastInteraction = lastDates.length ? lastDates.sort().reverse()[0] : null;

      return res.json({
        totalAmount:      parseFloat(totalAmount.toFixed(2)),
        totalPaid:        parseFloat(totalPaid.toFixed(2)),
        totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
        invoiceCount,
        admissionCount:   parseInt(adm.admission_count || "0"),
        lastInteraction,
        breakdown: {
          pharmacy: {
            invoiceCount: parseInt(ph.invoice_count || "0"),
            totalAmount:  parseFloat(parseFloat(ph.total_amount  || "0").toFixed(2)),
            totalPaid:    parseFloat(parseFloat(ph.total_paid    || "0").toFixed(2)),
            outstanding:  parseFloat(parseFloat(ph.total_outstanding || "0").toFixed(2)),
            lastDate:     ph.last_invoice_date || null,
          },
          medical: {
            invoiceCount: parseInt(pi.invoice_count || "0"),
            totalAmount:  parseFloat(parseFloat(pi.total_amount  || "0").toFixed(2)),
            totalPaid:    parseFloat(parseFloat(pi.total_paid    || "0").toFixed(2)),
            outstanding:  parseFloat(parseFloat(pi.total_outstanding || "0").toFixed(2)),
            lastDate:     pi.last_invoice_date || null,
          },
        },
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id/invoices-aggregated", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;

      const scope = await storage.getUserOperationalScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;
      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });
      }
      const inScope = await storage.checkPatientInScope(id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      const headersResult = await db.execute(sql`
        SELECT
          h.id,
          h.invoice_number,
          h.invoice_date,
          h.patient_name,
          h.patient_type,
          h.status,
          h.admission_id,
          h.visit_group_id,
          h.is_consolidated,
          h.total_amount,
          h.discount_amount,
          h.header_discount_amount,
          h.net_amount,
          h.paid_amount,
          h.doctor_name,
          h.contract_name,
          h.created_at,
          h.department_id,
          h.is_final_closed,
          h.final_closed_at,
          h.final_closed_by,
          h.visit_id,
          h.diagnosis,
          COALESCE(d.name_ar, '—') AS department_name
        FROM patient_invoice_headers h
        LEFT JOIN departments d ON d.id = h.department_id
        WHERE h.patient_id = ${id}
          AND h.status IN ('draft','finalized')
        ORDER BY h.invoice_date DESC, h.created_at DESC
      `);

      const headers = (headersResult as any).rows as Array<{
        id: string; invoice_number: string; invoice_date: string;
        patient_name: string; patient_type: string; status: string;
        admission_id: string | null; visit_group_id: string | null;
        is_consolidated: boolean; total_amount: string; discount_amount: string;
        header_discount_amount: string; net_amount: string; paid_amount: string;
        doctor_name: string | null; contract_name: string | null;
        created_at: string; department_id: string | null; department_name: string;
        is_final_closed: boolean | null; final_closed_at: string | null; final_closed_by: string | null;
        visit_id: string | null; diagnosis: string | null;
      }>;

      if (headers.length === 0) {
        return res.json({ totals: { totalAmount: 0, discountAmount: 0, netAmount: 0, paidAmount: 0, remaining: 0, invoiceCount: 0, lineCount: 0, companyShareAmount: null, patientShareAmount: null }, byVisit: [], byDepartment: [], byClassification: [], invoices: [] });
      }

      const headerIds = headers.map(h => h.id);

      const linesResult = await db.execute(sql`
        SELECT
          l.id, l.header_id, l.line_type, l.description,
          l.quantity, l.unit_price, l.discount_percent,
          l.discount_amount, l.total_price,
          l.source_type, l.source_id,
          l.business_classification,
          l.is_void,
          l.company_share_amount,
          l.patient_share_amount
        FROM patient_invoice_lines l
        WHERE l.header_id IN (${sql.join(headerIds.map(id => sql`${id}`), sql`, `)})
          AND COALESCE(l.is_void, false) = false
        ORDER BY l.header_id, l.id
      `);

      const allLines = (linesResult as any).rows as Array<{
        id: string; header_id: string; line_type: string; description: string;
        quantity: string; unit_price: string; discount_percent: string;
        discount_amount: string; total_price: string;
        source_type: string | null; source_id: string | null;
        business_classification: string | null; is_void: boolean;
        company_share_amount: string | null; patient_share_amount: string | null;
      }>;

      const n = (v: string | number | null | undefined) => parseFloat(String(v ?? 0)) || 0;
      const round2 = (x: number) => Math.round(x * 100) / 100;

      let totTotalAmount = 0, totDiscount = 0, totNet = 0, totPaid = 0;
      let totCompanyShare = 0, totPatientShare = 0;
      for (const h of headers) {
        totTotalAmount += n(h.total_amount);
        totDiscount    += n(h.discount_amount) + n(h.header_discount_amount);
        totNet         += n(h.net_amount);
        totPaid        += n(h.paid_amount);
      }
      for (const l of allLines) {
        totCompanyShare  += n(l.company_share_amount);
        totPatientShare  += n(l.patient_share_amount);
      }
      const hasContractSplit = totCompanyShare > 0 || totPatientShare > 0;

      const visitMap = new Map<string, {
        visitKey: string; visitLabel: string; visitType: "inpatient" | "outpatient" | "standalone";
        visitDate: string; invoiceCount: number; departments: Set<string>;
        totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number;
      }>();

      for (const h of headers) {
        let visitKey: string;
        let visitType: "inpatient" | "outpatient" | "standalone";
        let visitLabel: string;
        let visitDate = h.invoice_date || h.created_at?.slice(0, 10) || "";

        if (h.admission_id) {
          visitKey = `admission:${h.admission_id}`;
          visitType = "inpatient";
          visitLabel = `إقامة ${h.admission_id.slice(-6).toUpperCase()}`;
        } else if (h.visit_group_id) {
          visitKey = `group:${h.visit_group_id}`;
          visitType = "outpatient";
          visitLabel = `زيارة خارجية ${h.visit_group_id.slice(-6).toUpperCase()}`;
        } else if (h.visit_id) {
          visitKey = `visit:${h.visit_id}`;
          visitType = "outpatient";
          visitLabel = `زيارة خارجية`;
        } else {
          visitKey = `standalone:${h.id}`;
          visitType = "standalone";
          visitLabel = `فاتورة ${h.invoice_number}`;
        }

        if (!visitMap.has(visitKey)) {
          visitMap.set(visitKey, { visitKey, visitLabel, visitType, visitDate, invoiceCount: 0, departments: new Set(), totalAmount: 0, discountAmount: 0, netAmount: 0, paidAmount: 0 });
        }
        const v = visitMap.get(visitKey)!;
        v.invoiceCount++;
        v.departments.add(h.department_name);
        v.totalAmount   += n(h.total_amount);
        v.discountAmount += n(h.discount_amount) + n(h.header_discount_amount);
        v.netAmount     += n(h.net_amount);
        v.paidAmount    += n(h.paid_amount);
        if (h.invoice_date < v.visitDate || v.visitDate === "") v.visitDate = h.invoice_date;
      }

      const byVisit = Array.from(visitMap.values()).map(v => ({
        ...v,
        departments: Array.from(v.departments),
        remaining: round2(v.netAmount - v.paidAmount),
        totalAmount: round2(v.totalAmount),
        discountAmount: round2(v.discountAmount),
        netAmount: round2(v.netAmount),
        paidAmount: round2(v.paidAmount),
      })).sort((a, b) => a.visitDate.localeCompare(b.visitDate));

      const deptMap = new Map<string, { departmentId: string | null; departmentName: string; invoiceCount: number; totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number }>();
      for (const h of headers) {
        const key = h.department_id ?? "__none__";
        if (!deptMap.has(key)) {
          deptMap.set(key, { departmentId: h.department_id, departmentName: h.department_name, invoiceCount: 0, totalAmount: 0, discountAmount: 0, netAmount: 0, paidAmount: 0 });
        }
        const d = deptMap.get(key)!;
        d.invoiceCount++;
        d.totalAmount    += n(h.total_amount);
        d.discountAmount += n(h.discount_amount) + n(h.header_discount_amount);
        d.netAmount      += n(h.net_amount);
        d.paidAmount     += n(h.paid_amount);
      }

      const byDepartment = Array.from(deptMap.values()).map(d => ({
        ...d,
        remaining: round2(d.netAmount - d.paidAmount),
        totalAmount: round2(d.totalAmount),
        discountAmount: round2(d.discountAmount),
        netAmount: round2(d.netAmount),
        paidAmount: round2(d.paidAmount),
      })).sort((a, b) => a.departmentName.localeCompare(b.departmentName, "ar"));

      const headerNetMap = new Map<string, { net: number; paid: number }>();
      for (const h of headers) headerNetMap.set(h.id, { net: n(h.net_amount), paid: n(h.paid_amount) });

      const classMap = new Map<string, { lineType: string; lineTypeLabel: string; lineCount: number; totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number }>();
      const LINE_LABELS: Record<string, string> = { service: "خدمات", drug: "أدوية", consumable: "مستهلكات", equipment: "أجهزة" };

      for (const l of allLines) {
        const lt = l.line_type || "service";
        if (!classMap.has(lt)) {
          classMap.set(lt, { lineType: lt, lineTypeLabel: LINE_LABELS[lt] ?? lt, lineCount: 0, totalAmount: 0, discountAmount: 0, netAmount: 0, paidAmount: 0 });
        }
        const c = classMap.get(lt)!;
        c.lineCount++;
        const lineTotal   = n(l.total_price) + n(l.discount_amount);
        const lineDiscount = n(l.discount_amount);
        const lineNet      = n(l.total_price);
        c.totalAmount    += lineTotal;
        c.discountAmount += lineDiscount;
        c.netAmount      += lineNet;
        const hMap = headerNetMap.get(l.header_id);
        if (hMap && hMap.net > 0) {
          c.paidAmount += (lineNet / hMap.net) * hMap.paid;
        }
      }

      const byClassification = Array.from(classMap.values()).map(c => ({
        ...c,
        remaining: round2(c.netAmount - c.paidAmount),
        totalAmount: round2(c.totalAmount),
        discountAmount: round2(c.discountAmount),
        netAmount: round2(c.netAmount),
        paidAmount: round2(c.paidAmount),
      }));

      const invoices = headers.map(h => ({
        id: h.id,
        invoiceNumber: h.invoice_number,
        invoiceDate: h.invoice_date,
        status: h.status,
        departmentId: h.department_id,
        departmentName: h.department_name,
        admissionId: h.admission_id,
        visitGroupId: h.visit_group_id,
        isConsolidated: h.is_consolidated,
        isFinalClosed: h.is_final_closed ?? false,
        finalClosedAt: h.final_closed_at ?? null,
        finalClosedBy: h.final_closed_by ?? null,
        doctorName: h.doctor_name,
        contractName: h.contract_name,
        totalAmount: round2(n(h.total_amount)),
        discountAmount: round2(n(h.discount_amount) + n(h.header_discount_amount)),
        netAmount: round2(n(h.net_amount)),
        paidAmount: round2(n(h.paid_amount)),
        remaining: round2(n(h.net_amount) - n(h.paid_amount)),
        diagnosis: h.diagnosis ?? null,
      }));

      return res.json({
        totals: {
          totalAmount:   round2(totTotalAmount),
          discountAmount: round2(totDiscount),
          netAmount:     round2(totNet),
          paidAmount:    round2(totPaid),
          remaining:     round2(totNet - totPaid),
          invoiceCount:  headers.length,
          lineCount:     allLines.length,
          companyShareAmount:  hasContractSplit ? round2(totCompanyShare) : null,
          patientShareAmount:  hasContractSplit ? round2(totPatientShare) : null,
        },
        byVisit,
        byDepartment,
        byClassification,
        invoices,
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id/invoice-lines", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;

      const scope = await storage.getUserOperationalScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;
      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });
      }
      const inScope = await storage.checkPatientInScope(id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
      const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit ?? "50"), 10)));
      const lineTypeFilter   = req.query.lineType    ? String(req.query.lineType)    : null;
      const departmentFilter = req.query.department  ? String(req.query.department)  : null;
      const admissionFilter  = req.query.admissionId ? String(req.query.admissionId) : null;
      const visitFilter      = req.query.visitId     ? String(req.query.visitId)     : null;
      const offset = (page - 1) * limit;

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM patient_invoice_lines l
        JOIN patient_invoice_headers h ON h.id = l.header_id
        WHERE h.patient_id = ${id}
          AND h.status IN ('draft','finalized')
          AND COALESCE(l.is_void, false) = false
          ${lineTypeFilter   ? sql`AND l.line_type = ${lineTypeFilter}`          : sql``}
          ${departmentFilter ? sql`AND h.department_id = ${departmentFilter}`   : sql``}
          ${admissionFilter  ? sql`AND h.admission_id = ${admissionFilter}`     : sql``}
          ${visitFilter      ? sql`AND h.visit_id = ${visitFilter}`             : sql``}
      `);
      const total = (countResult as any).rows[0]?.total ?? 0;

      const rowsResult = await db.execute(sql`
        SELECT
          l.id, l.header_id, l.line_type, l.description,
          l.quantity, l.unit_price, l.discount_percent,
          l.discount_amount, l.total_price,
          l.source_type, l.source_id,
          l.business_classification,
          h.invoice_number, h.invoice_date, h.status AS invoice_status,
          h.admission_id, h.visit_group_id,
          COALESCE(d.name_ar,'—') AS department_name,
          h.department_id
        FROM patient_invoice_lines l
        JOIN patient_invoice_headers h ON h.id = l.header_id
        LEFT JOIN departments d ON d.id = h.department_id
        WHERE h.patient_id = ${id}
          AND h.status IN ('draft','finalized')
          AND COALESCE(l.is_void, false) = false
          ${lineTypeFilter   ? sql`AND l.line_type = ${lineTypeFilter}`          : sql``}
          ${departmentFilter ? sql`AND h.department_id = ${departmentFilter}`   : sql``}
          ${admissionFilter  ? sql`AND h.admission_id = ${admissionFilter}`     : sql``}
          ${visitFilter      ? sql`AND h.visit_id = ${visitFilter}`             : sql``}
        ORDER BY h.invoice_date DESC, h.id, l.id
        LIMIT ${limit} OFFSET ${offset}
      `);

      return res.json({
        data: (rowsResult as any).rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.get("/api/patients/:id/payments-list", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;

      const scope = await storage.getUserOperationalScope(req.session.userId!);
      const forcedDeptIds: string[] | null = scope.isFullAccess ? null : scope.allowedDepartmentIds;
      if (!scope.isFullAccess && scope.allowedDepartmentIds.length === 0) {
        return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });
      }
      const inScope = await storage.checkPatientInScope(id, forcedDeptIds);
      if (!inScope) return res.status(403).json({ message: "ليس لديك صلاحية عرض بيانات هذا المريض" });

      const admissionFilter = req.query.admissionId ? String(req.query.admissionId) : null;
      const visitFilter     = req.query.visitId     ? String(req.query.visitId)     : null;

      const result = await db.execute(sql`
        SELECT
          p.id, p.header_id, p.payment_date, p.amount,
          p.payment_method, p.reference_number, p.notes,
          p.treasury_id, p.created_at,
          COALESCE(t.name, '—') AS treasury_name,
          h.invoice_number, h.invoice_date,
          COALESCE(d.name_ar,'—') AS department_name
        FROM patient_invoice_payments p
        JOIN patient_invoice_headers h ON h.id = p.header_id
        LEFT JOIN treasuries   t ON t.id = p.treasury_id
        LEFT JOIN departments  d ON d.id = h.department_id
        WHERE h.patient_id = ${id}
          ${admissionFilter ? sql`AND h.admission_id = ${admissionFilter}` : sql``}
          ${visitFilter     ? sql`AND h.visit_id     = ${visitFilter}`     : sql``}
        ORDER BY p.payment_date DESC, p.created_at DESC
      `);
      return res.json((result as any).rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });

  app.post("/api/patient-visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_CREATE), async (req, res) => {
    try {
      const userId = (req.session as any)?.userId as string | undefined;
      const { patientId, visitType, requestedService, departmentId, notes } = req.body;
      if (!patientId?.trim()) return res.status(400).json({ message: "يجب تحديد المريض" });
      if (!["inpatient","outpatient"].includes(visitType)) return res.status(400).json({ message: "نوع الزيارة غير صحيح" });

      const cntRes = await db.execute(sql`SELECT COUNT(*) AS cnt FROM patient_visits`);
      const seq = parseInt((cntRes.rows[0] as Record<string,unknown>)?.cnt as string ?? "0") + 1;
      const visitNumber = `VIS-${String(seq).padStart(6,"0")}`;

      const row = await db.execute(sql`
        INSERT INTO patient_visits (id, visit_number, patient_id, visit_type, requested_service, department_id, status, notes, created_by, created_at, updated_at)
        VALUES (gen_random_uuid(), ${visitNumber}, ${patientId}, ${visitType}, ${requestedService || null}, ${departmentId || null}, 'open', ${notes || null}, ${userId || null}, NOW(), NOW())
        RETURNING *
      `);
      return res.status(201).json(row.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/patient-visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { date, visitType, status, deptId, search } = req.query as Record<string,string>;
      const today = date || new Date().toISOString().split("T")[0];

      const userId = (req.session as { userId?: string }).userId!;
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === "admin" || user?.role === "owner";

      let clinicDeptFilter = sql``;
      if (!isAdmin) {
        const clinicIds = await storage.getUserClinicIds(userId);
        if (clinicIds.length > 0) {
          const clinicDeptRows = await db.execute(sql`
            SELECT DISTINCT department_id FROM clinic_clinics
            WHERE id = ANY(ARRAY[${sql.join(clinicIds.map(id => sql`${id}`), sql`, `)}]::text[])
              AND department_id IS NOT NULL
          `);
          const deptIds = (clinicDeptRows.rows as Array<{ department_id: string }>).map(r => r.department_id);
          if (deptIds.length > 0) {
            clinicDeptFilter = sql`AND (pv.department_id IS NULL OR pv.department_id = ANY(ARRAY[${sql.join(deptIds.map(id => sql`${id}`), sql`, `)}]::text[]))`;
          } else {
            clinicDeptFilter = sql`AND pv.department_id IS NULL`;
          }
        }
      }

      const rows = await db.execute(sql`
        SELECT
          pv.*,
          p.full_name   AS patient_name,
          p.patient_code,
          p.phone       AS patient_phone,
          d.name_ar     AS department_name
        FROM patient_visits pv
        JOIN patients p ON p.id = pv.patient_id
        LEFT JOIN departments d ON d.id = pv.department_id
        WHERE DATE(pv.created_at) = ${today}::date
          ${clinicDeptFilter}
          ${visitType ? sql`AND pv.visit_type = ${visitType}` : sql``}
          ${status ? sql`AND pv.status = ${status}` : sql``}
          ${deptId ? sql`AND pv.department_id = ${deptId}` : sql``}
          ${search ? sql`AND (p.full_name ILIKE ${'%' + search + '%'} OR p.phone ILIKE ${'%' + search + '%'} OR p.patient_code ILIKE ${'%' + search + '%'})` : sql``}
        ORDER BY pv.created_at DESC
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/patients/:id/visits", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await db.execute(sql`
        SELECT pv.*,
          d.name_ar AS department_name,
          a.doctor_name,
          a.notes     AS admission_notes,
          a.admission_date,
          a.discharge_date,
          a.admission_number,
          a.patient_name AS admission_patient_name,
          a.created_at  AS admission_created_at,
          a.updated_at  AS admission_updated_at
        FROM patient_visits pv
        LEFT JOIN departments d ON d.id = pv.department_id
        LEFT JOIN admissions  a ON a.id = pv.admission_id
        WHERE pv.patient_id = ${id}
        ORDER BY pv.created_at DESC
        LIMIT 100
      `);
      return res.json(rows.rows);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch("/api/patient-visits/:id/status", requireAuth, checkPermission(PERMISSIONS.PATIENTS_VIEW), async (req, res) => {
    try {
      const { status } = req.body;
      if (!["open","in_progress","completed","cancelled"].includes(status)) {
        return res.status(400).json({ message: "حالة غير صحيحة" });
      }
      const row = await db.execute(sql`
        UPDATE patient_visits SET status = ${status}, updated_at = NOW()
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      if (!row.rows.length) return res.status(404).json({ message: "الزيارة غير موجودة" });
      return res.json(row.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/backfill-pharmacy-invoice-patients", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        WITH matched AS (
          SELECT
            sih.id   AS invoice_id,
            p.id     AS patient_id,
            COUNT(*) OVER (PARTITION BY sih.id) AS match_count
          FROM sales_invoice_headers sih
          JOIN patients p
            ON LOWER(TRIM(p.full_name)) = LOWER(TRIM(sih.customer_name))
           AND p.is_active = true
          WHERE sih.patient_id IS NULL
            AND sih.customer_name IS NOT NULL
            AND TRIM(sih.customer_name) <> ''
        )
        UPDATE sales_invoice_headers sih
        SET patient_id = m.patient_id,
            updated_at = NOW()
        FROM matched m
        WHERE sih.id = m.invoice_id
          AND m.match_count = 1
        RETURNING sih.id
      `);
      const updated = (result as any).rows?.length ?? 0;
      return res.json({ updated, message: `تم ربط ${updated} فاتورة بملف المريض بنجاح` });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: _em });
    }
  });
}
