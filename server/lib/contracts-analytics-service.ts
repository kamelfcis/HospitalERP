/**
 * contracts-analytics-service.ts — Phase 6
 *
 * READ-ONLY analytics for contracts, claims, and AR.
 * No side effects. No writes. No business logic changes.
 *
 * Functions:
 *   getARAging()            — outstanding grouped by age in days
 *   getCompanyPerformance() — per-company claim summary
 *   getClaimVariance()      — claimed vs approved per batch
 *   getControlFlags()       — simple alerts for operational anomalies
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

// ─── Configuration constants ───────────────────────────────────────────────
// Thresholds for control alerts. Could be moved to system settings later.

/** Rejection rate above this % triggers a high-rejection alert */
const HIGH_REJECTION_RATE_PCT = 30;

/** Outstanding amount above this (EGP) triggers a high-outstanding alert */
const HIGH_OUTSTANDING_EGP = 50_000;

/** Write-off amount above this (EGP) triggers a high-writeoff alert */
const HIGH_WRITEOFF_EGP = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ARAging {
  companyId:    string;
  companyName:  string;
  bucket_0_30:  number;   // outstanding on batches 0–30 days old
  bucket_31_60: number;   // 31–60 days
  bucket_61_90: number;   // 61–90 days
  bucket_90plus: number;  // 91+ days
  total:        number;
}

export interface CompanyPerformance {
  companyId:      string;
  companyName:    string;
  totalClaimed:   number;
  totalApproved:  number;
  totalSettled:   number;
  totalOutstanding: number;
  rejectionRate:  number;   // percentage 0–100
}

export interface ClaimVariance {
  batchId:      string;
  batchNumber:  string;
  companyName:  string;
  batchDate:    string;
  totalClaimed: number;
  totalApproved: number;
  variance:     number;
  variancePct:  number;   // (claimed - approved) / claimed * 100
}

export interface ControlFlag {
  type:        "high_rejection" | "high_outstanding" | "high_writeoff";
  severity:    "warning" | "error";
  companyId:   string;
  companyName: string;
  value:       number;    // the actual metric that triggered the flag
  threshold:   number;    // the configured threshold
  message:     string;    // human-readable Arabic message
}

// ─── 1. AR Aging ──────────────────────────────────────────────────────────
// Outstanding = totalApproved - totalSettled per batch.
// Age is calculated from batch_date (the date the batch was created).

export async function getARAging(): Promise<ARAging[]> {
  const result = await db.execute(sql`
    SELECT
      co.id                                            AS company_id,
      co."nameAr"                                      AS company_name,

      -- Bucket: 0–30 days
      COALESCE(SUM(
        CASE WHEN (CURRENT_DATE - b.batch_date::date) BETWEEN 0 AND 30
          THEN GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
          ELSE 0
        END
      ), 0)                                            AS bucket_0_30,

      -- Bucket: 31–60 days
      COALESCE(SUM(
        CASE WHEN (CURRENT_DATE - b.batch_date::date) BETWEEN 31 AND 60
          THEN GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
          ELSE 0
        END
      ), 0)                                            AS bucket_31_60,

      -- Bucket: 61–90 days
      COALESCE(SUM(
        CASE WHEN (CURRENT_DATE - b.batch_date::date) BETWEEN 61 AND 90
          THEN GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
          ELSE 0
        END
      ), 0)                                            AS bucket_61_90,

      -- Bucket: 91+ days
      COALESCE(SUM(
        CASE WHEN (CURRENT_DATE - b.batch_date::date) > 90
          THEN GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
          ELSE 0
        END
      ), 0)                                            AS bucket_90plus,

      -- Total outstanding for this company
      COALESCE(SUM(
        GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
      ), 0)                                            AS total

    FROM contract_claim_batches b
    JOIN companies co ON co.id = b.company_id
    WHERE b.status NOT IN ('draft', 'cancelled')
      AND CAST(b.total_approved AS numeric) > CAST(b.total_settled AS numeric)
    GROUP BY co.id, co."nameAr"
    HAVING COALESCE(SUM(
      GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
    ), 0) > 0
    ORDER BY total DESC
  `);

  return ((result as any).rows as any[]).map(r => ({
    companyId:    r.company_id,
    companyName:  r.company_name,
    bucket_0_30:  parseFloat(r.bucket_0_30  ?? "0"),
    bucket_31_60: parseFloat(r.bucket_31_60 ?? "0"),
    bucket_61_90: parseFloat(r.bucket_61_90 ?? "0"),
    bucket_90plus:parseFloat(r.bucket_90plus?? "0"),
    total:        parseFloat(r.total        ?? "0"),
  }));
}

// ─── 2. Company Performance ───────────────────────────────────────────────

