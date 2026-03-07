import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReadinessResult {
  ready: boolean;
  critical: string[];
  warnings: string[];
}

interface Props {
  invoiceId: string;
}

export function JournalReadinessBadge({ invoiceId }: Props) {
  const { data } = useQuery<ReadinessResult>({
    queryKey: ["/api/sales-invoices", invoiceId, "journal-readiness"],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices/${invoiceId}/journal-readiness`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("readiness check failed");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
    enabled: !!invoiceId,
  });

  if (!data) return null;

  const allIssues = [...(data.critical || []), ...(data.warnings || [])];

  if (allIssues.length === 0) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] text-emerald-600"
        data-testid="badge-journal-ready"
      >
        <CheckCircle className="h-3 w-3" />
        محاسبة جاهزة
      </span>
    );
  }

  const isCritical = (data.critical || []).length > 0;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`flex items-center gap-1 text-[10px] cursor-help ${
              isCritical ? "text-red-600" : "text-amber-600"
            }`}
            data-testid="badge-journal-warning"
          >
            <AlertTriangle className="h-3 w-3" />
            {isCritical ? "مشكلة محاسبية" : "تحذير محاسبي"}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className="max-w-xs text-right p-3 space-y-1"
          dir="rtl"
        >
          {(data.critical || []).map((msg, i) => (
            <p key={`c-${i}`} className="text-xs text-red-500 flex gap-1">
              <span>●</span>
              <span>{msg}</span>
            </p>
          ))}
          {(data.warnings || []).map((msg, i) => (
            <p key={`w-${i}`} className="text-xs text-amber-400 flex gap-1">
              <span>○</span>
              <span>{msg}</span>
            </p>
          ))}
          <p className="text-[10px] text-muted-foreground pt-1 border-t mt-1">
            افتح إعدادات الربط المحاسبي لإصلاح المشكلة
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
