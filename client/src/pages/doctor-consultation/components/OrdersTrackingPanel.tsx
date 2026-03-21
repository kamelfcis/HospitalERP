import { Loader2, FlaskConical, Pill, AlertCircle } from "lucide-react";
import { useOrderExecutionTracking } from "../hooks/useOrderExecutionTracking";
import { OrderStatusBadge } from "./OrderStatusBadge";

interface CounterProps {
  label: string;
  total: number;
  executed: number;
  pending: number;
  icon: React.ReactNode;
}

function OrderCounter({ label, total, executed, pending, icon }: CounterProps) {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs bg-muted/40 rounded px-3 py-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="font-medium shrink-0">{label}</span>
      <span className="text-muted-foreground shrink-0">({total})</span>
      <span className="text-green-600 dark:text-green-400 shrink-0">
        ✓ {executed}
      </span>
      {pending > 0 && (
        <span className="text-amber-600 dark:text-amber-400 shrink-0">
          ⏳ {pending}
        </span>
      )}
    </div>
  );
}

interface OrdersTrackingPanelProps {
  appointmentId: string;
}

export function OrdersTrackingPanel({ appointmentId }: OrdersTrackingPanelProps) {
  const { data, isLoading, isError, error } = useOrderExecutionTracking(appointmentId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2" data-testid="orders-tracking-loading">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>جار تحميل الطلبات...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive py-2" data-testid="orders-tracking-error">
        <AlertCircle className="h-3 w-3" />
        <span>{(error as Error)?.message ?? "تعذّر تحميل الطلبات"}</span>
      </div>
    );
  }

  const hasOrders = (data?.totalService ?? 0) + (data?.totalPharmacy ?? 0) > 0;

  if (!hasOrders) {
    return (
      <p className="text-xs text-muted-foreground py-2" data-testid="orders-tracking-empty">
        لا توجد طلبات مسجّلة لهذه الزيارة.
      </p>
    );
  }

  const serviceOrders  = data!.orders.filter(o => o.orderType === "service");
  const pharmacyOrders = data!.orders.filter(o => o.orderType === "pharmacy");

  return (
    <div className="space-y-3" data-testid="orders-tracking-panel">
      {/* ── ملخص الإحصاءات ── */}
      <div className="flex flex-wrap gap-2">
        <OrderCounter
          label="الطلبات الطبية"
          total={data!.totalService}
          executed={data!.executedService}
          pending={data!.pendingService}
          icon={<FlaskConical className="h-3 w-3" />}
        />
        <OrderCounter
          label="الدواء"
          total={data!.totalPharmacy}
          executed={data!.executedPharmacy}
          pending={data!.pendingPharmacy}
          icon={<Pill className="h-3 w-3" />}
        />
      </div>

      {/* ── قائمة التفصيلية ── */}
      <div className="space-y-1">
        {serviceOrders.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <FlaskConical className="h-3 w-3" />
              الطلبات الطبية
            </p>
            {serviceOrders.map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded border border-border/50 bg-background"
                data-testid={`row-service-order-${order.id}`}
              >
                <span className="flex-1 min-w-0 truncate" title={order.displayName}>
                  {order.displayName}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {order.targetName && (
                    <span className="text-muted-foreground truncate max-w-[80px]">{order.targetName}</span>
                  )}
                  <OrderStatusBadge status={order.status} />
                  {order.executedAt && (
                    <span className="text-muted-foreground tabular-nums hidden sm:inline">
                      {new Date(order.executedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {pharmacyOrders.length > 0 && (
          <div className="space-y-1 mt-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Pill className="h-3 w-3" />
              طلبات الدواء
            </p>
            {pharmacyOrders.map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded border border-border/50 bg-background"
                data-testid={`row-pharmacy-order-${order.id}`}
              >
                <span className="flex-1 min-w-0 truncate" title={order.displayName}>
                  {order.displayName}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {order.targetName && (
                    <span className="text-muted-foreground truncate max-w-[80px]">{order.targetName}</span>
                  )}
                  <OrderStatusBadge status={order.status} />
                  {order.executedAt && (
                    <span className="text-muted-foreground tabular-nums hidden sm:inline">
                      {new Date(order.executedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(data!.pendingService > 0 || data!.pendingPharmacy > 0) && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="orders-tracking-pending-note">
          نتائج الفحوصات والمعمل غير مدمجة بعد — يظهر الحالة فقط.
        </p>
      )}
    </div>
  );
}