export async function getCompanyPerformance(): Promise<CompanyPerformance[]> {
  const result = await db.execute(sql`
    SELECT
      co.id                                        AS company_id,
      co."nameAr"                                  AS company_name,

      -- Total amount claimed across all non-cancelled batches
      COALESCE(SUM(CAST(b.total_claimed   AS numeric)), 0) AS total_claimed,

      -- Total amount the company approved
      COALESCE(SUM(CAST(b.total_approved  AS numeric)), 0) AS total_approved,

      -- Total settled (received cash)
      COALESCE(SUM(CAST(b.total_settled   AS numeric)), 0) AS total_settled,

      -- Outstanding = approved - settled
      COALESCE(SUM(
        GREATEST(0, CAST(b.total_approved AS numeric) - CAST(b.total_settled AS numeric))
      ), 0)                                        AS total_outstanding,

      -- Rejection rate = rejected / claimed * 100
      -- Uses total_claimed - total_approved as a proxy for rejected amount
      CASE
        WHEN SUM(CAST(b.total_claimed AS numeric)) > 0
        THEN ROUND(
          (SUM(CAST(b.total_claimed AS numeric)) - SUM(CAST(b.total_approved AS numeric)))
          / SUM(CAST(b.total_claimed AS numeric)) * 100, 1
        )
        ELSE 0
      END                                          AS rejection_rate

    FROM contract_claim_batches b
    JOIN companies co ON co.id = b.company_id
    WHERE b.status NOT IN ('draft', 'cancelled')
    GROUP BY co.id, co."nameAr"
    ORDER BY total_claimed DESC
  `);

  return ((result as any).rows as any[]).map(r => ({
    companyId:       r.company_id,
    companyName:     r.company_name,
    totalClaimed:    parseFloat(r.total_claimed    ?? "0"),
    totalApproved:   parseFloat(r.total_approved   ?? "0"),
    totalSettled:    parseFloat(r.total_settled    ?? "0"),
    totalOutstanding:parseFloat(r.total_outstanding?? "0"),
    rejectionRate:   parseFloat(r.rejection_rate   ?? "0"),
  }));
}

// ─── 3. Claim Variance ────────────────────────────────────────────────────
// Variance = claimed amount - approved amount per batch (insurer discount).

export async function getClaimVariance(): Promise<ClaimVariance[]> {
  const result = await db.execute(sql`
    SELECT
      b.id                                        AS batch_id,
      b.batch_number                              AS batch_number,
      b.batch_date                                AS batch_date,
      co."nameAr"                                 AS company_name,
      CAST(b.total_claimed   AS numeric)          AS total_claimed,
      CAST(b.total_approved  AS numeric)          AS total_approved,
      (CAST(b.total_claimed  AS numeric) - CAST(b.total_approved AS numeric)) AS variance,
      CASE
        WHEN CAST(b.total_claimed AS numeric) > 0
        THEN ROUND(
          (CAST(b.total_claimed AS numeric) - CAST(b.total_approved AS numeric))
          / CAST(b.total_claimed AS numeric) * 100, 1
        )
        ELSE 0
      END                                         AS variance_pct

    FROM contract_claim_batches b
    JOIN companies co ON co.id = b.company_id
    WHERE b.status NOT IN ('draft', 'cancelled')
      AND CAST(b.total_claimed AS numeric) > 0
    ORDER BY variance DESC
  `);

  return ((result as any).rows as any[]).map(r => ({
    batchId:      r.batch_id,
    batchNumber:  r.batch_number,
    batchDate:    r.batch_date,
    companyName:  r.company_name,
    totalClaimed: parseFloat(r.total_claimed  ?? "0"),
    totalApproved:parseFloat(r.total_approved ?? "0"),
    variance:     parseFloat(r.variance       ?? "0"),
    variancePct:  parseFloat(r.variance_pct   ?? "0"),
  }));
}

// ─── 4. Control Flags ─────────────────────────────────────────────────────
// Simple alert detection. No side effects.

export async function getControlFlags(): Promise<ControlFlag[]> {
  const performance = await getCompanyPerformance();
  const flags: ControlFlag[] = [];

  for (const co of performance) {
    // High rejection rate alert
    if (co.rejectionRate > HIGH_REJECTION_RATE_PCT) {
      flags.push({
        type:       "high_rejection",
        severity:   co.rejectionRate > 50 ? "error" : "warning",
        companyId:  co.companyId,
        companyName:co.companyName,
        value:      co.rejectionRate,
        threshold:  HIGH_REJECTION_RATE_PCT,
        message:    `نسبة الرفض للشركة ${co.companyName} تبلغ ${co.rejectionRate.toFixed(1)}% (الحد: ${HIGH_REJECTION_RATE_PCT}%)`,
      });
    }

    // High outstanding alert
    if (co.totalOutstanding > HIGH_OUTSTANDING_EGP) {
      flags.push({
        type:       "high_outstanding",
        severity:   "warning",
        companyId:  co.companyId,
        companyName:co.companyName,
        value:      co.totalOutstanding,
        threshold:  HIGH_OUTSTANDING_EGP,
        message:    `متأخرات الشركة ${co.companyName} تبلغ ${co.totalOutstanding.toLocaleString("ar-EG")} ج.م`,
      });
    }
  }

  // High write-off alert — query batches directly
  const writeoffResult = await db.execute(sql`
    SELECT
      co.id        AS company_id,
      co."nameAr"  AS company_name,
      SUM(CAST(b.total_writeoff AS numeric)) AS total_writeoff
    FROM contract_claim_batches b
    JOIN companies co ON co.id = b.company_id
    WHERE b.status NOT IN ('draft', 'cancelled')
    GROUP BY co.id, co."nameAr"
    HAVING SUM(CAST(b.total_writeoff AS numeric)) > ${HIGH_WRITEOFF_EGP}
  `);

  for (const r of (writeoffResult as any).rows as any[]) {
    flags.push({
      type:       "high_writeoff",
      severity:   "warning",
      companyId:  r.company_id,
      companyName:r.company_name,
      value:      parseFloat(r.total_writeoff ?? "0"),
      threshold:  HIGH_WRITEOFF_EGP,
      message:    `شطب مرتفع للشركة ${r.company_name}: ${parseFloat(r.total_writeoff).toLocaleString("ar-EG")} ج.م`,
    });
  }

  return flags;
}
