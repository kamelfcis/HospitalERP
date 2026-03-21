/**
 * contracts-analytics/types.ts
 *
 * Shared TypeScript interfaces for Phase 6 analytics.
 * Mirror the service layer types — kept in sync manually.
 */

export interface ARAging {
  companyId:    string;
  companyName:  string;
  bucket_0_30:  number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90plus: number;
  total:        number;
}

export interface CompanyPerformance {
  companyId:       string;
  companyName:     string;
  totalClaimed:    number;
  totalApproved:   number;
  totalSettled:    number;
  totalOutstanding: number;
  rejectionRate:   number;
}

export interface ClaimVariance {
  batchId:      string;
  batchNumber:  string;
  batchDate:    string;
  companyName:  string;
  totalClaimed: number;
  totalApproved: number;
  variance:     number;
  variancePct:  number;
}

export interface ControlFlag {
  type:        "high_rejection" | "high_outstanding" | "high_writeoff";
  severity:    "warning" | "error";
  companyId:   string;
  companyName: string;
  value:       number;
  threshold:   number;
  message:     string;
}
