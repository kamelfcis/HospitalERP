/**
 * @file Patients.tsx — سجل المرضى
 *
 * هيكل الملف:
 *   1. Imports
 *   2. Constants & PAYMENT_TYPES
 *   3. TypeScript Interfaces
 *   4. Utility hook: useDebounce
 *   5. Presentational cells: AmountCell, TotalsRow
 *   6. AdmissionSection  — قسم التسكين (الدور/الغرفة/السرير/الطبيب/العملية/الدفع)
 *   7. PatientFormDialog — نافذة إضافة/تعديل مريض
 *   8. PatientGrid       — جدول المرضى مع أزرار الإجراءات
 *   9. Patients          — الصفحة الرئيسية (default export)
 *
 * قواعد مهمة:
 *   - تعديل الاسم في patients يُحدَّث تلقائياً في patient_invoice_headers + admissions (cascade في الـ backend)
 *   - الفلترة بالتاريخ أو القسم تُعيد مرضى الفترة فقط (INNER JOIN في الـ backend)
 *   - بدون فلتر → كل المرضى المسجلين (LEFT JOIN)
 *   - زر الفاتورة يفتح آخر فاتورة للمريض عبر ?loadId=
 */

// ─── 1. Imports ───────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation }        from "@tanstack/react-query";
import { useLocation }                  from "wouter";
import { apiRequest, queryClient }      from "@/lib/queryClient";
import { useAuth }                      from "@/hooks/use-auth";
import { useToast }                     from "@/hooks/use-toast";
import { formatNumber }                 from "@/lib/formatters";
import type { Patient, InsertPatient }  from "@shared/schema";

import { Button }      from "@/components/ui/button";
import { Input }       from "@/components/ui/input";
import { Label }       from "@/components/ui/label";
import { Badge }       from "@/components/ui/badge";
import { ScrollArea }  from "@/components/ui/scroll-area";
import { Skeleton }    from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Edit2, Trash2, Users, FileText, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── 2. Constants ─────────────────────────────────────────────────────────────

const PAYMENT_TYPES = [
  { value: "CASH",      label: "نقدي" },
  { value: "INSURANCE", label: "تأمين" },
] as const;

// ─── 3. TypeScript Interfaces ─────────────────────────────────────────────────

/** بيانات المريض مع إجماليات الفاتورة المحسوبة من الـ backend */
interface PatientStats {
  id: string;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  createdAt: string;
  servicesTotal:     number;
  drugsTotal:        number;
  consumablesTotal:  number;
  orRoomTotal:       number;
  stayTotal:         number;
  grandTotal:        number;
  paidTotal:         number;
  transferredTotal:  number;
  latestInvoiceId:     string | null;
  latestInvoiceNumber: string | null;
  latestInvoiceStatus: "draft" | "finalized" | "cancelled" | null;
  latestDoctorName:    string | null;
}

/** نوع الطبيب المختار من القائمة */
interface DoctorOption {
  id:        string;
  name:      string;
  specialty?: string;
}

/** القيم الخاصة بقسم التسكين — يُمرَّر بين AdmissionSection و PatientFormDialog */
interface AdmissionValues {
  // الطبيب — بحث + اختيار من قائمة (مثل BedBoard)
  doctorSearch:      string;
  selectedDoctor:    DoctorOption | null;
  showDoctorResults: boolean;
  // الغرفة والسرير
  selectedFloor:     string;
  selectedRoom:      string;
  selectedBed:       string;
  // العملية
  surgerySearch:     string;
  selectedSurgery:   { id: string; nameAr: string } | null;
  // الدفع
  paymentType:       string;
  insuranceCo:       string;
}

