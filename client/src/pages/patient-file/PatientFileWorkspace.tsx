import { useState, useCallback, memo } from "react";
import {
  Loader2, ArrowRight, User, FileText, BookOpen, LayoutGrid, Banknote, PieChart,
  Lock, LockOpen, PanelLeftClose, PanelLeftOpen,
  Stethoscope, Building2, CalendarDays, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { usePatientData, usePatientFinancialSummary } from "./hooks/usePatientFile";
import { useConsolidatedView } from "./hooks/useConsolidatedView";
import { usePatientInvoiceSSE } from "./hooks/usePatientInvoiceSSE";
import { OverviewTab } from "./tabs/OverviewTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { InvoicesTab } from "./tabs/InvoicesTab";
import { ConsolidatedInvoiceTab, type VisitHeaderInfo } from "./tabs/ConsolidatedInvoiceTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { StatementTab } from "./tabs/StatementTab";
import { fmtMoney, fmtDateTime } from "./shared/formatters";

type TabId = "overview" | "history" | "invoices" | "consolidated" | "payments" | "statement";

const TABS: { id: TabId; label: string; icon: React.ReactNode; badge?: (data: any) => string | null }[] = [
  { id: "overview",     label: "نظرة عامة",      icon: <User className="h-3.5 w-3.5" /> },
  { id: "history",      label: "السجل الطبي",     icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: "invoices",     label: "الفواتير الأصلية", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "consolidated", label: "الفاتورة المجمعة", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: "payments",     label: "المدفوعات",        icon: <Banknote className="h-3.5 w-3.5" /> },
  { id: "statement",    label: "كشف الحساب",       icon: <PieChart className="h-3.5 w-3.5" /> },
];

interface Props {
  patientId: string;
}

function FinRow({ label, value, highlight, muted, border }: {
  label: string; value: number; highlight?: boolean; muted?: boolean; border?: boolean;
}) {
  const cls = highlight
    ? "text-green-700 font-bold text-base"
    : muted
      ? "text-muted-foreground text-sm"
      : "font-semibold text-sm";
  const neg = value < 0;
  return (
    <div className={`flex justify-between items-center py-1.5 ${border ? "border-t border-dashed mt-1 pt-2" : ""}`}>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>{label}</span>
      <span className={`font-mono ${cls} ${neg ? "text-red-600" : ""}`}>
        {neg ? `(${fmtMoney(Math.abs(value))})` : fmtMoney(value)}
      </span>
    </div>
  );
}

const DefaultSidebar = memo(function DefaultSidebar({
  aggregated, financial, isLoading,
}: {
  aggregated: any;
  financial: any;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totals = aggregated?.totals;
  if (!totals) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        لا توجد بيانات مالية
      </div>
    );
  }

  const isFinalClosed = aggregated?.invoices?.some((inv: any) => inv.isFinalClosed);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-slate-50 border rounded-xl p-4 flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">الملخص المالي</p>
        <FinRow label="إجمالي الخدمات" value={totals.totalAmount} />
        <FinRow label="الخصم" value={totals.discountAmount} muted />
        <FinRow label="الصافي" value={totals.netAmount} highlight border />
        <div className="my-2 border-t border-slate-200" />
        <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">الدفعات</p>
        <FinRow label="المدفوع" value={totals.paidAmount} />
        <FinRow label="الباقي" value={totals.remaining} />
      </div>

      {isFinalClosed && (
        <div className="flex flex-col items-center gap-1 p-3 rounded-xl border border-green-200 bg-green-50">
          <Lock className="h-5 w-5 text-green-600" />
          <span className="text-xs font-semibold text-green-700">مغلق نهائياً</span>
        </div>
      )}

      {totals.invoiceCount > 0 && (
        <div className="bg-white border rounded-xl p-3 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">ملخص الفواتير</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">عدد الفواتير</span>
            <span className="font-mono font-semibold">{totals.invoiceCount}</span>
          </div>
          {(aggregated?.byDepartment ?? []).length > 0 && (
            <>
              <div className="border-t my-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">حسب القسم</p>
              {(aggregated.byDepartment as any[]).map((d: any, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate">{d.departmentName}</span>
                  <span className="font-mono">{fmtMoney(d.netAmount)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const PatientFileWorkspace = memo(function PatientFileWorkspace({ patientId }: Props) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const valid: TabId[] = ["overview", "history", "invoices", "consolidated", "payments", "statement"];
    return tab && valid.includes(tab as TabId) ? (tab as TabId) : "consolidated";
  });
  const [sidebarEl, setSidebarEl] = useState<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [visitHeader, setVisitHeader] = useState<VisitHeaderInfo | null>(null);

  usePatientInvoiceSSE(patientId);

  const { data: patient,   isLoading: loadingPatient   } = usePatientData(patientId);
  const { data: financial, isLoading: loadingFinancial } = usePatientFinancialSummary(patientId);
  const { data: aggregated, isLoading: loadingAggregated } = useConsolidatedView(patientId);

  const handleTabChange = useCallback((tab: TabId) => setActiveTab(tab), []);
  const handleVisitHeaderChange = useCallback((info: VisitHeaderInfo | null) => setVisitHeader(info), []);

  const patientName = patient?.fullName ?? "جار التحميل…";
  const patientCode = patient?.patientCode ?? "";
  const remaining = financial?.totalOutstanding ?? 0;
  const showVisitInfo = activeTab === "consolidated" && visitHeader;

  return (
    <div className="flex h-screen overflow-hidden bg-background" dir="rtl">
      <div className={`flex flex-col min-w-0 transition-all duration-200 ${sidebarOpen ? "flex-1" : "w-full"}`}>
        <div className="border-b bg-background/95 backdrop-blur shrink-0 z-10 print:hidden">
          <div className="flex items-center gap-3 px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8 shrink-0"
              onClick={() => navigate("/patients")}
              data-testid="btn-back-patients"
            >
              <ArrowRight className="h-4 w-4" />
              المرضى
            </Button>

            <div className="h-6 w-px bg-border shrink-0" />

            <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
              {loadingPatient ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex flex-col gap-0 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate" data-testid="text-patient-name">{patientName}</span>
                      {patient?.patientCode && (
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0 py-0">{patient.patientCode}</Badge>
                      )}
                    </div>
                    {showVisitInfo && visitHeader.doctorName && (
                      <div className="flex items-center gap-1.5" data-testid="text-doctor-name">
                        <Stethoscope className="h-3 w-3 text-teal-600 shrink-0" />
                        <span className="text-xs font-semibold text-teal-700">{visitHeader.doctorName}</span>
                      </div>
                    )}
                  </div>

                  {showVisitInfo ? (
                    <>
                      <div className="h-6 w-px bg-border shrink-0" />
                      <div className="flex flex-col gap-0">
                        {visitHeader.invoiceNumber && (
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs font-semibold">{visitHeader.invoiceNumber}</span>
                          </div>
                        )}
                        {visitHeader.visitNumber && (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${visitHeader.visitType === "inpatient" ? "border-indigo-400 text-indigo-700 bg-indigo-50" : "border-teal-400 text-teal-700 bg-teal-50"}`}>
                              {visitHeader.visitType === "inpatient" ? "داخلي" : "خارجي"}
                            </Badge>
                            <span className="font-mono text-[10px]">{visitHeader.visitNumber}</span>
                            {visitHeader.departmentName && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Building2 className="h-2.5 w-2.5" /> {visitHeader.departmentName}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {visitHeader.admissionDate && (
                        <>
                          <div className="h-6 w-px bg-border shrink-0" />
                          <div className="flex flex-col gap-0">
                            <div className="flex items-center gap-1" data-testid="text-admission-datetime">
                              <CalendarDays className="h-3 w-3 text-green-500 shrink-0" />
                              <span className="text-[11px]">
                                دخول: <span className="font-medium">{fmtDateTime(visitHeader.admissionCreatedAt || visitHeader.admissionDate)}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1" data-testid="text-discharge-datetime">
                              <Clock className="h-3 w-3 shrink-0" style={{ color: visitHeader.dischargeDate ? "#16a34a" : "#d97706" }} />
                              {visitHeader.dischargeDate ? (
                                <span className="text-[11px]">
                                  خروج: <span className="font-medium text-green-700">{fmtDateTime(visitHeader.admissionUpdatedAt || visitHeader.dischargeDate)}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-600 font-medium">لم يخرج بعد</span>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      <div className="mr-auto flex items-center gap-2">
                        {remaining > 0.01 && (
                          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 shrink-0 py-0">
                            متبقي: {fmtMoney(remaining)}
                          </Badge>
                        )}
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                          visitHeader.isFinalClosed
                            ? "border-green-300 bg-green-50 text-green-700"
                            : (!visitHeader.invoiceStatus || visitHeader.invoiceStatus === "draft")
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-blue-300 bg-blue-50 text-blue-700"
                        }`} data-testid="badge-invoice-status">
                          {visitHeader.isFinalClosed ? <Lock className="h-3 w-3" /> : (!visitHeader.invoiceStatus || visitHeader.invoiceStatus === "draft") ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                          {visitHeader.isFinalClosed ? "مغلق نهائياً" : (!visitHeader.invoiceStatus || visitHeader.invoiceStatus === "draft") ? "مسودة" : visitHeader.invoiceStatus === "finalized" ? "معتمد" : "جارٍ..."}
                        </div>
                      </div>
                    </>
                  ) : (
                    remaining > 0.01 && (
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 shrink-0">
                        متبقي: {fmtMoney(remaining)}
                      </Badge>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex gap-0 border-t overflow-x-auto px-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={[
                  "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0",
                  activeTab === tab.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                ].join(" ")}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "consolidated" && (
          <div className="flex-1 overflow-hidden p-3">
            <ConsolidatedInvoiceTab
              data={aggregated}
              isLoading={loadingAggregated}
              patientId={patientId}
              patientName={patientName}
              patientCode={patientCode}
              sidebarContainer={sidebarOpen ? sidebarEl : null}
              onVisitHeaderChange={handleVisitHeaderChange}
            />
          </div>
        )}

        {activeTab !== "consolidated" && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 max-w-6xl mx-auto w-full">
              {activeTab === "overview" && (
                <OverviewTab
                  patient={patient}
                  financial={financial}
                  isLoading={loadingPatient || loadingFinancial}
                  aggregated={aggregated}
                />
              )}

              {activeTab === "history" && (
                <HistoryTab patientId={patientId} />
              )}

              {activeTab === "invoices" && (
                <InvoicesTab
                  invoices={aggregated?.invoices ?? []}
                  isLoading={loadingAggregated}
                />
              )}

              {activeTab === "payments" && (
                <PaymentsTab patientId={patientId} active={activeTab === "payments"} />
              )}

              {activeTab === "statement" && (
                <StatementTab
                  aggregated={aggregated}
                  financial={financial}
                  isLoading={loadingAggregated || loadingFinancial}
                  patientName={patientName}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`hidden xl:flex flex-col border-r shrink-0 bg-muted/30 transition-all duration-200 ${sidebarOpen ? "w-1/3 max-w-[400px]" : "w-10"}`}>
        <div className="shrink-0 flex items-center px-2 py-2 border-b bg-background/80">
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            className="p-1.5 rounded-md border bg-background hover:bg-muted transition-colors"
            title={sidebarOpen ? "إخفاء اللوحة الجانبية" : "إظهار اللوحة الجانبية"}
            data-testid="btn-toggle-workspace-sidebar"
          >
            {sidebarOpen
              ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
              : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
          </button>
          {sidebarOpen && (
            <span className="text-xs font-semibold text-muted-foreground mr-2">اللوحة المالية</span>
          )}
        </div>

        {sidebarOpen && (
          <div
            ref={setSidebarEl}
            className="flex-1 overflow-y-auto p-3 flex flex-col"
            data-testid="workspace-sidebar"
          >
            {activeTab !== "consolidated" && (
              <DefaultSidebar
                aggregated={aggregated}
                financial={financial}
                isLoading={loadingAggregated}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});
