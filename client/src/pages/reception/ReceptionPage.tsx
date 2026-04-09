import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, UserCheck, UserPlus, X, ClipboardList,
  Stethoscope, Bed, FlaskConical, Radiation,
  Building2, CheckCircle2, Banknote, ShieldCheck, FileSignature,
  AlertTriangle, Lock, Info, Printer, RefreshCw, Filter, Clock,
  Users, Activity, ChevronDown,
} from "lucide-react";
import { ClinicLookup, DoctorLookup, DepartmentLookup } from "@/components/lookups";
import type { LookupItem } from "@/lib/lookupTypes";
import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
import { useContractResolution } from "@/pages/patients/hooks/useContractResolution";
import { ContractMemberLookup } from "@/pages/patients/components/ContractMemberLookup";

type VisitReason = "" | "consultation" | "admission" | "lab" | "radiology";
type PaymentKind = "CASH" | "INSURANCE" | "CONTRACT";

interface PatientSuggest {
  id: string;
  fullName: string;
  patientCode?: string | null;
  phone?: string | null;
  age?: number | null;
  nationalId?: string | null;
}

interface DuplicateCandidate {
  patientId: string;
  patientCode: string | null;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  score: number;
  reasons: string[];
}

interface DuplicateCheckResult {
  duplicateStatus: "none" | "warning" | "block";
  candidates: DuplicateCandidate[];
  recommendedAction: string;
}

interface VisitRecord {
  id: string;
  visit_number: string;
  patient_name: string;
  patient_code: string;
  patient_phone?: string;
  visit_type: "inpatient" | "outpatient";
  requested_service?: string | null;
  department_name?: string | null;
  status: string;
  notes?: string | null;
  created_at: string;
}

interface ScheduleOption { doctorId: string; doctorName: string; }
interface FloorOption { id: string; nameAr: string; rooms: RoomOption[]; }
interface RoomOption { id: string; nameAr: string; beds: BedOption[]; }
interface BedOption { id: string; nameAr: string; status: string; }
interface SurgeryType { id: string; nameAr: string; }

const todayISO = new Date().toISOString().slice(0, 10);

const VISIT_TYPES: { value: VisitReason; label: string; sub: string; Icon: any; color: string; bg: string; border: string; activeRing: string }[] = [
  { value: "consultation", label: "كشف عيادة", sub: "حجز في طابور العيادة", Icon: Stethoscope, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300", activeRing: "ring-blue-400" },
  { value: "admission", label: "تسكين / إقامة", sub: "تسكين على سرير بالمستشفى", Icon: Bed, color: "text-green-700", bg: "bg-green-50", border: "border-green-300", activeRing: "ring-green-400" },
  { value: "lab", label: "تحاليل", sub: "طلب تحاليل مختبر", Icon: FlaskConical, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300", activeRing: "ring-purple-400" },
  { value: "radiology", label: "أشعة", sub: "طلب أشعة تشخيصية", Icon: Radiation, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", activeRing: "ring-amber-400" },
];

const PAYMENT_TYPES: { value: PaymentKind; label: string; Icon: any }[] = [
  { value: "CASH", label: "نقدي", Icon: Banknote },
  { value: "INSURANCE", label: "تأمين", Icon: ShieldCheck },
  { value: "CONTRACT", label: "تعاقد", Icon: FileSignature },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "مفتوح", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "قيد التنفيذ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "مكتمل", cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "ملغي", cls: "bg-red-50 text-red-700 border-red-200" },
};

const DEBOUNCE_MS = 280;

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1 pb-0.5 border-b select-none">
      {children}
    </p>
  );
}

const CandidateList = memo(function CandidateList({ candidates, onSelect }: { candidates: DuplicateCandidate[]; onSelect: (p: PatientSuggest) => void }) {
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
            data-testid={`button-use-candidate-${c.patientId}`}
          >
            استخدام
          </button>
        </div>
      ))}
    </div>
  );
});

const VisitRow = memo(function VisitRow({ visit, onComplete }: {
  visit: VisitRecord;
  onComplete: (id: string) => void;
}) {
  const s = STATUS_LABEL[visit.status] ?? { label: visit.status, cls: "" };
  const time = new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-visit-${visit.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{visit.patient_name}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${visit.visit_type === "inpatient" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
            {visit.visit_type === "inpatient" ? "داخلي" : "خارجي"}
          </Badge>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${s.cls}`}>{s.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
          <span className="font-mono">{visit.visit_number}</span>
          {visit.patient_code && <span>ملف: {visit.patient_code}</span>}
          {visit.department_name && <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{visit.department_name}</span>}
          {visit.requested_service && <span>• {visit.requested_service}</span>}
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{time}</span>
        </div>
      </div>
      {visit.status === "open" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
          onClick={() => onComplete(visit.id)}
          data-testid={`button-complete-visit-${visit.id}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 me-1" />
          إتمام
        </Button>
      )}
    </div>
  );
});

