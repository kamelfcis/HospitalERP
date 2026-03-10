import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, Printer, User, Phone, CreditCard, CalendarDays,
  Stethoscope, Pill, FlaskConical, Receipt, ChevronDown, ChevronUp,
  CheckCircle2, Clock, XCircle, Banknote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface PatientJourney {
  patient: {
    id: string;
    patientCode?: string;
    fullName: string;
    phone?: string;
    nationalId?: string;
    age?: number;
    createdAt?: string;
  };
  visits: VisitRecord[];
}

interface VisitRecord {
  appointmentId: string;
  appointmentDate: string;
  turnNumber: number;
  appointmentStatus: string;
  clinicName: string;
  doctorName: string;
  consultation: {
    id: string;
    chiefComplaint?: string;
    diagnosis?: string;
    notes?: string;
    consultationFee?: string;
    discountType?: string;
    discountValue?: string;
    finalAmount?: string;
    paymentStatus?: string;
  } | null;
  drugs: Array<{
    drug_name: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    quantity?: number;
    unit_level?: string;
  }>;
  serviceOrders: Array<{
    order_type?: string;
    service_name_manual?: string;
    target_name?: string;
    status?: string;
    executed_at?: string;
    quantity?: number;
    unit_price?: string;
  }>;
  invoices: Array<{
    invoice_number?: string;
    net_amount?: string;
    status?: string;
    invoice_date?: string;
  }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    done:             { label: "مكتمل",      className: "bg-green-50 text-green-700 border-green-200" },
    waiting:          { label: "في الانتظار", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    in_consultation:  { label: "داخل الكشف", className: "bg-blue-50 text-blue-700 border-blue-200" },
    cancelled:        { label: "ملغي",       className: "bg-red-50 text-red-700 border-red-200" },
    pending:          { label: "منتظر",      className: "bg-amber-50 text-amber-700 border-amber-200" },
    executed:         { label: "تم التنفيذ", className: "bg-green-50 text-green-700 border-green-200" },
    paid:             { label: "مدفوع",      className: "bg-green-50 text-green-700 border-green-200" },
    waived:           { label: "معفى",       className: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  const s = map[status] || { label: status, className: "bg-gray-50 text-gray-700 border-gray-200" };
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.label}</Badge>;
}

function VisitCard({ visit }: { visit: VisitRecord }) {
  const [open, setOpen] = useState(true);
  const fmtDate = visit.appointmentDate
    ? new Date(visit.appointmentDate).toLocaleDateString("ar-EG", {
        weekday: "short", year: "numeric", month: "long", day: "numeric",
      })
    : "";
  const fee   = parseFloat(String(visit.consultation?.consultationFee || 0));
  const disc  = parseFloat(String(visit.consultation?.discountValue || 0));
  const final = parseFloat(String(visit.consultation?.finalAmount || 0));

  return (
    <Card className="border-r-4 border-r-blue-400" data-testid={`visit-card-${visit.appointmentId}`}>
      <CardHeader className="p-0">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/40 transition-colors rounded-t-lg"
          onClick={() => setOpen(!open)}
        >
          <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="font-semibold text-sm text-foreground" dir="ltr">{fmtDate}</span>
          <span className="text-xs text-muted-foreground">دور #{visit.turnNumber}</span>
          <Badge variant="outline" className="text-xs">{visit.clinicName}</Badge>
          <span className="text-xs text-muted-foreground">د. {visit.doctorName}</span>
          <div className="flex-1" />
          <StatusBadge status={visit.appointmentStatus} />
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {visit.consultation && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium border-b pb-2">
                <Stethoscope className="h-4 w-4 text-blue-500" />
                الكشف الطبي
                {visit.consultation.paymentStatus && <StatusBadge status={visit.consultation.paymentStatus} />}
              </div>
              {visit.consultation.chiefComplaint && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">الشكوى:</span><span>{visit.consultation.chiefComplaint}</span></div>
              )}
              {visit.consultation.diagnosis && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">التشخيص:</span><span className="font-medium">{visit.consultation.diagnosis}</span></div>
              )}
              {visit.consultation.notes && (
                <div className="text-sm"><span className="text-muted-foreground ml-1">ملاحظات:</span><span>{visit.consultation.notes}</span></div>
              )}
              {fee > 0 && (
                <div className="flex items-center gap-3 text-xs border-t pt-2 mt-1">
                  <Banknote className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">رسم الكشف:</span>
                  <span>{fee.toLocaleString("ar-EG")} ج.م</span>
                  {disc > 0 && (
                    <>
                      <span className="text-muted-foreground">خصم:</span>
                      <span className="text-red-600">
                        {visit.consultation.discountType === "percent" ? `${disc}%` : `${disc.toLocaleString("ar-EG")} ج.م`}
                      </span>
                      <span className="text-muted-foreground">=</span>
                      <span className="font-bold text-green-700">{final.toLocaleString("ar-EG")} ج.م</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {visit.drugs.length > 0 && (
            <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium border-b pb-2">
                <Pill className="h-4 w-4 text-green-500" />
                الأدوية المكتوبة ({visit.drugs.length})
              </div>
              {visit.drugs.map((d, i) => (
                <div key={i} className="flex items-start gap-3 text-sm pr-2">
                  <span className="w-4 text-muted-foreground text-xs mt-0.5">{i + 1}.</span>
                  <div className="flex flex-wrap gap-2 flex-1">
                    <span className="font-medium">{d.drug_name}</span>
                    {d.dose && <span className="text-muted-foreground text-xs">{d.dose}</span>}
                    {d.frequency && <span className="text-muted-foreground text-xs">{d.frequency}</span>}
                    {d.duration && <span className="text-muted-foreground text-xs">لمدة {d.duration}</span>}
                    {d.quantity && <span className="text-muted-foreground text-xs">× {d.quantity} {d.unit_level || ""}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {visit.serviceOrders.length > 0 && (
            <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium border-b pb-2">
                <FlaskConical className="h-4 w-4 text-purple-500" />
                الأوامر الطبية ({visit.serviceOrders.length})
              </div>
              {visit.serviceOrders.map((o, i) => (
                <div key={i} className="flex items-center gap-3 text-sm pr-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">
                    {o.order_type === "lab" ? "تحليل" : o.order_type === "radiology" ? "أشعة" : o.order_type || "خدمة"}
                  </span>
                  <span className="flex-1">{o.service_name_manual || o.target_name || "—"}</span>
                  {o.status && <StatusBadge status={o.status} />}
                </div>
              ))}
            </div>
          )}
          {visit.invoices.length > 0 && (
            <div className="border rounded-lg p-3 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium border-b pb-2">
                <Receipt className="h-4 w-4 text-amber-500" />
                الفواتير ({visit.invoices.length})
              </div>
              {visit.invoices.map((inv, i) => (
                <div key={i} className="flex items-center gap-3 text-sm pr-2">
                  {inv.invoice_number && <span className="font-mono text-xs text-muted-foreground">#{inv.invoice_number}</span>}
                  <span className="flex-1">{parseFloat(String(inv.net_amount || 0)).toLocaleString("ar-EG")} ج.م</span>
                  {inv.status && <StatusBadge status={inv.status} />}
                  {inv.invoice_date && (
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {new Date(inv.invoice_date).toLocaleDateString("ar-EG")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!visit.consultation && visit.drugs.length === 0 && visit.serviceOrders.length === 0 && visit.invoices.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">لا توجد بيانات تفصيلية لهذه الزيارة</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface PatientFilePanelProps {
  patientId: string;
  showPrint?: boolean;
}

export function PatientFilePanel({ patientId, showPrint = true }: PatientFilePanelProps) {
  const { data: journey, isLoading, isError } = useQuery<PatientJourney>({
    queryKey: ["/api/patients", patientId, "journey"],
    queryFn: () =>
      apiRequest("GET", `/api/patients/${patientId}/journey`).then((r) => r.json()),
    enabled: !!patientId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !journey) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <XCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm text-muted-foreground">لم يتم العثور على بيانات المريض</p>
      </div>
    );
  }

  const { patient, visits } = journey;

  return (
    <div className="space-y-4" dir="rtl">
      {/* بطاقة معلومات المريض */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex items-center gap-2 bg-blue-100 border border-blue-300 rounded-full px-3 py-1">
              <User className="h-3.5 w-3.5 text-blue-600" />
              {patient.patientCode && (
                <span className="font-mono font-bold text-blue-800 text-xs" data-testid="text-patient-code">
                  {patient.patientCode}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold" data-testid="text-patient-name">{patient.fullName}</h2>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {patient.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{patient.phone}</span>
                )}
                {patient.nationalId && (
                  <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />{patient.nationalId}</span>
                )}
                {patient.age && (
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{patient.age} سنة</span>
                )}
              </div>
            </div>
            <div className="text-left shrink-0">
              <div className="text-xl font-bold text-blue-700">{visits.length}</div>
              <div className="text-xs text-muted-foreground">زيارة</div>
            </div>
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
        </CardContent>
      </Card>

      {/* الجدول الزمني */}
      {visits.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <Stethoscope className="h-7 w-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد زيارات مسجلة لهذا المريض</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            سجل الزيارات — {visits.length} زيارة (الأحدث أولاً)
          </div>
          {visits.map((visit) => (
            <VisitCard key={visit.appointmentId} visit={visit} />
          ))}
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .space-y-4, .space-y-4 * { visibility: visible; }
          .space-y-4 { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
