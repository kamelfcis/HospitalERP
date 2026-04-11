import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, UserPlus, ClipboardList, RefreshCw, Printer,
} from "lucide-react";
import type { LookupItem } from "@/lib/lookupTypes";
import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
import { useContractResolution } from "@/pages/patients/hooks/useContractResolution";
import { isFullName } from "@/components/shared/NationalIdField";

import type {
  VisitReason, PaymentKind, PatientSuggest,
  DuplicateCheckResult, ScheduleOption, FloorOption, RoomOption, BedOption, SurgeryType, VisitRecord,
} from "./components/types";
import { todayISO } from "./components/types";
import { PatientInfoSection } from "./components/PatientInfoSection";
import { DuplicateCheckSection } from "./components/DuplicateCheckSection";
import { PaymentTypeSection } from "./components/PaymentTypeSection";
import { VisitDetailsSection } from "./components/VisitDetailsSection";
import { VisitsListPanel, StatCard } from "./components/VisitsListPanel";

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ReceptionPage() {
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [age, setAge] = useState("");
  const [existingPatient, setExistingPatient] = useState<PatientSuggest | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const [overrideReason, setOverrideReason] = useState("");
  const [dupDismissed, setDupDismissed] = useState(false);

  const [paymentType, setPaymentType] = useState<PaymentKind>("CASH");
  const [insuranceCo, setInsuranceCo] = useState("");
  const resolution = useContractResolution();

  const [visitReason, setVisitReason] = useState<VisitReason>("");
  const [selectedClinic, setSelectedClinic] = useState<LookupItem | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<LookupItem | null>(null);
  const [consultDate, setConsultDate] = useState(todayISO);
  const [consultTime, setConsultTime] = useState("");

  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedBed, setSelectedBed] = useState("");
  const [admDoctor, setAdmDoctor] = useState<LookupItem | null>(null);
  const [surgerySearch, setSurgerySearch] = useState("");
  const [selectedSurgery, setSelectedSurgery] = useState<SurgeryType | null>(null);
  const [isPackage, setIsPackage] = useState(false);
  const [showSurgeryDrop, setShowSurgeryDrop] = useState(false);
  const [highlightedSurgery, setHighlightedSurgery] = useState(0);

  const [serviceNotes, setServiceNotes] = useState("");
  const [printTicket, setPrintTicket] = useState(true);

  const [listDate, setListDate] = useState(todayISO);
  const [listTypeFilter, setListTypeFilter] = useState("__all__");
  const [listStatusFilter, setListStatusFilter] = useState("__all__");
  const [listSearch, setListSearch] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const suggestItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const surgeryItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const debouncedName = useDebounce(fullName, 300);
  const debouncedPhone = useDebounce(phone, 500);
  const debouncedNid = useDebounce(nationalId, 500);

  useEffect(() => { setSelectedRoom(""); setSelectedBed(""); }, [selectedFloor]);
  useEffect(() => { setSelectedBed(""); }, [selectedRoom]);
  useEffect(() => { setOverrideReason(""); setDupDismissed(false); }, [debouncedName, debouncedPhone, debouncedNid]);
  useEffect(() => { setHighlightedIdx(0); suggestItemsRef.current = []; }, [debouncedName]);
  useEffect(() => { suggestItemsRef.current[highlightedIdx]?.scrollIntoView({ block: "nearest" }); }, [highlightedIdx]);
  useEffect(() => { surgeryItemsRef.current[highlightedSurgery]?.scrollIntoView({ block: "nearest" }); }, [highlightedSurgery]);

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); resetForm(); nameInputRef.current?.focus(); }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const { data: patientSuggestions = [] } = useQuery<PatientSuggest[]>({
    queryKey: ["/api/patients", "search", debouncedName],
    queryFn: () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedName.trim())}&limit=10`)
        .then(r => r.json()),
    enabled: !existingPatient && debouncedName.trim().length >= 2,
    staleTime: 30_000,
  });

  const shouldCheckDup = !existingPatient && !dupDismissed && (
    debouncedName.trim().length >= 2 ||
    debouncedPhone.trim().length >= 5 ||
    debouncedNid.trim().length >= 5
  );

  const { data: dupResult, isFetching: dupChecking } = useQuery<DuplicateCheckResult>({
    queryKey: ["/api/patients/check-duplicates", debouncedName.trim(), debouncedPhone.trim(), debouncedNid.trim()],
    queryFn: () =>
      apiRequest("POST", "/api/patients/check-duplicates", {
        fullName: debouncedName.trim() || null,
        phone: debouncedPhone.trim() || null,
        nationalId: debouncedNid.trim() || null,
        age: age ? parseInt(age, 10) : null,
      }).then(r => r.json()),
    enabled: shouldCheckDup,
    staleTime: 0,
    gcTime: 30_000,
  });

  const { data: schedules = [] } = useQuery<ScheduleOption[]>({
    queryKey: ["/api/clinic-clinics", selectedClinic?.id, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${selectedClinic!.id}/schedules`).then(r => r.json()),
    enabled: !!selectedClinic?.id,
  });

  const { data: bedBoard = [] } = useQuery<FloorOption[]>({
    queryKey: ["/api/bed-board"],
    enabled: visitReason === "admission",
  });

  const { data: surgeryTypesRaw = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn: async () => {
      const q = surgerySearch.trim() ? `?search=${encodeURIComponent(surgerySearch.trim())}` : "";
      const r = await apiRequest("GET", `/api/surgery-types${q}`);
      const d = await r.json();
      return Array.isArray(d) ? d : d.data ?? [];
    },
    enabled: visitReason === "admission" && surgerySearch.length >= 1,
  });

  const visitsQueryKey = useMemo(() => {
    const params = new URLSearchParams({ date: listDate });
    if (listTypeFilter !== "__all__") params.set("visitType", listTypeFilter);
    if (listStatusFilter !== "__all__") params.set("status", listStatusFilter);
    if (listSearch.trim()) params.set("search", listSearch.trim());
    return ["/api/patient-visits", params.toString()];
  }, [listDate, listTypeFilter, listStatusFilter, listSearch]);

  const { data: visits = [], isLoading: visitsLoading } = useQuery<VisitRecord[]>({
    queryKey: visitsQueryKey,
    queryFn: async () => {
      const [, params] = visitsQueryKey as [string, string];
      const r = await apiRequest("GET", `/api/patient-visits?${params}`);
      return r.json();
    },
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

  useEffect(() => {
    if (beds.length === 1 && !selectedBed) setSelectedBed(beds[0].id);
  }, [beds]); // eslint-disable-line

  const showSuggestList = useMemo(
    () => showSuggestions && patientSuggestions.length > 0 && !existingPatient,
    [showSuggestions, patientSuggestions.length, existingPatient],
  );

  const handleSelectExistingPatient = useCallback((p: PatientSuggest) => {
    setExistingPatient(p);
    setFullName(p.fullName);
    setPhone(p.phone || "");
    setNationalId(p.nationalId || "");
    setDateOfBirth(p.dateOfBirth || "");
    setAge(p.age != null ? String(p.age) : "");
    setShowSuggestions(false);
    setTimeout(() => phoneInputRef.current?.focus(), 50);
  }, []);

  const handleClearExistingPatient = useCallback(() => {
    setExistingPatient(null);
    setFullName(""); setPhone(""); setNationalId(""); setDateOfBirth(""); setAge("");
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  const handlePaymentTypeChange = useCallback((v: PaymentKind) => {
    setPaymentType(v);
    if (v !== "INSURANCE") setInsuranceCo("");
    resolution.clear();
  }, [resolution]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); setShowSuggestions(false); return; }
    if (!showSuggestList) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIdx(prev => Math.min(prev + 1, patientSuggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIdx(prev => Math.max(prev - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (highlightedIdx >= 0 && highlightedIdx < patientSuggestions.length) handleSelectExistingPatient(patientSuggestions[highlightedIdx]); }
  }, [showSuggestList, patientSuggestions, highlightedIdx, handleSelectExistingPatient]);

  const handleSurgeryKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); setShowSurgeryDrop(false); setSurgerySearch(""); setSelectedSurgery(null); return; }
    if (!showSurgeryDrop || surgeryTypesRaw.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedSurgery(prev => Math.min(prev + 1, surgeryTypesRaw.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedSurgery(prev => Math.max(prev - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const s = surgeryTypesRaw[highlightedSurgery]; if (s) { setSelectedSurgery(s); setSurgerySearch(s.nameAr); setShowSurgeryDrop(false); } }
  }, [showSurgeryDrop, surgeryTypesRaw, highlightedSurgery]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/patients", data),
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

  const saveVisitMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await apiRequest("POST", "/api/patient-visits", body);
      return r.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await apiRequest("PATCH", `/api/patient-visits/${id}/status`, { status });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient-visits"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const isPending =
    createMutation.isPending || appointmentMutation.isPending ||
    admitMutation.isPending || saveVisitMutation.isPending;

  function resetForm() {
    setFullName(""); setPhone(""); setNationalId(""); setDateOfBirth(""); setAge("");
    setExistingPatient(null); setShowSuggestions(false);
    setPaymentType("CASH"); setInsuranceCo(""); resolution.clear();
    setVisitReason("");
    setSelectedClinic(null); setSelectedDoctor(null);
    setConsultDate(todayISO); setConsultTime("");
    setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
    setAdmDoctor(null);
    setSurgerySearch(""); setSelectedSurgery(null); setShowSurgeryDrop(false);
    setServiceNotes("");
    setOverrideReason(""); setDupDismissed(false);
    setPrintTicket(true);
  }

  const requiresFullId = paymentType === "CONTRACT" || paymentType === "INSURANCE";
  const isAdmission = visitReason === "admission";
  const nidRequired = requiresFullId || isAdmission;
  const quadNameRequired = requiresFullId || isAdmission;

  function validate(): boolean {
    if (!fullName.trim()) { toast({ title: "اسم المريض مطلوب", variant: "destructive" }); return false; }
    if (quadNameRequired && !isFullName(fullName)) {
      toast({ title: "الاسم الرباعي مطلوب", description: "يرجى كتابة الاسم من 4 كلمات على الأقل (الاسم / الأب / الجد / العائلة)", variant: "destructive" }); return false;
    }
    if (phone && !/^\d{11}$/.test(phone)) { toast({ title: "التليفون يجب أن يكون 11 رقم", variant: "destructive" }); return false; }
    if (nidRequired && (!nationalId || !/^\d{14}$/.test(nationalId))) {
      toast({ title: "الرقم القومي مطلوب", description: requiresFullId ? "الرقم القومي إجباري لمرضى التعاقد والتأمين" : "الرقم القومي إجباري للتسكين", variant: "destructive" }); return false;
    }
    if (nationalId && !/^\d{14}$/.test(nationalId)) { toast({ title: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" }); return false; }
    if (!visitReason) { toast({ title: "يرجى اختيار سبب الزيارة", variant: "destructive" }); return false; }
    if (paymentType === "INSURANCE") {
      const cardEntered = resolution.state.cardNumber.trim().length > 0;
      if (cardEntered && !resolution.state.resolved) { toast({ title: "رقم بطاقة التأمين غير صالح", variant: "destructive" }); return false; }
      if (!resolution.state.resolved && !insuranceCo.trim()) { toast({ title: "الرجاء إدخال بطاقة التأمين أو اسم شركة التأمين", variant: "destructive" }); return false; }
    }
    if (paymentType === "CONTRACT" && !resolution.state.resolved) {
      toast({ title: "يجب تحديد بطاقة المنتسب لمرضى التعاقد", variant: "destructive" }); return false;
    }
    if (visitReason === "consultation" && !selectedClinic) { toast({ title: "الرجاء اختيار العيادة", variant: "destructive" }); return false; }
    if (visitReason === "consultation" && selectedClinic && !selectedDoctor) { toast({ title: "الرجاء اختيار الطبيب", variant: "destructive" }); return false; }
    if (visitReason === "admission" && !selectedBed) { toast({ title: "الرجاء اختيار سرير فارغ للتسكين", variant: "destructive" }); return false; }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;

    if (!existingPatient && dupResult?.duplicateStatus === "block") {
      toast({ title: "لا يمكن إضافة مريض مكرر", description: "يوجد مريض بنفس البيانات", variant: "destructive" });
      return;
    }
    if (!existingPatient && dupResult?.duplicateStatus === "warning" && !overrideReason.trim()) {
      toast({ title: "سبب الإضافة مطلوب", description: "يوجد مرضى مشابهون — اكتب السبب", variant: "destructive" });
      return;
    }

    const baseData = {
      fullName: fullName.trim(),
      phone: phone || null,
      nationalId: nationalId || null,
      dateOfBirth: dateOfBirth || null,
      age: age !== "" ? parseInt(age, 10) : null,
      isActive: true,
    };

    if (visitReason === "admission" && selectedBed) {
      const admPaymentType = paymentType === "CONTRACT" ? "contract" : paymentType === "INSURANCE" ? "insurance" : "CASH";
      const resolved = resolution.state.resolved;
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName: fullName.trim(),
          patientPhone: phone || undefined,
          patientId: existingPatient?.id || undefined,
          nationalId: nationalId || undefined,
          dateOfBirth: dateOfBirth || undefined,
          age: age !== "" ? parseInt(age, 10) : undefined,
          doctorName: admDoctor?.name || undefined,
          surgeryTypeId: selectedSurgery?.id || undefined,
          isPackage: selectedSurgery ? isPackage : undefined,
          paymentType: admPaymentType,
          insuranceCompany: paymentType !== "CASH" ? (resolved?.companyName ?? (insuranceCo || undefined)) : undefined,
          contractMemberId: resolved?.memberId || undefined,
        },
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
          queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
          queryClient.invalidateQueries({ queryKey: ["/api/patient-visits"] });
          toast({ title: "تم تسكين المريض بنجاح" });
          if (printTicket) {
            const floorObj = floors.find(f => f.id === selectedFloor);
            const roomObj = rooms.find(r => r.id === selectedRoom);
            printReceptionTicket({
              patientName: fullName.trim(),
              visitType: "admission",
              departmentName: "القسم الداخلي",
              floorName: floorObj?.nameAr ?? null,
              roomName: roomObj?.nameAr ?? null,
              paymentType,
            });
          }
          resetForm();
        },
        onError: (e: Error) => toast({ title: "خطأ في التسكين", description: e.message, variant: "destructive" }),
      });
      return;
    }

    let patientId: string;
    if (existingPatient) {
      patientId = existingPatient.id;
      const hasChanges =
        (phone || null) !== (existingPatient.phone || null) ||
        (nationalId || null) !== (existingPatient.nationalId || null) ||
        (age !== "" ? parseInt(age, 10) : null) !== (existingPatient.age ?? null);
      if (hasChanges) {
        try {
          await apiRequest("PATCH", `/api/patients/${patientId}`, {
            fullName: fullName.trim(),
            phone: phone || null,
            nationalId: nationalId || null,
            dateOfBirth: dateOfBirth || null,
            age: age !== "" ? parseInt(age, 10) : null,
          });
        } catch { /* ignore update error */ }
      }
    } else {
      try {
        const res = await createMutation.mutateAsync(baseData);
        const created = await (res as Response).json();
        patientId = created.id;
        queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      } catch { return; }
    }

    if (visitReason === "consultation" && selectedClinic && selectedDoctor) {
      try {
        const resolved = resolution.state.resolved;
        const apt = await appointmentMutation.mutateAsync({
          clinicId: selectedClinic.id,
          body: {
            doctorId: selectedDoctor.id,
            patientId,
            patientName: fullName.trim(),
            patientPhone: phone || undefined,
            appointmentDate: consultDate,
            appointmentTime: consultTime || undefined,
            paymentType,
            insuranceCompany: paymentType === "INSURANCE" && !resolved ? insuranceCo.trim() || undefined : undefined,
            companyId: resolved?.companyId,
            contractId: resolved?.contractId,
            contractMemberId: resolved?.memberId,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/patient-visits"] });
        const invoicePart = apt.invoiceNumber ? ` — فاتورة: ${apt.invoiceNumber}` : "";
        toast({
          title: existingPatient ? "تم حجز زيارة جديدة" : "تم إضافة المريض وحجز الكشف",
          description: `${selectedClinic.name} — رقم الدور: ${apt.turnNumber}${invoicePart}`,
        });
        if (printTicket) {
          printReceptionTicket({
            patientName: fullName.trim(),
            visitType: "consultation",
            departmentName: "العيادات الخارجية",
            clinicName: selectedClinic?.name ?? null,
            doctorName: selectedDoctor?.name ?? null,
            turnNumber: apt.turnNumber ?? null,
            paymentType,
            contractName: resolution.state.resolved?.contractName ?? resolution.state.resolved?.companyName ?? (insuranceCo.trim() || null),
          });
        }
      } catch (e: any) {
        toast({ title: "خطأ في الحجز", description: e?.message || "فشل حجز الكشف", variant: "destructive" });
        return;
      }
    } else {
      try {
        const visit = await saveVisitMutation.mutateAsync({
          patientId,
          visitType: visitReason === "admission" ? "inpatient" : "outpatient",
          requestedService: visitReason === "lab" ? "تحاليل" : visitReason === "radiology" ? "أشعة" : undefined,
          notes: serviceNotes.trim() || undefined,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/patient-visits"] });
        toast({
          title: existingPatient ? `تم تسجيل زيارة ${visitReason === "lab" ? "تحاليل" : "أشعة"}` : "تم إضافة المريض",
          description: `رقم الزيارة: ${visit.visit_number}`,
        });
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message, variant: "destructive" });
        return;
      }
      if (printTicket && (visitReason === "lab" || visitReason === "radiology")) {
        printReceptionTicket({
          patientName: fullName.trim(),
          visitType: visitReason,
          departmentName: visitReason === "lab" ? "المختبر" : "الأشعة",
          paymentType,
        });
      }
    }

    resetForm();
    nameInputRef.current?.focus();
  }

  const handleComplete = useCallback((id: string) => {
    statusMutation.mutate({ id, status: "completed" });
  }, [statusMutation]);

  const todayCounts = useMemo(() => ({
    total: visits.length,
    inpatient: visits.filter(v => v.visit_type === "inpatient").length,
    outpatient: visits.filter(v => v.visit_type === "outpatient").length,
    open: visits.filter(v => v.status === "open").length,
  }), [visits]);

  const saveLabel = isPending ? "جاري الحفظ..." : (() => {
    if (visitReason === "admission" && selectedBed) return "إضافة وتسكين";
    if (visitReason === "consultation" && selectedClinic && selectedDoctor) return existingPatient ? "حجز زيارة جديدة" : "إضافة وحجز الكشف";
    if (visitReason === "lab") return existingPatient ? "تسجيل زيارة تحاليل" : "إضافة مريض (تحاليل)";
    if (visitReason === "radiology") return existingPatient ? "تسجيل زيارة أشعة" : "إضافة مريض (أشعة)";
    return existingPatient ? "تسجيل زيارة" : "إضافة مريض";
  })();

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-[1600px] mx-auto h-[calc(100vh-60px)]" dir="rtl">

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            الاستقبال الموحد
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            <span className="text-xs text-muted-foreground/60 mr-3">[F2] استقبال جديد</span>
          </p>
        </div>
        <div className="flex gap-2">
          <StatCard label="الإجمالي" value={todayCounts.total} color="bg-slate-50 text-slate-700 border-slate-200" />
          <StatCard label="خارجي" value={todayCounts.outpatient} color="bg-teal-50 text-teal-700 border-teal-200" />
          <StatCard label="داخلي" value={todayCounts.inpatient} color="bg-indigo-50 text-indigo-700 border-indigo-200" />
          <StatCard label="مفتوح" value={todayCounts.open} color="bg-blue-50 text-blue-700 border-blue-200" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">

        <div className="lg:col-span-7 xl:col-span-7 flex flex-col min-h-0">
          <div className="border rounded-xl bg-card shadow-sm flex flex-col flex-1 min-h-0">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">تسجيل زيارة جديدة</span>
              <div className="mr-auto">
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs text-muted-foreground gap-1" data-testid="button-reset-form">
                  <RefreshCw className="h-3 w-3" />
                  مسح
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-4 py-3 space-y-4">

                <PatientInfoSection
                  fullName={fullName} setFullName={setFullName}
                  phone={phone} setPhone={setPhone}
                  nationalId={nationalId} setNationalId={setNationalId}
                  dateOfBirth={dateOfBirth} setDateOfBirth={setDateOfBirth}
                  age={age} setAge={setAge}
                  existingPatient={existingPatient}
                  showSuggestList={showSuggestList}
                  setShowSuggestions={setShowSuggestions}
                  highlightedIdx={highlightedIdx}
                  setHighlightedIdx={setHighlightedIdx}
                  patientSuggestions={patientSuggestions}
                  handleSelectExistingPatient={handleSelectExistingPatient}
                  handleClearExistingPatient={handleClearExistingPatient}
                  handleNameKeyDown={handleNameKeyDown}
                  nameInputRef={nameInputRef}
                  phoneInputRef={phoneInputRef}
                  suggestItemsRef={suggestItemsRef}
                  quadNameRequired={quadNameRequired}
                  requiresFullId={requiresFullId}
                  nidRequired={nidRequired}
                />

                <DuplicateCheckSection
                  shouldCheckDup={shouldCheckDup}
                  dupChecking={dupChecking}
                  dupResult={dupResult}
                  dupDismissed={dupDismissed}
                  setDupDismissed={setDupDismissed}
                  overrideReason={overrideReason}
                  setOverrideReason={setOverrideReason}
                  handleSelectExistingPatient={handleSelectExistingPatient}
                />

                <PaymentTypeSection
                  paymentType={paymentType}
                  handlePaymentTypeChange={handlePaymentTypeChange}
                  insuranceCo={insuranceCo}
                  setInsuranceCo={setInsuranceCo}
                  resolution={resolution}
                  consultDate={consultDate}
                />

                <VisitDetailsSection
                  visitReason={visitReason} setVisitReason={setVisitReason}
                  selectedClinic={selectedClinic} setSelectedClinic={setSelectedClinic}
                  selectedDoctor={selectedDoctor} setSelectedDoctor={setSelectedDoctor}
                  consultDate={consultDate} setConsultDate={setConsultDate}
                  consultTime={consultTime} setConsultTime={setConsultTime}
                  schedules={schedules}
                  selectedFloor={selectedFloor} setSelectedFloor={setSelectedFloor}
                  selectedRoom={selectedRoom} setSelectedRoom={setSelectedRoom}
                  selectedBed={selectedBed} setSelectedBed={setSelectedBed}
                  floors={floors} rooms={rooms} beds={beds}
                  admDoctor={admDoctor} setAdmDoctor={setAdmDoctor}
                  surgerySearch={surgerySearch} setSurgerySearch={setSurgerySearch}
                  selectedSurgery={selectedSurgery} setSelectedSurgery={setSelectedSurgery}
                  isPackage={isPackage} setIsPackage={setIsPackage}
                  showSurgeryDrop={showSurgeryDrop} setShowSurgeryDrop={setShowSurgeryDrop}
                  highlightedSurgery={highlightedSurgery} setHighlightedSurgery={setHighlightedSurgery}
                  surgeryTypesRaw={surgeryTypesRaw} surgeryItemsRef={surgeryItemsRef}
                  handleSurgeryKeyDown={handleSurgeryKeyDown}
                  serviceNotes={serviceNotes} setServiceNotes={setServiceNotes}
                />

                <div className="flex items-center gap-2 pt-2 pb-1 border-t">
                  {visitReason && visitReason !== "admission" && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground" data-testid="label-print-ticket">
                      <input type="checkbox" checked={printTicket} onChange={e => setPrintTicket(e.target.checked)} className="h-3.5 w-3.5 accent-primary cursor-pointer" data-testid="checkbox-print-ticket" />
                      <Printer className="h-3 w-3" />
                      طباعة تذكرة
                    </label>
                  )}
                  <div className="mr-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs" data-testid="button-cancel-form">
                      مسح الحقول
                    </Button>
                    <Button size="sm" onClick={handleSubmit} disabled={isPending || !visitReason} className="h-8 text-xs min-w-[120px]" data-testid="button-submit-reception">
                      {isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                      {saveLabel}
                    </Button>
                  </div>
                </div>

              </div>
            </ScrollArea>
          </div>
        </div>

        <VisitsListPanel
          visits={visits}
          visitsLoading={visitsLoading}
          listSearch={listSearch} setListSearch={setListSearch}
          listDate={listDate} setListDate={setListDate}
          listStatusFilter={listStatusFilter} setListStatusFilter={setListStatusFilter}
          listTypeFilter={listTypeFilter} setListTypeFilter={setListTypeFilter}
          handleComplete={handleComplete}
        />

      </div>
    </div>
  );
}
