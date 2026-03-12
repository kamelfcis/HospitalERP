import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Settings, ClipboardList, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useClinicBooking } from "./hooks/useClinicBooking";
import { useClinicPermissions } from "./hooks/useClinicPermissions";
import { useAppointmentQueue } from "./hooks/useAppointmentQueue";
import { ClinicHeader } from "./components/ClinicHeader";
import { AdminSummaryCards } from "./components/AdminSummaryCards";
import { QueueContent } from "./components/QueueContent";
import { ClinicManagementDialog } from "./components/ClinicManagementDialog";
import { DoctorStatementTab } from "../doctor-consultation/components/DoctorStatementTab";
import type { ClinicAppointment } from "./types";

export default function ClinicBooking() {
  const [, navigate]    = useLocation();
  const { isAdmin, canManage, canViewStatement } = useClinicPermissions();
  const [manageOpen, setManageOpen] = useState(false);
  const [activeTab,  setActiveTab]  = useState("queue");

  const { data: myDoctor } = useQuery<{ doctorId: string | null }>({
    queryKey: ["/api/clinic-my-doctor"],
    queryFn: () => apiRequest("GET", "/api/clinic-my-doctor").then(r => r.json()),
  });
  const myDoctorId = myDoctor?.doctorId || undefined;

  const { clinics, clinicsLoading, selectedClinicId, setSelectedClinicId, selectedDate, setSelectedDate } = useClinicBooking();
  const selectedClinic = clinics.find(c => c.id === selectedClinicId);
  const { appointments, isLoading, noDoctorLinked, statusMutation, cancelRefundMutation } = useAppointmentQueue(selectedClinicId, selectedDate);

  if (clinicsLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">جارٍ التحميل...</div>;
  }

  if (clinics.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p className="text-lg">لا توجد عيادات مُضافة بعد</p>
        {canManage && (
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

  const queueProps = {
    selectedDate,
    onDateChange:        setSelectedDate,
    appointments,
    isLoading,
    onStatusChange:      (id: string, status: string) => statusMutation.mutate({ id, status }),
    isChangingStatus:    statusMutation.isPending,
    onStartConsultation: (apt: ClinicAppointment) => navigate(`/doctor-consultation/${apt.id}`),
    onCancelRefund:      (id: string, refundAmount?: number, cancelAppointment?: boolean) =>
      cancelRefundMutation.mutateAsync({ aptId: id, refundAmount, cancelAppointment }),
    isCancelRefunding:   cancelRefundMutation.isPending,
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <ClinicHeader
        clinics={clinics}
        selectedClinicId={selectedClinicId}
        onSelect={setSelectedClinicId}
        onManage={() => setManageOpen(true)}
      />

      {isAdmin && !selectedClinicId && (
        <AdminSummaryCards clinics={clinics} selectedDate={selectedDate} onSelect={setSelectedClinicId} />
      )}

      {noDoctorLinked && selectedClinicId && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="banner-no-doctor-linked">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>حسابك غير مرتبط بطبيب — تواصل مع مدير النظام لربط حسابك بطبيب حتى تظهر قائمة الانتظار</span>
        </div>
      )}

      {selectedClinicId && (canViewStatement ? (
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
          <TabsContent value="queue" className="mt-3">
            <QueueContent {...queueProps} />
          </TabsContent>
          <TabsContent value="statement" className="mt-3">
            <DoctorStatementTab doctorId={myDoctorId} clinicId={selectedClinicId} />
          </TabsContent>
        </Tabs>
      ) : (
        <QueueContent {...queueProps} />
      ))}

      <ClinicManagementDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
