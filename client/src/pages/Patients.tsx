/**
 * @file Patients.tsx
 * @description سجل المرضى — patient registry with financial stats per patient.
 *
 * Features:
 *   - Date range filter → drives financial stats aggregation
 *   - Search by name / phone
 *   - Stats columns: خدمات | أدوية+مستهلكات | فتح عملية | إقامة | إجمالي
 *   - Horizontal totals per patient + vertical totals row
 *   - Add-patient form mirrors the bed-card admission sheet:
 *       patient info → optional admission (floor → room → bed, doctor,
 *       surgery type, payment type)
 *   - Edit-patient form (basic info only)
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button }            from "@/components/ui/button";
import { Input }             from "@/components/ui/input";
import { Label }             from "@/components/ui/label";
import { Badge }             from "@/components/ui/badge";
import { ScrollArea }        from "@/components/ui/scroll-area";
import { Skeleton }          from "@/components/ui/skeleton";
import { useToast }          from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Edit2, Trash2, Users, ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { useLocation } from "wouter";
import { formatNumber } from "@/lib/formatters";
import type { Patient, InsertPatient } from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD (Cairo local clock) */
const todayStr = () => new Date().toISOString().slice(0, 10);

const PAYMENT_TYPES = [
  { value: "CASH",      label: "نقدي" },
  { value: "INSURANCE", label: "تأمين" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientStats {
  id: string;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  createdAt: string;
  servicesTotal: number;
  drugsTotal: number;
  orRoomTotal: number;
  stayTotal: number;
  grandTotal: number;
  latestInvoiceId: string | null;
  latestInvoiceNumber: string | null;
}

interface BedOption {
  id: string;
  nameAr: string;
  roomId: string;
  roomNameAr: string;
  floorId: string;
  floorNameAr: string;
  status: string;
}

interface RoomOption {
  id: string;
  nameAr: string;
  floorId: string;
}

interface FloorOption {
  id: string;
  nameAr: string;
  rooms: RoomOption[];
}

interface DoctorOption {
  id: string;
  nameAr: string;
}

interface SurgeryTypeOption {
  id: string;
  nameAr: string;
  category: string;
}

// ─── Helper hooks ─────────────────────────────────────────────────────────────

/** Debounce a value by `delay` ms */
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Sub-component: column amount cell ───────────────────────────────────────

function AmountCell({ value }: { value: number }) {
  if (!value || +value === 0) return <td className="text-center text-muted-foreground">—</td>;
  return <td className="text-center tabular-nums">{formatNumber(+value)}</td>;
}

// ─── Sub-component: Totals row ────────────────────────────────────────────────

interface TotalsRowProps {
  rows: PatientStats[];
}
function TotalsRow({ rows }: TotalsRowProps) {
  const sum = (key: keyof PatientStats) =>
    rows.reduce((acc, r) => acc + +(r[key] ?? 0), 0);

  return (
    <tr className="bg-muted/50 font-bold text-xs border-t-2">
      <td colSpan={5} className="text-right pr-2 py-1">الإجمالي ({rows.length} مريض)</td>
      <td className="text-center tabular-nums">{formatNumber(sum("servicesTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("drugsTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("orRoomTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("stayTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("grandTotal"))}</td>
      <td />
    </tr>
  );
}

// ─── Sub-component: Patient form dialog ──────────────────────────────────────

interface PatientFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingPatient: Patient | null;
}

function PatientFormDialog({ open, onClose, editingPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  // ── basic patient fields
  const [fullName,    setFullName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [nationalId,  setNationalId]  = useState("");
  const [age,         setAge]         = useState<string>("");

  // ── admission fields (new patient only)
  const [showAdmission, setShowAdmission] = useState(false);
  const [doctorSearch,  setDoctorSearch]  = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedRoom,  setSelectedRoom]  = useState("");
  const [selectedBed,   setSelectedBed]   = useState("");
  const [surgerySearch, setSurgerySearch] = useState("");
  const [selectedSurgery, setSelectedSurgery] = useState<SurgeryTypeOption | null>(null);
  const [paymentType,   setPaymentType]   = useState("CASH");
  const [insuranceCo,   setInsuranceCo]   = useState("");

  // ── bed-board data for floor/room/bed cascade
  const { data: bedBoard } = useQuery<any[]>({
    queryKey: ["/api/bed-board"],
    enabled: open && !isEdit,
  });

  const floors: FloorOption[] = useMemo(() => {
    if (!bedBoard) return [];
    return bedBoard.map((f: any) => ({
      id: f.id, nameAr: f.nameAr,
      rooms: (f.rooms || []).map((r: any) => ({ id: r.id, nameAr: r.nameAr, floorId: f.id })),
    }));
  }, [bedBoard]);

  const rooms: RoomOption[] = useMemo(
    () => floors.find(f => f.id === selectedFloor)?.rooms ?? [],
    [floors, selectedFloor],
  );

  /** All beds in the selected room, free only */
  const beds: BedOption[] = useMemo(() => {
    if (!bedBoard || !selectedRoom) return [];
    for (const f of bedBoard) {
      for (const r of (f.rooms || [])) {
        if (r.id === selectedRoom) {
          return (r.beds || [])
            .filter((b: any) => b.status === "available")
            .map((b: any) => ({
              id: b.id, nameAr: b.nameAr,
              roomId: r.id, roomNameAr: r.nameAr,
              floorId: f.id, floorNameAr: f.nameAr,
              status: b.status,
            }));
        }
      }
    }
    return [];
  }, [bedBoard, selectedRoom]);

  // ── doctors search
  const debouncedDoctor = useDebounce(doctorSearch, 300);
  const { data: doctors } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", debouncedDoctor],
    queryFn: async () => {
      const q = debouncedDoctor.trim() ? `?search=${encodeURIComponent(debouncedDoctor.trim())}` : "";
      const r = await fetch(`/api/doctors${q}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل في جلب الأطباء");
      return r.json();
    },
    enabled: open && !isEdit,
  });

  // ── surgery types search
  const debouncedSurgery = useDebounce(surgerySearch, 300);
  const { data: surgeryTypes } = useQuery<SurgeryTypeOption[]>({
    queryKey: ["/api/surgery-types", debouncedSurgery],
    queryFn: async () => {
      const q = debouncedSurgery.trim() ? `?search=${encodeURIComponent(debouncedSurgery.trim())}` : "";
      const r = await fetch(`/api/surgery-types${q}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل في جلب أنواع العمليات");
      const data = await r.json();
      return Array.isArray(data) ? data : data.data ?? [];
    },
    enabled: open && !isEdit && showAdmission,
  });

  // ── populate form when editing
  useEffect(() => {
    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setAge("");
      setShowAdmission(false);
      setDoctorSearch(""); setSelectedFloor(""); setSelectedRoom("");
      setSelectedBed(""); setSurgerySearch(""); setSelectedSurgery(null);
      setPaymentType("CASH"); setInsuranceCo("");
    }
  }, [editingPatient, open]);

  // ── reset room/bed when floor changes
  useEffect(() => { setSelectedRoom(""); setSelectedBed(""); }, [selectedFloor]);
  useEffect(() => { setSelectedBed(""); }, [selectedRoom]);

  // ── mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPatient>) => apiRequest("POST", "/api/patients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "تم إضافة المريض بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const admitMutation = useMutation({
    mutationFn: ({ bedId, body }: { bedId: string; body: Record<string, any> }) =>
      apiRequest("POST", `/api/beds/${bedId}/admit`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم تسكين المريض بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPatient> }) =>
      apiRequest("PATCH", `/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "تم تحديث بيانات المريض بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending = createMutation.isPending || admitMutation.isPending || updateMutation.isPending;

  // ── validation
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
    return true;
  }

  // ── submit
  function handleSubmit() {
    if (!validate()) return;
    const ageNum = age !== "" ? parseInt(age, 10) : null;
    const baseData: Partial<InsertPatient> = {
      fullName: fullName.trim(),
      phone: phone || null,
      nationalId: nationalId || null,
      age: ageNum,
      isActive: true,
    };

    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    if (showAdmission && selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          doctorName:       doctorSearch.trim() || undefined,
          surgeryTypeId:    selectedSurgery?.id || undefined,
          paymentType:      paymentType || undefined,
          insuranceCompany: paymentType === "INSURANCE" ? insuranceCo : undefined,
        },
      });
    } else {
      createMutation.mutate(baseData);
    }
  }

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

            {/* ─── Basic patient info ─── */}
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
                    type="number"
                    min={0}
                    max={200}
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

            {/* ─── Admission section (new patient only) ─── */}
            {!isEdit && (
              <div className="border rounded-md overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-semibold"
                  onClick={() => setShowAdmission(v => !v)}
                  data-testid="button-toggle-admission"
                >
                  <span>تسكين على سرير (اختياري)</span>
                  {showAdmission
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                </button>

                {showAdmission && (
                  <div className="px-3 py-3 space-y-2">

                    {/* Floor → Room → Bed cascade */}
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
                        <Label className="text-xs">السرير</Label>
                        <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedRoom}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-bed">
                            <SelectValue placeholder="اختر" />
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

                    {/* Doctor searchable input */}
                    <div className="space-y-1">
                      <Label className="text-xs">الطبيب المعالج</Label>
                      <Input
                        value={doctorSearch}
                        onChange={e => setDoctorSearch(e.target.value)}
                        placeholder="ابحث عن طبيب..."
                        className="h-7 text-xs"
                        list="doctors-list"
                        data-testid="input-doctor-search"
                      />
                      <datalist id="doctors-list">
                        {(doctors ?? []).map((d: DoctorOption) => (
                          <option key={d.id} value={d.nameAr} />
                        ))}
                      </datalist>
                    </div>

                    {/* Surgery type */}
                    <div className="space-y-1">
                      <Label className="text-xs">نوع العملية (اختياري)</Label>
                      <Input
                        value={surgerySearch}
                        onChange={e => {
                          setSurgerySearch(e.target.value);
                          setSelectedSurgery(null);
                        }}
                        placeholder="ابحث عن عملية..."
                        className="h-7 text-xs"
                        data-testid="input-surgery-search"
                      />
                      {surgerySearch && (surgeryTypes ?? []).length > 0 && !selectedSurgery && (
                        <div className="border rounded bg-background shadow-sm max-h-28 overflow-y-auto">
                          {(surgeryTypes ?? []).map((s: SurgeryTypeOption) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-right px-2 py-1 text-xs hover:bg-muted"
                              onClick={() => { setSelectedSurgery(s); setSurgerySearch(s.nameAr); }}
                            >
                              {s.nameAr}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedSurgery && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedSurgery.nameAr}
                        </Badge>
                      )}
                    </div>

                    {/* Payment type */}
                    <div className="space-y-1">
                      <Label className="text-xs">نوع الدفع</Label>
                      <div className="flex gap-2">
                        {PAYMENT_TYPES.map(pt => (
                          <button
                            key={pt.value}
                            type="button"
                            className={`flex-1 h-7 rounded text-xs border transition-colors ${
                              paymentType === pt.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-input hover:bg-muted"
                            }`}
                            onClick={() => setPaymentType(pt.value)}
                            data-testid={`button-payment-${pt.value.toLowerCase()}`}
                          >
                            {pt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {paymentType === "INSURANCE" && (
                      <div className="space-y-1">
                        <Label className="text-xs">شركة التأمين</Label>
                        <Input
                          value={insuranceCo}
                          onChange={e => setInsuranceCo(e.target.value)}
                          placeholder="اسم شركة التأمين"
                          className="h-7 text-xs"
                          data-testid="input-insurance-company"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t gap-1">
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs" data-testid="button-cancel">
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-7 text-xs"
            data-testid="button-save-patient"
          >
            {isPending
              ? "جاري الحفظ..."
              : isEdit
                ? "تحديث"
                : showAdmission && selectedBed
                  ? "إضافة وتسكين"
                  : "إضافة مريض"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function Patients() {
  const [, navigate] = useLocation();
  const [searchQuery,    setSearchQuery]    = useState("");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [deptId,         setDeptId]         = useState("");
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 350);

  // ── departments list for filter dropdown
  const { data: departments = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/departments"],
  });

  // ── patient stats — drives list + columns
  // When date or dept filter is active → backend returns only matching patients (INNER JOIN)
  // When no filter → all registered patients (LEFT JOIN)
  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo)   params.set("dateTo",   dateTo);
  if (deptId)   params.set("deptId",   deptId);

  const { data: rows = [], isLoading } = useQuery<PatientStats[]>({
    queryKey: ["/api/patients/stats", debouncedSearch, dateFrom, dateTo, deptId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/stats?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل في جلب بيانات المرضى");
      return res.json();
    },
  });

  const hasFilter = !!(dateFrom || dateTo || deptId);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
    },
  });

  function openAdd()  { setEditingPatient(null); setDialogOpen(true); }
  function openEdit(p: Patient) { setEditingPatient(p); setDialogOpen(true); }

  function openInvoice(invoiceId: string) {
    navigate(`/patient-invoices?loadId=${invoiceId}`);
  }

  return (
    <div className="p-3 space-y-2 h-full flex flex-col">

      {/* ─── Toolbar ─── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
            <Users className="h-4 w-4" />
            سجل المرضى
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة بيانات المرضى ({rows.length} مريض)
          </p>
        </div>
        <Button
          size="sm"
          onClick={openAdd}
          className="h-7 text-xs px-3"
          data-testid="button-add-patient"
        >
          <Plus className="h-3 w-3 ml-1" />
          إضافة مريض
        </Button>
      </div>

      {/* ─── Filters bar ─── */}
      <div className="peachtree-toolbar rounded flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو التليفون..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="peachtree-input text-xs w-48"
            data-testid="input-search-patients"
          />
        </div>

        {/* Date from */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-from"
          />
        </div>

        {/* Date to */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-to"
          />
        </div>

        {/* Department filter */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">القسم:</Label>
          <Select value={deptId || "all"} onValueChange={v => setDeptId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-dept-filter">
              <SelectValue placeholder="كل الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear filters button — shown only when a filter is active */}
        {hasFilter && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => { setDateFrom(""); setDateTo(""); setDeptId(""); }}
            data-testid="button-clear-filters"
          >
            مسح الفلاتر
          </Button>
        )}

        {/* Active filter badge */}
        {hasFilter && (
          <span className="text-xs text-amber-600 font-medium">
            ● يعرض مرضى الفترة / القسم المحدد فقط
          </span>
        )}
      </div>

      {/* ─── Grid ─── */}
      <div className="peachtree-grid rounded flex-1 overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-210px)]">
            <table className="w-full text-xs">
              <thead className="peachtree-grid-header sticky top-0 z-10">
                <tr>
                  <th className="w-8 text-center">#</th>
                  <th className="text-right">الاسم</th>
                  <th className="w-28 text-right">التليفون</th>
                  <th className="w-36 text-right">الرقم القومي</th>
                  <th className="w-12 text-center">السن</th>
                  <th className="w-24 text-center">خدمات</th>
                  <th className="w-24 text-center">أدوية</th>
                  <th className="w-24 text-center">عملية</th>
                  <th className="w-24 text-center">إقامة</th>
                  <th className="w-28 text-center font-bold">الإجمالي</th>
                  <th className="w-20 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={11} className="text-center py-6 text-muted-foreground">
                      لا يوجد مرضى
                    </td>
                  </tr>
                ) : (
                  rows.map((p, idx) => (
                    <tr key={p.id} className="peachtree-grid-row" data-testid={`row-patient-${p.id}`}>
                      <td className="text-center text-muted-foreground">{idx + 1}</td>
                      <td className="font-medium" data-testid={`text-name-${p.id}`}>{p.fullName}</td>
                      <td className="font-mono" data-testid={`text-phone-${p.id}`}>{p.phone || "—"}</td>
                      <td className="font-mono" data-testid={`text-nationalid-${p.id}`}>{p.nationalId || "—"}</td>
                      <td className="text-center" data-testid={`text-age-${p.id}`}>{p.age ?? "—"}</td>
                      <AmountCell value={+p.servicesTotal} />
                      <AmountCell value={+p.drugsTotal} />
                      <AmountCell value={+p.orRoomTotal} />
                      <AmountCell value={+p.stayTotal} />
                      <td className="text-center font-bold tabular-nums" data-testid={`text-total-${p.id}`}>
                        {+p.grandTotal > 0 ? formatNumber(+p.grandTotal) : "—"}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-0.5">
                          {/* Open invoice button — navigates to the patient's latest invoice */}
                          {p.latestInvoiceId && (
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6 text-blue-600"
                              title={`فتح الفاتورة ${p.latestInvoiceNumber || ""}`}
                              onClick={() => openInvoice(p.latestInvoiceId!)}
                              data-testid={`button-open-invoice-${p.id}`}
                            >
                              <FileText className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            title="تعديل بيانات المريض"
                            onClick={() => openEdit(p as unknown as Patient)}
                            data-testid={`button-edit-patient-${p.id}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => {
                              if (confirm(`هل تريد حذف المريض "${p.fullName}"؟`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            data-testid={`button-delete-patient-${p.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <TotalsRow rows={rows} />
                </tfoot>
              )}
            </table>
          </ScrollArea>
        )}
      </div>

      {/* ─── Add / Edit dialog ─── */}
      <PatientFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingPatient(null); }}
        editingPatient={editingPatient}
      />
    </div>
  );
}
