import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Plus } from "lucide-react";
import { AppointmentQueue } from "./AppointmentQueue";
import type { ClinicAppointment } from "../types";

interface Props {
  selectedDate: string;
  onDateChange: (date: string) => void;
  appointments: ClinicAppointment[];
  isLoading: boolean;
  onStatusChange: (id: string, status: string) => void;
  isChangingStatus: boolean;
  onStartConsultation: (apt: ClinicAppointment) => void;
  canBook: boolean;
  onBookClick: () => void;
}

export function QueueContent({
  selectedDate,
  onDateChange,
  appointments,
  isLoading,
  onStatusChange,
  isChangingStatus,
  onStartConsultation,
  canBook,
  onBookClick,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-40"
            data-testid="input-date-picker"
          />
        </div>
        <div className="mr-auto flex gap-2">
          {canBook && (
            <Button
              onClick={onBookClick}
              className="gap-2"
              data-testid="button-new-booking"
            >
              <Plus className="h-4 w-4" />
              حجز جديد
            </Button>
          )}
        </div>
      </div>

      <AppointmentQueue
        appointments={appointments}
        isLoading={isLoading}
        onStatusChange={onStatusChange}
        isChanging={isChangingStatus}
        onStartConsultation={onStartConsultation}
      />
    </div>
  );
}
