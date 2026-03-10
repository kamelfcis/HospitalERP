import { useState, useEffect } from "react";
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
import { ChevronDown, ChevronUp, Stethoscope, Search } from "lucide-react";
import type { InsertPatient } from "@shared/schema";
import type { PatientFormDialogProps, DoctorOption, AdmissionValues, AdmissionSetters } from "./types";
import AdmissionSection from "./AdmissionSection";

const todayISO = new Date().toISOString().slice(0, 10);

interface ClinicOption { id: string; nameAr: string; }
interface ScheduleOption { doctorId: string; doctorName: string; }

export default function PatientFormDialog({ open, onClose, editingPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  /* ── بيانات المريض ─────────────────────────────────── */
  const [fullName,   setFullName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [nationalId, setNationalId] = useState("");
  const [age,        setAge]        = useState<string>("");

  /* ── قسم التسكين ──────────────────────────────────── */
  const [doctorSearch,      setDoctorSearch]      = useState("");
  const [selectedDoctor,    setSelectedDoctor]    = useState<DoctorOption | null>(null);
  const [showDoctorResults, setShowDoctorResults] = useState(false);
  const [selectedFloor,     setSelectedFloor]     = useState("");
  const [selectedRoom,      setSelectedRoom]      = useState("");
  const [selectedBed,       setSelectedBed]       = useState("");
  const [surgerySearch,     setSurgerySearch]     = useState("");
  const [selectedSurgery,   setSelectedSurgery]   = useState<{ id: string; nameAr: string } | null>(null);
  const [paymentType,       setPaymentType]       = useState("CASH");
  const [insuranceCo,       setInsuranceCo]       = useState("");

  /* ── قسم حجز الكشف ───────────────────────────────── */
  const [consultExpanded,  setConsultExpanded]  = useState(false);
  const [clinicSearch,     setClinicSearch]     = useState("");
  const [selectedClinic,   setSelectedClinic]   = useState<ClinicOption | null>(null);
  const [consultDoctorId,  setConsultDoctorId]  = useState("");
  const [consultDate,      setConsultDate]      = useState(todayISO);
  const [consultTime,      setConsultTime]      = useState("");

  const { data: clinics = [] } = useQuery<ClinicOption[]>({
    queryKey: ["/api/clinic-clinics"],
    enabled: open && consultExpanded,
  });

  const { data: schedules = [] } = useQuery<ScheduleOption[]>({
    queryKey: ["/api/clinic-clinics", selectedClinic?.id, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${selectedClinic!.id}/schedules`).then(r => r.json()),
    enabled: !!selectedClinic?.id,
  });

  const filteredClinics = clinics.filter(c =>
    !clinicSearch || c.nameAr.includes(clinicSearch)
  );

  const admissionValues: AdmissionValues = {
    doctorSearch, selectedDoctor, showDoctorResults,
    selectedFloor, selectedRoom, selectedBed,
    surgerySearch, selectedSurgery, paymentType, insuranceCo,
  };
  const admissionSetters: AdmissionSetters = {
    setDoctorSearch, setSelectedDoctor, setShowDoctorResults,
    setSelectedFloor, setSelectedRoom, setSelectedBed,
    setSurgerySearch, setSelectedSurgery, setPaymentType, setInsuranceCo,
  };

  useEffect(() => {
    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setAge("");
      setDoctorSearch(""); setSelectedDoctor(null); setShowDoctorResults(false);
      setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
      setSurgerySearch(""); setSelectedSurgery(null);
      setPaymentType("CASH"); setInsuranceCo("");
      setConsultExpanded(false); setClinicSearch("");
      setSelectedClinic(null); setConsultDoctorId("");
      setConsultDate(todayISO); setConsultTime("");
    }
  }, [editingPatient, open]);

  /* ── Mutations ────────────────────────────────────── */
  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPatient>) => apiRequest("POST", "/api/patients", data),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const appointmentMutation = useMutation({
    mutationFn: ({ clinicId, body }: { clinicId: string; body: Record<string, unknown> }) =>
      apiRequest("POST", `/api/clinic-clinics/${clinicId}/appointments`, body).then(r => r.json()),
    onError: (e: Error) => toast({ title: "خطأ في حجز الكشف", description: e.message, variant: "destructive" }),
  });

  const admitMutation = useMutation({
    mutationFn: ({ bedId, body }: { bedId: string; body: Record<string, unknown> }) =>
      apiRequest("POST", `/api/beds/${bedId}/admit`, body),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPatient> }) =>
      apiRequest("PATCH", `/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      toast({ title: "تم تحديث بيانات المريض — تم تحديث الفواتير المرتبطة تلقائياً" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending =
    createMutation.isPending || admitMutation.isPending ||
    updateMutation.isPending || appointmentMutation.isPending;

  function validate(): boolean {
    if (!fullName.trim()) {
      toast({ title: "خطأ", description: "اسم المريض مطلوب", variant: "destructive" });
      return false;
    }
    if (phone && !/^\d{11}$/.test(phone)) {
      toast({ title: "خطأ", description: "التليفون يجب أن يكون 11 رقم", variant: "destructive" });
      return false;
    }
    if (nationalId && !/^\d{14}$/.test(nationalId)) {
      toast({ title: "خطأ", description: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" });
      return false;
    }
    if (selectedRoom && !selectedBed) {
      toast({ title: "خطأ", description: "اختار غرفة — الرجاء اختيار سرير فارغ من القائمة", variant: "destructive" });
      return false;
    }
    if (consultExpanded && selectedClinic && !consultDoctorId) {
      toast({ title: "خطأ", description: "الرجاء اختيار الطبيب لحجز الكشف", variant: "destructive" });
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;

    const baseData: Partial<InsertPatient> = {
      fullName:   fullName.trim(),
      phone:      phone || null,
      nationalId: nationalId || null,
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    /* ── إضافة مريض جديد مع تسكين على سرير ── */
    if (selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          doctorName:       selectedDoctor?.name || undefined,
          surgeryTypeId:    selectedSurgery?.id || undefined,
          paymentType:      paymentType || undefined,
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
      });
      return;
    }

    /* ── إضافة مريض جديد (مع حجز كشف اختياري) ── */
    try {
      const created = await createMutation.mutateAsync(baseData);
      const patient = await (created as Response).json();

      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });

      if (consultExpanded && selectedClinic && consultDoctorId) {
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
            description: `العيادة: ${selectedClinic.nameAr} — رقم الدور: ${apt.turnNumber}`,
          });
        } catch {
          toast({ title: "تم إضافة المريض", description: "لكن فشل حجز الكشف — يمكنك الحجز لاحقاً من زر التذكرة" });
        }
      } else {
        toast({ title: "تم إضافة المريض بنجاح" });
      }

      onClose();
    } catch {
      /* error toast already shown in mutation.onError */
    }
  }

  const saveLabel = isPending
    ? "جاري الحفظ..."
    : isEdit
      ? "تحديث"
      : selectedBed
        ? "إضافة وتسكين"
        : (consultExpanded && selectedClinic && consultDoctorId)
          ? "إضافة وحجز الكشف"
          : "إضافة مريض";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0" dir="rtl">

        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-bold">
            {isEdit ? "تعديل بيانات مريض" : "إضافة مريض جديد"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="px-4 py-3 space-y-3">

            {/* ── بيانات المريض ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                بيانات المريض
              </p>

              <div className="space-y-1">
                <Label className="text-xs">اسم المريض *</Label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="h-7 text-xs"
                  data-testid="input-patient-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">التليفون (11 رقم)</Label>
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01xxxxxxxxx"
                    className="h-7 text-xs font-mono"
                    maxLength={11}
                    data-testid="input-patient-phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">السن</Label>
                  <Input
                    type="number" min={0} max={200}
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="—"
                    className="h-7 text-xs"
                    data-testid="input-patient-age"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">الرقم القومي (14 رقم)</Label>
                <Input
                  value={nationalId}
                  onChange={e => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="الرقم القومي"
                  className="h-7 text-xs font-mono"
                  maxLength={14}
                  data-testid="input-patient-nationalid"
                />
              </div>
            </div>

            {/* ── قسم حجز كشف عيادة (جديد - إضافة فقط) ── */}
            {!isEdit && (
              <div className="border rounded-md overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 bg-blue-50/50 hover:bg-blue-100/60 text-xs font-semibold text-blue-800"
                  onClick={() => setConsultExpanded(v => !v)}
                  data-testid="button-toggle-consultation"
                >
                  <span className="flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5" />
                    حجز كشف عيادة (اختياري)
                    {selectedClinic && consultDoctorId && (
                      <Badge className="text-xs bg-blue-600 text-white mr-1 px-1.5 py-0">
                        {selectedClinic.nameAr}
                      </Badge>
                    )}
                  </span>
                  {consultExpanded
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                </button>

                {consultExpanded && (
                  <div className="px-3 py-3 space-y-2">

                    {/* بحث العيادة */}
                    <div className="space-y-1">
                      <Label className="text-xs">العيادة</Label>
                      {selectedClinic ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs">
                          <Stethoscope className="h-3 w-3 text-blue-600 shrink-0" />
                          <span className="flex-1 font-medium">{selectedClinic.nameAr}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => { setSelectedClinic(null); setConsultDoctorId(""); setClinicSearch(""); }}
                          >تغيير</button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="relative">
                            <Search className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              value={clinicSearch}
                              onChange={e => setClinicSearch(e.target.value)}
                              placeholder="ابحث عن عيادة..."
                              className="h-7 text-xs pr-7"
                              data-testid="input-consult-clinic-search"
                            />
                          </div>
                          {filteredClinics.length > 0 && (
                            <div className="border rounded max-h-32 overflow-y-auto">
                              {filteredClinics.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => { setSelectedClinic(c); setClinicSearch(""); setConsultDoctorId(""); }}
                                  className="w-full text-right px-2 py-1.5 text-xs hover:bg-muted border-b last:border-0"
                                  data-testid={`consult-clinic-option-${c.id}`}
                                >
                                  {c.nameAr}
                                </button>
                              ))}
                            </div>
                          )}
                          {clinics.length === 0 && (
                            <p className="text-xs text-muted-foreground px-1">لا توجد عيادات مسجلة</p>
                          )}
                        </div>
                      )}
                    </div>

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
                              <SelectItem value="__none__" disabled>لا يوجد جدول أطباء لهذه العيادة</SelectItem>
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
                          <Input
                            type="date"
                            value={consultDate}
                            onChange={e => setConsultDate(e.target.value)}
                            className="h-7 text-xs"
                            data-testid="input-consult-date"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">الوقت (اختياري)</Label>
                          <Input
                            type="time"
                            value={consultTime}
                            onChange={e => setConsultTime(e.target.value)}
                            className="h-7 text-xs"
                            data-testid="input-consult-time"
                          />
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* ── قسم التسكين ── */}
            {!isEdit && (
              <AdmissionSection
                open={open}
                values={admissionValues}
                setters={admissionSetters}
              />
            )}

          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t gap-1">
          <Button
            variant="outline" size="sm"
            onClick={onClose}
            className="h-7 text-xs"
            data-testid="button-cancel"
          >
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-7 text-xs"
            data-testid="button-save-patient"
          >
            {saveLabel}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
