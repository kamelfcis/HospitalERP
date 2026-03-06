import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Loader2, Pill, Beaker } from "lucide-react";
import { TargetBadge } from "./TargetBadge";
import { PharmacyDrugPopup } from "./PharmacyDrugPopup";
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
}

export function OrdersTable({ orders, isLoading, onExecute, isExecuting }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
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
            <TableHead className="text-right w-32">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              data-testid={`order-row-${order.id}`}
              className={
                order.orderType === "pharmacy"
                  ? "bg-green-50/30 hover:bg-green-50/60"
                  : "bg-blue-50/30 hover:bg-blue-50/60"
              }
            >
              <TableCell>
                {order.orderType === "pharmacy" ? (
                  <Pill className="h-4 w-4 text-green-600" />
                ) : (
                  <Beaker className="h-4 w-4 text-blue-600" />
                )}
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
                {order.orderType === "pharmacy" ? (
                  <div>
                    <span className="text-sm font-medium">{order.drugName}</span>
                    {order.dose && (
                      <span className="text-xs text-muted-foreground mr-2">{order.dose}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm">{order.serviceNameManual || order.serviceId}</span>
                )}
              </TableCell>
              <TableCell>
                <TargetBadge targetType={order.targetType} targetName={order.targetName} />
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-xs ${STATUS_CLASSES[order.status] || ""}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </Badge>
              </TableCell>
              <TableCell>
                {order.status === "pending" && (
                  order.orderType === "pharmacy" ? (
                    <PharmacyDrugPopup
                      order={order}
                      trigger={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                          data-testid={`button-pharmacy-popup-${order.id}`}
                        >
                          <Pill className="h-3 w-3" />
                          صرف
                        </Button>
                      }
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
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
                  )
                )}
                {order.status === "executed" && order.executedInvoiceId && (
                  <span className="text-xs text-muted-foreground">✓ فاتورة صادرة</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
