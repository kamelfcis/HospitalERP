import { db } from "../db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
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
  users,
  type Pharmacy,
  type InsertPharmacy,
  type CashierShift,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

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
      sql`${accounts.code} LIKE '1211%' OR ${accounts.code} LIKE '1212%'`
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

  async collectInvoices(this: DatabaseStorage, shiftId: string, invoiceIds: string[], collectedBy: string, paymentDate?: string): Promise<{ receipts: Record<string, unknown>[]; totalCollected: string; count: number }> {
    const self = this;
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

      self.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch((err: unknown) => console.error("Auto journal completion for cashier collection failed:", err));

      return result;
    });
  },

  async refundInvoices(this: DatabaseStorage, shiftId: string, invoiceIds: string[], refundedBy: string, paymentDate?: string): Promise<{ receipts: Record<string, unknown>[]; totalRefunded: string; count: number }> {
    const self = this;
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");
      if (!shift.glAccountId) throw new Error("الوردية لا تحتوي على حساب خزنة - يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [collectSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));
      const [refundSum] = await tx.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
        .from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));
      const availableCash =
        parseFloat(shift.openingCash || "0") +
        parseFloat(collectSum?.total || "0") -
        parseFloat(refundSum?.total || "0");

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

      self.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch((err: unknown) => console.error("Auto journal completion for cashier refund failed:", err));

      return result;
    });
  },

  async getShiftTotals(this: DatabaseStorage, shiftId: string): Promise<{ totalCollected: string; totalRefunded: string; collectCount: number; refundCount: number; openingCash: string; netCash: string }> {
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
};

export default methods;
