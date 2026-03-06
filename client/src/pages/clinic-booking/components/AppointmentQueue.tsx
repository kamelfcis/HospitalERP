import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stethoscope, Loader2, Trash2 } from "lucide-react";
import type { ClinicAppointment } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";

interface Props {
  appointments: ClinicAppointment[];
  isLoading: boolean;
  onStatusChange: (id: string, status: string) => void;
  isChanging: boolean;
  onStartConsultation: (apt: ClinicAppointment) => void;
}

export function AppointmentQueue({ appointments, isLoading, onStatusChange, isChanging, onStartConsultation }: Props) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16 border rounded-lg">
        لا توجد حجوزات لهذا اليوم
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-right w-16">الدور</TableHead>
            <TableHead className="text-right">اسم المريض</TableHead>
            <TableHead className="text-right">الطبيب</TableHead>
            <TableHead className="text-right w-28">الوقت</TableHead>
            <TableHead className="text-right w-40">الحالة</TableHead>
            <TableHead className="text-right w-32">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((apt) => (
            <TableRow
              key={apt.id}
              data-testid={`appointment-row-${apt.id}`}
              className={apt.status === "done" ? "opacity-50" : apt.status === "cancelled" ? "opacity-40" : ""}
            >
              <TableCell className="font-bold text-center text-lg">{apt.turnNumber}</TableCell>
              <TableCell>
                <div className="font-medium">{apt.patientName}</div>
                {apt.patientPhone && (
                  <div className="text-xs text-muted-foreground" dir="ltr">{apt.patientPhone}</div>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">{apt.doctorName}</div>
                {apt.doctorSpecialty && (
                  <div className="text-xs text-muted-foreground">{apt.doctorSpecialty}</div>
                )}
              </TableCell>
              <TableCell className="text-sm" dir="ltr">{apt.appointmentTime || "—"}</TableCell>
              <TableCell>
                <Select
                  value={apt.status}
                  onValueChange={(v) => onStatusChange(apt.id, v)}
                  disabled={isChanging || apt.status === "done" || apt.status === "cancelled"}
                >
                  <SelectTrigger className={`h-8 text-xs border ${STATUS_COLORS[apt.status]}`} data-testid={`status-${apt.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waiting">في الانتظار</SelectItem>
                    <SelectItem value="in_consultation">داخل الكشف</SelectItem>
                    <SelectItem value="done">انتهى</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {(apt.status === "waiting" || apt.status === "in_consultation") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => onStartConsultation(apt)}
                      data-testid={`button-consult-${apt.id}`}
                    >
                      <Stethoscope className="h-3 w-3" />
                      بدء الكشف
                    </Button>
                  )}
                  {apt.status === "waiting" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onStatusChange(apt.id, "cancelled")}
                      disabled={isChanging}
                      data-testid={`button-cancel-${apt.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
