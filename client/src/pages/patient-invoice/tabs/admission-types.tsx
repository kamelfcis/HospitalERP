import { Badge } from "@/components/ui/badge";
import type { Admission } from "@shared/schema";

interface AdmissionWithLatestInvoice extends Admission {
  patientName: string;
  latestInvoiceNumber?: string | null;
  latestInvoiceStatus?: string | null;
  latestInvoiceDeptName?: string | null;
  totalNetAmount?: string | number | null;
  totalPaidAmount?: string | number | null;
  totalTransferredAmount?: string | number | null;
  /**
   * Count of distinct non-null visit_group_ids among source (non-consolidated)
   * invoices for this admission. 0 or null = no visit groups.
   * Populated by getAdmissions(); NOT present in single getAdmission() calls.
   */
  visitGroupCount?: number | null;
}

/** حالات الإقامة: label + CSS classes للـ Badge */
const ADMISSION_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:     { label: "نشطة",  cls: "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" },
  discharged: { label: "خرج",   cls: "bg-blue-600  text-white no-default-hover-elevate no-default-active-elevate" },
  cancelled:  { label: "ملغاة", cls: "bg-red-600   text-white no-default-hover-elevate no-default-active-elevate" },
};

/** حالات الفاتورة: label + CSS classes للـ Badge */
const INVOICE_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "مسودة", cls: "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate" },
  finalized: { label: "نهائي", cls: "bg-green-600  text-white no-default-hover-elevate no-default-active-elevate" },
  cancelled: { label: "ملغي",  cls: "bg-red-600   text-white no-default-hover-elevate no-default-active-elevate" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function AdmissionStatusBadge({ status }: { status: string }) {
  const cfg = ADMISSION_STATUS_CONFIG[status];
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${cfg?.cls ?? ""}`}>
      {cfg?.label ?? status}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const cfg = INVOICE_STATUS_CONFIG[status];
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${cfg?.cls ?? ""}`}>
      {cfg?.label ?? status}
    </Badge>
  );
}

// ─── Props Interface ───────────────────────────────────────────────────────────


export type { AdmissionWithLatestInvoice };
export {
  ADMISSION_STATUS_CONFIG,
  INVOICE_STATUS_CONFIG,
  AdmissionStatusBadge,
  InvoiceStatusBadge,
};
