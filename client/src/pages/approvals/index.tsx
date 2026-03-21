/**
 * صفحة طلبات الموافقة على الخدمات التأمينية
 * Phase 4 — Contracts Approval Workflow
 */

import { useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApprovals, useApproveAction, useRejectAction, useCancelApproval } from "./hooks/useApprovals";
import type { ApprovalItem } from "./hooks/useApprovals";
import { ApprovalTable } from "./components/ApprovalTable";
import { ApproveDialog, RejectDialog } from "./components/ApprovalDialog";

const STATUS_OPTIONS = [
  { value: "all",       label: "جميع الطلبات" },
  { value: "pending",   label: "في الانتظار" },
  { value: "approved",  label: "مقبولة" },
  { value: "rejected",  label: "مرفوضة" },
  { value: "cancelled", label: "ملغاة" },
];

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState("pending");

  const [approveTarget, setApproveTarget] = useState<ApprovalItem | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<ApprovalItem | null>(null);

  const { data = [], isLoading, refetch } = useApprovals(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );

  const approveMutation = useApproveAction();
  const rejectMutation  = useRejectAction();
  const cancelMutation  = useCancelApproval();

  const pendingCount = (data as ApprovalItem[]).filter(a => a.approvalStatus === "pending").length;

  const handleApprove = (amount?: string, notes?: string) => {
    if (!approveTarget) return;
    approveMutation.mutate(
      { id: approveTarget.id, approvedAmount: amount, notes },
      { onSuccess: () => setApproveTarget(null) }
    );
  };

  const handleReject = (reason: string, notes?: string) => {
    if (!rejectTarget) return;
    rejectMutation.mutate(
      { id: rejectTarget.id, rejectionReason: reason, notes },
      { onSuccess: () => setRejectTarget(null) }
    );
  };

  const handleCancel = (item: ApprovalItem) => {
    cancelMutation.mutate({ id: item.id });
  };

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">طلبات الموافقة التأمينية</h1>
          {pendingCount > 0 && (
            <Badge variant="default" className="text-xs" data-testid="badge-pending-count">
              {pendingCount} في الانتظار
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-refresh-approvals"
        >
          <RefreshCw className="h-4 w-4 ml-1" />
          تحديث
        </Button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <ApprovalTable
        items={data as ApprovalItem[]}
        isLoading={isLoading}
        onApprove={item => setApproveTarget(item)}
        onReject={item  => setRejectTarget(item)}
        onCancel={handleCancel}
      />

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <ApproveDialog
        approval={approveTarget}
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        isPending={approveMutation.isPending}
      />

      <RejectDialog
        approval={rejectTarget}
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        isPending={rejectMutation.isPending}
      />
    </div>
  );
}
