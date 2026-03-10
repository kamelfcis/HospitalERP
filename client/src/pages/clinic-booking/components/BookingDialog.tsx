import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCheck, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Doctor {
  id: string;
  name: string;
  specialty?: string | null;
}

interface PrefilledPatient {
  id: string;
  name: string;
  phone?: string | null;
  patientCode?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  selectedDate: string;
  onBook: (data: {
    doctorId: string; patientName: string; patientPhone?: string;
    appointmentDate: string; appointmentTime?: string; patientId?: string;
  }) => Promise<any>;
  isPending: boolean;
  prefilledPatient?: PrefilledPatient;
}

export function BookingDialog({ open, onClose, clinicId, selectedDate, onBook, isPending, prefilledPatient }: Props) {
  const { toast } = useToast();
  const [patientName, setPatientName] = useState(prefilledPatient?.name ?? "");
  const [patientPhone, setPatientPhone] = useState(prefilledPatient?.phone ?? "");
  const [doctorId, setDoctorId] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(selectedDate);

  useEffect(() => {
    if (open) {
      setPatientName(prefilledPatient?.name ?? "");
      setPatientPhone(prefilledPatient?.phone ?? "");
      setAppointmentDate(selectedDate);
    }
  }, [open, prefilledPatient, selectedDate]);

  const { data: schedules = [] } = useQuery<{ doctorId: string; doctorName: string }[]>({
    queryKey: ["/api/clinic-clinics", clinicId, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${clinicId}/schedules`).then((r) => r.json()),
    enabled: !!clinicId && open,
  });

  const { data: allDoctors = [] } = useQuery<Doctor[]>({
    queryKey: ["/api/doctors"],
    queryFn: () => apiRequest("GET", "/api/doctors").then((r) => r.json()),
    enabled: open,
  });

  const doctors: Doctor[] = schedules.length > 0
    ? schedules.map((s: any) => ({ id: s.doctorId, name: s.doctorName, specialty: null }))
    : allDoctors;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) return toast({ variant: "destructive", title: "اسم المريض مطلوب" });
    if (!doctorId) return toast({ variant: "destructive", title: "الطبيب مطلوب" });
    if (!appointmentDate) return toast({ variant: "destructive", title: "التاريخ مطلوب" });

    try {
      const result = await onBook({
        doctorId,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim() || undefined,
        appointmentDate,
        appointmentTime: appointmentTime || undefined,
        patientId: prefilledPatient?.id,
      });
      toast({ title: `تم الحجز — الدور: ${result.turnNumber}` });
      setPatientName(prefilledPatient?.name ?? "");
      setPatientPhone(prefilledPatient?.phone ?? "");
      setDoctorId("");
      setAppointmentTime("");
      onClose();
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: _em || "خطأ في الحجز" });
    }
  };

  const isLinked = !!prefilledPatient;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>حجز موعد جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* معلومات المريض */}
          <div className="space-y-2">
            <Label htmlFor="patientName">
              اسم المريض *
              {isLinked && (
                <Badge variant="outline" className="mr-2 text-xs text-green-700 border-green-300 bg-green-50">
                  <UserCheck className="h-3 w-3 ml-1" />
                  مريض مسجل
                </Badge>
              )}
            </Label>
            {isLinked ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                <User className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-sm font-medium flex-1">{prefilledPatient.name}</span>
                {prefilledPatient.patientCode && (
                  <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    {prefilledPatient.patientCode}
                  </span>
                )}
              </div>
            ) : (
              <Input
                id="patientName"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="اسم المريض"
                data-testid="input-patient-name"
              />
            )}
          </div>

          {!isLinked && (
            <div className="space-y-2">
              <Label htmlFor="patientPhone">رقم الهاتف</Label>
              <Input
                id="patientPhone"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="رقم الهاتف"
                dir="ltr"
                data-testid="input-patient-phone"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>الطبيب *</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger data-testid="select-doctor">
                <SelectValue placeholder="اختر الطبيب..." />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.specialty ? ` — ${d.specialty}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="aptDate">التاريخ *</Label>
              <Input
                id="aptDate"
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                data-testid="input-appointment-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aptTime">الوقت</Label>
              <Input
                id="aptTime"
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                data-testid="input-appointment-time"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={isPending} data-testid="button-book-submit">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              حجز
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
