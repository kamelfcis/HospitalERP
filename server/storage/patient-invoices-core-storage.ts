/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Patient Invoices Core Storage — عمليات فواتير المرضى الأساسية
 * ═══════════════════════════════════════════════════════════════════════════════
 *  - الأرقام التسلسلية (Next Numbers)
 *  - قائمة وتفاصيل الفواتير (List / Get)
 *  - إنشاء / تعديل / إنهاء / حذف (Create / Update / Finalize / Delete)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import { convertQtyToMinor } from "../inventory-helpers";
import {
  services,
  departments,
  items,
  patients,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  pendingStockAllocations,
  auditLog,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  PatientInvoiceWithDetails,
  InsertPatientInvoiceHeader,
  InsertPatientInvoiceLine,
  InsertPatientInvoicePayment,
  PatientInvoiceLine,
  PatientInvoicePayment,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {

  async getNextPatientInvoiceNumber(this: DatabaseStorage): Promise<number> {
    const result = await db.select({ max: sql<string>`COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)` }).from(patientInvoiceHeaders);
    return (parseInt(result[0]?.max || "0") || 0) + 1;
  },

  async getNextPaymentRefNumber(this: DatabaseStorage, offset: number = 0): Promise<string> {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
      FROM patient_invoice_payments
      WHERE reference_number LIKE 'RCP-%'
    `);
    const maxNum = parseInt(((result.rows[0] as Record<string, unknown>).max_num as string | null | undefined) || "0") || 0;
    return `RCP-${String(maxNum + 1 + offset).padStart(6, "0")}`;
  },

  async getPatientInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: PatientInvoiceWithDetails[]; total: number}> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(patientInvoiceHeaders.status, filters.status as "draft" | "finalized" | "cancelled"));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${patientInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(gte(patientInvoiceHeaders.invoiceDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(patientInvoiceHeaders.invoiceDate, filters.dateTo));
    if (filters.patientName) conditions.push(ilike(patientInvoiceHeaders.patientName, `%${filters.patientName}%`));
    if (filters.doctorName) conditions.push(ilike(patientInvoiceHeaders.doctorName, `%${filters.doctorName}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(patientInvoiceHeaders).where(where);
    const total = Number(countResult?.count || 0);

    const data = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(where)
      .orderBy(desc(patientInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: data.map(r => ({ ...r.header, department: r.department })) as unknown as PatientInvoiceWithDetails[],
      total,
    };
  },

  async getPatientInvoice(this: DatabaseStorage, id: string): Promise<PatientInvoiceWithDetails | undefined> {
    const [headerRow] = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
      patientCode: patients.patientCode,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .leftJoin(patients, eq(patientInvoiceHeaders.patientId, patients.id))
      .where(eq(patientInvoiceHeaders.id, id));

    if (!headerRow) return undefined;

    const lines = await db.select({
      line: patientInvoiceLines,
      service: services,
      item: items,
    })
      .from(patientInvoiceLines)
      .leftJoin(services, eq(patientInvoiceLines.serviceId, services.id))
      .leftJoin(items, eq(patientInvoiceLines.itemId, items.id))
      .where(eq(patientInvoiceLines.headerId, id))
      .orderBy(asc(patientInvoiceLines.sortOrder));

    const payments = await db.select()
      .from(patientInvoicePayments)
      .where(eq(patientInvoicePayments.headerId, id))
      .orderBy(asc(patientInvoicePayments.createdAt));

    // جلب سياق موعد OPD المرتبط بالفاتورة (إن وُجد)
    const aptCtxRes = await db.execute(sql`
      SELECT
        ca.id          AS opd_appointment_id,
        ca.status      AS opd_apt_status,
        ca.payment_type AS opd_payment_type,
        cl.name_ar     AS opd_clinic_name,
        dr.name        AS opd_doctor_name,
        dp.name_ar     AS opd_department_name
      FROM clinic_appointments ca
      LEFT JOIN clinic_clinics cl ON cl.id = ca.clinic_id
      LEFT JOIN doctors        dr ON dr.id = ca.doctor_id
      LEFT JOIN departments    dp ON dp.id = cl.department_id
      WHERE ca.invoice_id = ${id}
      LIMIT 1
    `);
    const aptRow = (aptCtxRes.rows as Array<Record<string, unknown>>)[0] ?? null;

    return {
      ...headerRow.header,
      patientCode: headerRow.patientCode || null,
      department: headerRow.department || undefined,
      lines: lines.map(l => ({ ...l.line, service: l.service || undefined, item: l.item || undefined })),
      payments,
      opdContext: aptRow ? {
        appointmentId:  String(aptRow.opd_appointment_id),
        aptStatus:      String(aptRow.opd_apt_status   ?? ""),
        paymentType:    String(aptRow.opd_payment_type  ?? ""),
        clinicName:     aptRow.opd_clinic_name     ? String(aptRow.opd_clinic_name)     : null,
        doctorName:     aptRow.opd_doctor_name     ? String(aptRow.opd_doctor_name)     : null,
        departmentName: aptRow.opd_department_name ? String(aptRow.opd_department_name) : null,
      } : null,
    };
  },

  async createPatientInvoice(this: DatabaseStorage, header: Partial<InsertPatientInvoiceHeader>, lines: Partial<InsertPatientInvoiceLine>[], payments: Partial<InsertPatientInvoicePayment>[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(patientInvoiceHeaders).values({ ...header, version: 1 } as InsertPatientInvoiceHeader).returning();

      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l, i) => ({ ...l, headerId: created.id, sortOrder: i }) as unknown as import("@shared/schema").InsertPatientInvoiceLine)
        );
      }

      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p) => ({ ...p, headerId: created.id }) as unknown as import("@shared/schema").InsertPatientInvoicePayment));
      }

      const totals = this.computeInvoiceTotals(lines as unknown as Record<string, unknown>[], payments as unknown as Record<string, unknown>[]);
      await tx.update(patientInvoiceHeaders).set(totals).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  },

  async updatePatientInvoice(this: DatabaseStorage, id: string, header: Partial<InsertPatientInvoiceHeader>, lines: Partial<InsertPatientInvoiceLine>[], payments: Partial<InsertPatientInvoicePayment>[], expectedVersion?: number): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as Record<string, unknown>;
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      if (expectedVersion != null && existing.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const newVersion = ((existing.version as number | null | undefined) || 1) + 1;

      const oldLines = await tx.select().from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.headerId, id));

      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, id));
      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l, i) => ({ ...l, headerId: id, sortOrder: i }) as unknown as import("@shared/schema").InsertPatientInvoiceLine));
      }

      await tx.delete(patientInvoicePayments).where(eq(patientInvoicePayments.headerId, id));
      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p) => ({ ...p, headerId: id }) as unknown as import("@shared/schema").InsertPatientInvoicePayment));
      }

      const totals = this.computeInvoiceTotals(lines as unknown as Record<string, unknown>[], payments as unknown as Record<string, unknown>[]);
      const existingHeaderDiscount = parseMoney((existing as Record<string, unknown>).header_discount_amount as string | null | undefined ?? "0");
      const adjustedNetAmount = roundMoney(parseMoney(totals.netAmount) - existingHeaderDiscount);
      await tx.update(patientInvoiceHeaders).set({
        ...header,
        ...totals,
        netAmount: adjustedNetAmount,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(patientInvoiceHeaders.id, id));

      const oldStayLines = oldLines.filter((l) => l.sourceType === "STAY_ENGINE");
      const newStayLines = lines.filter((l) => l.sourceType === "STAY_ENGINE");
      for (const ns of newStayLines) {
        const match = oldStayLines.find((os) => os.sourceId === ns.sourceId);
        if (match && (String(match.quantity) !== String(ns.quantity) || String(match.unitPrice) !== String(ns.unitPrice) || String(match.totalPrice) !== String(ns.totalPrice))) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_edit",
            oldValues: JSON.stringify({ sourceId: match.sourceId, quantity: match.quantity, unitPrice: match.unitPrice, totalPrice: match.totalPrice }),
            newValues: JSON.stringify({ sourceId: ns.sourceId, quantity: ns.quantity, unitPrice: ns.unitPrice, totalPrice: ns.totalPrice }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${ns.sourceId} qty ${match.quantity} → ${ns.quantity}`);
        }
      }
      for (const os of oldStayLines) {
        if (!newStayLines.find((ns) => ns.sourceId === os.sourceId)) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_void",
            oldValues: JSON.stringify({ sourceId: os.sourceId, quantity: os.quantity, totalPrice: os.totalPrice }),
            newValues: JSON.stringify({ removed: true }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${os.sourceId} REMOVED`);
        }
      }

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      return result;
    });
  },

  async finalizePatientInvoice(this: DatabaseStorage, id: string, expectedVersion?: number, oversellReason?: string): Promise<PatientInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as Record<string, unknown>;
      if (!locked) throw new Error("فاتورة المريض غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");

      if (expectedVersion != null && locked.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const dbLines = await tx.select().from(patientInvoiceLines)
        .where(and(eq(patientInvoiceLines.headerId, id), eq(patientInvoiceLines.isVoid, false)));
      const dbPayments = await tx.select().from(patientInvoicePayments)
        .where(eq(patientInvoicePayments.headerId, id));

      const warehouseId = locked.warehouse_id as string | null;
      if (warehouseId) {
        const inventoryLineTypes = new Set(["drug", "consumable"]);
        const invLines = dbLines.filter(l => inventoryLineTypes.has(l.lineType) && l.itemId);

        if (invLines.length > 0) {
          const invItemIds = Array.from(new Set(invLines.map(l => l.itemId!)));
          const invItemRows = await tx.execute(
            sql`SELECT id, name_ar, has_expiry, allow_oversell, major_to_medium, major_to_minor, medium_to_minor FROM items WHERE id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})`
          );
          const invItemMap: Record<string, any> = {};
          for (const row of invItemRows.rows as Array<Record<string, unknown>>) invItemMap[row.id as string] = row;

          // ── Check feature flag for deferred cost issue ──────────────────
          const flagRes = await tx.execute(
            sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`
          );
          const deferredEnabled = (flagRes.rows?.[0] as any)?.value === 'true';

          // ── Check current stock availability for oversell detection ──────
          const stockBalanceRes = await tx.execute(
            sql`SELECT item_id, SUM(qty_in_minor::numeric) as avail
                FROM inventory_lots
                WHERE item_id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                GROUP BY item_id`
          );
          const stockBalanceMap: Record<string, number> = {};
          for (const row of stockBalanceRes.rows as any[]) {
            stockBalanceMap[row.item_id as string] = parseFloat(row.avail ?? "0");
          }
          // Track per-item running total as we process lines (FIFO claim)
          const itemClaimedMap: Record<string, number> = {};

          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();

          const stockLines: Array<{
            lineIdx: number; itemId: string; qtyMinor: number;
            hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
          }> = [];

          // Pending lines to be created in pending_stock_allocations after stock deduction
          const oversellLines: Array<{
            lineId: string; itemId: string; qtyMinorPending: number;
            qtyMinorAvailableAtFinalize: number;
          }> = [];

          for (let li = 0; li < invLines.length; li++) {
            const line = invLines[li];
            const item = invItemMap[line.itemId!];
            if (!item) continue;

            if (item.has_expiry && line.expiryMonth && line.expiryYear) {
              if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
                throw new Error(`الصنف "${item.name_ar}" - لا يمكن صرف دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
              }
            }

            const qty = parseFloat(line.quantity);
            const unitLevel = line.unitLevel || "minor";
            const qtyMinor = convertQtyToMinor(qty, unitLevel, {
              nameAr: String(item.name_ar ?? ''),
              majorToMedium: item.major_to_medium != null ? String(item.major_to_medium) : null,
              majorToMinor: item.major_to_minor != null ? String(item.major_to_minor) : null,
              mediumToMinor: item.medium_to_minor != null ? String(item.medium_to_minor) : null,
            });

            // ── Oversell detection ────────────────────────────────────────
            const totalAvail = stockBalanceMap[line.itemId!] ?? 0;
            const alreadyClaimed = itemClaimedMap[line.itemId!] ?? 0;
            const netAvail = totalAvail - alreadyClaimed;

            if (deferredEnabled && item.allow_oversell === true && netAvail < qtyMinor - 0.00005) {
              // Oversell allowed: record as pending, skip from stock allocation
              const availableForThisLine = Math.max(0, netAvail);
              itemClaimedMap[line.itemId!] = alreadyClaimed + availableForThisLine;

              oversellLines.push({
                lineId: line.id,
                itemId: line.itemId!,
                qtyMinorPending: qtyMinor - availableForThisLine,
                qtyMinorAvailableAtFinalize: totalAvail,
              });

              if (availableForThisLine > 0.00005) {
                // Partially allocate the available portion
                stockLines.push({
                  lineIdx: li,
                  itemId: line.itemId!,
                  qtyMinor: availableForThisLine,
                  hasExpiry: !!item.has_expiry,
                  expiryMonth: line.expiryMonth,
                  expiryYear: line.expiryYear,
                });
              }

              // Mark line as pending_cost + cost_status = 'pending'
              await tx.execute(
                sql`UPDATE patient_invoice_lines
                    SET stock_issue_status = 'pending_cost',
                        cost_status        = 'pending',
                        oversell_reason    = ${(line as any).oversellReason ?? null}
                    WHERE id = ${line.id}`
              );
            } else {
              // Normal: enough stock (or oversell not allowed → allocateStockInTx will throw if insufficient)
              itemClaimedMap[line.itemId!] = alreadyClaimed + qtyMinor;
              stockLines.push({
                lineIdx: li,
                itemId: line.itemId!,
                qtyMinor,
                hasExpiry: !!item.has_expiry,
                expiryMonth: line.expiryMonth,
                expiryYear: line.expiryYear,
              });
            }
          }

          if (stockLines.length > 0) {
            await this.allocateStockInTx(tx, {
              operationType: "patient_finalize",
              referenceType: "patient_invoice",
              referenceId: id,
              warehouseId,
              lines: stockLines,
            });
          }

          // ── Create pending_stock_allocations for oversell lines ──────────
          if (oversellLines.length > 0) {
            // Validate: oversellReason is mandatory when deferred lines are created
            if (!oversellReason || oversellReason.trim() === "") {
              throw new Error("سبب الصرف بدون رصيد (oversellReason) إجباري عند وجود بنود مؤجلة التكلفة");
            }
            const userId = (locked.created_by as string) ?? null;
            for (const ol of oversellLines) {
              await tx.insert(pendingStockAllocations).values({
                invoiceId: id,
                invoiceLineId: ol.lineId,
                itemId: ol.itemId,
                warehouseId,
                qtyMinorPending: String(ol.qtyMinorPending),
                qtyMinorOriginal: String(ol.qtyMinorPending),
                status: "pending",
                reason: oversellReason.trim(),
                qtyMinorAvailableAtFinalize: String(ol.qtyMinorAvailableAtFinalize),
                createdBy: userId,
              }).onConflictDoUpdate({
                target: pendingStockAllocations.invoiceLineId,
                set: {
                  qtyMinorPending: String(ol.qtyMinorPending),
                  status: "pending",
                  updatedAt: new Date(),
                },
              });
            }
            console.log(JSON.stringify({
              event:     "OVERSELL_DEFERRED",
              timestamp: new Date().toISOString(),
              source:    "patient_invoice_finalize",
              invoiceId: id,
              userId,
              reason:    oversellReason,
              lineCount: oversellLines.length,
              lines: oversellLines.map(ol => ({
                itemId:                   ol.itemId,
                lineId:                   ol.lineId,
                qtyMinorPending:          ol.qtyMinorPending,
                qtyMinorAvailableAtFinalize: ol.qtyMinorAvailableAtFinalize,
              })),
            }));
          }
        }
      }

      const recomputedTotals = this.computeInvoiceTotals(dbLines as unknown as Record<string, unknown>[], dbPayments as unknown as Record<string, unknown>[]);
      const newVersion = ((locked as Record<string, unknown>).version as number || 1) + 1;

      const [updated] = await tx.update(patientInvoiceHeaders).set({
        ...recomputedTotals,
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        version: newVersion,
      }).where(and(
        eq(patientInvoiceHeaders.id, id),
        eq(patientInvoiceHeaders.status, 'draft')
      )).returning();

      if (!updated) throw new Error("الفاتورة ليست مسودة");
      return updated;
    });

    return result;
  },

  async deletePatientInvoice(this: DatabaseStorage, id: string, reason?: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const invoice = lockResult.rows?.[0] as Record<string, unknown>;
      if (!invoice) throw new Error("فاتورة المريض غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled" as "cancelled",
        version: ((invoice as Record<string, unknown>).version as number | null | undefined || 1) + 1,
        notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
      }).where(eq(patientInvoiceHeaders.id, id));
      return true;
    });
  },
};

export default methods;
