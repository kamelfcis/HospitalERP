/**
 * ReceptionPage — شاشة الاستقبال الرئيسية
 *
 * تتيح لموظف الاستقبال:
 * ① البحث عن مريض موجود أو تسجيل مريض جديد
 * ② اختيار نوع الزيارة (داخلي / خارجي)
 * ③ تحديد القسم والخدمة المطلوبة والملاحظات
 * ④ حفظ سجل الزيارة في patient_visits
 *
 * الجانب الأيمن: قائمة زيارات اليوم مع فلاتر
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Search, UserCheck, UserPlus, X, ClipboardList,
  BedDouble, Building2, CheckCircle2, FileText,
} from "lucide-react";
import { DepartmentLookup } from "@/components/lookups";

// ─── types ────────────────────────────────────────────────────────────────────

interface PatientResult {
  id: string;
  fullName: string;
  phone?: string | null;
  patientCode?: string | null;
  nationalId?: string | null;
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

// ─── constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 280;
const MIN_SEARCH  = 2;
const LIMIT       = 10;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open:        { label: "مفتوح",        cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "قيد التنفيذ",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:   { label: "مكتمل",        cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled:   { label: "ملغي",         cls: "bg-red-50 text-red-700 border-red-200" },
};

const VISIT_TYPE_LABELS: Record<string, string> = {
  outpatient: "خارجي (عيادة)",
  inpatient:  "داخلي (إقامة)",
};

// ─── sub-component: PatientChip ────────────────────────────────────────────

function PatientChip({ patient, onClear }: { patient: PatientResult; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 border border-green-200">
      <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-green-800 truncate">{patient.fullName}</div>
        {(patient.patientCode || patient.phone) && (
          <div className="text-xs text-green-600 flex gap-2">
            {patient.patientCode && <span>ملف: {patient.patientCode}</span>}
            {patient.phone && <span>{patient.phone}</span>}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-green-500 hover:text-green-700 shrink-0"
        data-testid="button-clear-patient"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── sub-component: VisitRow ───────────────────────────────────────────────

function VisitRow({ visit, onStatusChange }: {
  visit: VisitRecord;
  onStatusChange: (id: string, status: string) => void;
}) {
  const s = STATUS_LABEL[visit.status] ?? { label: visit.status, cls: "" };
  const time = new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-visit-${visit.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{visit.patient_name}</span>
          <Badge variant="outline" className={`text-xs px-1.5 ${visit.visit_type === "inpatient" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
            {visit.visit_type === "inpatient" ? "داخلي" : "خارجي"}
          </Badge>
          <Badge variant="outline" className={`text-xs px-1.5 ${s.cls}`}>{s.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
          <span className="font-mono">{visit.visit_number}</span>
          {visit.patient_code && <span>ملف: {visit.patient_code}</span>}
          {visit.department_name && <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{visit.department_name}</span>}
          {visit.requested_service && <span>• {visit.requested_service}</span>}
          <span>{time}</span>
        </div>
      </div>
      {visit.status === "open" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
          onClick={() => onStatusChange(visit.id, "completed")}
          data-testid={`button-complete-visit-${visit.id}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 me-1" />
          إتمام
        </Button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReceptionPage() {
  const { toast } = useToast();

  // ── form state ────────────────────────────────────────────────────────────
  const [patientSearch, setPatientSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch]     = useState("");
  const [selectedPatient, setSelectedPatient]     = useState<PatientResult | null>(null);
  const [showResults, setShowResults]             = useState(false);
  const [highlighted, setHighlighted]             = useState(-1);

  const [newPatientName, setNewPatientName]       = useState("");
  const [newPatientPhone, setNewPatientPhone]     = useState("");
  const [isCreatingNew, setIsCreatingNew]         = useState(false);

  const [visitType, setVisitType]                 = useState<"outpatient" | "inpatient">("outpatient");
  const [departmentId, setDepartmentId]           = useState("");
  const [requestedService, setRequestedService]   = useState("");
  const [notes, setNotes]                         = useState("");

  const [lastSavedVisit, setLastSavedVisit]       = useState<VisitRecord | null>(null);
  const [lastSavedPatient, setLastSavedPatient]   = useState<PatientResult | null>(null);

  // ── list filter state ─────────────────────────────────────────────────────
  const [listDate, setListDate]                   = useState(new Date().toISOString().split("T")[0]);
  const [listTypeFilter, setListTypeFilter]       = useState("__all__");
  const [listStatusFilter, setListStatusFilter]   = useState("__all__");
  const [listSearch, setListSearch]               = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  // ── debounce ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(patientSearch), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // ── patient search query ──────────────────────────────────────────────────
  const { data: patients = [], isFetching: patientsFetching } = useQuery<PatientResult[]>({
    queryKey: ["/api/patients", debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < MIN_SEARCH) return [];
      const r = await apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=${LIMIT}`);
      return r.json();
    },
    enabled: debouncedSearch.length >= MIN_SEARCH,
  });

  const showDropdown = showResults && !selectedPatient && debouncedSearch.length >= MIN_SEARCH;

  // ── visits list query ──────────────────────────────────────────────────────
  const visitsQueryKey = useMemo(() => {
    const params = new URLSearchParams({ date: listDate });
    if (listTypeFilter !== "__all__")   params.set("visitType", listTypeFilter);
    if (listStatusFilter !== "__all__") params.set("status", listStatusFilter);
    if (listSearch.trim())              params.set("search", listSearch.trim());
    return ["/api/patient-visits", params.toString()];
  }, [listDate, listTypeFilter, listStatusFilter, listSearch]);

  const { data: visits = [], isLoading: visitsLoading, refetch: refetchVisits } = useQuery<VisitRecord[]>({
    queryKey: visitsQueryKey,
    queryFn: async () => {
      const [, params] = visitsQueryKey as [string, string];
      const r = await apiRequest("GET", `/api/patient-visits?${params}`);
      return r.json();
    },
  });

  // ── create new patient mutation ────────────────────────────────────────────
  const createPatientMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/patients", {
        fullName: newPatientName.trim(),
        phone: newPatientPhone.trim() || undefined,
      });
      return r.json();
    },
    onSuccess: (data: PatientResult) => {
      setSelectedPatient(data);
      setIsCreatingNew(false);
      setNewPatientName("");
      setNewPatientPhone("");
      toast({ title: "تم إنشاء ملف المريض", description: data.fullName });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // ── save visit mutation ────────────────────────────────────────────────────
  const saveVisitMutation = useMutation({
    mutationFn: async ({ patientId, patient }: { patientId: string; patient: PatientResult | null }) => {
      const r = await apiRequest("POST", "/api/patient-visits", {
        patientId,
        visitType,
        departmentId: departmentId || undefined,
        requestedService: requestedService.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const visit = await r.json();
      return { visit, patient };
    },
    onSuccess: ({ visit, patient }) => {
      toast({ title: "تم تسجيل الزيارة", description: `رقم الزيارة: ${visit.visit_number}` });
      setLastSavedVisit(visit);
      setLastSavedPatient(patient);
      setSelectedPatient(null);
      setPatientSearch("");
      setDebouncedSearch("");
      setDepartmentId("");
      setRequestedService("");
      setNotes("");
      setVisitType("outpatient");
      queryClient.invalidateQueries({ queryKey: ["/api/patient-visits"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // ── status change mutation ─────────────────────────────────────────────────
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

  // ── handlers ──────────────────────────────────────────────────────────────
  const selectPatient = useCallback((p: PatientResult) => {
    setSelectedPatient(p);
    setPatientSearch("");
    setDebouncedSearch("");
    setShowResults(false);
    setHighlighted(-1);
  }, []);

  const clearPatient = useCallback(() => {
    setSelectedPatient(null);
    setPatientSearch("");
    setDebouncedSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(p => Math.min(p + 1, patients.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(p => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && highlighted >= 0 && highlighted < patients.length) {
      e.preventDefault(); selectPatient(patients[highlighted]);
    } else if (e.key === "Escape") { setShowResults(false); }
  }, [showDropdown, patients, highlighted, selectPatient]);

  const handleSubmit = useCallback(async () => {
    if (!selectedPatient) return;
    saveVisitMutation.mutate({ patientId: selectedPatient.id, patient: selectedPatient });
  }, [selectedPatient, saveVisitMutation]);

  const handleCreateNew = useCallback(() => {
    if (!newPatientName.trim()) {
      toast({ title: "يجب إدخال اسم المريض", variant: "destructive" });
      return;
    }
    createPatientMutation.mutateAsync().then((patient: PatientResult) => {
      saveVisitMutation.mutate({ patientId: patient.id, patient });
    }).catch(() => {});
  }, [newPatientName, createPatientMutation, saveVisitMutation, toast]);

  const todayCounts = useMemo(() => {
    return {
      total:      visits.length,
      inpatient:  visits.filter(v => v.visit_type === "inpatient").length,
      outpatient: visits.filter(v => v.visit_type === "outpatient").length,
      open:       visits.filter(v => v.status === "open").length,
    };
  }, [visits]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          الاستقبال
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">تسجيل زيارات المرضى — {new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ══ LEFT: Registration Form ══════════════════════════════════════ */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                تسجيل زيارة جديدة
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">

              {/* Patient search */}
              {!selectedPatient && !isCreatingNew && (
                <div className="flex flex-col gap-1.5">
                  <Label>البحث عن مريض</Label>
                  <div className="relative">
                    <Input
                      ref={searchRef}
                      value={patientSearch}
                      onChange={e => { setPatientSearch(e.target.value); setShowResults(true); setHighlighted(-1); }}
                      onFocus={() => setShowResults(true)}
                      onKeyDown={handleKeyDown}
                      placeholder="اسم المريض / رقم الملف / الهاتف…"
                      data-testid="input-patient-search"
                      autoComplete="off"
                    />
                    {patientsFetching && (
                      <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!patientsFetching && patientSearch && (
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    )}

                    {/* Dropdown results */}
                    {showDropdown && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto" role="listbox">
                        {patients.length === 0 && !patientsFetching && (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            لا توجد نتائج
                            <Button
                              variant="link"
                              size="sm"
                              className="text-primary px-1"
                              onClick={() => { setIsCreatingNew(true); setNewPatientName(patientSearch); setShowResults(false); }}
                              data-testid="button-create-new-patient"
                            >
                              — إنشاء مريض جديد
                            </Button>
                          </div>
                        )}
                        {patients.map((p, idx) => (
                          <div
                            key={p.id}
                            id={`patient-opt-${p.id}`}
                            role="option"
                            aria-selected={highlighted === idx}
                            className={`px-3 py-2 cursor-pointer text-sm hover:bg-accent transition-colors ${highlighted === idx ? "bg-accent" : ""}`}
                            onMouseDown={() => selectPatient(p)}
                            data-testid={`patient-option-${p.id}`}
                          >
                            <div className="font-medium">{p.fullName}</div>
                            {(p.patientCode || p.phone) && (
                              <div className="text-xs text-muted-foreground flex gap-2">
                                {p.patientCode && <span>ملف: {p.patientCode}</span>}
                                {p.phone && <span>{p.phone}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-xs text-muted-foreground hover:text-primary gap-1"
                    onClick={() => setIsCreatingNew(true)}
                    data-testid="button-register-new"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    تسجيل مريض جديد
                  </Button>
                </div>
              )}

              {/* New patient form */}
              {isCreatingNew && !selectedPatient && (
                <div className="flex flex-col gap-3 p-3 rounded-md bg-muted/40 border">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">بيانات المريض الجديد</Label>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNew(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div>
                      <Label htmlFor="new-name" className="text-xs">الاسم الكامل *</Label>
                      <Input
                        id="new-name"
                        value={newPatientName}
                        onChange={e => setNewPatientName(e.target.value)}
                        placeholder="اسم المريض"
                        data-testid="input-new-patient-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-phone" className="text-xs">رقم الهاتف</Label>
                      <Input
                        id="new-phone"
                        value={newPatientPhone}
                        onChange={e => setNewPatientPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        data-testid="input-new-patient-phone"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Selected patient chip */}
              {selectedPatient && <PatientChip patient={selectedPatient} onClear={clearPatient} />}

              <Separator />

              {/* Visit type */}
              <div className="flex flex-col gap-1.5">
                <Label>نوع الزيارة *</Label>
                <div className="flex gap-2">
                  {(["outpatient", "inpatient"] as const).map(vt => (
                    <button
                      key={vt}
                      type="button"
                      onClick={() => setVisitType(vt)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md border text-sm font-medium transition-colors ${visitType === vt ? (vt === "inpatient" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-teal-50 border-teal-300 text-teal-700") : "bg-background border-border text-muted-foreground hover:bg-muted/50"}`}
                      data-testid={`button-visit-type-${vt}`}
                    >
                      {vt === "inpatient" ? <BedDouble className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                      {VISIT_TYPE_LABELS[vt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <Label>القسم</Label>
                <DepartmentLookup
                  value={departmentId}
                  onChange={item => setDepartmentId(item?.id ?? "")}
                  placeholder="اختر القسم (اختياري)"
                />
              </div>

              {/* Requested service */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-service">الخدمة المطلوبة</Label>
                <Input
                  id="req-service"
                  value={requestedService}
                  onChange={e => setRequestedService(e.target.value)}
                  placeholder="مثال: كشف عيادة، أشعة، تحاليل…"
                  data-testid="input-requested-service"
                />
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية…"
                  rows={2}
                  data-testid="input-notes"
                />
              </div>

              {/* ── نجاح الحفظ: لوحة العمليات السريعة ── */}
              {lastSavedVisit && lastSavedPatient && (
                <div className="flex flex-col gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 text-green-800 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>تم تسجيل {lastSavedVisit.visit_number}</span>
                    <button
                      type="button"
                      onClick={() => { setLastSavedVisit(null); setLastSavedPatient(null); }}
                      className="mr-auto text-green-600 hover:text-green-800"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-green-700">
                    {lastSavedPatient.fullName}
                    {lastSavedVisit.visit_type === "outpatient" ? " — زيارة خارجية" : " — زيارة داخلية"}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {lastSavedVisit.visit_type === "outpatient" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                        data-testid="button-open-invoice-from-visit"
                        onClick={() => {
                          const params = new URLSearchParams({
                            initVisitId: lastSavedVisit.id,
                            initPatientId: lastSavedPatient.id,
                          });
                          if (lastSavedVisit.department_name) {
                            params.set("initDeptName", lastSavedVisit.department_name);
                          }
                          window.location.href = `/patient-invoices?${params.toString()}`;
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        فتح فاتورة خارجية
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Submit */}
              {isCreatingNew ? (
                <Button
                  onClick={handleCreateNew}
                  disabled={!newPatientName.trim() || createPatientMutation.isPending || saveVisitMutation.isPending}
                  className="w-full"
                  data-testid="button-create-and-save"
                >
                  {(createPatientMutation.isPending || saveVisitMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                  إنشاء المريض وتسجيل الزيارة
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedPatient || saveVisitMutation.isPending}
                  className="w-full"
                  data-testid="button-save-visit"
                >
                  {saveVisitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                  تسجيل الزيارة
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ RIGHT: Today's Visits ════════════════════════════════════════ */}
        <div className="lg:col-span-3 flex flex-col gap-4">

          {/* Stat badges */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: "إجمالي اليوم", value: todayCounts.total,     cls: "bg-slate-50 border-slate-200 text-slate-700" },
              { label: "خارجي",         value: todayCounts.outpatient, cls: "bg-teal-50 border-teal-200 text-teal-700" },
              { label: "داخلي",         value: todayCounts.inpatient,  cls: "bg-indigo-50 border-indigo-200 text-indigo-700" },
              { label: "مفتوح",         value: todayCounts.open,       cls: "bg-amber-50 border-amber-200 text-amber-700" },
            ].map(s => (
              <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium ${s.cls}`}>
                <span>{s.label}</span>
                <span className="font-bold">{s.value}</span>
              </div>
            ))}
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">زيارات اليوم</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="date"
                    value={listDate}
                    onChange={e => setListDate(e.target.value)}
                    className="h-8 text-sm w-36"
                    data-testid="input-list-date"
                  />
                  <Select value={listTypeFilter} onValueChange={setListTypeFilter}>
                    <SelectTrigger className="h-8 text-sm w-28" data-testid="select-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">الكل</SelectItem>
                      <SelectItem value="outpatient">خارجي</SelectItem>
                      <SelectItem value="inpatient">داخلي</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
                    <SelectTrigger className="h-8 text-sm w-32" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">كل الحالات</SelectItem>
                      <SelectItem value="open">مفتوح</SelectItem>
                      <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={listSearch}
                    onChange={e => setListSearch(e.target.value)}
                    placeholder="بحث…"
                    className="h-8 text-sm w-32"
                    data-testid="input-list-search"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {visitsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visits.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  لا توجد زيارات لهذا اليوم
                </div>
              ) : (
                <div>
                  {visits.map(v => (
                    <VisitRow
                      key={v.id}
                      visit={v}
                      onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
