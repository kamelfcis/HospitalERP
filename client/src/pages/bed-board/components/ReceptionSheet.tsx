/**
 * ReceptionSheet — نافذة استقبال المريض للسرير (inpatient admission)
 *
 * تُفتح من لوحة الأسرة عند الضغط على سرير فارغ.
 * ترسل POST /api/beds/:id/admit — لا يُعدَّل payload ولا العقد ولا المسارات.
 *
 * Keyboard map:
 *   Search box  → ↑↓ navigate results · Enter select · Escape clear
 *   Surgery box → ↑↓ navigate results · Enter select · Escape close
 *   Payment     → Tab to reach · Space/Enter toggle
 *   Submit      → Tab to reach · Enter/Space
 */

// ===== Imports =====

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation }                              from "@tanstack/react-query";
import { queryClient, apiRequest }                            from "@/lib/queryClient";
import { useToast }                                           from "@/hooks/use-toast";
import { NationalIdField, isFullName } from "@/components/shared/NationalIdField";
import { Button }                                             from "@/components/ui/button";
import { Badge }                                              from "@/components/ui/badge";
import { Input }                                              from "@/components/ui/input";
import { Label }                                              from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { DoctorLookup, DepartmentLookup } from "@/components/lookups";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PatientSearchCombobox, type PatientOption } from "@/components/shared/PatientSearchCombobox";
import { Tag, Loader2, Printer, UserCheck } from "lucide-react";
import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
import type { SurgeryType }               from "@shared/schema";
import { surgeryCategoryLabels }          from "@shared/schema";
import type { BedData }                   from "../types";
import type { LookupItem }                from "@/lib/lookupTypes";

// ===== Types =====

interface Props {
  open:    boolean;
  bed:     BedData | null;
  onClose: () => void;
}

// ===== Sub-components =====

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1 pb-0.5 border-b select-none">
      {children}
    </p>
  );
}

// ── Payment type toggle (keyboard-accessible) ─────────────────────────────────
function PaymentToggle({
  value,
  onChange,
}: {
  value:    "cash" | "contract";
  onChange: (v: "cash" | "contract") => void;
}) {
  const base     = "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";
  const active   = "bg-primary text-primary-foreground border-primary";
  const inactive = "bg-background text-foreground border-border hover:bg-muted";

  const handleKey = (e: React.KeyboardEvent, v: "cash" | "contract") => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(v); }
  };

  return (
    <div className="flex gap-2" role="group" aria-label="نوع الدفع" data-testid="payment-type-toggle">
      <button
        type="button"
        data-testid="payment-type-cash"
        aria-pressed={value === "cash"}
        onClick={() => onChange("cash")}
        onKeyDown={e => handleKey(e, "cash")}
        className={`${base} ${value === "cash" ? active : inactive}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
        نقدي
      </button>
      <button
        type="button"
        data-testid="payment-type-insurance"
        aria-pressed={value === "contract"}
        onClick={() => onChange("contract")}
        onKeyDown={e => handleKey(e, "contract")}
        className={`${base} ${value === "contract" ? active : inactive}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        تأمين / تعاقد
      </button>
    </div>
  );
}

// ===== Main Component =====

