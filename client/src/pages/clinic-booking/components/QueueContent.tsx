import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";
import { AppointmentQueue } from "./AppointmentQueue";
import type { ClinicAppointment } from "../types";

interface Props {
  selectedDate:      string;
  onDateChange:      (date: string) => void;
  appointments:      ClinicAppointment[];
  isLoading:         boolean;
  onStatusChange:    (id: string, status: string) => void;
  isChangingStatus:  boolean;
  onStartConsultation: (apt: ClinicAppointment) => void;
  onCancelRefund:    (id: string, refundAmount?: number, cancelAppointment?: boolean) => Promise<any>;
  isCancelRefunding: boolean;
}

export function QueueContent({
  selectedDate, onDateChange, appointments, isLoading,
  onStatusChange, isChangingStatus, onStartConsultation,
  onCancelRefund, isCancelRefunding,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={selectedDate}
          onChange={e => onDateChange(e.target.value)}
          className="w-40"
          data-testid="input-date-picker"
        />
        <span className="text-xs text-muted-foreground">
          لإضافة حجز جديد انتقل إلى <strong>سجل المرضى</strong>
        </span>
      </div>

      <AppointmentQueue
        appointments={appointments}
        isLoading={isLoading}
        onStatusChange={onStatusChange}
        isChanging={isChangingStatus}
        onStartConsultation={onStartConsultation}
        onCancelRefund={onCancelRefund}
        isCancelRefunding={isCancelRefunding}
      />
    </div>
  );
}
