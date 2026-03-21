/**
 * clinic-dashboard-storage.ts
 *
 * Read-only aggregation functions for the OPD operational dashboards.
 * All queries are single-pass SQL — no N+1, no write-back.
 *
 * Scope rules enforced by callers (routes):
 *   Doctor:    doctorId resolved from user session
 *   Secretary: clinicId validated against user assignment
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DoctorDailySummaryData {
  date: string;
  doctorId: string;

  /** Appointment counts */
  totalPatients: number;
  waiting: number;
  inConsultation: number;
  done: number;
  cancelled: number;
  noShow: number;

  /** Service orders (lab / radiology grouped — cannot distinguish reliably) */
  serviceOrdersTotal: number;
  serviceOrdersPending: number;
  serviceOrdersExecuted: number;

  /** Pharmacy / prescription orders */
  pharmacyOrdersTotal: number;
  pharmacyOrdersPending: number;
  pharmacyOrdersExecuted: number;

  /** Financial — from clinic_appointments (persisted at booking time) */
  grossConsultationFee: number;
  doctorDeductionTotal: number;
}

export interface PaymentBreakdownRow {
  paymentType: string;
  count: number;
  grossAmount: number;
  paidAmount: number;
}

export interface SecretaryDailySummaryData {
  date: string;
  clinicId: string;

  /** Appointment counts */
  totalBookings: number;
  waiting: number;
  inConsultation: number;
  done: number;
  cancelled: number;
  noShow: number;

  /** Revenue aggregates */
  grossTotal: number;
  paidTotal: number;

  /** Payment type breakdown */
  paymentBreakdown: PaymentBreakdownRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "0"), 10);
  return isNaN(n) ? 0 : n;
}

function toFloat(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? 0 : n;
}

// ── Storage Functions ────────────────────────────────────────────────────────

/**
 * getDoctorDailySummary
 *
 * Returns operational counts and financial totals for a single doctor on a
 * given date. Two SQL queries:
 *   1. Appointment status breakdown + fee aggregates
 *   2. Order counts by type and status (joined through appointments for date scope)
 *
 * Both queries use existing indexes:
 *   - idx_clinic_appts_doctor_date (doctor_id, appointment_date)
 *   - idx_clinic_orders_doctor_id + idx_clinic_orders_appointment_id
 */
export async function getDoctorDailySummary(
  doctorId: string,
  date: string
): Promise<DoctorDailySummaryData> {
  // ── 1. Appointment aggregates ──────────────────────────────────────────
  const apptResult = await db.execute(sql`
    SELECT
      COUNT(*)                                                      AS total_patients,
      COUNT(*) FILTER (WHERE status = 'waiting')                   AS waiting,
      COUNT(*) FILTER (WHERE status = 'in_consultation')           AS in_consultation,
      COUNT(*) FILTER (WHERE status = 'done')                      AS done,
      COUNT(*) FILTER (WHERE status = 'cancelled')                 AS cancelled,
      COUNT(*) FILTER (WHERE status = 'no_show')                   AS no_show,
      COALESCE(SUM(gross_amount),          0)                      AS gross_total,
      COALESCE(SUM(doctor_deduction_amount), 0)                    AS deduction_total
    FROM clinic_appointments
    WHERE doctor_id        = ${doctorId}
      AND appointment_date = ${date}::date
  `);
  const a = (apptResult as any).rows[0] ?? {};

  // ── 2. Order aggregates (joined through appointments for date) ─────────
  const orderResult = await db.execute(sql`
    SELECT
      o.order_type,
      o.status,
      COUNT(*) AS cnt
    FROM clinic_orders o
    JOIN clinic_appointments a ON a.id = o.appointment_id
    WHERE o.doctor_id        = ${doctorId}
      AND a.appointment_date = ${date}::date
    GROUP BY o.order_type, o.status
  `);
  const orderRows = (orderResult as any).rows as Array<{
    order_type: string; status: string; cnt: string;
  }>;

  let serviceTotal = 0, servicePending = 0, serviceExecuted = 0;
  let pharmTotal = 0, pharmPending = 0, pharmExecuted = 0;
  for (const row of orderRows) {
    const cnt = toInt(row.cnt);
    if (row.order_type === "service") {
      serviceTotal += cnt;
      if (row.status === "pending")  servicePending  += cnt;
      if (row.status === "executed") serviceExecuted += cnt;
    } else if (row.order_type === "pharmacy") {
      pharmTotal += cnt;
      if (row.status === "pending")  pharmPending  += cnt;
      if (row.status === "executed") pharmExecuted += cnt;
    }
  }

  return {
    date,
    doctorId,
    totalPatients:         toInt(a.total_patients),
    waiting:               toInt(a.waiting),
    inConsultation:        toInt(a.in_consultation),
    done:                  toInt(a.done),
    cancelled:             toInt(a.cancelled),
    noShow:                toInt(a.no_show),
    serviceOrdersTotal:    serviceTotal,
    serviceOrdersPending:  servicePending,
    serviceOrdersExecuted: serviceExecuted,
    pharmacyOrdersTotal:   pharmTotal,
    pharmacyOrdersPending: pharmPending,
    pharmacyOrdersExecuted: pharmExecuted,
    grossConsultationFee:  toFloat(a.gross_total),
    doctorDeductionTotal:  toFloat(a.deduction_total),
  };
}

