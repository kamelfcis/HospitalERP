/**
 * MappingCompletenessOverview
 *
 * Global checklist panel shown at the top of Account Mappings.
 * Fetches /api/account-mappings/completeness and renders a card per
 * transaction type showing ✅ complete or ❌ missing items.
 *
 * Design principle: admin should see ALL gaps in one screen before
 * attempting any transaction — not discover them after posting fails.
 */

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { transactionTypeLabels, mappingLineTypeLabels } from "@shared/schema";

interface TxTypeCompleteness {
  txType:          string;
  isComplete:      boolean;
  missingRequired: string[];
  hasAnyMapping:   boolean;
  totalMapped:     number;
}

interface CompletenessReport {
  allComplete:  boolean;
  types:        TxTypeCompleteness[];
  missingCount: number;
}

interface Props {
  /** Callback to jump directly to a transaction type in the editor below */
  onSelectTxType?: (txType: string) => void;
}

const TX_LABEL = (txType: string): string =>
  (transactionTypeLabels as Record<string, string>)[txType] ?? txType;

const LINE_LABEL = (lineType: string): string =>
  (mappingLineTypeLabels as Record<string, string>)[lineType] ?? lineType;

export function MappingCompletenessOverview({ onSelectTxType }: Props) {
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery<CompletenessReport>({
    queryKey: ["/api/account-mappings/completeness"],
    queryFn: () =>
      fetch("/api/account-mappings/completeness", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 animate-pulse h-24 mb-4" dir="rtl" />
    );
  }

  const report = data;
  if (!report) return null;

  const incomplete = report.types.filter(t => !t.isComplete);
  const complete   = report.types.filter(t => t.isComplete);

  return (
    <div className="mb-4 rounded-xl border bg-card shadow-sm" dir="rtl">

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-toggle-completeness-overview"
      >
        <div className="flex items-center gap-3">
          {report.allComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          )}
          <div>
            <p className="font-semibold text-sm">
              {report.allComplete
                ? "جميع أنواع العمليات مربوطة بالحسابات ✓"
                : `${report.missingCount} من أنواع العمليات تحتاج إعداد`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {complete.length} مكتمل · {incomplete.length} يحتاج إعداد · {report.types.length} إجمالي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={e => { e.stopPropagation(); refetch(); }}
            disabled={isFetching}
            data-testid="button-refresh-completeness"
            title="تحديث"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">

          {/* Incomplete types first */}
          {incomplete.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                تحتاج إعداد
              </p>
              {incomplete.map(t => (
                <IncompleteRow
                  key={t.txType}
                  item={t}
                  onSelect={onSelectTxType}
                />
              ))}
            </div>
          )}

          {/* Complete types */}
          {complete.length > 0 && (
            <div className="space-y-1.5">
              {incomplete.length > 0 && (
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-2 mb-1">
                  مكتمل
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {complete.map(t => (
                  <button
                    key={t.txType}
                    onClick={() => onSelectTxType?.(t.txType)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                    data-testid={`chip-complete-${t.txType}`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {TX_LABEL(t.txType)}
                    <span className="opacity-60">({t.totalMapped})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function IncompleteRow({
  item,
  onSelect,
}: {
  item: TxTypeCompleteness;
  onSelect?: (txType: string) => void;
}) {
  const isHardMissing = item.missingRequired.length > 0;
  const isNoMapping   = !item.hasAnyMapping;

  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm cursor-pointer hover:bg-muted/40 transition-colors
        ${isHardMissing
          ? "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20"
          : "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20"
        }`}
      onClick={() => onSelect?.(item.txType)}
      data-testid={`row-incomplete-${item.txType}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {isHardMissing ? (
          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">{TX_LABEL(item.txType)}</p>
          {isHardMissing && (
            <p className="text-xs mt-0.5 text-red-600 dark:text-red-400">
              مطلوب: {item.missingRequired.map(LINE_LABEL).join(" · ")}
            </p>
          )}
          {isNoMapping && !isHardMissing && (
            <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
              لا توجد حسابات مربوطة بعد
            </p>
          )}
          {item.totalMapped > 0 && !isHardMissing && (
            <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
              مربوط جزئياً ({item.totalMapped} بند) — لا توجد إعدادات عامة
            </p>
          )}
        </div>
      </div>

      <Badge
        variant="outline"
        className={`shrink-0 text-xs ${
          isHardMissing
            ? "border-red-300 text-red-600 dark:text-red-400"
            : "border-amber-300 text-amber-600 dark:text-amber-400"
        }`}
      >
        {isHardMissing ? "مطلوب" : "موصى به"}
      </Badge>
    </div>
  );
}
