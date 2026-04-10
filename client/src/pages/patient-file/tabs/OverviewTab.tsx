import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Phone, CreditCard, Calendar, Bed, Activity, Building2, Receipt, FileCheck } from "lucide-react";
import { fmtDate, fmtMoney, STATUS_LABELS } from "../shared/formatters";
import type { FinancialSummary, AggregatedViewData } from "../shared/types";

interface PatientRecord {
  id: string;
  patientCode?: string;
  fullName: string;
  phone?: string;
  nationalId?: string;
  age?: number;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  isActive: boolean;
  createdAt?: string;
}

interface Props {
  patient: PatientRecord | undefined;
  financial: FinancialSummary | undefined;
  isLoading: boolean;
  aggregated?: AggregatedViewData;
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground text-xs">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FinancialCard({ label, amount, colorClass, sub }: { label: string; amount: number; colorClass: string; sub?: string }) {
  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-1 ${colorClass}`}>
      <span className="text-xs opacity-80">{label}</span>
      <span className="text-lg font-bold">{fmtMoney(amount)}</span>
      {sub && <span className="text-xs opacity-70">{sub}</span>}
    </div>
  );
}

export const OverviewTab = memo(function OverviewTab({ patient, financial, isLoading, aggregated }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 rounded-full p-3 shrink-0">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{patient.fullName}</h2>
                <Badge variant="outline" className="text-xs font-mono">{patient.patientCode ?? "—"}</Badge>
                {!patient.isActive && (
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">غير نشط</Badge>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <InfoItem icon={<Phone className="h-3.5 w-3.5" />} label="الهاتف" value={patient.phone} />
                <InfoItem icon={<CreditCard className="h-3.5 w-3.5" />} label="الرقم الوطني" value={patient.nationalId} />
                <InfoItem icon={<Calendar className="h-3.5 w-3.5" />} label="تاريخ الميلاد" value={fmtDate(patient.dateOfBirth)} />
                {patient.age && (
                  <InfoItem icon={<Activity className="h-3.5 w-3.5" />} label="العمر" value={`${patient.age} سنة`} />
                )}
                <InfoItem icon={<Calendar className="h-3.5 w-3.5" />} label="تاريخ التسجيل" value={fmtDate(patient.createdAt)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {financial && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">الملخص المالي</h3>
              <span className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-2 py-0.5">فواتير مكتملة فقط</span>
              {financial.lastInteraction && (
                <span className="text-xs text-muted-foreground mr-auto">آخر تعامل: {fmtDate(financial.lastInteraction)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <FinancialCard label="إجمالي الفواتير المكتملة" amount={financial.totalAmount} colorClass="bg-blue-50 border-blue-100 text-blue-900" sub={`${financial.invoiceCount} فاتورة`} />
              <FinancialCard label="إجمالي المدفوع" amount={financial.totalPaid} colorClass="bg-green-50 border-green-100 text-green-900" />
              <FinancialCard label="المتبقي" amount={financial.totalOutstanding} colorClass={financial.totalOutstanding > 0 ? "bg-red-50 border-red-100 text-red-900" : "bg-gray-50 border-gray-100 text-gray-700"} sub={financial.totalOutstanding <= 0 ? "مسدد بالكامل" : undefined} />
              <FinancialCard label="فواتير طبية" amount={financial.breakdown.medical.totalAmount} colorClass="bg-purple-50 border-purple-100 text-purple-900" sub={`${financial.breakdown.medical.invoiceCount} فاتورة`} />
              <FinancialCard label="مبيعات صيدلية" amount={financial.breakdown.pharmacy.totalAmount} colorClass="bg-amber-50 border-amber-100 text-amber-900" sub={`${financial.breakdown.pharmacy.invoiceCount} فاتورة`} />
            </div>

            {financial.admissionCount > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm border-t pt-3">
                <Bed className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">عدد الإقامات:</span>
                <span className="font-semibold">{financial.admissionCount}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aggregated?.invoices?.some(inv => inv.diagnosis) && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">التشخيص والتقرير الطبي</h3>
            </div>
            <div className="flex flex-col gap-3">
              {aggregated.invoices
                .filter(inv => inv.diagnosis)
                .map(inv => (
                  <div key={inv.id} className="bg-slate-50 border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                        PI-{inv.invoiceNumber}
                      </Badge>
                      {inv.invoiceDate && (
                        <span className="text-[10px] text-muted-foreground">{fmtDate(inv.invoiceDate)}</span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{inv.diagnosis}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
