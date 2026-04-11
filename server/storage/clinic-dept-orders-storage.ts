import { pool } from "../db";
import type { DatabaseStorage, DeptServiceOrderInput, DeptServiceBatchInput } from "./index";
import { convertQtyToMinor } from "../inventory-helpers";
import { addLinesToVisitInvoice } from "../services/encounter-routing";

const methods = {
  async saveDeptServiceOrder(this: DatabaseStorage, data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }> {
    if (data.visitId) {
      return this._saveDeptServiceOrderViaVisit(data);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE');

      const numRes = await client.query(`SELECT COALESCE(MAX(CASE WHEN invoice_number ~ '^[0-9]+$' THEN invoice_number::int ELSE 0 END), 0) + 1 AS next_num FROM patient_invoice_headers`);
      const invoiceNumber = String(numRes.rows[0].next_num);

      const totalAmount = data.services.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
      const discountAmount = data.discountAmount ?? (data.discountPercent ? totalAmount * data.discountPercent / 100 : 0);
      const netAmount = Math.max(totalAmount - discountAmount, 0);
      const paidAmount = data.orderType === 'cash' ? netAmount : 0;

      const invRes = await client.query(`
        INSERT INTO patient_invoice_headers
          (invoice_number, invoice_date, patient_name, patient_phone,
           department_id, doctor_name, patient_type, contract_name,
           total_amount, discount_amount, header_discount_amount, header_discount_percent,
           net_amount, paid_amount, status, notes, version, visit_group_id)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, 'finalized', $13, 1, $14)
        RETURNING id
      `, [
        invoiceNumber, data.patientName, data.patientPhone ?? null,
        data.departmentId, data.doctorName ?? null,
        data.orderType, data.contractName ?? null,
        totalAmount.toFixed(2), discountAmount.toFixed(2),
        data.discountPercent ?? 0, netAmount.toFixed(2), paidAmount.toFixed(2),
        data.notes ?? null,
        data.visitGroupId ?? null,
      ]);
      const invoiceId = invRes.rows[0].id;

      for (let i = 0; i < data.services.length; i++) {
        const svc = data.services[i];
        await client.query(`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description, quantity, unit_price, total_price, sort_order,
             source_type, source_id)
          VALUES ($1, 'service', $2, $3, $4, $5, $6, $7, 'dept_service_invoice', $1)
        `, [invoiceId, svc.serviceId, svc.serviceName, svc.quantity, svc.unitPrice.toFixed(2), (svc.quantity * svc.unitPrice).toFixed(2), i]);
      }

      if (data.orderType === 'cash' && data.treasuryId && netAmount > 0) {
        await client.query(`
          INSERT INTO patient_invoice_payments (header_id, amount, payment_method, treasury_id, notes)
          VALUES ($1, $2, 'cash', $3, 'سداد تلقائي من شاشة خدمات القسم')
        `, [invoiceId, netAmount.toFixed(2), data.treasuryId]);
        await client.query(`
          INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
          VALUES ($1, 'in', $2, $3, 'patient_invoice', $4, CURRENT_DATE)
        `, [data.treasuryId, netAmount.toFixed(2),
            `تحصيل خدمات قسم - فاتورة ${invoiceNumber} - ${data.patientName}`, invoiceId]);
      }

      const today = new Date();
      const tYear = today.getFullYear();
      const tMonth = today.getMonth() + 1;

      const whRes = await client.query(`
        SELECT w.id FROM warehouses w WHERE w.department_id = $1 AND w.is_active = true LIMIT 1
      `, [data.departmentId]);
      const warehouseId = whRes.rows[0]?.id;

      if (warehouseId) {
        for (const svc of data.services) {
          const consumRes = await client.query(`
            SELECT sc.item_id, sc.quantity AS consume_qty, sc.unit_level,
                   i.major_to_medium, i.major_to_minor, i.medium_to_minor, i.name_ar
            FROM service_consumables sc
            JOIN items i ON i.id = sc.item_id
            WHERE sc.service_id = $1
          `, [svc.serviceId]);

          for (const cons of consumRes.rows as Array<Record<string, unknown>>) {
            const consumeQty = parseFloat(cons.consume_qty as string) * svc.quantity;
            const qtyInMinor = convertQtyToMinor(consumeQty, (cons.unit_level as string) || 'minor', {
              nameAr: cons.name_ar as string,
              majorToMedium: cons.major_to_medium as string | null,
              majorToMinor: cons.major_to_minor as string | null,
              mediumToMinor: cons.medium_to_minor as string | null,
            });

            const lotsRes = await client.query(`
              SELECT id, qty_in_minor, purchase_price, expiry_date, expiry_month, expiry_year
              FROM inventory_lots
              WHERE item_id = $1 AND warehouse_id = $2 AND is_active = true
                AND qty_in_minor::numeric > 0
                AND (expiry_year IS NULL OR expiry_year > $3 OR (expiry_year = $3 AND expiry_month >= $4))
              ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
            `, [cons.item_id, warehouseId, tYear, tMonth]);

            let remaining = qtyInMinor;
            for (const lot of lotsRes.rows as Array<Record<string, unknown>>) {
              if (remaining <= 0) break;
              const available = parseFloat(lot.qty_in_minor as string);
              const deducted = Math.min(available, remaining);

              await client.query(`
                UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - $1::numeric, updated_at = NOW()
                WHERE id = $2
              `, [deducted.toFixed(4), lot.id]);

              await client.query(`
                INSERT INTO inventory_lot_movements
                  (lot_id, warehouse_id, tx_type, tx_date, qty_change_in_minor, unit_cost, reference_type, reference_id)
                VALUES ($1, $2, 'out', NOW(), $3, $4, 'dept_service', $5)
              `, [lot.id, warehouseId, (-deducted).toFixed(4), lot.purchase_price, invoiceId]);

              remaining -= deducted;
            }
          }
        }
      }

      if (data.clinicOrderIds?.length) {
        for (const orderId of data.clinicOrderIds) {
          await client.query(`
            UPDATE clinic_orders SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
            WHERE id = $3 AND status = 'pending'
          `, [invoiceId, data.userId, orderId]);
        }
      }

      await client.query(`
        INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
        VALUES ('patient_invoice_headers', $1, 'dept_service_create', $2, $3)
      `, [invoiceId, JSON.stringify({
        department: data.departmentId, patientName: data.patientName,
        doctor: data.doctorName, orderType: data.orderType,
        services: data.services.map(s => s.serviceName), total: netAmount,
      }), data.userId]);

      await client.query('COMMIT');
      return { invoiceId, invoiceNumber: parseInt(invoiceNumber) };
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async _saveDeptServiceOrderViaVisit(this: DatabaseStorage, data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }> {
    const encounterType = 'lab' as const;
    const result = await addLinesToVisitInvoice({
      visitId: data.visitId!,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientId: data.patientId,
      departmentId: data.departmentId,
      doctorName: data.doctorName,
      patientType: data.orderType === 'cash' ? 'cash' : 'contract',
      contractName: data.contractName,
      encounterType,
      encounterDoctorId: data.doctorId,
      createdBy: data.userId,
      encounterMetadata: { source: 'dept_service_order', notes: data.notes },
      lines: data.services.map((svc, i) => ({
        lineType: 'service' as const,
        serviceId: svc.serviceId,
        description: svc.serviceName,
        quantity: svc.quantity,
        unitPrice: svc.unitPrice,
        sortOrder: i,
        sourceType: 'dept_service_invoice',
        notes: data.notes ?? null,
      })),
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (data.orderType === 'cash' && data.treasuryId) {
        const totalAmount = data.services.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
        const discountAmount = data.discountAmount ?? (data.discountPercent ? totalAmount * data.discountPercent / 100 : 0);
        const netAmount = Math.max(totalAmount - discountAmount, 0);
        if (netAmount > 0) {
          await client.query(`
            INSERT INTO patient_invoice_payments (header_id, amount, payment_method, treasury_id, notes)
            VALUES ($1, $2, 'cash', $3, 'سداد تلقائي من شاشة خدمات القسم')
          `, [result.invoiceId, netAmount.toFixed(2), data.treasuryId]);
          await client.query(`
            INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
            VALUES ($1, 'in', $2, $3, 'patient_invoice', $4, CURRENT_DATE)
          `, [data.treasuryId, netAmount.toFixed(2),
              `تحصيل خدمات قسم - زيارة - ${data.patientName}`, result.invoiceId]);
          await client.query(`
            UPDATE patient_invoice_headers SET paid_amount = paid_amount::numeric + $2::numeric, updated_at = now() WHERE id = $1
          `, [result.invoiceId, netAmount.toFixed(2)]);
        }
      }

      if (data.clinicOrderIds?.length) {
        for (const orderId of data.clinicOrderIds) {
          await client.query(`
            UPDATE clinic_orders SET status = 'executed', executed_invoice_id = $1, executed_by = $2, executed_at = now()
            WHERE id = $3 AND status = 'pending'
          `, [result.invoiceId, data.userId, orderId]);
        }
      }

      await client.query(`
        INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
        VALUES ('patient_invoice_headers', $1, 'dept_service_via_visit', $2, $3)
      `, [result.invoiceId, JSON.stringify({
        visitId: data.visitId, department: data.departmentId,
        patientName: data.patientName, encounterId: result.encounterId,
        services: data.services.map(s => s.serviceName),
      }), data.userId]);

      await client.query('COMMIT');
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const invNum = parseInt(result.invoiceNumber.replace(/\D/g, '') || '0');
    return { invoiceId: result.invoiceId, invoiceNumber: invNum };
  },

  async saveDeptServiceOrderBatch(this: DatabaseStorage, data: DeptServiceBatchInput): Promise<{ results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> }> {
    const results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> = [];
    for (const patient of data.patients) {
      try {
        const result = await this.saveDeptServiceOrder({
          patientName: patient.patientName,
          patientPhone: patient.patientPhone,
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          departmentId: data.departmentId,
          orderType: data.orderType,
          contractName: data.contractName,
          treasuryId: data.treasuryId,
          services: data.services,
          discountPercent: data.discountPercent,
          discountAmount: data.discountAmount,
          notes: data.notes,
          userId: data.userId,
        });
        results.push({ patientName: patient.patientName, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber });
      } catch (err: unknown) {
        const _em = err instanceof Error ? err.message : String(err);
        results.push({ patientName: patient.patientName, error: _em });
      }
    }
    return { results };
  },

  async checkDeptServiceDuplicate(this: DatabaseStorage, patientName: string, serviceIds: string[], date: string): Promise<Array<{ serviceName: string; invoiceNumber: number }>> {
    if (!serviceIds.length) return [];
    const placeholders = serviceIds.map((_, i) => `$${i + 3}`).join(',');
    const res = await pool.query(`
      SELECT DISTINCT l.description AS service_name, h.invoice_number
      FROM patient_invoice_headers h
      JOIN patient_invoice_lines l ON l.header_id = h.id
      WHERE h.patient_name = $1
        AND h.invoice_date = $2
        AND h.status != 'cancelled'
        AND l.service_id IN (${placeholders})
    `, [patientName, date, ...serviceIds]);
    return res.rows.map((r: any) => ({ serviceName: r.service_name, invoiceNumber: r.invoice_number }));
  },
};

export default methods;
