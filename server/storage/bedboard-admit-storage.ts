import { db } from "../db";
import { normalizeArabicName } from "../services/patient-dedup";
import { eq, and, sql } from "drizzle-orm";
import { buildStayLineSQL } from "../lib/stay-engine";
import {
  admissions,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientVisits,
  staySegments,
  beds,
  auditLog,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import type { InsertAdmission } from "@shared/schema";

const methods = {
  async admitPatientToBed(this: DatabaseStorage, params: {
    bedId: string; patientName: string; patientPhone?: string; patientId?: string;
    departmentId?: string; serviceId?: string; doctorName?: string; notes?: string;
    paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string;
    contractMemberId?: string; isPackage?: boolean;
  }) {
    const result = await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as Record<string, unknown>;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "EMPTY") throw new Error("السرير غير فارغ — يرجى اختيار سرير آخر");

      const cntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM admissions`);
      const seq = parseInt((cntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const admissionNumber = `ADM-${String(seq).padStart(6, "0")}`;

      let resolvedPatientId: string | null = params.patientId || null;

      if (!resolvedPatientId) {
        const normName = normalizeArabicName(params.patientName);
        const existingPatient = await tx.execute(
          sql`SELECT id FROM patients WHERE LOWER(TRIM(full_name)) = LOWER(${params.patientName}) OR normalized_full_name = ${normName} LIMIT 1`
        );
        if (existingPatient.rows.length === 0) {
          const newPat = await tx.execute(sql`
            INSERT INTO patients (id, full_name, normalized_full_name, phone, national_id, age, is_active, created_at)
            VALUES (gen_random_uuid(), ${params.patientName}, ${normName}, ${params.patientPhone || null}, null, null, true, NOW())
            RETURNING id
          `);
          resolvedPatientId = (newPat.rows[0] as Record<string, unknown>).id as string;
        } else {
          resolvedPatientId = (existingPatient.rows[0] as Record<string, unknown>).id as string;
          if (params.patientPhone) {
            await tx.execute(sql`UPDATE patients SET phone = ${params.patientPhone} WHERE id = ${resolvedPatientId}`);
          }
        }
      }

      const [admission] = await tx.insert(admissions).values({
        admissionNumber,
        patientId: resolvedPatientId,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionDate: new Date().toISOString().split("T")[0] as unknown as Date,
        doctorName: params.doctorName || null,
        notes: params.notes || null,
        status: "active" as "active",
        paymentType: (params.paymentType === "contract" ? "contract" : "CASH") as "contract" | "CASH",
        insuranceCompany: params.insuranceCompany || null,
        surgeryTypeId: params.surgeryTypeId || null,
        departmentId: params.departmentId || null,
      } as unknown as InsertAdmission).returning();

      let warehouseId: string | null = null;
      if (params.departmentId) {
        const whRes = await tx.execute(
          sql`SELECT id FROM warehouses WHERE department_id = ${params.departmentId} LIMIT 1`
        );
        warehouseId = ((whRes.rows[0] as Record<string, unknown>)?.id as string | null | undefined) || null;
      }
      if (!warehouseId) {
        const whRes = await tx.execute(sql`SELECT id FROM warehouses ORDER BY created_at LIMIT 1`);
        warehouseId = ((whRes.rows[0] as Record<string, unknown>)?.id as string | null | undefined) || null;
      }
      if (!warehouseId) throw new Error("لا يوجد مخزن متاح — يرجى إنشاء مخزن أولاً");

      const pvCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_visits`);
      const pvSeq = parseInt((pvCntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const visitNumber = `VIS-${String(pvSeq).padStart(6, "0")}`;

      const [patientVisit] = await tx.insert(patientVisits).values({
        visitNumber,
        patientId: resolvedPatientId!,
        visitType: "inpatient",
        departmentId: params.departmentId || null,
        admissionId: admission.id,
        status: "open",
        notes: params.notes || null,
      } as any).returning();

      const invCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
      const invSeq = parseInt((invCntRes.rows[0] as Record<string, unknown>)?.cnt as string | undefined ?? "0") + 1;
      const invoiceNumber = `PI-${String(invSeq).padStart(6, "0")}`;

      let resolvedCompanyId: string | null = null;
      let resolvedContractId: string | null = null;
      let resolvedContractName: string | null = null;

      if (params.paymentType === "contract" && params.contractMemberId) {
        const memberRes = await tx.execute(
          sql`SELECT cm.id, cm.contract_id,
                     c.contract_name, c.company_id,
                     co.name_ar AS company_name
              FROM contract_members cm
              JOIN contracts c  ON c.id  = cm.contract_id
              JOIN companies co ON co.id = c.company_id
              WHERE cm.id = ${params.contractMemberId}
              LIMIT 1`
        );
        if (memberRes.rows.length > 0) {
          const mr = memberRes.rows[0] as Record<string, unknown>;
          resolvedCompanyId    = mr.company_id   as string;
          resolvedContractId   = mr.contract_id  as string;
          resolvedContractName = (mr.contract_name as string) || (mr.company_name as string);
        }
      } else if (params.paymentType === "contract" && params.insuranceCompany) {
        const compRes = await tx.execute(
          sql`SELECT id FROM companies WHERE name_ar = ${params.insuranceCompany} AND is_active = true LIMIT 1`
        );
        if (compRes.rows.length > 0) {
          resolvedCompanyId = (compRes.rows[0] as Record<string, unknown>).id as string;
          const contrRes = await tx.execute(
            sql`SELECT id, contract_name FROM contracts
                WHERE company_id = ${resolvedCompanyId} AND is_active = true
                ORDER BY created_at DESC LIMIT 1`
          );
          if (contrRes.rows.length > 0) {
            const cr = contrRes.rows[0] as Record<string, unknown>;
            resolvedContractId = cr.id as string;
            resolvedContractName = (cr.contract_name as string) || params.insuranceCompany;
          }
        }
        resolvedContractName = resolvedContractName || params.insuranceCompany;
      }

      const [invoice] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionId: admission.id,
        visitId: patientVisit.id,
        warehouseId,
        departmentId: params.departmentId || null,
        doctorName: admission.doctorName || null,
        patientId: resolvedPatientId,
        patientType: (params.paymentType === "contract" ? "contract" : "cash") as "contract" | "cash",
        contractName: resolvedContractName,
        companyId: resolvedCompanyId,
        contractId: resolvedContractId,
        contractMemberId: params.contractMemberId || null,
        isPackage: params.isPackage ?? false,
        status: "draft" as "draft",
        invoiceDate: new Date().toISOString().split("T")[0] as unknown as Date,
        totalAmount: "0",
        discountAmount: "0",
        netAmount: "0",
        paidAmount: "0",
        version: 1,
      } as unknown as import("@shared/schema").InsertPatientInvoiceHeader).returning();

      const roomRes = await tx.execute(
        sql`SELECT r.service_id, COALESCE(s.base_price, '0') AS base_price, COALESCE(s.name_ar, 'إقامة') AS service_name_ar
            FROM beds b JOIN rooms r ON r.id = b.room_id
            LEFT JOIN services s ON s.id = r.service_id
            WHERE b.id = ${params.bedId} LIMIT 1`
      );
      const roomRow = roomRes.rows[0] as Record<string, unknown>;
      const effectiveServiceId: string | null = params.serviceId || (roomRow?.service_id as string | null | undefined) || null;
      const ratePerDay = params.serviceId
        ? String(((await tx.execute(sql`SELECT base_price FROM services WHERE id = ${params.serviceId} LIMIT 1`)).rows[0] as Record<string, unknown>)?.base_price ?? "0")
        : String(roomRow?.base_price ?? "0");
      const serviceNameAr: string = String(roomRow?.service_name_ar ?? "إقامة");

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

        const admittedAt = new Date();
        const dateStr = admittedAt.toISOString().split("T")[0];
        const sourceId = `${invoice.id}:${seg.id}:${dateStr}`;
        await tx.execute(buildStayLineSQL({
          invoiceId:   invoice.id,
          serviceId:   effectiveServiceId,
          description: `${serviceNameAr} – يوم 1`,
          ratePerDay,
          sourceId,
          sortOrder:   0,
        }));

        const allLines1 = await tx.select().from(patientInvoiceLines)
          .where(and(eq(patientInvoiceLines.headerId, invoice.id as string), eq(patientInvoiceLines.isVoid, false)));
        const totals1 = this.computeInvoiceTotals(allLines1 as unknown as Record<string, unknown>[], []);
        await tx.update(patientInvoiceHeaders).set({ ...totals1, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoice.id as string));
      }

      if (params.surgeryTypeId) {
        const isPackage = params.isPackage ?? false;
        const stRes = await tx.execute(
          sql`SELECT st.name_ar, st.category, COALESCE(scp.price, 0) AS price,
                     scp.service_id, scp.package_service_id
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${params.surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as Record<string, unknown>;
        if (st) {
          const linkedServiceId = isPackage
            ? (st.package_service_id as string | null)
            : (st.service_id as string | null);

          let orPrice = String(parseFloat((st.price as string | null) || "0"));
          let orDesc = isPackage
            ? `باكدج عملية — ${st.name_ar}`
            : `فتح غرفة عمليات — ${st.name_ar}`;

          if (linkedServiceId) {
            const svcRes = await tx.execute(
              sql`SELECT base_price, name_ar FROM services WHERE id = ${linkedServiceId} LIMIT 1`
            );
            const svc = svcRes.rows[0] as Record<string, unknown> | undefined;
            if (svc) {
              orPrice = String(parseFloat((svc.base_price as string | null) || orPrice));
              orDesc = `${svc.name_ar} — ${st.name_ar}`;
            }
          }

          const orSourceId = `or_room:${invoice.id}:${params.surgeryTypeId}`;
          await tx.execute(sql`
            INSERT INTO patient_invoice_lines
              (header_id, line_type, service_id, description, quantity, unit_price, discount_percent, discount_amount,
               total_price, unit_level, sort_order, source_type, source_id, business_classification)
            VALUES
              (${invoice.id}, 'service', ${linkedServiceId}, ${orDesc}, '1', ${orPrice}, '0', '0',
               ${orPrice}, 'minor', 5, 'OR_ROOM', ${orSourceId}, 'medical_service')
            ON CONFLICT (source_type, source_id)
              WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
            DO NOTHING
          `);
          const allLines2 = await tx.select().from(patientInvoiceLines)
            .where(and(eq(patientInvoiceLines.headerId, invoice.id as string), eq(patientInvoiceLines.isVoid, false)));
          const totals2 = this.computeInvoiceTotals(allLines2 as unknown as Record<string, unknown>[], []);
          await tx.update(patientInvoiceHeaders).set({ ...totals2, updatedAt: new Date() })
            .where(eq(patientInvoiceHeaders.id, invoice.id as string));
        }
      }

      const [updatedBed] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admission.id,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.bedId,
        action: "admit",
        newValues: JSON.stringify({ admissionId: admission.id, invoiceId: invoice.id, segmentId, visitId: patientVisit.id, visitNumber }),
      });

      return { bed: updatedBed, admissionId: admission.id, invoiceId: invoice.id, segmentId, visitId: patientVisit.id, visitNumber };
    });

    console.log(`[BED_BOARD] Admitted ${params.patientName} → bed ${params.bedId} admission ${result.admissionId} visit ${result.visitNumber}`);
    return result;
  },
};

export default methods;
