/**
 * ApprovalActions
 *
 * Action buttons for a single approval row (approve / reject / cancel).
 * Only rendered for pending approvals.
 */

import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Ban } from "lucide-react";
import type { ApprovalItem } from "../hooks/useApprovals";

interface ApprovalActionsProps {
  approval:    ApprovalItem;
  onApprove:   (item: ApprovalItem) => void;
  onReject:    (item: ApprovalItem) => void;
  onCancel:    (item: ApprovalItem) => void;
}

export function ApprovalActions({ approval, onApprove, onReject, onCancel }: ApprovalActionsProps) {
  if (approval.approvalStatus !== "pending") return null;

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs"
        onClick={() => onApprove(approval)}
        data-testid={`button-approve-${approval.id}`}
      >
        <CheckCircle2 className="h-3 w-3 ml-1" />
        موافقة
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-xs"
        onClick={() => onReject(approval)}
        data-testid={`button-reject-${approval.id}`}
      >
        <XCircle className="h-3 w-3 ml-1" />
        رفض
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => onCancel(approval)}
        data-testid={`button-cancel-${approval.id}`}
      >
        <Ban className="h-3 w-3 ml-1" />
        إلغاء
      </Button>
    </div>
  );
}
