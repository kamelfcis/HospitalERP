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

// ===== Imports =====

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation, useQuery }   from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast }                from "@/hooks/use-toast";
import { Input }                   from "@/components/ui/input";
import { Label }                   from "@/components/ui/label";
import { Button }                  from "@/components/ui/button";
import { ScrollArea }              from "@/components/ui/scroll-area";
import { Badge }                   from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Stethoscope, Bed, FlaskConical, Radiation,
  Search, Loader2, Banknote, ShieldCheck, FileSignature,
  UserCheck, X, AlertTriangle, Lock, Info,
} from "lucide-react";
import { ClinicLookup, DoctorLookup } from "@/components/lookups";
import type { LookupItem }            from "@/lib/lookupTypes";
import type { InsertPatient }         from "@shared/schema";
import type { PatientFormDialogProps, PrefilledPatient } from "./types";
import { useDebounce }                from "./useDebounce";

// ===== Types =====

type VisitReason  = "" | "consultation" | "admission" | "lab" | "radiology";
type PaymentKind  = "CASH" | "INSURANCE" | "CONTRACT";

interface DuplicateCandidate {
  patientId: string; patientCode: string | null; fullName: string;
  phone: string | null; nationalId: string | null; age: number | null;
  score: number; reasons: string[];
}
interface DuplicateCheckResult {
  duplicateStatus: "none" | "warning" | "block";
  candidates: DuplicateCandidate[];
  recommendedAction: string;
}
interface ScheduleOption { doctorId: string; doctorName: string; }
interface PatientSuggest { id: string; fullName: string; patientCode?: string | null; phone?: string | null; age?: number | null; nationalId?: string | null; }
interface FloorOption    { id: string; nameAr: string; rooms: RoomOption[]; }
interface RoomOption     { id: string; nameAr: string; beds: BedOption[]; }
interface BedOption      { id: string; nameAr: string; status: string; }
interface SurgeryType    { id: string; nameAr: string; }

// ===== Constants =====

const todayISO = new Date().toISOString().slice(0, 10);

