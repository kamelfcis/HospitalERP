/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoices — Finalize Routes
 *  POST /:id/finalize | POST /:id/final-close
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { runRefresh, REFRESH_KEYS } from "../lib/rpt-refresh-orchestrator";
import { sql, eq, inArray } from "drizzle-orm";
import { PERMISSIONS } from "@shared/permissions";
import { auditLog } from "../route-helpers";
import { requireAuth, checkPermission, broadcastToUnit } from "./_shared";
import {
  patientInvoiceHeaders,
  doctors,
  services,
  companies,
  treasuries,
} from "@shared/schema";
import { roundMoney, parseMoney } from "../finance-helpers";
import { generateClaimsForInvoice } from "../lib/contract-claim-generator";
import { assertInvoiceScopeGuard, ScopeViolationError } from "../lib/scope-guard";
import { auditItemPriceDeviations } from "../lib/patient-invoice-helpers";

export function registerFinalizeRoutes(app: Express) {

  // ══════════════════════════════════════════════════════════════════════════
  //  POST /:id/finalize — اعتماد فاتورة المريض + توليد القيد المحاسبي
  // ══════════════════════════════════════════════════════════════════════════
  app.post("/api/patient-invoices/:id/finalize", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { expectedVersion, oversellReason } = req.body || {};
      const invoiceId = req.params.id as string;

      const existing = await storage.getPatientInvoice(invoiceId);
      if (!existing) return res.status(404).json({ message: "فاتورة المريض غير موجودة" });

      if (existing.status === "finalized") {
        return res.json({ ...existing, _idempotent: true });
      }
      if (existing.status !== "draft") {
        return res.status(409).json({ message: "لا يمكن اعتماد فاتورة ملغاة", code: "INVALID_STATUS" });
      }

      // ── التحقق من حسابات الطبيب ───────────────────────────────────────────
      const existingLines = (existing as any).lines ?? [];
      const hasDoctorCostLines = existingLines.some((l: any) => l.lineType === "doctor_cost" && !l.isVoid);
      const validationBillingMode = (existing as any).billingMode || "hospital_collect";

      if (hasDoctorCostLines) {
        const orphanCostLines = existingLines.filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && !l.doctorId);
        if (orphanCostLines.length > 0) {
          return res.status(400).json({
            message: "يوجد سطور أجر طبيب بدون ربط بطبيب (doctor_id). يجب تحديد الطبيب أولاً.",
            code: "DOCTOR_COST_NO_DOCTOR",
          });
        }
      }

      // جلب بيانات الطبيب مرة واحدة — تُستخدم للتحقق والـ GL معاً
      let doctorData: { payableAccountId: string | null; receivableAccountId: string | null; financialMode: string | null; costCenterId: string | null } | null = null;
      if (existing.doctorId) {
        const [doc] = await db.select({
          payableAccountId:    doctors.payableAccountId,
          receivableAccountId: doctors.receivableAccountId,
          financialMode:       doctors.financialMode,
          costCenterId:        doctors.costCenterId,
        }).from(doctors).where(eq(doctors.id, existing.doctorId)).limit(1);
        doctorData = doc ?? null;

        if (validationBillingMode === "hospital_collect" && hasDoctorCostLines && !doctorData?.payableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل مستشفى بدون تحديد حساب الدائنين (مستحقات الطبيب). عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_PAYABLE",
          });
        }
        if (validationBillingMode === "doctor_collect" && !doctorData?.receivableAccountId) {
          return res.status(400).json({
            message: "لا يمكن اعتماد فاتورة تحصيل طبيب بدون تحديد حساب المدينين للطبيب. عدّل بيانات الطبيب أولاً.",
            code: "DOCTOR_NO_RECEIVABLE",
          });
        }
      }

      await storage.assertPeriodOpen(existing.invoiceDate);

      await assertInvoiceScopeGuard(
        req.session.userId as string,
        (existing as any).departmentId,
        (existing as any).warehouseId,
        "patient_invoice_finalize",
      );

      void auditItemPriceDeviations(
        (existing as any).lines ?? [],
        (existing as any).departmentId,
        (existing as any).warehouseId,
        invoiceId,
        req.session.userId,
      );

      const result = await storage.finalizePatientInvoice(
        invoiceId,
        expectedVersion != null ? Number(expectedVersion) : undefined,
        oversellReason ? String(oversellReason).trim() : undefined
      );

      storage.createAuditLog({
        tableName: "patient_invoice_headers",
        recordId: invoiceId,
        action: "finalize",
        oldValues: JSON.stringify({ status: "draft", version: existing.version }),
        newValues: JSON.stringify({ status: "finalized", version: result.version }),
      }).catch(err => logger.warn({ err: err.message, invoiceId }, "[Audit] patient invoice finalize"));

      // إعادة استخدام existing للبنود — لا داعي لجلب ثانٍ
      const invoiceLines = existing;
      if (invoiceLines) {
        const finalizedLines = invoiceLines.lines || [];
        const classificationsSummary = finalizedLines.reduce(
          (acc: Record<string, { count: number; totalEGP: number }>, l: any) => {
            const cls = l.businessClassification || "unclassified";
            if (!acc[cls]) acc[cls] = { count: 0, totalEGP: 0 };
            acc[cls].count++;
            acc[cls].totalEGP = parseFloat((acc[cls].totalEGP + parseFloat(String(l.totalPrice || "0"))).toFixed(2));
            return acc;
          },
          {},
        );
        const finalizedBy = (req.session as any)?.userId ?? null;

        logger.info({
          invoiceId,
          invoiceNumber:         result.invoiceNumber,
          patientName:           result.patientName,
          totalAmount:           result.totalAmount,
          netAmount:             result.netAmount,
          lineCount:             finalizedLines.length,
          finalizedBy,
          classificationsSummary,
        }, "INVOICE_FINALIZED");

        // حفظ snapshot في DB
        const snapshotPayload = {
          invoiceId,
          invoiceNumber:  result.invoiceNumber,
          patientName:    result.patientName,
          invoiceDate:    result.invoiceDate,
          finalizedAt:    new Date().toISOString(),
          finalizedBy,
          totalAmount:    result.totalAmount,
          netAmount:      result.netAmount,
          paidAmount:     result.paidAmount,
          lineCount:      finalizedLines.length,
          classificationsSummary,
          lineTotals: finalizedLines.map((l: any) => ({
            lineType:               l.lineType,
            businessClassification: l.businessClassification,
            description:            l.description,
            quantity:               l.quantity,
            unitPrice:              l.unitPrice,
            totalPrice:             l.totalPrice,
          })),
        };
        db.update(patientInvoiceHeaders)
          .set({ finalizedSnapshotJson: JSON.stringify(snapshotPayload), updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId))
          .catch((err: any) => logger.warn({ err: err.message, invoiceId }, "[Snapshot] failed to save finalized snapshot to DB"));

        const glLines: { lineType: string; amount: string; costCenterId?: string | null; debitAccountId?: string | null }[] =
          storage.buildPatientInvoiceGLLines(result, invoiceLines.lines || []);

        const dynamicAccountOverrides: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }> = {};
        const invBillingMode = (result as any).billingMode || "hospital_collect";

        if (result.doctorId) {
          const doc = doctorData;

          if (invBillingMode === "doctor_collect") {
            if (doc?.receivableAccountId) {
              const paymentType = (result as any).patientType === "cash" ? "cash" : "receivables";
              dynamicAccountOverrides[paymentType] = { debitAccountId: doc.receivableAccountId };
            }
          } else {
            if (doc?.payableAccountId) {
              dynamicAccountOverrides["doctor_cost"] = { creditAccountId: doc.payableAccountId };
            }
          }

          const doctorCostCenterId = doc?.costCenterId || null;
          let fallbackCostCenterId: string | null = null;
          if (!doctorCostCenterId) {
            const costLines = (invoiceLines.lines || []).filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && l.serviceId);
            const svcIds = [...new Set(costLines.map((l: any) => l.serviceId))].filter(Boolean) as string[];
            if (svcIds.length > 0) {
              const svcRows = await db.select({ costCenterId: services.costCenterId }).from(services).where(inArray(services.id, svcIds));
              fallbackCostCenterId = svcRows.find(s => s.costCenterId)?.costCenterId || null;
            }
          }
          const effectiveCostCenterId = doctorCostCenterId || fallbackCostCenterId;
          if (effectiveCostCenterId) {
            for (const gl of glLines) {
              if (gl.lineType === "doctor_cost") gl.costCenterId = effectiveCostCenterId;
            }
          }
        }

        // Treasury GL resolution for cash patients
        if ((result as any).patientType === "cash") {
          const treasuryPayments = await db.execute(sql`
            SELECT t.gl_account_id, SUM(p.amount::numeric) AS total_amount
            FROM patient_invoice_payments p
            JOIN treasuries t ON t.id = p.treasury_id
            WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL
            GROUP BY t.gl_account_id
          `);
          const treasuryRows = treasuryPayments.rows as { gl_account_id: string; total_amount: string }[];
          if (treasuryRows.length > 0) {
            const cashIdx = glLines.findIndex(l => l.lineType === "cash");
            if (cashIdx >= 0) glLines.splice(cashIdx, 1);
            let treasuryTotal = 0;
            for (const tr of treasuryRows) {
              const amt = parseFloat(tr.total_amount);
              if (amt > 0) {
                glLines.unshift({ lineType: "cash", amount: roundMoney(amt), debitAccountId: tr.gl_account_id });
                treasuryTotal += amt;
              }
            }
            const totalNet = parseMoney(result.netAmount);
            const remainder = totalNet - treasuryTotal;
            if (remainder > 0.01) glLines.unshift({ lineType: "cash", amount: roundMoney(remainder) });
          }
        }

        // Company GL resolution for contract patients
        if ((result as any).companyId && (result as any).patientType !== "cash") {
          const [comp] = await db.select({ glAccountId: companies.glAccountId })
            .from(companies).where(eq(companies.id, (result as any).companyId)).limit(1);
          if (comp?.glAccountId) {
            dynamicAccountOverrides["receivables"] = { debitAccountId: comp.glAccountId };
          }
        }

        await db.update(patientInvoiceHeaders).set({ journalStatus: "pending", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
        await logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "pending" });

        storage.generatePatientInvoiceJournal({
          sourceDocumentId: invoiceId,
          reference:        `PI-${result.invoiceNumber}`,
          description:      `قيد فاتورة مريض رقم ${result.invoiceNumber} - ${result.patientName}`,
          entryDate:        result.invoiceDate,
          lines:            glLines,
          departmentId:     (existing as any).departmentId || null,
          ...(Object.keys(dynamicAccountOverrides).length > 0 ? { dynamicAccountOverrides } : {}),
        }).then(async (entry) => {
          if (entry) {
            await db.update(patientInvoiceHeaders).set({ journalStatus: "posted", journalError: null, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
            logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
          } else {
            await db.update(patientInvoiceHeaders).set({ journalStatus: "needs_retry", journalError: "ربط الحسابات غير مكتمل — راجع /account-mappings", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
          }
        }).catch(async (err: any) => {
          logger.warn({ err: err.message, invoiceId }, "[GL] patient invoice finalize — journal failed");
          await db.update(patientInvoiceHeaders).set({ journalStatus: "failed", journalError: err.message, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
          logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "failed", errorMessage: err.message }).catch(() => {});
        });
      } else {
        await db.update(patientInvoiceHeaders).set({ journalStatus: "failed", journalError: "بيانات الفاتورة غير متاحة لبناء القيد", updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, invoiceId));
        logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId, eventType: "patient_invoice_journal", status: "blocked", errorMessage: "بيانات الفاتورة غير متاحة لبناء القيد" }).catch(() => {});
      }

      storage.createTreasuryTransactionsForInvoice(invoiceId, result.finalizedAt
        ? new Date(result.finalizedAt).toISOString().split("T")[0]
        : result.invoiceDate
      ).catch(err => logger.warn({ err: err.message, invoiceId }, "[Treasury] patient invoice finalize"));

      if (existing.departmentId) {
        broadcastToUnit(existing.departmentId, "invoice_finalized", {
          id:           result.id,
          invoiceNumber: result.invoiceNumber,
          netTotal:     result.netAmount,
          isReturn:     false,
          departmentId: existing.departmentId,
          type:         "patient_invoice",
        });
      }

      const hasContract = !!(result as any).companyId || !!(result as any).contractId;
      if (hasContract) {
        await db.update(patientInvoiceHeaders)
          .set({ claimStatus: "generating", updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId))
          .catch(() => {});
      }
      generateClaimsForInvoice(invoiceId)
        .catch(err => logger.warn({ err: err.message, invoiceId }, "[Claims] fire-and-forget outer catch"));

      runRefresh(REFRESH_KEYS.PATIENT_VISIT, () => storage.refreshPatientVisitSummary(), "event-driven").catch(() => {});
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ScopeViolationError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg?.includes("الفترة المحاسبية")) return res.status(403).json({ message: msg });
      if (msg?.includes("مسودة") || msg?.includes("تم تعديل الفاتورة")) return res.status(409).json({ message: msg });
      res.status(500).json({ message: msg });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  POST /:id/final-close — الإغلاق النهائي للفاتورة
  // ══════════════════════════════════════════════════════════════════════════
  app.post("/api/patient-invoices/:id/final-close", requireAuth, checkPermission(PERMISSIONS.PATIENT_INVOICES_FINALIZE), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any)?.userId as string | undefined;

      const invRes = await db.execute(sql`
        SELECT id, status, is_consolidated, admission_id, net_amount, paid_amount, is_final_closed,
               patient_type, contract_id, company_id
        FROM patient_invoice_headers WHERE id = ${id}
      `);
      const inv = invRes.rows[0] as Record<string,unknown> | undefined;
      if (!inv) return res.status(404).json({ message: "الفاتورة غير موجودة" });
      if (inv.is_final_closed) return res.status(409).json({ message: "الفاتورة مغلقة نهائياً بالفعل" });
      if (inv.status === "cancelled") return res.status(409).json({ message: "لا يمكن إغلاق فاتورة ملغاة" });
      if (inv.status !== "finalized") return res.status(409).json({ message: "يجب اعتماد الفاتورة أولاً قبل الإغلاق النهائي" });

      const netAmount  = parseFloat(String(inv.net_amount  || 0));
      const paidAmount = parseFloat(String(inv.paid_amount || 0));
      const isContractPatient = !!(inv.contract_id || inv.company_id);

      if (isContractPatient) {
        const claimRes = await db.execute(sql`
          SELECT COALESCE(SUM(company_share_amount::numeric), 0)::text AS total_company_share
          FROM contract_claim_lines
          WHERE invoice_header_id = ${id}
        `);
        const claimCompanyShare = parseFloat(String((claimRes.rows[0] as Record<string,unknown>)?.total_company_share || "0"));

        let coveredAmount: number;

        if (claimCompanyShare > 0.01) {
          coveredAmount = paidAmount + claimCompanyShare;
        } else {
          const lineShareRes = await db.execute(sql`
            SELECT
              COALESCE(SUM(company_share_amount::numeric), 0)::text AS line_company_share,
              COALESCE(SUM(patient_share_amount::numeric), 0)::text AS line_patient_share,
              COALESCE(SUM(CASE WHEN company_share_amount IS NULL AND patient_share_amount IS NULL
                                THEN total_price::numeric ELSE 0 END), 0)::text AS unassigned_amount
            FROM patient_invoice_lines
            WHERE header_id = ${id} AND COALESCE(is_void, false) = false
          `);
          const lineCompanyShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_company_share  || "0"));
          const linePatientShare  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.line_patient_share  || "0"));
          const unassignedAmount  = parseFloat(String((lineShareRes.rows[0] as Record<string,unknown>)?.unassigned_amount   || "0"));

          if (lineCompanyShare > 0.01 || linePatientShare > 0.01) {
            coveredAmount = paidAmount + lineCompanyShare + unassignedAmount;
          } else {
            coveredAmount = netAmount;
          }
        }

        if (coveredAmount < netAmount - 0.01) {
          const companyPortion = coveredAmount - paidAmount;
          const remaining = netAmount - coveredAmount;
          return res.status(409).json({
            message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي ${remaining.toFixed(2)} ج.م غير مغطى (المدفوع من المريض: ${paidAmount.toFixed(2)} + نصيب الشركة: ${companyPortion.toFixed(2)} من أصل ${netAmount.toFixed(2)})`,
          });
        }
      } else {
        const outstanding = netAmount - paidAmount;
        if (outstanding > 0.01) {
          return res.status(409).json({ message: `لا يمكن الإغلاق النهائي — يوجد رصيد متبقي: ${outstanding.toFixed(2)} ج.م` });
        }
      }

      if (inv.admission_id) {
        const draftRes = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM patient_invoice_headers
          WHERE admission_id = ${inv.admission_id as string}
            AND id != ${id}
            AND status = 'draft'
            AND is_consolidated = false
        `);
        const draftCount = parseInt(String((draftRes.rows[0] as Record<string,unknown>)?.cnt ?? "0"));
        if (draftCount > 0) {
          return res.status(409).json({ message: `يوجد ${draftCount} فاتورة/فواتير في حالة مسودة مرتبطة بهذه الإقامة — يرجى إنهاؤها أولاً` });
        }
      }

      await db.execute(sql`
        UPDATE patient_invoice_headers
        SET is_final_closed = true, final_closed_at = NOW(), final_closed_by = ${userId || null}, updated_at = NOW()
        WHERE id = ${id}
      `);

      Promise.resolve().then(() => {
        auditLog({
          tableName: "patient_invoice_headers",
          recordId: id,
          action: "final_close",
          userId,
          newValues: { isFinalClosed: true, closedAt: new Date().toISOString() },
        }).catch(() => {});
      });

      return res.json({ success: true, message: "تم الإغلاق النهائي للفاتورة بنجاح" });
    } catch (err) {
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
}
