import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import type { PatientStats } from "./types";

export function AmountCell({ value }: { value: number }) {
  if (!value || +value === 0) {
    return <td className="text-center text-muted-foreground">—</td>;
  }
  return <td className="text-center tabular-nums">{formatNumber(+value)}</td>;
}

export function InvoiceStatusBadge({ status }: { status: string | null }) {
  if (!status) return <td className="text-center text-muted-foreground">—</td>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    draft:     { label: "مسودة",  variant: "secondary"    },
    finalized: { label: "اعتماد", variant: "default"      },
    cancelled: { label: "ملغي",   variant: "destructive"  },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary" as const };
  return (
    <td className="text-center">
      <Badge variant={cfg.variant} className="text-xs px-1 py-0">{cfg.label}</Badge>
    </td>
  );
}

export function TotalsRow({ rows }: { rows: PatientStats[] }) {
  const sum = (key: keyof PatientStats) =>
    rows.reduce((acc, r) => acc + +(r[key] ?? 0), 0);

  return (
    <tr className="bg-muted/50 font-bold text-xs border-t-2">
      <td colSpan={5} className="text-right pr-2 py-1">
        الإجمالي ({rows.length} مريض)
      </td>
      <td className="text-center tabular-nums">{formatNumber(sum("servicesTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("drugsTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("consumablesTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("orRoomTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("stayTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("grandTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("paidTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("transferredTotal"))}</td>
      <td /><td />
    </tr>
  );
}
