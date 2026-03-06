import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Plus, Printer, Settings, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useClinicBooking } from "./hooks/useClinicBooking";
import { useAppointmentQueue } from "./hooks/useAppointmentQueue";
import { ClinicHeader } from "./components/ClinicHeader";
import { AdminSummaryCards } from "./components/AdminSummaryCards";
import { AppointmentQueue } from "./components/AppointmentQueue";
import { BookingDialog } from "./components/BookingDialog";
import { TurnReceipt } from "./components/TurnReceipt";
import { ClinicManagementDialog } from "./components/ClinicManagementDialog";
import { DoctorStatementTab } from "../doctor-consultation/components/DoctorStatementTab";
import type { ClinicAppointment } from "./types";

export default function ClinicBooking() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [printAppointment, setPrintAppointment] = useState<ClinicAppointment | null>(null);
  const [activeTab, setActiveTab] = useState("queue");

  const { data: myDoctor } = useQuery<{ doctorId: string | null }>({
    queryKey: ["/api/clinic-my-doctor"],
    queryFn: () => apiRequest("GET", "/api/clinic-my-doctor").then((r) => r.json()),
  });
  const myDoctorId = myDoctor?.doctorId || undefined;

  const {
    clinics,
    clinicsLoading,
    selectedClinicId,
    setSelectedClinicId,
    selectedDate,
    setSelectedDate,
  } = useClinicBooking();

  const selectedClinic = clinics.find((c) => c.id === selectedClinicId);

  const { appointments, isLoading, statusMutation, bookMutation } = useAppointmentQueue(
    selectedClinicId,
    selectedDate
  );

  const handleBook = async (data: any) => {
    const result = await bookMutation.mutateAsync(data);
    setPrintAppointment({ ...result, doctorName: "", clinicName: selectedClinic?.nameAr ?? "" });
    return result;
  };

  const handleStartConsultation = (apt: ClinicAppointment) => {
    navigate(`/doctor-consultation/${apt.id}`);
  };

  const handlePrint = (apt: ClinicAppointment) => {
    setPrintAppointment(apt);
    setTimeout(() => window.print(), 100);
  };

  if (clinicsLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">جارٍ التحميل...</div>;
  }

  if (clinics.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p className="text-lg">لا توجد عيادات مُضافة بعد</p>
        {hasPermission("clinic.manage") && (
          <>
            <p className="text-sm mt-2">ابدأ بإضافة عيادة جديدة</p>
            <Button className="mt-3 gap-2" onClick={() => setManageOpen(true)} data-testid="button-add-first-clinic">
              <Settings className="h-4 w-4" />
              إضافة عيادة
            </Button>
            <ClinicManagementDialog open={manageOpen} onClose={() => setManageOpen(false)} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <ClinicHeader
        clinics={clinics}
        selectedClinicId={selectedClinicId}
        onSelect={setSelectedClinicId}
        onManage={() => setManageOpen(true)}
      />

      {hasPermission("clinic.view_all") && !selectedClinicId && (
        <AdminSummaryCards
          clinics={clinics}
          selectedDate={selectedDate}
          onSelect={setSelectedClinicId}
        />
      )}

      {selectedClinicId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9">
            <TabsTrigger value="queue" className="text-sm gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              قائمة الانتظار
            </TabsTrigger>
            <TabsTrigger value="statement" className="text-sm gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              كشف الحساب
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-3 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-40"
                  data-testid="input-date-picker"
                />
              </div>
              <div className="mr-auto flex gap-2">
                {hasPermission("clinic.book") && (
                  <Button
                    onClick={() => setBookingOpen(true)}
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
              onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
              isChanging={statusMutation.isPending}
              onStartConsultation={handleStartConsultation}
            />
          </TabsContent>

          <TabsContent value="statement" className="mt-3">
            <DoctorStatementTab doctorId={myDoctorId} clinicId={selectedClinicId} />
          </TabsContent>
        </Tabs>
      )}

      <BookingDialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        clinicId={selectedClinicId}
        selectedDate={selectedDate}
        onBook={handleBook}
        isPending={bookMutation.isPending}
      />

      <TurnReceipt
        appointment={printAppointment}
        clinicName={selectedClinic?.nameAr ?? ""}
      />

      <ClinicManagementDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
