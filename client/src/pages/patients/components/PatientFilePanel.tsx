// ===== Imports =====
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, Printer, User, Phone, CreditCard, CalendarDays,
  Stethoscope, Pill, FlaskConical, Receipt, ChevronDown, ChevronUp,
  XCircle, Banknote, Bed, TrendingUp, TrendingDown, Activity,
  AlertTriangle, Building2, UserCheck, LayoutGrid,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ===== Types / Interfaces =====

interface PatientSummary {
  totalClinicVisits: number;
  totalAdmissions: number;
  totalInvoices: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  firstVisitDate: string | null;
  lastActivityDate: string | null;
}

interface ConsultationInfo {
  id: string;
  chiefComplaint?: string;
  diagnosis?: string;
  notes?: string;
  consultationFee?: string;
  finalAmount?: string;
  paymentStatus?: string;
}

interface DrugInfo {
  drug_name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  unit_level?: string;
}

interface ServiceOrderInfo {
  order_type?: string;
  service_name_manual?: string;
  target_name?: string;
  status?: string;
  quantity?: number;
}

interface ClinicEvent {
  eventType: "clinic_visit";
  eventId: string;
  eventDate: string;
  location: string;
  doctorName: string;
  turnNumber: number;
  status: string;
  consultation: ConsultationInfo | null;
  drugs: DrugInfo[];
  serviceOrders: ServiceOrderInfo[];
}

interface AdmissionEvent {
  eventType: "admission";
  eventId: string;
  eventDate: string;
  admissionNumber: string;
  dischargeDate?: string | null;
  status: string;
  doctorName?: string;
  location?: string | null;
  notes?: string;
}

interface InvoiceEvent {
  eventType: "invoice";
  eventId: string;
  eventDate: string;
  invoiceNumber: string;
  amount: string;
  paidAmount: string;
  status: string;
  // OPD context fields
  patientType?: string | null;
  createdAt?: string | null;
  appointmentId?: string | null;
  aptStatus?: string | null;               // waiting | in_consultation | done | no_show | cancelled
  paymentType?: string | null;             // CASH | INSURANCE | CONTRACT
  accountingPostedAdvance?: boolean | null;
  accountingPostedRevenue?: boolean | null;
  clinicName?: string | null;
  doctorName?: string | null;
  departmentName?: string | null;
}

type TimelineEvent = ClinicEvent | AdmissionEvent | InvoiceEvent;

interface PatientTimeline {
  patient: {
    id: string;
    patientCode?: string;
    fullName: string;
    phone?: string;
    nationalId?: string;
    age?: number;
    createdAt?: string;
  };
  summary: PatientSummary;
  events: TimelineEvent[];
}

type TabFilter = "all" | "clinic_visit" | "admission" | "invoice";

// ===== Constants =====

const STALE_MANUAL_DRAFT_DAYS = 7;

