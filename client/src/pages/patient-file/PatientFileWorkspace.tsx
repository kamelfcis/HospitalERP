import { useState, useCallback, memo } from "react";
import { Loader2, ArrowRight, User, FileText, BookOpen, LayoutGrid, Banknote, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { usePatientData, usePatientFinancialSummary } from "./hooks/usePatientFile";
import { useConsolidatedView } from "./hooks/useConsolidatedView";
import { OverviewTab } from "./tabs/OverviewTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { InvoicesTab } from "./tabs/InvoicesTab";
import { ConsolidatedInvoiceTab } from "./tabs/ConsolidatedInvoiceTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { StatementTab } from "./tabs/StatementTab";

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

export const PatientFileWorkspace = memo(function PatientFileWorkspace({ patientId }: Props) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: patient,   isLoading: loadingPatient   } = usePatientData(patientId);
  const { data: financial, isLoading: loadingFinancial } = usePatientFinancialSummary(patientId);
  const { data: aggregated, isLoading: loadingAggregated } = useConsolidatedView(patientId);

  const handleTabChange = useCallback((tab: TabId) => setActiveTab(tab), []);

  const patientName = patient?.fullName ?? "جار التحميل…";
  const patientCode = patient?.patientCode ?? "";
  const remaining = financial?.totalOutstanding ?? 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background" dir="rtl">
      <div className="border-b bg-background/95 backdrop-blur shrink-0 z-10 print:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
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

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {loadingPatient ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <span className="font-semibold text-base truncate">{patientName}</span>
                {patient?.patientCode && (
                  <Badge variant="outline" className="text-xs font-mono shrink-0">{patient.patientCode}</Badge>
                )}
                {remaining > 0.01 && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 shrink-0">
                    متبقي: {remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                  </Badge>
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

      {/* Consolidated tab: full-width, full-height, no outer scroll */}
      {activeTab === "consolidated" && (
        <div className="flex-1 overflow-hidden p-3">
          <ConsolidatedInvoiceTab
            data={aggregated}
            isLoading={loadingAggregated}
            patientId={patientId}
            patientName={patientName}
            patientCode={patientCode}
          />
        </div>
      )}

      {/* All other tabs: centered max-width, page-level scroll */}
      {activeTab !== "consolidated" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 max-w-6xl mx-auto w-full">
            {activeTab === "overview" && (
              <OverviewTab
                patient={patient}
                financial={financial}
                isLoading={loadingPatient || loadingFinancial}
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
  );
});
