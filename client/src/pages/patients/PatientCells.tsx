import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import type { PatientStats } from "./types";

export function AmountCell({ value }: { value: number }) {
  if (!value || +value === 0) {
    return <td className="text-center text-muted-foreground px-2 min-w-[5.5rem]">—</td>;
  }
  return <td className="text-center tabular-nums px-2 min-w-[5.5rem]">{formatNumber(+value)}</td>;
}

export function PatientTypeBadge({ type }: { type: string | null }) {
  if (!type) return <td className="text-center text-muted-foreground">—</td>;
  const isContract = type.toLowerCase() === "contract";
  return (
    <td className="text-center">
      <Badge
        variant={isContract ? "default" : "secondary"}
        className={`text-xs px-1 py-0 ${isContract ? "bg-blue-600" : ""}`}
        data-testid={`badge-patient-type`}
      >
        {isContract ? "تعاقد" : "نقدي"}
      </Badge>
    </td>
  );
}

export function InvoiceStatusBadge({ status, isFinalClosed }: { status: string | null; isFinalClosed?: boolean }) {
  if (!status) return <td className="text-center text-muted-foreground">—</td>;

  if (isFinalClosed) {
    return (
      <td className="text-center">
        <Badge variant="default" className="text-xs px-1 py-0 bg-emerald-700">حفظ نهائي</Badge>
      </td>
    );
  }

  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    draft:     { label: "مسودة",  variant: "secondary"    },
    finalized: { label: "معتمدة", variant: "default"      },
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
    <tr className="font-bold text-xs border-t-2" style={{ background: "hsl(210 15% 93%)" }}>
      <td className="sticky-footer-right" style={{ right: 0, width: 36 }} />
      <td className="sticky-footer-right text-right pr-3 py-1.5" style={{ right: 36, minWidth: 160, boxShadow: "-4px 0 8px -2px rgba(0,0,0,0.12)" }} colSpan={6}>
        الإجمالي ({rows.length} مريض)
      </td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("servicesTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("orRoomTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("equipmentTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("drugsTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("consumablesTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("gasTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("stayTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("grandTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("companyShareTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("patientShareTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("paidTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("outstandingTotal"))}</td>
      <td className="text-center tabular-nums px-2">{formatNumber(sum("transferredTotal"))}</td>
      <td />
      <td className="sticky-footer-left" style={{ minWidth: 80 }} />
    </tr>
  );
}
