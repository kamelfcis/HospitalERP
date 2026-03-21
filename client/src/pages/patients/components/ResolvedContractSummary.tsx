/**
 * ResolvedContractSummary
 * Read-only card displayed after a successful member card lookup.
 * Safe fallback: all fields render with "—" when missing.
 */

import { Badge } from "@/components/ui/badge";
import { Building2, FileText, CreditCard, X, CalendarCheck } from "lucide-react";
import type { ResolvedContractMember } from "../hooks/useContractResolution";

interface Props {
  resolved: ResolvedContractMember;
  onClear: () => void;
}

export function ResolvedContractSummary({ resolved, onClear }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isExpiringSoon = resolved.coverageUntil
    ? new Date(resolved.coverageUntil) <= new Date(new Date(today).getTime() + 30 * 86400000)
    : false;

  return (
    <div
      className="rounded-md border border-green-300 bg-green-50/60 px-3 py-2 space-y-1 relative"
      data-testid="resolved-contract-summary"
    >
      <button
        type="button"
        onClick={onClear}
        className="absolute top-1.5 left-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
        title="إلغاء الربط وإعادة البحث"
        data-testid="button-clear-contract-resolution"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-1.5 text-xs font-semibold text-green-800">
        <CreditCard className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{resolved.memberName || "—"}</span>
        <span className="text-green-600 font-mono shrink-0">({resolved.memberCardNumber || "—"})</span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 shrink-0">
          <Building2 className="h-3 w-3" />
          {resolved.companyName || "—"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <FileText className="h-3 w-3" />
          {resolved.contractName || "—"}
        </span>
        {resolved.coverageUntil && (
          <span className="flex items-center gap-1 shrink-0">
            <CalendarCheck className="h-3 w-3" />
            <span>سارية حتى: {resolved.coverageUntil}</span>
            {isExpiringSoon && (
              <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 text-amber-700 bg-amber-50">
                تنتهي قريباً
              </Badge>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