const VISIT_TYPES: { value: VisitReason; label: string; sub: string; Icon: any; color: string; bg: string; border: string }[] = [
  { value: "consultation", label: "كشف عيادة",     sub: "حجز في طابور العيادة",    Icon: Stethoscope,  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-300"   },
  { value: "admission",    label: "تسكين / إقامة",  sub: "تسكين على سرير بالمستشفى", Icon: Bed,          color: "text-green-700",  bg: "bg-green-50",  border: "border-green-300"  },
  { value: "lab",          label: "تحاليل",         sub: "طلب تحاليل مختبر",         Icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300" },
  { value: "radiology",    label: "أشعة",           sub: "طلب أشعة تشخيصية",         Icon: Radiation,    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-300"  },
];

const PAYMENT_TYPES: { value: PaymentKind; label: string; Icon: any }[] = [
  { value: "CASH",      label: "نقدي",  Icon: Banknote      },
  { value: "INSURANCE", label: "تأمين", Icon: ShieldCheck   },
  { value: "CONTRACT",  label: "تعاقد", Icon: FileSignature },
];

// ===== Sub-components =====

// ── Duplicate candidate list ──────────────────────────────────────────────────
function CandidateList({ candidates, onSelect }: { candidates: DuplicateCandidate[]; onSelect: (p: PatientSuggest) => void }) {
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {candidates.map(c => (
        <div key={c.patientId} className="flex items-center gap-2 p-2 rounded border bg-white text-xs">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{c.fullName}</div>
            <div className="text-muted-foreground font-mono">{c.phone || "—"}</div>
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {c.reasons.map((r, i) => (
                <span key={i} className="px-1 py-0.5 rounded bg-muted text-muted-foreground">{r}</span>
              ))}
            </div>
          </div>
          {c.patientCode && (
            <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
              {c.patientCode}
            </span>
          )}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect({ id: c.patientId, fullName: c.fullName, patientCode: c.patientCode, phone: c.phone, age: c.age, nationalId: c.nationalId })}
            className="shrink-0 px-2 py-1 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium"
          >
            استخدام
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Section label (matches ReceptionSheet standard) ──────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1 pb-0.5 border-b select-none">
      {children}
    </p>
  );
}

// ===== Main Component =====

export default function PatientFormDialog({ open, onClose, editingPatient, prefilledPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  // ===== State / Refs =====

  /* patient identity */
  const [fullName,        setFullName]        = useState("");
  const [phone,           setPhone]           = useState("");
  const [nationalId,      setNationalId]      = useState("");
  const [age,             setAge]             = useState("");
  const [existingPatient, setExistingPatient] = useState<PatientSuggest | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx,  setHighlightedIdx]  = useState(-1);

  /* duplicate detection */
  const [overrideReason, setOverrideReason] = useState("");
  const [dupDismissed,   setDupDismissed]   = useState(false);

  /* payment */
  const [paymentType,    setPaymentType]    = useState<PaymentKind>("CASH");
  const [insuranceCo,    setInsuranceCo]    = useState("");
  const [payerReference, setPayerReference] = useState("");

  /* visit reason */
  const [visitReason, setVisitReason] = useState<VisitReason>("");

  /* consultation */
  const [selectedClinic, setSelectedClinic] = useState<LookupItem | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<LookupItem | null>(null);
  const [consultDate,    setConsultDate]    = useState(todayISO);
  const [consultTime,    setConsultTime]    = useState("");

  /* admission */
  const [selectedFloor,      setSelectedFloor]      = useState("");
  const [selectedRoom,       setSelectedRoom]       = useState("");
  const [selectedBed,        setSelectedBed]        = useState("");
  const [admDoctor,          setAdmDoctor]          = useState<LookupItem | null>(null);
  const [surgerySearch,      setSurgerySearch]      = useState("");
  const [selectedSurgery,    setSelectedSurgery]    = useState<SurgeryType | null>(null);
  const [showSurgeryDrop,    setShowSurgeryDrop]    = useState(false);
  const [highlightedSurgery, setHighlightedSurgery] = useState(0);

  /* lab / radiology */
  const [serviceNotes, setServiceNotes] = useState("");

  /* refs */
  const nameInputRef     = useRef<HTMLInputElement>(null);
  const phoneInputRef    = useRef<HTMLInputElement>(null);
  const suggestItemsRef  = useRef<(HTMLButtonElement | null)[]>([]);
  const surgeryItemsRef  = useRef<(HTMLButtonElement | null)[]>([]);

  /* debounced search terms */
  const debouncedName  = useDebounce(fullName,    300);
  const debouncedPhone = useDebounce(phone,       500);
  const debouncedNid   = useDebounce(nationalId,  500);

  // ===== Effects =====

  /* Reset all fields when dialog opens */
  useEffect(() => {
    if (!open) return;

    setPaymentType("CASH"); setInsuranceCo(""); setPayerReference("");
    setVisitReason("");
    setSelectedClinic(null); setSelectedDoctor(null);
    setConsultDate(todayISO); setConsultTime("");
    setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
    setAdmDoctor(null);
    setSurgerySearch(""); setSelectedSurgery(null); setShowSurgeryDrop(false);
    setServiceNotes("");
    setOverrideReason(""); setDupDismissed(false);
    setHighlightedIdx(0); setHighlightedSurgery(0);

    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
      setExistingPatient(null);
      setShowSuggestions(false);
    } else if (prefilledPatient) {
      setExistingPatient({ id: prefilledPatient.id, fullName: prefilledPatient.fullName, phone: prefilledPatient.phone ?? null, age: prefilledPatient.age ?? null, nationalId: prefilledPatient.nationalId ?? null, patientCode: prefilledPatient.patientCode ?? null });
      setFullName(prefilledPatient.fullName);
      setPhone(prefilledPatient.phone || "");
      setNationalId(prefilledPatient.nationalId || "");
      setAge(prefilledPatient.age != null ? String(prefilledPatient.age) : "");
      setShowSuggestions(false);
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setAge("");
      setExistingPatient(null); setShowSuggestions(false);
    }
  }, [editingPatient, prefilledPatient, open]); // eslint-disable-line

  /* Cascade clear: room/bed depend on floor/room */
  useEffect(() => { setSelectedRoom(""); setSelectedBed(""); }, [selectedFloor]);
  useEffect(() => { setSelectedBed(""); }, [selectedRoom]);

  /* Reset duplicate override when patient data changes */
  useEffect(() => {
    setOverrideReason("");
    setDupDismissed(false);
  }, [debouncedName, debouncedPhone, debouncedNid]);

  /* Reset suggestion highlight when the list changes */
  useEffect(() => {
    setHighlightedIdx(0);
    suggestItemsRef.current = [];
  }, [debouncedName]);

  /* Scroll highlighted suggestion into view */
  useEffect(() => {
    suggestItemsRef.current[highlightedIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  /* Scroll highlighted surgery into view */
  useEffect(() => {
    surgeryItemsRef.current[highlightedSurgery]?.scrollIntoView({ block: "nearest" });
  }, [highlightedSurgery]);

  // ===== Data Fetching =====

  /* Patient autocomplete suggestions */
  const { data: patientSuggestions = [] } = useQuery<PatientSuggest[]>({
    queryKey: ["/api/patients", "search", debouncedName],
    queryFn: () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedName.trim())}&limit=10`)
        .then(r => r.json()),
    enabled: !isEdit && !existingPatient && debouncedName.trim().length >= 2,
    staleTime: 30_000,
  });

  /* Duplicate detection */
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

  /* Clinic schedules */
  const { data: schedules = [] } = useQuery<ScheduleOption[]>({
    queryKey: ["/api/clinic-clinics", selectedClinic?.id, "schedules"],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${selectedClinic!.id}/schedules`).then(r => r.json()),
    enabled: !!selectedClinic?.id,
  });

  /* Bed board for admission */
  const { data: bedBoard = [] } = useQuery<FloorOption[]>({
    queryKey: ["/api/bed-board"],
    enabled: open && visitReason === "admission",
  });

  /* Surgery types */
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

  // ===== Derived Values =====

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

  /* Auto-select bed when only one is available */
  useEffect(() => {
    if (beds.length === 1 && !selectedBed) setSelectedBed(beds[0].id);
  }, [beds]); // eslint-disable-line

  const showSuggestList = useMemo(
    () => showSuggestions && patientSuggestions.length > 0 && !existingPatient,
    [showSuggestions, patientSuggestions.length, existingPatient],
  );

  // ===== Handlers =====

  /* Select an existing patient from suggestions */
  const handleSelectExistingPatient = useCallback((p: PatientSuggest) => {
    setExistingPatient(p);
    setFullName(p.fullName);
    setPhone(p.phone || "");
    setNationalId(p.nationalId || "");
    setAge(p.age != null ? String(p.age) : "");
    setShowSuggestions(false);
    // Move focus to phone field so the user can continue filling in
    setTimeout(() => phoneInputRef.current?.focus(), 50);
  }, []);

  /* Clear selected patient and return to search */
  const handleClearExistingPatient = useCallback(() => {
    setExistingPatient(null);
    setFullName(""); setPhone(""); setNationalId(""); setAge("");
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  /* Payment type change: also clears dependent fields */
  const handlePaymentTypeChange = useCallback((v: PaymentKind) => {
    setPaymentType(v);
    if (v !== "INSURANCE") setInsuranceCo("");
    if (v !== "CONTRACT")  setPayerReference("");
  }, []);

  // ===== Search Keyboard Navigation =====

  /* ↑↓ Enter Escape on the patient name/search field */
  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    /* Escape: hide suggestions (but keep typed text — user may still need it) */
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

  /* ↑↓ Enter Escape on the surgery search field */
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

  /* Payment button Space/Enter */
  const handlePaymentKeyDown = useCallback((e: React.KeyboardEvent, v: PaymentKind) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); handlePaymentTypeChange(v); }
  }, [handlePaymentTypeChange]);

  // ===== Mutations =====

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

  // ===== Validation =====

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
    if (paymentType === "CONTRACT" && visitReason === "consultation" && !payerReference.trim()) {
      toast({ title: "الرجاء كتابة اسم الجهة المتعاقدة", variant: "destructive" }); return false;
    }
    if (visitReason === "consultation" && selectedClinic && !selectedDoctor) {
      toast({ title: "الرجاء اختيار الطبيب للكشف", variant: "destructive" }); return false;
    }
    if (visitReason === "admission" && selectedRoom && !selectedBed) {
      toast({ title: "الرجاء اختيار سرير فارغ", variant: "destructive" }); return false;
    }
    return true;
  }

  // ===== Submit =====

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
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    /* Edit mode */
    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    /* Admission */
    if (visitReason === "admission" && selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          patientId:        existingPatient?.id || undefined,
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

    /* Create or resolve patient */
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

    /* Consultation booking */
    if (visitReason === "consultation" && selectedClinic && selectedDoctor) {
      try {
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
            insuranceCompany: paymentType === "INSURANCE" ? insuranceCo.trim() : undefined,
            payerReference:   paymentType === "CONTRACT"  ? payerReference.trim() : undefined,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"] });
        const invoicePart = apt.invoiceNumber ? ` — فاتورة رقم: ${apt.invoiceNumber}` : "";
        const paymentPart = paymentType === "CASH"
          ? " (تم التحصيل نقداً)"
          : paymentType === "INSURANCE"
          ? ` (تأمين: ${insuranceCo})`
          : ` (تعاقد: ${payerReference})`;
        toast({
          title: existingPatient ? "تم حجز زيارة جديدة" : "تم إضافة المريض وحجز الكشف",
          description: `${selectedClinic.name} — رقم الدور: ${apt.turnNumber}${invoicePart}${paymentPart}`,
        });
      } catch (e: any) {
        toast({ title: "خطأ في الحجز", description: e?.message || "فشل حجز الكشف — يمكنك المحاولة مجدداً", variant: "destructive" });
        return;
      }
    } else if (visitReason === "lab") {
      toast({ title: existingPatient ? "تم تسجيل زيارة تحاليل" : "تم إضافة المريض", description: serviceNotes || "سبب الزيارة: تحاليل" });
    } else if (visitReason === "radiology") {
      toast({ title: existingPatient ? "تم تسجيل زيارة أشعة" : "تم إضافة المريض", description: serviceNotes || "سبب الزيارة: أشعة" });
    } else {
      toast({ title: existingPatient ? "تم تسجيل الزيارة" : "تم إضافة المريض بنجاح" });
    }

    onClose();
  }

  /* Dynamic submit button label */
  const saveLabel = isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : (() => {
    if (visitReason === "admission"    && selectedBed)                         return "إضافة وتسكين";
    if (visitReason === "consultation" && selectedClinic && selectedDoctor)     return existingPatient ? "حجز زيارة جديدة" : "إضافة وحجز الكشف";
    if (visitReason === "lab")                                                  return existingPatient ? "تسجيل زيارة تحاليل" : "إضافة مريض (تحاليل)";
    if (visitReason === "radiology")                                            return existingPatient ? "تسجيل زيارة أشعة"  : "إضافة مريض (أشعة)";
    return existingPatient ? "تسجيل زيارة" : "إضافة مريض";
  })();

  // ===== Layout Sections =====

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      {/* Increased from max-w-xl to max-w-2xl for more comfortable layout */}
      <DialogContent className="max-w-2xl p-0" dir="rtl">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
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

            {/* ╔══════════════════════════════════════════════════════════════╗ */}
            {/* ║  SECTION 1 — PATIENT IDENTITY                               ║ */}
            {/* ╚══════════════════════════════════════════════════════════════╝ */}
            <section aria-label="بيانات المريض" className="space-y-2">
              <SectionLabel>بيانات المريض</SectionLabel>

              {/* ── Name field with patient search ─────────────────────────────── */}
              <div className="space-y-1">
                <Label className="text-xs">
                  الاسم الكامل *
                  {existingPatient && (
                    <Badge variant="outline" className="mr-2 text-xs text-green-700 border-green-300 bg-green-50">
                      <UserCheck className="h-3 w-3 ml-1" />
                      مريض مسجل — {existingPatient.patientCode}
                    </Badge>
                  )}
                </Label>

                {existingPatient ? (
                  /* Selected patient chip */
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-300 rounded-md text-sm">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="flex-1 font-medium truncate">{existingPatient.fullName}</span>
                    {existingPatient.patientCode && (
                      <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                        {existingPatient.patientCode}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleClearExistingPatient}
                      className="text-muted-foreground hover:text-destructive focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                      title="مسح وإدخال مريض آخر"
                      data-testid="button-clear-patient"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  /* Free-text search with keyboard navigation */
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={nameInputRef}
                      value={fullName}
                      onChange={e => { setFullName(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      onKeyDown={handleNameKeyDown}
                      placeholder="اكتب اسم المريض أو ابحث عن موجود..."
                      className="h-7 text-xs pr-7"
                      autoComplete="off"
                      autoFocus={!isEdit}
                      data-testid="input-patient-name"
                      aria-autocomplete="list"
                      aria-expanded={showSuggestList}
                      aria-controls={showSuggestList ? "patient-suggest-list" : undefined}
                      aria-activedescendant={
                        showSuggestList && highlightedIdx >= 0
                          ? `patient-suggest-${patientSuggestions[highlightedIdx]?.id}`
                          : undefined
                      }
                    />

                    {/* Suggestions dropdown */}
                    {showSuggestList && (
                      <div
                        id="patient-suggest-list"
                        role="listbox"
                        aria-label="مرضى مسجلون"
                        className="absolute z-50 w-full mt-0.5 border rounded-md bg-background shadow-lg max-h-44 overflow-y-auto"
                      >
                        <div className="px-2 py-1 text-xs text-muted-foreground bg-muted/40 border-b select-none">
                          مرضى مسجلون — اختر لربط الزيارة برقمه
                        </div>
                        {patientSuggestions.map((p, idx) => {
                          const isActive = highlightedIdx === idx;
                          return (
                            <button
                              key={p.id}
                              id={`patient-suggest-${p.id}`}
                              ref={el => { suggestItemsRef.current[idx] = el; }}
                              role="option"
                              aria-selected={isActive}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setHighlightedIdx(idx)}
                              onClick={() => handleSelectExistingPatient(p)}
                              className={[
                                "w-full text-right px-3 py-2 text-xs border-b last:border-0 flex items-center gap-2 transition-colors",
                                isActive
                                  ? "bg-primary/10 text-primary ring-inset ring-1 ring-primary/30"
                                  : "hover:bg-blue-50",
                              ].join(" ")}
                              data-testid={`patient-suggest-${p.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{p.fullName}</div>
                                {p.phone && <div className="text-muted-foreground font-mono">{p.phone}</div>}
                              </div>
                              {p.patientCode && (
                                <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                                  {p.patientCode}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setShowSuggestions(false)}
                          className="w-full text-right px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 italic border-t"
                        >
                          إضافة "{fullName}" كمريض جديد ↑↓ تنقل · Enter اختيار · Esc إغلاق
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── National ID · Age · Phone (3-col grid) ─────────────────────── */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <Label className="text-xs">التليفون</Label>
                  <Input
                    ref={phoneInputRef}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01xxxxxxxxx"
                    maxLength={11}
                    autoComplete="tel"
                    className="h-7 text-xs font-mono"
                    data-testid="input-patient-phone"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">السن</Label>
                  <Input
                    type="number" min={0} max={120} value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="—"
                    className="h-7 text-xs"
                    data-testid="input-patient-age"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الرقم القومي</Label>
                  <Input
                    value={nationalId}
                    onChange={e => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="14 رقم"
                    maxLength={14}
                    autoComplete="off"
                    className="h-7 text-xs font-mono"
                    data-testid="input-patient-nationalid"
                    dir="ltr"
                  />
                </div>
              </div>
            </section>

            {/* ╔══════════════════════════════════════════════════════════════╗ */}
            {/* ║  SECTION 2 — DUPLICATE DETECTION                            ║ */}
            {/* ╚══════════════════════════════════════════════════════════════╝ */}
            {!isEdit && !existingPatient && shouldCheckDup && (
              <section className="space-y-1">
                {dupChecking && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>جاري البحث عن مرضى مشابهين...</span>
                  </div>
                )}

                {/* BLOCK */}
                {!dupChecking && dupResult?.duplicateStatus === "block" && !dupDismissed && (
                  <div className="p-3 rounded-md border border-red-300 bg-red-50 space-y-2">
                    <div className="flex items-center gap-2 text-red-700">
                      <Lock className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">مريض مكرر — الإضافة محظورة</span>
                    </div>
                    <p className="text-xs text-red-600">{dupResult.recommendedAction}</p>
                    <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
                  </div>
                )}

                {/* WARNING */}
                {!dupChecking && dupResult?.duplicateStatus === "warning" && !dupDismissed && (
                  <div className="p-3 rounded-md border border-amber-300 bg-amber-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">تنبيه: مرضى مشابهون موجودون</span>
                      </div>
                      <button type="button" onClick={() => setDupDismissed(true)} className="text-muted-foreground hover:text-foreground" title="تجاهل التحذير">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-amber-700">{dupResult.recommendedAction}</p>
                    <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs text-amber-800">لإنشاء ملف جديد — اكتب سبب عدم التطابق *</Label>
                      <Input
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="مثال: نفس الاسم لكن شخص مختلف — الرقم القومي مختلف"
                        className="h-7 text-xs border-amber-400 focus:border-amber-500"
                        data-testid="input-dup-override-reason"
                      />
                    </div>
                  </div>
                )}

                {/* NONE — optional suggestions */}
                {!dupChecking && dupResult?.duplicateStatus === "none" && dupResult.candidates.length > 0 && !dupDismissed && (
                  <div className="p-2 rounded-md border border-blue-200 bg-blue-50 space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-700 text-xs">
                      <Info className="h-3 w-3" />
                      <span className="font-medium">مرضى قريبون — هل تقصد أحدهم؟</span>
                    </div>
                    <CandidateList candidates={dupResult.candidates.slice(0, 3)} onSelect={handleSelectExistingPatient} />
                  </div>
                )}
              </section>
            )}

            {/* ╔══════════════════════════════════════════════════════════════╗ */}
            {/* ║  SECTION 3 — PAYMENT TYPE                                   ║ */}
            {/* ╚══════════════════════════════════════════════════════════════╝ */}
            <section aria-label="نوع الدفع" className="space-y-2">
              <SectionLabel>نوع الدفع</SectionLabel>
              <div className="flex gap-2" role="group" aria-label="نوع الدفع">
                {PAYMENT_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={paymentType === value}
                    onClick={() => handlePaymentTypeChange(value)}
                    onKeyDown={e => handlePaymentKeyDown(e, value)}
                    className={[
                      "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-all",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                      paymentType === value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-input hover:bg-muted",
                    ].join(" ")}
                    data-testid={`button-payment-${value.toLowerCase()}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
                  </button>
                ))}
              </div>

              {paymentType === "INSURANCE" && (
                <div className="space-y-1">
                  <Label className="text-xs">شركة التأمين *</Label>
                  <Input
                    value={insuranceCo}
                    onChange={e => setInsuranceCo(e.target.value)}
                    placeholder="اسم شركة التأمين"
                    className="h-7 text-xs"
                    data-testid="input-insurance-company"
                  />
                </div>
              )}
              {paymentType === "CONTRACT" && (
                <div className="space-y-1">
                  <Label className="text-xs">الجهة المتعاقدة *</Label>
                  <Input
                    value={payerReference}
                    onChange={e => setPayerReference(e.target.value)}
                    placeholder="اسم الشركة أو الجهة"
                    className="h-7 text-xs"
                    data-testid="input-payer-reference"
                  />
                  <p className="text-xs text-muted-foreground px-1">سيتم إنشاء فاتورة آجلة بشروط التعاقد</p>
                </div>
              )}
            </section>

            {/* ╔══════════════════════════════════════════════════════════════╗ */}
            {/* ║  SECTION 4 — VISIT REASON                                   ║ */}
            {/* ╚══════════════════════════════════════════════════════════════╝ */}
            <section aria-label="سبب الزيارة" className="space-y-2">
              <SectionLabel>سبب الزيارة</SectionLabel>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="سبب الزيارة">
                {VISIT_TYPES.map(({ value, label, sub, Icon, color, bg, border }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={visitReason === value}
                    onClick={() => setVisitReason(v => v === value ? "" : value)}
                    className={[
                      "flex items-center gap-2 p-2.5 rounded-lg border-2 text-right transition-all",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                      visitReason === value
                        ? `${bg} ${border} shadow-sm`
                        : "bg-background border-border hover:bg-muted/50",
                    ].join(" ")}
                    data-testid={`visit-reason-${value}`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${visitReason === value ? color : "text-muted-foreground"}`} aria-hidden="true" />
                    <div className="text-right min-w-0">
                      <div className={`text-xs font-semibold leading-tight ${visitReason === value ? color : "text-foreground"}`}>{label}</div>
                      <div className="text-xs text-muted-foreground leading-tight truncate">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* ── Consultation details ──────────────────────────────────────── */}
              {visitReason === "consultation" && (
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-2">
                  <p className="text-xs font-medium text-blue-800 flex items-center gap-1">
                    <Stethoscope className="h-3.5 w-3.5" /> تفاصيل حجز الكشف
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs">العيادة</Label>
                    <ClinicLookup
                      value={selectedClinic?.id || ""}
                      onChange={item => { setSelectedClinic(item); setSelectedDoctor(null); }}
                      data-testid="lookup-clinic"
                    />
                  </div>
                  {selectedClinic && (
                    <div className="space-y-1">
                      <Label className="text-xs">الطبيب *</Label>
                      {schedules.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className="text-xs text-muted-foreground self-center">أطباء العيادة:</span>
                          {schedules.map(s => (
                            <button
                              key={s.doctorId} type="button"
                              onClick={() => setSelectedDoctor({ id: s.doctorId, name: s.doctorName })}
                              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 rounded px-2 py-0.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                              data-testid={`schedule-doctor-${s.doctorId}`}
                            >
                              د. {s.doctorName}
                            </button>
                          ))}
                        </div>
                      )}
                      <DoctorLookup
                        value={selectedDoctor?.id || ""}
                        displayValue={selectedDoctor?.name || ""}
                        onChange={setSelectedDoctor}
                        data-testid="lookup-consult-doctor"
                      />
                    </div>
                  )}
                  {selectedClinic && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">تاريخ الكشف</Label>
                        <Input type="date" value={consultDate} onChange={e => setConsultDate(e.target.value)} className="h-7 text-xs" data-testid="input-consult-date" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الوقت</Label>
                        <Input type="time" value={consultTime} onChange={e => setConsultTime(e.target.value)} className="h-7 text-xs" data-testid="input-consult-time" />
                      </div>
                    </div>
                  )}
                  {selectedClinic && (() => {
                    const fee = (selectedClinic.meta as any)?.consultationServiceBasePrice;
                    if (!fee) return null;
                    const feeNum = parseFloat(String(fee));
                    if (isNaN(feeNum) || feeNum <= 0) return null;
                    return (
                      <div className="flex items-center justify-between bg-white/80 border border-blue-200 rounded px-2 py-1.5">
                        <span className="text-xs text-blue-700 font-medium">رسوم الكشف</span>
                        <span className="text-xs font-bold text-blue-900" data-testid="text-consult-fee">
                          {feeNum.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Admission details ─────────────────────────────────────────── */}
              {visitReason === "admission" && (
                <div className="border border-green-200 rounded-lg p-3 bg-green-50/30 space-y-2">
                  <p className="text-xs font-medium text-green-800 flex items-center gap-1">
                    <Bed className="h-3.5 w-3.5" /> تفاصيل التسكين
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">الدور</Label>
                      <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                        <SelectTrigger className="h-7 text-xs" data-testid="select-floor"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>{floors.map(f => <SelectItem key={f.id} value={f.id}>{f.nameAr}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الغرفة</Label>
                      <Select value={selectedRoom} onValueChange={setSelectedRoom} disabled={!selectedFloor}>
                        <SelectTrigger className="h-7 text-xs" data-testid="select-room"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>{rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className={`text-xs ${selectedRoom && !selectedBed ? "text-red-600 font-medium" : ""}`}>
                        السرير {selectedRoom && !selectedBed && <span className="text-red-500">*</span>}
                      </Label>
                      <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedRoom}>
                        <SelectTrigger className={`h-7 text-xs ${selectedRoom && !selectedBed ? "border-red-400 ring-1 ring-red-400" : ""}`} data-testid="select-bed">
                          <SelectValue placeholder={selectedRoom && !selectedBed ? "مطلوب ⚠" : "اختر"} />
                        </SelectTrigger>
                        <SelectContent>
                          {beds.length === 0 && <SelectItem value="__none__" disabled>لا توجد أسرة فارغة</SelectItem>}
                          {beds.map(b => <SelectItem key={b.id} value={b.id}>{b.nameAr}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">الطبيب المعالج</Label>
                    <DoctorLookup
                      value={admDoctor?.id || ""}
                      displayValue={admDoctor?.name || ""}
                      onChange={setAdmDoctor}
                      data-testid="lookup-adm-doctor"
                    />
                  </div>

                  {/* Surgery type with keyboard navigation */}
                  <div className="space-y-1">
                    <Label className="text-xs">نوع العملية (اختياري)</Label>
                    <div className="relative">
                      <Input
                        value={surgerySearch}
                        onChange={e => {
                          setSurgerySearch(e.target.value);
                          setSelectedSurgery(null);
                          setHighlightedSurgery(0);
                          setShowSurgeryDrop(true);
                        }}
                        onFocus={() => setShowSurgeryDrop(true)}
                        onBlur={() => setTimeout(() => setShowSurgeryDrop(false), 150)}
                        onKeyDown={handleSurgeryKeyDown}
                        placeholder="ابحث عن عملية..."
                        autoComplete="off"
                        className="h-7 text-xs"
                        data-testid="input-surgery-search"
                        aria-autocomplete="list"
                        aria-expanded={showSurgeryDrop && surgeryTypesRaw.length > 0}
                      />

                      {showSurgeryDrop && surgerySearch.length >= 1 && surgeryTypesRaw.length > 0 && (
                        <div
                          role="listbox"
                          aria-label="أنواع العمليات"
                          className="absolute z-50 w-full mt-0.5 border rounded bg-background shadow-md max-h-28 overflow-y-auto"
                        >
                          {surgeryTypesRaw.map((s, idx) => {
                            const isActive = highlightedSurgery === idx;
                            return (
                              <button
                                key={s.id}
                                ref={el => { surgeryItemsRef.current[idx] = el; }}
                                role="option"
                                aria-selected={isActive}
                                type="button"
                                className={[
                                  "w-full text-right px-2 py-1 text-xs transition-colors",
                                  isActive ? "bg-primary/10 text-primary" : "hover:bg-muted",
                                ].join(" ")}
                                onMouseEnter={() => setHighlightedSurgery(idx)}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setSelectedSurgery(s); setSurgerySearch(s.nameAr); setShowSurgeryDrop(false); }}
                              >
                                {s.nameAr}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {selectedSurgery && (
                      <Badge variant="secondary" className="text-xs">{selectedSurgery.nameAr}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* ── Lab / Radiology details ───────────────────────────────────── */}
              {(visitReason === "lab" || visitReason === "radiology") && (
                <div className={`border rounded-lg p-3 space-y-2 ${visitReason === "lab" ? "border-purple-200 bg-purple-50/30" : "border-amber-200 bg-amber-50/30"}`}>
                  <p className={`text-xs font-medium flex items-center gap-1 ${visitReason === "lab" ? "text-purple-800" : "text-amber-800"}`}>
                    {visitReason === "lab"
                      ? <><FlaskConical className="h-3.5 w-3.5" /> تفاصيل طلب التحاليل</>
                      : <><Radiation className="h-3.5 w-3.5" /> تفاصيل طلب الأشعة</>}
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs">{visitReason === "lab" ? "التحاليل المطلوبة" : "الأشعة المطلوبة"}</Label>
                    <textarea
                      value={serviceNotes}
                      onChange={e => setServiceNotes(e.target.value)}
                      placeholder={visitReason === "lab" ? "مثال: صورة دم كاملة، وظائف كبد..." : "مثال: أشعة صدر، سونار بطن..."}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="textarea-service-notes"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground bg-white/70 border rounded px-2 py-1.5">
                    انتقل إلى <strong>{visitReason === "lab" ? "أوامر الخدمات" : "أوامر الأشعة"}</strong> لإنشاء الطلب الرسمي.
                  </p>
                </div>
              )}
            </section>

          </div>
        </ScrollArea>

        {/* ╔══════════════════════════════════════════════════════════════╗ */}
        {/* ║  ACTIONS                                                     ║ */}
        {/* ╚══════════════════════════════════════════════════════════════╝ */}
        <DialogFooter className="px-4 py-3 border-t gap-1">
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