/** الـ setters الخاصة بـ AdmissionValues */
interface AdmissionSetters {
  setDoctorSearch:      (v: string) => void;
  setSelectedDoctor:    (v: DoctorOption | null) => void;
  setShowDoctorResults: (v: boolean) => void;
  setSelectedFloor:     (v: string) => void;
  setSelectedRoom:      (v: string) => void;
  setSelectedBed:       (v: string) => void;
  setSurgerySearch:     (v: string) => void;
  setSelectedSurgery:   (v: { id: string; nameAr: string } | null) => void;
  setPaymentType:       (v: string) => void;
  setInsuranceCo:       (v: string) => void;
}

// ─── 4. Utility Hook ──────────────────────────────────────────────────────────

/** يُأخّر تحديث القيمة بـ delay مللي‑ثانية — يُستخدم للبحث اللحظي */
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── 5. Presentational Cells ──────────────────────────────────────────────────

/** خلية قيمة مالية: إذا كانت صفر تعرض "—" */
function AmountCell({ value }: { value: number }) {
  if (!value || +value === 0) {
    return <td className="text-center text-muted-foreground">—</td>;
  }
  return <td className="text-center tabular-nums">{formatNumber(+value)}</td>;
}

/** شارة حالة الفاتورة (مسودة / اعتماد / ملغي) داخل خلية جدول */
function InvoiceStatusBadge({ status }: { status: string | null }) {
  if (!status) return <td className="text-center text-muted-foreground">—</td>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    draft:     { label: "مسودة",  variant: "secondary"    },
    finalized: { label: "اعتماد", variant: "default"      },
    cancelled: { label: "ملغي",   variant: "destructive"  },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary" as const };
  return (
    <td className="text-center">
      <Badge variant={cfg.variant} className="text-xs px-1 py-0">{cfg.label}</Badge>
    </td>
  );
}

