import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Loader2, Pill, Beaker } from "lucide-react";
import { TargetBadge } from "./TargetBadge";
import { PharmacyGroupPopup } from "./PharmacyGroupPopup";
import type { ClinicOrder } from "../types";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  executed: "منفذ",
  cancelled: "ملغي",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  executed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

interface Props {
  orders: ClinicOrder[];
  isLoading: boolean;
  onExecute: (order: ClinicOrder) => void;
  isExecuting: boolean;
  canExecute: boolean;
}

interface DisplayRow {
  type: "service";
  order: ClinicOrder;
  group?: undefined;
}
interface DisplayGroup {
  type: "pharmacy-group";
  order?: undefined;
  group: {
    consultationId: string;
    orders: ClinicOrder[];
    patientName: string;
    doctorName: string;
    appointmentDate?: string;
    targetType: string;
    targetName?: string | null;
    targetId?: string | null;
    groupStatus: "pending" | "executed" | "mixed";
  };
}
type DisplayItem = DisplayRow | DisplayGroup;

export function OrdersTable({ orders, isLoading, onExecute, isExecuting, canExecute }: Props) {
  const displayItems = useMemo<DisplayItem[]>(() => {
    const serviceOrders = orders.filter(o => o.orderType === "service");
    const pharmacyOrders = orders.filter(o => o.orderType === "pharmacy");

    const groups = new Map<string, ClinicOrder[]>();
    for (const po of pharmacyOrders) {
      const key = po.consultationId || po.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(po);
    }

    const items: DisplayItem[] = [];
    for (const so of serviceOrders) {
      items.push({ type: "service", order: so });
    }
    for (const [consultationId, grpOrders] of groups) {
      const first = grpOrders[0];
      const allExecuted = grpOrders.every(o => o.status === "executed");
      const allPending = grpOrders.every(o => o.status === "pending");
      items.push({
        type: "pharmacy-group",
        group: {
          consultationId,
          orders: grpOrders,
          patientName: first.apptPatientName || first.patientName,
          doctorName: first.doctorName || "",
          appointmentDate: first.appointmentDate || undefined,
          targetType: first.targetType,
          targetName: first.targetName,
          targetId: first.targetId,
          groupStatus: allExecuted ? "executed" : allPending ? "pending" : "mixed",
        },
      });
    }
    items.sort((a, b) => {
      const aDate = (a.type === "service" ? a.order.createdAt : a.group.orders[0].createdAt) || "";
      const bDate = (b.type === "service" ? b.order.createdAt : b.group.orders[0].createdAt) || "";
      return bDate.localeCompare(aDate);
    });
    return items;
  }, [orders]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16 border rounded-lg">
        لا توجد أوامر
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-right w-8">النوع</TableHead>
            <TableHead className="text-right">الطبيب / المريض</TableHead>
            <TableHead className="text-right">الأمر</TableHead>
            <TableHead className="text-right w-36">الجهة</TableHead>
            <TableHead className="text-right w-24">الحالة</TableHead>
            {canExecute && <TableHead className="text-right w-32">إجراءات</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayItems.map((item) => {
            if (item.type === "service") {
              const order = item.order;
              return (
                <TableRow
                  key={order.id}
                  data-testid={`order-row-${order.id}`}
                  className="bg-blue-50/30 hover:bg-blue-50/60"
                >
                  <TableCell>
                    <Beaker className="h-4 w-4 text-blue-600" />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{order.patientName}</div>
                    {order.doctorName && (
                      <div className="text-xs text-muted-foreground">{order.doctorName}</div>
                    )}
                    {order.appointmentDate && (
                      <div className="text-xs text-muted-foreground" dir="ltr">{order.appointmentDate}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{order.serviceNameManual || order.serviceNameAr || order.serviceId}</span>
                  </TableCell>
                  <TableCell>
                    <TargetBadge targetType={order.targetType} targetName={order.targetName} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_CLASSES[order.status] || ""}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </Badge>
                  </TableCell>
                  {canExecute && (
                    <TableCell>
                      {order.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-blue-300 text-blue-700"
                          onClick={() => onExecute(order)}
                          disabled={isExecuting}
                          data-testid={`button-execute-${order.id}`}
                        >
                          {isExecuting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          تنفيذ
                        </Button>
                      )}
                      {order.status === "executed" && order.executedInvoiceId && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-executed-${order.id}`}>فاتورة صادرة</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            }

            const g = item.group;
            const pendingOrders = g.orders.filter(o => o.status === "pending");
            const drugNames = g.orders.map(o => o.drugName).filter(Boolean);
            const statusLabel = g.groupStatus === "executed" ? "منفذ" : g.groupStatus === "pending" ? "معلق" : "جزئي";
            const statusClass = g.groupStatus === "executed" ? STATUS_CLASSES.executed : g.groupStatus === "pending" ? STATUS_CLASSES.pending : "bg-amber-50 text-amber-700 border-amber-200";

            return (
              <TableRow
                key={`pharm-group-${g.consultationId}`}
                data-testid={`order-group-${g.consultationId}`}
                className="bg-green-50/30 hover:bg-green-50/60"
              >
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Pill className="h-4 w-4 text-green-600" />
                    {g.orders.length > 1 && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full w-4 h-4 flex items-center justify-center">
                        {g.orders.length}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{g.patientName}</div>
                  {g.doctorName && (
                    <div className="text-xs text-muted-foreground">{g.doctorName}</div>
                  )}
                  {g.appointmentDate && (
                    <div className="text-xs text-muted-foreground" dir="ltr">{g.appointmentDate}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {drugNames.map((name, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{name}</span>
                        {g.orders[i]?.dose && (
                          <span className="text-muted-foreground mr-1">({g.orders[i].dose})</span>
                        )}
                        {g.orders[i]?.status === "executed" && (
                          <span className="text-green-600 mr-1">✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <TargetBadge targetType={g.targetType} targetName={g.targetName} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${statusClass}`}>
                    {statusLabel}
                    {g.groupStatus === "mixed" && ` ${g.orders.filter(o => o.status === "executed").length}/${g.orders.length}`}
                  </Badge>
                </TableCell>
                {canExecute && (
                  <TableCell>
                    {pendingOrders.length > 0 && (
                      <PharmacyGroupPopup
                        orders={g.orders}
                        pendingOrders={pendingOrders}
                        patientName={g.patientName}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-green-300 text-green-700"
                            data-testid={`button-pharmacy-group-${g.consultationId}`}
                          >
                            <Pill className="h-3 w-3" />
                            صرف ({pendingOrders.length})
                          </Button>
                        }
                      />
                    )}
                    {pendingOrders.length === 0 && (
                      <span className="text-xs text-green-600">تم الصرف</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
