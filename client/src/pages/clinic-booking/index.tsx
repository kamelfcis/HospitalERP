import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Settings, ClipboardList, AlertCircle, LayoutDashboard, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useClinicBooking } from "./hooks/useClinicBooking";
import { useClinicPermissions } from "./hooks/useClinicPermissions";
import { useAppointmentQueue } from "./hooks/useAppointmentQueue";
import { useDoctorDashboard, useSecretaryDashboard } from "./hooks/useOutpatientDashboard";
import { ClinicHeader } from "./components/ClinicHeader";
import { AdminSummaryCards } from "./components/AdminSummaryCards";
import { QueueContent } from "./components/QueueContent";
import { ClinicManagementDialog } from "./components/ClinicManagementDialog";
import { DoctorStatementTab } from "../doctor-consultation/components/DoctorStatementTab";
import { DoctorDailySummary } from "./components/DoctorDailySummary";
import { SecretaryDailySummary } from "./components/SecretaryDailySummary";
import type { ClinicAppointment } from "./types";

// ── Thin wrapper: doctor dashboard tab content ────────────────────────────────

function DoctorDashboardTab({ date }: { date: string }) {
  const { data, isLoading, error, refetch } = useDoctorDashboard(date);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">جارٍ تحميل البيانات…</div>;
  }
  if (error) {
    return (
      <div className="text-center py-8 text-destructive text-sm">
        تعذّر تحميل البيانات.{" "}
        <button className="underline" onClick={() => refetch()} data-testid="button-doctor-dashboard-retry">
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">بيانات يوم {date} · تُحدَّث كل دقيقة</p>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => refetch()}
          data-testid="button-doctor-dashboard-refresh"
        >
          <RefreshCw className="h-3 w-3" />
          تحديث
        </button>
      </div>
      <DoctorDailySummary data={data} />
    </div>
  );
}

// ── Thin wrapper: secretary dashboard tab content ─────────────────────────────

function SecretaryDashboardTab({ clinicId, date }: { clinicId: string; date: string }) {
  const { data, isLoading, error, refetch } = useSecretaryDashboard(clinicId, date);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">جارٍ تحميل البيانات…</div>;
  }
  if (error) {
    return (
      <div className="text-center py-8 text-destructive text-sm">
        تعذّر تحميل البيانات.{" "}
        <button className="underline" onClick={() => refetch()} data-testid="button-secretary-dashboard-retry">
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">بيانات يوم {date} · تُحدَّث كل دقيقة</p>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => refetch()}
          data-testid="button-secretary-dashboard-refresh"
        >
          <RefreshCw className="h-3 w-3" />
          تحديث
        </button>
      </div>
      <SecretaryDailySummary data={data} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClinicBooking() {
  const [, navigate]    = useLocation();
  const { isAdmin, canManage, canViewStatement, canConsult, canBook } = useClinicPermissions();
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

  const showDashboard = !!selectedClinicId && (canConsult || canBook || isAdmin);

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

  const hasTabs = selectedClinicId && (canViewStatement || showDashboard);

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

      {selectedClinicId && (hasTabs ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9">
            <TabsTrigger value="queue" className="text-sm gap-1.5" data-testid="tab-queue">
              <CalendarDays className="h-3.5 w-3.5" />
              قائمة الانتظار
            </TabsTrigger>

            {showDashboard && (
              <TabsTrigger value="dashboard" className="text-sm gap-1.5" data-testid="tab-dashboard">
                <LayoutDashboard className="h-3.5 w-3.5" />
                لوحة اليوم
              </TabsTrigger>
            )}

            {canViewStatement && (
              <TabsTrigger value="statement" className="text-sm gap-1.5" data-testid="tab-statement">
                <ClipboardList className="h-3.5 w-3.5" />
                كشف الحساب
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="queue" className="mt-3">
            <QueueContent {...queueProps} />
          </TabsContent>

          {showDashboard && (
            <TabsContent value="dashboard" className="mt-3">
              {canConsult && !isAdmin ? (
                <DoctorDashboardTab date={selectedDate} />
              ) : (
                <SecretaryDashboardTab clinicId={selectedClinicId} date={selectedDate} />
              )}
            </TabsContent>
          )}

          {canViewStatement && (
            <TabsContent value="statement" className="mt-3">
              <DoctorStatementTab doctorId={myDoctorId} clinicId={selectedClinicId} />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <QueueContent {...queueProps} />
      ))}

      <ClinicManagementDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