/** صف الإجماليات الرأسية في أسفل الجدول */
function TotalsRow({ rows }: { rows: PatientStats[] }) {
  const sum = (key: keyof PatientStats) =>
    rows.reduce((acc, r) => acc + +(r[key] ?? 0), 0);

  return (
    <tr className="bg-muted/50 font-bold text-xs border-t-2">
      <td colSpan={5} className="text-right pr-2 py-1">
        الإجمالي ({rows.length} مريض)
      </td>
      <td className="text-center tabular-nums">{formatNumber(sum("servicesTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("drugsTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("consumablesTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("orRoomTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("stayTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("grandTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("paidTotal"))}</td>
      <td className="text-center tabular-nums">{formatNumber(sum("transferredTotal"))}</td>
      <td /><td />
    </tr>
  );
}

// ─── 6. AdmissionSection ──────────────────────────────────────────────────────

/**
 * قسم التسكين الاختياري داخل نافذة إضافة مريض جديد.
 *
 * يعرض: اختيار الدور → الغرفة → السرير (cascade) ،
 *        بحث الطبيب، نوع العملية، نوع الدفع، شركة التأمين.
 *
 * البيانات تُمرَّر للأعلى عبر `values` و `setters` — لا يحتوي هذا الـ component
 * على state خاص به، فقط يعرض ويحدّث.
 */
interface AdmissionSectionProps {
  open:     boolean;          // هل النافذة الأب مفتوحة (لتفعيل queries)
  values:   AdmissionValues;
  setters:  AdmissionSetters;
}

function AdmissionSection({ open, values, setters }: AdmissionSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // ── جلب بيانات البورد (الأدوار/الغرف/الأسرة)
  const { data: bedBoard = [] } = useQuery<any[]>({
    queryKey: ["/api/bed-board"],
    enabled: open,
  });

  // ── بناء قوائم الدور/الغرفة/السرير من بيانات البورد
  const floors = useMemo(() =>
    bedBoard.map((f: any) => ({ id: f.id, nameAr: f.nameAr, rooms: f.rooms ?? [] })),
    [bedBoard],
  );

  const rooms = useMemo(() =>
    floors.find(f => f.id === values.selectedFloor)?.rooms ?? [],
    [floors, values.selectedFloor],
  );

  const beds = useMemo(() => {
    if (!values.selectedRoom) return [];
    for (const f of bedBoard) {
      for (const r of (f.rooms ?? [])) {
        if (r.id === values.selectedRoom) {
          return (r.beds ?? []).filter((b: any) => b.status === "available");
        }
      }
    }
    return [];
  }, [bedBoard, values.selectedRoom]);

  // ── بحث الأطباء — يُفعَّل فقط عند كتابة حرف واحد على الأقل (مثل BedBoard)
  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", values.doctorSearch],
    queryFn: () =>
      fetch(`/api/doctors?search=${encodeURIComponent(values.doctorSearch)}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: open && values.doctorSearch.length >= 1,
  });

  // ── بحث أنواع العمليات (debounced)
  const debouncedSurgery = useDebounce(values.surgerySearch, 300);
  const { data: surgeryTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/surgery-types", debouncedSurgery],
    queryFn: async () => {
      const q = debouncedSurgery.trim()
        ? `?search=${encodeURIComponent(debouncedSurgery.trim())}`
        : "";
      const r = await fetch(`/api/surgery-types${q}`, { credentials: "include" });
      const data = await r.json();
      return Array.isArray(data) ? data : data.data ?? [];
    },
    enabled: open && expanded,
  });

  // ── إعادة تصفير الغرفة/السرير عند تغيير الدور
  useEffect(() => {
    setters.setSelectedRoom("");
    setters.setSelectedBed("");
  }, [values.selectedFloor]); // eslint-disable-line

  // ── إعادة تصفير السرير عند تغيير الغرفة
  useEffect(() => {
    setters.setSelectedBed("");
  }, [values.selectedRoom]); // eslint-disable-line

  return (
    <div className="border rounded-md overflow-hidden">

      {/* ── رأس القسم القابل للطي ── */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-semibold"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-toggle-admission"
      >
        <span>تسكين على سرير (اختياري)</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {/* ── محتوى القسم (يظهر عند الفتح) ── */}
      {expanded && (
        <div className="px-3 py-3 space-y-2">

          {/* الدور → الغرفة → السرير */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">الدور</Label>
              <Select value={values.selectedFloor} onValueChange={setters.setSelectedFloor}>
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
              <Select
                value={values.selectedRoom}
                onValueChange={setters.setSelectedRoom}
                disabled={!values.selectedFloor}
              >
                <SelectTrigger className="h-7 text-xs" data-testid="select-room">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">السرير</Label>
              <Select
                value={values.selectedBed}
                onValueChange={setters.setSelectedBed}
                disabled={!values.selectedRoom}
              >
                <SelectTrigger className="h-7 text-xs" data-testid="select-bed">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {beds.length === 0 && (
                    <SelectItem value="__none__" disabled>لا توجد أسرة فارغة</SelectItem>
                  )}
                  {beds.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* الطبيب المعالج — dropdown بحث مثل BedBoard */}
          <div className="space-y-1">
            <Label className="text-xs">الطبيب المعالج</Label>
            {values.selectedDoctor ? (
              /* الطبيب مختار — اعرض اسمه مع زر تغيير */
              <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 rounded border border-blue-200 text-xs">
                <span className="flex-1 font-medium">د. {values.selectedDoctor.name}</span>
                {values.selectedDoctor.specialty && (
                  <span className="text-muted-foreground">{values.selectedDoctor.specialty}</span>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                  onClick={() => { setters.setSelectedDoctor(null); setters.setDoctorSearch(""); }}
                >
                  تغيير
                </button>
              </div>
            ) : (
              /* لم يُختر طبيب — حقل بحث مع نتائج */
              <div className="relative">
                <Input
                  value={values.doctorSearch}
                  onChange={e => { setters.setDoctorSearch(e.target.value); setters.setShowDoctorResults(true); }}
                  onFocus={() => setters.setShowDoctorResults(true)}
                  onBlur={() => setTimeout(() => setters.setShowDoctorResults(false), 200)}
                  placeholder="ابحث باسم الطبيب..."
                  className="h-7 text-xs"
                  data-testid="input-doctor-search"
                />
                {values.showDoctorResults && values.doctorSearch.length >= 1 && (
                  <div className="absolute z-50 w-full mt-0.5 border rounded bg-background shadow-md text-xs overflow-hidden">
                    {doctors.length === 0 ? (
                      <div className="px-2 py-1.5 text-muted-foreground">لا يوجد طبيب بهذا الاسم</div>
                    ) : (
                      doctors.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          className="w-full text-right px-2 py-1.5 hover:bg-muted border-b last:border-b-0"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setters.setSelectedDoctor(d);
                            setters.setDoctorSearch("");
                            setters.setShowDoctorResults(false);
                          }}
                          data-testid={`doctor-option-${d.id}`}
                        >
                          <span className="font-medium">د. {d.name}</span>
                          {d.specialty && <span className="text-muted-foreground mr-2">{d.specialty}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* نوع العملية — بحث مع dropdown */}
          <div className="space-y-1">
            <Label className="text-xs">نوع العملية (اختياري)</Label>
            <Input
              value={values.surgerySearch}
              onChange={e => {
                setters.setSurgerySearch(e.target.value);
                setters.setSelectedSurgery(null);
              }}
              placeholder="ابحث عن عملية..."
              className="h-7 text-xs"
              data-testid="input-surgery-search"
            />
            {/* نتائج البحث */}
            {values.surgerySearch && !values.selectedSurgery && surgeryTypes.length > 0 && (
              <div className="border rounded bg-background shadow-sm max-h-28 overflow-y-auto">
                {surgeryTypes.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-right px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => {
                      setters.setSelectedSurgery(s);
                      setters.setSurgerySearch(s.nameAr);
                    }}
                  >
                    {s.nameAr}
                  </button>
                ))}
              </div>
            )}
            {/* العملية المختارة */}
            {values.selectedSurgery && (
              <Badge variant="secondary" className="text-xs">
                {values.selectedSurgery.nameAr}
              </Badge>
            )}
          </div>

          {/* نوع الدفع */}
          <div className="space-y-1">
            <Label className="text-xs">نوع الدفع</Label>
            <div className="flex gap-2">
              {PAYMENT_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  className={`flex-1 h-7 rounded text-xs border transition-colors ${
                    values.paymentType === pt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-muted"
                  }`}
                  onClick={() => setters.setPaymentType(pt.value)}
                  data-testid={`button-payment-${pt.value.toLowerCase()}`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* شركة التأمين — تظهر فقط عند اختيار تأمين */}
          {values.paymentType === "INSURANCE" && (
            <div className="space-y-1">
              <Label className="text-xs">شركة التأمين</Label>
              <Input
                value={values.insuranceCo}
                onChange={e => setters.setInsuranceCo(e.target.value)}
                placeholder="اسم شركة التأمين"
                className="h-7 text-xs"
                data-testid="input-insurance-company"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 7. PatientFormDialog ─────────────────────────────────────────────────────

/**
 * نافذة إضافة مريض جديد أو تعديل بيانات مريض موجود.
 *
 * - وضع الإضافة: يعرض بيانات المريض الأساسية + قسم التسكين الاختياري (AdmissionSection)
 * - وضع التعديل: يعرض فقط البيانات الأساسية (الاسم / التليفون / الرقم القومي / السن)
 *
 * عند الحفظ مع سرير مختار → يستدعي POST /api/beds/:id/admit (يُنشئ مريض + حجز + فاتورة)
 * عند الحفظ بدون سرير     → يستدعي POST /api/patients (مريض فقط)
 * عند التعديل              → يستدعي PATCH /api/patients/:id (ويُحدَّث الاسم cascade في الفواتير)
 */
interface PatientFormDialogProps {
  open:           boolean;
  onClose:        () => void;
  editingPatient: Patient | null;
}

function PatientFormDialog({ open, onClose, editingPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  // ── حقول المريض الأساسية
  const [fullName,   setFullName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [nationalId, setNationalId] = useState("");
  const [age,        setAge]        = useState<string>("");

  // ── حقول التسكين (تُجمَّع في كائنين values/setters لتمريرها لـ AdmissionSection)
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

  // ── ملء الحقول عند فتح نافذة التعديل / تصفيرها عند فتح نافذة الإضافة
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
    }
  }, [editingPatient, open]);

  // ── mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPatient>) => apiRequest("POST", "/api/patients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      toast({ title: "تم تحديث بيانات المريض — تم تحديث الفواتير المرتبطة تلقائياً" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending = createMutation.isPending || admitMutation.isPending || updateMutation.isPending;

  // ── التحقق من صحة المدخلات
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

  // ── إرسال النموذج
  function handleSubmit() {
    if (!validate()) return;

    const baseData: Partial<InsertPatient> = {
      fullName:   fullName.trim(),
      phone:      phone || null,
      nationalId: nationalId || null,
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    if (isEdit) {
      // تعديل — الاسم يُحدَّث cascade في الفواتير والحجوزات (منطق الـ backend)
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    if (selectedBed) {
      // إضافة مع تسكين — ينشئ مريض + حجز + فاتورة في نفس الـ transaction
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
      });
    } else {
      // إضافة بدون تسكين — ينشئ مريض فقط في جدول patients
      createMutation.mutate(baseData);
    }
  }

  // ── نص زر الحفظ حسب الوضع
  const saveLabel = isPending
    ? "جاري الحفظ..."
    : isEdit
      ? "تحديث"
      : selectedBed
        ? "إضافة وتسكين"
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

            {/* ── بيانات المريض الأساسية ── */}
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

            {/* ── قسم التسكين (للإضافة فقط، مخفي في وضع التعديل) ── */}
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

// ─── 8. PatientGrid ───────────────────────────────────────────────────────────

/**
 * جدول المرضى مع إجماليات الفواتير وأزرار الإجراءات.
 *
 * الأعمدة: # | الاسم | التليفون | الرقم القومي | السن |
 *           خدمات | أدوية | عملية | إقامة | الإجمالي | إجراءات
 *
 * - زر الفاتورة (أزرق): يفتح آخر فاتورة للمريض في صفحة فاتورة المريض.
 * - زر التعديل: يفتح نافذة تعديل بيانات المريض الأساسية.
 * - زر الحذف: يُلغّي نشاط المريض (soft delete).
 *
 * سلوك الفلتر:
 *   - الـ backend يُعيد دائماً كل المرضى (LEFT JOIN دائمي).
 *   - عند تفعيل فلتر القسم، الصفوف التي grand_total=0 تُعرض بلون أفتح
 *     مع تلميح "لا نشاط في هذا القسم" — هكذا لا يختفي أي مريض من العرض.
 *   - صف الإجماليات يحسب فقط المرضى الذين لهم نشاط (grand_total > 0).
 */
interface PatientGridProps {
  rows:           PatientStats[];
  isLoading:      boolean;
  hasDeptFilter:  boolean;    // صحيح عند تفعيل فلتر القسم — يُميّز صفوف الصفر
  canViewInvoice: boolean;    // صلاحية patient_invoices.view
  canEdit:        boolean;    // صلاحية patients.edit
  onEdit:         (p: PatientStats) => void;
  onDelete:       (p: PatientStats) => void;
  onOpenInvoice:  (invoiceId: string) => void;
}

function PatientGrid({ rows, isLoading, hasDeptFilter, canViewInvoice, canEdit, onEdit, onDelete, onOpenInvoice }: PatientGridProps) {
  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    );
  }

  // عند تفعيل فلتر القسم: مرضى لهم نشاط فيه (مجموع > 0) يُعرضون أولاً ثم الباقين
  const activeRows = hasDeptFilter ? rows.filter(r => +r.grandTotal > 0) : rows;
  const inactiveRows = hasDeptFilter ? rows.filter(r => +r.grandTotal === 0) : [];

  return (
    <ScrollArea className="h-[calc(100vh-210px)]">
      <table className="w-full text-xs">

        {/* ── رأس الجدول ── */}
        <thead className="peachtree-grid-header sticky top-0 z-10">
          <tr>
            <th className="w-8  text-center">#</th>
            <th className="text-right">الاسم</th>
            <th className="w-32 text-right">الطبيب</th>
            <th className="w-28 text-right">التليفون</th>
            <th className="w-12 text-center">السن</th>
            <th className="w-24 text-center">خدمات</th>
            <th className="w-24 text-center">أدوية</th>
            <th className="w-24 text-center">مستهلكات</th>
            <th className="w-24 text-center">عملية</th>
            <th className="w-24 text-center">إقامة</th>
            <th className="w-28 text-center font-bold">الإجمالي</th>
            <th className="w-24 text-center text-green-700">المسدد</th>
            <th className="w-28 text-center text-purple-700">محول لطبيب</th>
            <th className="w-20 text-center">الحالة</th>
            <th className="w-20 text-center">إجراءات</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="peachtree-grid-row">
              <td colSpan={15} className="text-center py-6 text-muted-foreground">
                لا يوجد مرضى
              </td>
            </tr>
          ) : (
            <>
              {/* ── المرضى الذين لهم نشاط في القسم المختار (أو كل المرضى بدون فلتر) ── */}
              {activeRows.map((p, idx) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  index={idx + 1}
                  dimmed={false}
                  canViewInvoice={canViewInvoice}
                  canEdit={canEdit}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onOpenInvoice={onOpenInvoice}
                />
              ))}

              {/* ── فاصل + مرضى بلا نشاط في القسم المختار ── */}
              {inactiveRows.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={14}
                      className="py-1 px-2 text-xs text-muted-foreground bg-muted/20 border-y"
                    >
                      المرضى التاليون لا توجد لهم فواتير في هذا القسم ({inactiveRows.length})
                    </td>
                  </tr>
                  {inactiveRows.map((p, idx) => (
                    <PatientRow
                      key={p.id}
                      patient={p}
                      index={activeRows.length + idx + 1}
                      dimmed={true}
                      canViewInvoice={canViewInvoice}
                      canEdit={canEdit}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onOpenInvoice={onOpenInvoice}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </tbody>

        {/* ── صف الإجماليات — يحسب فقط المرضى الذين لهم نشاط ── */}
        {activeRows.length > 0 && (
          <tfoot>
            <TotalsRow rows={activeRows} />
          </tfoot>
        )}

      </table>
    </ScrollArea>
  );
}

/**
 * صف مريض واحد داخل الجدول.
 * - `dimmed`         = صحيح عندما لا يكون للمريض نشاط في القسم المفلتر عليه.
 * - `canViewInvoice` = صلاحية patient_invoices.view — تُظهر زر الفاتورة.
 * - `canEdit`        = صلاحية patients.edit — تُظهر أزرار التعديل والحذف.
 */
interface PatientRowProps {
  patient:        PatientStats;
  index:          number;
  dimmed:         boolean;
  canViewInvoice: boolean;
  canEdit:        boolean;
  onEdit:         (p: PatientStats) => void;
  onDelete:       (p: PatientStats) => void;
  onOpenInvoice:  (invoiceId: string) => void;
}

function PatientRow({ patient: p, index, dimmed, canViewInvoice, canEdit, onEdit, onDelete, onOpenInvoice }: PatientRowProps) {
  const rowClass = `peachtree-grid-row${dimmed ? " opacity-50" : ""}`;

  return (
    <tr className={rowClass} data-testid={`row-patient-${p.id}`}>
      <td className="text-center text-muted-foreground">{index}</td>
      <td className="font-medium"  data-testid={`text-name-${p.id}`}>{p.fullName}</td>
      <td className="text-muted-foreground text-xs truncate max-w-[8rem]" data-testid={`text-doctor-${p.id}`}>{p.latestDoctorName || "—"}</td>
      <td className="font-mono"    data-testid={`text-phone-${p.id}`}>{p.phone || "—"}</td>
      <td className="text-center"  data-testid={`text-age-${p.id}`}>{p.age ?? "—"}</td>
      <AmountCell value={+p.servicesTotal} />
      <AmountCell value={+p.drugsTotal} />
      <AmountCell value={+p.consumablesTotal} />
      <AmountCell value={+p.orRoomTotal} />
      <AmountCell value={+p.stayTotal} />
      <td className="text-center font-bold tabular-nums" data-testid={`text-total-${p.id}`}>
        {+p.grandTotal > 0 ? formatNumber(+p.grandTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-green-700" data-testid={`text-paid-${p.id}`}>
        {+p.paidTotal > 0 ? formatNumber(+p.paidTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-purple-700" data-testid={`text-transferred-${p.id}`}>
        {+p.transferredTotal > 0 ? formatNumber(+p.transferredTotal) : "—"}
      </td>
      <InvoiceStatusBadge status={p.latestInvoiceStatus} />

      {/* أزرار الإجراءات — مُقيَّدة بالصلاحيات */}
      <td>
        <div className="flex items-center justify-center gap-0.5">

          {/* فتح آخر فاتورة — يحتاج صلاحية patient_invoices.view */}
          {canViewInvoice && p.latestInvoiceId && (
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-blue-600"
              title={`فتح الفاتورة ${p.latestInvoiceNumber || ""}`}
              onClick={() => onOpenInvoice(p.latestInvoiceId!)}
              data-testid={`button-open-invoice-${p.id}`}
            >
              <FileText className="h-3 w-3" />
            </Button>
          )}

          {/* تعديل + حذف — يحتاج صلاحية patients.edit */}
          {canEdit && (
            <>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                title="تعديل بيانات المريض"
                onClick={() => onEdit(p)}
                data-testid={`button-edit-patient-${p.id}`}
              >
                <Edit2 className="h-3 w-3" />
              </Button>

              {/* الحذف — مسموح فقط إذا كانت إجمالي الفواتير = صفر */}
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                disabled={+p.grandTotal > 0}
                title={
                  +p.grandTotal > 0
                    ? "لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية"
                    : "حذف المريض"
                }
                onClick={() => onDelete(p)}
                data-testid={`button-delete-patient-${p.id}`}
              >
                <Trash2 className={`h-3 w-3 ${+p.grandTotal > 0 ? "text-muted-foreground" : "text-destructive"}`} />
              </Button>
            </>
          )}

        </div>
      </td>
    </tr>
  );
}

// ─── 9. Patients — الصفحة الرئيسية (default export) ──────────────────────────

/** تاريخ اليوم بصيغة YYYY-MM-DD — يُستخدم كقيمة افتراضية لفلاتر التاريخ */
const todayISO = new Date().toISOString().slice(0, 10);

/**
 * صفحة سجل المرضى — تجمع كل المكونات معاً.
 *
 * State المُدار هنا:
 *   - فلاتر البحث: searchQuery, dateFrom, dateTo, deptId
 *   - حالة النافذة: dialogOpen, editingPatient
 *
 * Data flow:
 *   filters → GET /api/patients/stats → rows → PatientGrid
 *   editingPatient → PatientFormDialog
 */
export default function Patients() {
  const [, navigate]        = useLocation();
  const { hasPermission }   = useAuth();
  const { toast }           = useToast();

  const canCreate      = hasPermission("patients.create");
  const canEdit        = hasPermission("patients.edit");
  const canViewInvoice = hasPermission("patient_invoices.view");

  // ── حالة الفلاتر
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom,    setDateFrom]    = useState(todayISO);
  const [dateTo,      setDateTo]      = useState(todayISO);
  const [deptId,      setDeptId]      = useState("");

  // ── حالة النافذة
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 350);

  // ── جلب الأقسام لـ dropdown الفلاتر
  const { data: departments = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/departments"],
  });

  // ── جلب إحصائيات المرضى
  // بدون فلتر  → كل المرضى (LEFT JOIN في الـ backend)
  // مع فلتر    → مرضى الفترة/القسم فقط (INNER JOIN في الـ backend)
  const statsParams = new URLSearchParams();
  if (debouncedSearch.trim()) statsParams.set("search", debouncedSearch.trim());
  if (dateFrom) statsParams.set("dateFrom", dateFrom);
  if (dateTo)   statsParams.set("dateTo",   dateTo);
  if (deptId)   statsParams.set("deptId",   deptId);

  const { data: rows = [], isLoading } = useQuery<PatientStats[]>({
    queryKey: ["/api/patients/stats", debouncedSearch, dateFrom, dateTo, deptId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/stats?${statsParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل في جلب بيانات المرضى");
      return res.json();
    },
  });

  const hasFilter = !!(dateFrom || dateTo || deptId);

  // ── حذف مريض (soft delete)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
    },
    onError: (e: Error) => toast({ title: "خطأ في الحذف", description: e.message, variant: "destructive" }),
  });

  // ── handlers لفتح النافذة / الفاتورة / الحذف
  function handleAddNew()    { setEditingPatient(null); setDialogOpen(true); }
  function handleEdit(p: PatientStats) {
    setEditingPatient(p as unknown as Patient);
    setDialogOpen(true);
  }
  function handleDelete(p: PatientStats) {
    if (confirm(`هل تريد حذف المريض "${p.fullName}"؟`)) {
      deleteMutation.mutate(p.id);
    }
  }
  function handleOpenInvoice(invoiceId: string) {
    // يفتح فاتورة المريض في صفحة فاتورة المريض — ?loadId يُحمَّل تلقائياً في PatientInvoicePage
    navigate(`/patient-invoices?loadId=${invoiceId}`);
  }
  function handleCloseDialog() {
    setDialogOpen(false);
    setEditingPatient(null);
  }
  function handleClearFilters() {
    setDateFrom(""); setDateTo(""); setDeptId("");
  }

  return (
    <div className="p-3 space-y-2 h-full flex flex-col">

      {/* ── شريط العنوان ── */}
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
        {canCreate && (
          <Button
            size="sm" onClick={handleAddNew}
            className="h-7 text-xs px-3"
            data-testid="button-add-patient"
          >
            <Plus className="h-3 w-3 ml-1" />
            إضافة مريض
          </Button>
        )}
      </div>

      {/* ── شريط الفلاتر ── */}
      <div className="peachtree-toolbar rounded flex items-center gap-3 flex-wrap">

        {/* بحث نصي */}
        <div className="flex items-center gap-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو التليفون أو الطبيب..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="peachtree-input text-xs w-48"
            data-testid="input-search-patients"
          />
        </div>

        {/* من تاريخ */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-from"
          />
        </div>

        {/* إلى تاريخ */}
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-to"
          />
        </div>

        {/* فلتر القسم */}
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

        {/* زر مسح الفلاتر + تنبيه — يظهر فقط عند وجود فلتر نشط */}
        {hasFilter && (
          <>
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs px-2"
              onClick={handleClearFilters}
              data-testid="button-clear-filters"
            >
              مسح الفلاتر
            </Button>
            <span className="text-xs text-amber-600 font-medium">
              ● يعرض مرضى الفترة / القسم المحدد فقط
            </span>
          </>
        )}

      </div>

      {/* ── جدول المرضى ── */}
      <div className="peachtree-grid rounded flex-1 overflow-hidden">
        <PatientGrid
          rows={rows}
          isLoading={isLoading}
          hasDeptFilter={!!deptId}
          canViewInvoice={canViewInvoice}
          canEdit={canEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenInvoice={handleOpenInvoice}
        />
      </div>

      {/* ── نافذة الإضافة / التعديل ── */}
      <PatientFormDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        editingPatient={editingPatient}
      />

    </div>
  );
}
