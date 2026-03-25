// Format number as Egyptian Pound currency
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "0.00 ج.م";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00 ج.م";
  return num.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " ج.م";
}

// Format a quantity value — max 2 decimal places, no trailing zeros
// Used for all quantity columns across pharmacy, transfers, and receiving screens
export function formatQty(qty: number | string | null | undefined): string {
  if (qty === null || qty === undefined) return "0";
  const num = typeof qty === "string" ? parseFloat(qty) : qty;
  if (isNaN(num)) return "0";
  // Round to 2dp then strip trailing zeros: 10.333 → "10.33", 10.5 → "10.5", 10.0 → "10"
  return parseFloat(num.toFixed(2)).toString();
}

// Format number without currency symbol
export function formatNumber(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format date in Arabic format
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Format date short
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Format date for input fields
export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

// Format datetime
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Account type labels
export const accountTypeLabels: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

// Journal status labels
export const journalStatusLabels: Record<string, string> = {
  draft: "مسودة",
  posted: "مُرحّل",
  reversed: "ملغي",
};

// Get status badge classes
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "status-draft";
    case "posted":
      return "status-posted";
    case "reversed":
      return "status-reversed";
    default:
      return "";
  }
}
