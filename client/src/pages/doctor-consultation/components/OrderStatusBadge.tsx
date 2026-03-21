import { Badge } from "@/components/ui/badge";

export type OrderStatus = "pending" | "executed" | "cancelled";

const STATUS_CONFIG: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "outline"; className: string }> = {
  pending:   { label: "معلق",  variant: "outline",    className: "border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400" },
  executed:  { label: "منفّذ", variant: "default",    className: "border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400" },
  cancelled: { label: "ملغي",  variant: "secondary",  className: "text-muted-foreground" },
};

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as OrderStatus] ?? { label: status, variant: "outline" as const, className: "" };
  return (
    <Badge
      variant={cfg.variant}
      className={`text-xs font-normal border ${cfg.className} ${className ?? ""}`}
      data-testid={`badge-order-status-${status}`}
    >
      {cfg.label}
    </Badge>
  );
}
