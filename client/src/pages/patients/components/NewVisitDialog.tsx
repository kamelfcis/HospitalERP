import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Stethoscope, Bed, FlaskConical, Radiation, Scissors,
  Building2, ArrowRight, Loader2, CheckCircle2, Search,
} from "lucide-react";

interface PatientInfo {
  id: string;
  fullName: string;
  phone?: string | null;
  patientCode?: string | null;
}

interface Clinic {
  id: string;
  nameAr: string;
  treasuryName?: string | null;
}

interface Schedule {
  doctorId: string;
  doctorName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient: PatientInfo;
}

type VisitType = "consultation" | "admission" | "lab" | "radiology" | "surgery" | "service";

const VISIT_TYPES: { type: VisitType; label: string; icon: any; color: string; bg: string }[] = [
  { type: "consultation", label: "كشف عيادة",    icon: Stethoscope,  color: "text-blue-600",   bg: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  { type: "admission",    label: "إقامة",         icon: Bed,          color: "text-green-600",  bg: "bg-green-50 border-green-200 hover:bg-green-100" },
  { type: "lab",          label: "تحاليل",        icon: FlaskConical, color: "text-purple-600", bg: "bg-purple-50 border-purple-200 hover:bg-purple-100" },
  { type: "radiology",    label: "أشعة",          icon: Radiation,    color: "text-amber-600",  bg: "bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { type: "surgery",      label: "عملية",         icon: Scissors,     color: "text-red-600",    bg: "bg-red-50 border-red-200 hover:bg-red-100" },
  { type: "service",      label: "خدمة قسم",      icon: Building2,    color: "text-slate-600",  bg: "bg-slate-50 border-slate-200 hover:bg-slate-100" },
];

export function NewVisitDialog({ open, onClose, patient }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"type" | "consultation" | "done">("type");
  const [visitType, setVisitType] = useState<VisitType | null>(null);
  const [clinicSearch, setClinicSearch] = useState("");
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [appointmentTime, setAppointmentTime] = useState("");
  const [turnNumber, setTurnNumber] = useState<number | null>(null);

  const { data: clinics = [] } = useQuery<Clinic[]>({
    queryKey: ["/api/clinic-clinics"],
    enabled: open && step === "consultation",
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["/api/clinic-clinics", selectedClinic?.id, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${selectedClinic!.id}/schedules`).then((r) => r.json()),
    enabled: !!selectedClinic?.id,
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClinic || !doctorId) throw new Error("بيانات ناقصة");
      const res = await apiRequest("POST", `/api/clinic-clinics/${selectedClinic.id}/appointments`, {
        doctorId,
        patientId: patient.id,
        patientName: patient.fullName,
        patientPhone: patient.phone ?? undefined,
        appointmentDate,
        appointmentTime: appointmentTime || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTurnNumber(data.turnNumber);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"] });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "خطأ في الحجز", description: e.message });
    },
  });

  const filteredClinics = clinics.filter((c) =>
    c.nameAr.includes(clinicSearch) || clinicSearch === ""
  );

  function handleSelectType(type: VisitType) {
    setVisitType(type);
    if (type === "consultation") {
      setStep("consultation");
    } else {
      toast({ title: "سيتم إضافة هذه الخدمة قريباً", description: `نوع الزيارة: ${VISIT_TYPES.find(v => v.type === type)?.label}` });
    }
  }

  function handleClose() {
    setStep("type");
    setVisitType(null);
    setSelectedClinic(null);
    setDoctorId("");
    setClinicSearch("");
    setTurnNumber(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {step !== "type" && (
              <button
                type="button"
                onClick={() => { setStep("type"); setSelectedClinic(null); setDoctorId(""); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            تذكرة جديدة
            {patient.patientCode && (
              <Badge variant="outline" className="font-mono text-xs text-blue-700 border-blue-300">
                {patient.patientCode}
              </Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{patient.fullName}</p>
        </DialogHeader>

        {/* الخطوة 1: اختيار نوع الزيارة */}
        {step === "type" && (
          <div className="grid grid-cols-3 gap-2 py-2">
            {VISIT_TYPES.map(({ type, label, icon: Icon, color, bg }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectType(type)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer ${bg}`}
                data-testid={`visit-type-${type}`}
              >
                <Icon className={`h-6 w-6 ${color}`} />
                <span className={`text-xs font-medium ${color}`}>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* الخطوة 2: بيانات الكشف */}
        {step === "consultation" && (
          <div className="space-y-3 py-1">
            {/* بحث العيادة */}
            <div className="space-y-1">
              <Label className="text-xs">العيادة *</Label>
              {!selectedClinic ? (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={clinicSearch}
                      onChange={(e) => setClinicSearch(e.target.value)}
                      placeholder="ابحث عن عيادة..."
                      className="h-8 text-xs pr-7"
                      autoFocus
                      data-testid="input-clinic-search"
                    />
                  </div>
                  <div className="border rounded-md max-h-36 overflow-y-auto">
                    {filteredClinics.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">لا توجد عيادات</p>
                    ) : (
                      filteredClinics.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClinic(c); setClinicSearch(""); }}
                          className="w-full text-right px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between border-b last:border-0"
                          data-testid={`clinic-option-${c.id}`}
                        >
                          <span className="font-medium">{c.nameAr}</span>
                          {c.treasuryName && (
                            <span className="text-muted-foreground text-xs truncate max-w-[120px]">{c.treasuryName}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <Stethoscope className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="text-sm font-medium text-blue-800 flex-1">{selectedClinic.nameAr}</span>
                  {selectedClinic.treasuryName && (
                    <span className="text-xs text-blue-600">{selectedClinic.treasuryName}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedClinic(null); setDoctorId(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    تغيير
                  </button>
                </div>
              )}
            </div>

            {/* اختيار الطبيب */}
            {selectedClinic && (
              <div className="space-y-1">
                <Label className="text-xs">الطبيب *</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-visit-doctor">
                    <SelectValue placeholder="اختر الطبيب..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schedules.map((s) => (
                      <SelectItem key={s.doctorId} value={s.doctorId}>{s.doctorName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* التاريخ والوقت */}
            {selectedClinic && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">التاريخ *</Label>
                  <Input
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-visit-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الوقت</Label>
                  <Input
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="h-8 text-xs"
                    data-testid="input-visit-time"
                  />
                </div>
              </div>
            )}

            {selectedClinic && doctorId && (
              <Button
                className="w-full h-8 text-xs"
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
                data-testid="button-confirm-visit"
              >
                {bookMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin ml-2" />
                ) : null}
                تأكيد الحجز
              </Button>
            )}
          </div>
        )}

        {/* الخطوة 3: نجاح */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="font-bold text-base">تم الحجز بنجاح</p>
              {turnNumber && (
                <p className="text-muted-foreground text-sm mt-1">
                  رقم الدور: <span className="font-bold text-blue-700 text-lg">{turnNumber}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {selectedClinic?.nameAr} — {patient.fullName}
              </p>
            </div>
            <Button size="sm" onClick={handleClose} data-testid="button-close-visit-done">
              إغلاق
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
