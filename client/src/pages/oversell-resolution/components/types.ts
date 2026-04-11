export interface PendingAllocation {
  id: string;
  invoice_id: string;
  invoice_line_id: string;
  item_id: string;
  warehouse_id: string;
  qty_minor_pending: string;
  qty_minor_original: string;
  status: "pending" | "partially_resolved" | "fully_resolved" | "cancelled";
  cost_status?: "pending" | "partial" | "resolved" | null;
  reason?: string;
  qty_minor_available_at_finalize: string;
  created_by?: string;
  created_at: string;
  item_name: string;
  item_barcode?: string;
  item_unit?: string;
  item_minor_unit?: string;
  warehouse_name: string;
  invoice_number?: string;
  patient_name?: string;
  current_stock_minor: string;
}

export interface OversellStats {
  pendingCount: number; partialCount: number; resolvedCount: number;
  activeCount: number; totalQtyMinorPending: number;
}

export interface DailyReport {
  reportDate: string;
  summary: {
    activeCount: number; pendingCount: number; partialCount: number; resolvedCount: number;
    pendingQty: number; resolvedQty: number; totalOriginal: number; oversellRatio: number;
  };
  alertThreshold: number;
  alertTriggered: boolean;
  ageDistribution: { within24h: number; within48h: number; over48h: number };
  byItem: Array<{ item_id: string; item_name: string; item_barcode?: string; pending_count: string; pending_qty: string; original_qty: string }>;
  byUser: Array<{ created_by: string; username: string; pending_count: string; pending_qty: string }>;
  byDepartment: Array<{ department_id: string; department_name: string; pending_count: string; pending_qty: string }>;
}

export interface GoLiveCheck {
  key: string; label: string; ok: boolean; detail?: string; action?: string;
}

export interface GoLiveChecklist {
  checks: GoLiveCheck[]; allGreen: boolean; checkedAt: string;
}

export interface PreviewResult {
  allocationId: string; warehouseId: string;
  qtyPending: number; qtyCanResolve: number; qtyShortfall: number;
  estimatedCost: number; fullyResolvable: boolean;
  lots: Array<{ lotId: string; qtyToDeduct: number; unitCost: number; lineCost: number; expiryMonth?: number; expiryYear?: number }>;
}

export interface GlReadinessCheck { key: string; label: string; ok: boolean; accountCode?: string; accountName?: string; message?: string }
export interface GlReadinessResult { ready: boolean; checks: GlReadinessCheck[] }

export interface ResolutionBatch {
  id: string; warehouse_id: string; resolved_by: string; resolved_by_name?: string;
  resolved_at: string; notes?: string; journal_entry_id?: string;
  journal_status: "none" | "posted" | "blocked" | "voided"; stock_movement_header_id?: string;
}

export interface IntegrityReport {
  orphanAllocations: any[]; statusMismatches: any[]; orphanJournalLinks: any[]; clean: boolean;
}
