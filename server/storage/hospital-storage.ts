/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Hospital Operations Storage — طبقة تخزين عمليات المستشفى
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  This module contains all database operations related to hospital workflows:
 *  Cashier, Drawer Passwords, Print Tracking, Patients, Doctors, Admissions,
 *  Stay Engine, Surgery Types, Bed Board, Doctor Transfers & Settlements,
 *  and Treasuries.
 *
 *  يحتوي هذا الملف على جميع عمليات قاعدة البيانات المتعلقة بسير عمل المستشفى:
 *  الكاشير، كلمات سر الأدراج، تتبع الطباعة، المرضى، الأطباء، حالات الدخول،
 *  محرك الإقامة، أنواع العمليات، لوحة الأسرة، تحويلات وتسويات الأطباء، والخزن.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db, pool } from "../db";
import { getSetting } from "../settings-cache";
import { eq, desc, and, sql, or, asc, gte, lte, isNull, isNotNull, ilike, inArray } from "drizzle-orm";
import {
  pharmacies,
  accounts,
  drawerPasswords,
  cashierShifts,
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  salesInvoiceHeaders,
  salesInvoiceLines,
  warehouses,
  items,
  patients,
  doctors,
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  staySegments,
  surgeryTypes,
  surgeryCategoryPrices,
  floors,
  rooms,
  beds,
  auditLog,
  doctorTransfers,
  doctorSettlements,
  doctorSettlementAllocations,
  treasuries,
  userTreasuries,
  treasuryTransactions,
  users,
  services,
  type Pharmacy,
  type InsertPharmacy,
  type CashierShift,
  type CashierReceipt,
  type CashierRefundReceipt,
  type Patient,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type PatientInvoiceHeader,
  type StaySegment,
  type SurgeryType,
  type InsertSurgeryType,
  type SurgeryCategoryPrice,
  type DoctorTransfer,
  type DoctorSettlement,
  type DoctorSettlementAllocation,
  type Treasury,
  type InsertTreasury,
  type TreasuryTransaction,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { roundMoney, parseMoney } from "../finance-helpers";

const methods = {

  // ==================== Cashier ====================

  async getPharmacies(this: DatabaseStorage): Promise<Pharmacy[]> {
    return db.select().from(pharmacies).orderBy(asc(pharmacies.code));
  },

  async getPharmacy(this: DatabaseStorage, id: string): Promise<Pharmacy | undefined> {
    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, id));
    return pharmacy;
  },

  async createPharmacy(this: DatabaseStorage, data: InsertPharmacy): Promise<Pharmacy> {
    const [pharmacy] = await db.insert(pharmacies).values(data).returning();
    return pharmacy;
  },

  async updatePharmacy(this: DatabaseStorage, id: string, data: Partial<InsertPharmacy>): Promise<Pharmacy> {
    const [pharmacy] = await db.update(pharmacies).set(data).where(eq(pharmacies.id, id)).returning();
    return pharmacy;
  },

  // ==================== Drawer Passwords ====================

  async setDrawerPassword(this: DatabaseStorage, glAccountId: string, passwordHash: string): Promise<void> {
    const [existing] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    if (existing) {
      await db.update(drawerPasswords).set({ passwordHash, updatedAt: new Date() }).where(eq(drawerPasswords.glAccountId, glAccountId));
    } else {
      await db.insert(drawerPasswords).values({ glAccountId, passwordHash });
    }
  },

  async getDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<string | null> {
    const [row] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return row?.passwordHash || null;
  },

  async removeDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<boolean> {
    const result = await db.delete(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return (result.rowCount || 0) > 0;
  },

  async getDrawersWithPasswordStatus(this: DatabaseStorage): Promise<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]> {
    const cashAccounts = await db.select().from(accounts).where(
      or(
        sql`${accounts.code} LIKE '1211%'`,
        sql`${accounts.code} LIKE '1212%'`
      )
    ).orderBy(asc(accounts.code));

    const passwords = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords);
    const passwordSet = new Set(passwords.map(p => p.glAccountId));

    return cashAccounts.map(a => ({
      glAccountId: a.id,
      hasPassword: passwordSet.has(a.id),
      code: a.code,
      name: a.name,
    }));
  },

  async getMyOpenShift(this: DatabaseStorage, cashierId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
      .limit(1);
    return shift || null;
  },

  async getUserCashierGlAccount(this: DatabaseStorage, userId: string): Promise<{ glAccountId: string; code: string; name: string; hasPassword: boolean } | null> {
    const [user] = await db.select({ cashierGlAccountId: users.cashierGlAccountId }).from(users).where(eq(users.id, userId));
    if (!user?.cashierGlAccountId) return null;
    const [account] = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts).where(eq(accounts.id, user.cashierGlAccountId));
    if (!account) return null;
    const [pwd] = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords).where(eq(drawerPasswords.glAccountId, account.id));
    return { glAccountId: account.id, code: account.code, name: account.name, hasPassword: !!pwd };
  },

  async openCashierShift(this: DatabaseStorage, cashierId: string, cashierName: string, openingCash: string, unitType: string, pharmacyId?: string | null, departmentId?: string | null, glAccountId?: string | null): Promise<CashierShift> {
    const existingOpen = await this.getMyOpenShift(cashierId);
    if (existingOpen) throw new Error("لديك وردية مفتوحة بالفعل — أغلق وردياتك الحالية أولاً أو استخدم حساباً آخر");

    const unitLabel = unitType === "department" ? `قسم: ${departmentId}` : `صيدلية: ${pharmacyId}`;
    const [shift] = await db.insert(cashierShifts).values({
      cashierId,
      cashierName,
      unitType,
      pharmacyId: unitType === "pharmacy" ? (pharmacyId || null) : null,
      departmentId: unitType === "department" ? (departmentId || null) : null,
      openingCash,
      glAccountId: glAccountId || null,
      status: "open",
    }).returning();

    await db.insert(cashierAuditLog).values({
      shiftId: shift.id,
      action: "open_shift",
      entityType: "shift",
      entityId: shift.id,
      details: `فتح وردية - رصيد افتتاحي: ${openingCash} - ${unitLabel}`,
      performedBy: cashierName,
    });

    return shift;
  },

  async getActiveShift(this: DatabaseStorage, cashierId: string, unitType: string, unitId: string): Promise<CashierShift | null> {
    const conditions = [eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.unitType, unitType), eq(cashierShifts.status, "open")];
    if (unitType === "pharmacy") conditions.push(eq(cashierShifts.pharmacyId, unitId));
    else conditions.push(eq(cashierShifts.departmentId, unitId));
    const [shift] = await db.select().from(cashierShifts).where(and(...conditions));
    return shift || null;
  },

  async getPendingInvoiceCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(eq(warehouses.departmentId, shift.departmentId), eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId), eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)));
      return Number(result?.count) || 0;
    }
    return 0;
  },

  async getPendingDocCountForUnit(this: DatabaseStorage, shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(eq(warehouses.departmentId, shift.departmentId), eq(salesInvoiceHeaders.status, "finalized")));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId), eq(salesInvoiceHeaders.status, "finalized")));
      return Number(result?.count) || 0;
    }
    return 0;
  },

  async findOtherOpenShiftForUnit(this: DatabaseStorage, currentShiftId: string, shift: CashierShift): Promise<CashierShift | null> {
    const unitCondition = shift.unitType === "department" && shift.departmentId
      ? and(eq(cashierShifts.unitType, "department"), eq(cashierShifts.departmentId, shift.departmentId))
      : shift.pharmacyId
        ? and(eq(cashierShifts.unitType, "pharmacy"), eq(cashierShifts.pharmacyId, shift.pharmacyId))
        : null;
    if (!unitCondition) return null;
    const [found] = await db.select()
      .from(cashierShifts)
      .where(and(
        eq(cashierShifts.status, "open"),
        unitCondition,
        sql`${cashierShifts.id} != ${currentShiftId}`,
      ))
      .limit(1);
    return found || null;
  },

  async getMyOpenShifts(this: DatabaseStorage, cashierId: string): Promise<CashierShift[]> {
    return db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
      .orderBy(cashierShifts.openedAt);
  },

  async validateShiftClose(this: DatabaseStorage, shiftId: string): Promise<{ canClose: boolean; pendingCount: number; hasOtherOpenShift: boolean; otherShift: any; reasonCode: string }> {
    const shift = await this.getShiftById(shiftId);
    if (!shift) return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "NOT_FOUND" };
    if (shift.status !== "open") return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "ALREADY_CLOSED" };

    const [pendingCount, otherShift] = await Promise.all([
      this.getPendingDocCountForUnit(shift),
      this.findOtherOpenShiftForUnit(shiftId, shift),
    ]);
    const hasOtherOpenShift = !!otherShift;

    if (pendingCount === 0) return { canClose: true, pendingCount: 0, hasOtherOpenShift, otherShift: otherShift || null, reasonCode: "CLEAN" };
    if (hasOtherOpenShift) return { canClose: true, pendingCount, hasOtherOpenShift: true, otherShift, reasonCode: "PENDING_OTHER_SHIFT_EXISTS" };
    return { canClose: false, pendingCount, hasOtherOpenShift: false, otherShift: null, reasonCode: "PENDING_NO_OTHER_SHIFT" };
  },

  async getShiftById(this: DatabaseStorage, shiftId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    return shift || null;
  },

  async closeCashierShift(this: DatabaseStorage, shiftId: string, closingCash: string): Promise<CashierShift> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    if (!shift) throw new Error("الوردية غير موجودة");
    if (shift.status !== "open") throw new Error("الوردية مغلقة بالفعل");

    const [pendingCount, otherShift] = await Promise.all([
      this.getPendingDocCountForUnit(shift),
      this.findOtherOpenShiftForUnit(shiftId, shift),
    ]);
    if (pendingCount > 0 && !otherShift) {
      throw new Error(`لا يمكن إغلاق الوردية - يوجد ${pendingCount} مستند معلّق لم يتم تحصيله`);
    }

    const totals = await this.getShiftTotals(shiftId);
    const expectedCash = (parseFloat(shift.openingCash) + parseFloat(totals.totalCollected) - parseFloat(totals.totalRefunded)).toFixed(2);
    const variance = (parseFloat(closingCash) - parseFloat(expectedCash)).toFixed(2);

    const [updated] = await db.update(cashierShifts).set({
      status: "closed",
      closingCash,
      expectedCash,
      variance,
      closedAt: new Date(),
    }).where(eq(cashierShifts.id, shiftId)).returning();

    await db.insert(cashierAuditLog).values({
      shiftId,
      action: "close_shift",
      entityType: "shift",
      entityId: shiftId,
      details: `إغلاق وردية - النقدية الفعلية: ${closingCash} | المتوقعة: ${expectedCash} | الفرق: ${variance}`,
      performedBy: shift.cashierName,
    });

    return updated;
  },

  async getPendingSalesInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      invoiceDate: salesInvoiceHeaders.invoiceDate,
      customerType: salesInvoiceHeaders.customerType,
      customerName: salesInvoiceHeaders.customerName,
      subtotal: salesInvoiceHeaders.subtotal,
      discountValue: salesInvoiceHeaders.discountValue,
      netTotal: salesInvoiceHeaders.netTotal,
      createdBy: salesInvoiceHeaders.createdBy,
      status: salesInvoiceHeaders.status,
      createdAt: salesInvoiceHeaders.createdAt,
      warehouseName: warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    if (search) {
      const s = search.toLowerCase();
      return results.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s)) ||
        (r.createdBy && r.createdBy.toLowerCase().includes(s))
      );
    }
    return results;
  },

  async getPendingReturnInvoices(this: DatabaseStorage, unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, true)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      invoiceDate: salesInvoiceHeaders.invoiceDate,
      customerType: salesInvoiceHeaders.customerType,
      customerName: salesInvoiceHeaders.customerName,
      subtotal: salesInvoiceHeaders.subtotal,
      discountValue: salesInvoiceHeaders.discountValue,
      netTotal: salesInvoiceHeaders.netTotal,
      createdBy: salesInvoiceHeaders.createdBy,
      originalInvoiceId: salesInvoiceHeaders.originalInvoiceId,
      status: salesInvoiceHeaders.status,
      createdAt: salesInvoiceHeaders.createdAt,
      warehouseName: warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    if (search) {
      const s = search.toLowerCase();
      return results.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s))
      );
    }
    return results;
  },

  async getSalesInvoiceDetails(this: DatabaseStorage, invoiceId: string): Promise<any> {
    const [header] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!header) return null;

    const lines = await db.select({
      id: salesInvoiceLines.id,
      lineNo: salesInvoiceLines.lineNo,
      itemId: salesInvoiceLines.itemId,
      unitLevel: salesInvoiceLines.unitLevel,
      qty: salesInvoiceLines.qty,
      salePrice: salesInvoiceLines.salePrice,
      lineTotal: salesInvoiceLines.lineTotal,
      itemName: items.nameAr,
      itemCode: items.itemCode,
    })
    .from(salesInvoiceLines)
    .leftJoin(items, eq(salesInvoiceLines.itemId, items.id))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.lineNo));

    return { ...header, lines };
  },

  async getNextCashierReceiptNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
    return (result?.maxNum || 0) + 1;
  },

  async getNextCashierRefundReceiptNumber(this: DatabaseStorage): Promise<number> {
    const [result] = await db.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
    return (result?.maxNum || 0) + 1;
  },

  async collectInvoices(this: DatabaseStorage, shiftId: string, invoiceIds: string[], collectedBy: string, paymentDate?: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");
      if (!shift.glAccountId) throw new Error("الوردية لا تحتوي على حساب خزنة - يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
      let nextReceiptNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalCollected = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select().from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} هي مرتجع`);

        const [existingReceipt] = await tx.select().from(cashierReceipts)
          .where(eq(cashierReceipts.invoiceId, invoiceId));
        if (existingReceipt) throw new Error(`الفاتورة ${invoice.invoiceNumber} محصّلة بالفعل`);

        const amount = invoice.netTotal;
        totalCollected += parseFloat(amount);

        const [receipt] = await tx.insert(cashierReceipts).values({
          receiptNumber: nextReceiptNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          collectedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status: "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action: "collect",
          entityType: "sales_invoice",
          entityId: invoiceId,
          details: `تحصيل فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: collectedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalCollected: totalCollected.toFixed(2), count: receipts.length };

      this.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch(err => console.error("Auto journal completion for cashier collection failed:", err));

      return result;
    });
  },

  async refundInvoices(this: DatabaseStorage, shiftId: string, invoiceIds: string[], refundedBy: string, paymentDate?: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");
      if (!shift.glAccountId) throw new Error("الوردية لا تحتوي على حساب خزنة - يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      // ── حساب الرصيد المتاح في الخزنة ──
      const [collectSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));
      const [refundSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));
      const availableCash =
        parseFloat(shift.openingCash || "0") +
        parseFloat(collectSum?.total || "0") -
        parseFloat(refundSum?.total || "0");

      // ── حساب إجمالي المبالغ المطلوب صرفها ──
      const invoiceRows = await tx.select({ id: salesInvoiceHeaders.id, invoiceNumber: salesInvoiceHeaders.invoiceNumber, netTotal: salesInvoiceHeaders.netTotal, status: salesInvoiceHeaders.status, isReturn: salesInvoiceHeaders.isReturn })
        .from(salesInvoiceHeaders)
        .where(inArray(salesInvoiceHeaders.id, invoiceIds));
      const invoiceMap = new Map(invoiceRows.map(r => [r.id, r]));

      let requestedTotal = 0;
      for (const invoiceId of invoiceIds) {
        const inv = invoiceMap.get(invoiceId);
        if (inv) requestedTotal += parseFloat(inv.netTotal);
      }

      if (requestedTotal > availableCash) {
        throw new Error(
          `رصيد الخزنة غير كافٍ — الرصيد المتاح: ${availableCash.toFixed(2)} ج.م، والمطلوب صرفه: ${requestedTotal.toFixed(2)} ج.م`
        );
      }

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
      let nextRefundNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalRefunded = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select().from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (!invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست مرتجع`);

        const [existingRefund] = await tx.select().from(cashierRefundReceipts)
          .where(eq(cashierRefundReceipts.invoiceId, invoiceId));
        if (existingRefund) throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} مصروف بالفعل`);

        const amount = invoice.netTotal;
        totalRefunded += parseFloat(amount);

        const [receipt] = await tx.insert(cashierRefundReceipts).values({
          receiptNumber: nextRefundNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          refundedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status: "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action: "refund",
          entityType: "return_invoice",
          entityId: invoiceId,
          details: `صرف مرتجع فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: refundedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalRefunded: totalRefunded.toFixed(2), count: receipts.length };

      this.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch(err => console.error("Auto journal completion for cashier refund failed:", err));

      return result;
    });
  },

  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<any> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));

    const totalCollected = collectResult?.total || "0";
    const totalRefunded = refundResult?.total || "0";
    const openingCash = shift?.openingCash || "0";
    const netCash = (parseFloat(openingCash) + parseFloat(totalCollected) - parseFloat(totalRefunded)).toFixed(2);

    return {
      openingCash,
      totalCollected,
      collectCount: collectResult?.count || 0,
      totalRefunded,
      refundCount: refundResult?.count || 0,
      netCash,
    };
  },

  // ==================== Print Tracking ====================

  async getCashierReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    return receipt || null;
  },

  async getCashierRefundReceipt(this: DatabaseStorage, receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    return receipt || null;
  },

  async markReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    if (!receipt) throw new Error("الإيصال غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("الإيصال مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierReceipts).set({
      printedAt: new Date(),
      printCount: (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierReceipts.id, receiptId)).returning();
    return updated;
  },

  async markRefundReceiptPrinted(this: DatabaseStorage, receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    if (!receipt) throw new Error("إيصال المرتجع غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("إيصال المرتجع مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierRefundReceipts).set({
      printedAt: new Date(),
      printCount: (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierRefundReceipts.id, receiptId)).returning();
    return updated;
  },

  // ==================== Patients ====================

  async getPatients(this: DatabaseStorage): Promise<Patient[]> {
    return db.select().from(patients).where(eq(patients.isActive, true)).orderBy(asc(patients.fullName));
  },

  async searchPatients(this: DatabaseStorage, search: string): Promise<Patient[]> {
    if (!search.trim()) return this.getPatients();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(patients.fullName, pattern),
        ilike(patients.phone, pattern),
        ilike(patients.nationalId, pattern),
      );
    });
    return db.select().from(patients)
      .where(and(eq(patients.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(patients.fullName))
      .limit(50);
  },

  async getPatientStats(this: DatabaseStorage, filters?: { search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    // ────────────────────────────────────────────────────────────────────────────
    // سياسة الـ JOIN:
    //
    //  • فلتر التاريخ نشط  → INNER JOIN: يُظهر فقط مرضى لهم فواتير في هذه الفترة.
    //    (السلوك المطلوب: "عرض مرضى اليوم فقط" = لا يظهر مرضى بلا نشاط)
    //
    //  • فلتر القسم فقط    → LEFT JOIN: يُظهر كل المرضى لكن يُميّز (بـ opacity)
    //    مَن ليس لهم نشاط في هذا القسم — حتى لا يختفي أي مريض.
    //
    //  • بدون فلتر         → LEFT JOIN: كل المرضى المسجّلين.
    // ────────────────────────────────────────────────────────────────────────────

    // ── شروط subquery الفواتير (تاريخ + قسم + غير ملغي)
    // فلتر القسم: يطابق department_id مباشرة أو عبر warehouse المرتبط بالفاتورة
    const invConds: string[] = ["pih.status != 'cancelled'"];
    if (filters?.dateFrom) invConds.push(`pih.invoice_date >= '${filters.dateFrom}'`);
    if (filters?.dateTo)   invConds.push(`pih.invoice_date <= '${filters.dateTo}'`);
    if (filters?.deptId) {
      const d = filters.deptId.replace(/'/g, "''");
      invConds.push(
        `(pih.department_id = '${d}' OR (pih.department_id IS NULL AND EXISTS (` +
        `SELECT 1 FROM warehouses w WHERE w.id = pih.warehouse_id AND w.department_id = '${d}'` +
        `)))`
      );
    }
    const invFilter = invConds.join(" AND ");

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);
    const joinType = hasDateFilter ? "JOIN" : "LEFT JOIN";

    // ── فلتر البحث على مستوى المريض
    // يدعم البحث بـ: الاسم، التليفون، أو اسم الطبيب (من أي فاتورة للمريض)
    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map(t => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM patient_invoice_headers pih2` +
            ` WHERE pih2.patient_name = p.full_name` +
            ` AND pih2.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    // ── subquery ثنائي المستوى:
    //   المستوى الأول: يجمّع بنود كل فاتورة على حدة (pih.id)
    //     ← يضمن عدم تضاعف paid_amount عند الـ LEFT JOIN مع pil
    //   المستوى الثاني: يجمّع الفواتير لكل مريض (patient_name)
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(s.services_total, 0)      AS services_total,
        COALESCE(s.drugs_total, 0)         AS drugs_total,
        COALESCE(s.consumables_total, 0)   AS consumables_total,
        COALESCE(s.or_room_total, 0)       AS or_room_total,
        COALESCE(s.stay_total, 0)          AS stay_total,
        COALESCE(s.services_total, 0) + COALESCE(s.drugs_total, 0) +
          COALESCE(s.consumables_total, 0) + COALESCE(s.or_room_total, 0) +
          COALESCE(s.stay_total, 0)        AS grand_total,
        COALESCE(s.paid_total, 0)          AS paid_total,
        COALESCE(s.transferred_total, 0)   AS transferred_total,
        s.latest_invoice_id,
        s.latest_invoice_number,
        s.latest_invoice_status,
        s.latest_doctor_name
      FROM patients p
      ${sql.raw(joinType)} (
        SELECT
          inv.patient_name,
          SUM(inv.services_total)      AS services_total,
          SUM(inv.drugs_total)         AS drugs_total,
          SUM(inv.consumables_total)   AS consumables_total,
          SUM(inv.or_room_total)       AS or_room_total,
          SUM(inv.stay_total)          AS stay_total,
          SUM(inv.paid_amount)         AS paid_total,
          SUM(inv.transferred_total)   AS transferred_total,
          (ARRAY_AGG(inv.id             ORDER BY inv.created_at DESC))[1] AS latest_invoice_id,
          (ARRAY_AGG(inv.invoice_number ORDER BY inv.created_at DESC))[1] AS latest_invoice_number,
          (ARRAY_AGG(inv.status         ORDER BY inv.created_at DESC))[1] AS latest_invoice_status,
          (ARRAY_AGG(inv.doctor_name    ORDER BY inv.created_at DESC))[1] AS latest_doctor_name
        FROM (
          SELECT
            pih.id,
            pih.patient_name,
            pih.created_at,
            pih.invoice_number,
            pih.status,
            pih.paid_amount,
            pih.doctor_name,
            COALESCE((
              SELECT SUM(dt.amount)
              FROM doctor_transfers dt
              WHERE dt.invoice_id = pih.id
            ), 0) AS transferred_total,
            SUM(CASE WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                THEN pil.total_price ELSE 0 END) AS services_total,
            SUM(CASE WHEN pil.line_type = 'drug'
                THEN pil.total_price ELSE 0 END) AS drugs_total,
            SUM(CASE WHEN pil.line_type = 'consumable'
                THEN pil.total_price ELSE 0 END) AS consumables_total,
            SUM(CASE WHEN pil.source_type = 'OR_ROOM'
                THEN pil.total_price ELSE 0 END) AS or_room_total,
            SUM(CASE WHEN pil.source_type = 'STAY_ENGINE'
                THEN pil.total_price ELSE 0 END) AS stay_total
          FROM patient_invoice_headers pih
          LEFT JOIN patient_invoice_lines pil
            ON pil.header_id = pih.id AND pil.is_void = false
          WHERE ${sql.raw(invFilter)}
          GROUP BY pih.id, pih.patient_name, pih.created_at,
                   pih.invoice_number, pih.status, pih.paid_amount, pih.doctor_name
        ) inv
        GROUP BY inv.patient_name
      ) s ON s.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
      ORDER BY p.created_at DESC
    `);
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
  },

  async getPatient(this: DatabaseStorage, id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  },

  async createPatient(this: DatabaseStorage, data: InsertPatient): Promise<Patient> {
    const [p] = await db.insert(patients).values(data).returning();
    return p;
  },

  async updatePatient(this: DatabaseStorage, id: string, data: Partial<InsertPatient>): Promise<Patient> {
    return db.transaction(async (tx) => {
      // Fetch old name before update (needed for cascade)
      const [old] = await tx.select({ fullName: patients.fullName })
        .from(patients).where(eq(patients.id, id));

      const [updated] = await tx.update(patients).set(data).where(eq(patients.id, id)).returning();

      // Cascade name change to denormalized patient_name fields
      if (data.fullName && old?.fullName && data.fullName !== old.fullName) {
        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
        await tx.execute(sql`
          UPDATE admissions
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
      }

      return updated;
    });
  },

  async deletePatient(this: DatabaseStorage, id: string): Promise<boolean> {
    // تحقق من وجود فواتير غير ملغية بقيمة > 0 للمريض قبل السماح بالحذف
    const [patient] = await db.select({ fullName: patients.fullName }).from(patients).where(eq(patients.id, id));
    if (!patient) throw new Error("المريض غير موجود");

    const check = await db.execute(sql`
      SELECT COALESCE(SUM(net_amount), 0) AS total
      FROM patient_invoice_headers
      WHERE patient_name = ${patient.fullName}
        AND status != 'cancelled'
    `);
    const total = parseFloat((check.rows[0] as any)?.total ?? "0");
    if (total > 0) {
      throw new Error("لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية");
    }

    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
    return true;
  },

  // ==================== Doctors ====================

  async getDoctors(this: DatabaseStorage, includeInactive?: boolean): Promise<Doctor[]> {
    if (includeInactive) {
      return db.select().from(doctors).orderBy(asc(doctors.name));
    }
    return db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.name));
  },

  async searchDoctors(this: DatabaseStorage, search: string): Promise<Doctor[]> {
    if (!search.trim()) return this.getDoctors();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(doctors.name, pattern),
        ilike(doctors.specialty, pattern),
      );
    });
    return db.select().from(doctors)
      .where(and(eq(doctors.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(doctors.name))
      .limit(50);
  },

  async getDoctorBalances(this: DatabaseStorage): Promise<{ id: string; name: string; specialty: string | null; totalTransferred: string; totalSettled: string; remaining: string }[]> {
    const res = await db.execute(sql`
      SELECT
        d.id, d.name, d.specialty,
        COALESCE(SUM(DISTINCT dt.amount), 0)::text                              AS total_transferred,
        COALESCE((
          SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
          JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
          WHERE dt2.doctor_name = d.name
        ), 0)::text                                                              AS total_settled,
        (
          COALESCE(SUM(dt.amount), 0) - COALESCE((
            SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
            JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
            WHERE dt2.doctor_name = d.name
          ), 0)
        )::text                                                                  AS remaining
      FROM doctors d
      LEFT JOIN doctor_transfers dt ON dt.doctor_name = d.name
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.specialty
      ORDER BY d.name ASC
    `);
    return (res.rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      totalTransferred: r.total_transferred,
      totalSettled: r.total_settled,
      remaining: r.remaining,
    }));
  },

  async getDoctorStatement(this: DatabaseStorage, params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<any[]> {
    const { doctorName, dateFrom, dateTo } = params;
    const dateFromFilter = dateFrom ? sql`AND dt.transferred_at::date >= ${dateFrom}::date` : sql``;
    const dateToFilter   = dateTo   ? sql`AND dt.transferred_at::date <= ${dateTo}::date`   : sql``;
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining,
        pi.patient_name      AS "patientName",
        pi.invoice_date      AS "invoiceDate",
        pi.net_amount::text  AS "invoiceTotal",
        pi.status            AS "invoiceStatus"
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      LEFT JOIN patient_invoice_headers pi ON pi.id = dt.invoice_id
      WHERE dt.doctor_name = ${doctorName}
      ${dateFromFilter}
      ${dateToFilter}
      GROUP BY dt.id, pi.id, pi.patient_name, pi.invoice_date, pi.net_amount, pi.status
      ORDER BY dt.transferred_at DESC
    `);
    return res.rows as any[];
  },

  async getDoctor(this: DatabaseStorage, id: string): Promise<Doctor | undefined> {
    const [d] = await db.select().from(doctors).where(eq(doctors.id, id));
    return d;
  },

  async createDoctor(this: DatabaseStorage, data: InsertDoctor): Promise<Doctor> {
    const [d] = await db.insert(doctors).values(data).returning();
    return d;
  },

  async updateDoctor(this: DatabaseStorage, id: string, data: Partial<InsertDoctor>): Promise<Doctor> {
    const [d] = await db.update(doctors).set(data).where(eq(doctors.id, id)).returning();
    return d;
  },

  async deleteDoctor(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.update(doctors).set({ isActive: false }).where(eq(doctors.id, id));
    return true;
  },

  // ==================== Admissions ====================

  async getAdmissions(this: DatabaseStorage, filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]> {
    // Build safe parameterized conditions for the outer admissions query
    const conds: any[] = [];
    if (filters?.status)   conds.push(sql`a.status = ${filters.status}`);
    if (filters?.dateFrom) conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    if (filters?.dateTo)   conds.push(sql`a.admission_date <= ${filters.dateTo}`);
    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    // فلتر القسم: تُعرض الإقامة فقط إذا كانت آخر فاتورة مرتبطة بها تنتمي للقسم المحدد
    if (filters?.deptId) {
      conds.push(sql`inv_agg.latest_invoice_dept_id = ${filters.deptId}`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(inv_agg.total_net_amount, 0)          AS total_net_amount,
        COALESCE(inv_agg.total_paid_amount, 0)         AS total_paid_amount,
        COALESCE(inv_agg.total_transferred, 0)         AS total_transferred_amount,
        inv_agg.latest_invoice_number                   AS latest_invoice_number,
        inv_agg.latest_invoice_id                       AS latest_invoice_id,
        inv_agg.latest_invoice_status                   AS latest_invoice_status,
        inv_agg.latest_invoice_dept_id                  AS latest_invoice_dept_id,
        inv_agg.latest_invoice_dept_name                AS latest_invoice_dept_name
      FROM admissions a
      LEFT JOIN (
        /*
         * نجمع فواتير المريض لكل إقامة بطريقتين:
         *   1. مباشرة عبر admission_id (الحالة المثلى)
         *   2. عبر اسم المريض لأحدث إقامة له عند غياب admission_id
         *      (يحدث عند إنشاء الفاتورة يدوياً بدون ربطها بإقامة)
         */
        SELECT
          COALESCE(pi.admission_id, a_fb.id)                                       AS eff_admission_id,
          SUM(pi.net_amount::numeric)                                               AS total_net_amount,
          SUM(pi.paid_amount::numeric)                                              AS total_paid_amount,
          COALESCE(SUM(dt_agg.dt_total), 0)                                        AS total_transferred,
          (ARRAY_AGG(pi.invoice_number ORDER BY pi.created_at DESC))[1]            AS latest_invoice_number,
          (ARRAY_AGG(pi.id             ORDER BY pi.created_at DESC))[1]            AS latest_invoice_id,
          (ARRAY_AGG(pi.status         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_status,
          (ARRAY_AGG(pi.department_id  ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_id,
          (ARRAY_AGG(d.name_ar         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_name
        FROM patient_invoice_headers pi
        /* اسم القسم من جدول departments */
        LEFT JOIN departments d ON d.id = pi.department_id
        /* fallback: آخر إقامة بنفس اسم المريض عند غياب admission_id */
        LEFT JOIN (
          SELECT DISTINCT ON (patient_name) id, patient_name
          FROM admissions
          ORDER BY patient_name, created_at DESC
        ) a_fb ON a_fb.patient_name = pi.patient_name AND pi.admission_id IS NULL
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pi.id
        WHERE pi.status != 'cancelled'
          AND COALESCE(pi.admission_id, a_fb.id) IS NOT NULL
        GROUP BY COALESCE(pi.admission_id, a_fb.id)
      ) inv_agg ON inv_agg.eff_admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
    `);

    // Convert snake_case keys to camelCase (raw SQL returns snake_case)
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
  },

  async getAdmission(this: DatabaseStorage, id: string): Promise<Admission | undefined> {
    const [a] = await db.select().from(admissions).where(eq(admissions.id, id));
    return a;
  },

  async createAdmission(this: DatabaseStorage, data: InsertAdmission): Promise<Admission> {
    const maxNumResult = await db.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(admission_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM admissions`);
    const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

    const [a] = await db.insert(admissions).values({
      ...data,
      admissionNumber: data.admissionNumber || String(nextNum),
    }).returning();
    return a;
  },

  async updateAdmission(this: DatabaseStorage, id: string, data: Partial<InsertAdmission>): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async dischargeAdmission(this: DatabaseStorage, id: string): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      status: "discharged",
      dischargeDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  },

  async getAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader[]> {
    return await db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.admissionId, admissionId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  },

  async consolidateAdmissionInvoices(this: DatabaseStorage, admissionId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [admission] = await tx.select().from(admissions).where(eq(admissions.id, admissionId));
      if (!admission) throw new Error("الإقامة غير موجودة");

      const invoices = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, false),
        ))
        .orderBy(asc(patientInvoiceHeaders.createdAt));

      if (invoices.length === 0) throw new Error("لا توجد فواتير لتجميعها");

      const existingConsolidated = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, true),
        ));

      if (existingConsolidated.length > 0) {
        for (const ec of existingConsolidated) {
          await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, ec.id));
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, ec.id));
        }
      }

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const totalAmount = invoices.reduce((s, inv) => s + parseFloat(inv.totalAmount), 0);
      const discountAmount = invoices.reduce((s, inv) => s + parseFloat(inv.discountAmount), 0);
      const netAmount = invoices.reduce((s, inv) => s + parseFloat(inv.netAmount), 0);
      const paidAmount = invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount), 0);

      const [consolidated] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber: String(nextNum),
        invoiceDate: new Date().toISOString().split("T")[0],
        patientName: admission.patientName,
        patientPhone: admission.patientPhone,
        patientType: invoices[0].patientType,
        admissionId: admissionId,
        isConsolidated: true,
        sourceInvoiceIds: JSON.stringify(invoices.map(i => i.id)),
        doctorName: admission.doctorName,
        notes: `فاتورة مجمعة - إقامة رقم ${admission.admissionNumber}`,
        status: "draft",
        totalAmount: String(+totalAmount.toFixed(2)),
        discountAmount: String(+discountAmount.toFixed(2)),
        netAmount: String(+netAmount.toFixed(2)),
        paidAmount: String(+paidAmount.toFixed(2)),
      }).returning();

      let sortOrder = 0;
      for (const inv of invoices) {
        const lines = await tx.select().from(patientInvoiceLines)
          .where(eq(patientInvoiceLines.headerId, inv.id))
          .orderBy(asc(patientInvoiceLines.sortOrder));

        if (lines.length > 0) {
          const newLines = lines.map(l => ({
            headerId: consolidated.id,
            lineType: l.lineType,
            serviceId: l.serviceId,
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            discountAmount: l.discountAmount,
            totalPrice: l.totalPrice,
            unitLevel: l.unitLevel,
            lotId: l.lotId,
            expiryMonth: l.expiryMonth,
            expiryYear: l.expiryYear,
            priceSource: l.priceSource,
            doctorName: l.doctorName,
            nurseName: l.nurseName,
            notes: l.notes ? `[${inv.invoiceNumber}] ${l.notes}` : `[فاتورة ${inv.invoiceNumber}]`,
            sortOrder: sortOrder++,
          }));
          await tx.insert(patientInvoiceLines).values(newLines);
        }
      }

      const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, consolidated.id));
      return finalHeader;
    });
  },

  // ==================== Stay Engine ====================

  async getStaySegments(this: DatabaseStorage, admissionId: string): Promise<StaySegment[]> {
    const result = await db.execute(
      sql`SELECT * FROM stay_segments WHERE admission_id = ${admissionId} ORDER BY started_at ASC`
    );
    return result.rows as any[];
  },

  async openStaySegment(this: DatabaseStorage, params: {
    admissionId: string;
    serviceId?: string;
    invoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      // Lock admission FOR UPDATE
      const admResult = await tx.execute(sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`);
      const admission = admResult.rows?.[0] as any;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      // Enforce 1 ACTIVE per admission (also backed by partial unique index)
      const activeCheck = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${params.admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      if ((activeCheck.rows?.length || 0) > 0) {
        throw new Error("يوجد قطاع إقامة نشط بالفعل – استخدم تحويل الإقامة لتغيير الخدمة");
      }

      // Resolve rate from service
      let ratePerDay = "0";
      if (params.serviceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.serviceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as any)?.base_price ?? "0");
      }

      const [seg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.serviceId || null,
        invoiceId: params.invoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();
      return seg;
    });
  },

  async closeStaySegment(this: DatabaseStorage, segmentId: string): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${segmentId} FOR UPDATE`
      );
      const seg = lockResult.rows?.[0] as any;
      if (!seg) throw new Error("القطاع غير موجود");
      if (seg.status === "CLOSED") throw new Error("القطاع مغلق بالفعل");

      const [updated] = await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, segmentId)).returning();
      return updated;
    });
  },

  async transferStaySegment(this: DatabaseStorage, params: {
    admissionId: string;
    oldSegmentId: string;
    newServiceId?: string;
    newInvoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      // Lock admission + old segment atomically — prevents duplicate open
      const admResult = await tx.execute(
        sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`
      );
      const admission = admResult.rows?.[0] as any;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      const segResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${params.oldSegmentId} AND admission_id = ${params.admissionId} FOR UPDATE`
      );
      const oldSeg = segResult.rows?.[0] as any;
      if (!oldSeg) throw new Error("القطاع المصدر غير موجود");
      if (oldSeg.status !== "ACTIVE") throw new Error("القطاع المصدر ليس نشطاً");

      // Close old segment
      await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, params.oldSegmentId));

      // Resolve rate for new segment
      let ratePerDay = "0";
      if (params.newServiceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as any)?.base_price ?? "0");
      }

      // Open new segment — partial unique index now unblocked since old is CLOSED
      const [newSeg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.newServiceId || null,
        invoiceId: params.newInvoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();

      return newSeg;
    });
  },

  /*
   * accrueStayLines — محرك الإقامة (يعمل كل 5 دقائق)
   * ─────────────────────────────────────────────────────
   * يحسب تكلفة الإقامة اليومية لكل مريض مقيم:
   *
   * الأوضاع (Billing Modes):
   * - hours_24: يوم = 24 ساعة من وقت الدخول (مثلاً: دخل 3 مساءً → اليوم الثاني يبدأ 3 مساءً اليوم التالي)
   * - hotel_noon: يوم = حتى ظهر اليوم التالي (نظام فندقي — مثلاً: أي دخول قبل 12 ظهراً = يوم كامل)
   *
   * لكل segment نشط:
   * 1. يحسب عدد الأيام المستحقة من started_at حتى الآن
   * 2. يتخطى اليوم الأول (n=0) إذا كان هناك تحويل سرير (لمنع الفوترة المزدوجة)
   * 3. يُنشئ سطر في patient_invoice_lines لكل يوم (UPSERT — لو موجود لا يتكرر)
   * 4. idempotent: تشغيله مرتين لنفس اليوم لن ينتج سطور مكررة
   */
  async accrueStayLines(this: DatabaseStorage): Promise<{ segmentsProcessed: number; linesUpserted: number }> {
    const activeResult = await db.execute(sql`
      SELECT s.id, s.admission_id, s.invoice_id, s.service_id, s.started_at,
             s.rate_per_day, COALESCE(srv.name_ar, 'إقامة') AS service_name_ar
      FROM stay_segments s
      LEFT JOIN services srv ON s.service_id = srv.id
      WHERE s.status = 'ACTIVE'
    `);
    const segments = activeResult.rows as any[];
    let totalLinesUpserted = 0;

    for (const seg of segments) {
      try {
        await db.transaction(async (tx) => {
          // Lock invoice FOR UPDATE to prevent concurrent total recompute
          await tx.execute(
            sql`SELECT id FROM patient_invoice_headers WHERE id = ${seg.invoice_id} FOR UPDATE`
          );

          // Compute daily buckets based on billing mode
          const billingMode = getSetting("stay_billing_mode", "hours_24");
          const startedAt = new Date(seg.started_at);
          const now = new Date();

          type BucketEntry = { key: string; desc: string };
          const bucketEntries: BucketEntry[] = [];

          if (billingMode === "hotel_noon") {
            // Hotel noon: day boundaries at 12:00 UTC
            // Period 1: from startedAt to first noon checkpoint (charge immediately)
            const firstNoon = new Date(startedAt);
            firstNoon.setUTCHours(12, 0, 0, 0);
            if (startedAt.getTime() >= firstNoon.getTime()) {
              firstNoon.setUTCDate(firstNoon.getUTCDate() + 1);
            }
            const startDateStr = startedAt.toISOString().split("T")[0];
            bucketEntries.push({ key: `noon:${startDateStr}`, desc: `${seg.service_name_ar} – ${startDateStr}` });

            // Each noon checkpoint that has passed opens a new period
            const cur = new Date(firstNoon);
            while (cur.getTime() <= now.getTime()) {
              const dateStr = cur.toISOString().split("T")[0];
              bucketEntries.push({ key: `noon:${dateStr}`, desc: `${seg.service_name_ar} – ${dateStr}` });
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          } else {
            // hours_24 (default): فوترة بـ 24 ساعة من وقت الدخول بالضبط
            // يوم 1 = فور الدخول، يوم 2 = بعد 24 ساعة من الدخول، إلخ.
            // مثال: دخل 8:15 صباحاً → يوم 2 يُحسب 8:15 صباحاً اليوم التالي
            //        (أو عند أول tick بعد مرور 24 ساعة — كل 5 دقائق)
            //
            // periodsCompleted = 0 → يوم 1 فقط (أقل من 24 ساعة)
            // periodsCompleted = 1 → يوم 2 (بعد 24 ساعة)
            // periodsCompleted = 2 → يوم 3 (بعد 48 ساعة)  إلخ.
            //
            // الـ source_id يستخدم تاريخ بداية كل فترة لضمان idempotency
            const elapsedMs        = now.getTime() - startedAt.getTime();
            const periodsCompleted = Math.max(0, Math.floor(elapsedMs / 86_400_000));

            for (let n = 0; n <= periodsCompleted; n++) {
              const periodStart = new Date(startedAt.getTime() + n * 86_400_000);
              const dateStr     = periodStart.toISOString().split("T")[0];
              bucketEntries.push({ key: dateStr, desc: `${seg.service_name_ar} – يوم ${n + 1}` });
            }
          }

          const rateStr = String(parseFloat(seg.rate_per_day) || 0);
          let linesInserted = 0;

          const transferCheckResult = await tx.execute(sql`
            SELECT source_id FROM patient_invoice_lines
            WHERE header_id = ${seg.invoice_id}
              AND source_type = 'STAY_ENGINE'
              AND source_id LIKE ${'transfer:' + seg.invoice_id + ':' + seg.id + ':%'}
              AND is_void = false
            LIMIT 1
          `);
          const hasTransferLine = (transferCheckResult.rows?.length || 0) > 0;

          for (let bi = 0; bi < bucketEntries.length; bi++) {
            const { key: bucketKey, desc: description } = bucketEntries[bi];

            if (bi === 0 && hasTransferLine) continue;

            const sourceId = `${seg.invoice_id}:${seg.id}:${bucketKey}`;

            // Idempotent UPSERT — ON CONFLICT with the partial unique index
            const upsertResult = await tx.execute(sql`
              INSERT INTO patient_invoice_lines
                (header_id, line_type, service_id, description,
                 quantity, unit_price, discount_percent, discount_amount,
                 total_price, unit_level, sort_order, source_type, source_id)
              VALUES
                (${seg.invoice_id}, 'service', ${seg.service_id}, ${description},
                 '1', ${rateStr}, '0', '0',
                 ${rateStr}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
              ON CONFLICT (source_type, source_id)
                WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
              DO NOTHING
            `);
            if ((upsertResult.rowCount || 0) > 0) linesInserted++;
          }

          if (linesInserted > 0) {
            // Recompute invoice totals server-side
            const dbLines = await tx.select().from(patientInvoiceLines)
              .where(and(eq(patientInvoiceLines.headerId, seg.invoice_id), eq(patientInvoiceLines.isVoid, false)));
            const dbPayments = await tx.select().from(patientInvoicePayments)
              .where(eq(patientInvoicePayments.headerId, seg.invoice_id));
            const totals = this.computeInvoiceTotals(dbLines, dbPayments);

            await tx.update(patientInvoiceHeaders).set({
              ...totals,
              updatedAt: new Date(),
            }).where(eq(patientInvoiceHeaders.id, seg.invoice_id));

            // Audit after commit
            await tx.insert(auditLog).values({
              tableName: "patient_invoice_headers",
              recordId: seg.invoice_id,
              action: "stay_accrual",
              newValues: JSON.stringify({ segmentId: seg.id, linesInserted, buckets: bucketEntries.length }),
            });

            console.log(`[STAY_ENGINE] Accrued ${linesInserted} line(s) for segment ${seg.id} → invoice ${seg.invoice_id}`);
          }

          totalLinesUpserted += linesInserted;
        });
      } catch (err: any) {
        console.error(`[STAY_ENGINE] Segment ${seg.id} accrual failed:`, err.message);
      }
    }

    return { segmentsProcessed: segments.length, linesUpserted: totalLinesUpserted };
  },

  // ==================== Surgery Types ====================

  async getSurgeryTypes(this: DatabaseStorage, search?: string): Promise<SurgeryType[]> {
    if (search) {
      return db.select().from(surgeryTypes)
        .where(ilike(surgeryTypes.nameAr, `%${search}%`))
        .orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
    }
    return db.select().from(surgeryTypes).orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
  },

  async createSurgeryType(this: DatabaseStorage, data: InsertSurgeryType): Promise<SurgeryType> {
    const [row] = await db.insert(surgeryTypes).values(data).returning();
    return row;
  },

  async updateSurgeryType(this: DatabaseStorage, id: string, data: Partial<InsertSurgeryType>): Promise<SurgeryType> {
    const [row] = await db.update(surgeryTypes).set(data).where(eq(surgeryTypes.id, id)).returning();
    if (!row) throw new Error("نوع العملية غير موجود");
    return row;
  },

  async deleteSurgeryType(this: DatabaseStorage, id: string): Promise<void> {
    const linked = await db.execute(
      sql`SELECT id FROM admissions WHERE surgery_type_id = ${id} LIMIT 1`
    );
    if (linked.rows.length > 0) throw new Error("لا يمكن حذف نوع العملية — مرتبط بقبول مريض");
    await db.delete(surgeryTypes).where(eq(surgeryTypes.id, id));
  },

  async getSurgeryCategoryPrices(this: DatabaseStorage): Promise<SurgeryCategoryPrice[]> {
    return db.select().from(surgeryCategoryPrices).orderBy(asc(surgeryCategoryPrices.category));
  },

  async upsertSurgeryCategoryPrice(this: DatabaseStorage, category: string, price: string): Promise<SurgeryCategoryPrice> {
    const [row] = await db.insert(surgeryCategoryPrices)
      .values({ category, price })
      .onConflictDoUpdate({ target: surgeryCategoryPrices.category, set: { price } })
      .returning();
    return row;
  },

  async updateInvoiceSurgeryType(this: DatabaseStorage, invoiceId: string, surgeryTypeId: string | null): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock invoice
      const hdrRes = await tx.execute(
        sql`SELECT * FROM patient_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`
      );
      const hdr = hdrRes.rows[0] as any;
      if (!hdr) throw new Error("الفاتورة غير موجودة");
      if (hdr.status === "finalized") throw new Error("لا يمكن تعديل فاتورة نهائية");

      // Remove existing OR_ROOM line for this invoice
      await tx.execute(
        sql`DELETE FROM patient_invoice_lines WHERE header_id = ${invoiceId} AND source_type = 'OR_ROOM'`
      );

      if (surgeryTypeId) {
        // Fetch surgery type and its category price
        const stRes = await tx.execute(
          sql`SELECT st.id, st.name_ar, st.category, scp.price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as any;
        if (!st) throw new Error("نوع العملية غير موجود أو غير نشط");

        const price = parseFloat(st.price || "0");
        const desc = `فتح غرفة عمليات — ${st.name_ar}`;

        await tx.execute(
          sql`INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount, total_price, unit_level, sort_order, source_type, source_id)
              VALUES
              (${invoiceId}, 'service', ${desc}, '1', ${String(price)}, '0', '0', ${String(price)}, 'minor', 5, 'OR_ROOM', ${`or_room:${invoiceId}:${surgeryTypeId}`})`
        );

        // Update admission surgery_type_id
        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = ${surgeryTypeId} WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      } else {
        // Clear surgery type from admission
        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = NULL WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      }

      // Recompute totals
      const linesRes = await tx.execute(
        sql`SELECT unit_price, quantity, discount_percent FROM patient_invoice_lines WHERE header_id = ${invoiceId}`
      );
      let total = 0;
      let disc = 0;
      for (const l of linesRes.rows as any[]) {
        const gross = parseFloat(l.unit_price) * parseFloat(l.quantity);
        const d = gross * parseFloat(l.discount_percent || "0") / 100;
        total += gross; disc += d;
      }
      const net = Math.round((total - disc) * 100) / 100;
      await tx.execute(
        sql`UPDATE patient_invoice_headers
            SET total_amount = ${String(Math.round(total * 100) / 100)},
                discount_amount = ${String(Math.round(disc * 100) / 100)},
                net_amount = ${String(net)}
            WHERE id = ${invoiceId}`
      );
    });
  },

  // ==================== Bed Board ====================

  async getBedBoard(this: DatabaseStorage) {
    const result = await db.execute(sql`
      SELECT
        f.id   AS floor_id,   f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
        r.id   AS room_id,    r.name_ar AS room_name_ar,  r.room_number, r.sort_order AS room_sort,
        r.service_id AS room_service_id,
        svc.name_ar AS room_service_name_ar, svc.base_price AS room_service_price,
        b.id   AS bed_id,     b.bed_number, b.status,
        b.current_admission_id,
        a.patient_name, a.admission_number
      FROM floors f
      JOIN rooms r  ON r.floor_id = f.id
      LEFT JOIN services svc ON svc.id = r.service_id
      JOIN beds  b  ON b.room_id  = r.id
      LEFT JOIN admissions a ON a.id = b.current_admission_id
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);

    const floorsMap = new Map<string, any>();
    for (const row of result.rows as any[]) {
      if (!floorsMap.has(row.floor_id)) {
        floorsMap.set(row.floor_id, {
          id: row.floor_id, nameAr: row.floor_name_ar, sortOrder: row.floor_sort,
          rooms: new Map<string, any>(),
        });
      }
      const floor = floorsMap.get(row.floor_id);
      if (!floor.rooms.has(row.room_id)) {
        floor.rooms.set(row.room_id, {
          id: row.room_id, nameAr: row.room_name_ar, roomNumber: row.room_number,
          serviceId: row.room_service_id || null,
          serviceNameAr: row.room_service_name_ar || null,
          servicePrice: row.room_service_price || null,
          sortOrder: row.room_sort, beds: [],
        });
      }
      floor.rooms.get(row.room_id).beds.push({
        id: row.bed_id, bedNumber: row.bed_number, status: row.status,
        currentAdmissionId: row.current_admission_id,
        patientName: row.patient_name || undefined,
        admissionNumber: row.admission_number || undefined,
        roomId: row.room_id,
        createdAt: null, updatedAt: null,
      });
    }

    return Array.from(floorsMap.values()).map(f => ({
      ...f,
      rooms: Array.from(f.rooms.values()),
    }));
  },

  async getAvailableBeds(this: DatabaseStorage) {
    const result = await db.execute(sql`
      SELECT b.id, b.bed_number, b.status, b.room_id, b.current_admission_id,
             b.created_at, b.updated_at,
             r.name_ar AS room_name_ar, r.id AS room_id_ref,
             f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
             r.service_id AS room_service_id,
             s.name_ar   AS room_service_name_ar,
             s.base_price AS room_service_price
      FROM beds b
      JOIN rooms r  ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
      WHERE b.status = 'EMPTY'
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      bedNumber: row.bed_number,
      status: row.status,
      roomId: row.room_id,
      currentAdmissionId: row.current_admission_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      roomNameAr: row.room_name_ar,
      floorNameAr: row.floor_name_ar,
      roomServiceId: row.room_service_id ?? null,
      roomServiceNameAr: row.room_service_name_ar ?? null,
      roomServicePrice: row.room_service_price ? String(row.room_service_price) : null,
    }));
  },

  async admitPatientToBed(this: DatabaseStorage, params: {
    bedId: string; patientName: string; patientPhone?: string;
    departmentId?: string; serviceId?: string; doctorName?: string; notes?: string;
    paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      // 1. Lock bed FOR UPDATE — guards against race conditions
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "EMPTY") throw new Error("السرير غير فارغ — يرجى اختيار سرير آخر");

      // 2. Generate admission number (safe within tx — UNIQUE constraint is final guard)
      const cntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM admissions`);
      const seq = parseInt((cntRes.rows[0] as any)?.cnt || "0") + 1;
      const admissionNumber = `ADM-${String(seq).padStart(6, "0")}`;

      // 3a. Upsert patient into patients table (so they appear in the patient registry)
      const existingPatient = await tx.execute(
        sql`SELECT id FROM patients WHERE full_name = ${params.patientName} AND is_active = true LIMIT 1`
      );
      if (existingPatient.rows.length === 0) {
        await tx.execute(sql`
          INSERT INTO patients (id, full_name, phone, national_id, age, is_active, created_at)
          VALUES (
            gen_random_uuid(),
            ${params.patientName},
            ${params.patientPhone || null},
            null,
            null,
            true,
            NOW()
          )
        `);
      } else if (params.patientPhone) {
        await tx.execute(sql`
          UPDATE patients SET phone = ${params.patientPhone}
          WHERE id = ${(existingPatient.rows[0] as any).id}
        `);
      }

      // 3b. Create admission
      const [admission] = await tx.insert(admissions).values({
        admissionNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionDate: new Date().toISOString().split("T")[0] as unknown as Date,
        doctorName: params.doctorName || null,
        notes: params.notes || null,
        status: "active" as any,
        paymentType: (params.paymentType === "contract" ? "contract" : "CASH") as any,
        insuranceCompany: params.insuranceCompany || null,
        surgeryTypeId: params.surgeryTypeId || null,
      } as any).returning();

      // 4. Find warehouse (prefer department-mapped, fallback to first)
      let warehouseId: string | null = null;
      if (params.departmentId) {
        const whRes = await tx.execute(
          sql`SELECT id FROM warehouses WHERE department_id = ${params.departmentId} LIMIT 1`
        );
        warehouseId = (whRes.rows[0] as any)?.id || null;
      }
      if (!warehouseId) {
        const whRes = await tx.execute(sql`SELECT id FROM warehouses ORDER BY created_at LIMIT 1`);
        warehouseId = (whRes.rows[0] as any)?.id || null;
      }
      if (!warehouseId) throw new Error("لا يوجد مخزن متاح — يرجى إنشاء مخزن أولاً");

      // 5. Generate invoice number
      const invCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
      const invSeq = parseInt((invCntRes.rows[0] as any)?.cnt || "0") + 1;
      const invoiceNumber = `PI-${String(invSeq).padStart(6, "0")}`;

      // 6. Create draft patient invoice linked to admission
      const [invoice] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionId: admission.id,
        warehouseId,
        departmentId: params.departmentId || null,
        doctorName: params.doctorName || null,
        patientType: (params.paymentType === "contract" ? "contract" : "cash") as any,
        contractName: params.paymentType === "contract" ? (params.insuranceCompany || null) : null,
        status: "draft" as any,
        invoiceDate: new Date().toISOString().split("T")[0] as unknown as Date,
        totalAmount: "0",
        discountAmount: "0",
        netAmount: "0",
        paidAmount: "0",
        version: 1,
      }).returning();

      // 7. Resolve accommodation service: explicit param > room's service
      const roomRes = await tx.execute(
        sql`SELECT r.service_id, COALESCE(s.base_price, '0') AS base_price, COALESCE(s.name_ar, 'إقامة') AS service_name_ar
            FROM beds b JOIN rooms r ON r.id = b.room_id
            LEFT JOIN services s ON s.id = r.service_id
            WHERE b.id = ${params.bedId} LIMIT 1`
      );
      const roomRow = roomRes.rows[0] as any;
      const effectiveServiceId: string | null = params.serviceId || roomRow?.service_id || null;
      const ratePerDay = params.serviceId
        ? String(((await tx.execute(sql`SELECT base_price FROM services WHERE id = ${params.serviceId} LIMIT 1`)).rows[0] as any)?.base_price ?? "0")
        : String(roomRow?.base_price ?? "0");
      const serviceNameAr: string = String(roomRow?.service_name_ar ?? "إقامة");

      // Open stay segment if we have a service
      let segmentId: string | undefined;
      if (effectiveServiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId: admission.id,
          serviceId: effectiveServiceId,
          invoiceId: invoice.id,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        segmentId = seg.id;

        // Immediately insert first stay line (يوم 1) so it appears at once — idempotent
        const admittedAt = new Date();
        const dateStr = admittedAt.toISOString().split("T")[0];
        const sourceId = `${invoice.id}:${seg.id}:${dateStr}`;
        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoice.id}, 'service', ${effectiveServiceId}, ${serviceNameAr + " – يوم 1"},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
          DO NOTHING
        `);

        // Recompute invoice totals after first line (will be updated again if OR_ROOM added)
        const allLines1 = await tx.select().from(patientInvoiceLines)
          .where(and(eq(patientInvoiceLines.headerId, invoice.id), eq(patientInvoiceLines.isVoid, false)));
        const totals1 = this.computeInvoiceTotals(allLines1, []);
        await tx.update(patientInvoiceHeaders).set({ ...totals1, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoice.id));
      }

      // 8. Insert OR_ROOM line if surgery type is specified
      if (params.surgeryTypeId) {
        const stRes = await tx.execute(
          sql`SELECT st.name_ar, st.category, COALESCE(scp.price, 0) AS price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${params.surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as any;
        if (st) {
          const orPrice = String(parseFloat(st.price || "0"));
          const orDesc = `فتح غرفة عمليات — ${st.name_ar}`;
          const orSourceId = `or_room:${invoice.id}:${params.surgeryTypeId}`;
          await tx.execute(sql`
            INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount,
               total_price, unit_level, sort_order, source_type, source_id)
            VALUES
              (${invoice.id}, 'service', ${orDesc}, '1', ${orPrice}, '0', '0',
               ${orPrice}, 'minor', 5, 'OR_ROOM', ${orSourceId})
            ON CONFLICT (source_type, source_id)
              WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
            DO NOTHING
          `);
          // Recompute totals after OR_ROOM line
          const allLines2 = await tx.select().from(patientInvoiceLines)
            .where(and(eq(patientInvoiceLines.headerId, invoice.id), eq(patientInvoiceLines.isVoid, false)));
          const totals2 = this.computeInvoiceTotals(allLines2, []);
          await tx.update(patientInvoiceHeaders).set({ ...totals2, updatedAt: new Date() })
            .where(eq(patientInvoiceHeaders.id, invoice.id));
        }
      }

      // 9. Mark bed OCCUPIED
      const [updatedBed] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admission.id,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.bedId)).returning();

      // 9. Audit (inside tx — commits with business data)
      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.bedId,
        action: "admit",
        newValues: JSON.stringify({ admissionId: admission.id, invoiceId: invoice.id, segmentId }),
      });

      return { bed: updatedBed, admissionId: admission.id, invoiceId: invoice.id, segmentId };
    });

    // Emit after commit
    console.log(`[BED_BOARD] Admitted ${params.patientName} → bed ${params.bedId} admission ${result.admissionId}`);
    return result;
  },

  async transferPatientBed(this: DatabaseStorage, params: {
    sourceBedId: string;
    targetBedId: string;
    newServiceId?: string;
    newInvoiceId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      // ── 1. Lock beds (deterministic order → no deadlock) ──────────────────
      const [id1, id2] = [params.sourceBedId, params.targetBedId].sort();
      await tx.execute(sql`SELECT id FROM beds WHERE id IN (${id1}, ${id2}) FOR UPDATE`);

      const srcRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.sourceBedId}`);
      const src = srcRes.rows[0] as any;
      if (!src) throw new Error("سرير المصدر غير موجود");
      if (src.status !== "OCCUPIED") throw new Error("لا يوجد مريض في سرير المصدر");

      const tgtRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.targetBedId}`);
      const tgt = tgtRes.rows[0] as any;
      if (!tgt) throw new Error("السرير الهدف غير موجود");
      if (tgt.status !== "EMPTY") throw new Error("السرير الهدف غير فارغ — اختر سريراً آخر");

      const admissionId = src.current_admission_id;

      // ── 2. Resolve target room grade (serviceId + price + name) ───────────
      const tgtRoomRes = await tx.execute(sql`
        SELECT r.service_id,
               COALESCE(s.base_price, '0') AS base_price,
               COALESCE(s.name_ar, 'إقامة') AS service_name_ar
        FROM beds b
        JOIN rooms r ON r.id = b.room_id
        LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
        WHERE b.id = ${params.targetBedId}
        LIMIT 1
      `);
      const tgtRoom = tgtRoomRes.rows[0] as any;

      // explicit override wins; otherwise use target room's service
      const effectiveServiceId: string | null =
        params.newServiceId || tgtRoom?.service_id || null;
      const ratePerDay = effectiveServiceId
        ? params.newServiceId
          ? String(((await tx.execute(
              sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
            )).rows[0] as any)?.base_price ?? "0")
          : String(tgtRoom?.base_price ?? "0")
        : "0";
      const serviceNameAr: string = String(tgtRoom?.service_name_ar ?? "إقامة");

      // ── 3. Handle active stay segment ─────────────────────────────────────
      const activeSegRes = await tx.execute(
        sql`SELECT id, invoice_id FROM stay_segments
            WHERE admission_id = ${admissionId} AND status = 'ACTIVE'
            LIMIT 1`
      );
      const activeSeg = activeSegRes.rows[0] as any;

      let invoiceId: string | null = activeSeg?.invoice_id || params.newInvoiceId || null;

      if (activeSeg) {
        // Close old segment
        await tx.update(staySegments)
          .set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, activeSeg.id));
      }

      // Open new segment (only when we have a grade)
      let newSegId: string | undefined;
      if (effectiveServiceId && invoiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId,
          serviceId: effectiveServiceId,
          invoiceId,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        newSegId = seg.id;

        // ── 4. Immediately add accommodation line to invoice ───────────────
        const dateStr = new Date().toISOString().split("T")[0];
        const sourceId = `transfer:${invoiceId}:${seg.id}:${dateStr}`;

        // Count existing STAY_ENGINE lines to generate a sensible label
        const lineCountRes = await tx.execute(
          sql`SELECT COUNT(*) AS cnt FROM patient_invoice_lines
              WHERE header_id = ${invoiceId}
                AND source_type = 'STAY_ENGINE'
                AND is_void = false`
        );
        const existingCount = parseInt((lineCountRes.rows[0] as any)?.cnt || "0");
        const lineDesc = `${serviceNameAr} — إقامة إضافية (تحويل)`;

        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoiceId}, 'service', ${effectiveServiceId}, ${lineDesc},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', ${existingCount + 10},
             'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false
              AND source_type IS NOT NULL
              AND source_id IS NOT NULL
          DO NOTHING
        `);

        // Recompute invoice totals
        const allLines = await tx.select().from(patientInvoiceLines)
          .where(and(
            eq(patientInvoiceLines.headerId, invoiceId),
            eq(patientInvoiceLines.isVoid, false),
          ));
        const totals = this.computeInvoiceTotals(allLines, []);
        await tx.update(patientInvoiceHeaders)
          .set({ ...totals, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId));
      }

      // ── 5. Atomic bed status swap ─────────────────────────────────────────
      // Source → NEEDS_CLEANING (freed)
      const [updatedSrc] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.sourceBedId)).returning();

      // Target → OCCUPIED
      const [updatedTgt] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admissionId,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.targetBedId)).returning();

      // ── 6. Audit ──────────────────────────────────────────────────────────
      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.sourceBedId,
        action: "transfer",
        newValues: JSON.stringify({
          admissionId,
          targetBedId: params.targetBedId,
          newServiceId: effectiveServiceId,
          invoiceId,
          newSegmentId: newSegId,
        }),
      });

      return {
        sourceBed: updatedSrc,
        targetBed: updatedTgt,
        invoiceId,
        newServiceId: effectiveServiceId,
        ratePerDay,
      };
    });

    console.log(
      `[BED_BOARD] Transfer ${params.sourceBedId} → ${params.targetBedId}` +
      (result.newServiceId ? ` | grade service=${result.newServiceId} rate=${result.ratePerDay}/day` : " | no grade"),
    );
    return result;
  },

  async dischargeFromBed(this: DatabaseStorage, bedId: string) {
    const result = await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "OCCUPIED") throw new Error("لا يوجد مريض في هذا السرير");

      const admissionId = bed.current_admission_id;

      // Close any active stay segment
      const segRes = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      for (const seg of segRes.rows as any[]) {
        await tx.update(staySegments).set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, seg.id));
      }

      // Discharge admission
      await tx.update(admissions).set({
        status: "discharged" as any,
        dischargeDate: new Date().toISOString().split("T")[0] as unknown as Date,
        updatedAt: new Date(),
      }).where(eq(admissions.id, admissionId));

      // Bed → NEEDS_CLEANING
      const [updatedBed] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "discharge",
        newValues: JSON.stringify({ admissionId }),
      });

      return { bed: updatedBed };
    });

    console.log(`[BED_BOARD] Discharged from bed ${bedId}`);
    return result;
  },

  async setBedStatus(this: DatabaseStorage, bedId: string, status: string) {
    return await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status === "OCCUPIED" && status !== "OCCUPIED") {
        throw new Error("لا يمكن تغيير حالة سرير مشغول");
      }

      const [updated] = await tx.update(beds).set({
        status,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "status_change",
        newValues: JSON.stringify({ from: bed.status, to: status }),
      });

      return updated;
    });
  },

  // Doctor Payable Transfers
  async getDoctorTransfers(this: DatabaseStorage, invoiceId: string): Promise<DoctorTransfer[]> {
    return db.select().from(doctorTransfers)
      .where(eq(doctorTransfers.invoiceId, invoiceId))
      .orderBy(asc(doctorTransfers.createdAt));
  },

  async transferToDoctorPayable(this: DatabaseStorage, params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer> {
    return await db.transaction(async (tx) => {
      const invRes = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${params.invoiceId} FOR UPDATE`);
      const inv = invRes.rows[0] as any;
      if (!inv) throw Object.assign(new Error("الفاتورة غير موجودة"), { statusCode: 404 });
      if (inv.status !== "finalized") throw Object.assign(new Error("يمكن التحويل فقط للفواتير المعتمدة"), { statusCode: 400 });

      const already = await tx.execute(sql`SELECT COALESCE(SUM(amount), 0) AS total FROM doctor_transfers WHERE invoice_id = ${params.invoiceId}`);
      const alreadyAmount = parseFloat((already.rows[0] as any)?.total ?? "0");
      const netAmount = parseFloat(inv.net_amount ?? "0");
      const requested = parseFloat(params.amount);
      const remaining = netAmount - alreadyAmount;

      if (requested <= 0) throw Object.assign(new Error("يجب أن يكون المبلغ أكبر من الصفر"), { statusCode: 400 });
      if (requested > remaining + 0.001) throw Object.assign(new Error(`المبلغ يتجاوز المتبقي القابل للتحويل (${remaining.toFixed(2)})`), { statusCode: 400 });

      const existing = await tx.execute(sql`SELECT id FROM doctor_transfers WHERE client_request_id = ${params.clientRequestId}`);
      if ((existing.rows as any[]).length > 0) {
        const [row] = await tx.select().from(doctorTransfers).where(eq(doctorTransfers.clientRequestId, params.clientRequestId));
        return row;
      }

      const [transfer] = await tx.insert(doctorTransfers).values({
        invoiceId: params.invoiceId,
        doctorName: params.doctorName,
        amount: params.amount,
        clientRequestId: params.clientRequestId,
        notes: params.notes ?? null,
      }).returning();

      await tx.insert(auditLog).values({
        tableName: "doctor_transfers",
        recordId: transfer.id,
        action: "create",
        newValues: JSON.stringify({ invoiceId: params.invoiceId, doctorName: params.doctorName, amount: params.amount }),
      });

      return transfer;
    });
  },

  // Doctor Settlements
  async getDoctorSettlements(this: DatabaseStorage, params?: { doctorName?: string }): Promise<(DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[]> {
    const rows = params?.doctorName
      ? await db.select().from(doctorSettlements)
          .where(eq(doctorSettlements.doctorName, params.doctorName))
          .orderBy(desc(doctorSettlements.createdAt))
      : await db.select().from(doctorSettlements).orderBy(desc(doctorSettlements.createdAt));

    const results: (DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[] = [];
    for (const row of rows) {
      const allocs = await db.select().from(doctorSettlementAllocations)
        .where(eq(doctorSettlementAllocations.settlementId, row.id))
        .orderBy(asc(doctorSettlementAllocations.createdAt));
      results.push({ ...row, allocations: allocs });
    }
    return results;
  },

  async getDoctorOutstandingTransfers(this: DatabaseStorage, doctorName: string): Promise<(DoctorTransfer & { settled: string; remaining: string })[]> {
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.client_request_id AS "clientRequestId",
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        dt.created_at        AS "createdAt",
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      WHERE dt.doctor_name = ${doctorName}
      GROUP BY dt.id
      HAVING (dt.amount - COALESCE(SUM(dsa.amount), 0)) > 0.001
      ORDER BY dt.transferred_at ASC
    `);
    return res.rows as any[];
  },

  async createDoctorSettlement(this: DatabaseStorage, params: {
    doctorName: string;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    settlementUuid: string;
    notes?: string;
    allocations?: { transferId: string; amount: string }[];
  }): Promise<DoctorSettlement & { allocations: DoctorSettlementAllocation[] }> {

    let settlementId: string | null = null;
    let glSourceId: string | null = null;

    await db.transaction(async (tx) => {
      // Idempotency check
      const existingRes = await tx.execute(sql`SELECT id FROM doctor_settlements WHERE settlement_uuid = ${params.settlementUuid}`);
      if ((existingRes.rows as any[]).length > 0) {
        settlementId = (existingRes.rows[0] as any).id;
        return;
      }

      const paymentTotal = parseMoney(params.amount);
      if (paymentTotal <= 0) throw Object.assign(new Error("المبلغ يجب أن يكون أكبر من الصفر"), { statusCode: 400 });

      // Resolve allocations: user-provided OR FIFO
      let resolvedAllocations: { transferId: string; amount: number }[];

      if (params.allocations && params.allocations.length > 0) {
        resolvedAllocations = params.allocations.map(a => ({ transferId: a.transferId, amount: parseMoney(a.amount) }));
      } else {
        // FIFO from outstanding transfers
        const outstanding = await tx.execute(sql`
          SELECT dt.id, dt.amount - COALESCE(SUM(dsa.amount), 0) AS remaining
          FROM doctor_transfers dt
          LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
          WHERE dt.doctor_name = ${params.doctorName}
          GROUP BY dt.id, dt.amount
          HAVING dt.amount - COALESCE(SUM(dsa.amount), 0) > 0.001
          ORDER BY dt.transferred_at ASC
        `);
        resolvedAllocations = [];
        let leftover = paymentTotal;
        for (const row of outstanding.rows as any[]) {
          if (leftover <= 0.001) break;
          const rem = parseMoney(String(row.remaining));
          const alloc = Math.min(rem, leftover);
          resolvedAllocations.push({ transferId: row.id, amount: alloc });
          leftover = parseMoney(roundMoney(leftover - alloc));
        }
        if (leftover > 0.001) throw Object.assign(new Error(`مبلغ التسوية (${paymentTotal.toFixed(2)}) يتجاوز المستحقات المتبقية`), { statusCode: 400 });
      }

      // Enforce sum == payment amount exactly (last absorbs delta)
      const sumAlloc = resolvedAllocations.reduce((s, a) => s + a.amount, 0);
      const delta = parseMoney(roundMoney(paymentTotal - sumAlloc));
      if (Math.abs(delta) > 0.1) throw Object.assign(new Error("مجموع التخصيصات لا يساوي مبلغ التسوية"), { statusCode: 400 });
      if (resolvedAllocations.length > 0 && Math.abs(delta) > 0) {
        resolvedAllocations[resolvedAllocations.length - 1].amount = parseMoney(roundMoney(resolvedAllocations[resolvedAllocations.length - 1].amount + delta));
      }

      // Insert settlement
      const [settlement] = await tx.insert(doctorSettlements).values({
        doctorName: params.doctorName,
        paymentDate: params.paymentDate,
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        settlementUuid: params.settlementUuid,
        notes: params.notes ?? null,
      }).returning();

      settlementId = settlement.id;
      glSourceId = settlement.id;

      // Insert allocations
      for (const alloc of resolvedAllocations) {
        await tx.insert(doctorSettlementAllocations).values({
          settlementId: settlement.id,
          transferId: alloc.transferId,
          amount: roundMoney(alloc.amount),
        });
      }

      // Audit
      await tx.insert(auditLog).values({
        tableName: "doctor_settlements",
        recordId: settlement.id,
        action: "create",
        newValues: JSON.stringify({ doctorName: params.doctorName, amount: params.amount, paymentMethod: params.paymentMethod, allocationCount: resolvedAllocations.length }),
      });
    });

    // GL posting AFTER commit (idempotent via generateJournalEntry)
    if (glSourceId) {
      try {
        await this.generateJournalEntry({
          sourceType: "doctor_payable_settlement",
          sourceDocumentId: glSourceId,
          reference: `SETTLE-${glSourceId.slice(0, 8).toUpperCase()}`,
          description: `تسوية مستحقات الطبيب: ${params.doctorName}`,
          entryDate: params.paymentDate,
          lines: [{ lineType: "doctor_payable_settlement", amount: params.amount }],
        });
        if (glSourceId) {
          await db.update(doctorSettlements)
            .set({ glPosted: true })
            .where(eq(doctorSettlements.id, glSourceId));
        }
      } catch (e) {
        console.log(`[DOCTOR_SETTLEMENT] GL skipped for ${glSourceId}: ${(e as Error).message}`);
      }
    }

    console.log(`[DOCTOR_SETTLEMENT] settlement=${settlementId} doctor=${params.doctorName} amount=${params.amount}`);

    // Return full record
    const [final] = await db.select().from(doctorSettlements).where(eq(doctorSettlements.id, settlementId!));
    const allocs = await db.select().from(doctorSettlementAllocations)
      .where(eq(doctorSettlementAllocations.settlementId, settlementId!))
      .orderBy(asc(doctorSettlementAllocations.createdAt));
    return { ...final, allocations: allocs };
  },

  // ==================== الخزن ====================

  async getTreasuriesSummary(this: DatabaseStorage): Promise<(Treasury & {
    glAccountCode: string; glAccountName: string;
    openingBalance: string; totalIn: string; totalOut: string; balance: string; hasPassword: boolean;
  })[]> {
    const rows = await db.execute(sql`
      SELECT
        t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
        a.code                AS gl_account_code,
        a.name                AS gl_account_name,
        COALESCE(a.opening_balance, 0) AS opening_balance,
        COALESCE(SUM(CASE WHEN tt.type = 'in'  THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN tt.type = 'out' THEN tt.amount::numeric ELSE 0 END), 0) AS total_out,
        CASE WHEN dp.gl_account_id IS NOT NULL THEN true ELSE false END AS has_password
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      LEFT JOIN treasury_transactions tt ON tt.treasury_id = t.id
      LEFT JOIN drawer_passwords dp ON dp.gl_account_id = t.gl_account_id
      GROUP BY t.id, a.code, a.name, a.opening_balance, dp.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => {
      const ob  = parseFloat(r.opening_balance)  || 0;
      const tin = parseFloat(r.total_in)  || 0;
      const tout = parseFloat(r.total_out) || 0;
      return {
        id: r.id, name: r.name, glAccountId: r.gl_account_id,
        isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
        glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
        openingBalance: ob.toFixed(2),
        totalIn:   tin.toFixed(2),
        totalOut:  tout.toFixed(2),
        balance:   (ob + tin - tout).toFixed(2),
        hasPassword: r.has_password,
      };
    });
  },

  async getTreasuries(this: DatabaseStorage): Promise<(Treasury & { glAccountCode: string; glAccountName: string })[]> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    }));
  },

  async getTreasury(this: DatabaseStorage, id: string): Promise<Treasury | undefined> {
    const [row] = await db.select().from(treasuries).where(eq(treasuries.id, id));
    return row;
  },

  async createTreasury(this: DatabaseStorage, data: InsertTreasury): Promise<Treasury> {
    const [row] = await db.insert(treasuries).values(data).returning();
    return row;
  },

  async updateTreasury(this: DatabaseStorage, id: string, data: Partial<InsertTreasury>): Promise<Treasury> {
    const [row] = await db.update(treasuries).set(data).where(eq(treasuries.id, id)).returning();
    if (!row) throw new Error("الخزنة غير موجودة");
    return row;
  },

  async deleteTreasury(this: DatabaseStorage, id: string): Promise<boolean> {
    const res = await db.delete(treasuries).where(eq(treasuries.id, id)).returning();
    return res.length > 0;
  },

  async getUserTreasury(this: DatabaseStorage, userId: string): Promise<(Treasury & { glAccountCode: string; glAccountName: string }) | null> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN accounts a ON a.id = t.gl_account_id
      WHERE ut.user_id = ${userId}
    `);
    if (!rows.rows.length) return null;
    const r = rows.rows[0] as any;
    return {
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    };
  },

  async getAllUserTreasuries(this: DatabaseStorage): Promise<{ userId: string; treasuryId: string; treasuryName: string; userName: string }[]> {
    const rows = await db.execute(sql`
      SELECT ut.user_id, ut.treasury_id, t.name AS treasury_name, u.full_name AS user_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN users u ON u.id = ut.user_id
      ORDER BY u.full_name
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.user_id, treasuryId: r.treasury_id,
      treasuryName: r.treasury_name, userName: r.user_name,
    }));
  },

  async assignUserTreasury(this: DatabaseStorage, userId: string, treasuryId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO user_treasuries (user_id, treasury_id)
      VALUES (${userId}, ${treasuryId})
      ON CONFLICT (user_id) DO UPDATE SET treasury_id = ${treasuryId}, created_at = NOW()
    `);
  },

  async removeUserTreasury(this: DatabaseStorage, userId: string): Promise<void> {
    await db.delete(userTreasuries).where(eq(userTreasuries.userId, userId));
  },

  async getTreasuryStatement(this: DatabaseStorage, params: { treasuryId: string; dateFrom?: string; dateTo?: string }): Promise<{ transactions: TreasuryTransaction[]; totalIn: string; totalOut: string; balance: string }> {
    let conds = [eq(treasuryTransactions.treasuryId, params.treasuryId)];
    if (params.dateFrom) conds.push(sql`${treasuryTransactions.transactionDate} >= ${params.dateFrom}`);
    if (params.dateTo)   conds.push(sql`${treasuryTransactions.transactionDate} <= ${params.dateTo}`);
    const rows = await db.select().from(treasuryTransactions)
      .where(and(...conds))
      .orderBy(treasuryTransactions.transactionDate, treasuryTransactions.createdAt);
    let totalIn = 0, totalOut = 0;
    for (const r of rows) {
      if (r.type === "in")  totalIn  += parseFloat(r.amount);
      else                  totalOut += parseFloat(r.amount);
    }
    return {
      transactions: rows,
      totalIn:  totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      balance:  (totalIn - totalOut).toFixed(2),
    };
  },

  async createTreasuryTransactionsForInvoice(this: DatabaseStorage, invoiceId: string, finalizationDate: string): Promise<void> {
    const payments = await db.execute(sql`
      SELECT p.id, p.amount, p.payment_method, p.treasury_id, p.notes, p.reference_number
      FROM patient_invoice_payments p
      WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL
    `);
    if (!payments.rows.length) return;
    const header = await db.execute(sql`
      SELECT h.invoice_number, pa.name AS patient_name
      FROM patient_invoice_headers h
      LEFT JOIN patients pa ON pa.id = h.patient_id
      WHERE h.id = ${invoiceId}
    `);
    const row = header.rows[0] as any;
    const invNum = row?.invoice_number ?? invoiceId;
    const patientName = row?.patient_name ?? "";
    for (const p of payments.rows as any[]) {
      const ref = p.reference_number ? `[${p.reference_number}] ` : "";
      const desc = `${ref}تحصيل فاتورة مريض رقم ${invNum}${patientName ? ` - ${patientName}` : ""}`;
      await db.execute(sql`
        INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
        VALUES (${p.treasury_id}, 'in', ${p.amount}, ${desc}, 'patient_invoice', ${p.id}, ${finalizationDate})
        ON CONFLICT (source_type, source_id, treasury_id) DO NOTHING
      `);
    }
  },
};

export default methods;
