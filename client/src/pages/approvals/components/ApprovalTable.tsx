/**
 * ApprovalTable
 *
 * Table listing approval requests with status badges + action buttons.
 */

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle2, XCircle, Ban } from "lucide-react";
import type { ApprovalItem } from "../hooks/useApprovals";
import { ApprovalActions } from "./ApprovalActions";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending:   { label: "في الانتظار",   variant: "default",     icon: <Clock className="h-3 w-3" /> },
  approved:  { label: "مقبول",         variant: "secondary",   icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:  { label: "مرفوض",         variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "ملغى",          variant: "outline",     icon: <Ban className="h-3 w-3" /> },
};

const DECISION_LABELS: Record<string, string> = {
  full_approval:    "كاملة",
  partial_approval: "جزئية",
  rejection:        "رفض",
};

interface ApprovalTableProps {
  items:     ApprovalItem[];
  isLoading: boolean;
  onApprove: (item: ApprovalItem) => void;
  onReject:  (item: ApprovalItem) => void;
  onCancel:  (item: ApprovalItem) => void;
}

export function ApprovalTable({ items, isLoading, onApprove, onReject, onCancel }: ApprovalTableProps) {
  if (isLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="py-14 text-center text-muted-foreground text-sm" data-testid="text-empty-approvals">
        لا توجد طلبات موافقة
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right">الخدمة</th>
            <th className="px-3 py-2 text-right">الشركة / العقد</th>
            <th className="px-3 py-2 text-right">المنتسب</th>
            <th className="px-3 py-2 text-right">المبلغ المطلوب</th>
            <th className="px-3 py-2 text-right">المبلغ الموافق</th>
            <th className="px-3 py-2 text-right">تاريخ الطلب</th>
            <th className="px-3 py-2 text-right">الحالة</th>
            <th className="px-3 py-2 text-right">إجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map(item => {
            const cfg = STATUS_CONFIG[item.approvalStatus] ?? STATUS_CONFIG.pending;
            return (
              <tr
                key={item.id}
                className="hover:bg-muted/30 transition-colors"
                data-testid={`row-approval-${item.id}`}
              >
                <td className="px-3 py-2 max-w-[200px]">
                  <span className="block truncate font-medium" title={item.serviceDescription ?? undefined}>
                    {item.serviceDescription ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs">
                    <div className="font-medium">{item.companyName ?? "—"}</div>
                    <div className="text-muted-foreground">{item.contractName} {item.contractNumber ? `(${item.contractNumber})` : ""}</div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {item.memberName
                    ? <><div>{item.memberName}</div><div className="text-muted-foreground">{item.memberCardNumber}</div></>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {parseFloat(item.requestedAmount).toLocaleString("ar-EG")}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {item.approvedAmount
                    ? <span className="text-green-700">{parseFloat(item.approvedAmount).toLocaleString("ar-EG")}</span>
                    : <span className="text-muted-foreground">—</span>}
                  {item.approvalDecision && (
                    <span className="block text-[10px] text-muted-foreground">{DECISION_LABELS[item.approvalDecision]}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {item.requestedAt
                    ? new Date(item.requestedAt).toLocaleDateString("ar-EG")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={cfg.variant} className="flex w-fit items-center gap-1 text-[11px]">
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                  {item.rejectionReason && (
                    <div className="text-[10px] text-destructive mt-0.5 max-w-[120px] truncate" title={item.rejectionReason}>
                      {item.rejectionReason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <ApprovalActions
                    approval={item}
                    onApprove={onApprove}
                    onReject={onReject}
                    onCancel={onCancel}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
