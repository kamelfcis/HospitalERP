/**
 * ReceptionSheet — نافذة استقبال المريض للسرير (inpatient admission)
 *
 * تُفتح من شاشة لوحة الأسرة عند الضغط على سرير فارغ.
 * ترسل POST /api/beds/:id/admit ببيانات المريض والزيارة.
 *
 * ملاحظات هيكلية:
 *  - لوحة المفاتيح: بحث المريض يدعم ↑↓ Enter للاختيار
 *  - Debounce 300ms على البحث لتقليل الطلبات
 *  - تخطيط ثنائي الأعمدة للقسم والطبيب
 *  - لا تعديل في payload شكل البيانات أو عقد الـ API
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { DoctorLookup, DepartmentLookup } from "@/components/lookups";
import { Tag, UserCheck, Search, Loader2 } from "lucide-react";
import type { SurgeryType } from "@shared/schema";
import { surgeryCategoryLabels } from "@shared/schema";
import type { BedData } from "../types";
import type { LookupItem } from "@/lib/lookupTypes";

// ===== Types =====

// Extended locally (API returns these fields; only id+fullName+phone are in the bed-board Patient interface)
interface PatientResult {
  id:           string;
  fullName:     string;
  phone?:       string;
  patientCode?: string;
  nationalId?:  string;
}

interface Props {
  open: boolean;
  bed:  BedData | null;
  onClose: () => void;
}

// ===== Constants =====

const DEBOUNCE_MS = 300;

// ===== Sub-components =====

// ── Payment type toggle ───────────────────────────────────────────────────────
function PaymentToggle({
  value,
  onChange,
}: {
  value:    "cash" | "contract";
  onChange: (v: "cash" | "contract") => void;
}) {
  const base     = "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors";
  const active   = "bg-primary text-primary-foreground border-primary";
  const inactive = "bg-background text-foreground border-border hover:bg-muted";
  return (
    <div className="flex gap-2" data-testid="payment-type-toggle">
      <button
        type="button"
        data-testid="payment-type-cash"
        onClick={() => onChange("cash")}
        className={`${base} ${value === "cash" ? active : inactive}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
        نقدي
      </button>
      <button
        type="button"
        data-testid="payment-type-insurance"
        onClick={() => onChange("contract")}
        className={`${base} ${value === "contract" ? active : inactive}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        تأمين
      </button>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 pb-0.5 border-b">
      {children}
    </p>
  );
}

// ===== Main Component =====

export function ReceptionSheet({ open, bed, onClose }: Props) {
  const { toast } = useToast();

  // ===== Local State =====
  const [patientSearch,    setPatientSearch]    = useState("");
  const [debouncedSearch,  setDebouncedSearch]  = useState("");
  const [patientName,      setPatientName]      = useState("");
  const [patientPhone,     setPatientPhone]     = useState("");
  const [selectedPatient,  setSelectedPatient]  = useState<PatientResult | null>(null);
  const [departmentId,     setDepartmentId]     = useState("");
  const [selectedDoctor,   setSelectedDoctor]   = useState<LookupItem | null>(null);
  const [surgerySearch,    setSurgerySearch]    = useState("");
  const [selectedSurgery,  setSelectedSurgery]  = useState<SurgeryType | null>(null);
  const [showSurgeryDrop,  setShowSurgeryDrop]  = useState(false);
  const [notes,            setNotes]            = useState("");
  const [paymentType,      setPaymentType]      = useState<"cash" | "contract">("cash");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [highlightedIdx,   setHighlightedIdx]   = useState(-1);

  // ===== Refs =====
  const searchInputRef  = useRef<HTMLInputElement>(null);
  const debounceTimer   = useRef<ReturnType<typeof setTimeout>>();
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // ===== Effects =====

  // Auto-focus patient search when sheet opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search: update debouncedSearch 300ms after typing stops
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(patientSearch), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [patientSearch]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIdx(0);
  }, [debouncedSearch]);

  // ===== Data Fetching =====

  const { data: patients = [], isFetching: patientsFetching } = useQuery<PatientResult[]>({
    queryKey: ["/api/patients", debouncedSearch],
    queryFn: () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=10`)
        .then(r => r.json()),
    enabled: debouncedSearch.length >= 2 && !selectedPatient,
    staleTime: 30_000,
  });

  const { data: surgeries = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn: () =>
      apiRequest("GET", `/api/surgery-types?search=${encodeURIComponent(surgerySearch)}`)
        .then(r => r.json()),
    enabled: surgerySearch.length >= 1,
  });

  // ===== Derived Values =====

  const showPatientResults = !selectedPatient && debouncedSearch.length >= 2 && patients.length > 0;
  const effectiveName      = selectedPatient?.fullName || patientName;
  const hasRoomService     = !!(bed?.roomServiceId);
  const canSubmit          = effectiveName.trim() &&
                             !(paymentType === "contract" && !insuranceCompany.trim());

  // ===== Handlers =====

  const selectPatient = useCallback((p: PatientResult) => {
    setSelectedPatient(p);
    setPatientSearch("");
    setDebouncedSearch("");
    setHighlightedIdx(-1);
  }, []);

  const handleClose = useCallback(() => {
    setPatientSearch("");
    setDebouncedSearch("");
    setPatientName("");
    setPatientPhone("");
    setSelectedPatient(null);
    setDepartmentId("");
    setSelectedDoctor(null);
    setSurgerySearch("");
    setSelectedSurgery(null);
    setShowSurgeryDrop(false);
    setNotes("");
    setPaymentType("cash");
    setInsuranceCompany("");
    setHighlightedIdx(-1);
    onClose();
  }, [onClose]);

  // Keyboard navigation for patient search results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPatientResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, patients.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < patients.length) {
        selectPatient(patients[highlightedIdx]);
      }
    } else if (e.key === "Escape") {
      setPatientSearch("");
    }
  };

  // ===== Mutation =====

  const admitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${bed!.id}/admit`, {
        patientName:      selectedPatient?.fullName || patientName,
        patientPhone:     selectedPatient?.phone    || patientPhone || undefined,
        departmentId:     departmentId              || undefined,
        doctorName:       selectedDoctor?.name      || undefined,
        notes:            notes                     || undefined,
        paymentType,
        insuranceCompany: paymentType === "contract" ? insuranceCompany || undefined : undefined,
        surgeryTypeId:    selectedSurgery?.id        || undefined,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      const desc = selectedSurgery
        ? "تمت إضافة بند الإقامة وفتح غرفة العمليات فوراً"
        : "تمت إضافة بند الإقامة فوراً للفاتورة";
      toast({ title: "تم الاستقبال", description: desc });
      handleClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل الاستقبال" });
    },
  });

  // ===== Render =====

  return (
    <Sheet open={open} onOpenChange={v => !v && handleClose()}>
      {/* Wider sheet: max-w-2xl gives ~672px on desktop — much more comfortable than the old max-w-md */}
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        <SheetHeader className="mb-5">
          <SheetTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            استقبال مريض
          </SheetTitle>
          <SheetDescription>{bed ? `سرير ${bed.bedNumber}` : ""}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5">

          {/* ── Room grade banner ───────────────────────────────────────────── */}
          {hasRoomService ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/20">
              <Tag className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">درجة الغرفة</p>
                <p className="text-sm font-semibold">
                  {bed?.roomServiceNameAr}
                  {bed?.roomServicePrice && (
                    <span className="text-muted-foreground font-normal mr-2">
                      {parseFloat(bed.roomServicePrice).toLocaleString("ar-EG")} ج.م/يوم
                    </span>
                  )}
                </p>
              </div>
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50 shrink-0">
                يضاف لحظياً
              </Badge>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              هذه الغرفة لا تحتوي على درجة إقامة محددة — لن يُضاف بند إقامة تلقائياً
            </div>
          )}

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 1 — PATIENT IDENTIFICATION                         ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="space-y-3">
            <SectionHeader>بيانات المريض</SectionHeader>

            {/* Search input */}
            {!selectedPatient && (
              <div className="space-y-1">
                <Label>بحث عن مريض</Label>
                <div className="relative">
                  <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  {patientsFetching && (
                    <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Input
                    ref={searchInputRef}
                    data-testid="input-patient-search"
                    className="pr-9 pl-9"
                    placeholder="اسم المريض، رقم الهوية، رقم الملف..."
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                </div>

                {/* Search results dropdown */}
                {showPatientResults && (
                  <div
                    ref={searchResultsRef}
                    className="border rounded-lg overflow-hidden shadow-sm bg-background"
                  >
                    {patients.map((p, idx) => (
                      <button
                        key={p.id}
                        data-testid={`patient-option-${p.id}`}
                        type="button"
                        className={[
                          "w-full text-right px-3 py-2.5 text-sm transition-colors border-b last:border-b-0",
                          "flex items-start justify-between gap-3",
                          highlightedIdx === idx
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted",
                        ].join(" ")}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onClick={() => selectPatient(p)}
                      >
                        <div className="flex-1 min-w-0 text-start">
                          <p className="font-medium leading-tight truncate">{p.fullName}</p>
                          {(p.phone || p.nationalId) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {p.phone && <span>{p.phone}</span>}
                              {p.phone && p.nationalId && <span className="mx-1">·</span>}
                              {p.nationalId && <span>هوية: {p.nationalId}</span>}
                            </p>
                          )}
                        </div>
                        {p.patientCode && (
                          <span className="text-xs font-mono text-muted-foreground shrink-0">
                            {p.patientCode}
                          </span>
                        )}
                      </button>
                    ))}
                    <p className="text-center text-xs text-muted-foreground py-1.5 bg-muted/30">
                      ↑↓ تنقل · Enter اختيار
                    </p>
                  </div>
                )}

                {/* No results state */}
                {!selectedPatient && debouncedSearch.length >= 2 && !patientsFetching && patients.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">
                    لا توجد نتائج — يمكنك إدخال الاسم يدوياً أدناه
                  </p>
                )}
              </div>
            )}

            {/* Selected patient chip */}
            {selectedPatient && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{selectedPatient.fullName}</p>
                  {(selectedPatient.phone || selectedPatient.patientCode) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedPatient.phone && <span>{selectedPatient.phone}</span>}
                      {selectedPatient.phone && selectedPatient.patientCode && <span className="mx-1">·</span>}
                      {selectedPatient.patientCode && <span>ملف: {selectedPatient.patientCode}</span>}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => {
                    setSelectedPatient(null);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                >
                  تغيير
                </Button>
              </div>
            )}

            {/* Manual name + phone (shown when no patient selected) — 2-column grid */}
            {!selectedPatient && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="patientName">
                    اسم المريض <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="patientName"
                    data-testid="input-patient-name"
                    placeholder="الاسم الكامل"
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="patientPhone">رقم الهاتف</Label>
                  <Input
                    id="patientPhone"
                    data-testid="input-patient-phone"
                    placeholder="01XXXXXXXXX"
                    value={patientPhone}
                    onChange={e => setPatientPhone(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            {/* Phone only (when patient is selected — they may want to override) */}
            {selectedPatient && (
              <div className="space-y-1">
                <Label htmlFor="patientPhoneOverride">رقم الهاتف (تحديث اختياري)</Label>
                <Input
                  id="patientPhoneOverride"
                  data-testid="input-patient-phone"
                  placeholder="01XXXXXXXXX"
                  value={patientPhone}
                  onChange={e => setPatientPhone(e.target.value)}
                  dir="ltr"
                />
              </div>
            )}
          </div>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 2 — CLINICAL DETAILS                               ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="space-y-3">
            <SectionHeader>التفاصيل السريرية</SectionHeader>

            {/* Department + Doctor — 2-column grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>القسم</Label>
                <DepartmentLookup
                  value={departmentId}
                  onChange={item => setDepartmentId(item?.id || "")}
                  data-testid="lookup-department"
                />
              </div>
              <div className="space-y-1">
                <Label>الطبيب</Label>
                <DoctorLookup
                  value={selectedDoctor?.id || ""}
                  onChange={setSelectedDoctor}
                  data-testid="lookup-doctor"
                />
              </div>
            </div>

            {/* Surgery type — full width */}
            <div className="space-y-1">
              <Label>نوع العملية <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
              {selectedSurgery ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block">{selectedSurgery.nameAr}</span>
                    <span className="text-xs text-muted-foreground">
                      {surgeryCategoryLabels[selectedSurgery.category as keyof typeof surgeryCategoryLabels]}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs shrink-0"
                    onClick={() => { setSelectedSurgery(null); setSurgerySearch(""); }}
                  >
                    تغيير
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    data-testid="input-surgery-search"
                    placeholder="ابحث باسم العملية..."
                    value={surgerySearch}
                    onChange={e => { setSurgerySearch(e.target.value); setShowSurgeryDrop(true); }}
                    onFocus={() => setShowSurgeryDrop(true)}
                    onBlur={() => setTimeout(() => setShowSurgeryDrop(false), 200)}
                  />
                  {showSurgeryDrop && surgerySearch.length >= 1 && surgeries.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-md overflow-hidden max-h-48 overflow-y-auto">
                      {surgeries
                        .filter(s => s.isActive)
                        .map(s => (
                          <button
                            key={s.id}
                            data-testid={`surgery-option-${s.id}`}
                            type="button"
                            className="w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-center justify-between"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setSelectedSurgery(s); setSurgerySearch(""); setShowSurgeryDrop(false); }}
                          >
                            <span className="font-medium">{s.nameAr}</span>
                            <Badge variant="outline" className="text-xs mr-2">
                              {surgeryCategoryLabels[s.category as keyof typeof surgeryCategoryLabels]}
                            </Badge>
                          </button>
                        ))}
                    </div>
                  )}
                  {showSurgeryDrop && surgerySearch.length >= 1 && surgeries.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-md px-3 py-2 text-sm text-muted-foreground">
                      لا توجد عملية بهذا الاسم
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 3 — FINANCIAL                                      ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="space-y-3">
            <SectionHeader>التفاصيل المالية</SectionHeader>

            <div className="space-y-1">
              <Label>نوع الدفع</Label>
              <PaymentToggle
                value={paymentType}
                onChange={v => { setPaymentType(v); if (v === "cash") setInsuranceCompany(""); }}
              />
            </div>

            {paymentType === "contract" && (
              <div className="space-y-1">
                <Label htmlFor="insuranceCompany">
                  شركة التأمين / الجهة المتعاقدة <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="insuranceCompany"
                  data-testid="input-insurance-company"
                  placeholder="اسم الشركة أو الجهة المتعاقدة"
                  value={insuranceCompany}
                  onChange={e => setInsuranceCompany(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 4 — NOTES                                          ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="space-y-1">
            <Label htmlFor="notes">ملاحظات <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
            <Input
              id="notes"
              data-testid="input-notes"
              placeholder="أي ملاحظات إضافية..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  ACTIONS                                                     ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="flex gap-3 pt-2 border-t">
            <Button
              data-testid="button-admit-submit"
              className="flex-1"
              disabled={!canSubmit || admitMutation.isPending}
              onClick={() => admitMutation.mutate()}
            >
              {admitMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin ml-1" /> جارٍ الاستقبال...</>
                : "استقبال المريض"}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-admit-cancel"
            >
              إلغاء
            </Button>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
