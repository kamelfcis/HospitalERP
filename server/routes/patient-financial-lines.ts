import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPatientFinancialLinesRoutes(app: Express) {

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
}
