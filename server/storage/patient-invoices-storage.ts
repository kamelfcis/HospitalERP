import { db, pool } from "../db";
import { eq, desc, and, sql, asc, gte, lte, ilike } from "drizzle-orm";
import {
  services,
  departments,
  items,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  auditLog,
} from "@shared/schema";
import type {
  PatientInvoiceHeader,
  PatientInvoiceWithDetails,
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
    const maxNum = parseInt((result.rows[0] as any).max_num || "0") || 0;
    return `RCP-${String(maxNum + 1 + offset).padStart(6, "0")}`;
  },

  async getPatientInvoices(this: DatabaseStorage, filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(patientInvoiceHeaders.status, filters.status as any));
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
      data: data.map(r => ({ ...r.header, department: r.department })),
      total,
    };
  },

  async getPatientInvoice(this: DatabaseStorage, id: string): Promise<PatientInvoiceWithDetails | undefined> {
    const [headerRow] = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
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

    return {
      ...headerRow.header,
      department: headerRow.department || undefined,
      lines: lines.map(l => ({ ...l.line, service: l.service || undefined, item: l.item || undefined })),
      payments,
    };
  },

  async createPatientInvoice(this: DatabaseStorage, header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(patientInvoiceHeaders).values({ ...header, version: 1 }).returning();

      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: created.id, sortOrder: i }))
        );
      }

      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: created.id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      await tx.update(patientInvoiceHeaders).set(totals).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  },

  async updatePatientInvoice(this: DatabaseStorage, id: string, header: any, lines: any[], payments: any[], expectedVersion?: number): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as any;
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      if (expectedVersion != null && existing.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const newVersion = (existing.version || 1) + 1;

      const oldLines = await tx.select().from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.headerId, id));

      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, id));
      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: id, sortOrder: i }))
        );
      }

      await tx.delete(patientInvoicePayments).where(eq(patientInvoicePayments.headerId, id));
      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      const existingHeaderDiscount = parseMoney(existing.header_discount_amount || "0");
      const adjustedNetAmount = roundMoney(parseMoney(totals.netAmount) - existingHeaderDiscount);
      await tx.update(patientInvoiceHeaders).set({
        ...header,
        ...totals,
        netAmount: adjustedNetAmount,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(patientInvoiceHeaders.id, id));

      const oldStayLines = oldLines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      const newStayLines = lines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      for (const ns of newStayLines) {
        const match = oldStayLines.find((os: any) => os.sourceId === ns.sourceId);
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
        if (!newStayLines.find((ns: any) => ns.sourceId === os.sourceId)) {
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

  async finalizePatientInvoice(this: DatabaseStorage, id: string, expectedVersion?: number): Promise<PatientInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
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
            sql`SELECT id, name_ar, has_expiry, major_to_medium, major_to_minor, medium_to_minor FROM items WHERE id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})`
          );
          const invItemMap: Record<string, any> = {};
          for (const row of invItemRows.rows as any[]) invItemMap[row.id] = row;

          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();

          const stockLines: Array<{
            lineIdx: number; itemId: string; qtyMinor: number;
            hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
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
            let qtyMinor = qty;
            if (unitLevel === "major") {
              let majorToMinor = parseFloat(String(item.major_to_minor)) || 0;
              if (majorToMinor <= 0) {
                const majorToMedium = parseFloat(String(item.major_to_medium)) || 1;
                const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
                majorToMinor = majorToMedium * mediumToMinor;
              }
              qtyMinor = qty * (majorToMinor || 1);
            } else if (unitLevel === "medium") {
              const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
              qtyMinor = qty * mediumToMinor;
            }

            stockLines.push({
              lineIdx: li,
              itemId: line.itemId!,
              qtyMinor,
              hasExpiry: !!item.has_expiry,
              expiryMonth: line.expiryMonth,
              expiryYear: line.expiryYear,
            });
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
        }
      }

      const recomputedTotals = this.computeInvoiceTotals(dbLines, dbPayments);
      const newVersion = (locked.version || 1) + 1;

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
      const invoice = lockResult.rows?.[0] as any;
      if (!invoice) throw new Error("فاتورة المريض غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled" as any,
        version: (invoice.version || 1) + 1,
        notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
      }).where(eq(patientInvoiceHeaders.id, id));
      return true;
    });
  },

  async distributePatientInvoice(this: DatabaseStorage, sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${sourceId} FOR UPDATE`);
      const source = lockResult.rows?.[0] as any;
      if (!source) throw new Error("فاتورة المصدر غير موجودة");
      if (source.status !== "draft") throw new Error("لا يمكن توزيع فاتورة نهائية");

      const sourceLines = await tx.select().from(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, sourceId)).orderBy(asc(patientInvoiceLines.sortOrder));
      if (sourceLines.length === 0) throw new Error("الفاتورة لا تحتوي على بنود");

      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter(l => l.itemId).map(l => l.itemId!)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: source.invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: source.patientType,
          departmentId: source.departmentId,
          warehouseId: source.warehouseId,
          doctorName: source.doctorName,
          contractName: source.contractName,
          notes: source.notes,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
          let share: number;
          if (pi === numPatients - 1) {
            share = +(totalQty - allocatedSoFar[li]).toFixed(4);
          } else {
            const intQty = Math.round(totalQty);
            const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
            if (isInt && intQty >= numPatients) {
              const baseShare = Math.floor(intQty / numPatients);
              const remainder = intQty - baseShare * numPatients;
              share = pi < remainder ? baseShare + 1 : baseShare;
            } else {
              share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
            }
          }
          allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId,
            itemId: cl.itemId,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId,
            expiryMonth: cl.expiryMonth,
            expiryYear: cl.expiryYear,
            priceSource: cl.priceSource,
            doctorName: cl.doctorName,
            nurseName: cl.nurseName,
            notes: cl.notes,
            sortOrder: cl.sortOrder,
            sourceType: "dist_from_invoice",
            sourceId: `${sourceId}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled",
        notes: `[توزيع على ${numPatients} مرضى]`,
        version: (parseInt(String(source.version)) || 1) + 1,
      }).where(eq(patientInvoiceHeaders.id, sourceId));

      return createdInvoices;
    });
  },

  async distributePatientInvoiceDirect(this: DatabaseStorage, data: {
    patients: { name: string; phone?: string }[];
    lines: any[];
    invoiceDate: string;
    departmentId?: string | null;
    warehouseId?: string | null;
    doctorName?: string | null;
    patientType?: string;
    contractName?: string | null;
    notes?: string | null;
  }): Promise<PatientInvoiceHeader[]> {
    const { patients, lines: sourceLines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = data;
    if (sourceLines.length === 0) throw new Error("لا توجد بنود للتوزيع");

    return await db.transaction(async (tx) => {
      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter((l: any) => l.itemId).map((l: any) => l.itemId)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line: any) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: (patientType || "cash") as "contract" | "cash",
          departmentId: departmentId || null,
          warehouseId: warehouseId || null,
          doctorName: doctorName || null,
          contractName: contractName || null,
          notes: notes || null,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        const DIRECT_SOURCE_TYPES = new Set(["STAY_ENGINE", "OR_ROOM"]);
        const DIRECT_SERVICE_TYPES = new Set(["ACCOMMODATION", "OPERATING_ROOM"]);
        const isDirectLine = (cl: any) =>
          DIRECT_SOURCE_TYPES.has(cl.sourceType) || DIRECT_SERVICE_TYPES.has(cl.serviceType);

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          let share: number;
          if (isDirectLine(cl)) {
            share = totalQty;
          } else {
            if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
            if (pi === numPatients - 1) {
              share = +(totalQty - allocatedSoFar[li]).toFixed(4);
            } else {
              const intQty = Math.round(totalQty);
              const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
              if (isInt && intQty >= numPatients) {
                const baseShare = Math.floor(intQty / numPatients);
                const remainder = intQty - baseShare * numPatients;
                share = pi < remainder ? baseShare + 1 : baseShare;
              } else {
                share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
              }
            }
            allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);
          }

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId || null,
            itemId: cl.itemId || null,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId || null,
            expiryMonth: cl.expiryMonth || null,
            expiryYear: cl.expiryYear || null,
            priceSource: cl.priceSource || null,
            doctorName: cl.doctorName || null,
            nurseName: cl.nurseName || null,
            notes: cl.notes || null,
            sortOrder: cl.sortOrder || 0,
            sourceType: isDirectLine(cl) ? (cl.sourceType || cl.serviceType) : "dist_direct",
            sourceId: isDirectLine(cl) && cl.sourceId
              ? `${cl.sourceId}:p${pi}`
              : `${invoiceDate}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      return createdInvoices;
    });
  },

  async searchSaleInvoicesForReturn(this: DatabaseStorage, params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string }): Promise<any[]> {
    let resolvedItemId: string | null = null;

    if (params.itemBarcode) {
      const item = await db.execute(sql`SELECT item_id FROM item_barcodes WHERE barcode_value = ${params.itemBarcode} AND is_active = true LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as any).item_id;
    } else if (params.itemCode) {
      const item = await db.execute(sql`SELECT id FROM items WHERE item_code = ${params.itemCode} LIMIT 1`);
      if (!item.rows.length) return [];
      resolvedItemId = (item.rows[0] as any).id;
    } else if (params.itemId) {
      resolvedItemId = params.itemId;
    }

    let whereExtra = "";
    const vals: any[] = [];
    let idx = 1;

    if (params.invoiceNumber) {
      whereExtra += ` AND h.invoice_number = $${idx++}`;
      vals.push(parseInt(params.invoiceNumber));
    }
    if (params.receiptBarcode) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM cashier_receipts cr WHERE cr.invoice_id = h.id AND cr.receipt_number = $${idx++})`;
      vals.push(parseInt(params.receiptBarcode));
    }
    if (resolvedItemId) {
      whereExtra += ` AND EXISTS (SELECT 1 FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id AND sl.item_id = $${idx++})`;
      vals.push(resolvedItemId);
    }
    if (params.dateFrom) {
      whereExtra += ` AND h.invoice_date >= $${idx++}::date`;
      vals.push(params.dateFrom);
    }
    if (params.dateTo) {
      whereExtra += ` AND h.invoice_date <= $${idx++}::date`;
      vals.push(params.dateTo);
    }
    if (params.warehouseId) {
      whereExtra += ` AND h.warehouse_id = $${idx++}`;
      vals.push(params.warehouseId);
    }

    const q = `
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_name AS "customerName", h.net_total AS "netTotal",
             (SELECT COUNT(*)::int FROM sales_invoice_lines sl WHERE sl.invoice_id = h.id) AS "itemCount"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.is_return = false AND h.status = 'finalized'${whereExtra}
      ORDER BY h.invoice_date DESC, h.invoice_number DESC
      LIMIT 50
    `;
    const result = await pool.query(q, vals);
    return result.rows;
  },

  async getSaleInvoiceForReturn(this: DatabaseStorage, invoiceId: string): Promise<any | null> {
    const hdr = await db.execute(sql`
      SELECT h.id, h.invoice_number AS "invoiceNumber", h.invoice_date AS "invoiceDate",
             h.warehouse_id AS "warehouseId", w.name_ar AS "warehouseName",
             h.customer_type AS "customerType", h.customer_name AS "customerName",
             h.subtotal, h.discount_percent AS "discountPercent",
             h.discount_value AS "discountValue", h.net_total AS "netTotal"
      FROM sales_invoice_headers h
      LEFT JOIN warehouses w ON w.id = h.warehouse_id
      WHERE h.id = ${invoiceId} AND h.is_return = false AND h.status = 'finalized'
    `);
    if (!hdr.rows.length) return null;
    const header = hdr.rows[0] as any;

    const lines = await db.execute(sql`
      SELECT l.id, l.line_no AS "lineNo", l.item_id AS "itemId",
             i.item_code AS "itemCode", i.name_ar AS "itemNameAr",
             l.unit_level AS "unitLevel", l.qty, l.qty_in_minor AS "qtyInMinor",
             l.sale_price AS "salePrice", l.line_total AS "lineTotal",
             l.expiry_month AS "expiryMonth", l.expiry_year AS "expiryYear", l.lot_id AS "lotId",
             i.major_unit_name AS "majorUnitName", i.medium_unit_name AS "mediumUnitName",
             i.minor_unit_name AS "minorUnitName",
             i.major_to_minor AS "majorToMinor", i.medium_to_minor AS "mediumToMinor",
             COALESCE((
               SELECT SUM(ABS(rl.qty_in_minor::numeric))
               FROM sales_invoice_lines rl
               JOIN sales_invoice_headers rh ON rh.id = rl.invoice_id
               WHERE rh.original_invoice_id = ${invoiceId}
                 AND rh.is_return = true
                 AND rh.status IN ('finalized', 'collected')
                 AND rl.item_id = l.item_id
                 AND COALESCE(rl.lot_id,'') = COALESCE(l.lot_id,'')
             ), 0)::numeric AS "previouslyReturnedMinor"
      FROM sales_invoice_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.invoice_id = ${invoiceId}
      ORDER BY l.line_no
    `);
    header.lines = lines.rows;
    return header;
  },

  async createSalesReturn(this: DatabaseStorage, data: {
    originalInvoiceId: string; warehouseId: string;
    returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[];
    discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string;
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      const origHeader = await tx.execute(sql`
        SELECT id, invoice_date, warehouse_id, customer_type, customer_name, contract_company, pharmacy_id, status, is_return
        FROM sales_invoice_headers WHERE id = ${data.originalInvoiceId} FOR UPDATE
      `);
      const orig = origHeader.rows[0] as any;
      if (!orig) throw new Error("الفاتورة الأصلية غير موجودة");
      if (orig.is_return) throw new Error("لا يمكن إرجاع فاتورة مرتجع");
      if (orig.status !== "finalized") throw new Error("الفاتورة الأصلية غير مرحّلة");
      if (orig.warehouse_id !== data.warehouseId) throw new Error("المخزن لا يتطابق مع فاتورة البيع الأصلية");

      const origLines = await tx.execute(sql`
        SELECT l.id, l.item_id, l.unit_level, l.qty_in_minor, l.sale_price, l.line_total, l.lot_id,
               COALESCE((
                 SELECT SUM(ABS(rl2.qty_in_minor::numeric))
                 FROM sales_invoice_lines rl2
                 JOIN sales_invoice_headers rh2 ON rh2.id = rl2.invoice_id
                 WHERE rh2.original_invoice_id = ${data.originalInvoiceId}
                   AND rh2.is_return = true AND rh2.status IN ('finalized', 'collected')
                   AND rl2.item_id = l.item_id AND COALESCE(rl2.lot_id,'') = COALESCE(l.lot_id,'')
               ), 0)::numeric AS "previouslyReturnedMinor"
        FROM sales_invoice_lines l WHERE l.invoice_id = ${data.originalInvoiceId}
      `);
      const origLineMap = new Map<string, any>();
      for (const ol of origLines.rows as any[]) {
        origLineMap.set(ol.id, ol);
      }

      const validatedLines: typeof data.returnLines = [];
      for (const rl of data.returnLines) {
        const origLine = origLineMap.get(rl.originalLineId);
        if (!origLine) throw new Error(`السطر ${rl.originalLineId} لا ينتمي للفاتورة الأصلية`);
        if (origLine.item_id !== rl.itemId) throw new Error(`الصنف لا يتطابق مع السطر الأصلي`);

        const availMinor = parseFloat(origLine.qty_in_minor) - parseFloat(origLine.previouslyReturnedMinor);
        let returnMinor = parseFloat(rl.qtyInMinor);
        if (returnMinor <= 0) continue;
        if (returnMinor > availMinor) returnMinor = availMinor;
        if (returnMinor <= 0) continue;

        const pricePerMinor = parseFloat(origLine.line_total) / (parseFloat(origLine.qty_in_minor) || 1);
        const lineTotal = Math.round(returnMinor * pricePerMinor * 100) / 100;

        validatedLines.push({
          ...rl,
          qtyInMinor: String(returnMinor),
          salePrice: origLine.sale_price,
          lineTotal: lineTotal.toFixed(2),
          lotId: origLine.lot_id,
        });
      }

      if (!validatedLines.length) throw new Error("لا توجد كميات صالحة للإرجاع");

      const subtotal = validatedLines.reduce((s, l) => s + parseFloat(l.lineTotal), 0);
      const discountValue = data.discountType === "percent"
        ? subtotal * (parseFloat(data.discountPercent) || 0) / 100
        : Math.min(parseFloat(data.discountValue) || 0, subtotal);
      const netTotal = Math.max(0, subtotal - discountValue);

      const nextNumResult = await tx.execute(sql`
        SELECT COALESCE(MAX(invoice_number), 0) + 1 AS "nextNum" FROM sales_invoice_headers
      `);
      const nextInvoiceNumber = (nextNumResult.rows[0] as any).nextNum;

      const hdr = await tx.execute(sql`
        INSERT INTO sales_invoice_headers
          (invoice_number, invoice_date, warehouse_id, pharmacy_id, customer_type, customer_name, contract_company,
           status, subtotal, discount_type, discount_percent, discount_value, net_total,
           notes, created_by, is_return, original_invoice_id, finalized_at, finalized_by)
        VALUES
          (${nextInvoiceNumber}, now()::date, ${orig.warehouse_id}, ${orig.pharmacy_id ?? null},
           ${orig.customer_type ?? 'cash'}, ${orig.customer_name ?? null}, ${orig.contract_company ?? null},
           'finalized', ${subtotal.toFixed(2)}, ${data.discountType},
           ${data.discountType === 'percent' ? data.discountPercent : '0'},
           ${discountValue.toFixed(2)}, ${netTotal.toFixed(2)},
           ${data.notes || null}, ${data.createdBy}, true, ${data.originalInvoiceId}, now(), ${data.createdBy})
        RETURNING id, invoice_number AS "invoiceNumber"
      `);
      const returnId = (hdr.rows[0] as any).id;
      const returnNumber = (hdr.rows[0] as any).invoiceNumber;

      for (let i = 0; i < validatedLines.length; i++) {
        const rl = validatedLines[i];
        await tx.execute(sql`
          INSERT INTO sales_invoice_lines
            (invoice_id, line_no, item_id, unit_level, qty, qty_in_minor, sale_price, line_total, expiry_month, expiry_year, lot_id)
          VALUES
            (${returnId}, ${i + 1}, ${rl.itemId}, ${rl.unitLevel}, ${rl.qty}, ${rl.qtyInMinor},
             ${rl.salePrice}, ${rl.lineTotal}, ${rl.expiryMonth ?? null}, ${rl.expiryYear ?? null}, ${rl.lotId ?? null})
        `);

        if (rl.lotId) {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = ${rl.lotId}
          `);
        } else {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${parseFloat(rl.qtyInMinor)}, updated_at = NOW()
            WHERE id = (
              SELECT id FROM inventory_lots
              WHERE item_id = ${rl.itemId} AND warehouse_id = ${orig.warehouse_id}
                AND COALESCE(expiry_month, 0) = COALESCE(${rl.expiryMonth ?? null}, 0)
                AND COALESCE(expiry_year, 0) = COALESCE(${rl.expiryYear ?? null}, 0)
              ORDER BY expiry_year NULLS LAST, expiry_month NULLS LAST
              LIMIT 1
            )
          `);
        }
      }

      return { id: returnId, invoiceNumber: returnNumber, netTotal: netTotal.toFixed(2) };
    });
  },

};

export default methods;
