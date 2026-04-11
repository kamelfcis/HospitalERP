/**
 * PatientFormDialog — نافذة استقبال / تعديل / تذكرة جديدة للمريض
 *
 * تُفتح من شاشة سجل المرضى (patients/index.tsx) بثلاثة أوضاع:
 *  1. استقبال مريض جديد (open + !editingPatient + !prefilledPatient)
 *  2. تعديل بيانات مريض موجود (editingPatient)
 *  3. تذكرة جديدة لمريض مسجل (prefilledPatient)
 *
 * Keyboard map:
 *  Name/search → ↑↓ navigate suggestions · Enter select · Escape clear
 *  Surgery     → ↑↓ navigate results    · Enter select · Escape close
 *  Payment     → Tab to reach · Space/Enter toggle
 *  Submit      → Tab to reach · Enter
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation, useQuery }   from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast }                from "@/hooks/use-toast";
import { Button }                  from "@/components/ui/button";
import { ScrollArea }              from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Printer } from "lucide-react";
import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
import { isFullName } from "@/components/shared/NationalIdField";
import type { InsertPatient }         from "@shared/schema";
import type { PatientFormDialogProps } from "./types";
import { useDebounce }                from "./useDebounce";
import { useContractResolution }      from "./hooks/useContractResolution";

import type {
  VisitReason, PaymentKind, PatientSuggest,
  DuplicateCheckResult, FloorOption, RoomOption, BedOption, SurgeryType, ScheduleOption,
} from "./components/PatientFormTypes";
import { PatientIdentitySection }     from "./components/PatientIdentitySection";
import { DuplicateDetectionSection }  from "./components/DuplicateDetectionSection";
import { PaymentTypeSection }         from "./components/PaymentTypeSection";
import { VisitReasonSection }         from "./components/VisitReasonSection";

const todayISO = new Date().toISOString().slice(0, 10);

export default function PatientFormDialog({ open, onClose, editingPatient, prefilledPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  const [fullName,        setFullName]        = useState("");
  const [phone,           setPhone]           = useState("");
  const [nationalId,      setNationalId]      = useState("");
  const [dateOfBirth,     setDateOfBirth]     = useState("");
  const [age,             setAge]             = useState("");
  const [existingPatient, setExistingPatient] = useState<PatientSuggest | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx,  setHighlightedIdx]  = useState(-1);

  const [overrideReason, setOverrideReason] = useState("");
  const [dupDismissed,   setDupDismissed]   = useState(false);

  const [paymentType,    setPaymentType]    = useState<PaymentKind>("CASH");
  const [insuranceCo,    setInsuranceCo]    = useState("");
  const resolution = useContractResolution();

  const [visitReason, setVisitReason] = useState<VisitReason>("");

  const [selectedClinic, setSelectedClinic] = useState<import("@/lib/lookupTypes").LookupItem | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<import("@/lib/lookupTypes").LookupItem | null>(null);
  const [consultDate,    setConsultDate]    = useState(todayISO);
  const [consultTime,    setConsultTime]    = useState("");

  const [selectedFloor,      setSelectedFloor]      = useState("");
  const [selectedRoom,       setSelectedRoom]       = useState("");
  const [selectedBed,        setSelectedBed]        = useState("");
  const [admDoctor,          setAdmDoctor]          = useState<import("@/lib/lookupTypes").LookupItem | null>(null);
  const [surgerySearch,      setSurgerySearch]      = useState("");
  const [selectedSurgery,    setSelectedSurgery]    = useState<SurgeryType | null>(null);
  const [showSurgeryDrop,    setShowSurgeryDrop]    = useState(false);
  const [highlightedSurgery, setHighlightedSurgery] = useState(0);

  const [serviceNotes, setServiceNotes] = useState("");

  const [printTicket, setPrintTicket] = useState(true);

  const nameInputRef     = useRef<HTMLInputElement>(null);
  const phoneInputRef    = useRef<HTMLInputElement>(null);
  const suggestItemsRef  = useRef<(HTMLButtonElement | null)[]>([]);
  const surgeryItemsRef  = useRef<(HTMLButtonElement | null)[]>([]);

  const debouncedName  = useDebounce(fullName,    300);
  const debouncedPhone = useDebounce(phone,       500);
  const debouncedNid   = useDebounce(nationalId,  500);

  useEffect(() => {
    if (!open) return;

    setPaymentType("CASH"); setInsuranceCo(""); resolution.clear();
    setVisitReason("");
    setSelectedClinic(null); setSelectedDoctor(null);
    setConsultDate(todayISO); setConsultTime("");
    setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
    setAdmDoctor(null);
    setSurgerySearch(""); setSelectedSurgery(null); setShowSurgeryDrop(false);
    setServiceNotes("");
    setOverrideReason(""); setDupDismissed(false);
    setHighlightedIdx(0); setHighlightedSurgery(0);
    setPrintTicket(true);

    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setDateOfBirth((editingPatient as any).dateOfBirth || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
      setExistingPatient(null);
      setShowSuggestions(false);
    } else if (prefilledPatient) {
      setExistingPatient({ id: prefilledPatient.id, fullName: prefilledPatient.fullName, phone: prefilledPatient.phone ?? null, age: prefilledPatient.age ?? null, nationalId: prefilledPatient.nationalId ?? null, patientCode: prefilledPatient.patientCode ?? null });
      setFullName(prefilledPatient.fullName);
      setPhone(prefilledPatient.phone || "");
      setNationalId(prefilledPatient.nationalId || "");
      setDateOfBirth((prefilledPatient as any).dateOfBirth || "");
      setAge(prefilledPatient.age != null ? String(prefilledPatient.age) : "");
      setShowSuggestions(false);
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setDateOfBirth(""); setAge("");
      setExistingPatient(null); setShowSuggestions(false);
    }
  }, [editingPatient, prefilledPatient, open]); // eslint-disable-line

  useEffect(() => { setSelectedRoom(""); setSelectedBed(""); }, [selectedFloor]);
  useEffect(() => { setSelectedBed(""); }, [selectedRoom]);

  useEffect(() => {
    setOverrideReason("");
    setDupDismissed(false);
  }, [debouncedName, debouncedPhone, debouncedNid]);

  useEffect(() => {
    setHighlightedIdx(0);
    suggestItemsRef.current = [];
  }, [debouncedName]);

  useEffect(() => {
    suggestItemsRef.current[highlightedIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  useEffect(() => {
    surgeryItemsRef.current[highlightedSurgery]?.scrollIntoView({ block: "nearest" });
  }, [highlightedSurgery]);

  const { data: patientSuggestions = [] } = useQuery<PatientSuggest[]>({
    queryKey: ["/api/patients", "search", debouncedName],
    queryFn: () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedName.trim())}&limit=10`)
        .then(r => r.json()),
    enabled: !isEdit && !existingPatient && debouncedName.trim().length >= 2,
    staleTime: 30_000,
  });

  const shouldCheckDup = !isEdit && !existingPatient && !dupDismissed && (
    debouncedName.trim().length >= 2 ||
    debouncedPhone.trim().length >= 5 ||
    debouncedNid.trim().length >= 5
  );

  const { data: dupResult, isFetching: dupChecking } = useQuery<DuplicateCheckResult>({
    queryKey: ["/api/patients/check-duplicates", debouncedName.trim(), debouncedPhone.trim(), debouncedNid.trim()],
    queryFn: () =>
      apiRequest("POST", "/api/patients/check-duplicates", {
        fullName:         debouncedName.trim()  || null,
        phone:            debouncedPhone.trim() || null,
        nationalId:       debouncedNid.trim()   || null,
        age:              age ? parseInt(age, 10) : null,
        excludePatientId: editingPatient?.id,
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
    enabled: open && visitReason === "admission",
  });

  const { data: surgeryTypesRaw = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn: async () => {
      const q = surgerySearch.trim() ? `?search=${encodeURIComponent(surgerySearch.trim())}` : "";
      const r = await apiRequest("GET", `/api/surgery-types${q}`);
      const d = await r.json();
      return Array.isArray(d) ? d : d.data ?? [];
    },
    enabled: open && visitReason === "admission" && surgerySearch.length >= 1,
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
    setDateOfBirth((p as any).dateOfBirth || "");
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
    if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
      return;
    }
    if (!showSuggestList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, patientSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < patientSuggestions.length) {
        handleSelectExistingPatient(patientSuggestions[highlightedIdx]);
      }
    }
  }, [showSuggestList, patientSuggestions, highlightedIdx, handleSelectExistingPatient]);

  const handleSurgeryKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setShowSurgeryDrop(false);
      setSurgerySearch("");
      setSelectedSurgery(null);
      return;
    }
    if (!showSurgeryDrop || surgeryTypesRaw.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedSurgery(prev => Math.min(prev + 1, surgeryTypesRaw.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedSurgery(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = surgeryTypesRaw[highlightedSurgery];
      if (s) { setSelectedSurgery(s); setSurgerySearch(s.nameAr); setShowSurgeryDrop(false); }
    }
  }, [showSurgeryDrop, surgeryTypesRaw, highlightedSurgery]);

  const handlePaymentKeyDown = useCallback((e: React.KeyboardEvent, v: PaymentKind) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); handlePaymentTypeChange(v); }
  }, [handlePaymentTypeChange]);

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

  const pfdRequiresFullId = paymentType === "CONTRACT" || paymentType === "INSURANCE";
  const pfdIsAdmission = visitReason === "admission";
  const pfdNidRequired = pfdRequiresFullId || pfdIsAdmission;
  const pfdQuadNameRequired = pfdRequiresFullId || pfdIsAdmission;

  function validate(): boolean {
    if (!fullName.trim()) {
      toast({ title: "اسم المريض مطلوب", variant: "destructive" }); return false;
    }
    if (pfdQuadNameRequired && !isFullName(fullName)) {
      toast({ title: "الاسم الرباعي مطلوب", description: pfdRequiresFullId ? "الاسم الرباعي إجباري لمرضى التعاقد والتأمين" : "الاسم الرباعي إجباري للتسكين", variant: "destructive" }); return false;
    }
    if (phone && !/^\d{11}$/.test(phone)) {
      toast({ title: "التليفون يجب أن يكون 11 رقم", variant: "destructive" }); return false;
    }
    if (pfdNidRequired && (!nationalId || !/^\d{14}$/.test(nationalId))) {
      toast({ title: "الرقم القومي مطلوب", description: pfdRequiresFullId ? "الرقم القومي إجباري لمرضى التعاقد والتأمين" : "الرقم القومي إجباري للتسكين", variant: "destructive" }); return false;
    }
    if (nationalId && !/^\d{14}$/.test(nationalId)) {
      toast({ title: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" }); return false;
    }
    if (paymentType === "INSURANCE") {
      const cardEntered = resolution.state.cardNumber.trim().length > 0;
      if (cardEntered && !resolution.state.resolved) {
        toast({ title: "رقم بطاقة التأمين غير صالح", description: "تحقق من رقم البطاقة أو امسح الرقم لاستخدام اسم الشركة النصي", variant: "destructive" }); return false;
      }
      if (!resolution.state.resolved && !insuranceCo.trim()) {
        toast({ title: "الرجاء إدخال بطاقة التأمين أو اسم شركة التأمين", variant: "destructive" }); return false;
      }
    }
    if (paymentType === "CONTRACT" && visitReason === "consultation" && !resolution.state.resolved) {
      toast({ title: "يجب تحديد بطاقة المنتسب لحجوزات التعاقد", description: "ابحث عن رقم بطاقة المنتسب وتأكد من نجاح التحقق منها", variant: "destructive" }); return false;
    }
    if (visitReason === "consultation" && selectedClinic && !selectedDoctor) {
      toast({ title: "الرجاء اختيار الطبيب للكشف", variant: "destructive" }); return false;
    }
    if (visitReason === "admission" && selectedRoom && !selectedBed) {
      toast({ title: "الرجاء اختيار سرير فارغ", variant: "destructive" }); return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;

    if (!isEdit && !existingPatient && dupResult?.duplicateStatus === "block") {
      toast({ title: "لا يمكن إضافة مريض مكرر", description: "يوجد مريض بنفس البيانات — الرجاء استخدام ملفه الموجود", variant: "destructive" });
      return;
    }
    if (!isEdit && !existingPatient && dupResult?.duplicateStatus === "warning" && !overrideReason.trim()) {
      toast({ title: "سبب الإضافة مطلوب", description: "يوجد مرضى مشابهون — اكتب سبب إنشاء ملف جديد في خانة التنبيه", variant: "destructive" });
      return;
    }

    const baseData: Partial<InsertPatient> = {
      fullName:   fullName.trim(),
      phone:      phone || null,
      nationalId: nationalId || null,
      dateOfBirth: dateOfBirth || null,
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    if (visitReason === "admission" && selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          patientId:        existingPatient?.id || undefined,
          nationalId:       nationalId || undefined,
          dateOfBirth:      dateOfBirth || undefined,
          age:              age !== "" ? parseInt(age, 10) : undefined,
          doctorName:       admDoctor?.name || undefined,
          surgeryTypeId:    selectedSurgery?.id || undefined,
          paymentType,
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

    let patientId: string;
    if (existingPatient) {
      patientId = existingPatient.id;
      const hasChanges =
        (phone      || null) !== (existingPatient.phone      || null) ||
        (nationalId || null) !== (existingPatient.nationalId || null) ||
        (age !== "" ? parseInt(age, 10) : null) !== (existingPatient.age ?? null);
      if (hasChanges) {
        try {
          await apiRequest("PATCH", `/api/patients/${patientId}`, {
            fullName:   fullName.trim(),
            phone:      phone || null,
            nationalId: nationalId || null,
            dateOfBirth: dateOfBirth || null,
            age:        age !== "" ? parseInt(age, 10) : null,
          });
        } catch { /* تجاهل خطأ التحديث ولا نوقف الحجز */ }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
    } else {
      try {
        const res     = await createMutation.mutateAsync(baseData);
        const created = await (res as Response).json();
        patientId     = created.id;
        queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      } catch { return; }
    }

    if (visitReason === "consultation" && selectedClinic && selectedDoctor) {
      try {
        const resolved = resolution.state.resolved;
        const apt = await appointmentMutation.mutateAsync({
          clinicId: selectedClinic.id,
          body: {
            doctorId:         selectedDoctor.id,
            patientId,
            patientName:      fullName.trim(),
            patientPhone:     phone || undefined,
            appointmentDate:  consultDate,
            appointmentTime:  consultTime || undefined,
            paymentType,
            insuranceCompany: paymentType === "INSURANCE" && !resolved ? insuranceCo.trim() || undefined : undefined,
            companyId:        resolved?.companyId,
            contractId:       resolved?.contractId,
            contractMemberId: resolved?.memberId,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"] });
        const invoicePart = apt.invoiceNumber ? ` — فاتورة رقم: ${apt.invoiceNumber}` : "";
        const payerDisplayName = resolved?.companyName ?? insuranceCo ?? "";
        const paymentPart = paymentType === "CASH"
          ? " (تم التحصيل نقداً)"
          : paymentType === "INSURANCE"
          ? ` (تأمين: ${payerDisplayName})`
          : ` (تعاقد: ${resolved?.contractName ?? ""})`;
        toast({
          title: existingPatient ? "تم حجز زيارة جديدة" : "تم إضافة المريض وحجز الكشف",
          description: `${selectedClinic.name} — رقم الدور: ${apt.turnNumber}${invoicePart}${paymentPart}`,
        });
        if (printTicket) {
          printReceptionTicket({
            patientName:    fullName.trim(),
            visitType:      "consultation",
            departmentName: "العيادات الخارجية",
            clinicName:     selectedClinic?.name ?? null,
            doctorName:     selectedDoctor?.name ?? null,
            turnNumber:     apt.turnNumber ?? null,
            paymentType,
            contractName:   resolved?.contractName ?? resolved?.companyName ?? (insuranceCo.trim() || null),
          });
        }
      } catch (e: any) {
        toast({ title: "خطأ في الحجز", description: e?.message || "فشل حجز الكشف — يمكنك المحاولة مجدداً", variant: "destructive" });
        return;
      }
    } else if (visitReason === "lab") {
      toast({ title: existingPatient ? "تم تسجيل زيارة تحاليل" : "تم إضافة المريض", description: serviceNotes || "سبب الزيارة: تحاليل" });
      if (printTicket) {
        printReceptionTicket({
          patientName:    fullName.trim(),
          visitType:      "lab",
          departmentName: "المختبر",
          paymentType,
        });
      }
    } else if (visitReason === "radiology") {
      toast({ title: existingPatient ? "تم تسجيل زيارة أشعة" : "تم إضافة المريض", description: serviceNotes || "سبب الزيارة: أشعة" });
      if (printTicket) {
        printReceptionTicket({
          patientName:    fullName.trim(),
          visitType:      "radiology",
          departmentName: "الأشعة",
          paymentType,
        });
      }
    } else {
      toast({ title: existingPatient ? "تم تسجيل الزيارة" : "تم إضافة المريض بنجاح" });
    }

    onClose();
  }

  const saveLabel = isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : (() => {
    if (visitReason === "admission"    && selectedBed)                         return "إضافة وتسكين";
    if (visitReason === "consultation" && selectedClinic && selectedDoctor)     return existingPatient ? "حجز زيارة جديدة" : "إضافة وحجز الكشف";
    if (visitReason === "lab")                                                  return existingPatient ? "تسجيل زيارة تحاليل" : "إضافة مريض (تحاليل)";
    if (visitReason === "radiology")                                            return existingPatient ? "تسجيل زيارة أشعة"  : "إضافة مريض (أشعة)";
    return existingPatient ? "تسجيل زيارة" : "إضافة مريض";
  })();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0" dir="rtl">

        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-bold">
            {isEdit ? "تعديل بيانات مريض" : prefilledPatient ? "تذكرة جديدة" : "استقبال مريض"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "تعديل بيانات المريض الموجود"
              : prefilledPatient
                ? "تذكرة زيارة جديدة لمريض مسجل"
                : "استقبال مريض جديد وتسجيل سبب الزيارة"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="px-4 py-3 space-y-4">

            <PatientIdentitySection
              isEdit={isEdit}
              pfdQuadNameRequired={pfdQuadNameRequired}
              pfdRequiresFullId={pfdRequiresFullId}
              pfdNidRequired={pfdNidRequired}
              existingPatient={existingPatient}
              fullName={fullName}
              setFullName={setFullName}
              phone={phone}
              setPhone={setPhone}
              nationalId={nationalId}
              setNationalId={setNationalId}
              dateOfBirth={dateOfBirth}
              setDateOfBirth={setDateOfBirth}
              age={age}
              setAge={setAge}
              showSuggestions={showSuggestions}
              setShowSuggestions={setShowSuggestions}
              showSuggestList={showSuggestList}
              patientSuggestions={patientSuggestions}
              highlightedIdx={highlightedIdx}
              setHighlightedIdx={setHighlightedIdx}
              handleNameKeyDown={handleNameKeyDown}
              handleSelectExistingPatient={handleSelectExistingPatient}
              handleClearExistingPatient={handleClearExistingPatient}
              nameInputRef={nameInputRef}
              phoneInputRef={phoneInputRef}
              suggestItemsRef={suggestItemsRef}
            />

            <DuplicateDetectionSection
              isEdit={isEdit}
              existingPatient={existingPatient}
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
              handlePaymentKeyDown={handlePaymentKeyDown}
              insuranceCo={insuranceCo}
              setInsuranceCo={setInsuranceCo}
              resolution={resolution}
              consultDate={consultDate}
            />

            <VisitReasonSection
              visitReason={visitReason}
              setVisitReason={setVisitReason}
              selectedClinic={selectedClinic}
              setSelectedClinic={setSelectedClinic}
              selectedDoctor={selectedDoctor}
              setSelectedDoctor={setSelectedDoctor}
              consultDate={consultDate}
              setConsultDate={setConsultDate}
              consultTime={consultTime}
              setConsultTime={setConsultTime}
              schedules={schedules}
              selectedFloor={selectedFloor}
              setSelectedFloor={setSelectedFloor}
              selectedRoom={selectedRoom}
              setSelectedRoom={setSelectedRoom}
              selectedBed={selectedBed}
              setSelectedBed={setSelectedBed}
              floors={floors}
              rooms={rooms}
              beds={beds}
              admDoctor={admDoctor}
              setAdmDoctor={setAdmDoctor}
              surgerySearch={surgerySearch}
              setSurgerySearch={setSurgerySearch}
              selectedSurgery={selectedSurgery}
              setSelectedSurgery={setSelectedSurgery}
              showSurgeryDrop={showSurgeryDrop}
              setShowSurgeryDrop={setShowSurgeryDrop}
              highlightedSurgery={highlightedSurgery}
              setHighlightedSurgery={setHighlightedSurgery}
              surgeryTypesRaw={surgeryTypesRaw}
              handleSurgeryKeyDown={handleSurgeryKeyDown}
              surgeryItemsRef={surgeryItemsRef}
              serviceNotes={serviceNotes}
              setServiceNotes={setServiceNotes}
            />

          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t gap-1 flex-wrap">
          {!isEdit && visitReason !== "admission" && visitReason !== "" && (
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground me-auto"
              data-testid="label-print-ticket-toggle"
            >
              <input
                type="checkbox"
                checked={printTicket}
                onChange={e => setPrintTicket(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary cursor-pointer"
                data-testid="checkbox-print-ticket"
              />
              <Printer className="h-3 w-3" />
              طباعة تذكرة المريض
            </label>
          )}
          <Button
            variant="outline"
            size="sm"
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
            {isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" aria-hidden="true" />}
            {saveLabel}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
