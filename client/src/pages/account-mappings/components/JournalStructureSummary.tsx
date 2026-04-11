import { ArrowLeft, CreditCard, TrendingUp } from "lucide-react";
import { mappingLineTypeLabels } from "@shared/schema";
import { lineTypeSpecs, suggestedLineTypes, DYNAMIC_LINE_SPECS } from "../types";

interface JournalStructureSummaryProps {
  txType: string;
}

export function JournalStructureSummary({ txType }: JournalStructureSummaryProps) {
  const specs = lineTypeSpecs[txType];
  const suggested = suggestedLineTypes[txType];
  if (!specs || !suggested || suggested.length === 0) return null;

  const dynSpecs = DYNAMIC_LINE_SPECS[txType] ?? {};

  const debitLines: { key: string; label: string; dynamic: boolean }[] = [];
  const creditLines: { key: string; label: string; dynamic: boolean }[] = [];

  for (const lt of suggested) {
    const spec = specs[lt];
    if (!spec) continue;
    const label = mappingLineTypeLabels[lt] ?? lt;
    const dyn = dynSpecs[lt];

    if (spec.debitSide) {
      debitLines.push({ key: lt, label, dynamic: !!dyn?.debit });
    }
    if (spec.creditSide) {
      creditLines.push({ key: lt, label, dynamic: !!dyn?.credit });
    }
  }

  if (debitLines.length === 0 && creditLines.length === 0) return null;

  return (
    <div
      className="mx-4 mb-3 p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg"
      dir="rtl"
      data-testid="journal-structure-summary"
    >
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
        هيكل القيد المتوقع
      </p>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingUp className="h-3 w-3 text-blue-600" />
            <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">مدين (Dr)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {debitLines.map(l => (
              <span
                key={l.key}
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                  l.dynamic
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-dashed border-indigo-300"
                    : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                }`}
              >
                {l.dynamic && <span className="text-[8px]">⚡</span>}
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center self-center pt-4">
          <ArrowLeft className="h-4 w-4 text-slate-400" />
        </div>

        <div className="flex-1 min-w-[140px]">
          <div className="flex items-center gap-1 mb-1.5">
            <CreditCard className="h-3 w-3 text-purple-600" />
            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-400">دائن (Cr)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {creditLines.map(l => (
              <span
                key={l.key}
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                  l.dynamic
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-dashed border-indigo-300"
                    : "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                }`}
              >
                {l.dynamic && <span className="text-[8px]">⚡</span>}
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {(debitLines.some(l => l.dynamic) || creditLines.some(l => l.dynamic)) && (
        <p className="text-[9px] text-slate-500 mt-2">
          ⚡ = يُحدد تلقائياً من البيانات التشغيلية (لا يحتاج ضبط يدوي)
        </p>
      )}
    </div>
  );
}