const StatCard = memo(function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
});

export default function ReceptionPage() {
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
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
    setAge(p.age != null ? String(p.age) : "");
    setShowSuggestions(false);
    setTimeout(() => phoneInputRef.current?.focus(), 50);
  }, []);

  const handleClearExistingPatient = useCallback(() => {
    setExistingPatient(null);
    setFullName(""); setPhone(""); setNationalId(""); setAge("");
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
    setFullName(""); setPhone(""); setNationalId(""); setAge("");
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

  function validate(): boolean {
    if (!fullName.trim()) { toast({ title: "اسم المريض مطلوب", variant: "destructive" }); return false; }
    if (phone && !/^\d{11}$/.test(phone)) { toast({ title: "التليفون يجب أن يكون 11 رقم", variant: "destructive" }); return false; }
    if (nationalId && !/^\d{14}$/.test(nationalId)) { toast({ title: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" }); return false; }
    if (!visitReason) { toast({ title: "يرجى اختيار سبب الزيارة", variant: "destructive" }); return false; }
    if (paymentType === "INSURANCE") {
      const cardEntered = resolution.state.cardNumber.trim().length > 0;
      if (cardEntered && !resolution.state.resolved) { toast({ title: "رقم بطاقة التأمين غير صالح", variant: "destructive" }); return false; }
      if (!resolution.state.resolved && !insuranceCo.trim()) { toast({ title: "الرجاء إدخال بطاقة التأمين أو اسم شركة التأمين", variant: "destructive" }); return false; }
    }
    if (paymentType === "CONTRACT" && visitReason === "consultation" && !resolution.state.resolved) {
      toast({ title: "يجب تحديد بطاقة المنتسب لحجوزات التعاقد", variant: "destructive" }); return false;
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
      age: age !== "" ? parseInt(age, 10) : null,
      isActive: true,
    };

    if (visitReason === "admission" && selectedBed) {
      const admPaymentType = paymentType === "CONTRACT" ? "contract" : paymentType === "INSURANCE" ? "insurance" : "CASH";
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName: fullName.trim(),
          patientPhone: phone || undefined,
          patientId: existingPatient?.id || undefined,
          doctorName: admDoctor?.name || undefined,
          surgeryTypeId: selectedSurgery?.id || undefined,
          paymentType: admPaymentType,
          insuranceCompany: paymentType !== "CASH" ? ((resolution.state.resolved?.companyName) ?? (insuranceCo || undefined)) : undefined,
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

                <section className="space-y-2">
                  <SectionLabel>بيانات المريض</SectionLabel>
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
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-300 rounded-md text-sm">
                        <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="flex-1 font-medium truncate">{existingPatient.fullName}</span>
                        {existingPatient.patientCode && (
                          <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                            {existingPatient.patientCode}
                          </span>
                        )}
                        <button
                          type="button" onClick={handleClearExistingPatient}
                          className="text-muted-foreground hover:text-destructive focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                          data-testid="button-clear-patient"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
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
                          className="h-8 text-xs pr-7"
                          autoComplete="off"
                          autoFocus
                          data-testid="input-patient-name"
                          aria-autocomplete="list"
                          aria-expanded={showSuggestList}
                        />
                        {showSuggestList && (
                          <div className="absolute z-50 w-full mt-0.5 border rounded-md bg-background shadow-lg max-h-44 overflow-y-auto">
                            <div className="px-2 py-1 text-xs text-muted-foreground bg-muted/40 border-b select-none">
                              مرضى مسجلون — اختر لربط الزيارة · ↑↓ تنقل · Enter اختيار
                            </div>
                            {patientSuggestions.map((p, idx) => {
                              const isActive = highlightedIdx === idx;
                              return (
                                <button
                                  key={p.id}
                                  ref={el => { suggestItemsRef.current[idx] = el; }}
                                  role="option" aria-selected={isActive} type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onMouseEnter={() => setHighlightedIdx(idx)}
                                  onClick={() => handleSelectExistingPatient(p)}
                                  className={`w-full text-right px-3 py-2 text-xs border-b last:border-0 flex items-center gap-2 transition-colors ${isActive ? "bg-primary/10 text-primary ring-inset ring-1 ring-primary/30" : "hover:bg-blue-50"}`}
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
                              type="button" onMouseDown={e => e.preventDefault()}
                              onClick={() => setShowSuggestions(false)}
                              className="w-full text-right px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 italic border-t"
                            >
                              إضافة "{fullName}" كمريض جديد
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">التليفون</Label>
                      <Input
                        ref={phoneInputRef}
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="01xxxxxxxxx"
                        maxLength={11}
                        className="h-7 text-xs font-mono" dir="ltr"
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
                        className="h-7 text-xs font-mono" dir="ltr"
                        data-testid="input-patient-nationalid"
                      />
                    </div>
                  </div>
                </section>

                {shouldCheckDup && (
                  <section className="space-y-1">
                    {dupChecking && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>جاري البحث عن مرضى مشابهين...</span>
                      </div>
                    )}
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
                    {!dupChecking && dupResult?.duplicateStatus === "warning" && !dupDismissed && (
                      <div className="p-3 rounded-md border border-amber-300 bg-amber-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold">تنبيه: مرضى مشابهون</span>
                          </div>
                          <button type="button" onClick={() => setDupDismissed(true)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-amber-700">{dupResult.recommendedAction}</p>
                        <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
                        <div className="space-y-1 pt-1">
                          <Label className="text-xs text-amber-800">لإنشاء ملف جديد — اكتب السبب *</Label>
                          <Input
                            value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                            placeholder="مثال: نفس الاسم لكن شخص مختلف"
                            className="h-7 text-xs border-amber-400"
                            data-testid="input-dup-override-reason"
                          />
                        </div>
                      </div>
                    )}
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

                <section className="space-y-2">
                  <SectionLabel>نوع الدفع</SectionLabel>
                  <div className="flex gap-2" role="group" aria-label="نوع الدفع">
                    {PAYMENT_TYPES.map(({ value, label, Icon }) => (
                      <button
                        key={value} type="button" aria-pressed={paymentType === value}
                        onClick={() => handlePaymentTypeChange(value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${paymentType === value ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-input hover:bg-muted"}`}
                        data-testid={`button-payment-${value.toLowerCase()}`}
                      >
                        <Icon className="h-3.5 w-3.5" />{label}
                      </button>
                    ))}
                  </div>
                  {paymentType === "INSURANCE" && (
                    <div className="space-y-2">
                      <ContractMemberLookup paymentType="INSURANCE" resolution={resolution} appointmentDate={consultDate} />
                      {!resolution.state.resolved && (
                        <div className="space-y-1">
                          <Label className="text-xs">اسم شركة التأمين (بديل)</Label>
                          <Input value={insuranceCo} onChange={e => setInsuranceCo(e.target.value)} placeholder="شركة التأمين" className="h-7 text-xs" data-testid="input-insurance-company" />
                        </div>
                      )}
                    </div>
                  )}
                  {paymentType === "CONTRACT" && (
                    <ContractMemberLookup paymentType="CONTRACT" resolution={resolution} appointmentDate={consultDate} />
                  )}
                </section>

                <section className="space-y-2">
                  <SectionLabel>سبب الزيارة *</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {VISIT_TYPES.map(vt => {
                      const active = visitReason === vt.value;
                      return (
                        <button
                          key={vt.value} type="button"
                          onClick={() => { setVisitReason(vt.value as VisitReason); if (vt.value !== "consultation") { setSelectedClinic(null); setSelectedDoctor(null); } if (vt.value !== "admission") { setSelectedFloor(""); setSelectedRoom(""); setSelectedBed(""); setAdmDoctor(null); setSurgerySearch(""); setSelectedSurgery(null); } }}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border text-right transition-all focus:outline-none focus-visible:ring-2 ${active ? `${vt.bg} ${vt.border} ${vt.color} ring-2 ${vt.activeRing} shadow-sm` : "bg-background border-input hover:bg-muted/50 text-muted-foreground"}`}
                          data-testid={`button-visit-${vt.value}`}
                        >
                          <vt.Icon className={`h-5 w-5 shrink-0 ${active ? vt.color : ""}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{vt.label}</div>
                            <div className="text-[10px] opacity-70">{vt.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {visitReason === "consultation" && (
                  <section className="border border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-2">
                    <p className="text-xs font-medium text-blue-800 flex items-center gap-1">
                      <Stethoscope className="h-3.5 w-3.5" /> تفاصيل حجز الكشف
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">العيادة *</Label>
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
                                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 rounded px-2 py-0.5 transition-colors"
                                data-testid={`schedule-doctor-${s.doctorId}`}
                              >
                                د. {s.doctorName}
                              </button>
                            ))}
                          </div>
                        )}
                        <DoctorLookup value={selectedDoctor?.id || ""} displayValue={selectedDoctor?.name || ""} onChange={setSelectedDoctor} data-testid="lookup-consult-doctor" />
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
                  </section>
                )}

                {visitReason === "admission" && (
                  <section className="border border-green-200 rounded-lg p-3 bg-green-50/30 space-y-2">
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
                      <DoctorLookup value={admDoctor?.id || ""} displayValue={admDoctor?.name || ""} onChange={setAdmDoctor} data-testid="lookup-adm-doctor" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">نوع العملية (اختياري)</Label>
                      <div className="relative">
                        <Input
                          value={surgerySearch}
                          onChange={e => { setSurgerySearch(e.target.value); setSelectedSurgery(null); setHighlightedSurgery(0); setShowSurgeryDrop(true); }}
                          onFocus={() => setShowSurgeryDrop(true)}
                          onBlur={() => setTimeout(() => setShowSurgeryDrop(false), 150)}
                          onKeyDown={handleSurgeryKeyDown}
                          placeholder="ابحث عن عملية..."
                          autoComplete="off" className="h-7 text-xs"
                          data-testid="input-surgery-search"
                        />
                        {showSurgeryDrop && surgerySearch.length >= 1 && surgeryTypesRaw.length > 0 && (
                          <div className="absolute z-50 w-full mt-0.5 border rounded bg-background shadow-md max-h-28 overflow-y-auto">
                            {surgeryTypesRaw.map((s, idx) => {
                              const isActive = highlightedSurgery === idx;
                              return (
                                <button
                                  key={s.id}
                                  ref={el => { surgeryItemsRef.current[idx] = el; }}
                                  role="option" aria-selected={isActive} type="button"
                                  className={`w-full text-right px-2 py-1 text-xs transition-colors ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
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
                      {selectedSurgery && <Badge variant="secondary" className="text-xs">{selectedSurgery.nameAr}</Badge>}
                    </div>
                  </section>
                )}

                {(visitReason === "lab" || visitReason === "radiology") && (
                  <section className={`border rounded-lg p-3 space-y-2 ${visitReason === "lab" ? "border-purple-200 bg-purple-50/30" : "border-amber-200 bg-amber-50/30"}`}>
                    <p className={`text-xs font-medium flex items-center gap-1 ${visitReason === "lab" ? "text-purple-800" : "text-amber-800"}`}>
                      {visitReason === "lab"
                        ? <><FlaskConical className="h-3.5 w-3.5" /> تفاصيل طلب التحاليل</>
                        : <><Radiation className="h-3.5 w-3.5" /> تفاصيل طلب الأشعة</>}
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">{visitReason === "lab" ? "التحاليل المطلوبة" : "الأشعة المطلوبة"}</Label>
                      <textarea
                        value={serviceNotes} onChange={e => setServiceNotes(e.target.value)}
                        placeholder={visitReason === "lab" ? "مثال: صورة دم كاملة، وظائف كبد..." : "مثال: أشعة صدر، سونار بطن..."}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="textarea-service-notes"
                      />
                    </div>
                  </section>
                )}

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

        <div className="lg:col-span-5 xl:col-span-5 flex flex-col min-h-0">
          <div className="border rounded-xl bg-card shadow-sm flex flex-col flex-1 min-h-0">
            <div className="px-4 py-3 border-b">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">زيارات اليوم</span>
                <Badge variant="outline" className="text-[10px]">{visits.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[120px]">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={listSearch} onChange={e => setListSearch(e.target.value)}
                    placeholder="بحث..."
                    className="h-7 text-xs pr-7"
                    data-testid="input-visit-search"
                  />
                </div>
                <Input type="date" value={listDate} onChange={e => setListDate(e.target.value)} className="h-7 text-xs w-[120px]" data-testid="input-visit-date" />
                <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
                  <SelectTrigger className="h-7 text-xs w-[90px]" data-testid="select-visit-status">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">الكل</SelectItem>
                    <SelectItem value="open">مفتوح</SelectItem>
                    <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                    <SelectItem value="completed">مكتمل</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={listTypeFilter} onValueChange={setListTypeFilter}>
                  <SelectTrigger className="h-7 text-xs w-[90px]" data-testid="select-visit-type">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">الكل</SelectItem>
                    <SelectItem value="outpatient">خارجي</SelectItem>
                    <SelectItem value="inpatient">داخلي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScrollArea className="flex-1">
              {visitsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">لا توجد زيارات</p>
                </div>
              ) : (
                visits.map(v => (
                  <VisitRow key={v.id} visit={v} onComplete={handleComplete} />
                ))
              )}
            </ScrollArea>
          </div>
        </div>

      </div>
    </div>
  );
}
