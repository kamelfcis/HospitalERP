/*
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  ⚠️  NO-TOUCH ZONE — منطقة محظور التعديل                     ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  جدول أوامر الأطباء — منطق العرض والتجميع معقد               ║
 * ║                                                               ║
 * ║  هذا الملف يجمّع الأوامر في مجموعات (صيدلية / خدمة / قسم)   ║
 * ║  ويحسب الإجماليات بطريقة خاصة                                ║
 * ║                                                               ║
 * ║  أي تغيير في هيكل البيانات هنا يؤثر على:                    ║
 * ║   • عرض الأوامر في شاشة الطبيب                               ║
 * ║   • حساب المبالغ المستحقة                                    ║
 * ║  راجع useClinicOrders.ts أولاً قبل أي تعديل                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pill, Beaker } from "lucide-react";
import { TargetBadge } from "./TargetBadge";
import { PharmacyGroupPopup } from "./PharmacyGroupPopup";
import { ServiceGroupPopup } from "./ServiceGroupPopup";
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

interface GroupData {
  consultationId: string;
  orders: ClinicOrder[];
  patientName: string;
  doctorName: string;
  appointmentDate?: string;
  targetType: string;
  targetName?: string | null;
  targetId?: string | null;
  groupStatus: "pending" | "executed" | "mixed";
}

type DisplayItem =
  | { type: "pharmacy-group"; group: GroupData }
  | { type: "service-group"; group: GroupData };

export function OrdersTable({ orders, isLoading, onExecute, isExecuting, canExecute }: Props) {
  const displayItems = useMemo<DisplayItem[]>(() => {
    const serviceOrders = orders.filter(o => o.orderType === "service");
    const pharmacyOrders = orders.filter(o => o.orderType === "pharmacy");

    const buildGroups = (list: ClinicOrder[], type: "pharmacy-group" | "service-group") => {
      const groups = new Map<string, ClinicOrder[]>();
      for (const o of list) {
        const key = o.consultationId || o.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(o);
      }
      const items: DisplayItem[] = [];
      for (const [consultationId, grpOrders] of groups) {
        const first = grpOrders[0];
        const allExecuted = grpOrders.every(o => o.status === "executed");
        const allPending = grpOrders.every(o => o.status === "pending");
        items.push({
          type,
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
      return items;
    };

    const items: DisplayItem[] = [
      ...buildGroups(serviceOrders, "service-group"),
      ...buildGroups(pharmacyOrders, "pharmacy-group"),
    ];

    items.sort((a, b) => {
      const aDate = a.group.orders[0].createdAt || "";
      const bDate = b.group.orders[0].createdAt || "";
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
            const g = item.group;
            const pendingOrders = g.orders.filter(o => o.status === "pending");
            const statusLabel = g.groupStatus === "executed" ? "منفذ" : g.groupStatus === "pending" ? "معلق" : "جزئي";
            const statusClass = g.groupStatus === "executed" ? STATUS_CLASSES.executed : g.groupStatus === "pending" ? STATUS_CLASSES.pending : "bg-amber-50 text-amber-700 border-amber-200";
            const isPharmacy = item.type === "pharmacy-group";
            const Icon = isPharmacy ? Pill : Beaker;
            const colorScheme = isPharmacy
              ? { bg: "bg-green-50/30 hover:bg-green-50/60", icon: "text-green-600", badge: "bg-green-100 text-green-700", btnBorder: "border-green-300 text-green-700" }
              : { bg: "bg-blue-50/30 hover:bg-blue-50/60", icon: "text-blue-600", badge: "bg-blue-100 text-blue-700", btnBorder: "border-blue-300 text-blue-700" };

            const names = isPharmacy
              ? g.orders.map(o => o.drugName).filter(Boolean)
              : g.orders.map(o => o.serviceNameAr || o.serviceNameManual).filter(Boolean);

            return (
              <TableRow
                key={`${item.type}-${g.consultationId}`}
                data-testid={`order-group-${g.consultationId}`}
                className={colorScheme.bg}
              >
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Icon className={`h-4 w-4 ${colorScheme.icon}`} />
                    {g.orders.length > 1 && (
                      <span className={`text-[10px] font-bold ${colorScheme.badge} rounded-full w-4 h-4 flex items-center justify-center`}>
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
                    {names.map((name, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{name}</span>
                        {isPharmacy && g.orders[i]?.dose && (
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
                    {pendingOrders.length > 0 && isPharmacy && (
                      <PharmacyGroupPopup
                        orders={g.orders}
                        pendingOrders={pendingOrders}
                        patientName={g.patientName}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
                            data-testid={`button-pharmacy-group-${g.consultationId}`}
                          >
                            <Pill className="h-3 w-3" />
                            صرف ({pendingOrders.length})
                          </Button>
                        }
                      />
                    )}
                    {pendingOrders.length > 0 && !isPharmacy && g.orders.length === 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
                        onClick={() => onExecute(pendingOrders[0])}
                        disabled={isExecuting}
                        data-testid={`button-execute-${g.orders[0].id}`}
                      >
                        <Beaker className="h-3 w-3" />
                        تنفيذ
                      </Button>
                    )}
                    {pendingOrders.length > 0 && !isPharmacy && g.orders.length > 1 && (
                      <ServiceGroupPopup
                        orders={g.orders}
                        pendingOrders={pendingOrders}
                        patientName={g.patientName}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-xs gap-1 ${colorScheme.btnBorder}`}
                            data-testid={`button-service-group-${g.consultationId}`}
                          >
                            <Beaker className="h-3 w-3" />
                            تنفيذ ({pendingOrders.length})
                          </Button>
                        }
                      />
                    )}
                    {pendingOrders.length === 0 && (
                      <span className={`text-xs ${isPharmacy ? "text-green-600" : "text-blue-600"}`}>
                        {isPharmacy ? "تم الصرف" : "تم التنفيذ"}
                      </span>
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