export function ReceptionSheet({ open, bed, onClose }: Props) {
  const { toast } = useToast();

  // ===== State / Refs =====

  const [patientName,      setPatientName]      = useState("");
  const [patientPhone,     setPatientPhone]     = useState("");
  const [nationalId,       setNationalId]       = useState("");
  const [dateOfBirth,      setDateOfBirth]      = useState("");
  const [age,              setAge]              = useState("");
  const [selectedPatient,  setSelectedPatient]  = useState<PatientOption | null>(null);
  const [departmentId,     setDepartmentId]     = useState("");
  const [departmentCode,   setDepartmentCode]   = useState("");
  const [selectedDoctor,   setSelectedDoctor]   = useState<LookupItem | null>(null);
  const [surgerySearch,    setSurgerySearch]    = useState("");
  const [highlightedSurgery, setHighlightedSurgery] = useState(-1);
  const [selectedSurgery,  setSelectedSurgery]  = useState<SurgeryType | null>(null);
  const [showSurgeryDrop,  setShowSurgeryDrop]  = useState(false);
  const [notes,            setNotes]            = useState("");
  const [paymentType,      setPaymentType]      = useState<"cash" | "contract">("cash");
  const [insuranceCompany, setInsuranceCompany] = useState("");

  /* printing */
  const [printTicket, setPrintTicket] = useState(true);

  const patientPhoneRef   = useRef<HTMLInputElement>(null);
  const surgeryInputRef   = useRef<HTMLInputElement>(null);
  const surgeryItemsRef   = useRef<(HTMLButtonElement | null)[]>([]);

  // ===== Effects =====

  // Scroll highlighted surgery result into view
  useEffect(() => {
    surgeryItemsRef.current[highlightedSurgery]?.scrollIntoView({ block: "nearest" });
  }, [highlightedSurgery]);

  // ===== Data Fetching =====

  interface CompanyOption { id: string; nameAr: string; code: string; isActive: boolean; }
  const { data: activeCompanies = [] } = useQuery<CompanyOption[]>({
    queryKey: ["/api/beds/admission-companies"],
    enabled: paymentType === "contract",
  });

  // Active filtered surgeries (server returns all matches; we hide inactive ones here)
  const { data: surgeriesRaw = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn:  () =>
      apiRequest("GET", `/api/surgery-types?search=${encodeURIComponent(surgerySearch)}`)
        .then(r => r.json()),
    enabled: surgerySearch.length >= 1,
  });
  const surgeries = useMemo(() => surgeriesRaw.filter(s => s.isActive), [surgeriesRaw]);

  // ===== Derived Values =====

  const [typedName, setTypedName] = useState("");

  const effectiveName = selectedPatient?.fullName ?? (typedName || patientName);

  const effectivePhone = patientPhone.trim() || selectedPatient?.phone || undefined;
  const effectiveNationalId = nationalId.trim() || selectedPatient?.nationalId || undefined;

  const hasRoomService = !!(bed?.roomServiceId);

  const nameIsQuad = useMemo(() => isFullName(effectiveName), [effectiveName]);
  const nidIsValid = useMemo(() => /^\d{14}$/.test(effectiveNationalId || ""), [effectiveNationalId]);
  const isSurgeryDept = departmentCode.toLowerCase() === "surgery";
  const surgeryRequired = isSurgeryDept;

  const nameError = useMemo(() => {
    if (!effectiveName.trim()) return "اسم المريض مطلوب";
    if (!nameIsQuad) return "الاسم الرباعي مطلوب (4 كلمات على الأقل)";
    return null;
  }, [effectiveName, nameIsQuad]);

  const nidError = useMemo(() => {
    if (!effectiveNationalId) return "الرقم القومي مطلوب للتسكين";
    if (!nidIsValid) return "الرقم القومي يجب أن يكون 14 رقم";
    return null;
  }, [effectiveNationalId, nidIsValid]);

  const phoneDigits = (effectivePhone || "").replace(/\D/g, "");
  const phoneIsValid = phoneDigits.length === 11;
  const phoneError = useMemo(() => {
    if (!effectivePhone?.trim()) return "رقم الهاتف مطلوب للتسكين";
    if (!phoneIsValid) return "رقم الهاتف يجب أن يكون 11 رقم";
    return null;
  }, [effectivePhone, phoneIsValid]);

  const canSubmit = useMemo(
    () =>
      effectiveName.trim().length > 0 &&
      nameIsQuad &&
      nidIsValid &&
      phoneIsValid &&
      !!departmentId &&
      !!selectedDoctor &&
      (!surgeryRequired || !!selectedSurgery) &&
      !(paymentType === "contract" && !insuranceCompany.trim()),
    [effectiveName, nameIsQuad, nidIsValid, phoneIsValid, departmentId, selectedDoctor, surgeryRequired, selectedSurgery, paymentType, insuranceCompany],
  );

  // ===== Handlers =====

  const resetState = useCallback(() => {
    setPatientName("");
    setTypedName("");
    setPatientPhone("");
    setNationalId("");
    setDateOfBirth("");
    setAge("");
    setSelectedPatient(null);
    setDepartmentId("");
    setDepartmentCode("");
    setSelectedDoctor(null);
    setSurgerySearch("");
    setSelectedSurgery(null);
    setShowSurgeryDrop(false);
    setHighlightedSurgery(-1);
    setNotes("");
    setPaymentType("cash");
    setInsuranceCompany("");
    setPrintTicket(true);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handlePatientSelect = useCallback((patient: PatientOption) => {
    setSelectedPatient(patient);
    setPatientPhone("");
    setNationalId("");
    setDateOfBirth("");
    setAge(patient.age != null ? String(patient.age) : "");
    setTimeout(() => patientPhoneRef.current?.focus(), 50);
  }, []);

  const handlePatientClear = useCallback(() => {
    setSelectedPatient(null);
    setTypedName("");
    setPatientPhone("");
    setNationalId("");
    setDateOfBirth("");
    setAge("");
  }, []);

  // ── Surgery search keyboard navigation ───────────────────────────────────────
  const handleSurgeryKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setShowSurgeryDrop(false);
      setSurgerySearch("");
      return;
    }
    if (!showSurgeryDrop || surgeries.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedSurgery(prev => Math.min(prev + 1, surgeries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedSurgery(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedSurgery >= 0 && highlightedSurgery < surgeries.length) {
        setSelectedSurgery(surgeries[highlightedSurgery]);
        setSurgerySearch("");
        setShowSurgeryDrop(false);
      }
    }
  }, [showSurgeryDrop, surgeries, highlightedSurgery]);

  // ── Payment type handler (also clears insurance when switching to cash) ───────
  const handlePaymentTypeChange = useCallback((v: "cash" | "contract") => {
    setPaymentType(v);
    if (v === "cash") setInsuranceCompany("");
  }, []);

  // ===== Mutation =====

  const admitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${bed!.id}/admit`, {
        patientName:      effectiveName,
        patientPhone:     effectivePhone,
        patientId:        selectedPatient?.id || undefined,
        nationalId:       effectiveNationalId || undefined,
        dateOfBirth:      dateOfBirth || undefined,
        age:              age !== "" ? parseInt(age, 10) : undefined,
        departmentId:     departmentId   || undefined,
        doctorName:       selectedDoctor?.name || undefined,
        notes:            notes          || undefined,
        paymentType,
        insuranceCompany: paymentType === "contract" ? (insuranceCompany || undefined) : undefined,
        surgeryTypeId:    selectedSurgery?.id || undefined,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({
        title:       "تم الاستقبال",
        description: selectedSurgery
          ? "تمت إضافة بند الإقامة وفتح غرفة العمليات فوراً"
          : "تمت إضافة بند الإقامة فوراً للفاتورة",
      });
      if (printTicket && bed) {
        printReceptionTicket({
          patientName:    effectiveName,
          visitType:      "admission",
          departmentName: "القسم الداخلي",
          floorName:      bed.floorNameAr ?? null,
          roomName:       bed.roomNameAr ?? null,
          roomNumber:     bed.roomNumber ?? null,
          roomGrade:      bed.roomServiceNameAr ?? null,
          bedNumber:      bed.bedNumber,
          doctorName:     selectedDoctor?.name ?? null,
          surgeryType:    selectedSurgery?.nameAr ?? null,
          paymentType,
          contractName:   paymentType === "contract" ? insuranceCompany || null : null,
        });
      }
      handleClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ في الاستقبال", description: err.message || "فشل الاستقبال" });
    },
  });

  // ===== Layout Sections =====

  return (
    <Sheet open={open} onOpenChange={v => !v && handleClose()}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col" dir="rtl">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <SheetHeader className="mb-5 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            استقبال مريض
          </SheetTitle>
          <SheetDescription>
            {bed ? `سرير ${bed.bedNumber}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 flex-1">

          {/* ── Room grade banner ─────────────────────────────────────────────── */}
          {hasRoomService ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <Tag className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground">درجة الغرفة</p>
                <p className="text-sm font-semibold truncate">
                  {bed?.roomServiceNameAr}
                  {bed?.roomServicePrice && (
                    <span className="text-muted-foreground font-normal mr-2">
                      {parseFloat(bed.roomServicePrice).toLocaleString("ar-EG")} ج.م/يوم
                    </span>
                  )}
                </p>
              </div>
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50 dark:bg-green-950 dark:text-green-300 dark:border-green-800 shrink-0">
                يضاف لحظياً
              </Badge>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              هذه الغرفة لا تحتوي على درجة إقامة محددة — لن يُضاف بند إقامة تلقائياً
            </div>
          )}

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 1 — PATIENT IDENTIFICATION                         ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <section aria-label="بيانات المريض" className="space-y-3">
            <SectionLabel>بيانات المريض</SectionLabel>

            {/* ── Unified patient search + manual entry ──────── */}
            <div className="space-y-1.5">
              <Label>
                اسم المريض الرباعي <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <PatientSearchCombobox
                variant="full"
                value={selectedPatient?.id || undefined}
                selectedName={selectedPatient?.fullName || undefined}
                onChange={() => {}}
                onSelectPatient={handlePatientSelect}
                onClear={handlePatientClear}
                onTypedNameChange={setTypedName}
                allowManualEntry
                autoFocus={open}
                placeholder="الاسم الرباعي: الاسم الأول / الأب / الجد / العائلة"
                data-testid="input-patient-search"
              />
              {effectiveName.trim() && nameError && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <span>⚠</span> {nameError}
                </p>
              )}
              {!effectiveName.trim() && (
                <p className="text-[10px] text-muted-foreground">
                  التسكين يتطلب الاسم الرباعي والرقم القومي
                </p>
              )}
            </div>

            {/* ── Phone + NID (when no patient selected — manual entry mode) ── */}
            {!selectedPatient && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="patient-phone-manual">رقم الهاتف <span className="text-destructive">*</span></Label>
                    <Input
                      id="patient-phone-manual"
                      ref={patientPhoneRef}
                      data-testid="input-patient-phone"
                      placeholder="01XXXXXXXXX"
                      autoComplete="tel"
                      maxLength={11}
                      value={patientPhone}
                      onChange={e => setPatientPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      dir="ltr"
                      className={phoneError && patientPhone ? "border-destructive" : ""}
                    />
                    {phoneError && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <span>⚠</span> {phoneError}
                      </p>
                    )}
                  </div>
                </div>
                <NationalIdField
                  nationalId={nationalId}
                  onNationalIdChange={setNationalId}
                  dateOfBirth={dateOfBirth}
                  onDateOfBirthChange={setDateOfBirth}
                  age={age}
                  onAgeChange={setAge}
                  disabled={false}
                  required
                  requiredHint="الرقم القومي إجباري لتسكين المرضى الداخليين"
                />
              </>
            )}

            {/* ── Phone + NID override (when patient selected) ── */}
            {selectedPatient && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="patient-phone-override">
                      رقم الهاتف <span className="text-destructive">*</span>
                      <span className="text-xs text-muted-foreground mr-1.5">
                        {selectedPatient.phone
                          ? `(المحفوظ: ${selectedPatient.phone})`
                          : "(غير محفوظ)"}
                      </span>
                    </Label>
                    <Input
                      id="patient-phone-override"
                      ref={patientPhoneRef}
                      data-testid="input-patient-phone-override"
                      placeholder={selectedPatient.phone ?? "01XXXXXXXXX"}
                      autoComplete="tel"
                      maxLength={11}
                      value={patientPhone}
                      onChange={e => setPatientPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      dir="ltr"
                      className={phoneError && patientPhone ? "border-destructive" : ""}
                    />
                    {phoneError && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <span>⚠</span> {phoneError}
                      </p>
                    )}
                  </div>
                </div>
                <NationalIdField
                  nationalId={selectedPatient.nationalId || nationalId}
                  onNationalIdChange={setNationalId}
                  dateOfBirth={dateOfBirth}
                  onDateOfBirthChange={setDateOfBirth}
                  age={age}
                  onAgeChange={setAge}
                  disabled={!!selectedPatient.nationalId}
                  required
                  requiredHint={!selectedPatient.nationalId ? "الرقم القومي إجباري لتسكين المرضى الداخليين" : undefined}
                />
              </>
            )}
          </section>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 2 — CLINICAL DETAILS                               ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <section aria-label="التفاصيل السريرية" className="space-y-3">
            <SectionLabel>التفاصيل السريرية</SectionLabel>

            {/* Department + Doctor side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>القسم <span className="text-destructive">*</span></Label>
                <DepartmentLookup
                  value={departmentId}
                  onChange={item => {
                    setDepartmentId(item?.id ?? "");
                    setDepartmentCode(item?.code ?? "");
                    if (item?.code?.toLowerCase() !== "surgery") {
                      setSelectedSurgery(null);
                      setSurgerySearch("");
                    }
                  }}
                  data-testid="lookup-department"
                />
                {!departmentId && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <span>⚠</span> القسم إجباري للتسكين
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>الطبيب <span className="text-destructive">*</span></Label>
                <DoctorLookup
                  value={selectedDoctor?.id ?? ""}
                  displayValue={selectedDoctor?.name}
                  onChange={setSelectedDoctor}
                  data-testid="lookup-doctor"
                />
                {!selectedDoctor && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <span>⚠</span> الطبيب إجباري للتسكين
                  </p>
                )}
              </div>
            </div>

            {/* Surgery type with keyboard navigation */}
            <div className="space-y-1">
              <Label htmlFor="surgery-search">
                نوع العملية
                {surgeryRequired
                  ? <span className="text-destructive mr-1">*</span>
                  : <span className="text-xs text-muted-foreground mr-1.5">(اختياري)</span>
                }
              </Label>
              {surgeryRequired && !selectedSurgery && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1 mb-1">
                  <span>⚠</span> نوع العملية إجباري عند اختيار قسم العمليات
                </p>
              )}

              {selectedSurgery ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">{selectedSurgery.nameAr}</span>
                    <span className="text-xs text-muted-foreground">
                      {surgeryCategoryLabels[selectedSurgery.category as keyof typeof surgeryCategoryLabels]}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs shrink-0"
                    data-testid="button-change-surgery"
                    onClick={() => {
                      setSelectedSurgery(null);
                      setSurgerySearch("");
                      setHighlightedSurgery(-1);
                      setTimeout(() => surgeryInputRef.current?.focus(), 50);
                    }}
                  >
                    تغيير
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="surgery-search"
                    ref={surgeryInputRef}
                    data-testid="input-surgery-search"
                    placeholder="ابحث باسم العملية..."
                    autoComplete="off"
                    value={surgerySearch}
                    onChange={e => {
                      setSurgerySearch(e.target.value);
                      setHighlightedSurgery(0);
                      setShowSurgeryDrop(true);
                    }}
                    onFocus={() => setShowSurgeryDrop(true)}
                    onBlur={() => setTimeout(() => setShowSurgeryDrop(false), 150)}
                    onKeyDown={handleSurgeryKeyDown}
                    aria-autocomplete="list"
                    aria-expanded={showSurgeryDrop && surgeries.length > 0}
                  />

                  {showSurgeryDrop && surgerySearch.length >= 1 && (
                    <div
                      role="listbox"
                      aria-label="أنواع العمليات"
                      className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-lg overflow-hidden max-h-48 overflow-y-auto"
                    >
                      {surgeries.length > 0 ? (
                        surgeries.map((s, idx) => {
                          const isActive = highlightedSurgery === idx;
                          return (
                            <button
                              key={s.id}
                              ref={el => { surgeryItemsRef.current[idx] = el; }}
                              role="option"
                              aria-selected={isActive}
                              data-testid={`surgery-option-${s.id}`}
                              type="button"
                              className={[
                                "w-full text-right px-3 py-2 text-sm transition-colors border-b last:border-b-0",
                                "flex items-center justify-between gap-2",
                                isActive ? "bg-primary/10 text-primary" : "hover:bg-muted",
                              ].join(" ")}
                              onMouseEnter={() => setHighlightedSurgery(idx)}
                              onMouseDown={e => e.preventDefault()} // prevent blur firing before click
                              onClick={() => {
                                setSelectedSurgery(s);
                                setSurgerySearch("");
                                setShowSurgeryDrop(false);
                              }}
                            >
                              <span className="font-medium truncate">{s.nameAr}</span>
                              <Badge variant="outline" className="text-[11px] shrink-0">
                                {surgeryCategoryLabels[s.category as keyof typeof surgeryCategoryLabels]}
                              </Badge>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-2.5 text-sm text-muted-foreground text-center">
                          لا توجد عملية بهذا الاسم
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 3 — FINANCIAL                                      ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <section aria-label="التفاصيل المالية" className="space-y-3">
            <SectionLabel>التفاصيل المالية</SectionLabel>

            <div className="space-y-1">
              <Label>نوع الدفع</Label>
              <PaymentToggle value={paymentType} onChange={handlePaymentTypeChange} />
            </div>

            {paymentType === "contract" && (
              <div className="space-y-1">
                <Label>
                  شركة التأمين / الجهة المتعاقدة
                  <span className="text-destructive mr-1" aria-hidden="true">*</span>
                </Label>
                <Select
                  value={insuranceCompany || "__none__"}
                  onValueChange={v => setInsuranceCompany(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger data-testid="select-insurance-company">
                    <SelectValue placeholder="اختر الشركة أو الجهة المتعاقدة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— اختر —</SelectItem>
                    {activeCompanies.map(c => (
                      <SelectItem key={c.id} value={c.nameAr} data-testid={`company-option-${c.id}`}>
                        {c.nameAr} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  SECTION 4 — NOTES                                          ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <section aria-label="ملاحظات">
            <div className="space-y-1">
              <Label htmlFor="admission-notes">
                ملاحظات
                <span className="text-xs text-muted-foreground mr-1.5">(اختياري)</span>
              </Label>
              <Input
                id="admission-notes"
                data-testid="input-notes"
                placeholder="أي ملاحظات إضافية..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </section>

          {/* ╔══════════════════════════════════════════════════════════════╗ */}
          {/* ║  ACTIONS                                                     ║ */}
          {/* ╚══════════════════════════════════════════════════════════════╝ */}
          <div className="pt-3 border-t sticky bottom-0 bg-background pb-1 space-y-2">
            {/* Print ticket toggle */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground"
              data-testid="label-print-ticket-toggle"
            >
              <input
                type="checkbox"
                checked={printTicket}
                onChange={e => setPrintTicket(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
                data-testid="checkbox-print-ticket"
              />
              <Printer className="h-3.5 w-3.5" />
              طباعة تذكرة المريض
            </label>
            <div className="flex gap-3">
              <Button
                data-testid="button-admit-submit"
                className="flex-1"
                disabled={!canSubmit || admitMutation.isPending}
                onClick={() => admitMutation.mutate()}
              >
                {admitMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-1" aria-hidden="true" /> جارٍ الاستقبال...</>
                ) : (
                  "استقبال المريض"
                )}
              </Button>
              <Button
                variant="outline"
                data-testid="button-admit-cancel"
                onClick={handleClose}
              >
                إلغاء
              </Button>
            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
