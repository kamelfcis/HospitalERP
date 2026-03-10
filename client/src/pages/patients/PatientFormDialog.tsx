import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Stethoscope, Bed, FlaskConical, Radiation,
  Search, Loader2, Banknote, ShieldCheck, FileSignature,
} from "lucide-react";
import type { InsertPatient } from "@shared/schema";
import type { PatientFormDialogProps } from "./types";

/* ── أنواع محلية ─────────────────────────────────── */
type VisitReason = "" | "consultation" | "admission" | "lab" | "radiology";
type PaymentKind = "CASH" | "INSURANCE" | "CONTRACT";

const todayISO = new Date().toISOString().slice(0, 10);

interface ClinicOption   { id: string; nameAr: string; }
interface ScheduleOption { doctorId: string; doctorName: string; }
interface DoctorOption   { id: string; name: string; specialty?: string | null; }
interface FloorOption    { id: string; nameAr: string; rooms: RoomOption[]; }
interface RoomOption     { id: string; nameAr: string; beds: BedOption[]; }
interface BedOption      { id: string; nameAr: string; status: string; }
interface SurgeryType    { id: string; nameAr: string; }

/* ── مكون اختيار نوع الزيارة ───────────────────── */
const VISIT_TYPES: { value: VisitReason; label: string; sub: string; Icon: any; color: string; bg: string; border: string }[] = [
  { value: "consultation", label: "كشف عيادة",    sub: "حجز في طابور العيادة",   Icon: Stethoscope, color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-300" },
  { value: "admission",    label: "تسكين / إقامة", sub: "تسكين على سرير بالمستشفى", Icon: Bed,         color: "text-green-700",  bg: "bg-green-50",  border: "border-green-300" },
  { value: "lab",          label: "تحاليل",        sub: "طلب تحاليل مختبر",        Icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300" },
  { value: "radiology",    label: "أشعة",          sub: "طلب أشعة تشخيصية",        Icon: Radiation,    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-300" },
];

const PAYMENT_TYPES: { value: PaymentKind; label: string; Icon: any }[] = [
  { value: "CASH",      label: "نقدي",   Icon: Banknote       },
  { value: "INSURANCE", label: "تأمين",  Icon: ShieldCheck    },
  { value: "CONTRACT",  label: "تعاقد",  Icon: FileSignature  },
];

/* ══════════════════════════════════════════════════ */
export default function PatientFormDialog({ open, onClose, editingPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  /* ── بيانات المريض ──── */
  const [fullName,   setFullName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [nationalId, setNationalId] = useState("");
  const [age,        setAge]        = useState("");

  /* ── نوع الدفع ─────── */
  const [paymentType, setPaymentType] = useState<PaymentKind>("CASH");
  const [insuranceCo, setInsuranceCo] = useState("");

  /* ── سبب الزيارة ───── */
  const [visitReason, setVisitReason] = useState<VisitReason>("");

  /* ── حجز كشف ───────── */
  const [clinicSearch,    setClinicSearch]    = useState("");
  const [selectedClinic,  setSelectedClinic]  = useState<ClinicOption | null>(null);
  const [consultDoctorId, setConsultDoctorId] = useState("");
  const [consultDate,     setConsultDate]     = useState(todayISO);
  const [consultTime,     setConsultTime]     = useState("");

  /* ── تسكين ──────────── */
  const [selectedFloor,   setSelectedFloor]   = useState("");
  const [selectedRoom,    setSelectedRoom]    = useState("");
  const [selectedBed,     setSelectedBed]     = useState("");
  const [admDoctorSearch, setAdmDoctorSearch] = useState("");
  const [admDoctor,       setAdmDoctor]       = useState<DoctorOption | null>(null);
  const [admShowDoc,      setAdmShowDoc]      = useState(false);
  const [surgerySearch,   setSurgerySearch]   = useState("");
  const [selectedSurgery, setSelectedSurgery] = useState<SurgeryType | null>(null);

  /* ── تحاليل / أشعة ─── */
  const [serviceNotes, setServiceNotes] = useState("");

  /* ── مسح عند الفتح ─── */
  useEffect(() => {
    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setAge("");
      setPaymentType("CASH"); setInsuranceCo("");
      setVisitReason("");
      setClinicSearch(""); setSelectedClinic(null); setConsultDoctorId("");
      setConsultDate(todayISO); setConsultTime("");
      setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
      setAdmDoctorSearch(""); setAdmDoctor(null);
      setSurgerySearch(""); setSelectedSurgery(null);
      setServiceNotes("");
    }
  }, [editingPatient, open]);

  /* ── Reset room/bed when floor changes ── */
  useEffect(() => { setSelectedRoom(""); setSelectedBed(""); }, [selectedFloor]);
  useEffect(() => { setSelectedBed(""); }, [selectedRoom]);

  /* ── API Queries ────────────────────────────────── */
  const { data: clinics = [] } = useQuery<ClinicOption[]>({
    queryKey: ["/api/clinic-clinics"],
    enabled: open && visitReason === "consultation",
  });

  const { data: schedules = [] } = useQuery<ScheduleOption[]>({
    queryKey: ["/api/clinic-clinics", selectedClinic?.id, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${selectedClinic!.id}/schedules`).then(r => r.json()),
    enabled: !!selectedClinic?.id,
  });

  const { data: bedBoard = [] } = useQuery<FloorOption[]>({
    queryKey: ["/api/bed-board"],
    enabled: open && visitReason === "admission",
  });

  const { data: admDoctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", admDoctorSearch],
    queryFn: () =>
      fetch(`/api/doctors?search=${encodeURIComponent(admDoctorSearch)}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: open && visitReason === "admission" && admDoctorSearch.length >= 1,
  });

  const { data: surgeryTypes = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn: async () => {
      const q = surgerySearch.trim() ? `?search=${encodeURIComponent(surgerySearch.trim())}` : "";
      const r = await fetch(`/api/surgery-types${q}`, { credentials: "include" });
      const d = await r.json();
      return Array.isArray(d) ? d : d.data ?? [];
    },
    enabled: open && visitReason === "admission",
  });

  const floors = useMemo(() => bedBoard, [bedBoard]);

  const rooms = useMemo<RoomOption[]>(() => {
    const floor = floors.find(f => f.id === selectedFloor);
    return (floor?.rooms ?? []).filter(r => r.beds?.some(b => b.status === "EMPTY"));
  }, [floors, selectedFloor]);

  const beds = useMemo<BedOption[]>(() => {
    for (const f of bedBoard) {
      for (const r of f.rooms ?? []) {
        if (r.id === selectedRoom) return r.beds?.filter(b => b.status === "EMPTY") ?? [];
      }
    }
    return [];
  }, [bedBoard, selectedRoom]);

  /* auto-select single bed */
  useEffect(() => {
    if (beds.length === 1 && !selectedBed) setSelectedBed(beds[0].id);
  }, [beds]); // eslint-disable-line

  const filteredClinics = clinics.filter(c =>
    !clinicSearch || c.nameAr.includes(clinicSearch)
  );

  /* ── Mutations ────────────────────────────────── */
  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPatient>) => apiRequest("POST", "/api/patients", data),
    onError: (e: Error) => toast({ title: "خطأ في الإضافة", description: e.message, variant: "destructive" }),
  });

  const appointmentMutation = useMutation({
    mutationFn: ({ clinicId, body }: { clinicId: string; body: Record<string, unknown> }) =>
      apiRequest("POST", `/api/clinic-clinics/${clinicId}/appointments`, body).then(r => r.json()),
  });

  const admitMutation = useMutation({
    mutationFn: ({ bedId, body }: { bedId: string; body: Record<string, unknown> }) =>
      apiRequest("POST", `/api/beds/${bedId}/admit`, body),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPatient> }) =>
      apiRequest("PATCH", `/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      toast({ title: "تم تحديث بيانات المريض" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending =
    createMutation.isPending || appointmentMutation.isPending ||
    admitMutation.isPending   || updateMutation.isPending;

  /* ── Validation ──────────────────────────────── */
  function validate(): boolean {
    if (!fullName.trim()) {
      toast({ title: "اسم المريض مطلوب", variant: "destructive" }); return false;
    }
    if (phone && !/^\d{11}$/.test(phone)) {
      toast({ title: "التليفون يجب أن يكون 11 رقم", variant: "destructive" }); return false;
    }
    if (nationalId && !/^\d{14}$/.test(nationalId)) {
      toast({ title: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" }); return false;
    }
    if (paymentType === "INSURANCE" && !insuranceCo.trim()) {
      toast({ title: "الرجاء كتابة اسم شركة التأمين", variant: "destructive" }); return false;
    }
    if (visitReason === "consultation" && selectedClinic && !consultDoctorId) {
      toast({ title: "الرجاء اختيار الطبيب للكشف", variant: "destructive" }); return false;
    }
    if (visitReason === "admission" && selectedRoom && !selectedBed) {
      toast({ title: "الرجاء اختيار سرير فارغ", variant: "destructive" }); return false;
    }
    return true;
  }

  /* ── Submit ──────────────────────────────────── */
  async function handleSubmit() {
    if (!validate()) return;

    const baseData: Partial<InsertPatient> = {
      fullName:   fullName.trim(),
      phone:      phone || null,
      nationalId: nationalId || null,
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    /* تعديل مريض موجود */
    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    /* تسكين على سرير */
    if (visitReason === "admission" && selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          doctorName:       admDoctor?.name || undefined,
          surgeryTypeId:    selectedSurgery?.id || undefined,
          paymentType:      paymentType,
          insuranceCompany: paymentType === "INSURANCE" ? insuranceCo : undefined,
        },
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
          queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
          toast({ title: "تم تسكين المريض بنجاح" });
          onClose();
        },
        onError: (e: Error) => toast({ title: "خطأ في التسكين", description: e.message, variant: "destructive" }),
      });
      return;
    }

    /* إضافة مريض + حجز كشف اختياري */
    try {
      const res     = await createMutation.mutateAsync(baseData);
      const patient = await (res as Response).json();

      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });

      if (visitReason === "consultation" && selectedClinic && consultDoctorId) {
        try {
          const apt = await appointmentMutation.mutateAsync({
            clinicId: selectedClinic.id,
            body: {
              doctorId:        consultDoctorId,
              patientId:       patient.id,
              patientName:     fullName.trim(),
              patientPhone:    phone || undefined,
              appointmentDate: consultDate,
              appointmentTime: consultTime || undefined,
            },
          });
          queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"] });
          toast({
            title: "تم إضافة المريض وحجز الكشف",
            description: `${selectedClinic.nameAr} — رقم الدور: ${apt.turnNumber}`,
          });
        } catch {
          toast({ title: "تم إضافة المريض", description: "لكن فشل حجز الكشف — يمكنك الحجز لاحقاً" });
        }
      } else if (visitReason === "lab") {
        toast({ title: "تم إضافة المريض — سبب الزيارة: تحاليل", description: serviceNotes || undefined });
      } else if (visitReason === "radiology") {
        toast({ title: "تم إضافة المريض — سبب الزيارة: أشعة", description: serviceNotes || undefined });
      } else {
        toast({ title: "تم إضافة المريض بنجاح" });
      }
      onClose();
    } catch { /* handled in mutation.onError */ }
  }

  /* ── زر الحفظ ────────────────────────────────── */
  const saveLabel = isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : (() => {
    if (visitReason === "admission" && selectedBed)              return "إضافة وتسكين";
    if (visitReason === "consultation" && selectedClinic && consultDoctorId) return "إضافة وحجز الكشف";
    if (visitReason === "lab")                                    return "إضافة مريض (تحاليل)";
    if (visitReason === "radiology")                              return "إضافة مريض (أشعة)";
    return "إضافة مريض";
  })();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0" dir="rtl">

        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-bold">
            {isEdit ? "تعديل بيانات مريض" : "استقبال مريض جديد"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="px-4 py-3 space-y-4">

            {/* ══ بيانات المريض ══════════════════════ */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                بيانات المريض
              </p>
              <div className="space-y-1">
                <Label className="text-xs">الاسم الكامل *</Label>
                <Input
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="اسم المريض كاملاً"
                  className="h-7 text-xs" autoFocus
                  data-testid="input-patient-name"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <Label className="text-xs">التليفون</Label>
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01xxxxxxxxx" maxLength={11}
                    className="h-7 text-xs font-mono"
                    data-testid="input-patient-phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">السن</Label>
                  <Input
                    type="number" min={0} max={120} value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="—" className="h-7 text-xs"
                    data-testid="input-patient-age"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الرقم القومي</Label>
                  <Input
                    value={nationalId}
                    onChange={e => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="14 رقم" maxLength={14}
                    className="h-7 text-xs font-mono"
                    data-testid="input-patient-nationalid"
                  />
                </div>
              </div>
            </section>

            {/* ══ نوع الدفع ══════════════════════════ */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                نوع الدفع
              </p>
              <div className="flex gap-2">
                {PAYMENT_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value} type="button"
                    onClick={() => setPaymentType(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-all
                      ${paymentType === value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-input hover:bg-muted"
                      }`}
                    data-testid={`button-payment-${value.toLowerCase()}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              {paymentType === "INSURANCE" && (
                <div className="space-y-1">
                  <Label className="text-xs">شركة التأمين *</Label>
                  <Input
                    value={insuranceCo} onChange={e => setInsuranceCo(e.target.value)}
                    placeholder="اسم شركة التأمين"
                    className="h-7 text-xs"
                    data-testid="input-insurance-company"
                  />
                </div>
              )}
              {paymentType === "CONTRACT" && (
                <p className="text-xs text-muted-foreground px-1">● مريض متعاقد — سيتم تطبيق شروط التعاقد عند إنشاء الفاتورة</p>
              )}
            </section>

            {/* ══ سبب الزيارة (إضافة جديد فقط) ════ */}
            {!isEdit && (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                  سبب الزيارة
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {VISIT_TYPES.map(({ value, label, sub, Icon, color, bg, border }) => (
                    <button
                      key={value} type="button"
                      onClick={() => setVisitReason(v => v === value ? "" : value)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-right transition-all
                        ${visitReason === value
                          ? `${bg} ${border} shadow-sm`
                          : "bg-background border-border hover:bg-muted/50"
                        }`}
                      data-testid={`visit-reason-${value}`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${visitReason === value ? color : "text-muted-foreground"}`} />
                      <div className="text-right min-w-0">
                        <div className={`text-xs font-semibold leading-tight ${visitReason === value ? color : "text-foreground"}`}>
                          {label}
                        </div>
                        <div className="text-xs text-muted-foreground leading-tight truncate">{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* ── تفاصيل كشف عيادة ── */}
                {visitReason === "consultation" && (
                  <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-2">
                    <p className="text-xs font-medium text-blue-800 flex items-center gap-1">
                      <Stethoscope className="h-3.5 w-3.5" /> تفاصيل حجز الكشف
                    </p>

                    {/* بحث العيادة */}
                    {!selectedClinic ? (
                      <div className="space-y-1">
                        <Label className="text-xs">العيادة</Label>
                        <div className="relative">
                          <Search className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={clinicSearch} onChange={e => setClinicSearch(e.target.value)}
                            placeholder="ابحث عن عيادة..." className="h-7 text-xs pr-7"
                            data-testid="input-clinic-search"
                          />
                        </div>
                        {filteredClinics.length > 0 && (
                          <div className="border rounded max-h-32 overflow-y-auto bg-white">
                            {filteredClinics.map(c => (
                              <button
                                key={c.id} type="button"
                                onClick={() => { setSelectedClinic(c); setClinicSearch(""); setConsultDoctorId(""); }}
                                className="w-full text-right px-2 py-1.5 text-xs hover:bg-blue-50 border-b last:border-0"
                                data-testid={`clinic-option-${c.id}`}
                              >{c.nameAr}</button>
                            ))}
                          </div>
                        )}
                        {clinics.length === 0 && (
                          <p className="text-xs text-muted-foreground">لا توجد عيادات مسجلة</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-blue-200 rounded text-xs">
                        <Stethoscope className="h-3 w-3 text-blue-600" />
                        <span className="flex-1 font-medium">{selectedClinic.nameAr}</span>
                        <button type="button" onClick={() => { setSelectedClinic(null); setConsultDoctorId(""); }}
                          className="text-muted-foreground hover:text-foreground text-xs">تغيير</button>
                      </div>
                    )}

                    {/* الطبيب */}
                    {selectedClinic && (
                      <div className="space-y-1">
                        <Label className="text-xs">الطبيب *</Label>
                        <Select value={consultDoctorId} onValueChange={setConsultDoctorId}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-consult-doctor">
                            <SelectValue placeholder="اختر الطبيب..." />
                          </SelectTrigger>
                          <SelectContent>
                            {schedules.length === 0 && (
                              <SelectItem value="__none__" disabled>لا يوجد جدول أطباء</SelectItem>
                            )}
                            {schedules.map(s => (
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
                          <Label className="text-xs">تاريخ الكشف</Label>
                          <Input type="date" value={consultDate} onChange={e => setConsultDate(e.target.value)}
                            className="h-7 text-xs" data-testid="input-consult-date" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">الوقت</Label>
                          <Input type="time" value={consultTime} onChange={e => setConsultTime(e.target.value)}
                            className="h-7 text-xs" data-testid="input-consult-time" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── تفاصيل التسكين ── */}
                {visitReason === "admission" && (
                  <div className="border border-green-200 rounded-lg p-3 bg-green-50/30 space-y-2">
                    <p className="text-xs font-medium text-green-800 flex items-center gap-1">
                      <Bed className="h-3.5 w-3.5" /> تفاصيل التسكين
                    </p>

                    {/* الدور / الغرفة / السرير */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">الدور</Label>
                        <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-floor">
                            <SelectValue placeholder="اختر" />
                          </SelectTrigger>
                          <SelectContent>
                            {floors.map(f => (
                              <SelectItem key={f.id} value={f.id}>{f.nameAr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الغرفة</Label>
                        <Select value={selectedRoom} onValueChange={setSelectedRoom} disabled={!selectedFloor}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-room">
                            <SelectValue placeholder="اختر" />
                          </SelectTrigger>
                          <SelectContent>
                            {rooms.map(r => (
                              <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className={`text-xs ${selectedRoom && !selectedBed ? "text-red-600 font-medium" : ""}`}>
                          السرير {selectedRoom && !selectedBed && <span className="text-red-500">*</span>}
                        </Label>
                        <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedRoom}>
                          <SelectTrigger
                            className={`h-7 text-xs ${selectedRoom && !selectedBed ? "border-red-400 ring-1 ring-red-400" : ""}`}
                            data-testid="select-bed"
                          >
                            <SelectValue placeholder={selectedRoom && !selectedBed ? "مطلوب ⚠" : "اختر"} />
                          </SelectTrigger>
                          <SelectContent>
                            {beds.length === 0 && (
                              <SelectItem value="__none__" disabled>لا توجد أسرة فارغة</SelectItem>
                            )}
                            {beds.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.nameAr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* الطبيب */}
                    <div className="space-y-1">
                      <Label className="text-xs">الطبيب المعالج</Label>
                      {admDoctor ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-green-200 rounded text-xs">
                          <span className="flex-1 font-medium">د. {admDoctor.name}</span>
                          {admDoctor.specialty && <span className="text-muted-foreground">{admDoctor.specialty}</span>}
                          <button type="button" onClick={() => { setAdmDoctor(null); setAdmDoctorSearch(""); }}
                            className="text-muted-foreground hover:text-foreground">تغيير</button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            value={admDoctorSearch}
                            onChange={e => { setAdmDoctorSearch(e.target.value); setAdmShowDoc(true); }}
                            onFocus={() => setAdmShowDoc(true)}
                            onBlur={() => setTimeout(() => setAdmShowDoc(false), 200)}
                            placeholder="ابحث باسم الطبيب..."
                            className="h-7 text-xs"
                            data-testid="input-adm-doctor-search"
                          />
                          {admShowDoc && admDoctorSearch.length >= 1 && (
                            <div className="absolute z-50 w-full mt-0.5 border rounded bg-white shadow-md text-xs overflow-hidden">
                              {admDoctors.length === 0
                                ? <div className="px-2 py-1.5 text-muted-foreground">لا يوجد</div>
                                : admDoctors.map(d => (
                                  <button key={d.id} type="button"
                                    className="w-full text-right px-2 py-1.5 hover:bg-muted border-b last:border-b-0"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => { setAdmDoctor(d); setAdmDoctorSearch(""); setAdmShowDoc(false); }}
                                    data-testid={`adm-doctor-${d.id}`}
                                  >
                                    <span className="font-medium">د. {d.name}</span>
                                    {d.specialty && <span className="text-muted-foreground mr-2">{d.specialty}</span>}
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* نوع العملية */}
                    <div className="space-y-1">
                      <Label className="text-xs">نوع العملية (اختياري)</Label>
                      <Input
                        value={surgerySearch}
                        onChange={e => { setSurgerySearch(e.target.value); setSelectedSurgery(null); }}
                        placeholder="ابحث عن عملية..." className="h-7 text-xs"
                        data-testid="input-surgery-search"
                      />
                      {surgerySearch && !selectedSurgery && surgeryTypes.length > 0 && (
                        <div className="border rounded bg-white shadow-sm max-h-28 overflow-y-auto">
                          {surgeryTypes.map(s => (
                            <button key={s.id} type="button"
                              className="w-full text-right px-2 py-1 text-xs hover:bg-muted"
                              onClick={() => { setSelectedSurgery(s); setSurgerySearch(s.nameAr); }}
                            >{s.nameAr}</button>
                          ))}
                        </div>
                      )}
                      {selectedSurgery && (
                        <Badge variant="secondary" className="text-xs">{selectedSurgery.nameAr}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* ── تفاصيل تحاليل / أشعة ── */}
                {(visitReason === "lab" || visitReason === "radiology") && (
                  <div className={`border rounded-lg p-3 space-y-2 ${
                    visitReason === "lab"
                      ? "border-purple-200 bg-purple-50/30"
                      : "border-amber-200 bg-amber-50/30"
                  }`}>
                    <p className={`text-xs font-medium flex items-center gap-1 ${visitReason === "lab" ? "text-purple-800" : "text-amber-800"}`}>
                      {visitReason === "lab"
                        ? <><FlaskConical className="h-3.5 w-3.5" /> تفاصيل طلب التحاليل</>
                        : <><Radiation className="h-3.5 w-3.5" /> تفاصيل طلب الأشعة</>
                      }
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {visitReason === "lab" ? "التحاليل المطلوبة" : "الأشعة المطلوبة"}
                      </Label>
                      <textarea
                        value={serviceNotes}
                        onChange={e => setServiceNotes(e.target.value)}
                        placeholder={
                          visitReason === "lab"
                            ? "مثال: صورة دم كاملة، وظائف كبد، سكر صائم..."
                            : "مثال: أشعة صدر، سونار بطن، رنين مغناطيسي..."
                        }
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="textarea-service-notes"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground bg-white/70 border rounded px-2 py-1.5">
                      بعد إضافة المريض، انتقل إلى{" "}
                      <strong>{visitReason === "lab" ? "أوامر الخدمات" : "أوامر الأشعة"}</strong>{" "}
                      لإنشاء الطلب الرسمي.
                    </p>
                  </div>
                )}

              </section>
            )}

          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t gap-1">
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs" data-testid="button-cancel">
            إلغاء
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending} className="h-7 text-xs" data-testid="button-save-patient">
            {isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            {saveLabel}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