const CLINIC_STATUS_MAP: Record<string, { label: string; className: string }> = {
  done:             { label: "مكتمل",      className: "bg-green-50 text-green-700 border-green-200" },
  waiting:          { label: "في الانتظار", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  in_consultation:  { label: "داخل الكشف", className: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled:        { label: "ملغي",       className: "bg-red-50 text-red-700 border-red-200" },
  pending:          { label: "منتظر",      className: "bg-amber-50 text-amber-700 border-amber-200" },
  executed:         { label: "تم التنفيذ", className: "bg-green-50 text-green-700 border-green-200" },
  paid:             { label: "مدفوع",      className: "bg-green-50 text-green-700 border-green-200" },
  waived:           { label: "معفى",       className: "bg-purple-50 text-purple-700 border-purple-200" },
  active:           { label: "نشط",        className: "bg-blue-50 text-blue-700 border-blue-200" },
  discharged:       { label: "خرج",        className: "bg-gray-50 text-gray-700 border-gray-200" },
  draft:            { label: "مسودة",      className: "bg-gray-50 text-gray-600 border-gray-200" },
  finalized:        { label: "معتمد",      className: "bg-green-50 text-green-700 border-green-200" },
};

// ===== Source Resolution Helpers =====

type InvoiceSource = "OPD" | "MANUAL" | "INPATIENT_SERVICES" | "CANCELLED" | "CONTRACT_INSURANCE" | "OTHER";

function resolveInvoiceSource(ev: InvoiceEvent): InvoiceSource {
  if (ev.status === "cancelled") return "CANCELLED";
  if (ev.appointmentId) {
    const pt = ev.paymentType ?? "";
    if (pt === "INSURANCE" || pt === "CONTRACT") return "CONTRACT_INSURANCE";
    return "OPD";
  }
  if (ev.patientType === "contract") return "CONTRACT_INSURANCE";
  if (ev.status === "draft") return "MANUAL";
  return "MANUAL";
}

// ===== Invoice Classification Helpers =====

type InvoiceClassification = {
  label: string;
  badgeClass: string;
  borderClass: string;
  warning?: string;
};

function classifyInvoice(ev: InvoiceEvent): InvoiceClassification {
  const source = resolveInvoiceSource(ev);

  if (source === "CANCELLED") {
    return {
      label: "ملغاة",
      badgeClass: "bg-gray-100 text-gray-600 border-gray-300",
      borderClass: "border-r-gray-300",
    };
  }

  if (source === "OPD") {
    const apt = ev.aptStatus ?? "";
    if (apt === "no_show") {
      return {
        label: "عيادة — لم يحضر المريض",
        badgeClass: "bg-gray-100 text-gray-600 border-gray-300",
        borderClass: "border-r-gray-400",
      };
    }
    if (apt === "cancelled") {
      return {
        label: "عيادة — ملغاة",
        badgeClass: "bg-gray-100 text-gray-500 border-gray-300",
        borderClass: "border-r-gray-300",
      };
    }
    if (apt === "done") {
      if (ev.accountingPostedRevenue) {
        return {
          label: "عيادة — اكتمل الكشف",
          badgeClass: "bg-green-50 text-green-700 border-green-300",
          borderClass: "border-r-green-500",
        };
      }
      return {
        label: "عيادة — اكتمل الكشف",
        badgeClass: "bg-green-50 text-green-700 border-green-300",
        borderClass: "border-r-green-400",
      };
    }
    return {
      label: "عيادة — بانتظار الكشف",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-300",
      borderClass: "border-r-blue-400",
    };
  }

  if (source === "CONTRACT_INSURANCE") {
    return {
      label: "عيادة — تعاقد / تأمين لم يُسدد",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-300",
      borderClass: "border-r-amber-400",
    };
  }

  if (source === "MANUAL") {
    if (ev.status === "finalized") {
      return {
        label: "خدمات / إقامة — معتمدة",
        badgeClass: "bg-green-50 text-green-700 border-green-300",
        borderClass: "border-r-purple-400",
      };
    }
    const isStale = isManualDraftStale(ev);
    if (isStale) {
      return {
        label: "فاتورة يدوية قديمة",
        badgeClass: "bg-red-50 text-red-700 border-red-300",
        borderClass: "border-r-red-400",
        warning: "فاتورة يدوية قديمة تحتاج مراجعة أو إلغاء",
      };
    }
    return {
      label: "مسودة يدوية",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-300",
      borderClass: "border-r-amber-300",
    };
  }

  return {
    label: "فاتورة",
    badgeClass: "bg-gray-50 text-gray-600 border-gray-300",
    borderClass: "border-r-gray-300",
  };
}

// ===== Display Derivation Helpers =====

function fmtDate(d?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-EG", opts ?? { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(v?: string | number | null) {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? "0" : n.toLocaleString("ar-EG");
}

function isManualDraftStale(ev: InvoiceEvent): boolean {
  const ref = ev.createdAt ?? ev.eventDate;
  if (!ref) return false;
  const ageMs = Date.now() - new Date(ref).getTime();
  return ageMs > STALE_MANUAL_DRAFT_DAYS * 24 * 60 * 60 * 1000;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const s = CLINIC_STATUS_MAP[status] ?? { label: status, className: "bg-gray-50 text-gray-700 border-gray-200" };
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.label}</Badge>;
}

// ===== Timeline Card Rendering =====

function ClinicEventCard({ ev }: { ev: ClinicEvent }) {
  const [open, setOpen] = useState(true);
  const hasDrugs   = ev.drugs.length > 0;
  const hasOrders  = ev.serviceOrders.length > 0;
  const hasDetails = !!ev.consultation || hasDrugs || hasOrders;

  return (
    <Card className="border-r-4 border-r-blue-400 shadow-sm" data-testid={`event-clinic-${ev.eventId}`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setOpen(!open)}
        data-testid={`toggle-clinic-${ev.eventId}`}
      >
        <Stethoscope className="h-4 w-4 text-blue-500 shrink-0" />
        <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
          <span className="font-semibold text-sm">{ev.location}</span>
          <span className="text-xs text-muted-foreground">
            {fmtDate(ev.eventDate)} · دور #{ev.turnNumber} · د. {ev.doctorName}
          </span>
        </div>
        <StatusBadge status={ev.status} />
        {hasDetails && (open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && hasDetails && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {ev.consultation && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground border-b pb-1.5">
                <Stethoscope className="h-3.5 w-3.5" />
                الكشف الطبي
                {ev.consultation.paymentStatus && <StatusBadge status={ev.consultation.paymentStatus} />}
              </div>
              {ev.consultation.chiefComplaint && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">الشكوى:</span>{ev.consultation.chiefComplaint}</div>
              )}
              {ev.consultation.diagnosis && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">التشخيص:</span><span className="font-medium">{ev.consultation.diagnosis}</span></div>
              )}
              {ev.consultation.notes && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">ملاحظات:</span>{ev.consultation.notes}</div>
              )}
              {parseFloat(String(ev.consultation.finalAmount || 0)) > 0 && (
                <div className="flex items-center gap-2 text-xs border-t pt-1.5">
                  <Banknote className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">الإجمالي:</span>
                  <span className="font-bold text-green-700">{fmtMoney(ev.consultation.finalAmount)} ج.م</span>
                </div>
              )}
            </div>
          )}
          {hasDrugs && (
            <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground border-b pb-1.5">
                <Pill className="h-3.5 w-3.5 text-green-500" />
                الأدوية ({ev.drugs.length})
              </div>
              {ev.drugs.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm pr-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <span className="font-medium">{d.drug_name}</span>
                  {d.dose && <span className="text-xs text-muted-foreground">{d.dose}</span>}
                  {d.frequency && <span className="text-xs text-muted-foreground">{d.frequency}</span>}
                  {d.duration && <span className="text-xs text-muted-foreground">لمدة {d.duration}</span>}
                  {d.quantity && <span className="text-xs text-muted-foreground">× {d.quantity}</span>}
                </div>
              ))}
            </div>
          )}
          {hasOrders && (
            <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground border-b pb-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
                الأوامر الطبية ({ev.serviceOrders.length})
              </div>
              {ev.serviceOrders.map((o, i) => (
                <div key={i} className="flex items-center gap-3 text-sm pr-2">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    {o.order_type === "lab" ? "تحليل" : o.order_type === "radiology" ? "أشعة" : o.order_type === "service" ? "خدمة" : o.order_type || "—"}
                  </span>
                  <span className="flex-1">{o.service_name_manual || o.target_name || "—"}</span>
                  {o.status && <StatusBadge status={o.status} />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AdmissionEventCard({ ev }: { ev: AdmissionEvent }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border-r-4 border-r-green-400 shadow-sm" data-testid={`event-admission-${ev.eventId}`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setOpen(!open)}
      >
        <Bed className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
          <span className="font-semibold text-sm">
            إقامة {ev.location ? `— ${ev.location}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">
            {fmtDate(ev.eventDate)} · رقم: {ev.admissionNumber}
            {ev.doctorName ? ` · د. ${ev.doctorName}` : ""}
          </span>
        </div>
        <StatusBadge status={ev.status} />
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0">
          <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10 text-sm">
            <div className="flex gap-6 flex-wrap text-xs text-muted-foreground">
              <span>الدخول: <span className="text-foreground font-medium">{fmtDate(ev.eventDate)}</span></span>
              <span>الخروج: <span className="text-foreground font-medium">{fmtDate(ev.dischargeDate)}</span></span>
            </div>
            {ev.notes && <div><span className="text-muted-foreground text-xs">ملاحظات: </span>{ev.notes}</div>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function InvoiceEventCard({ ev }: { ev: InvoiceEvent }) {
  const cls     = classifyInvoice(ev);
  const source  = resolveInvoiceSource(ev);
  const isOPD   = source === "OPD" || source === "CONTRACT_INSURANCE";

  const amount      = parseFloat(String(ev.amount ?? 0));
  const paid        = parseFloat(String(ev.paidAmount ?? 0));
  const outstanding = Math.max(0, amount - paid);

  const dept   = ev.departmentName  || (isOPD ? "قسم غير محدد"   : null);
  const clinic = ev.clinicName      || (isOPD ? "عيادة غير محددة" : null);
  const doctor = ev.doctorName      || (isOPD ? "طبيب غير محدد"  : null);

  return (
    <Card
      className={`border-r-4 ${cls.borderClass} shadow-sm`}
      data-testid={`event-invoice-${ev.eventId}`}
    >
      <CardContent className="px-4 py-3 space-y-1.5">

        {/* Row 1 — classification badge + invoice number */}
        <div className="flex items-center gap-2 flex-wrap">
          <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
          <Badge variant="outline" className={`text-xs ${cls.badgeClass}`}>
            {cls.label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">#{ev.invoiceNumber}</span>
        </div>

        {/* Row 2 — OPD context: department · clinic · doctor */}
        {isOPD && (
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pr-6">
            {dept && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {dept}
              </span>
            )}
            {clinic && (
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />
                {clinic}
              </span>
            )}
            {doctor && (
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                د. {doctor}
              </span>
            )}
          </div>
        )}

        {/* Row 3 — date + financial details */}
        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap pr-6">
          <span>{fmtDate(ev.eventDate)}</span>
          <span>الإجمالي: <span className="text-foreground font-medium">{fmtMoney(amount)} ج.م</span></span>
          <span>المسدد: <span className="text-green-700 font-medium">{fmtMoney(paid)} ج.م</span></span>
          {outstanding > 0 && (
            <span>المتبقي: <span className="text-red-600 font-medium">{fmtMoney(outstanding)} ج.م</span></span>
          )}
        </div>

        {/* Row 4 — stale draft warning */}
        {cls.warning && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {cls.warning}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function TimelineEventCard({ ev }: { ev: TimelineEvent }) {
  if (ev.eventType === "clinic_visit") return <ClinicEventCard ev={ev} />;
  if (ev.eventType === "admission")   return <AdmissionEventCard ev={ev} />;
  return <InvoiceEventCard ev={ev as InvoiceEvent} />;
}

// ===== Local State =====

interface PatientFilePanelProps {
  patientId: string;
  showPrint?: boolean;
}

const TABS: { key: TabFilter; label: string; icon: React.ReactNode }[] = [
  { key: "all",         label: "كل الأحداث",     icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "clinic_visit",label: "زيارات العيادة",  icon: <Stethoscope className="h-3.5 w-3.5" /> },
  { key: "admission",   label: "التسكين",         icon: <Bed className="h-3.5 w-3.5" /> },
  { key: "invoice",     label: "الفواتير",        icon: <Receipt className="h-3.5 w-3.5" /> },
];

export function PatientFilePanel({ patientId, showPrint = true }: PatientFilePanelProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [, navigate] = useLocation();

  // ===== Derived Values =====

  const { data, isLoading, isError } = useQuery<PatientTimeline>({
    queryKey: ["/api/patients", patientId, "timeline"],
    queryFn: () =>
      apiRequest("GET", `/api/patients/${patientId}/timeline`).then((r) => r.json()),
    enabled: !!patientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <XCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm text-muted-foreground">لم يتم العثور على بيانات المريض</p>
      </div>
    );
  }

  const { patient, summary, events } = data;

  const filtered = activeTab === "all"
    ? events
    : events.filter((e) => e.eventType === activeTab);

  const tabCount = (key: TabFilter) =>
    key === "all" ? events.length : events.filter((e) => e.eventType === key).length;

  const totalVisits = summary.totalClinicVisits + summary.totalAdmissions;

  return (
    <div className="space-y-4" dir="rtl">

      {/* ───── رأس المريض ───── */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 border border-blue-300 shrink-0">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold" data-testid="text-patient-name">{patient.fullName}</h2>
                {patient.patientCode && (
                  <Badge variant="outline" className="font-mono text-xs bg-blue-50 border-blue-300 text-blue-800" data-testid="text-patient-code">
                    {patient.patientCode}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {patient.age && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />{patient.age} سنة
                  </span>
                )}
                {patient.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />{patient.phone}
                  </span>
                )}
                {patient.nationalId && (
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />{patient.nationalId}
                  </span>
                )}
                {summary.firstVisitDate && (
                  <span className="flex items-center gap-1">
                    مريض منذ: {fmtDate(summary.firstVisitDate, { year: "numeric", month: "long" })}
                  </span>
                )}
                {summary.lastActivityDate && (
                  <span className="flex items-center gap-1">
                    آخر نشاط: {fmtDate(summary.lastActivityDate)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="default" size="sm" className="h-7 text-xs gap-1 print:hidden"
                onClick={() => navigate(`/patients/${patientId}/file`)}
                data-testid="button-open-full-file"
              >
                <LayoutGrid className="h-3 w-3" />
                الملف الكامل
              </Button>
              {showPrint && (
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1 print:hidden"
                  onClick={() => window.print()}
                  data-testid="button-print-file"
                >
                  <Printer className="h-3 w-3" />
                  طباعة
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───── ملخص مالي ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">إجمالي المطالبات</span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-total-billed">
              {fmtMoney(summary.totalBilled)}
            </div>
            <div className="text-xs text-muted-foreground">ج.م</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
              <Banknote className="h-3.5 w-3.5" />
              <span className="text-xs">المسدد</span>
            </div>
            <div className="text-lg font-bold text-green-700" data-testid="text-total-paid">
              {fmtMoney(summary.totalPaid)}
            </div>
            <div className="text-xs text-muted-foreground">ج.م</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <div className={`flex items-center justify-center gap-1 mb-1 ${summary.totalOutstanding > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-xs">المتبقي</span>
            </div>
            <div className={`text-lg font-bold ${summary.totalOutstanding > 0 ? "text-red-600" : "text-gray-400"}`} data-testid="text-outstanding">
              {fmtMoney(summary.totalOutstanding)}
            </div>
            <div className="text-xs text-muted-foreground">ج.م</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-xs">إجمالي الزيارات</span>
            </div>
            <div className="text-lg font-bold" data-testid="text-total-visits">{totalVisits}</div>
            <div className="text-xs text-muted-foreground">
              {summary.totalClinicVisits > 0 && `${summary.totalClinicVisits} عيادة`}
              {summary.totalClinicVisits > 0 && summary.totalAdmissions > 0 && " · "}
              {summary.totalAdmissions > 0 && `${summary.totalAdmissions} إقامة`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── تبويبات الفلتر ───── */}
      <div className="flex gap-1 flex-wrap border-b pb-0">
        {TABS.map((tab) => {
          const count = tabCount(tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border border-b-0 transition-colors ${
                isActive
                  ? "bg-background text-foreground border-border -mb-px"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/70"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              {tab.icon}
              {tab.label}
              {count > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 min-w-4">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ───── الأحداث ───── */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
          <Stethoscope className="h-7 w-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد أحداث في هذه الفئة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev) => (
            <TimelineEventCard key={`${ev.eventType}-${ev.eventId}`} ev={ev} />
          ))}
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .space-y-4, .space-y-4 * { visibility: visible; }
          .space-y-4 { position: absolute; inset: 0; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
