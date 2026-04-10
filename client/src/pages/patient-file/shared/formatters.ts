export function fmtDate(d?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ar-EG", opts ?? { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export function fmtDateTime(d?: string | null): string {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    const datePart = dt.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
    const timePart = dt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    return `${datePart} ${timePart}`;
  } catch {
    return d;
  }
}

export function fmtMoney(v?: string | number | null): string {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(v?: string | number | null): string {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "0";
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:      { label: "مسودة",  className: "bg-amber-50  text-amber-700  border-amber-200"  },
  finalized:  { label: "معتمد",  className: "bg-green-50  text-green-700  border-green-200"  },
  cancelled:  { label: "ملغي",   className: "bg-red-50    text-red-700    border-red-200"    },
  active:     { label: "نشط",    className: "bg-blue-50   text-blue-700   border-blue-200"   },
  discharged: { label: "خارج",   className: "bg-gray-50   text-gray-600   border-gray-200"   },
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:          "نقدي",
  card:          "بطاقة",
  bank_transfer: "تحويل بنكي",
  insurance:     "تأمين",
};

export const VISIT_TYPE_LABELS: Record<string, string> = {
  inpatient:  "داخلي",
  outpatient: "خارجي",
  standalone: "مستقل",
};

export const LINE_TYPE_LABELS: Record<string, string> = {
  service:    "خدمات",
  drug:       "أدوية",
  consumable: "مستهلكات",
  equipment:  "أجهزة",
};