/**
 * getSecretaryDailySummary
 *
 * Returns appointment status breakdown and revenue aggregates for a clinic
 * on a given date. Single SQL query with FILTER and GROUP BY.
 *
 * Uses existing indexes:
 *   - idx_clinic_appts_clinic_date        (clinic_id, appointment_date)
 *   - idx_clinic_appts_clinic_date_status (clinic_id, appointment_date, status)
 */
export async function getSecretaryDailySummary(
  clinicId: string,
  date: string
): Promise<SecretaryDailySummaryData> {
  // ── 1. Status counts + revenue totals ─────────────────────────────────
  const summaryResult = await db.execute(sql`
    SELECT
      COUNT(*)                                                      AS total_bookings,
      COUNT(*) FILTER (WHERE status = 'waiting')                   AS waiting,
      COUNT(*) FILTER (WHERE status = 'in_consultation')           AS in_consultation,
      COUNT(*) FILTER (WHERE status = 'done')                      AS done,
      COUNT(*) FILTER (WHERE status = 'cancelled')                 AS cancelled,
      COUNT(*) FILTER (WHERE status = 'no_show')                   AS no_show,
      COALESCE(SUM(gross_amount), 0)                               AS gross_total,
      COALESCE(SUM(paid_amount),  0)                               AS paid_total
    FROM clinic_appointments
    WHERE clinic_id        = ${clinicId}
      AND appointment_date = ${date}::date
  `);
  const s = (summaryResult as any).rows[0] ?? {};

  // ── 2. Payment type breakdown ──────────────────────────────────────────
  const breakdownResult = await db.execute(sql`
    SELECT
      COALESCE(payment_type, 'CASH') AS payment_type,
      COUNT(*)                        AS cnt,
      COALESCE(SUM(gross_amount), 0) AS gross_amount,
      COALESCE(SUM(paid_amount),  0) AS paid_amount
    FROM clinic_appointments
    WHERE clinic_id        = ${clinicId}
      AND appointment_date = ${date}::date
    GROUP BY COALESCE(payment_type, 'CASH')
    ORDER BY cnt DESC
  `);
  const paymentBreakdown: PaymentBreakdownRow[] = (
    (breakdownResult as any).rows as Array<{
      payment_type: string; cnt: string; gross_amount: string; paid_amount: string;
    }>
  ).map(r => ({
    paymentType: r.payment_type,
    count:       toInt(r.cnt),
    grossAmount: toFloat(r.gross_amount),
    paidAmount:  toFloat(r.paid_amount),
  }));

  return {
    date,
    clinicId,
    totalBookings:  toInt(s.total_bookings),
    waiting:        toInt(s.waiting),
    inConsultation: toInt(s.in_consultation),
    done:           toInt(s.done),
    cancelled:      toInt(s.cancelled),
    noShow:         toInt(s.no_show),
    grossTotal:     toFloat(s.gross_total),
    paidTotal:      toFloat(s.paid_total),
    paymentBreakdown,
  };
}

// ── Mixin export for DatabaseStorage ────────────────────────────────────────

const clinicDashboardMethods = {
  getDoctorDailySummary,
  getSecretaryDailySummary,
};

export default clinicDashboardMethods;
