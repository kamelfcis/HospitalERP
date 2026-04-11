import type { Express } from "express";
import { storage } from "../storage";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPatientFinancialSummaryAggregatedRoutes(app: Express) {

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
}
