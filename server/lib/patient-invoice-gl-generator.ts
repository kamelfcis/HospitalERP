/**
 * مولّد قيد فاتورة مريض — دالة مركزية مشتركة بين:
 *   • مسار الاعتماد  (finalize route)
 *   • مسار إعادة المحاولة (retry endpoint)
 *   • مسار إعادة التوليد القسري (force-regen endpoint)
 */
import { db } from "../db";
import { eq, sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { roundMoney, parseMoney } from "../finance-helpers";
import { logAcctEvent } from "./accounting-event-logger";
import { doctors, services, companies, journalEntries, journalLines } from "@shared/schema";
import type { JournalEntry } from "@shared/schema";

export type GLGenResult =
  | { ok: true;  entry: JournalEntry }
  | { ok: false; reason: string };

/**
 * يبني ويُولِّد قيد GL لفاتورة مريض معتمدة.
 * @param invoiceId  معرّف رأس الفاتورة
 * @param forceRegen إذا true: يحذف القيد القديم ويُولِّد جديداً بالحسابات الحالية
 */
export async function generatePatientInvoiceGL(
  invoiceId: string,
  forceRegen = false,
): Promise<GLGenResult> {
  const invoiceData = await storage.getPatientInvoice(invoiceId);
  if (!invoiceData) return { ok: false, reason: "بيانات الفاتورة غير موجودة" };
  if (invoiceData.status !== "finalized")
    return { ok: false, reason: "الفاتورة لم تُعتمد بعد — القيد يُنشأ عند الاعتماد فقط" };

  // ─── حذف القيد القديم عند الإعادة القسرية ────────────────────────────────
  if (forceRegen) {
    const existingRows = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.sourceDocumentId, invoiceId))
      .limit(1);
    if (existingRows.length > 0) {
      const oldId = existingRows[0].id;
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, oldId));
      await db.delete(journalEntries).where(eq(journalEntries.id, oldId));
    }
    await db.execute(sql`
      UPDATE patient_invoice_headers SET journal_status='pending', journal_error=NULL, updated_at=NOW()
      WHERE id=${invoiceId}
    `);
  }

  // ─── بناء السطور الأساسية ─────────────────────────────────────────────────
  const glLines: {
    lineType: string; amount: string;
    costCenterId?: string | null; debitAccountId?: string | null;
  }[] = storage.buildPatientInvoiceGLLines(invoiceData, (invoiceData as any).lines || []);

  const dynamicOverrides: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }> = {};
  const billingMode = (invoiceData as any).billingMode || "hospital_collect";

  // ─── تكلفة طبيب واتجاه التحصيل ────────────────────────────────────────────
  if (invoiceData.doctorId) {
    const [doc] = await db.select({
      payableAccountId:    doctors.payableAccountId,
      receivableAccountId: doctors.receivableAccountId,
      costCenterId:        doctors.costCenterId,
    }).from(doctors).where(eq(doctors.id, invoiceData.doctorId)).limit(1);

    if (billingMode === "doctor_collect") {
      if (doc?.receivableAccountId) {
        const payType = (invoiceData as any).patientType === "cash" ? "cash" : "receivables";
        dynamicOverrides[payType] = { debitAccountId: doc.receivableAccountId };
      }
    } else if (doc?.payableAccountId) {
      dynamicOverrides["doctor_cost"] = { creditAccountId: doc.payableAccountId };
    }

    let effectiveCC = doc?.costCenterId || null;
    if (!effectiveCC) {
      const costLines = ((invoiceData as any).lines || [])
        .filter((l: any) => l.lineType === "doctor_cost" && !l.isVoid && l.serviceId);
      const svcIds = [...new Set(costLines.map((l: any) => l.serviceId))].filter(Boolean) as string[];
      if (svcIds.length > 0) {
        const svcRows = await db.select({ costCenterId: services.costCenterId })
          .from(services).where(inArray(services.id, svcIds));
        effectiveCC = svcRows.find(s => s.costCenterId)?.costCenterId || null;
      }
    }
    if (effectiveCC) {
      for (const gl of glLines) { if (gl.lineType === "doctor_cost") gl.costCenterId = effectiveCC; }
    }
  }

  // ─── تقسيم خزائن GL (نقدي: cash | تعاقد: cash-نصيبة + receivables-شركة) ──
  const patType = (invoiceData as any).patientType as string;
  const primaryType = patType === "cash" ? "cash" : "receivables";
  const tRes = await db.execute(sql`
    SELECT t.gl_account_id, SUM(p.amount::numeric) AS total_amount
    FROM patient_invoice_payments p JOIN treasuries t ON t.id = p.treasury_id
    WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL GROUP BY t.gl_account_id
  `);
  const tRows = tRes.rows as { gl_account_id: string | null; total_amount: string }[];
  if (tRows.length > 0) {
    const pIdx = glLines.findIndex(l => l.lineType === primaryType);
    if (pIdx >= 0) glLines.splice(pIdx, 1);
    let tTotal = 0;
    for (const tr of tRows) {
      const amt = parseFloat(tr.total_amount);
      if (amt > 0) {
        const gl: { lineType: string; amount: string; debitAccountId?: string | null } =
          { lineType: "cash", amount: roundMoney(amt) };
        if (tr.gl_account_id) gl.debitAccountId = tr.gl_account_id;
        glLines.unshift(gl); tTotal += amt;
      }
    }
    const rem = parseMoney((invoiceData as any).netAmount) - tTotal;
    if (rem > 0.01) glLines.unshift({ lineType: primaryType, amount: roundMoney(rem) });
  }

  // ─── حساب الشركة للتعاقد ────────────────────────────────────────────────────
  if ((invoiceData as any).companyId && patType !== "cash") {
    const [comp] = await db.select({ glAccountId: companies.glAccountId })
      .from(companies).where(eq(companies.id, (invoiceData as any).companyId)).limit(1);
    if (comp?.glAccountId) dynamicOverrides["receivables"] = { debitAccountId: comp.glAccountId };
  }

  // ─── توليد القيد ─────────────────────────────────────────────────────────────
  await logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId,
    eventType: "patient_invoice_journal", status: "pending" }).catch(() => {});

  try {
    const entry = await storage.generatePatientInvoiceJournal({
      sourceDocumentId: invoiceId,
      reference:        `PI-${(invoiceData as any).invoiceNumber}`,
      description:      `قيد فاتورة مريض رقم ${(invoiceData as any).invoiceNumber} - ${(invoiceData as any).patientName}`,
      entryDate:        (invoiceData as any).invoiceDate,
      lines:            glLines,
      departmentId:     (invoiceData as any).departmentId || null,
      ...(Object.keys(dynamicOverrides).length > 0 ? { dynamicAccountOverrides: dynamicOverrides } : {}),
    });

    if (entry) {
      await db.execute(sql`
        UPDATE patient_invoice_headers SET journal_status='posted', journal_error=NULL, updated_at=NOW()
        WHERE id=${invoiceId}
      `);
      await logAcctEvent({ sourceType: "patient_invoice", sourceId: invoiceId,
        eventType: "patient_invoice_journal", status: "completed", journalEntryId: entry.id }).catch(() => {});
      return { ok: true, entry };
    }
    await db.execute(sql`
      UPDATE patient_invoice_headers
      SET journal_status='needs_retry', journal_error='ربط الحسابات غير مكتمل — راجع /account-mappings', updated_at=NOW()
      WHERE id=${invoiceId}
    `);
    return { ok: false, reason: "لم يُنشأ قيد — ربط الحسابات غير مكتمل" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.execute(sql`
      UPDATE patient_invoice_headers SET journal_status='failed', journal_error=${msg}, updated_at=NOW()
      WHERE id=${invoiceId}
    `);
    return { ok: false, reason: msg };
  }
}
